// SPEC: task-kanban (KAN-01, KAN-02)

/**
 * Estado normalizado do board Kanban — espelha o padrão de
 * `src/state/terminals.ts`: funções puras de transição operando sobre uma
 * estrutura normalizada, e um hook fino por cima que liga o ciclo de vida
 * do React (mount/unmount) a essas funções.
 *
 * Sincronização (`design.md` → Arquitetura): o board carrega o estado uma
 * vez no mount via `task_list` e depois só reage ao evento `task_changed`
 * (`listen`, `@tauri-apps/api/event`). Nunca há um segundo `task_list` nem
 * polling — cada `created`/`updated`/`moved`/`deleted` é aplicado como
 * delta ao `Map<TaskId, Task>` por `applyTaskChangedEvent`. As colunas
 * nunca são armazenadas: `groupByStatus` deriva-as do `Map` sob demanda
 * (ver `KanbanBoard.tsx`, que a chama dentro de `useMemo`).
 */

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Task, TaskChangedEvent, TaskStatus } from '../../types/tasks'

/** Ordem fixa das 4 colunas do board (KAN-01, critério 1). */
export const STATUS_ORDER: TaskStatus[] = ['pending', 'in_progress', 'in_testing', 'completed']

/** Resultado de aplicar um `TaskChangedEvent` ao `Map` normalizado. */
export interface ApplyEventResult {
  /** Nova instância do `Map` — nunca muta a recebida (mesma disciplina de
   * `src/state/terminals.ts`, que sempre devolve um array novo). */
  tasks: Map<number, Task>
  /**
   * Id de uma tarefa que o evento referencia mas que o `Map` local ainda
   * não conhece — sinal para o chamador disparar a busca pontual
   * (`task_get`). `null` quando nenhuma busca é necessária.
   */
  fetchId: number | null
}

/**
 * Aplica um `TaskChangedEvent` como delta — nunca recarrega o `Map`
 * inteiro. As quatro operações do contrato (`created`/`updated`/`moved`/
 * `deleted`) mapeiam para uma escrita pontual por `id`, o que também é o
 * que garante a borda "duas transições concorrentes": como a chave é o
 * `id` da tarefa, aplicar dois eventos em sequência para o mesmo `id`
 * nunca duplica a entrada — o segundo `set` apenas sobrescreve o primeiro,
 * e a última transição válida vence.
 *
 * `updated`/`moved` para um `taskId` que o `Map` local não conhece ainda
 * (ex.: o cliente perdeu o `created` correspondente por reconexão da
 * janela) não insere o payload do evento diretamente — devolve `fetchId`
 * para o chamador buscar o registro completo e atual via `task_get`, em
 * vez de confiar num snapshot que pode já estar desatualizado.
 */
export function applyTaskChangedEvent(
  tasks: Map<number, Task>,
  event: TaskChangedEvent,
): ApplyEventResult {
  switch (event.op) {
    case 'deleted': {
      if (!tasks.has(event.taskId)) return { tasks, fetchId: null }
      const next = new Map(tasks)
      next.delete(event.taskId)
      return { tasks: next, fetchId: null }
    }

    case 'created': {
      if (!event.task) return { tasks, fetchId: null }
      const next = new Map(tasks)
      next.set(event.task.id, event.task)
      return { tasks: next, fetchId: null }
    }

    case 'updated':
    case 'moved': {
      if (!event.task) return { tasks, fetchId: null }
      if (!tasks.has(event.taskId)) {
        return { tasks, fetchId: event.taskId }
      }
      const next = new Map(tasks)
      next.set(event.task.id, event.task)
      return { tasks: next, fetchId: null }
    }
  }
}

/** Agrupa o `Map` normalizado nas 4 colunas fixas — chamar dentro de
 * `useMemo` no componente, nunca guardar o resultado em `useState` próprio
 * (KAN-01/KAN-02: colunas são sempre derivadas, nunca uma cópia do estado). */
export function groupByStatus(tasks: Map<number, Task> | Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = {
    pending: [],
    in_progress: [],
    in_testing: [],
    completed: [],
  }
  const list = tasks instanceof Map ? tasks.values() : tasks
  for (const task of list) {
    groups[task.status].push(task)
  }
  return groups
}

export interface UseTaskStoreResult {
  /** `Map<TaskId, Task>` normalizado — único estado próprio do store. */
  tasks: Map<number, Task>
  /** `true` até a primeira resposta de `task_list` chegar. */
  loading: boolean
}

/**
 * Hook raiz do board: carrega `task_list` uma vez no mount e assina
 * `task_changed` pelo resto do ciclo de vida do componente. Nenhum
 * `setInterval`/segundo `task_list` — a única fonte de atualização após o
 * mount é o evento.
 */
export function useTaskStore(): UseTaskStoreResult {
  const [tasks, setTasks] = useState<Map<number, Task>>(() => new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    invoke<Task[]>('task_list')
      .then((list) => {
        if (cancelled) return
        setTasks(new Map(list.map((task) => [task.id, task])))
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })

    const unlistenPromise = listen<TaskChangedEvent>('task_changed', (event) => {
      setTasks((prev) => {
        const { tasks: next, fetchId } = applyTaskChangedEvent(prev, event.payload)

        if (fetchId !== null) {
          // DESVIO: `task_get` ainda não existe no backend — T2 (nesta run)
          // só implementou `task_list`. Assumimos aqui a assinatura mais
          // óbvia dado o padrão de `task_list` em
          // `src-tauri/src/commands/tasks.rs`: comando `task_get`, argumento
          // `{ id: number }`, devolvendo um `Task` (mesmo DTO de `task_list`,
          // já em `camelCase`). Se o backend nomear diferente, só esta
          // chamada precisa mudar.
          invoke<Task>('task_get', { id: fetchId })
            .then((task) => {
              if (cancelled) return
              setTasks((current) => {
                const merged = new Map(current)
                merged.set(task.id, task)
                return merged
              })
            })
            .catch(() => {
              // A tarefa pode ter sido excluída entre o evento e a busca —
              // não há o que reconciliar, e a UI já não a mostra.
            })
        }

        return next
      })
    })

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  return { tasks, loading }
}
