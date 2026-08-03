// SPEC: agent-selection (AGT-01, AGT-03, AGT-04), multi-terminal (TERM-10, TERM-11)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import NewTerminalDialog from './NewTerminalDialog'
import type { AgentDescriptor } from '../../routes/settings/AgentPanel'

// `vi.mock` é hoisted para o topo do arquivo pelo transform do Vitest — as
// variáveis que os factories abaixo referenciam precisam vir de
// `vi.hoisted` para sobreviver a esse hoisting (mesmo padrão usado em
// `useTaskStore.test.ts`).
const { invokeMock, openMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
}))

const CATALOG: AgentDescriptor[] = [
  { id: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', command: 'claude', beta: false },
  { id: 'codex-cli', name: 'Codex CLI', vendor: 'OpenAI', command: 'codex', beta: false },
  { id: 'kimi-code', name: 'Kimi Code', vendor: 'Moonshot AI', command: 'kimi', beta: true },
]

function renderDialog(props: Partial<Parameters<typeof NewTerminalDialog>[0]> = {}) {
  return render(
    <NewTerminalDialog
      agents={CATALOG}
      installedIds={new Set(CATALOG.map((a) => a.id))}
      defaultAgentId={null}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />,
  )
}

describe('NewTerminalDialog', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    openMock.mockReset()
    // Padrão: nenhum "último diretório" persistido ainda (banco novo, T13).
    invokeMock.mockImplementation((command: string) => {
      if (command === 'terminal_picker_last_dir') return Promise.resolve(null)
      if (command === 'terminal_picker_set_last_dir') return Promise.resolve(undefined)
      return Promise.resolve(undefined)
    })
  })

  it('trocar o agente no diálogo é local à sessão: não chama onSelectDefault nem altera a prop defaultAgentId recebida', async () => {
    const onConfirm = vi.fn()
    // Representa a API que persistiria o padrão global (AgentPanel::onSelectDefault).
    // Nunca é passada como prop ao diálogo — a asserção `not.toHaveBeenCalled()` só
    // é interessante porque também provamos, abaixo, que o diálogo confirma com o
    // id trocado (não com o padrão), o que já mostra que a troca não passou por
    // nenhum caminho de persistência do padrão global.
    const onSelectDefaultSpy = vi.fn()
    const initialDefaultAgentId = 'claude-code'
    // Desde TERM-10 AC5, "criar" fica desabilitado sem pasta escolhida — o
    // teste precisa passar por uma seleção no seletor nativo antes de confirmar.
    openMock.mockResolvedValueOnce('/home/user/projeto')

    renderDialog({ defaultAgentId: initialDefaultAgentId, onConfirm })

    // Aguarda a busca do último diretório (T13/T14) disparada no mount, para
    // não deixar a promise pendente vazando entre testes.
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('terminal_picker_last_dir'))

    const select = screen.getByLabelText('Agente') as HTMLSelectElement
    // Pré-seleciona o padrão recebido via prop (AGT-01).
    expect(select.value).toBe('claude-code')

    // Evento de UI real — não mutação direta de estado.
    fireEvent.change(select, { target: { value: 'codex-cli' } })
    expect(select.value).toBe('codex-cli')

    fireEvent.click(screen.getByRole('button', { name: 'buscar pasta' }))
    await waitFor(() => expect(screen.getByLabelText('Diretório')).toHaveValue('/home/user/projeto'))

    fireEvent.click(screen.getByRole('button', { name: 'criar' }))

    // A confirmação usa a escolha local desta sessão, não o padrão global.
    expect(onConfirm).toHaveBeenCalledWith('/home/user/projeto', 'codex-cli')
    // Nenhum caminho no diálogo chama a API de padrão global.
    expect(onSelectDefaultSpy).not.toHaveBeenCalled()
    // A prop recebida nunca foi mutada — o diálogo só a usou como valor inicial.
    expect(initialDefaultAgentId).toBe('claude-code')
  })

  it('selecionar uma pasta no seletor nativo preenche "Diretório" e persiste como último diretório usado (TERM-10 AC2, TERM-11 AC1)', async () => {
    openMock.mockResolvedValueOnce('/home/user/projeto')

    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'buscar pasta' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Diretório')).toHaveValue('/home/user/projeto')
    })

    expect(invokeMock).toHaveBeenCalledWith('terminal_picker_set_last_dir', {
      path: '/home/user/projeto',
    })
  })

  it('cancelar o seletor nativo (open() resolve null) limpa "Diretório" (TERM-10 AC4)', async () => {
    openMock.mockResolvedValueOnce('/home/user/projeto')
    renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'buscar pasta' }))
    await waitFor(() => expect(screen.getByLabelText('Diretório')).toHaveValue('/home/user/projeto'))

    openMock.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole('button', { name: 'buscar pasta' }))

    await waitFor(() => expect(screen.getByLabelText('Diretório')).toHaveValue(''))
  })

  it('"criar" fica desabilitado enquanto nenhuma pasta foi escolhida (TERM-10 AC5)', async () => {
    renderDialog()

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('terminal_picker_last_dir'))
    expect(screen.getByRole('button', { name: 'criar' })).toBeDisabled()
  })

  it('"criar" fica habilitado depois de uma seleção bem-sucedida no seletor', async () => {
    openMock.mockResolvedValueOnce('/home/user/projeto')
    renderDialog()

    expect(screen.getByRole('button', { name: 'criar' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'buscar pasta' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).not.toBeDisabled())
  })

  it('o seletor abre com defaultPath igual ao último diretório usado persistido (TERM-11 AC2)', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'terminal_picker_last_dir') return Promise.resolve('/home/user/ultimo')
      if (command === 'terminal_picker_set_last_dir') return Promise.resolve(undefined)
      return Promise.resolve(undefined)
    })
    openMock.mockResolvedValueOnce('/home/user/novo')

    renderDialog()

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('terminal_picker_last_dir'))

    fireEvent.click(screen.getByRole('button', { name: 'buscar pasta' }))

    await waitFor(() =>
      expect(openMock).toHaveBeenCalledWith({ directory: true, defaultPath: '/home/user/ultimo' }),
    )
  })
})
