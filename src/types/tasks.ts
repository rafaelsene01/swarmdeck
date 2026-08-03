// SPEC: task-kanban (KAN-01, KAN-04)

/**
 * Contrato de dados do Kanban — espelha `design.md` → Modelos de dados
 * (`.specs/features/task-kanban/design.md`). `Task` é o que `task_list`
 * (`src-tauri/src/commands/tasks.rs`) devolve; `TaskChangedEvent` é o
 * payload que a emissão de `task_changed` deve carregar quando o
 * `KanbanBoard` (T3) assinar o evento.
 */

export type TaskStatus = 'pending' | 'in_progress' | 'in_testing' | 'completed'

export interface ProjectRef {
  id: string
  name: string
  color: string
}

export interface Task {
  id: number
  title: string
  description: string | null
  plan: string | null
  implementation: string | null
  status: TaskStatus
  project: ProjectRef | null
  terminalId: string | null
  /**
   * Calculado a cada `task_list`, a partir do registro de sessões vivas do
   * `TerminalManager` — nunca persistido no banco. Controla se a ação
   * enviar-ao-terminal do card fica habilitada (KAN-04).
   */
  terminalAlive: boolean
  createdAt: number
  updatedAt: number
}

/**
 * Payload do evento `task_changed`, emitido a todas as janelas em toda
 * mutação bem-sucedida de tarefa (`mcp-task-server/design.md`). `task` é
 * `null` quando `op` é `'deleted'`; `previousStatus` só vem preenchido
 * quando `op` é `'moved'`.
 */
export interface TaskChangedEvent {
  op: 'created' | 'updated' | 'moved' | 'deleted'
  task: Task | null
  taskId: number
  previousStatus: TaskStatus | null
}
