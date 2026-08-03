// SPEC: task-kanban (KAN-06)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import BoardFilters from './BoardFilters'
import type { Task } from '../../types/tasks'

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
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

const PROJECT_A = { id: 'p1', name: 'SwarmDeck', color: '#ff0000' }
const PROJECT_B = { id: 'p2', name: 'Website', color: '#00ff00' }

/** Tarefas filtradas da última chamada do callback — falha alto se nunca chamado. */
function lastFilteredTasks(onChange: ReturnType<typeof vi.fn>): Task[] {
  const calls = onChange.mock.calls
  const lastCall = calls[calls.length - 1]
  if (!lastCall) throw new Error('onFilteredTasksChange nunca foi chamado')
  return lastCall[0] as Task[]
}

const TASKS: Task[] = [
  makeTask({
    id: 1,
    title: 'Corrigir bug de scroll',
    description: 'Coluna de teste rola junto com o board',
    status: 'pending',
    project: PROJECT_A,
  }),
  makeTask({
    id: 2,
    title: 'Adicionar dark mode',
    description: 'Tema escuro para o board inteiro',
    status: 'in_progress',
    project: PROJECT_A,
  }),
  makeTask({
    id: 3,
    title: 'Migrar autenticação',
    description: 'Trocar provedor de login',
    status: 'in_testing',
    project: PROJECT_B,
  }),
  makeTask({
    id: 4,
    title: 'Sem projeto nenhum',
    description: 'Tarefa órfã após exclusão de projeto',
    status: 'completed',
    project: null,
  }),
]

describe('BoardFilters', () => {
  it('filtra por projeto: seleciona projeto e mantém só as tarefas dele', () => {
    const onChange = vi.fn()
    render(<BoardFilters tasks={TASKS} onFilteredTasksChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Filtrar por projeto'), {
      target: { value: PROJECT_A.id },
    })

    const filtered = lastFilteredTasks(onChange)
    expect(filtered.map((t) => t.id).sort()).toEqual([1, 2])
  })

  it('recalcula as contagens por fase ao trocar de projeto', () => {
    render(<BoardFilters tasks={TASKS} />)

    // Sem filtro: 1 pending, 1 in_progress, 1 in_testing, 1 completed.
    expect(screen.getByLabelText('Contagem Pendente')).toHaveTextContent('1')
    expect(screen.getByLabelText('Contagem Em andamento')).toHaveTextContent('1')
    expect(screen.getByLabelText('Contagem Em teste')).toHaveTextContent('1')
    expect(screen.getByLabelText('Contagem Concluída')).toHaveTextContent('1')

    fireEvent.change(screen.getByLabelText('Filtrar por projeto'), {
      target: { value: PROJECT_A.id },
    })

    // Só as tarefas de PROJECT_A (pending + in_progress) devem contar agora.
    expect(screen.getByLabelText('Contagem Pendente')).toHaveTextContent('1')
    expect(screen.getByLabelText('Contagem Em andamento')).toHaveTextContent('1')
    expect(screen.getByLabelText('Contagem Em teste')).toHaveTextContent('0')
    expect(screen.getByLabelText('Contagem Concluída')).toHaveTextContent('0')
  })

  it('"Todos os projetos" mantém os chips de projeto visíveis', () => {
    render(<BoardFilters tasks={TASKS} />)

    // Nenhum filtro selecionado ainda ("Todos os projetos" é o padrão).
    const chips = screen.getByLabelText('Projetos no board')
    expect(chips).toBeInTheDocument()
    expect(within(chips).getByText(PROJECT_A.name)).toBeInTheDocument()
    expect(within(chips).getByText(PROJECT_B.name)).toBeInTheDocument()

    // Ao escolher um projeto específico, os chips somem.
    fireEvent.change(screen.getByLabelText('Filtrar por projeto'), {
      target: { value: PROJECT_A.id },
    })
    expect(screen.queryByLabelText('Projetos no board')).not.toBeInTheDocument()

    // Voltando para "Todos os projetos", os chips reaparecem.
    fireEvent.change(screen.getByLabelText('Filtrar por projeto'), { target: { value: '' } })
    expect(screen.getByLabelText('Projetos no board')).toBeInTheDocument()
  })

  it('busca filtra por título e descrição, incrementalmente, em todas as colunas', () => {
    const onChange = vi.fn()
    render(<BoardFilters tasks={TASKS} onFilteredTasksChange={onChange} />)

    const search = screen.getByLabelText('Buscar tarefas')

    // "board" aparece na descrição de duas tarefas em fases diferentes.
    fireEvent.change(search, { target: { value: 'board' } })
    expect(
      lastFilteredTasks(onChange)
        .map((t) => t.id)
        .sort(),
    ).toEqual([1, 2])

    // Refinando o termo (incremental): só uma das duas continua batendo.
    fireEvent.change(search, { target: { value: 'board inteiro' } })
    expect(lastFilteredTasks(onChange).map((t) => t.id)).toEqual([2])

    // Também casa pelo título, não só pela descrição.
    fireEvent.change(search, { target: { value: 'autenticação' } })
    expect(lastFilteredTasks(onChange).map((t) => t.id)).toEqual([3])
  })

  it('busca sem resultado mostra estado vazio com o termo buscado', () => {
    render(<BoardFilters tasks={TASKS} />)

    fireEvent.change(screen.getByLabelText('Buscar tarefas'), {
      target: { value: 'xyz-inexistente' },
    })

    expect(screen.getByText('Nenhuma tarefa encontrada para "xyz-inexistente"')).toBeInTheDocument()
  })
})
