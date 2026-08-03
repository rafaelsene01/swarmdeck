// SPEC: task-kanban (KAN-03, KAN-04)

/**
 * Detalhe de uma tarefa (KAN-03, critério 3): plano e implementação
 * completos, ação de excluir com confirmação (critério 4) e ação de
 * enviar-ao-terminal (KAN-04, critério 5), desabilitada quando o backend
 * já reporta o terminal de origem como morto (critério 6).
 *
 * Autossuficiente por desenho: esta task não teve autorização para tocar
 * `KanbanBoard.tsx` (quem montaria `<TaskDetail>` de verdade dentro do
 * board é uma task futura), então o componente busca seus próprios dados
 * via `invoke('task_get', ...)` e se resincroniza sozinho a cada nudge de
 * `task_changed` — mesmo padrão de `useTaskStore.ts` (T3), só que para uma
 * tarefa só em vez do `Map` inteiro.
 *
 * Caso de borda da spec ("tarefa excluída com o detalhe aberto → o detalhe
 * fecha e avisa"): um `task_get` que falha depois de já ter carregado a
 * tarefa é tratado como "foi removida" — não há endpoint separado para
 * distinguir 404 de qualquer outro erro, e `tasks::send`'s
 * `get_apos_delete_retorna_not_found_o_que_fecha_o_detalhe_aberto` (Rust)
 * prova que um `get` depois de `delete` sempre falha, nunca devolve um
 * snapshot obsoleto — então "falhou" aqui é sempre seguro de ler como
 * "sumiu".
 */

import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Task } from '../../types/tasks'

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; task: Task }
  | { status: 'removed' }

export interface TaskDetailProps {
  taskId: number
  /** Chamado tanto ao fechar manualmente quanto quando a tarefa some por
   * ter sido excluída (caso de borda da spec) — o chamador não precisa
   * distinguir os dois casos para desmontar o painel. */
  onClose: () => void
  /** Notificado só na exclusão feita a partir *deste* painel (ação do
   * usuário aqui, já confirmada) — distinto de `onClose`, que também
   * dispara quando a tarefa é excluída em outro lugar enquanto este
   * detalhe está aberto. */
  onDeleted?: (taskId: number) => void
}

export default function TaskDetail({ taskId, onClose, onDeleted }: TaskDetailProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const fetchTask = useCallback(() => {
    invoke<Task>('task_get', { id: taskId })
      .then((task) => setState({ status: 'loaded', task }))
      .catch(() => setState({ status: 'removed' }))
  }, [taskId])

  useEffect(() => {
    setState({ status: 'loading' })
    fetchTask()

    // Nudge — não carrega payload nenhum (`ipc/server.rs::emit_task_changed`
    // hoje emite `task_changed` sem dado), então toda reação a ele passa
    // por rebuscar via `task_get`, nunca por ler `event.payload`.
    const unlistenPromise = listen('task_changed', () => {
      fetchTask()
    })

    return () => {
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [fetchTask])

  // Caso de borda: a tarefa sumiu (excluída daqui ou de outro lugar) —
  // fecha o painel. O aviso ("Esta tarefa foi removida") ainda é
  // renderizado no mesmo frame antes do pai desmontar, para o caso de o
  // fechamento do pai não ser imediato.
  useEffect(() => {
    if (state.status === 'removed') {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  const handleDeleteClick = () => setConfirmingDelete(true)
  const cancelDelete = () => setConfirmingDelete(false)

  const confirmDelete = () => {
    setDeleting(true)
    invoke('task_delete', { id: taskId })
      .then(() => {
        setDeleting(false)
        onDeleted?.(taskId)
        onClose()
      })
      .catch(() => setDeleting(false))
  }

  const handleSend = () => {
    setSendError(null)
    invoke('task_send', { id: taskId }).catch((err) => setSendError(String(err)))
  }

  if (state.status === 'loading') {
    return (
      <div className="task-detail" role="dialog" aria-label="Detalhe da tarefa">
        Carregando…
      </div>
    )
  }

  if (state.status === 'removed') {
    return (
      <div className="task-detail task-detail--removed" role="status">
        Esta tarefa foi removida.
      </div>
    )
  }

  const { task } = state
  const sendDisabled = !task.terminalAlive

  return (
    <div className="task-detail" role="dialog" aria-label={`Detalhe da tarefa #${task.id}`}>
      <div className="task-detail__header">
        <h2 className="task-detail__title">
          #{task.id} {task.title}
        </h2>
        <button type="button" onClick={onClose} aria-label="Fechar detalhe">
          ×
        </button>
      </div>

      {task.description && <p className="task-detail__description">{task.description}</p>}

      <section className="task-detail__section">
        <h3>Plano</h3>
        <pre className="task-detail__plan">{task.plan ?? 'Sem plano registrado.'}</pre>
      </section>

      <section className="task-detail__section">
        <h3>Implementação</h3>
        <pre className="task-detail__implementation">
          {task.implementation ?? 'Sem implementação registrada.'}
        </pre>
      </section>

      <div className="task-detail__actions">
        <button
          type="button"
          onClick={handleSend}
          disabled={sendDisabled}
          title={sendDisabled ? 'Terminal de origem não está mais ativo' : undefined}
        >
          Enviar ao terminal
        </button>

        {!confirmingDelete ? (
          <button type="button" onClick={handleDeleteClick}>
            Excluir
          </button>
        ) : (
          <span
            className="task-detail__confirm-delete"
            role="alertdialog"
            aria-label="Confirmar exclusão"
          >
            <span>Excluir esta tarefa?</span>
            <button type="button" onClick={confirmDelete} disabled={deleting}>
              Confirmar
            </button>
            <button type="button" onClick={cancelDelete} disabled={deleting}>
              Cancelar
            </button>
          </span>
        )}
      </div>

      {sendError && (
        <p role="alert" className="task-detail__send-error">
          {sendError}
        </p>
      )}
    </div>
  )
}
