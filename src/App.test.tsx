// SPEC: shell-chrome (HDR-01, HDR-08, EMPTY-01..EMPTY-09), release-distribution (REL-52), multi-terminal (TERM-12, TERM-13), terminal-tabs (TAB-06), terminal-layout-options (LAYOUT-15, LAYOUT-16, LAYOUT-17, LAYOUT-19, LAYOUT-20, LAYOUT-21, LAYOUT-22, LAYOUT-23, LAYOUT-24, LAYOUT-25, LAYOUT-26, LAYOUT-29)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'

// Same `vi.hoisted` pattern as `NewTerminalDialog.test.tsx` — the `vi.mock`
// factories below are hoisted above these imports by Vitest's transform.
const { invokeMock, openMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {},
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
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
    default: ({ cwd, agent }: { cwd: string; agent?: string }) => {
      useEffect(() => {
        void invokeMock('pty_spawn', { cwd, agent })
      }, [])

      return <div data-testid="terminal-pane-stub" data-cwd={cwd} data-agent={agent} />
    },
  }
})

beforeEach(() => {
  invokeMock.mockReset()
  openMock.mockReset()
  listenMock.mockReset()
  listenMock.mockResolvedValue(() => {})
  // `TerminalHeader.handleClose` confirms before closing a terminal with an
  // active process (App always passes `hasActiveProcess`) - jsdom has no
  // native `window.confirm`.
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  invokeMock.mockImplementation((command: string) => {
    if (command === 'agent_catalog') return Promise.resolve([])
    if (command === 'agent_default') return Promise.resolve(null)
    if (command === 'terminal_picker_last_dir') return Promise.resolve(null)
    if (command === 'settings_open') return Promise.resolve(undefined)
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
    return Promise.resolve(undefined)
  })
})

/** Drives the real create-terminal flow (open dialog -> pick folder -> confirm),
 * same steps `NewTerminalDialog.test.tsx` uses - needed by EMPTY-04/EMPTY-09
 * which require an actual terminal to exist first. */
async function createTerminalViaDialog() {
  openMock.mockResolvedValueOnce('/home/user/projeto')
  fireEvent.click(screen.getByRole('button', { name: 'buscar pasta' }))
  await waitFor(() => expect(screen.getByLabelText('Diretório')).toHaveValue('/home/user/projeto'))
  fireEvent.click(screen.getByRole('button', { name: 'criar' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'criar' })).not.toBeInTheDocument())
}

describe('App - shell-chrome wiring', () => {
  it('mounts Header in place of the old .app-toolbar (HDR-01)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.getByLabelText('new terminal')).toBeInTheDocument()
    expect(screen.getByLabelText('settings')).toBeInTheDocument()
    expect(container.querySelector('.app-toolbar')).not.toBeInTheDocument()
  })

  it('Header\'s "new terminal" icon opens NewTerminalDialog, same as the old button (HDR-08)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByLabelText('new terminal'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
  })

  it('Header\'s "settings" icon calls settings_open, same as the old button (HDR-08)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByLabelText('settings'))

    expect(invokeMock).toHaveBeenCalledWith('settings_open')
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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.queryByLabelText('update available')).not.toBeInTheDocument()
  })
})

describe('App - shell-chrome empty state', () => {
  it('boots with zero terminals and shows EmptyState instead of GridLayout (EMPTY-01, EMPTY-02, EMPTY-03)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
    expect(screen.queryByLabelText('fechar terminal')).not.toBeInTheDocument()
  })

  it('creating a terminal swaps EmptyState for GridLayout, and closing the last terminal swaps back (EMPTY-01, EMPTY-02, EMPTY-04)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()

    expect(screen.queryByText('No Terminals Active')).not.toBeInTheDocument()
    expect(screen.getByLabelText('fechar terminal')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('fechar terminal'))

    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
  })

  it('"+ Create Terminal" opens NewTerminalDialog (EMPTY-06)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
  })

  it('Ctrl+T opens NewTerminalDialog while empty and dialog closed, and prevents the default (EMPTY-07)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    const notPrevented = fireEvent.keyDown(window, { key: 't', ctrlKey: true })

    expect(notPrevented).toBe(false)
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
  })

  it('Ctrl+T while the dialog is already open does not open a second instance (EMPTY-08)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 't', ctrlKey: true })

    expect(screen.getAllByRole('button', { name: 'criar' })).toHaveLength(1)
  })

  it('T without Ctrl does not open the dialog (Edge Case)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.keyDown(window, { key: 't', ctrlKey: false })

    expect(screen.queryByRole('button', { name: 'criar' })).not.toBeInTheDocument()
  })

  it('Ctrl+T has no effect once a terminal is open (EMPTY-09)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()

    fireEvent.keyDown(window, { key: 't', ctrlKey: true })

    expect(screen.queryByRole('button', { name: 'criar' })).not.toBeInTheDocument()
  })
})

describe('App - terminal-chrome (CHROME-03)', () => {
  it('maximizar tira o painel do grid e o põe sobre o header e a barra de abas', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()

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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()
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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByLabelText('nova aba'))
    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()
    expect(screen.getByTestId('terminal-pane-stub')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('fechar Aba 2'))

    expect(screen.queryByTestId('terminal-pane-stub')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Aba 1/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('a última aba não pode ser fechada (TAB-04)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.queryByLabelText('fechar Aba 1')).not.toBeInTheDocument()
  })

  it('o teto de 4 terminais vale por aba: a aba nova nasce com "new terminal" liberado (TAB-05)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByLabelText('new terminal'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
      await createTerminalViaDialog()
    }
    expect(screen.getByLabelText('new terminal')).toBeDisabled()

    fireEvent.click(screen.getByLabelText('nova aba'))

    expect(screen.getByLabelText('new terminal')).toBeEnabled()
  })

  it('clonar abre outro terminal na mesma aba e desabilita ao chegar em 4', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByLabelText('new terminal'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()
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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByLabelText('new terminal'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()

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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByLabelText('nova aba'))
    fireEvent.click(screen.getByRole('tab', { name: /Aba 1/ }))

    expect(screen.queryByLabelText('renomear aba')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Aba 1/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('cancelar a renomeação da aba mantém o nome antigo', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

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
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    openMock.mockResolvedValueOnce(dir)
    fireEvent.click(screen.getByRole('button', { name: 'buscar pasta' }))
    await waitFor(() => expect(screen.getByLabelText('Diretório')).toHaveValue(dir))
    fireEvent.click(screen.getByRole('button', { name: 'criar' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'criar' })).not.toBeInTheDocument(),
    )
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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    await createTerminalIn('/a')
    await createTerminalIn('/b')

    const dataTransfer = fakeDataTransfer()
    fireEvent.dragStart(grips(container)[1]!, { dataTransfer })
    fireEvent.drop(panesOf(container)[1]!, { dataTransfer })

    expect(paneOrder(container)).toEqual(['/a', '/b'])
  })

  it('nenhum TerminalPane é desmontado na reordenação (LAYOUT-18)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

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
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

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
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: false, window: 'both' })
      if (command === 'terminal_workspace_get') {
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
      }
      return Promise.resolve(undefined)
    })
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

  // LAYOUT-29: cada terminal restaurado é sessão nova. O observável é o
  // `pty_spawn` por painel montado — um por terminal salvo, com `cwd` e
  // agente e nada mais: não existe campo de sessão nem de saída anterior no
  // que o boot devolve, então não há o que retomar.
  it('cada terminal restaurado nasce de um pty_spawn próprio, sem sessão anterior (LAYOUT-29)', async () => {
    mockWorkspace(SAVED)

    render(<App />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /Deploy/ })).toBeInTheDocument())

    const spawns = invokeMock.mock.calls.filter(([command]) => command === 'pty_spawn')
    // 5 terminais salvos → 5 sessões novas, uma por painel.
    expect(spawns).toHaveLength(5)
    expect(spawns.map(([, args]) => args.cwd)).toEqual(['/a', '/b', '/c', '/d', '/e'])
    // O spawn só recebe `cwd` e agente: nenhum id de sessão antiga, nenhum
    // scrollback: o app não tem por onde retomar o processo anterior.
    for (const [, args] of spawns) {
      expect(Object.keys(args).sort()).toEqual(['agent', 'cwd'])
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
        },
      ],
    },
  ]

  /** Chamadas de gravação registradas até agora. */
  function saveCalls() {
    return invokeMock.mock.calls.filter(([command]) => command === 'terminal_workspace_set')
  }

  function mockBoot(workspaceGet: unknown) {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: false, window: 'both' })
      if (command === 'terminal_workspace_get') return workspaceGet
      return Promise.resolve(undefined)
    })
  }

  /** Monta o App já hidratado com um workspace salvo — só depois disso o
   * efeito de gravação deixa de ser inerte. */
  async function bootHydrated() {
    mockBoot(Promise.resolve(SAVED))
    render(<App />)
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
              agentId: 'claude-code',
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
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
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
      return Promise.resolve(undefined)
    })

    render(<App />)

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('quota_prefs_get'))
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'quota_prefs_get')).toHaveLength(1)
    await waitFor(() => expect(screen.getByLabelText('quota')).toBeInTheDocument())
  })

  it('quota://prefs-changed com enabled:false remove o indicador sem remontar os painéis', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
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
      return Promise.resolve(undefined)
    })

    render(<App />)
    await waitFor(() => expect(screen.getByLabelText('quota')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()

    const paneBefore = screen.getByTestId('terminal-pane-stub')

    act(() => {
      getQuotaPrefsChangedHandler()({ payload: { enabled: false, window: 'both' } })
    })

    expect(screen.queryByLabelText('quota')).not.toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane-stub')).toBe(paneBefore)
  })
})
