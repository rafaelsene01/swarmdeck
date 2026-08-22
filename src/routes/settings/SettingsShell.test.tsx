// SPEC: providers-panel (PROV-05, PROV-06, PROV-08, PROV-09)
// SPEC: feedback-form (FEED-01)
// SPEC: update-toast (TOAST-06, TOAST-08, TOAST-09), settings-shell (SET-03, SET-04, SET-05, SET-06, SET-07, SET-08, SET-09, SET-10), projects (PROJ-19, PROJ-23, PROJ-24)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SettingsShell from './SettingsShell'

// Same `vi.hoisted` pattern as `App.test.tsx` — the `vi.mock` factories
// below are hoisted above these imports by Vitest's transform.
const { invokeMock, closeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  closeMock: vi.fn(),
  // `update://download-progress` (SILENT-37): o shell assina no mount, então
  // o mock precisa devolver a promise de `unlisten` que o cleanup consome.
  listenMock: vi.fn(() => Promise.resolve(() => {})),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: closeMock }),
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => Promise.resolve('0.1.9'),
}))

// PROJ-19: o formulário de criação abre o seletor de pasta do SO.
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: () => Promise.resolve('/home/user/dev'),
}))

// SPEC: quota-provider-source (QSRC-01, QSRC-03) — o wiring: a lista de Geral
// vem da mesma varredura da seção Provedores, e os perfis vêm de
// `agent_catalog_all`.
describe('SettingsShell — origem da cota na seção Geral (QSRC-01, QSRC-03)', () => {
  beforeEach(() => {
    invokeMock.mockClear()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') {
        return Promise.resolve([
          { id: 'claude-code', enabled: true, foundIn: ['Windows', 'Ubuntu-24.04'] },
          { id: 'kimi-code', enabled: false, foundIn: [] },
        ])
      }
      if (command === 'agent_catalog_all') {
        return Promise.resolve({
          defaultProfileId: 'host',
          profiles: [
            { profileId: 'host', label: 'Windows', wsl1: false, agents: [] },
            { profileId: 'wsl:Ubuntu-24.04', label: 'Ubuntu-24.04', wsl1: false, agents: [] },
          ],
        })
      }
      if (command === 'quota_prefs_get') {
        return Promise.resolve({
          enabled: true,
          window: 'both',
          providers: [{ id: 'claude-code', enabled: true }],
        })
      }
      if (command === 'project_list') return Promise.resolve([])
      return Promise.resolve(null)
    })
  })

  it('Geral lista o provedor achado e oferece os dois terminais dele', async () => {
    render(<SettingsShell />)

    await waitFor(() =>
      expect(document.querySelector('[data-provider="claude-code"]')).not.toBeNull(),
    )
    // QSRC-01: o não achado não vira linha.
    expect(document.querySelector('[data-provider="kimi-code"]')).toBeNull()

    // QSRC-03: os dois rótulos casaram com perfis e viraram opções; o padrão
    // (`host` = "Windows") é o marcado enquanto nada foi escolhido.
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Ubuntu-24.04' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('radio', { name: 'Windows' })).toBeChecked()
  })

  it('marcar um terminal persiste via quota_prefs_set', async () => {
    render(<SettingsShell />)

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Ubuntu-24.04' })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Ubuntu-24.04' }))

    expect(invokeMock).toHaveBeenCalledWith('quota_prefs_set', {
      prefs: {
        enabled: true,
        window: 'both',
        providers: [{ id: 'claude-code', enabled: true, profileId: 'wsl:Ubuntu-24.04' }],
      },
    })
  })
})

describe('SettingsShell — seção Provedores (PROV-05/06/08/09)', () => {
  const CLAUDE = { id: 'claude-code', enabled: true, foundIn: ['Windows', 'Ubuntu-24.04'] }
  const CODEX = { id: 'codex-cli', enabled: false, foundIn: [] }

  function mockProviders(rows: unknown[] = [CLAUDE, CODEX]) {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve(rows)
      if (command === 'provider_scan') return Promise.resolve([{ ...CODEX, foundIn: ['Windows'], enabled: true }])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      return Promise.resolve(null)
    })
  }

  const openSection = async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: /Provedores/ }))
  }

  beforeEach(() => {
    invokeMock.mockClear()
  })

  // PROV-09: abrir a seção mostra o gravado; a varredura é do boot e do botão.
  it('abre a seção com o gravado, sem varrer', async () => {
    mockProviders()
    await openSection()

    await waitFor(() =>
      expect(document.querySelector('[data-provider="claude-code"]')).not.toBeNull(),
    )
    expect(invokeMock).not.toHaveBeenCalledWith('provider_scan')
    expect(
      document.querySelectorAll('[data-provider="claude-code"] .providers-panel__place'),
    ).toHaveLength(2)
  })

  // PROV-06: "Atualizar" varre e repõe a lista com o resultado gravado.
  it('o botão Atualizar varre e substitui a lista pelo resultado', async () => {
    mockProviders()
    await openSection()
    await waitFor(() =>
      expect(document.querySelector('[data-provider="claude-code"]')).not.toBeNull(),
    )

    fireEvent.click(screen.getByRole('button', { name: /Atualizar|Buscando/ }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_scan'))
    await waitFor(() =>
      expect(document.querySelector('[data-provider="claude-code"]')).toBeNull(),
    )
    const switchInput = document.querySelector(
      '[data-provider="codex-cli"] input',
    ) as HTMLInputElement
    expect(switchInput.checked).toBe(true)
  })

  // PROV-05: alternar persiste com id e valor novo.
  it('alternar o switch persiste via provider_enabled_set', async () => {
    mockProviders()
    await openSection()
    await waitFor(() =>
      expect(document.querySelector('[data-provider="claude-code"]')).not.toBeNull(),
    )

    fireEvent.click(document.querySelector('[data-provider="claude-code"] input') as HTMLElement)

    expect(invokeMock).toHaveBeenCalledWith('provider_enabled_set', {
      id: 'claude-code',
      enabled: false,
    })
    const switchInput = document.querySelector(
      '[data-provider="claude-code"] input',
    ) as HTMLInputElement
    expect(switchInput.checked).toBe(false)
  })

  // Caso de borda da spec: leitura que falha registra e deixa a lista vazia.
  it('falha de leitura deixa a lista vazia e registra no console', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.reject(new Error('sem banco'))
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      return Promise.resolve(null)
    })

    await openSection()

    await waitFor(() =>
      expect(screen.getByText('Nenhum provedor varrido ainda.')).toBeInTheDocument(),
    )
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('SettingsShell — fechar a janela (SET-03/04/05)', () => {
  beforeEach(() => {
    closeMock.mockClear()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      return Promise.resolve(null)
    })
  })

  it('clique no X chama close() da janela atual', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Configurações' }))
    expect(closeMock).toHaveBeenCalledTimes(1)
  })

  it('clique em "Fechar" chama close() da janela atual', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})

describe('SettingsShell — sidebar com ícones e trilho (SET-06/07/08)', () => {
  beforeEach(() => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      return Promise.resolve(null)
    })
  })

  it('trilho mostra a seção ativa e troca ao navegar, sem alterar a navegação existente', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))

    // QUOTA-08: "Geral" passou a ser a seção padrão da janela.
    expect(screen.getByText('Configurações › Geral')).toBeInTheDocument()
    const projectsItem = screen.getByRole('button', { name: /Projetos/ })
    expect(projectsItem).not.toHaveAttribute('aria-current')

    fireEvent.click(projectsItem)

    expect(screen.getByText('Configurações › Projetos')).toBeInTheDocument()
    expect(projectsItem).toHaveAttribute('aria-current', 'page')
  })

  it('cada um dos 4 itens da sidebar tem ícone', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))

    for (const label of ['Geral', 'Provedores', 'Projetos', 'Atualizações']) {
      const item = screen.getByRole('button', { name: new RegExp(label) })
      expect(item.querySelector('svg')).not.toBeNull()
    }
  })
})

const READY_STATUS = {
  current: '0.1.0',
  latest: '0.1.0',
  notes: '',
  has_update: false,
  mode: 'installed' as const,
  platform_key: 'windows-x86_64-silent',
}

describe('SettingsShell — persistência do toggle de auto-check (SET-09/10)', () => {
  beforeEach(() => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'update_auto_check_get') return Promise.resolve(false)
      if (command === 'update_status') return Promise.resolve(READY_STATUS)
      return Promise.resolve(null)
    })
  })

  it('mount da seção Atualizações chama update_auto_check_get e usa o valor retornado', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_auto_check_get'))
    const toggle = await screen.findByRole('checkbox', { name: 'Verificar atualizações automaticamente' })
    await waitFor(() => expect(toggle).not.toBeChecked())
  })

  it('alternar o toggle chama update_auto_check_set com o novo valor', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))
    const toggle = await screen.findByRole('checkbox', { name: 'Verificar atualizações automaticamente' })
    await waitFor(() => expect(toggle).not.toBeChecked())

    fireEvent.click(toggle)

    expect(invokeMock).toHaveBeenCalledWith('update_auto_check_set', { enabled: true })
  })

  it('se update_auto_check_get falhar, o toggle mantém o valor padrão (true) sem travar a seção', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'update_auto_check_get') return Promise.reject(new Error('boom'))
      if (command === 'update_status') return Promise.resolve(READY_STATUS)
      return Promise.resolve(null)
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_auto_check_get'))
    const toggle = await screen.findByRole('checkbox', { name: 'Verificar atualizações automaticamente' })
    expect(toggle).toBeChecked()
  })
})

describe('SettingsShell — seção Geral do indicador de cota (QUOTA-08/09/10)', () => {
  beforeEach(() => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'quota_prefs_set') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })
  })

  it('"Geral" é o primeiro item do menu e a seção selecionada na abertura', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))

    expect(screen.getByText('Configurações › Geral')).toBeInTheDocument()
    const navButtons = screen.getAllByRole('button', {
      name: /Geral|Provedores|Projetos|Atualizações/,
    })
    expect(navButtons[0]).toHaveAccessibleName(/Geral/)
    expect(navButtons[0]).toHaveAttribute('aria-current', 'page')
  })

  it('alternar o switch chama invoke("quota_prefs_set", ...) com enabled: false', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('quota_prefs_get'))

    const toggle = await screen.findByRole('checkbox')
    await waitFor(() => expect(toggle).toBeChecked())

    fireEvent.click(toggle)

    expect(invokeMock).toHaveBeenCalledWith('quota_prefs_set', {
      prefs: { enabled: false, window: 'both' },
    })
  })

  it('escolher "Ambos" persiste window: "both"', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'five_hour' })
      if (command === 'quota_prefs_set') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('quota_prefs_get'))

    const bothOption = await screen.findByRole('radio', { name: 'Ambos' })
    fireEvent.click(bothOption)

    expect(invokeMock).toHaveBeenCalledWith('quota_prefs_set', {
      prefs: { enabled: true, window: 'both' },
    })
  })
})

// AD-035: WSLP-01/02/13/19 revogados — o seletor "Perfil de terminal" saiu, e
// com ele os comandos `shell_profiles_list`/`shell_profile_get`/
// `shell_profile_set`. O perfil é derivado do caminho da pasta
// (`shell_profile_for_path`, WSLP-07/WSLP-08).
describe('SettingsShell — sem seletor de perfil de terminal (AD-035)', () => {
  beforeEach(() => {
    invokeMock.mockClear()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      return Promise.resolve(null)
    })
  })

  it('abrir a seção Geral não consulta mais os comandos de perfil', async () => {
    render(<SettingsShell />)

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('quota_prefs_get'))

    for (const command of ['shell_profiles_list', 'shell_profile_get', 'shell_profile_set']) {
      expect(invokeMock.mock.calls.filter(([name]) => name === command)).toHaveLength(0)
    }
    expect(screen.queryByRole('group', { name: 'Perfil de terminal' })).toBeNull()
  })
})

describe('SettingsShell — seção Atualizações ligada ao fluxo confirmado (SILENT-09/13/25)', () => {
  function baseMock(overrides: Record<string, () => Promise<unknown>> = {}) {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'update_auto_check_get') return Promise.resolve(true)
      const override = overrides[command]
      if (override) return override()
      return Promise.resolve(null)
    })
  }

  it('abrir a seção chama update_status e monta o estado ready com os campos devolvidos', async () => {
    baseMock({
      update_status: () =>
        Promise.resolve({
          current: '0.1.0',
          latest: '0.2.0',
          notes: '### Funcionalidades\n\n- Algo novo',
          has_update: true,
          mode: 'installed',
          platform_key: 'windows-x86_64-silent',
        }),
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_status'))
    expect(await screen.findByText('0.1.0')).toBeInTheDocument()
    expect(await screen.findByText('Nova versão disponível')).toBeInTheDocument()
    expect(await screen.findByText('0.2.0')).toBeInTheDocument()
    // SILENT-42: as notas da release chegam do backend e saem renderizadas.
    expect(await screen.findByRole('listitem')).toHaveTextContent('Algo novo')
  })

  it('falha de update_status monta o estado unavailable com a versão instalada preservada', async () => {
    baseMock({
      update_status: () => Promise.reject(new Error('boom')),
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_status'))
    expect(await screen.findByText(/Não foi possível consultar/)).toBeInTheDocument()
  })

  // SILENT-37/38: baixar e instalar são dois cliques, e o botão "Instalar"
  // só aparece depois de `update_download` resolver.
  it('"Baixar" chama update_download e só então oferece "Instalar"', async () => {
    baseMock({
      update_status: () =>
        Promise.resolve({
          current: '0.1.0',
          latest: '0.2.0',
          notes: '',
          has_update: true,
          mode: 'installed',
          platform_key: 'windows-x86_64-silent',
        }),
      update_download: () => Promise.resolve('0.2.0'),
      update_install: () => Promise.resolve('0.2.0'),
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_status'))

    fireEvent.click(await screen.findByRole('button', { name: 'Baixar' }))

    expect(invokeMock).toHaveBeenCalledWith('update_download')
    expect(invokeMock).not.toHaveBeenCalledWith('update_install')
    expect(await screen.findByRole('button', { name: 'Instalar' })).toBeInTheDocument()
  })

  // SILENT-40: instalar NÃO reinicia — `update_restart` só sai do clique
  // explícito em "Reabrir agora", para não derrubar terminais abertos.
  it('"Instalar" não reinicia sozinho; "Reabrir agora" é que chama update_restart', async () => {
    baseMock({
      update_status: () =>
        Promise.resolve({
          current: '0.1.0',
          latest: '0.2.0',
          notes: '',
          has_update: true,
          mode: 'installed',
          platform_key: 'windows-x86_64-silent',
        }),
      update_download: () => Promise.resolve('0.2.0'),
      update_install: () => Promise.resolve('0.2.0'),
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('provider_prefs_get'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_status'))

    fireEvent.click(await screen.findByRole('button', { name: 'Baixar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Instalar' }))
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_install'))

    const reopen = await screen.findByRole('button', { name: 'Reabrir agora' })
    expect(invokeMock).not.toHaveBeenCalledWith('update_restart')

    fireEvent.click(reopen)
    expect(invokeMock).toHaveBeenCalledWith('update_restart')
  })
})

// SPEC: projects (PROJ-19, PROJ-23, PROJ-24) — criar e excluir projeto a partir
// de Configurações, com o mesmo formulário que o wizard usa. Editar saiu com
// PROJ-20 (AD-024).
describe('SettingsShell — criar e excluir projeto (PROJ-19, PROJ-23, PROJ-24)', () => {
  const PROJETO = {
    id: 'p1',
    name: 'SwarmDeck',
    path: 'D:/dev/swarmdeck',
    color: '#f5b700',
    last_used: null,
  }

  function mockShell(overrides: Record<string, unknown> = {}) {
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      if (command in overrides) {
        const value = overrides[command]
        return typeof value === 'function' ? (value as () => unknown)() : Promise.resolve(value)
      }
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([PROJETO])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'update_status') return Promise.resolve({ status: 'idle' })
      return Promise.resolve(undefined)
    })
  }

  async function openProjects() {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('project_list'))
    fireEvent.click(screen.getByRole('button', { name: /Projetos/ }))
    await screen.findByText('SwarmDeck')
  }

  it('"Criar projeto" abre o formulário em modo create e confirma com project_create_in', async () => {
    mockShell()
    await openProjects()

    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))
    const form = await screen.findByRole('dialog', { name: 'novo projeto' })

    fireEvent.change(within(form).getByLabelText('Nome'), { target: { value: 'Novo' } })
    fireEvent.click(within(form).getByRole('button', { name: 'escolher pasta' }))
    await waitFor(() => expect(within(form).getByLabelText('Diretório base')).toHaveValue('/home/user/dev'))
    fireEvent.click(within(form).getByRole('button', { name: 'criar' }))

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('project_create_in', {
        name: 'Novo',
        baseDir: '/home/user/dev',
        color: expect.any(String),
        gitInit: false,
      }),
    )
    // PROJ-19: a lista é relida depois de criar.
    await waitFor(() =>
      expect(invokeMock.mock.calls.filter(([c]) => c === 'project_list').length).toBeGreaterThan(1),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'novo projeto' })).not.toBeInTheDocument(),
    )
  })

  it('excluir chama project_delete depois da confirmação e recarrega a lista (PROJ-24)', async () => {
    mockShell()
    await openProjects()

    fireEvent.click(screen.getByLabelText('excluir SwarmDeck'))
    const dialog = await screen.findByRole('dialog', { name: 'excluir projeto SwarmDeck' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'excluir' }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('project_delete', { id: 'p1' }))
    await waitFor(() =>
      expect(invokeMock.mock.calls.filter(([c]) => c === 'project_list').length).toBeGreaterThan(1),
    )
  })

  it('a linha conta os terminais abertos do projeto e trava a exclusão (PROJ-23, PROJ-24)', async () => {
    mockShell({
      terminal_workspace_get: [{ terminals: [{ cwd: 'D:/dev/swarmdeck/src' }] }],
    })
    await openProjects()

    await waitFor(() => expect(screen.getByText(/1 terminal/)).toBeInTheDocument())
    expect(screen.getByLabelText('excluir SwarmDeck')).toBeDisabled()
  })

  it('erro do backend aparece no formulário e ele continua aberto', async () => {
    mockShell({ project_create_in: () => Promise.reject('nome já usado') })
    await openProjects()

    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))
    const form = await screen.findByRole('dialog', { name: 'novo projeto' })
    fireEvent.change(within(form).getByLabelText('Nome'), { target: { value: 'Novo' } })
    fireEvent.click(within(form).getByRole('button', { name: 'criar' }))

    expect(await within(form).findByRole('alert')).toHaveTextContent('nome já usado')
    expect(screen.getByRole('dialog', { name: 'novo projeto' })).toBeInTheDocument()
  })

  it('erro de project_delete aparece no painel e a linha continua (PROJ-24)', async () => {
    mockShell({ project_delete: () => Promise.reject('banco travado') })
    await openProjects()

    fireEvent.click(screen.getByLabelText('excluir SwarmDeck'))
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'excluir' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('banco travado')
    expect(screen.getByText('SwarmDeck')).toBeInTheDocument()
  })
})

/**
 * SPEC: update-toast (TOAST-06, TOAST-08, TOAST-09)
 *
 * O toast precisa de duas coisas daqui: uma porta de entrada que já abra em
 * "Atualizações", e o switch que o desliga.
 */
describe('SettingsShell — atalho e preferência do toast (update-toast)', () => {
  const TOAST_LABEL = 'Avisar com um toast quando houver nova versão'

  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'update_auto_check_get') return Promise.resolve(true)
      if (command === 'update_toast_get') return Promise.resolve(true)
      if (command === 'update_status') {
        return Promise.resolve({
          current: '0.1.9',
          latest: null,
          notes: '',
          has_update: false,
          mode: 'installed',
          platform_key: 'linux-x86_64',
        })
      }
      return Promise.resolve(null)
    })
  })

  // TOAST-06: sem isto o botão do toast largaria o usuário em "Geral".
  it('`initialSection="updates"` abre direto na seção Atualizações', async () => {
    render(<SettingsShell initialSection="updates" />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Atualizações' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    )
    expect(await screen.findByLabelText(TOAST_LABEL)).toBeInTheDocument()
  })

  it('sem a prop continua abrindo em Geral, como antes (QUOTA-08)', async () => {
    render(<SettingsShell />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Geral' })).toHaveAttribute('aria-current', 'page'),
    )
  })

  // TOAST-08/TOAST-09: persiste, e só o toast.
  it('alternar o switch chama `update_toast_set` sem tocar em `update_auto_check_set`', async () => {
    render(<SettingsShell initialSection="updates" />)

    const toggle = await screen.findByLabelText(TOAST_LABEL)
    await waitFor(() => expect(toggle).toBeChecked())

    fireEvent.click(toggle)

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('update_toast_set', { enabled: false }),
    )
    expect(invokeMock).not.toHaveBeenCalledWith('update_auto_check_set', expect.anything())
  })

  // TOAST-10: leitura que falha deixa o switch ligado em vez de travar a seção.
  it('falha de `update_toast_get` mantém o switch ligado', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'update_toast_get') return Promise.reject(new Error('sem banco'))
      if (command === 'provider_prefs_get') return Promise.resolve([])
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'update_auto_check_get') return Promise.resolve(true)
      if (command === 'update_status') {
        return Promise.resolve({
          current: '0.1.9',
          latest: null,
          notes: '',
          has_update: false,
          mode: 'installed',
          platform_key: 'linux-x86_64',
        })
      }
      return Promise.resolve(null)
    })

    render(<SettingsShell initialSection="updates" />)

    expect(await screen.findByLabelText(TOAST_LABEL)).toBeChecked()
  })
})

// SPEC: feedback-form (FEED-01) — a seção nova na barra lateral.
describe('SettingsShell — seção Feedback (FEED-01)', () => {
  beforeEach(() => {
    invokeMock.mockClear()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'provider_prefs_get') return Promise.resolve([])
      return Promise.resolve(null)
    })
  })

  it('"Feedback" é o quinto e último item da barra lateral, e "Geral" segue sendo a inicial', () => {
    render(<SettingsShell />)

    const items = within(screen.getByRole('navigation', { name: 'Seções de Configurações' })).getAllByRole('button')
    expect(items.map((item) => item.textContent)).toEqual([
      'Geral',
      'Provedores',
      'Projetos',
      'Atualizações',
      'Feedback',
    ])
    expect(screen.getByText('Configurações › Geral')).toBeInTheDocument()
  })

  it('acionar "Feedback" mostra o trilho e monta o formulário', () => {
    render(<SettingsShell />)

    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }))

    expect(screen.getByText('Configurações › Feedback')).toBeInTheDocument()
    expect(screen.getByLabelText('Categoria')).toBeInTheDocument()
    expect(screen.getByLabelText(/Título/)).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Modo da descrição' })).toBeInTheDocument()
  })

  it('a seção de feedback não dispara nenhum invoke novo', () => {
    render(<SettingsShell />)
    const before = invokeMock.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }))

    expect(invokeMock.mock.calls.length).toBe(before)
  })
})
