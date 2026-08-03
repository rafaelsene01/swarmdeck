// SPEC: task-kanban (KAN-01)

import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Column, { sortTasksByDate } from './Column'
import type { Task } from '../../types/tasks'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Tarefa de teste',
    description: null,
    plan: null,
    implementation: null,
    status: 'pending',
    project: null,
    terminalId: null,
    terminalAlive: false,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  }
}

describe('sortTasksByDate', () => {
  const tasks = [
    makeTask({ id: 1, createdAt: 100 }),
    makeTask({ id: 2, createdAt: 300 }),
    makeTask({ id: 3, createdAt: 200 }),
  ]

  it('modo "newest" mostra a mais recente primeiro', () => {
    const result = sortTasksByDate(tasks, 'newest')
    expect(result.map((t) => t.id)).toEqual([2, 3, 1])
  })

  it('modo "oldest" mostra a mais antiga primeiro', () => {
    const result = sortTasksByDate(tasks, 'oldest')
    expect(result.map((t) => t.id)).toEqual([1, 3, 2])
  })
})

describe('Column', () => {
  it('mostra a contagem de tarefas em um badge no cabeçalho', () => {
    const tasks = [makeTask({ id: 1 }), makeTask({ id: 2 }), makeTask({ id: 3 })]

    render(<Column status="in_progress" label="In Progress" tasks={tasks} emptyLabel="Vazio" />)

    expect(screen.getByLabelText('3 tarefas')).toHaveTextContent('3')
  })

  it('mostra o estado vazio específico da fase quando não há tarefas', () => {
    render(
      <Column
        status="in_testing"
        label="In Testing"
        tasks={[]}
        emptyLabel="Nenhuma tarefa em teste"
      />,
    )

    expect(screen.getByText('Nenhuma tarefa em teste')).toBeInTheDocument()
    expect(screen.getByLabelText('0 tarefas')).toBeInTheDocument()
  })

  it('clicar em ordenar alterna a ordem dos cards exibidos', () => {
    const tasks = [
      makeTask({ id: 1, title: 'Primeira', createdAt: 100 }),
      makeTask({ id: 2, title: 'Segunda', createdAt: 300 }),
      makeTask({ id: 3, title: 'Terceira', createdAt: 200 }),
    ]

    render(<Column status="pending" label="Pending" tasks={tasks} emptyLabel="Vazio" />)

    // Padrão: mais recente primeiro (id 2, createdAt 300).
    let cards = screen.getAllByRole('article')
    expect(cards[0]).toHaveAttribute('data-task-id', '2')

    fireEvent.click(screen.getByRole('button', { name: /ordenar/i }))

    cards = screen.getAllByRole('article')
    expect(cards[0]).toHaveAttribute('data-task-id', '1')
    expect(cards[2]).toHaveAttribute('data-task-id', '2')
  })

  it('lembra a ordenação escolhida quando a lista de tarefas muda', () => {
    const tasks = [
      makeTask({ id: 1, title: 'Primeira', createdAt: 100 }),
      makeTask({ id: 2, title: 'Segunda', createdAt: 300 }),
    ]

    const { rerender } = render(
      <Column status="pending" label="Pending" tasks={tasks} emptyLabel="Vazio" />,
    )

    fireEvent.click(screen.getByRole('button', { name: /ordenar/i }))
    // Agora em modo "oldest": id 1 primeiro.
    expect(screen.getAllByRole('article')[0]).toHaveAttribute('data-task-id', '1')

    // Uma nova tarefa chega via prop (ex.: evento `task_changed`) — o
    // componente não é remontado, então o modo escolhido deve persistir.
    const withNewTask = [...tasks, makeTask({ id: 3, title: 'Terceira', createdAt: 50 })]
    rerender(<Column status="pending" label="Pending" tasks={withNewTask} emptyLabel="Vazio" />)

    const cards = screen.getAllByRole('article')
    expect(cards.map((c) => c.getAttribute('data-task-id'))).toEqual(['3', '1', '2'])
  })
})
