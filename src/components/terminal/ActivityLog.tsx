// SPEC: terminal-statuses (STAT-05, STAT-06)

export interface ActivityEntry {
  /** Texto da atividade reportada pelo agente. */
  activity: string
  /** Instante em que a atividade foi registrada, em segundos desde a epoch Unix. */
  createdAt: number
}

export interface ActivityLogProps {
  /**
   * Entradas de atividade em QUALQUER ordem de chegada — o componente
   * ordena internamente (mais recente primeiro) antes de exibir, então o
   * chamador não precisa pré-ordenar. O corte de 200 entradas já é feito
   * pelo backend (`terminal::meta::push_activity`); este componente só
   * renderiza o que recebe.
   */
  entries: ActivityEntry[]
}

/** Formata um timestamp Unix (segundos) como `HH:MM:SS`, no fuso local. */
export function formatActivityTime(createdAt: number): string {
  const date = new Date(createdAt * 1000)
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Ordena as entradas por horário decrescente (mais recente primeiro). */
export function sortByMostRecent(entries: ActivityEntry[]): ActivityEntry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Log de atividade do terminal — puramente apresentacional (STAT-05,
 * STAT-06). Expõe a atividade mais recente via `title` no contêiner (para
 * o hover do terminal mostrá-la, critério 3 de "Título geral vs
 * atividade") e lista todas as entradas em ordem cronológica inversa, com
 * horário (critério 4).
 */
export default function ActivityLog({ entries }: ActivityLogProps) {
  const sorted = sortByMostRecent(entries)
  const latest = sorted[0]

  return (
    <div className="activity-log" title={latest?.activity ?? undefined}>
      <ul className="activity-log__list">
        {sorted.map((entry, index) => (
          <li key={`${entry.createdAt}-${index}`} className="activity-log__entry">
            <time className="activity-log__time">{formatActivityTime(entry.createdAt)}</time>
            <span className="activity-log__activity">{entry.activity}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
