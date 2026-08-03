// SPEC: task-kanban (KAN-03)

import type { Task } from '../../types/tasks'

/** Além deste tamanho a descrição é cortada com reticências (KAN-03, critério 2). */
export const DESCRIPTION_MAX_LENGTH = 140

/**
 * Trunca a descrição no limite de caracteres, preservando o início — mesmo
 * padrão de `truncatePath` (`ProjectsPanel.tsx`) e `truncateLabel`
 * (`StatusBadge.tsx`): função pura testável isoladamente. O texto completo
 * continua disponível via `title` no elemento que a renderiza.
 */
export function truncateDescription(
  description: string | null,
  maxLength: number = DESCRIPTION_MAX_LENGTH,
): string {
  if (!description) return ''
  if (description.length <= maxLength) return description
  return `${description.slice(0, maxLength).trimEnd()}…`
}

/**
 * Data de criação no formato `DD/MM/AAAA`, no fuso local. `createdAt` chega
 * em segundos desde a epoch Unix — mesma convenção de `formatActivityTime`
 * em `ActivityLog.tsx` (`now_unix()` no backend, `src-tauri/src/tasks/service.rs`).
 */
export function formatCardDate(createdAt: number): string {
  const date = new Date(createdAt * 1000)
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

export interface TaskCardProps {
  task: Task
  /** Abre o detalhe completo (plano/implementação) — ligado por T6. */
  onOpen?: (task: Task) => void
  /** Dispara a exclusão diretamente: este componente não pede confirmação
   * — essa responsabilidade é de quem monta a ação (T6, `tasks.md`), para
   * não duplicar a UX de confirmação em dois lugares. */
  onDelete?: (task: Task) => void
  /** Injeta o contexto da tarefa no terminal de origem — desabilitado
   * quando `task.terminalAlive` é falso (KAN-03, critério 6). */
  onSend?: (task: Task) => void
}

/**
 * Card compacto de tarefa (KAN-03, critério 1) — puramente apresentacional,
 * mesmo padrão de `StatusBadge`/`ActivityLog`: recebe dados prontos via
 * props, não busca nada e não chama `invoke`.
 *
 * Título: quebra em até 3 linhas e trunca via `-webkit-line-clamp` (caso de
 * borda da spec) — o texto completo permanece no DOM (nunca cortado em
 * JS), então título integral continua acessível a leitor de tela e busca
 * do navegador. Descrição: truncamento em JS (`truncateDescription`)
 * porque o critério pede reticências a partir de um limite de caracteres,
 * não de linhas — o texto completo fica disponível via `title` no hover.
 */
export default function TaskCard({ task, onOpen, onDelete, onSend }: TaskCardProps) {
  const truncatedDescription = truncateDescription(task.description)
  const sendDisabled = !task.terminalAlive

  return (
    <article className="task-card" data-task-id={task.id}>
      <div
        className="task-card__meta"
        style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
      >
        {task.project && (
          <span
            className="task-card__project-chip"
            style={{
              display: 'inline-block',
              width: '0.625rem',
              height: '0.625rem',
              borderRadius: '50%',
              backgroundColor: task.project.color,
            }}
            title={task.project.name}
            aria-label={task.project.name}
          />
        )}
        <span className="task-card__number">#{task.id}</span>
      </div>

      <h3
        className="task-card__title"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          margin: '0.25rem 0',
        }}
      >
        {task.title}
      </h3>

      {truncatedDescription && (
        <p className="task-card__description" title={task.description ?? undefined}>
          {truncatedDescription}
        </p>
      )}

      <div
        className="task-card__footer"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <time className="task-card__date">{formatCardDate(task.createdAt)}</time>

        <div className="task-card__actions">
          <button type="button" onClick={() => onOpen?.(task)}>
            Abrir
          </button>
          <button
            type="button"
            onClick={() => onSend?.(task)}
            disabled={sendDisabled}
            title={sendDisabled ? 'Terminal de origem não está mais ativo' : undefined}
          >
            Enviar
          </button>
          <button type="button" onClick={() => onDelete?.(task)}>
            Excluir
          </button>
        </div>
      </div>
    </article>
  )
}
