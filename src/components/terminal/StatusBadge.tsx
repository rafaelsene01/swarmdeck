// SPEC: terminal-statuses (STAT-01)

/** Comprimento máximo do rótulo visível antes de truncar (STAT-01, caso de borda "rótulo longo demais"). */
export const STATUS_BADGE_MAX_LABEL_LENGTH = 24

/**
 * Trunca o rótulo do badge preservando o início — o texto completo continua
 * disponível via `title` (hover nativo do navegador), como o caso de borda
 * da spec exige.
 */
export function truncateLabel(
  label: string,
  maxLength: number = STATUS_BADGE_MAX_LABEL_LENGTH,
): string {
  if (label.length <= maxLength) return label
  return `${label.slice(0, maxLength - 1)}…`
}

export interface StatusBadgeProps {
  /** Rótulo do status ativo — `null`/`undefined` quando nenhum status está definido. */
  label?: string | null
  /** Cor do status (hex ou CSS color), aplicada como background do badge. */
  color?: string | null
}

/**
 * Badge de status do terminal — puramente apresentacional (STAT-01). Sem
 * `label`, não renderiza nada: o terminal fica sem badge, nunca com um
 * status inventado (critério 2). Não lê nenhum contexto e não depende de
 * nenhuma classe CSS de um ancestral específico, então pode ser montado
 * tanto no header expandido quanto na barra compacta de um terminal
 * minimizado (critério 5) — a decisão de ONDE montá-lo é de outra task.
 */
export default function StatusBadge({ label, color }: StatusBadgeProps) {
  if (!label) return null

  return (
    <span
      className="status-badge"
      style={{ backgroundColor: color ?? undefined }}
      title={label}
    >
      {truncateLabel(label)}
    </span>
  )
}
