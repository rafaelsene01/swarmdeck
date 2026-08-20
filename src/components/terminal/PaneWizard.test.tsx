// SPEC: projects (PROJ-13, PROJ-16, PROJ-17, PROJ-18, PROJ-21)

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
  { id: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', command: 'claude', beta: false },
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
      defaultAgentId="claude-code"
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
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: /alpha/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Codex CLI' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))

    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/alpha', 'codex-cli', 'a')
  })

  it('"Terminal limpo" emite onConfirm com agente nulo, mesmo com agente padrão (P1 AC20)', async () => {
    const onConfirm = vi.fn()
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: /alpha/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Terminal limpo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))

    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/alpha', null, 'a')
  })

  it('"No Project" avança com o caminho da sandbox e projectId nulo (P2 AC1)', async () => {
    const onConfirm = vi.fn()
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
      if (command === 'project_sandbox_dir') return Promise.resolve('/data/swarmdeck/sandbox')
      return unexpected(command)
    })
    renderWizard({ onConfirm })
    await waitForList()

    fireEvent.click(screen.getByRole('button', { name: 'No Project' }))

    await waitFor(() => expect(activeStep()).toBe('2'))
    expect(screen.getByText('/data/swarmdeck/sandbox')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
    expect(onConfirm).toHaveBeenCalledWith('/data/swarmdeck/sandbox', 'claude-code', null)
  })

  it('"Import Project" com pasta nova chama project_create com o nome da última pasta e avança (P2 AC4)', async () => {
    const onConfirm = vi.fn()
    openMock.mockResolvedValueOnce('/home/user/dev/novo-projeto')
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
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
    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/novo-projeto', 'claude-code', 'n')
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
    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/alpha', 'claude-code', 'a')
  })

  it('"New Project" abre o formulário; confirmar chama project_create_in e avança com o projeto criado (P2 AC7)', async () => {
    const onConfirm = vi.fn()
    openMock.mockResolvedValueOnce('/home/user/dev')
    invokeMock.mockImplementation((command: string) => {
      const touched = touchOk(command)
      if (touched) return touched
      if (command === 'project_list') return Promise.resolve([ALPHA])
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
    expect(onConfirm).toHaveBeenCalledWith('/home/user/dev/teste-git', 'claude-code', 'c')
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
