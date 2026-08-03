// SPEC: task-kanban (KAN-01, KAN-02)

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
 * Ações do card (abrir detalhe, excluir, enviar-ao-terminal) continuam
 * fora daqui — Column já expõe `onOpenTask`/`onDeleteTask`/`onSendTask`
 * como opcionais, e ligá-los é escopo de T6 (KAN-04/KAN-07), não de
 * KAN-01/KAN-02.
 */

import { useCallback, useMemo, useState } from 'react'
import type { Task, TaskStatus } from '../../types/tasks'
import { groupByStatus, STATUS_ORDER, useTaskStore } from './useTaskStore'
import BoardFilters from './BoardFilters'
import Column from './Column'

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

  // Referência estável: `BoardFilters` depende desta função no `useEffect`
  // que a chama, e uma nova função a cada render faria esse efeito
  // reexecutar sem necessidade a cada render de `KanbanBoard`.
  const handleFilteredTasksChange = useCallback((next: Task[]) => {
    setFilteredTasks(next)
  }, [])

  const columns = useMemo(() => groupByStatus(filteredTasks), [filteredTasks])

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
          />
        ))}
      </div>
    </div>
  )
}
