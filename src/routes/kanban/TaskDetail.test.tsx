// SPEC: task-kanban (KAN-03, KAN-04)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Task } from '../../types/tasks'
import TaskDetail from './TaskDetail'

// Mesmo padrão de `useTaskStore.test.ts`: `vi.hoisted` porque `vi.mock` é
// hoisted para o topo do arquivo pelo transform do Vitest.
const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Tarefa de teste',
    description: 'Descrição de teste',
    plan: 'Plano completo\ncom várias linhas',
    implementation: 'Implementação completa\ncom detalhes',
    status: 'in_progress',
    project: null,
    terminalId: 'terminal-1',
    terminalAlive: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  invokeMock.mockReset()
  listenMock.mockReset()
  listenMock.mockResolvedValue(() => {})
})

describe('TaskDetail', () => {
  it('mostra plano e implementação completos, sem truncar', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'task_get') return Promise.resolve(task())
      return Promise.reject(new Error(`invoke inesperado: ${cmd}`))
    })

    render(<TaskDetail taskId={1} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText(/Plano completo/)).toBeInTheDocument())
    expect(screen.getByText(/com várias linhas/)).toBeInTheDocument()
    expect(screen.getByText(/Implementação completa/)).toBeInTheDocument()
    expect(screen.getByText(/com detalhes/)).toBeInTheDocument()
  })

  it('excluir pede confirmação antes de chamar task_delete', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'task_get') return Promise.resolve(task())
      return Promise.reject(new Error(`invoke inesperado: ${cmd}`))
    })

    render(<TaskDetail taskId={1} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Excluir')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Excluir'))

    // Ainda não chamou task_delete — só entrou no estado de confirmação.
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === 'task_delete')).toBe(false)
    expect(screen.getByText('Excluir esta tarefa?')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Confirmar'))

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('task_delete', { id: 1 }),
    )
  })

  it('cancelar a confirmação de exclusão não chama task_delete', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'task_get') return Promise.resolve(task())
      return Promise.reject(new Error(`invoke inesperado: ${cmd}`))
    })

    render(<TaskDetail taskId={1} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Excluir')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Excluir'))
    fireEvent.click(screen.getByText('Cancelar'))

    expect(screen.getByText('Excluir')).toBeInTheDocument()
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === 'task_delete')).toBe(false)
  })

  it('tarefa excluída enquanto o detalhe está aberto: fecha e avisa', async () => {
    const onClose = vi.fn()
    let taskGetCalls = 0
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'task_get') {
        taskGetCalls += 1
        // Primeira busca: tarefa existe. Segunda em diante (após o nudge de
        // `task_changed`): já foi excluída em outro lugar.
        if (taskGetCalls === 1) return Promise.resolve(task())
        return Promise.reject(new Error('tarefa não encontrada'))
      }
      return Promise.reject(new Error(`invoke inesperado: ${cmd}`))
    })

    let taskChangedHandler: (() => void) | undefined
    listenMock.mockImplementation((name: string, handler: () => void) => {
      if (name === 'task_changed') taskChangedHandler = handler
      return Promise.resolve(() => {})
    })

    render(<TaskDetail taskId={1} onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Excluir')).toBeInTheDocument())

    // Simula o nudge que chegaria via `task_changed` quando outra janela
    // exclui a tarefa.
    taskChangedHandler?.()

    await waitFor(() => expect(screen.getByText(/foi removida/)).toBeInTheDocument())
    expect(onClose).toHaveBeenCalled()
  })

  it('terminal morto: ação de enviar fica desabilitada, com explicação, não erro no clique', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'task_get') return Promise.resolve(task({ terminalAlive: false }))
      return Promise.reject(new Error(`invoke inesperado: ${cmd}`))
    })

    render(<TaskDetail taskId={1} onClose={() => {}} />)

    const sendButton = await screen.findByText('Enviar ao terminal')
    expect(sendButton).toBeDisabled()
    expect(sendButton).toHaveAttribute('title', 'Terminal de origem não está mais ativo')

    // Desabilitado pelo backend, não por um handler que falharia no
    // clique — nenhuma chamada a `task_send` deveria ter acontecido.
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === 'task_send')).toBe(false)
  })

  it('enviar com terminal vivo chama task_send', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'task_get') return Promise.resolve(task({ terminalAlive: true }))
      if (cmd === 'task_send') return Promise.resolve(undefined)
      return Promise.reject(new Error(`invoke inesperado: ${cmd}`))
    })

    render(<TaskDetail taskId={1} onClose={() => {}} />)

    const sendButton = await screen.findByText('Enviar ao terminal')
    expect(sendButton).not.toBeDisabled()

    fireEvent.click(sendButton)

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('task_send', { id: 1 }))
  })
})
