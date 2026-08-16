// SPEC: quota-indicator (QUOTA-26, QUOTA-27)

/**
 * Marcas dos provedores de agente, desenhadas inline (QUOTA-27). Fonte
 * única para o ícone do anel, o popover do cabeçalho e a lista de
 * Configurações › Geral — os três precisam do mesmo glifo e da mesma cor.
 *
 * São aproximações de traço, não os logos oficiais: o app não embarca
 * arquivo de marca de terceiros.
 */

export interface ProviderMeta {
  /** Nome curto exibido nas listas. */
  name: string
  /** Cor da marca, usada no glifo. */
  color: string
  /** `true` só para quem tem endpoint de cota real hoje (Claude). */
  hasQuota: boolean
  /** Selo curto do popover/lista quando não há cota. */
  badge?: string
  /** Frase do popover explicando por que não há barra de consumo. */
  note?: string
  /** Versão curta da frase acima, para a linha de Configurações. */
  hint?: string
}

/** Chaveado pelo `id` de `agents::catalog::CATALOG` (Rust). */
export const PROVIDER_META: Record<string, ProviderMeta> = {
  'claude-code': { name: 'Claude', color: '#d97757', hasQuota: true },
  'codex-cli': {
    name: 'Codex',
    color: '#a8a8b3',
    hasQuota: false,
    badge: 'sem sessão',
    note: 'Sem uso registrado. Rode uma sessão do Codex para ver.',
    hint: 'sem cota · só gasto de sessão',
  },
  'antigravity-cli': {
    name: 'Antigravity',
    color: '#6ea8fe',
    hasQuota: false,
    badge: 'sem cota',
    note: 'Sem endpoint de consumo público.',
    hint: 'sem cota',
  },
  opencode: {
    name: 'opencode',
    color: '#c7c7cf',
    hasQuota: false,
    badge: 'sem cota',
    note: 'Pré-pago / modelos livres — o consumo não é medido aqui.',
    hint: 'sem cota · só gasto de sessão',
  },
  'kimi-code': {
    name: 'Kimi',
    color: '#8f7bff',
    hasQuota: false,
    badge: 'sem cota',
    note: 'Sem endpoint de consumo público.',
    hint: 'sem cota',
  },
}

export function providerMeta(id: string): ProviderMeta {
  return PROVIDER_META[id] ?? { name: id, color: 'currentColor', hasQuota: false, badge: 'sem cota' }
}

const CLAUDE_SPOKES = [0, 45, 90, 135, 180, 225, 270, 315]

export interface ProviderIconProps {
  id: string
  size?: number
  /** `true` no anel do cabeçalho: o glifo herda a cor do texto. */
  monochrome?: boolean
}

export default function ProviderIcon({ id, size = 16, monochrome = false }: ProviderIconProps) {
  const meta = providerMeta(id)
  const color = monochrome ? 'currentColor' : meta.color
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    focusable: false as const,
    'data-provider-icon': id,
  }

  if (id === 'claude-code') {
    return (
      <svg {...common}>
        <g stroke={color} strokeWidth="2.4" strokeLinecap="round">
          {CLAUDE_SPOKES.map((angle) => (
            <line
              key={angle}
              x1="12"
              y1="12"
              x2="12"
              y2={angle % 90 === 0 ? 3 : 5}
              transform={`rotate(${angle} 12 12)`}
            />
          ))}
        </g>
      </svg>
    )
  }

  if (id === 'codex-cli') {
    return (
      <svg {...common} fill="none" stroke={color} strokeWidth="1.3">
        <circle cx="12" cy="12" r="9.2" />
        <ellipse cx="12" cy="12" rx="9.2" ry="3.6" />
        <ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(120 12 12)" />
      </svg>
    )
  }

  // Genérico: retângulo de terminal com o cursor — cobre opencode e
  // qualquer id novo do catálogo sem exigir um desenho por provedor.
  return (
    <svg {...common} fill="none" stroke={color} strokeWidth="1.6">
      <rect x="4.5" y="3" width="15" height="18" rx="3" />
      <rect x="9.5" y="15" width="5" height="1.8" rx="0.9" fill={color} stroke="none" />
    </svg>
  )
}
