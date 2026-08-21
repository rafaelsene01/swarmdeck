// SPEC: projects (PROJ-13, PROJ-16, PROJ-17, PROJ-18, PROJ-21)
// SPEC: terminal-boot-loading (BOOT-11, BOOT-12)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PaneWizard from './PaneWizard'
import type { AgentDescriptor } from '../../routes/settings/AgentPanel'

const { invokeMock, openMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }))

const CATALOG: AgentDescriptor[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendor: 'Anthropic',
    command: 'claude',
    beta: false,
    // PERM-03: como `agent_catalog` devolve para o Claude.
    permissionModes: ['manual', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions'],
  },
  { id: 'codex-cli', name: 'Codex CLI', vendor: 'OpenAI', command: 'codex', beta: false },
]

const ALPHA = {
  id: 'a',
  name: 'alpha',
  path: '/home/user/dev/alpha',
  color: '#ef4444',
  last_used: null,
}

const unexpected = (command: string) => Promise.reject(new Error('comando inesperado: ' + command))

/** PROJ-13 AC15 / PROJ-14 AC9: selecionar um projeto passa por `project_touch`,
 * que valida o caminho no disco e grava o uso. O caminho feliz é o padrão. */
const touchOk = (command: string) =>
  command === 'project_touch' ? Promise.resolve(ALPHA) : null

function renderWizard(props: Partial<Parameters<typeof PaneWizard>[0]> = {}) {
  return render(
    <PaneWizard
      agents={CATALOG}
      installedIds={new Set(CATALOG.map((a) => a.id))}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />,
  )
}

/** Espera a lista carregada — todos os testes partem da etapa "PROJECT". */
const waitForList = () => waitFor(() => expect(screen.getByText(/projects$/)).toBeInTheDocument())

/** As duas etapas mostram a trilha "PROJECT › AGENT" inteira; quem diz onde
 *  o wizard está é o `data-step` do cabeçalho. */
const activeStep = () => document.querySelector('.wizard-head')?.getAttribute('data-step')

describe('PaneWizard', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    openMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
      // SPEC: terminal-boot-loading (BOOT-11) — selecionar um projeto passou a
      // perguntar em qual terminal aquele caminho roda.
      if (command === 'shell_profile_for_path') return Promise.resolve('host')
      return unexpected(command)
    })
  })

  it('selecionar um projeto avança para a etapa AGENT e "Voltar" volta preservando a busca (P1 AC5, AC6)', async () => {
    renderWizard()
    await waitForList()

    fireEvent.change(screen.getByLabelText('Buscar projetos'), { target: { value: 'alp' } })
    fireEvent.click(screen.getByRole('button', { name: /alpha/ }))

    // PROJ-14: a seleção passa pelo `project_touch`, então a etapa AGENT
    // aparece no tique seguinte.
    await waitFor(() => expect(activeStep()).toBe('2'))
    expect(invokeMock).toHaveBeenCalledWith('project_touch', { id: 'a' })
    expect(screen.getByText('/home/user/dev/alpha')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))

    expect(activeStep()).toBe('1')
    expect(screen.getByLabelText('Buscar projetos')).toHaveValue('alp')
  })

  it('"Nova sessão" emite onConfirm com caminho do projeto, agente e id do projeto (P1 AC8)', async () => {
    const onConfirm = vi.fn()
    // Sem padrão, para o `claude-code` do resultado provar que veio do
    // clique e não da pré-seleção.
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: /alpha/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Claude Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))

    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/alpha', 'claude-code', 'a', 'auto')
  })

  it('"Terminal" emite onConfirm com agente nulo, mesmo com agente padrão (P1 AC20)', async () => {
    const onConfirm = vi.fn()
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: /alpha/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Terminal$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))

    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/alpha', null, 'a', null)
  })

  it('"No Project" avança com o caminho da sandbox e projectId nulo (P2 AC1)', async () => {
    const onConfirm = vi.fn()
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
      if (command === 'shell_profile_for_path') return Promise.resolve('host')
      if (command === 'project_sandbox_dir') return Promise.resolve('/data/swarmdeck/sandbox')
      return unexpected(command)
    })
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: 'No Project' }))

    await waitFor(() => expect(activeStep()).toBe('2'))
    expect(screen.getByText('/data/swarmdeck/sandbox')).toBeInTheDocument()

    // AD-035: nenhum ladrilho foi clicado, então vale "Terminal" (shell puro).
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
    expect(onConfirm).toHaveBeenCalledWith('/data/swarmdeck/sandbox', null, null, null)
  })

  it('"Import Project" com pasta nova chama project_create com o nome da última pasta e avança (P2 AC4)', async () => {
    const onConfirm = vi.fn()
    openMock.mockResolvedValueOnce('/home/user/dev/novo-projeto')
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
      if (command === 'shell_profile_for_path') return Promise.resolve('host')
      if (command === 'project_create')
        return Promise.resolve({
          id: 'n',
          name: 'novo-projeto',
          path: '/home/user/dev/novo-projeto',
          color: '#22c55e',
          last_used: null,
        })
      return unexpected(command)
    })
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: 'Import Project' }))

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('project_create', {
        name: 'novo-projeto',
        path: '/home/user/dev/novo-projeto',
      }),
    )
    await waitFor(() => expect(activeStep()).toBe('2'))

    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/novo-projeto', null, 'n', null)
  })

  it('"Import Project" com pasta já registrada seleciona o projeto existente e avança (P2 AC5)', async () => {
    const onConfirm = vi.fn()
    openMock.mockResolvedValueOnce('/home/user/dev/alpha')
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: 'Import Project' }))

    await waitFor(() => expect(activeStep()).toBe('2'))
    expect(invokeMock).not.toHaveBeenCalledWith('project_create', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/alpha', null, 'a', null)
  })

  it('"New Project" abre o formulário; confirmar chama project_create_in e avança com o projeto criado (P2 AC7)', async () => {
    const onConfirm = vi.fn()
    openMock.mockResolvedValueOnce('/home/user/dev')
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
      if (command === 'shell_profile_for_path') return Promise.resolve('host')
      if (command === 'project_create_in')
        return Promise.resolve({
          id: 'c',
          name: 'teste-git',
          path: '/home/user/dev/teste-git',
          color: '#ef4444',
          last_used: null,
        })
      return unexpected(command)
    })
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    expect(screen.getByRole('dialog', { name: 'novo projeto' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'teste-git' } })
    fireEvent.click(screen.getByRole('button', { name: 'escolher pasta' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Diretório base')).toHaveValue('/home/user/dev'),
    )
    fireEvent.click(screen.getByLabelText('Inicializar como repositório git'))
    fireEvent.click(screen.getByRole('button', { name: 'criar' }))

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('project_create_in', {
        name: 'teste-git',
        baseDir: '/home/user/dev',
        color: '#ef4444',
        gitInit: true,
      }),
    )
    await waitFor(() => expect(activeStep()).toBe('2'))

    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/teste-git', null, 'c', null)
  })

  it('falha de project_list mantém a etapa PROJECT e exibe a mensagem', async () => {
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.reject(new Error('banco indisponível'))
      return unexpected(command)
    })
    renderWizard()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('banco indisponível'))
    expect(activeStep()).toBe('1')
    expect(screen.getByText('0 / 0 projects')).toBeInTheDocument()
  })

  // PROJ-13 AC15: o caminho do projeto sumiu do disco entre o registro e o
  // clique. `project_touch` é quem descobre isso (`require_existing_dir`).
  it('projeto cujo caminho sumiu mantém a etapa PROJECT e mostra o caminho ausente (P1 AC15)', async () => {
    const onConfirm = vi.fn()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'project_list') return Promise.resolve([ALPHA])
      if (command === 'shell_profile_for_path') return Promise.resolve('host')
      if (command === 'project_touch')
        return Promise.reject('diretório não encontrado: /home/user/dev/alpha')
      return unexpected(command)
    })
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: /alpha/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('/home/user/dev/alpha')
    expect(activeStep()).toBe('1')
    expect(onConfirm).not.toHaveBeenCalled()
    // O projeto continua listado: o caminho é que sumiu, não o registro.
    expect(screen.getByRole('button', { name: /alpha/ })).toBeInTheDocument()
  })

  it('falha de project_sandbox_dir mantém a etapa PROJECT e exibe a mensagem', async () => {
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
      if (command === 'shell_profile_for_path') return Promise.resolve('host')
      if (command === 'project_sandbox_dir')
        return Promise.reject(new Error('diretório de dados sem permissão'))
      return unexpected(command)
    })
    renderWizard()
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: 'No Project' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('diretório de dados sem permissão'),
    )
    expect(activeStep()).toBe('1')
  })

  it('falha de project_create_in deixa o formulário aberto com a mensagem e a etapa PROJECT (P2 AC10, AC11)', async () => {
    openMock.mockResolvedValueOnce('/home/user/dev')
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
      if (command === 'shell_profile_for_path') return Promise.resolve('host')
      if (command === 'project_create_in')
        return Promise.reject(new Error('caminho já usado pelo projeto alpha'))
      return unexpected(command)
    })
    renderWizard()
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'escolher pasta' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Diretório base')).toHaveValue('/home/user/dev'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'criar' }))

    await waitFor(() =>
      expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
        'caminho já usado pelo projeto alpha',
      ),
    )
    expect(screen.getByRole('dialog', { name: 'novo projeto' })).toBeInTheDocument()
    expect(activeStep()).toBe('1')
  })

  it('falha de project_create no Import mantém a etapa PROJECT e exibe a mensagem', async () => {
    openMock.mockResolvedValueOnce('/home/user/dev/outro')
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
      if (command === 'shell_profile_for_path') return Promise.resolve('host')
      if (command === 'project_create') return Promise.reject(new Error('diretório não existe'))
      return unexpected(command)
    })
    renderWizard()
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: 'Import Project' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('diretório não existe'))
    expect(activeStep()).toBe('1')
  })
})

// SPEC: agent-permission-mode (PERM-05) — o modo escolhido no passo AGENT
// chega ao `onConfirm`, e só quando o agente selecionado declara modos.
describe('PaneWizard — modo de permissão (PERM-05)', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
      // SPEC: terminal-boot-loading (BOOT-11) — selecionar um projeto passou a
      // perguntar em qual terminal aquele caminho roda.
      if (command === 'shell_profile_for_path') return Promise.resolve('host')
      return unexpected(command)
    })
  })

  it('trocar o modo antes de "Nova sessão" é o que vai no onConfirm', async () => {
    const onConfirm = vi.fn()
    renderWizard({ onConfirm })

    fireEvent.click(await screen.findByText('alpha'))
    // AD-035: o agente precisa ser escolhido — o seletor de modo só aparece
    // depois, porque é o agente selecionado que declara os modos (PERM-05).
    fireEvent.click(await screen.findByRole('button', { name: 'Claude Code' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sem verificação' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))

    expect(onConfirm).toHaveBeenCalledWith(
      '/home/user/dev/alpha',
      'claude-code',
      'a',
      'bypassPermissions',
    )
  })

  // AD-035: a pré-seleção passou a ser "Terminal" (shell puro), que não
  // declara modo nenhum — é este o caminho que antes era coberto por um
  // `defaultAgentId: 'codex-cli'`. Mesma invariante: sem modos declarados,
  // nenhum modo vai no `onConfirm`.
  it('sem agente escolhido não mostra seletor de modo nem manda modo', async () => {
    const onConfirm = vi.fn()
    renderWizard({ onConfirm })

    fireEvent.click(await screen.findByText('alpha'))
    const confirm = await screen.findByRole('button', { name: 'Nova sessão' })

    expect(screen.queryByRole('group', { name: 'Modo de permissão' })).not.toBeInTheDocument()

    fireEvent.click(confirm)

    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/alpha', null, 'a', null)
  })
})

// SPEC: terminal-boot-loading (BOOT-11, BOOT-12)
// O ponto da feature: a etapa AGENT lista os agentes do terminal em que
// **aquele caminho** roda. Antes disto ela usava sempre o catálogo do perfil
// padrão, então uma pasta dentro de uma distro WSL mostrava o `claude` como
// "não encontrado no PATH" — o do Windows — e o ladrilho ficava desabilitado
// mesmo com o CLI instalado lá dentro.
describe('PaneWizard — agentes do terminal do caminho', () => {
  const WSL_PROJECT = {
    id: 'w',
    name: 'api',
    path: '\\\\wsl.localhost\\Ubuntu-24.04\\home\\x\\api',
    color: null,
    last_used: null,
  }

  /** Claude instalado só dentro da distro; nada instalado no host. */
  const PROFILES = [
    {
      profileId: 'host',
      label: 'Windows (padrão)',
      wsl1: false,
      agents: CATALOG.map((agent) => ({ ...agent, installed: false })),
    },
    {
      profileId: 'wsl:Ubuntu-24.04',
      label: 'Ubuntu-24.04',
      wsl1: false,
      agents: CATALOG.map((agent) => ({ ...agent, installed: agent.id === 'claude-code' })),
    },
  ]

  /** `profileId` é o que `shell_profile_for_path` devolve para o caminho. */
  function mockProfile(profileId: string) {
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'project_touch') return Promise.resolve(WSL_PROJECT)
      if (command === 'project_list') return Promise.resolve([WSL_PROJECT])
      if (command === 'shell_profile_for_path') return Promise.resolve(profileId)
      return unexpected(command)
    })
  }

  it('pasta dentro da distro libera o agente instalado lá e nomeia o terminal', async () => {
    mockProfile('wsl:Ubuntu-24.04')
    // `installedIds` vazio de propósito: se a etapa ainda usasse as props do
    // perfil padrão, o ladrilho ficaria desabilitado e o teste falharia.
    renderWizard({ profileCatalogs: PROFILES, installedIds: new Set() })

    fireEvent.click(await screen.findByRole('button', { name: /api/ }))
    await waitFor(() => expect(activeStep()).toBe('2'))

    expect(invokeMock).toHaveBeenCalledWith('shell_profile_for_path', {
      cwd: WSL_PROJECT.path,
    })
    expect(screen.getByText('Ubuntu-24.04')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claude Code' })).toBeEnabled()
  })

  // AD-035: a grade lista somente o instalado naquele terminal, então o agente
  // que só existe na distro não aparece — antes aparecia desabilitado. Sobra o
  // ladrilho "Terminal", que é a pré-seleção e não depende de comando nenhum.
  it('pasta no host não lista o agente que só existe na distro', async () => {
    mockProfile('host')
    renderWizard({ profileCatalogs: PROFILES, installedIds: new Set(['claude-code']) })

    fireEvent.click(await screen.findByRole('button', { name: /api/ }))
    await waitFor(() => expect(activeStep()).toBe('2'))

    expect(screen.getByText('Windows (padrão)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claude Code' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Terminal$/ })).toBeInTheDocument()
  })

  it('consulta de perfil que falha cai no catálogo das props, como antes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'project_touch') return Promise.resolve(WSL_PROJECT)
      if (command === 'project_list') return Promise.resolve([WSL_PROJECT])
      if (command === 'shell_profile_for_path') return Promise.reject(new Error('sem banco'))
      return unexpected(command)
    })

    renderWizard({ profileCatalogs: PROFILES, installedIds: new Set(['claude-code']) })

    fireEvent.click(await screen.findByRole('button', { name: /api/ }))
    await waitFor(() => expect(activeStep()).toBe('2'))

    expect(screen.queryByText('Ubuntu-24.04')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claude Code' })).toBeEnabled()
    consoleError.mockRestore()
  })
})
