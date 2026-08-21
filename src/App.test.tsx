// SPEC: shell-chrome (HDR-01, HDR-08, EMPTY-01..EMPTY-09), release-distribution (REL-52), multi-terminal (TERM-12, TERM-13), terminal-tabs (TAB-06), terminal-layout-options (LAYOUT-15, LAYOUT-16, LAYOUT-17, LAYOUT-19, LAYOUT-20, LAYOUT-21, LAYOUT-22, LAYOUT-23, LAYOUT-24, LAYOUT-25, LAYOUT-26, LAYOUT-29), terminal-screenshot (SHOT-01, SHOT-13, SHOT-14, SHOT-16, SHOT-23), minimized-tray (MIN-01, MIN-04, MIN-05, MIN-06), projects (PROJ-11, PROJ-12)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'

// Mesmo padrão `vi.hoisted` de `PaneWizard.test.tsx` — the `vi.mock`
// factories below are hoisted above these imports by Vitest's transform.
const { invokeMock, openMock, listenMock, snapshotBlobMock, saveMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  listenMock: vi.fn(),
  snapshotBlobMock: vi.fn(),
  saveMock: vi.fn(),
}))

// SHOT-13: a pintura do buffer depende de xterm montado de verdade, o que
// jsdom não faz; aqui o que importa é o fio entre o clique e o modal.
vi.mock('./lib/terminalSnapshot', () => ({ snapshotBlob: snapshotBlobMock }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {},
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
  save: saveMock,
}))

// SET-01: `App` now mounts `SettingsShell` inline (the settings overlay), so
// the two Tauri modules that shell imports have to be stubbed here too.
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: vi.fn() }),
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => Promise.resolve('0.0.0-test'),
}))

/** Mesmo padrão de `useTaskStore.test.ts` — acha o handler registrado via
 * `listen('update://available', ...)` para disparar o evento manualmente. */
function getUpdateAvailableHandler() {
  const call = listenMock.mock.calls.find(([name]) => name === 'update://available')
  if (!call) throw new Error('listen("update://available", ...) não foi chamado')
  return call[1] as (event: { payload: { version: string } }) => void
}

/** Mesmo padrão de `getUpdateAvailableHandler`, para `quota://prefs-changed` (QUOTA-11). */
function getQuotaPrefsChangedHandler() {
  const call = listenMock.mock.calls.find(([name]) => name === 'quota://prefs-changed')
  if (!call) throw new Error('listen("quota://prefs-changed", ...) não foi chamado')
  return call[1] as (event: { payload: { enabled: boolean; window: string } }) => void
}

// `TerminalPane` drives real xterm.js against a PTY backend — out of scope
// for App-level wiring tests (HDR-01/HDR-08) and not viable in jsdom; a stub
// is enough since these tests never assert on terminal content.
vi.mock('./components/terminal/TerminalPane', async () => {
  const { useEffect } = await import('react')

  return {
    // `data-cwd` é o que identifica cada painel nos testes de reordenação: o
    // número do cabeçalho é a posição, e é justamente ela que muda.
    // `data-agent` é o que prova que o agente salvo voltou junto (LAYOUT-23).
    // O `pty_spawn` no mount espelha o painel real
    // (`TerminalPane.tsx:102`): é o único caminho de sessão que existe, e é
    // o que LAYOUT-29 observa — todo terminal restaurado nasce de um spawn
    // novo, nunca de uma sessão recuperada.
    default: ({
      cwd,
      agent,
      sessionId,
      resume,
      onTerminal,
      onReady,
    }: {
      cwd: string
      agent?: string
      sessionId?: string | null
      resume?: boolean
      onTerminal?: (term: unknown) => void
      onReady?: () => void
    }) => {
      useEffect(() => {
        void invokeMock('pty_spawn', { cwd, agent, sessionId, resume })
        // SHOT-13: o painel real entrega a instância viva do xterm no mount
        // e `null` no cleanup; o dublê espelha esse contrato. O `cwd`
        // reservado abaixo simula o painel sem instância viva.
        if (cwd !== '/sem-xterm') onTerminal?.({ cwd })
        // SPEC: terminal-boot-loading (BOOT-06) — o painel real chama `onReady`
        // quando o `pty_spawn` assenta. O `cwd` reservado abaixo simula o
        // painel cujo spawn nunca resolve, que é o que prende o overlay.
        if (cwd !== '/nunca-pronto') onReady?.()
        return () => {
          onTerminal?.(null)
          // PROJ-12: o `pty_kill` do painel real mora na limpeza deste efeito
          // (`TerminalPane.tsx:185`) — o dublê o espelha para que "fechar um
          // rascunho não mata PTY nenhum" seja observável.
          void invokeMock('pty_kill', { cwd })
        }
      }, [])

      return (
        <div
          data-testid="terminal-pane-stub"
          data-cwd={cwd}
          data-agent={agent}
          data-session-id={sessionId ?? ''}
          data-resume={resume ? 'true' : 'false'}
        />
      )
    },
  }
})

/** SPEC: terminal-boot-loading (BOOT-10) — forma de `agent_catalog_all` com
 * um perfil só e nenhum agente. É o mínimo que fecha a porta da varredura no
 * boot; os blocos que precisam de agente de verdade montam a sua. */
const EMPTY_CATALOG = {
  defaultProfileId: 'host',
  profiles: [{ profileId: 'host', label: 'Windows (padrão)', wsl1: false, agents: [] }],
}

/** SPEC: terminal-boot-loading (BOOT-10) — envelope de perfil único em volta
 * de um catálogo de agentes, para os blocos que já tinham o vetor pronto. */
function hostCatalog(agents: unknown[]) {
  return {
    defaultProfileId: 'host',
    profiles: [{ profileId: 'host', label: 'Windows (padrão)', wsl1: false, agents }],
  }
}

/** SPEC: projects (PROJ-11) — respostas de que o `PaneWizard` do painel de
 * rascunho depende. Os testes que trocam o `invokeMock` inteiro delegam para
 * cá no fallback, senão `project_list` volta `undefined` e o wizard quebra. */
function projectInvoke(command: string, args?: Record<string, unknown>) {
  if (command === 'project_list') return Promise.resolve([])
  // AD-032: o `SettingsShell`, que o `App` monta como overlay, usa
  // `agent_catalog` (o perfil padrão) e não `agent_catalog_all`. Mora aqui, no
  // fallback compartilhado, porque nenhum bloco deste arquivo testa o catálogo
  // de Configurações — todos só precisam que ele não devolva `undefined`.
  if (command === 'agent_catalog') return Promise.resolve([])
  if (command === 'project_sandbox_dir') return Promise.resolve('/home/user/.swarmdeck/sandbox')
  if (command === 'project_create') {
    return Promise.resolve({
      id: `proj-${String(args?.path ?? '')}`,
      name: String(args?.name ?? ''),
      path: String(args?.path ?? ''),
      color: '#f5b700',
      last_used: null,
    })
  }
  return Promise.resolve(undefined)
}

beforeEach(() => {
  invokeMock.mockReset()
  openMock.mockReset()
  listenMock.mockReset()
  listenMock.mockResolvedValue(() => {})
  snapshotBlobMock.mockReset()
  snapshotBlobMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  saveMock.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  // `TerminalHeader.handleClose` confirms before closing a terminal with an
  // active process (App always passes `hasActiveProcess`) - jsdom has no
  // native `window.confirm`.
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === 'agent_catalog_all') return Promise.resolve(EMPTY_CATALOG)
    if (command === 'agent_default') return Promise.resolve(null)
    if (command === 'terminal_picker_last_dir') return Promise.resolve(null)
    // SET-01: `project_list` também é consumido pelo `SettingsShell` inline.
    if (command === 'quota_prefs_get') return Promise.resolve({ enabled: false, window: 'both' })
    if (command === 'terminal_workspace_get') return Promise.resolve([])
    if (command === 'terminal_workspace_set') return Promise.resolve(undefined)
    if (command === 'quota_claude') {
      return Promise.resolve({
        state: 'disabled',
        windows: [],
        planLabel: null,
        fetchedAt: null,
        retryAt: null,
      })
    }
    return projectInvoke(command, args)
  })
})

/** SPEC: projects (PROJ-11) — leva o painel de rascunho até virar terminal
 * vivo: importa a pasta na etapa PROJECT e confirma na etapa AGENT. O gatilho
 * que criou o rascunho já foi acionado por quem chama. */
async function createTerminalViaWizard(dir = '/home/user/projeto') {
  openMock.mockResolvedValueOnce(dir)
  fireEvent.click(await screen.findByRole('button', { name: 'Import Project' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Nova sessão' }))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Nova sessão' })).not.toBeInTheDocument(),
  )
}

/** O wizard está na tela (etapa PROJECT) — o marcador é a busca de projetos. */
const wizardOnScreen = () => screen.queryAllByLabelText('Buscar projetos')

describe('App - shell-chrome wiring', () => {
  it('mounts Header in place of the old .app-toolbar (HDR-01)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    expect(screen.getByLabelText('new terminal')).toBeInTheDocument()
    expect(screen.getByLabelText('settings')).toBeInTheDocument()
    expect(container.querySelector('.app-toolbar')).not.toBeInTheDocument()
  })

  it('Header\'s "new terminal" icon opens the pane wizard, same as the old button (HDR-08, PROJ-11)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('new terminal'))

    await waitFor(() => expect(wizardOnScreen()).toHaveLength(1))
    // PROJ-11: o gatilho não arranca sessão nenhuma — o PTY só nasce na
    // confirmação do wizard.
    expect(invokeMock).not.toHaveBeenCalledWith('pty_spawn', expect.anything())
  })

  it('Header\'s "settings" icon opens Settings as an overlay over the main window (HDR-08, SET-01)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    expect(screen.queryByRole('dialog', { name: 'Configurações' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('settings'))

    expect(screen.getByRole('dialog', { name: 'Configurações' })).toBeInTheDocument()
    // The overlay replaces the old separate window - no OS window is opened.
    expect(invokeMock).not.toHaveBeenCalledWith('settings_open')
  })

  it('the Settings overlay closes on "Fechar", on Esc and on a backdrop click (SET-04, SET-05)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    const openSettings = () => fireEvent.click(screen.getByLabelText('settings'))
    const overlay = () => screen.queryByRole('dialog', { name: 'Configurações' })

    openSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(overlay()).not.toBeInTheDocument()

    openSettings()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(overlay()).not.toBeInTheDocument()

    openSettings()
    const backdrop = document.querySelector('.app-settings-backdrop')
    if (!backdrop) throw new Error('backdrop do overlay de Configurações não encontrado')
    fireEvent.mouseDown(backdrop)
    expect(overlay()).not.toBeInTheDocument()
  })
})

describe('App - release-distribution update badge (REL-52)', () => {
  it('receiving update://available shows the badge on the settings icon, and it stays visible for the rest of the session', async () => {
    render(<App />)
    await waitFor(() => expect(listenMock).toHaveBeenCalledWith('update://available', expect.any(Function)))

    expect(screen.queryByLabelText('update available')).not.toBeInTheDocument()

    const handler = getUpdateAvailableHandler()
    act(() => {
      handler({ payload: { version: '1.2.3' } })
    })

    expect(screen.getByLabelText('update available')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('settings'))
    expect(screen.getByLabelText('update available')).toBeInTheDocument()
  })

  it('repeated update://available events do not flicker or duplicate the badge (Edge Case)', async () => {
    render(<App />)
    await waitFor(() => expect(listenMock).toHaveBeenCalledWith('update://available', expect.any(Function)))

    const handler = getUpdateAvailableHandler()
    act(() => {
      handler({ payload: { version: '1.2.3' } })
      handler({ payload: { version: '1.2.4' } })
    })

    expect(screen.getAllByLabelText('update available')).toHaveLength(1)
  })

  it('with no event received, Header keeps hasUpdateAvailable=false', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    expect(screen.queryByLabelText('update available')).not.toBeInTheDocument()
  })
})

describe('App - shell-chrome empty state', () => {
  it('boots with zero terminals and shows EmptyState instead of GridLayout (EMPTY-01, EMPTY-02, EMPTY-03)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
    expect(screen.queryByLabelText('fechar terminal')).not.toBeInTheDocument()
  })

  it('creating a terminal swaps EmptyState for GridLayout, and closing the last terminal swaps back (EMPTY-01, EMPTY-02, EMPTY-04)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await createTerminalViaWizard()

    expect(screen.queryByText('No Terminals Active')).not.toBeInTheDocument()
    expect(screen.getByLabelText('fechar terminal')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('fechar terminal'))

    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
  })

  it('"+ Create Terminal" opens the pane wizard (EMPTY-06, PROJ-11)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))

    await waitFor(() => expect(wizardOnScreen()).toHaveLength(1))
  })

  it('Ctrl+T opens the pane wizard while empty, and prevents the default (EMPTY-07, PROJ-11)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    const notPrevented = fireEvent.keyDown(window, { key: 't', ctrlKey: true })

    expect(notPrevented).toBe(false)
    await waitFor(() => expect(wizardOnScreen()).toHaveLength(1))
  })

  it('Ctrl+T with a draft pane already open does not open a second wizard (EMPTY-08, PROJ-11)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(wizardOnScreen()).toHaveLength(1))

    fireEvent.keyDown(window, { key: 't', ctrlKey: true })

    expect(wizardOnScreen()).toHaveLength(1)
  })

  it('T without Ctrl does not open the wizard (Edge Case)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.keyDown(window, { key: 't', ctrlKey: false })

    expect(wizardOnScreen()).toHaveLength(0)
  })

  it('Ctrl+T has no effect once a terminal is open (EMPTY-09)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await createTerminalViaWizard()

    fireEvent.keyDown(window, { key: 't', ctrlKey: true })

    expect(wizardOnScreen()).toHaveLength(0)
  })
})

describe('App - terminal-chrome (CHROME-03)', () => {
  it('maximizar tira o painel do grid e o põe sobre o header e a barra de abas', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await createTerminalViaWizard()

    const pane = container.querySelector<HTMLElement>('.app-pane')
    expect(pane?.style.position).toBe('')

    fireEvent.click(screen.getByLabelText('maximizar terminal'))

    const maximized = container.querySelector<HTMLElement>('.app-pane')
    expect(maximized?.style.position).toBe('fixed')
    expect(maximized?.style.inset).toBe('0')
    // Header e barra de abas não declaram z-index, então qualquer valor
    // positivo já os cobre; abaixo de 1000 mantém o diálogo por cima.
    expect(Number(maximized?.style.zIndex)).toBeGreaterThan(0)
    expect(Number(maximized?.style.zIndex)).toBeLessThan(1000)
  })
})

describe('App - terminal-tabs (TAB-01..TAB-05)', () => {
  it('"nova aba" cria uma aba vazia e a torna ativa; a aba anterior guarda seus terminais (TAB-01, TAB-03)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await createTerminalViaWizard()
    const paneOfTab1 = screen.getByTestId('terminal-pane-stub')

    fireEvent.click(screen.getByLabelText('nova aba'))

    // A aba 2 (vazia) é a visível; a aba 1 continua montada — MESMO nó de
    // painel, nunca desmontado — só fora de vista. É isso que preserva o PTY.
    expect(screen.getByText('No Terminals Active')).toBeVisible()
    expect(screen.getByTestId('terminal-pane-stub')).toBe(paneOfTab1)
    expect(paneOfTab1).not.toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: /Aba 1/ }))
    expect(screen.getByText('No Terminals Active')).not.toBeVisible()
    expect(screen.getByTestId('terminal-pane-stub')).toBeVisible()
  })

  it('fechar a aba ativa ativa a vizinha e desmonta os painéis dela (TAB-02, TAB-04)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('nova aba'))
    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await createTerminalViaWizard()
    expect(screen.getByTestId('terminal-pane-stub')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('fechar Aba 2'))

    expect(screen.queryByTestId('terminal-pane-stub')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Aba 1/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('a última aba não pode ser fechada (TAB-04)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    expect(screen.queryByLabelText('fechar Aba 1')).not.toBeInTheDocument()
  })

  it('o teto de 4 terminais vale por aba: a aba nova nasce com "new terminal" liberado (TAB-05)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByLabelText('new terminal'))
      await createTerminalViaWizard()
    }
    expect(screen.getByLabelText('new terminal')).toBeDisabled()

    fireEvent.click(screen.getByLabelText('nova aba'))

    expect(screen.getByLabelText('new terminal')).toBeEnabled()
  })

  it('clonar abre outro terminal na mesma aba e desabilita ao chegar em 4', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('new terminal'))
    await createTerminalViaWizard()
    expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(1)

    // 1 -> 2 -> 3 -> 4: sempre clonando o primeiro terminal da aba.
    for (const expected of [2, 3, 4]) {
      fireEvent.click(screen.getAllByLabelText('clonar terminal')[0]!)
      await waitFor(() =>
        expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(expected),
      )
    }

    for (const button of screen.getAllByLabelText('clonar terminal')) {
      expect(button).toBeDisabled()
    }
  })

  it('reiniciar remonta o painel sem mudar a contagem de terminais da aba', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('new terminal'))
    await createTerminalViaWizard()

    const before = screen.getByTestId('terminal-pane-stub')
    fireEvent.click(screen.getByLabelText('reiniciar terminal'))

    // Mesmo painel na tela, outro nó: o remount é o que mata o PTY antigo e
    // abre uma sessão nova com o mesmo projeto e provedor.
    const after = screen.getByTestId('terminal-pane-stub')
    expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(1)
    expect(after).not.toBe(before)
  })

  // TAB-06: clicar na aba ativa entra em renomeação inline.
  it('clicar na aba ativa abre o campo de renomear; confirmar troca o nome', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByRole('tab', { name: /Aba 1/ }))

    const input = screen.getByLabelText('renomear aba')
    expect(input).toHaveValue('Aba 1')

    fireEvent.change(input, { target: { value: 'Deploy' } })
    fireEvent.click(screen.getByLabelText('confirmar renomear aba'))

    expect(screen.getByRole('tab', { name: /Deploy/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('renomear aba')).not.toBeInTheDocument()
  })

  it('clicar numa aba inativa troca de aba em vez de renomear', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('nova aba'))
    fireEvent.click(screen.getByRole('tab', { name: /Aba 1/ }))

    expect(screen.queryByLabelText('renomear aba')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Aba 1/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('cancelar a renomeação da aba mantém o nome antigo', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByRole('tab', { name: /Aba 1/ }))
    fireEvent.change(screen.getByLabelText('renomear aba'), { target: { value: 'Lixo' } })
    fireEvent.click(screen.getByLabelText('cancelar renomear aba'))

    expect(screen.getByRole('tab', { name: /Aba 1/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Lixo/ })).not.toBeInTheDocument()
  })
})

describe('App - terminal-layout-options (LAYOUT-15..LAYOUT-20)', () => {
  /** Cria um terminal com um `cwd` próprio, para poder identificá-lo depois. */
  async function createTerminalIn(dir: string) {
    fireEvent.click(screen.getByLabelText('new terminal'))
    await createTerminalViaWizard(dir)
  }

  /** Ordem dos painéis na tela, pelo `cwd` de cada um. */
  function paneOrder(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('[data-testid="terminal-pane-stub"]')].map(
      (node) => node.dataset.cwd,
    )
  }

  /** `DataTransfer` de mentira: jsdom não implementa o de verdade. */
  function fakeDataTransfer() {
    const store: Record<string, string> = {}
    return {
      effectAllowed: '',
      dropEffect: '',
      setData: (key: string, value: string) => {
        store[key] = value
      },
      getData: (key: string) => store[key] ?? '',
    }
  }

  function grips(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('.terminal-header__grip-handle')]
  }

  function panesOf(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('.app-pane')]
  }

  it('trocar o modo pelo popover altera só a aba ativa (LAYOUT-15)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    await createTerminalIn('/b')

    fireEvent.click(screen.getByLabelText('nova aba'))
    await createTerminalIn('/c')
    await createTerminalIn('/d')

    // A aba 2 (ativa) vai para vertical; a aba 1 continua horizontal.
    fireEvent.click(screen.getByLabelText('layout options'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Vertical/ }))

    const grids = container.querySelectorAll<HTMLElement>('.grid-layout')
    expect(grids[0]!.style.gridTemplateColumns).toBe('repeat(2, 1fr)')
    expect(grids[1]!.style.gridTemplateColumns).toBe('repeat(1, 1fr)')
    expect(grids[1]!.style.gridTemplateRows).toBe('repeat(2, 1fr)')
  })

  it('soltar um terminal sobre outro reordena os painéis e o grid segue a nova ordem (LAYOUT-16, LAYOUT-20)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    await createTerminalIn('/b')
    await createTerminalIn('/c')
    expect(paneOrder(container)).toEqual(['/a', '/b', '/c'])

    const dataTransfer = fakeDataTransfer()
    fireEvent.dragStart(grips(container)[2]!, { dataTransfer })
    fireEvent.drop(panesOf(container)[0]!, { dataTransfer })

    expect(paneOrder(container)).toEqual(['/c', '/a', '/b'])
    // LAYOUT-20: o plano do modo é reaplicado à nova ordem — com 3 terminais
    // e a variante `first`, quem ocupa a linha inteira é o novo primeiro.
    expect(
      [...container.querySelectorAll<HTMLElement>('.grid-layout__cell')].map(
        (cell) => cell.style.gridColumn,
      ),
    ).toEqual(['span 2', 'span 1', 'span 1'])
  })

  it('soltar o terminal sobre o próprio painel não muda a ordem (LAYOUT-19)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    await createTerminalIn('/b')

    const dataTransfer = fakeDataTransfer()
    fireEvent.dragStart(grips(container)[1]!, { dataTransfer })
    fireEvent.drop(panesOf(container)[1]!, { dataTransfer })

    expect(paneOrder(container)).toEqual(['/a', '/b'])
  })

  it('nenhum TerminalPane é desmontado na reordenação (LAYOUT-18)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    await createTerminalIn('/b')

    const nodesBefore = new Map(
      [...container.querySelectorAll<HTMLElement>('[data-testid="terminal-pane-stub"]')].map(
        (node) => [node.dataset.cwd, node],
      ),
    )

    const dataTransfer = fakeDataTransfer()
    fireEvent.dragStart(grips(container)[1]!, { dataTransfer })
    fireEvent.drop(panesOf(container)[0]!, { dataTransfer })

    expect(paneOrder(container)).toEqual(['/b', '/a'])
    // Mesmos nós, só reordenados: é isso que preserva PTY e scrollback.
    for (const node of container.querySelectorAll<HTMLElement>(
      '[data-testid="terminal-pane-stub"]',
    )) {
      expect(node).toBe(nodesBefore.get(node.dataset.cwd))
    }
  })

  it('arrastar sobre um painel o destaca como alvo e sair limpa o destaque (LAYOUT-17)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    await createTerminalIn('/b')

    const alvo = panesOf(container)[1]!
    expect(alvo).not.toHaveAttribute('data-drop-target')

    fireEvent.dragOver(alvo)
    expect(alvo).toHaveAttribute('data-drop-target', 'true')
    expect(panesOf(container)[0]!).not.toHaveAttribute('data-drop-target')

    fireEvent.dragLeave(alvo)
    expect(alvo).not.toHaveAttribute('data-drop-target')
  })
})

describe('App - terminal-layout-options: restaurar o workspace no boot (LAYOUT-23, LAYOUT-24, LAYOUT-25, LAYOUT-26, LAYOUT-29)', () => {
  /** Workspace salvo de exemplo. Os terminais da primeira aba vêm fora da
   * ordem de `slot` de propósito: quem manda na ordem é o `slot`, não a
   * ordem do vetor. */
  const SAVED = [
    {
      id: 'tab-a',
      slot: 0,
      name: 'Deploy',
      layoutMode: 'vertical',
      layoutSpan: 'first',
      terminals: [
        { id: 't-1', slot: 1, fracW: 0.5, fracH: 1, cwd: '/b', minimized: false, agentId: null },
        {
          id: 't-0',
          slot: 0,
          fracW: 0.5,
          fracH: 1,
          cwd: '/a',
          minimized: false,
          agentId: 'claude-code',
        },
      ],
    },
    {
      id: 'tab-b',
      slot: 1,
      name: 'Docs',
      layoutMode: 'horizontal',
      layoutSpan: 'last',
      terminals: [
        { id: 't-2', slot: 0, fracW: 0.33, fracH: 1, cwd: '/c', minimized: false, agentId: null },
        { id: 't-3', slot: 1, fracW: 0.33, fracH: 1, cwd: '/d', minimized: false, agentId: null },
        { id: 't-4', slot: 2, fracW: 0.33, fracH: 1, cwd: '/e', minimized: false, agentId: null },
      ],
    },
  ]

  function mockWorkspace(result: unknown) {
    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'agent_catalog_all') return Promise.resolve(EMPTY_CATALOG)
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: false, window: 'both' })
      if (command === 'terminal_workspace_get') {
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
      }
      return projectInvoke(command, args)
    })
  }

  /** SPEC: session-restore (SESS-01) — desde esta feature o boot com terminal
   * salvo passa pelo modal de restauração. Confirmar tudo é o que reproduz o
   * comportamento que LAYOUT-23 descrevia sozinho antes. */
  async function confirmRestore() {
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar selecionados' }))
    await act(async () => {})
  }

  function panelsOf(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('.app-tab-panel')]
  }

  function paneCwdsIn(panel: HTMLElement) {
    return [...panel.querySelectorAll<HTMLElement>('[data-testid="terminal-pane-stub"]')].map(
      (node) => node.dataset.cwd,
    )
  }

  it('workspace salvo com 2 abas restaura as duas, com nome, terminais na ordem do slot, cwd e agente (LAYOUT-23)', async () => {
    mockWorkspace(SAVED)

    const { container } = render(<App />)
    await confirmRestore()
    await waitFor(() => expect(screen.getByRole('tab', { name: /Deploy/ })).toBeInTheDocument())

    expect(screen.getByRole('tab', { name: /Docs/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Aba 1/ })).not.toBeInTheDocument()

    const [abaDeploy, abaDocs] = panelsOf(container)
    expect(paneCwdsIn(abaDeploy!)).toEqual(['/a', '/b'])
    expect(paneCwdsIn(abaDocs!)).toEqual(['/c', '/d', '/e'])

    // O agente salvo volta junto: é ele que `TerminalPane` passa a `pty_spawn`.
    const primeiro = abaDeploy!.querySelector<HTMLElement>('[data-testid="terminal-pane-stub"]')
    expect(primeiro!.dataset.agent).toBe('claude-code')
  })

  it('o modo de layout e a variante de largura de cada aba voltam como foram salvos (LAYOUT-23)', async () => {
    mockWorkspace(SAVED)

    const { container } = render(<App />)
    await confirmRestore()
    await waitFor(() => expect(screen.getByRole('tab', { name: /Deploy/ })).toBeInTheDocument())

    const grids = container.querySelectorAll<HTMLElement>('.grid-layout')
    // Aba 1: vertical com 2 terminais -> 1 coluna, 2 linhas.
    expect(grids[0]!.style.gridTemplateColumns).toBe('repeat(1, 1fr)')
    expect(grids[0]!.style.gridTemplateRows).toBe('repeat(2, 1fr)')
    // Aba 2: horizontal com 3 terminais e variante `last` -> quem ocupa a
    // linha inteira é o último.
    expect(
      [...grids[1]!.querySelectorAll<HTMLElement>('.grid-layout__cell')].map(
        (cell) => cell.style.gridColumn,
      ),
    ).toEqual(['span 1', 'span 1', 'span 2'])
  })

  it('workspace vazio mantém uma aba vazia com o EmptyState (LAYOUT-24, EMPTY-03)', async () => {
    mockWorkspace([])

    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('terminal_workspace_get'))

    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })

  // LAYOUT-29, revisto por session-restore (SESS-12): a metade do **PTY**
  // continua valendo — cada terminal restaurado nasce de um `pty_spawn`
  // próprio, processo novo e scrollback zerado. O que deixou de valer é a
  // metade da conversa do agente, que agora pode voltar (SESS-13); isso é
  // coberto pelos testes de session-restore mais abaixo.
  it('cada terminal restaurado nasce de um pty_spawn próprio (LAYOUT-29)', async () => {
    mockWorkspace(SAVED)

    render(<App />)
    await confirmRestore()
    await waitFor(() => expect(screen.getByRole('tab', { name: /Deploy/ })).toBeInTheDocument())

    const spawns = invokeMock.mock.calls.filter(([command]) => command === 'pty_spawn')
    // 5 terminais salvos → 5 PTYs novos, um por painel.
    expect(spawns).toHaveLength(5)
    expect(spawns.map(([, args]) => args.cwd)).toEqual(['/a', '/b', '/c', '/d', '/e'])
    // Nada além de `cwd`, agente e a sessão do agente: nenhum scrollback,
    // nenhum handle de processo anterior — não há por onde retomar o PTY.
    for (const [, args] of spawns) {
      expect(Object.keys(args).sort()).toEqual(['agent', 'cwd', 'resume', 'sessionId'])
    }
  })

  // LAYOUT-25: o backend abre em home o terminal cujo `cwd` sumiu; a metade
  // que falta é dizer ao usuário qual diretório era.
  it('terminal restaurado com cwd que sumiu mostra o aviso nomeando o diretório (LAYOUT-25)', async () => {
    mockWorkspace([
      {
        ...SAVED[0],
        terminals: [
          {
            id: 't-0',
            slot: 0,
            fracW: 1,
            fracH: 1,
            cwd: '/home/user',
            minimized: false,
            agentId: null,
            cwdFallbackFrom: '/projeto/que/sumiu',
          },
        ],
      },
    ])

    render(<App />)
    await confirmRestore()

    await waitFor(() =>
      expect(
        screen.getByText('O diretório /projeto/que/sumiu não existe mais. O terminal abriu em home.'),
      ).toBeInTheDocument(),
    )
  })

  it('fechar o aviso o remove pelo resto da sessão (LAYOUT-25)', async () => {
    mockWorkspace([
      {
        ...SAVED[0],
        terminals: [
          {
            id: 't-0',
            slot: 0,
            fracW: 1,
            fracH: 1,
            cwd: '/home/user',
            minimized: false,
            agentId: null,
            cwdFallbackFrom: '/sumiu-a',
          },
          {
            id: 't-1',
            slot: 1,
            fracW: 1,
            fracH: 1,
            cwd: '/home/user',
            minimized: false,
            agentId: null,
            cwdFallbackFrom: '/sumiu-b',
          },
        ],
      },
    ])

    render(<App />)
    await confirmRestore()
    await waitFor(() =>
      expect(screen.getByLabelText('fechar aviso de diretório')).toBeInTheDocument(),
    )
    // Uma linha por terminal afetado.
    expect(screen.getByText(/\/sumiu-a/)).toBeInTheDocument()
    expect(screen.getByText(/\/sumiu-b/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('fechar aviso de diretório'))

    expect(screen.queryByText(/\/sumiu-a/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\/sumiu-b/)).not.toBeInTheDocument()
  })

  it('workspace sem diretório sumido não mostra aviso nenhum (LAYOUT-25)', async () => {
    mockWorkspace(SAVED)

    render(<App />)
    await confirmRestore()
    await waitFor(() => expect(screen.getByRole('tab', { name: /Deploy/ })).toBeInTheDocument())

    expect(screen.queryByLabelText('fechar aviso de diretório')).not.toBeInTheDocument()
  })

  it('leitura rejeitada registra o erro e mantém a aba vazia, sem quebrar o render (LAYOUT-26)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockWorkspace(new Error('banco corrompido'))

    render(<App />)
    await waitFor(() => expect(consoleError).toHaveBeenCalled())

    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    consoleError.mockRestore()
  })
})

describe('App - terminal-layout-options: gravar o workspace com debounce (LAYOUT-21, LAYOUT-22)', () => {
  const SAVED = [
    {
      id: 'tab-a',
      slot: 0,
      name: 'Deploy',
      layoutMode: 'vertical',
      layoutSpan: 'last',
      terminals: [
        {
          id: 't-0',
          slot: 0,
          fracW: 1,
          fracH: 1,
          cwd: '/a',
          minimized: false,
          agentId: 'claude-code',
          // PERM-04: o modo persistido volta na restauração e é regravado.
          permissionMode: 'auto',
        },
      ],
    },
  ]

  /** Chamadas de gravação registradas até agora. */
  function saveCalls() {
    return invokeMock.mock.calls.filter(([command]) => command === 'terminal_workspace_set')
  }

  function mockBoot(workspaceGet: unknown) {
    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'agent_catalog_all') return Promise.resolve(EMPTY_CATALOG)
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: false, window: 'both' })
      if (command === 'terminal_workspace_get') return workspaceGet
      return projectInvoke(command, args)
    })
  }

  /** Monta o App já hidratado com um workspace salvo — só depois disso o
   * efeito de gravação deixa de ser inerte. */
  async function bootHydrated() {
    mockBoot(Promise.resolve(SAVED))
    render(<App />)
    // SESS-01: o modal de restauração vem antes; confirmar tudo é o que
    // hidrata o app e liga o efeito de gravação.
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar selecionados' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: /Deploy/ })).toBeInTheDocument())
    await act(async () => {})
  }

  it('uma mudança de abas grava uma única vez, 500 ms depois (LAYOUT-21)', async () => {
    await bootHydrated()
    expect(saveCalls()).toHaveLength(0)

    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByLabelText('nova aba'))

      act(() => {
        vi.advanceTimersByTime(499)
      })
      expect(saveCalls()).toHaveLength(0)

      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(saveCalls()).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uma rajada de mudanças resulta em uma gravação só, não uma por evento (LAYOUT-21)', async () => {
    await bootHydrated()

    vi.useFakeTimers()
    try {
      for (let i = 0; i < 3; i += 1) {
        fireEvent.click(screen.getByLabelText('nova aba'))
        act(() => {
          vi.advanceTimersByTime(100)
        })
      }
      expect(saveCalls()).toHaveLength(0)

      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(saveCalls()).toHaveLength(1)
      // A última mudança da rajada é a que vence: as 3 abas novas estão no
      // payload, não um estado intermediário.
      expect(saveCalls()[0]![1].tabs).toHaveLength(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('nada é gravado enquanto a leitura do boot não resolve', async () => {
    // Leitura que nunca resolve: `hydrated` fica falso o tempo todo.
    mockBoot(new Promise(() => {}))

    vi.useFakeTimers()
    try {
      render(<App />)
      fireEvent.click(screen.getByLabelText('nova aba'))

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(saveCalls()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('o payload carrega agentId por terminal e layoutMode/layoutSpan por aba (LAYOUT-22)', async () => {
    await bootHydrated()

    vi.useFakeTimers()
    try {
      // Renomear a aba é uma mudança de `tabs` como qualquer outra.
      fireEvent.click(screen.getByRole('tab', { name: /Deploy/ }))
      fireEvent.change(screen.getByLabelText('renomear aba'), { target: { value: 'Release' } })
      fireEvent.click(screen.getByLabelText('confirmar renomear aba'))

      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(saveCalls()).toHaveLength(1)
      expect(saveCalls()[0]![1].tabs).toEqual([
        {
          id: 'tab-a',
          slot: 0,
          name: 'Release',
          layoutMode: 'vertical',
          layoutSpan: 'last',
          terminals: [
            {
              id: 't-0',
              slot: 0,
              fracW: 1,
              fracH: 1,
              cwd: '/a',
              minimized: false,
              // SPEC: session-restore (SESS-10, SESS-16) — o id de sessão vai
              // no mesmo payload. O fixture do boot não traz sessão salva, e
              // SESS-16 manda gerar uma nova nesse caso: é um UUID qualquer,
              // não `null`.
              agentSessionId: expect.any(String),
              agentId: 'claude-code',
              // PERM-04: o modo escolhido no wizard vai junto do agente.
              permissionMode: 'auto',
            },
          ],
        },
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('App - quota-indicator prefs wiring (QUOTA-11)', () => {
  it('busca quota_prefs_get uma vez na montagem e o resultado desce para o Header', async () => {
    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'agent_catalog_all') return Promise.resolve(EMPTY_CATALOG)
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'quota_claude') {
        return Promise.resolve({
          state: 'disabled',
          windows: [],
          planLabel: null,
          fetchedAt: null,
          retryAt: null,
        })
      }
      return projectInvoke(command, args)
    })

    render(<App />)

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('quota_prefs_get'))
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'quota_prefs_get')).toHaveLength(1)
    await waitFor(() => expect(screen.getByLabelText('quota')).toBeInTheDocument())
  })

  it('quota://prefs-changed com enabled:false remove o indicador sem remontar os painéis', async () => {
    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'agent_catalog_all') return Promise.resolve(EMPTY_CATALOG)
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'terminal_picker_last_dir') return Promise.resolve(null)
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'quota_claude') {
        return Promise.resolve({
          state: 'disabled',
          windows: [],
          planLabel: null,
          fetchedAt: null,
          retryAt: null,
        })
      }
      return projectInvoke(command, args)
    })

    render(<App />)
    await waitFor(() => expect(screen.getByLabelText('quota')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await createTerminalViaWizard()

    const paneBefore = screen.getByTestId('terminal-pane-stub')

    act(() => {
      getQuotaPrefsChangedHandler()({ payload: { enabled: false, window: 'both' } })
    })

    expect(screen.queryByLabelText('quota')).not.toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane-stub')).toBe(paneBefore)
  })
})

// SPEC: session-restore (SESS-01, SESS-02, SESS-06, SESS-07, SESS-08, SESS-11, SESS-12, SESS-13, SESS-16, SESS-17)
describe('App - session-restore: confirmar abas e sessões no boot', () => {
  const SAVED = [
    {
      id: 'tab-a',
      slot: 0,
      name: 'Deploy',
      layoutMode: 'horizontal',
      layoutSpan: 'first',
      terminals: [
        {
          id: 't-0',
          slot: 0,
          fracW: 0.5,
          fracH: 1,
          cwd: '/projeto',
          minimized: false,
          agentId: 'claude-code',
          agentSessionId: 'sessao-salva-0',
        },
        {
          id: 't-1',
          slot: 1,
          fracW: 0.5,
          fracH: 1,
          cwd: '/api',
          minimized: false,
          agentId: 'claude-code',
          agentSessionId: 'sessao-salva-1',
        },
      ],
    },
  ]

  function mockBoot(saved: unknown) {
    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'agent_catalog_all') {
        return Promise.resolve(
          hostCatalog([
            {
              id: 'claude-code',
              name: 'Claude Code',
              vendor: 'Anthropic',
              command: 'claude',
              beta: false,
              installed: true,
              supportsSessionResume: true,
            },
          ]),
        )
      }
      if (command === 'agent_default') return Promise.resolve('claude-code')
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: false, window: 'both' })
      if (command === 'terminal_picker_last_dir') return Promise.resolve(null)
      if (command === 'terminal_workspace_get') {
        return saved instanceof Error ? Promise.reject(saved) : Promise.resolve(saved)
      }
      return projectInvoke(command, args)
    })
  }

  function spawns() {
    return invokeMock.mock.calls.filter(([command]) => command === 'pty_spawn')
  }

  function saveCalls() {
    return invokeMock.mock.calls.filter(([command]) => command === 'terminal_workspace_set')
  }

  // SESS-01
  it('workspace com terminal salvo abre o modal e não sobe nenhum PTY antes da escolha', async () => {
    mockBoot(SAVED)

    render(<App />)

    await screen.findByRole('dialog', { name: 'restaurar sessão anterior' })
    expect(spawns()).toHaveLength(0)
    expect(screen.queryByTestId('terminal-pane-stub')).not.toBeInTheDocument()
  })

  // SESS-02: só abas vazias não têm o que confirmar.
  it('workspace só com abas vazias restaura direto, sem modal', async () => {
    mockBoot([{ ...SAVED[0], terminals: [] }])

    render(<App />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /Deploy/ })).toBeInTheDocument())

    expect(
      screen.queryByRole('dialog', { name: 'restaurar sessão anterior' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
  })

  // LAYOUT-26 preservado: falha de leitura não abre modal nenhum.
  it('leitura que falha abre a aba vazia sem modal', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockBoot(new Error('banco corrompido'))

    render(<App />)
    await waitFor(() => expect(consoleError).toHaveBeenCalled())

    expect(
      screen.queryByRole('dialog', { name: 'restaurar sessão anterior' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
    consoleError.mockRestore()
  })

  // SESS-06 + SESS-13: o marcado volta, retomando a sessão salva.
  it('"Restaurar selecionados" monta os marcados retomando a sessão salva', async () => {
    mockBoot(SAVED)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar selecionados' }))

    await waitFor(() => expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(2))
    expect(spawns().map(([, args]) => [args.cwd, args.sessionId, args.resume])).toEqual([
      ['/projeto', 'sessao-salva-0', true],
      ['/api', 'sessao-salva-1', true],
    ])
  })

  // SPEC: projects (PROJ-14) — restaurar terminais é uso dos projetos deles.
  it('restaurar terminais toca os projetos dos cwd restaurados uma vez só (P1 AC10)', async () => {
    mockBoot(SAVED)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar selecionados' }))

    await waitFor(() => expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(2))

    const touches = invokeMock.mock.calls.filter(([command]) => command === 'project_touch_cwds')
    expect(touches).toHaveLength(1)
    expect(touches[0]?.[1]).toEqual({ cwds: ['/projeto', '/api'] })
  })

  it('"Começar do zero" não toca projeto nenhum', async () => {
    mockBoot(SAVED)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Começar do zero' }))

    await waitFor(() => expect(screen.getByText('No Terminals Active')).toBeInTheDocument())
    expect(invokeMock).not.toHaveBeenCalledWith('project_touch_cwds', expect.anything())
  })

  // SPEC: projects (PROJ-12) — o rascunho não entra no payload gravado.
  it('um rascunho aberto é gravado como aba vazia, não como terminal (P1 AC12)', async () => {
    mockBoot([{ ...SAVED[0], terminals: [] }])

    render(<App />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /Deploy/ })).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('new terminal'))
    await waitFor(() => expect(wizardOnScreen()).toHaveLength(1))

    await waitFor(() => expect(saveCalls().length).toBeGreaterThan(0), { timeout: 2000 })
    const payload = saveCalls().at(-1)?.[1] as { tabs: { terminals: unknown[] }[] }
    expect(payload.tabs).toHaveLength(1)
    expect(payload.tabs[0]?.terminals).toEqual([])
  })

  // SESS-15: o catálogo chega por IPC depois da leitura do workspace. Sem
  // segurar o modal, ele monta com `resumableAgentIds` vazio e congela todo
  // terminal em "nova sessão" — nenhuma conversa voltaria.
  it('catálogo que responde depois do workspace ainda retoma as sessões salvas', async () => {
    let liberarCatalogo!: (entries: unknown) => void
    const catalogo = new Promise((resolve) => {
      liberarCatalogo = resolve
    })

    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'agent_catalog_all') return catalogo
      if (command === 'agent_default') return Promise.resolve('claude-code')
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: false, window: 'both' })
      if (command === 'terminal_picker_last_dir') return Promise.resolve(null)
      if (command === 'terminal_workspace_get') return Promise.resolve(SAVED)
      return projectInvoke(command, args)
    })

    render(<App />)

    // Workspace já chegou; o modal espera o catálogo.
    await waitFor(() =>
      expect(invokeMock.mock.calls.some(([c]) => c === 'terminal_workspace_get')).toBe(true),
    )
    expect(
      screen.queryByRole('dialog', { name: 'restaurar sessão anterior' }),
    ).not.toBeInTheDocument()

    await act(async () => {
      liberarCatalogo(
        hostCatalog([
          {
            id: 'claude-code',
            name: 'Claude Code',
            vendor: 'Anthropic',
            command: 'claude',
            beta: false,
            installed: true,
            supportsSessionResume: true,
          },
        ]),
      )
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar selecionados' }))

    await waitFor(() => expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(2))
    expect(spawns().map(([, args]) => [args.sessionId, args.resume])).toEqual([
      ['sessao-salva-0', true],
      ['sessao-salva-1', true],
    ])
  })

  // SESS-06: o desmarcado não volta — nem na tela, nem na gravação seguinte.
  it('terminal desmarcado não é montado nem regravado', async () => {
    mockBoot(SAVED)

    render(<App />)
    await screen.findByRole('dialog', { name: 'restaurar sessão anterior' })
    fireEvent.click(screen.getByLabelText('restaurar terminal api'))
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }))

    await waitFor(() => expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(1))
    expect(spawns().map(([, args]) => args.cwd)).toEqual(['/projeto'])

    await waitFor(() => expect(saveCalls()).toHaveLength(1))
    expect(saveCalls()[0]![1].tabs[0].terminals.map((t: { id: string }) => t.id)).toEqual(['t-0'])
  })

  // SESS-16: switch em "nova sessão" descarta o id salvo.
  it('terminal marcado como "nova sessão" arranca com id novo e sem retomada', async () => {
    mockBoot(SAVED)

    render(<App />)
    await screen.findByRole('dialog', { name: 'restaurar sessão anterior' })
    fireEvent.click(screen.getByLabelText('nova sessão para projeto'))
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }))

    await waitFor(() => expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(2))
    const [primeiro] = spawns()
    expect(primeiro![1].resume).toBe(false)
    expect(primeiro![1].sessionId).not.toBe('sessao-salva-0')
    expect(primeiro![1].sessionId).toEqual(expect.any(String))
  })

  // SESS-07 / SESS-08
  it('"Começar do zero" abre uma aba vazia e grava esse estado por cima do salvo', async () => {
    mockBoot(SAVED)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Começar do zero' }))

    await waitFor(() => expect(screen.getByText('No Terminals Active')).toBeInTheDocument())
    expect(spawns()).toHaveLength(0)
    expect(screen.getAllByRole('tab')).toHaveLength(1)

    await waitFor(() => expect(saveCalls()).toHaveLength(1))
    expect(saveCalls()[0]![1].tabs).toHaveLength(1)
    expect(saveCalls()[0]![1].tabs[0].terminals).toHaveLength(0)
  })

  // SESS-08: Escape é o mesmo gesto.
  it('Escape no modal equivale a "Começar do zero"', async () => {
    mockBoot(SAVED)

    render(<App />)
    await screen.findByRole('dialog', { name: 'restaurar sessão anterior' })
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.getByText('No Terminals Active')).toBeInTheDocument())
    expect(spawns()).toHaveLength(0)
  })

  // SESS-11 + SESS-12: terminal criado pelo diálogo nasce com sessão própria.
  it('terminal novo arranca fixando uma sessão nova', async () => {
    mockBoot([])

    render(<App />)
    await waitFor(() => expect(screen.getByText('No Terminals Active')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await createTerminalViaWizard()

    expect(spawns()).toHaveLength(1)
    expect(spawns()[0]![1].resume).toBe(false)
    expect(spawns()[0]![1].sessionId).toEqual(expect.any(String))
  })

  // SESS-17: reiniciar zera a conversa, não a retoma.
  it('reiniciar o terminal troca o id de sessão e não retoma', async () => {
    mockBoot(SAVED)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar selecionados' }))
    await waitFor(() => expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(2))

    fireEvent.click(screen.getAllByLabelText('reiniciar terminal')[0]!)

    await waitFor(() => expect(spawns()).toHaveLength(3))
    const reinicio = spawns()[2]!
    expect(reinicio[1].cwd).toBe('/projeto')
    expect(reinicio[1].resume).toBe(false)
    expect(reinicio[1].sessionId).not.toBe('sessao-salva-0')
  })

  // SESS-11: clonar nunca aponta dois painéis para a mesma conversa.
  it('clonar dá ao clone uma sessão própria', async () => {
    mockBoot(SAVED)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar selecionados' }))
    await waitFor(() => expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(2))

    fireEvent.click(screen.getAllByLabelText('clonar terminal')[0]!)

    await waitFor(() => expect(spawns()).toHaveLength(3))
    const clone = spawns()[2]!
    expect(clone[1].cwd).toBe('/projeto')
    expect(clone[1].sessionId).not.toBe('sessao-salva-0')
    expect(clone[1].resume).toBe(false)
  })
})

describe('App - terminal-screenshot: captura pelo botão do painel (SHOT-01, SHOT-13..SHOT-23)', () => {
  async function createTerminalIn(dir: string) {
    fireEvent.click(screen.getByLabelText('new terminal'))
    await createTerminalViaWizard(dir)
  }

  /** Botão de câmera do enésimo painel (SHOT-01). */
  const paneCamera = (nth = 0) => screen.getAllByLabelText('capturar terminal')[nth]!

  // SHOT-01, SHOT-14: o botão do painel captura aquele painel, sem seleção.
  it('captura o painel do próprio botão e abre o modal', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    await createTerminalIn('/b')

    fireEvent.click(paneCamera(1))

    expect(await screen.findByRole('dialog', { name: 'Captura do terminal' })).toBeInTheDocument()
    // O segundo painel: índice 2 e o `cwd` dele.
    expect(snapshotBlobMock).toHaveBeenCalledWith({ cwd: '/b' }, { index: 2, cwd: '/b' })
  })

  // SHOT-16: o nome sugerido carrega o painel de origem e um carimbo ordenável.
  it('sugere um nome de arquivo com o índice do painel e a data', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    fireEvent.click(paneCamera())

    await screen.findByRole('dialog', { name: 'Captura do terminal' })
    expect(screen.getByText(/^swarmdeck-terminal-1-\d{8}-\d{6}\.png$/)).toBeInTheDocument()
  })

  // SHOT-13: painel sem dimensão na tela não abre o modal.
  it('não abre modal quando a captura falha', async () => {
    snapshotBlobMock.mockRejectedValue(new Error('terminal sem dimensão visível'))
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    fireEvent.click(paneCamera())

    await waitFor(() => expect(snapshotBlobMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Captura do terminal' })).not.toBeInTheDocument()
  })

  // SHOT-13: painel sem instância viva de xterm não pinta nem abre o modal.
  it('não pinta quando o painel não tem instância de xterm', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/sem-xterm')
    fireEvent.click(paneCamera())

    expect(snapshotBlobMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Captura do terminal' })).not.toBeInTheDocument()
  })

  // SHOT-23: o teclado volta para a câmera **daquele** painel ao fechar o modal.
  it('devolve o foco à câmera do painel capturado ao fechar o modal', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    await createTerminalIn('/b')
    fireEvent.click(paneCamera(1))
    await screen.findByRole('dialog', { name: 'Captura do terminal' })

    fireEvent.click(screen.getByLabelText('fechar'))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Captura do terminal' })).not.toBeInTheDocument(),
    )
    expect(document.activeElement).toBe(paneCamera(1))
  })
})

// SPEC: minimized-tray (MIN-01, MIN-04, MIN-05, MIN-06)
describe('App - minimized-tray', () => {
  async function createTerminalIn(dir: string) {
    fireEvent.click(screen.getByLabelText('new terminal'))
    await createTerminalViaWizard(dir)
  }

  /** Células do grid que continuam na tela (as demais estão em display:none). */
  const visibleCells = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('.app-tab-panel:not([style*="display: none"]) .grid-layout__cell')].filter(
      (cell) => cell.style.display !== 'none',
    )

  // MIN-01: o painel sai da tela, mas o `TerminalPane` segue montado — é a
  // desmontagem que mataria o PTY.
  it('minimizar tira o painel da tela sem desmontá-lo', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    await createTerminalIn('/b')
    expect(visibleCells(container)).toHaveLength(2)

    fireEvent.click(screen.getAllByLabelText('minimizar terminal')[0]!)

    expect(visibleCells(container)).toHaveLength(1)
    // Os dois stubs continuam no DOM: nada desmontou.
    expect(container.querySelectorAll('[data-testid="terminal-pane-stub"]')).toHaveLength(2)
  })

  // MIN-04, MIN-05: a bandeja lista o minimizado com a aba de origem, e
  // restaurar de outra aba traz a aba dele para a frente.
  it('lista o minimizado de outra aba e volta para ela ao restaurar', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    fireEvent.click(screen.getAllByLabelText('minimizar terminal')[0]!)

    fireEvent.click(screen.getByLabelText('nova aba'))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Aba 2/ })).toHaveAttribute('aria-selected', 'true'),
    )

    fireEvent.click(screen.getByLabelText('minimized terminals'))
    expect(screen.getByText('Minimized (1)')).toBeInTheDocument()
    // "Aba 1" também é o rótulo da aba na barra: a asserção olha só o popover.
    expect(screen.getByRole('menu')).toHaveTextContent('Aba 1')

    // "Terminal 1" também é o título do painel (montado, fora da tela): o
    // clique tem que ser no item do popover.
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem'))

    expect(screen.getByRole('tab', { name: /Aba 1/ })).toHaveAttribute('aria-selected', 'true')
    expect(visibleCells(container)).toHaveLength(1)
    expect(screen.queryByLabelText('minimized terminals')).not.toBeInTheDocument()
  })

  // MIN-06: fechar pela bandeja encerra o terminal de qualquer aba, não só da
  // ativa.
  it('fechar pela bandeja remove o terminal de outra aba', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    await createTerminalIn('/a')
    fireEvent.click(screen.getAllByLabelText('minimizar terminal')[0]!)
    fireEvent.click(screen.getByLabelText('nova aba'))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Aba 2/ })).toHaveAttribute('aria-selected', 'true'),
    )

    fireEvent.click(screen.getByLabelText('minimized terminals'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByLabelText('fechar Terminal 1'))

    expect(screen.queryByLabelText('minimized terminals')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="terminal-pane-stub"]')).toHaveLength(0)
  })
})

// SPEC: projects (PROJ-11, PROJ-12) — o gatilho de novo terminal abre um
// painel de rascunho com o wizard, não um diálogo modal.
describe('App - projects: painel de rascunho', () => {
  it('o rascunho ocupa um painel e conta no teto de 4 (P1 AC14)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByLabelText('new terminal'))
      await createTerminalViaWizard(`/projeto/${i}`)
    }

    fireEvent.click(screen.getByLabelText('new terminal'))
    await waitFor(() => expect(wizardOnScreen()).toHaveLength(1))

    // O quarto painel é o rascunho: o gatilho trava mesmo sem PTY atrás dele.
    expect(screen.getByLabelText('new terminal')).toBeDisabled()
  })

  it('o painel de rascunho renderiza o wizard e não monta TerminalPane', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('new terminal'))
    await waitFor(() => expect(wizardOnScreen()).toHaveLength(1))

    expect(screen.queryByTestId('terminal-pane-stub')).not.toBeInTheDocument()
    expect(invokeMock).not.toHaveBeenCalledWith('pty_spawn', expect.anything())
  })

  it('fechar o rascunho remove o painel sem matar PTY nenhum (P1 AC13, AC18)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('new terminal'))
    await waitFor(() => expect(wizardOnScreen()).toHaveLength(1))

    fireEvent.click(screen.getByLabelText('fechar terminal'))

    expect(wizardOnScreen()).toHaveLength(0)
    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
    expect(invokeMock).not.toHaveBeenCalledWith('pty_kill', expect.anything())
  })

  it('fechar a aba inteira com um rascunho dentro não mata PTY nenhum (edge case)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('nova aba'))
    fireEvent.click(screen.getByLabelText('new terminal'))
    await waitFor(() => expect(wizardOnScreen()).toHaveLength(1))

    fireEvent.click(screen.getByLabelText('fechar Aba 2'))

    await waitFor(() => expect(wizardOnScreen()).toHaveLength(0))
    expect(invokeMock).not.toHaveBeenCalledWith('pty_kill', expect.anything())
  })

  // SPEC: projects (PROJ-13, PROJ-14, PROJ-16)
  it('confirmar o wizard monta o terminal com o cwd e o agente escolhidos, e toca o projeto', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('new terminal'))
    await createTerminalViaWizard('/home/user/alvo')

    const pane = await screen.findByTestId('terminal-pane-stub')
    expect(pane.dataset.cwd).toBe('/home/user/alvo')
    // SESS-10: sessão nova, como em `defaultTerminal()`.
    expect(pane.dataset.sessionId).not.toBe('')
    expect(pane.dataset.resume).toBe('false')

    // P1 AC9: o projeto importado pelo wizard é tocado uma vez.
    const touches = invokeMock.mock.calls.filter(([command]) => command === 'project_touch')
    expect(touches).toHaveLength(1)
    expect(touches[0]?.[1]).toEqual({ id: 'proj-/home/user/alvo' })
  })

  it('"No Project" abre o terminal na sandbox e não toca projeto nenhum (P2 AC3)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog_all'))

    fireEvent.click(screen.getByLabelText('new terminal'))
    fireEvent.click(await screen.findByRole('button', { name: 'No Project' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Nova sessão' }))

    const pane = await screen.findByTestId('terminal-pane-stub')
    expect(pane.dataset.cwd).toBe('/home/user/.swarmdeck/sandbox')
    expect(invokeMock).not.toHaveBeenCalledWith('project_touch', expect.anything())
  })
})

// SPEC: terminal-boot-loading (BOOT-04, BOOT-05, BOOT-06, BOOT-07)
describe('App - terminal-boot-loading: overlay de boot', () => {
  /** Forma completa que `quota_claude` devolve (`QuotaSnapshot`) — `windows`
   * sempre presente, mesmo em estado sem dado. Um snapshot parcial aqui
   * derruba o `QuotaIndicator` real, que não é dublado neste arquivo. */
  const QUOTA_SNAPSHOT = {
    state: 'disabled',
    windows: [],
    planLabel: null,
    fetchedAt: null,
    retryAt: null,
  }

  /** Um terminal salvo, na forma que `terminal_workspace_get` devolve. */
  function savedTerminal(id: string, cwd: string) {
    return {
      id,
      slot: 0,
      fracW: 0.5,
      fracH: 1,
      cwd,
      minimized: false,
      agentId: 'claude-code',
      agentSessionId: `sessao-${id}`,
    }
  }

  function savedTab(terminals: ReturnType<typeof savedTerminal>[]) {
    return [
      {
        id: 'tab-a',
        slot: 0,
        name: 'Deploy',
        layoutMode: 'horizontal',
        layoutSpan: 'first',
        terminals,
      },
    ]
  }

  /** `quota` permite pendurar a cota do boot (BOOT-09) numa promise que o
   * teste resolve na mão — é o que torna a segunda porta observável. */
  function mockBoot(saved: unknown, quota?: Promise<unknown>) {
    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'agent_catalog_all') {
        return Promise.resolve(
          hostCatalog([
            {
              id: 'claude-code',
              name: 'Claude Code',
              vendor: 'Anthropic',
              command: 'claude',
              beta: false,
              installed: true,
              supportsSessionResume: true,
            },
          ]),
        )
      }
      if (command === 'agent_default') return Promise.resolve('claude-code')
      // `enabled: false` mantém o `QuotaIndicator` fora da árvore, como nos
      // outros blocos deste arquivo. Não enfraquece BOOT-09: o `App` chama
      // `quota_claude` sem olhar a preferência, porque o guard de `enabled`
      // mora no backend (QUOTA-17).
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: false, window: 'both' })
      if (command === 'quota_claude') {
        return quota ?? Promise.resolve(QUOTA_SNAPSHOT)
      }
      if (command === 'terminal_workspace_get') {
        return saved instanceof Error ? Promise.reject(saved) : Promise.resolve(saved)
      }
      return projectInvoke(command, args)
    })
  }

  // BOOT-04: o overlay existe no primeiro quadro, antes de qualquer resposta.
  it('a janela abre em carregamento, antes da leitura do workspace resolver', () => {
    mockBoot([])

    render(<App />)

    expect(screen.getByTestId('boot-splash')).toBeInTheDocument()
    // BOOT-10: a varredura de terminais/agentes é a primeira fase anunciada.
    expect(screen.getByText('Procurando terminais e agentes instalados…')).toBeInTheDocument()
  })

  // BOOT-07: nada salvo não tem o que esperar.
  it('workspace vazio libera a tela', async () => {
    mockBoot([])

    render(<App />)

    await waitFor(() => expect(screen.queryByTestId('boot-splash')).not.toBeInTheDocument())
    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
  })

  // BOOT-07: falha de leitura não pode virar overlay eterno.
  it('leitura que falha libera a tela', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockBoot(new Error('banco corrompido'))

    render(<App />)

    await waitFor(() => expect(screen.queryByTestId('boot-splash')).not.toBeInTheDocument())
    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
    consoleError.mockRestore()
  })

  // BOOT-09: a cota é a segunda porta. Workspace vazio resolve na hora, então
  // o que segura a tela aqui é só ela — e o rótulo tem de dizer isso.
  it('a cota pendente segura a tela mesmo sem nada a restaurar', async () => {
    let resolveQuota: (snapshot: unknown) => void = () => {}
    mockBoot([], new Promise((resolve) => (resolveQuota = resolve)))

    render(<App />)

    await waitFor(() =>
      expect(screen.getByText('Consultando a cota dos agentes…')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('boot-splash')).toBeInTheDocument()

    resolveQuota(QUOTA_SNAPSHOT)

    await waitFor(() => expect(screen.queryByTestId('boot-splash')).not.toBeInTheDocument())
  })

  // BOOT-09: a busca do boot é a que aquece o cache do backend; o anel do
  // cabeçalho continua fazendo a dele, agora servida do cache.
  it('o boot busca a cota antes de liberar a tela', async () => {
    mockBoot([])

    render(<App />)

    await waitFor(() => expect(screen.queryByTestId('boot-splash')).not.toBeInTheDocument())
    expect(invokeMock).toHaveBeenCalledWith('quota_claude', { force: false })
  })

  // BOOT-05: o modal vem POR CIMA do carregamento, não no lugar dele.
  it('o modal de restauração aparece com o overlay ainda montado', async () => {
    mockBoot(savedTab([savedTerminal('t-0', '/projeto')]))

    render(<App />)

    await screen.findByRole('dialog', { name: 'restaurar sessão anterior' })
    expect(screen.getByText('Sessão anterior encontrada')).toBeInTheDocument()
  })

  // BOOT-06: todos prontos, tela liberada.
  it('o overlay só sai depois que todos os terminais restaurados reportam PTY vivo', async () => {
    mockBoot(savedTab([savedTerminal('t-0', '/projeto'), savedTerminal('t-1', '/api')]))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar selecionados' }))

    await waitFor(() => expect(screen.queryByTestId('boot-splash')).not.toBeInTheDocument())
    expect(screen.getAllByTestId('terminal-pane-stub')).toHaveLength(2)
  })

  // BOOT-06, o caso que discrimina: um painel que não reporta segura a tela, e
  // o contador mostra exatamente quantos já subiram.
  it('um terminal que não reporta mantém o overlay e o contador parcial', async () => {
    mockBoot(savedTab([savedTerminal('t-0', '/projeto'), savedTerminal('t-1', '/nunca-pronto')]))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar selecionados' }))

    await waitFor(() => expect(screen.getByText('1/2 terminais prontos')).toBeInTheDocument())
    expect(screen.getByText('Abrindo os terminais salvos…')).toBeInTheDocument()
  })

  // BOOT-07: "Começar do zero" não sobe terminal nenhum, então não espera nada.
  it('"Começar do zero" libera a tela na hora', async () => {
    mockBoot(savedTab([savedTerminal('t-0', '/projeto')]))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Começar do zero' }))

    await waitFor(() => expect(screen.queryByTestId('boot-splash')).not.toBeInTheDocument())
    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
  })
})
