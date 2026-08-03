// SPEC: task-kanban (KAN-06)

import { useEffect, useMemo, useState } from 'react'
import type { ProjectRef, Task, TaskStatus } from '../../types/tasks'

/** Contagem de tarefas filtradas por fase — mesmas chaves de `TaskStatus`. */
export type BoardFilterCounts = Record<TaskStatus, number>

const EMPTY_COUNTS: BoardFilterCounts = {
  pending: 0,
  in_progress: 0,
  in_testing: 0,
  completed: 0,
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  in_testing: 'Em teste',
  completed: 'Concluída',
}

const STATUS_ORDER: TaskStatus[] = ['pending', 'in_progress', 'in_testing', 'completed']

export interface UseBoardFiltersResult {
  /** `null` representa "Todos os projetos" (requisito 2). */
  projectId: string | null
  setProjectId: (projectId: string | null) => void
  query: string
  setQuery: (query: string) => void
  /** Projetos distintos presentes em `tasks`, ordenados por nome. */
  projects: ProjectRef[]
  filteredTasks: Task[]
  counts: BoardFilterCounts
}

/**
 * Projetos distintos presentes nas tarefas carregadas — o filtro só precisa
 * oferecer projetos que de fato têm tarefa no board, não o catálogo inteiro.
 */
function distinctProjects(tasks: Task[]): ProjectRef[] {
  const byId = new Map<string, ProjectRef>()
  for (const task of tasks) {
    if (task.project && !byId.has(task.project.id)) {
      byId.set(task.project.id, task.project)
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Título OU descrição, sem diferenciar maiúsculas/minúsculas (requisito 3). */
function matchesQuery(task: Task, needle: string): boolean {
  if (!needle) return true
  return (
    task.title.toLowerCase().includes(needle) ||
    (task.description ?? '').toLowerCase().includes(needle)
  )
}

function countByStatus(tasks: Task[]): BoardFilterCounts {
  const counts: BoardFilterCounts = { ...EMPTY_COUNTS }
  for (const task of tasks) {
    counts[task.status] += 1
  }
  return counts
}

/**
 * Estado e derivação do filtro de projeto + busca (KAN-06). Puramente
 * local — não lê `useTaskStore` (T3): recebe `tasks` já carregadas e
 * devolve a lista filtrada e as contagens por fase recalculadas, para quem
 * monta o board de verdade (T6) plugar no estado real via
 * `onFilteredTasksChange`. Reuso de `useTaskStore` não é dependência de
 * execução — ver nota da task.
 */
export function useBoardFilters(tasks: Task[]): UseBoardFiltersResult {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const projects = useMemo(() => distinctProjects(tasks), [tasks])

  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tasks.filter((task) => {
      if (projectId !== null && task.project?.id !== projectId) return false
      return matchesQuery(task, needle)
    })
  }, [tasks, projectId, query])

  const counts = useMemo(() => countByStatus(filteredTasks), [filteredTasks])

  return { projectId, setProjectId, query, setQuery, projects, filteredTasks, counts }
}

export interface BoardFiltersProps {
  tasks: Task[]
  /** Notifica o dono do estado real sempre que o resultado do filtro muda. */
  onFilteredTasksChange?: (tasks: Task[], counts: BoardFilterCounts) => void
}

/**
 * Seletor de projeto e busca textual do board (KAN-06). Presentacional: lê
 * `tasks` de props, não de `useTaskStore` diretamente — quem pluga o store
 * de verdade é T6.
 */
export default function BoardFilters({ tasks, onFilteredTasksChange }: BoardFiltersProps) {
  const { projectId, setProjectId, query, setQuery, projects, filteredTasks, counts } =
    useBoardFilters(tasks)

  useEffect(() => {
    onFilteredTasksChange?.(filteredTasks, counts)
  }, [filteredTasks, counts, onFilteredTasksChange])

  const trimmedQuery = query.trim()
  const showEmptySearchState = trimmedQuery !== '' && filteredTasks.length === 0

  return (
    <div className="board-filters">
      <select
        className="board-filters__project"
        aria-label="Filtrar por projeto"
        value={projectId ?? ''}
        onChange={(event) => setProjectId(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">Todos os projetos</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      <input
        type="search"
        className="board-filters__search"
        placeholder="Buscar por título ou descrição..."
        aria-label="Buscar tarefas"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {projectId === null && projects.length > 0 && (
        <ul className="board-filters__chips" aria-label="Projetos no board">
          {projects.map((project) => (
            <li
              key={project.id}
              className="board-filters__chip"
              style={{ backgroundColor: project.color }}
            >
              {project.name}
            </li>
          ))}
        </ul>
      )}

      <dl className="board-filters__counts" aria-label="Contagem de tarefas por fase">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="board-filters__count">
            <dt>{STATUS_LABELS[status]}</dt>
            <dd aria-label={`Contagem ${STATUS_LABELS[status]}`}>{counts[status]}</dd>
          </div>
        ))}
      </dl>

      {showEmptySearchState && (
        <p className="board-filters__empty" role="status">
          Nenhuma tarefa encontrada para "{trimmedQuery}"
        </p>
      )}
    </div>
  )
}
