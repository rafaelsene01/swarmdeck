// SPEC: task-kanban (KAN-01, KAN-02)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Task, TaskChangedEvent } from '../../types/tasks'
import { groupByStatus, useTaskStore } from './useTaskStore'

// `vi.mock` é hoisted para o topo do arquivo pelo transform do Vitest — as
// variáveis que os factories abaixo referenciam precisam vir de
// `vi.hoisted` para sobreviver a esse hoisting (referenciar um `const`
// comum aqui lançaria "Cannot access before initialization").
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
    title: 'Tarefa',
    description: null,
    plan: null,
    implementation: null,
    status: 'pending',
    project: null,
    terminalId: null,
    terminalAlive: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

/** Captura o callback passado a `listen('task_changed', cb)` — é o que os
 * testes usam para simular o backend emitindo o evento via `emit`. */
function getEventHandler(): (event: { payload: TaskChangedEvent }) => void {
  const call = listenMock.mock.calls.find(([name]) => name === 'task_changed')
  if (!call) throw new Error('listen("task_changed", ...) não foi chamado')
  return call[1] as (event: { payload: TaskChangedEvent }) => void
}

beforeEach(() => {
  invokeMock.mockReset()
  listenMock.mockReset()
  listenMock.mockResolvedValue(() => {})
})

describe('useTaskStore', () => {
  it('carrega o estado uma vez no mount via task_list, sem polling', async () => {
    const initial = [task({ id: 1 }), task({ id: 2, status: 'in_progress' })]
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'task_list') return Promise.resolve(initial)
      return Promise.reject(new Error(`invoke inesperado: ${cmd}`))
    })

    const { result } = renderHook(() => useTaskStore())

    await waitFor(() => expect(result.current.tasks.size).toBe(2))

    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'task_list')).toHaveLength(1)
  })

  it('created: insere a tarefa nova no Map como delta, sem recarregar tudo', async () => {
    invokeMock.mockResolvedValue([])
    const { result } = renderHook(() => useTaskStore())
    await waitFor(() => expect(listenMock).toHaveBeenCalled())

    const handler = getEventHandler()
    const created = task({ id: 5, title: 'Nova' })

    act(() => {
      handler({ payload: { op: 'created', task: created, taskId: 5, previousStatus: null } })
    })

    expect(result.current.tasks.get(5)?.title).toBe('Nova')
    // "sem recarregar tudo": task_list só foi chamado uma vez, no mount.
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'task_list')).toHaveLength(1)
  })

  it('updated: substitui os campos da tarefa existente como delta', async () => {
    const original = task({ id: 3, title: 'Original' })
    invokeMock.mockResolvedValue([original])
    const { result } = renderHook(() => useTaskStore())
    await waitFor(() => expect(result.current.tasks.size).toBe(1))

    const handler = getEventHandler()
    const updated = { ...original, title: 'Atualizada' }

    act(() => {
      handler({ payload: { op: 'updated', task: updated, taskId: 3, previousStatus: null } })
    })

    expect(result.current.tasks.get(3)?.title).toBe('Atualizada')
    expect(result.current.tasks.size).toBe(1)
  })

  it('moved: a tarefa migra de coluna nas colunas derivadas do Map', async () => {
    const original = task({ id: 4, status: 'pending' })
    invokeMock.mockResolvedValue([original])
    const { result } = renderHook(() => useTaskStore())
    await waitFor(() => expect(result.current.tasks.size).toBe(1))

    expect(groupByStatus(result.current.tasks).pending).toHaveLength(1)
    expect(groupByStatus(result.current.tasks).in_progress).toHaveLength(0)

    const handler = getEventHandler()
    const moved = { ...original, status: 'in_progress' as const }

    act(() => {
      handler({ payload: { op: 'moved', task: moved, taskId: 4, previousStatus: 'pending' } })
    })

    const columns = groupByStatus(result.current.tasks)
    expect(columns.pending).toHaveLength(0)
    expect(columns.in_progress).toHaveLength(1)
    expect(columns.in_progress[0]?.id).toBe(4)
  })

  it('deleted: remove a tarefa do Map', async () => {
    const original = task({ id: 6 })
    invokeMock.mockResolvedValue([original])
    const { result } = renderHook(() => useTaskStore())
    await waitFor(() => expect(result.current.tasks.size).toBe(1))

    const handler = getEventHandler()

    act(() => {
      handler({ payload: { op: 'deleted', task: null, taskId: 6, previousStatus: null } })
    })

    expect(result.current.tasks.has(6)).toBe(false)
    expect(result.current.tasks.size).toBe(0)
  })

  it('evento para tarefa desconhecida dispara task_get pontual e mescla o resultado', async () => {
    invokeMock.mockImplementation((cmd: string, args?: { id: number }) => {
      if (cmd === 'task_list') return Promise.resolve([])
      if (cmd === 'task_get') return Promise.resolve(task({ id: args!.id, title: 'Buscada' }))
      return Promise.reject(new Error(`invoke inesperado: ${cmd}`))
    })

    const { result } = renderHook(() => useTaskStore())
    await waitFor(() => expect(listenMock).toHaveBeenCalled())

    const handler = getEventHandler()

    act(() => {
      handler({
        payload: { op: 'updated', task: task({ id: 9, title: 'Do evento' }), taskId: 9, previousStatus: null },
      })
    })

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('task_get', { id: 9 }))
    // O merge vem da busca pontual (`task_get`), não do snapshot do evento —
    // prova que o caminho de "tarefa desconhecida" realmente busca, em vez
    // de só inserir o payload do evento direto.
    await waitFor(() => expect(result.current.tasks.get(9)?.title).toBe('Buscada'))
  })

  it('duas transições concorrentes para a mesma tarefa convergem sem duplicar o card', async () => {
    const original = task({ id: 7, status: 'pending' })
    invokeMock.mockResolvedValue([original])
    const { result } = renderHook(() => useTaskStore())
    await waitFor(() => expect(result.current.tasks.size).toBe(1))

    const handler = getEventHandler()

    act(() => {
      handler({
        payload: {
          op: 'moved',
          task: { ...original, status: 'in_progress' },
          taskId: 7,
          previousStatus: 'pending',
        },
      })
      handler({
        payload: {
          op: 'moved',
          task: { ...original, status: 'in_testing' },
          taskId: 7,
          previousStatus: 'in_progress',
        },
      })
    })

    expect(result.current.tasks.size).toBe(1)
    expect(result.current.tasks.get(7)?.status).toBe('in_testing')

    const columns = groupByStatus(result.current.tasks)
    expect(columns.pending).toHaveLength(0)
    expect(columns.in_progress).toHaveLength(0)
    expect(columns.in_testing).toHaveLength(1)
  })
})
