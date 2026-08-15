// SPEC: quota-indicator (QUOTA-01, QUOTA-02, QUOTA-03, QUOTA-04, QUOTA-05, QUOTA-06, QUOTA-07, QUOTA-20, QUOTA-21, QUOTA-22, QUOTA-23, QUOTA-25)

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Bot } from 'lucide-react'

export type QuotaWindowKind = 'five_hour' | 'weekly'

export interface QuotaWindowSnapshot {
  kind: QuotaWindowKind
  label: string
  /** Fração `0..1`. `null` quando a janela não tem dado — nunca 0 como substituto. */
  usedFraction: number | null
  /** ISO 8601. `null` quando `resets_at` veio ausente ou inválido. */
  resetsAt: string | null
}

export interface QuotaSnapshot {
  state:
    | 'ok'
    | 'disabled'
    | 'no_credential'
    | 'unauthorized'
    | 'rate_limited'
    | 'offline'
    | 'malformed'
  windows: QuotaWindowSnapshot[]
  planLabel: string | null
  /** Epoch ms da última leitura bem-sucedida. */
  fetchedAt: number | null
  /** Só em `rate_limited`: epoch ms da próxima tentativa permitida. */
  retryAt: number | null
}

export interface QuotaIndicatorProps {
  window: 'five_hour' | 'weekly' | 'both'
}

type FetchState = { status: 'loading' } | { status: 'ready'; snapshot: QuotaSnapshot }

const SIZE = 20
const STROKE = 2
const GAP = 1

/** Ordem de desenho para `window="both"`: arco externo = semanal, interno = 5h (design.md). */
const KINDS_FOR: Record<QuotaIndicatorProps['window'], QuotaWindowKind[]> = {
  both: ['weekly', 'five_hour'],
  five_hour: ['five_hour'],
  weekly: ['weekly'],
}

function radiusFor(index: number): number {
  return SIZE / 2 - STROKE / 2 - index * (STROKE + GAP)
}

/** Frase por estado sem dado (edge cases QUOTA-20..23). `ok`/`disabled` não passam por aqui. */
const NO_DATA_MESSAGE: Partial<Record<QuotaSnapshot['state'], (snapshot: QuotaSnapshot) => string>> = {
  no_credential: () => 'O Claude Code não está conectado.',
  unauthorized: () => 'A sessão expirou. Abra o Claude Code para renovar.',
  offline: () => 'Sem conexão.',
  rate_limited: (snapshot) =>
    `Limite de consultas atingido. Próxima tentativa às ${formatClock(snapshot.retryAt) ?? '—'}.`,
  malformed: () => 'Não foi possível ler a cota agora.',
}

function formatClock(epochMs: number | null): string | null {
  if (epochMs === null) return null
  const date = new Date(epochMs)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** "atualizado há N min" (QUOTA-05) — arredondado ao minuto mais próximo. */
function formatUpdatedAgo(fetchedAt: number | null, now: number): string | null {
  if (fetchedAt === null) return null
  const minutes = Math.max(0, Math.round((now - fetchedAt) / 60_000))
  return `atualizado há ${minutes} min`
}

/** Tempo até o reset de uma janela (P1 AC4) — sem formato exato definido na spec. */
function formatResetIn(resetsAt: string | null, now: number): string | null {
  if (!resetsAt) return null
  const target = Date.parse(resetsAt)
  if (Number.isNaN(target)) return null
  const totalMinutes = Math.max(0, Math.round((target - now) / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `reseta em ${hours}h ${minutes}min` : `reseta em ${minutes}min`
}

/**
 * Anel de consumo com ícone do Claude no centro. Busca o próprio dado
 * (`quota_claude`) na montagem — ao contrário dos painéis de Configurações,
 * que são apresentacionais e recebem tudo via props (ver design.md,
 * Components: `QuotaIndicator`).
 */
export default function QuotaIndicator({ window: windowPref }: QuotaIndicatorProps) {
  const [state, setState] = useState<FetchState>({ status: 'loading' })
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    let cancelled = false
    invoke<QuotaSnapshot>('quota_claude', { force: false }).then((snapshot) => {
      if (!cancelled) setState({ status: 'ready', snapshot })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // QUOTA-04/P3.1: o hover também dispara uma busca — o piso de cache de 5
  // min é decisão do backend (T6), não deste componente.
  function refetch() {
    invoke<QuotaSnapshot>('quota_claude', { force: false }).then((snapshot) => {
      setState({ status: 'ready', snapshot })
    })
  }

  const windows = state.status === 'ready' ? state.snapshot.windows : []
  const kinds = KINDS_FOR[windowPref]
  const loading = state.status === 'loading'

  const open = () => {
    setHovered(true)
    refetch()
  }
  const close = () => setHovered(false)

  return (
    <span className="quota-indicator">
      <style>{`
        .quota-indicator { position: relative; display: inline-flex; }
        .quota-indicator__button {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          padding: 0;
          color: inherit;
          cursor: pointer;
        }
        .quota-indicator__icon { position: absolute; color: var(--fg); }
        .quota-indicator__popover {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 0.4rem;
          min-width: 14rem;
          padding: 0.6rem 0.75rem;
          background: var(--bg);
          color: var(--fg);
          border: 1px solid var(--muted);
          border-radius: 6px;
          font-size: 0.8rem;
          z-index: 10;
        }
        .quota-indicator__popover-row { display: flex; justify-content: space-between; gap: 0.75rem; }
        .quota-indicator__popover-explainer { color: var(--muted); margin-top: 0.4rem; }
      `}</style>
      <button
        type="button"
        className="quota-indicator__button"
        aria-label="quota"
        data-quota-state={loading ? 'loading' : state.snapshot.state}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {kinds.map((kind, index) => {
            const radius = radiusFor(index)
            const circumference = 2 * Math.PI * radius
            const entry = windows.find((w) => w.kind === kind)
            const fraction = entry?.usedFraction ?? null
            const hasData = !loading && fraction !== null

            return (
              <circle
                key={kind}
                data-kind={kind}
                data-has-data={hasData}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={radius}
                fill="none"
                stroke={hasData ? 'var(--accent)' : 'var(--muted)'}
                strokeWidth={STROKE}
                strokeOpacity={loading ? 0.35 : 1}
                strokeDasharray={
                  hasData ? `${circumference * (fraction ?? 0)} ${circumference}` : `${circumference}`
                }
                strokeLinecap="round"
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            )
          })}
        </svg>
        <Bot size={10} className="quota-indicator__icon" />
      </button>

      {hovered && state.status === 'ready' && (
        <div
          className="quota-indicator__popover"
          role="tooltip"
          onMouseEnter={open}
          onMouseLeave={close}
        >
          {state.snapshot.state === 'ok' ? (
            <>
              {kinds.map((kind) => {
                const entry = windows.find((w) => w.kind === kind)
                const percent =
                  entry?.usedFraction !== null && entry?.usedFraction !== undefined
                    ? Math.round(entry.usedFraction * 100)
                    : null
                // QUOTA-25: `resets_at` inválido/ausente preserva o percentual e
                // omite o tempo até o reset — sem separador pendurado.
                const resetIn = formatResetIn(entry?.resetsAt ?? null, Date.now())
                return (
                  <div className="quota-indicator__popover-row" key={kind}>
                    <span>{entry?.label ?? kind}</span>
                    <span>
                      {percent === null
                        ? 'sem dado'
                        : resetIn
                          ? `${percent}% · ${resetIn}`
                          : `${percent}%`}
                    </span>
                  </div>
                )
              })}
              <div className="quota-indicator__popover-row">
                <span>{state.snapshot.planLabel ?? 'Assinatura'}</span>
                <span>{formatUpdatedAgo(state.snapshot.fetchedAt, Date.now())}</span>
              </div>
            </>
          ) : (
            <p>{NO_DATA_MESSAGE[state.snapshot.state]?.(state.snapshot) ?? 'Sem dado.'}</p>
          )}
          <p className="quota-indicator__popover-explainer">
            Inclui o consumo dos terminais Claude abertos pelo SwarmDeck.
          </p>
        </div>
      )}
    </span>
  )
}
