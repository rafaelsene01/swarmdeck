// SPEC: task-kanban (KAN-01, KAN-03)

import { useMemo, useState, type ReactNode } from 'react'
import type { Task, TaskStatus } from '../../types/tasks'
import TaskCard from './TaskCard'

export type SortMode = 'newest' | 'oldest'

/**
 * Ordena tarefas por `createdAt`. `newest` (padrão) mostra as mais
 * recentes primeiro — é o que mais importa para acompanhar o que os
 * agentes acabaram de tocar.
 */
export function sortTasksByDate(tasks: Task[], mode: SortMode): Task[] {
  const sorted = [...tasks].sort((a, b) => a.createdAt - b.createdAt)
  return mode === 'newest' ? sorted.reverse() : sorted
}

export interface ColumnProps {
  /** Fase representada por esta coluna — só vira `data-status`, o rótulo
   * visível vem de `label`. */
  status: TaskStatus
  /** Nome exibido no cabeçalho (ex.: "In Testing"). */
  label: string
  /** Ícone opcional exibido antes do nome. */
  icon?: ReactNode
  tasks: Task[]
  /** Mensagem do estado vazio, específica da fase (ex.: "Nenhuma tarefa
   * em teste") — decidida por quem monta as 4 colunas (`KanbanBoard`, T3),
   * não por este componente (KAN-01, critério 3). */
  emptyLabel: string
  onOpenTask?: (task: Task) => void
  onDeleteTask?: (task: Task) => void
  onSendTask?: (task: Task) => void
}

/**
 * Uma fase do board: cabeçalho com contagem e ordenação, lista de cards com
 * rolagem própria — caso de borda da spec: uma coluna cheia não pode
 * empurrar ou rolar as outras.
 *
 * A ordenação escolhida fica em **estado local do componente** (decisão
 * desta task): KAN-01 critério 5 pede que ela seja "lembrada", e como as 4
 * colunas do board são fixas e nunca desmontadas enquanto o board está
 * aberto (`design.md` → Decisões técnicas), estado local sobrevive por
 * toda a sessão sem precisar subir para `useTaskStore` (T3). Não persiste
 * entre reinícios do app — se isso vier a ser exigido, é decisão de
 * produto para outra task.
 */
export default function Column({
  status,
  label,
  icon,
  tasks,
  emptyLabel,
  onOpenTask,
  onDeleteTask,
  onSendTask,
}: ColumnProps) {
  const [sortMode, setSortMode] = useState<SortMode>('newest')

  const sortedTasks = useMemo(() => sortTasksByDate(tasks, sortMode), [tasks, sortMode])

  const toggleSort = () => setSortMode((prev) => (prev === 'newest' ? 'oldest' : 'newest'))

  return (
    <div
      className="kanban-column"
      data-status={status}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      <div
        className="kanban-column__header"
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '0 0 auto' }}
      >
        {icon !== undefined && (
          <span className="kanban-column__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="kanban-column__label">{label}</span>
        <span className="kanban-column__count" aria-label={`${tasks.length} tarefas`}>
          {tasks.length}
        </span>
        <button
          type="button"
          className="kanban-column__sort"
          onClick={toggleSort}
          aria-label={
            sortMode === 'newest' ? 'Ordenar por mais antigas' : 'Ordenar por mais recentes'
          }
          title={sortMode === 'newest' ? 'Mais recentes primeiro' : 'Mais antigas primeiro'}
        >
          {sortMode === 'newest' ? '↓' : '↑'}
        </button>
      </div>

      <div
        className="kanban-column__body"
        style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}
      >
        {tasks.length === 0 ? (
          <p className="kanban-column__empty">{emptyLabel}</p>
        ) : (
          <ul
            className="kanban-column__list"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {sortedTasks.map((task) => (
              <li key={task.id}>
                <TaskCard
                  task={task}
                  onOpen={onOpenTask}
                  onDelete={onDeleteTask}
                  onSend={onSendTask}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
