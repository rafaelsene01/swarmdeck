// SPEC: task-kanban (KAN-01, KAN-02, KAN-03, KAN-04)

/**
 * Raiz do board Kanban. Possui o único estado real (`useTaskStore`,
 * `Map<TaskId, Task>` normalizado) e deriva as 4 colunas fixas por
 * `useMemo` — nunca em `useState` próprio (KAN-01 critério 1, KAN-02).
 *
 * `BoardFilters` (T5, `./BoardFilters.tsx`) já existe nesta run e é
 * puramente presentacional: recebe `tasks` prontas e notifica o resultado
 * filtrado via `onFilteredTasksChange`, então plugá-lo aqui é só guardar
 * esse resultado num `useState` local e derivar as colunas dele em vez do
 * `Map` bruto quando o usuário estiver filtrando.
 *
 * `Column` (T4, `./Column.tsx`) também já existe nesta run — sua interface
 * real (`ColumnProps`) difere do rascunho de `design.md`: `sort` não é
 * prop (a ordenação escolhida é estado local do próprio `Column`, ver o
 * comentário lá), e `label`/`emptyLabel` **são** obrigatórios e ficam a
 * cargo de quem monta as 4 colunas — exatamente esta task (comentário de
 * `Column.tsx`: "decidida por quem monta as 4 colunas (KanbanBoard, T3)").
 *
 * T7 (triagem 006): as ações do card (abrir detalhe, excluir,
 * enviar-ao-terminal) ficaram sem dono depois de T3/T6 — `Column`/`TaskCard`
 * já expunham `onOpenTask`/`onDeleteTask`/`onSendTask`, mas nada aqui os
 * repassava, e nenhum outro arquivo montava `TaskDetail` dentro do board.
 * Esta task fecha isso: `onOpenTask` guarda o id selecionado e monta
 * `TaskDetail`; `onDeleteTask` pede confirmação (mesmo padrão de
 * `TerminalHeader.tsx`'s `window.confirm`, já que `TaskCard` deliberadamente
 * não confirma sozinho) e chama `task_delete`; `onSendTask` chama
 * `task_send` diretamente — os dois comandos já existem e são testados em
 * `src-tauri/src/commands/tasks.rs`/`tasks::send`.
 */

import { useCallback, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Task, TaskStatus } from '../../types/tasks'
import { groupByStatus, STATUS_ORDER, useTaskStore } from './useTaskStore'
import BoardFilters from './BoardFilters'
import Column from './Column'
import TaskDetail from './TaskDetail'

const COLUMN_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  in_testing: 'In Testing',
  completed: 'Completed',
}

/** Caso de borda da spec: board sem tarefa nenhuma ainda mostra as 4
 * colunas com estado vazio específico por fase, nunca tela em branco. */
const COLUMN_EMPTY_LABEL: Record<TaskStatus, string> = {
  pending: 'Nenhuma tarefa pendente',
  in_progress: 'Nenhuma tarefa em andamento',
  in_testing: 'Nenhuma tarefa em teste',
  completed: 'Nenhuma tarefa concluída',
}

export default function KanbanBoard() {
  const { tasks } = useTaskStore()

  const allTasks = useMemo(() => [...tasks.values()], [tasks])
  const [filteredTasks, setFilteredTasks] = useState<Task[]>(allTasks)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

  // Referência estável: `BoardFilters` depende desta função no `useEffect`
  // que a chama, e uma nova função a cada render faria esse efeito
  // reexecutar sem necessidade a cada render de `KanbanBoard`.
  const handleFilteredTasksChange = useCallback((next: Task[]) => {
    setFilteredTasks(next)
  }, [])

  const columns = useMemo(() => groupByStatus(filteredTasks), [filteredTasks])

  const handleOpenTask = useCallback((task: Task) => {
    setSelectedTaskId(task.id)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null)
  }, [])

  // KAN-03 critério 4: `TaskCard` dispara a exclusão direto (não confirma
  // sozinho — ver o comentário de `TaskCard.tsx`), então a confirmação mora
  // aqui, no mesmo padrão de `TerminalHeader.tsx`'s `window.confirm`.
  const handleDeleteTask = useCallback((task: Task) => {
    const confirmado = window.confirm(`Excluir a tarefa #${task.id} "${task.title}"?`)
    if (!confirmado) return
    invoke('task_delete', { id: task.id }).catch(() => {
      // `task_changed` (evento `deleted`) já reconcilia a UI em caso de
      // sucesso; uma falha aqui não deixa a tarefa num estado incoerente —
      // ela simplesmente continua visível.
    })
  }, [])

  // KAN-04 critério 5: injeta o contexto no terminal de origem e foca a
  // janela principal — ambos já feitos por `task_send`
  // (`src-tauri/src/commands/tasks.rs`, delegando a `tasks::send::send`).
  const handleSendTask = useCallback((task: Task) => {
    invoke('task_send', { id: task.id }).catch(() => {
      // Mesmo tratamento silencioso de `TaskDetail.tsx`'s `handleSend` para
      // o card compacto: o botão já fica desabilitado quando
      // `terminalAlive` é falso, então uma falha aqui é a corrida "morreu
      // entre o render e o clique" (`design.md` → Tratamento de erros).
    })
  }, [])

  return (
    <div className="kanban-board">
      <BoardFilters tasks={allTasks} onFilteredTasksChange={handleFilteredTasksChange} />

      <div className="kanban-board__columns">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            label={COLUMN_LABEL[status]}
            emptyLabel={COLUMN_EMPTY_LABEL[status]}
            tasks={columns[status]}
            onOpenTask={handleOpenTask}
            onDeleteTask={handleDeleteTask}
            onSendTask={handleSendTask}
          />
        ))}
      </div>

      {selectedTaskId !== null && (
        <TaskDetail taskId={selectedTaskId} onClose={handleCloseDetail} />
      )}
    </div>
  )
}
