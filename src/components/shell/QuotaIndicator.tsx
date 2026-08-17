// SPEC: quota-indicator (QUOTA-01, QUOTA-02, QUOTA-03, QUOTA-04, QUOTA-05, QUOTA-06, QUOTA-07, QUOTA-20, QUOTA-21, QUOTA-22, QUOTA-23, QUOTA-25, QUOTA-26, QUOTA-27, QUOTA-28, QUOTA-29, QUOTA-30)

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Settings2 } from 'lucide-react'
import ProviderIcon, { providerMeta } from './ProviderIcon'

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
  /** Lista ordenada do popover (QUOTA-26). Só os `enabled` chegam aqui. */
  providerIds?: string[]
  /** Clicar no anel abre Configurações › Geral (QUOTA-30). */
  onOpenSettings?: () => void
}

type FetchState = { status: 'loading' } | { status: 'ready'; snapshot: QuotaSnapshot }

const SIZE = 30
const STROKE = 2.5
const GAP = 1.5
/**
 * Disco da marca no centro (QUOTA-27). 14px deixa ~1,5px de folga até o
 * arco interno (raio livre = 8,5px) — o glifo encostava no anel a 26px.
 */
const ICON_DISC = 14
const ICON_GLYPH = 12

/** QUOTA-28: a busca se repete a cada 5 min — mesmo piso do cache do backend. */
const POLL_MS = 5 * 60 * 1000

/** Ordem de desenho para `window="both"`: arco externo = semanal, interno = 5h (design.md). */
const KINDS_FOR: Record<QuotaIndicatorProps['window'], QuotaWindowKind[]> = {
  both: ['weekly', 'five_hour'],
  five_hour: ['five_hour'],
  weekly: ['weekly'],
}

function radiusFor(index: number): number {
  return SIZE / 2 - STROKE / 2 - index * (STROKE + GAP)
}

/**
 * QUOTA-29: cor do anel em função do consumo — verde em 0%, âmbar no meio,
 * vermelho em 100%. Interpolação direta de matiz (140° → 0°); nenhum degrau
 * discreto, para que a mudança acompanhe o gasto em vez de saltar.
 */
export function ringColor(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction))
  return `hsl(${Math.round(140 - 140 * clamped)} 72% 52%)`
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

/**
 * Tempo até o reset de uma janela (P1 AC4). Acima de 24h o valor sai em
 * dias + horas ("reseta em 6d 12h"): a janela semanal em minutos daria
 * "reseta em 156h 30min", ilegível.
 */
function formatResetIn(resetsAt: string | null, now: number): string | null {
  if (!resetsAt) return null
  const target = Date.parse(resetsAt)
  if (Number.isNaN(target)) return null
  const totalMinutes = Math.max(0, Math.round((target - now) / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours >= 24) {
    return `reseta em ${Math.floor(hours / 24)}d ${hours % 24}h`
  }
  return hours > 0 ? `reseta em ${hours}h ${minutes}min` : `reseta em ${minutes}min`
}

/**
 * Anel de consumo com o ícone do provedor padrão no centro. Busca o próprio
 * dado (`quota_claude`) na montagem, a cada 5 min e ao abrir o popover — ao
 * contrário dos painéis de Configurações, que são apresentacionais e recebem
 * tudo via props (ver design.md, Components: `QuotaIndicator`).
 */
export default function QuotaIndicator({
  window: windowPref,
  providerIds = ['claude-code'],
  onOpenSettings,
}: QuotaIndicatorProps) {
  const [state, setState] = useState<FetchState>({ status: 'loading' })
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = (force: boolean) =>
      invoke<QuotaSnapshot>('quota_claude', { force }).then((snapshot) => {
        if (!cancelled) setState({ status: 'ready', snapshot })
      })

    void load(false)
    // QUOTA-28: `force: true` porque o tick cai exatamente no piso de cache
    // do backend — sem ele, metade dos ticks seria servida do cache.
    const timer = setInterval(() => void load(true), POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
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
  // No popover a leitura vai da janela mais curta para a mais longa: 5h em
  // cima, semanal embaixo. Os arcos continuam na ordem de `KINDS_FOR`
  // (externo = semanal), que é geometria do anel, não ordem de leitura.
  const kindsForPopover = [...kinds].reverse()
  const loading = state.status === 'loading'
  // QUOTA-27: o centro do anel leva o glifo do provedor padrão — o primeiro
  // da lista, que é o Claude na configuração de fábrica.
  const defaultProviderId = providerIds[0] ?? 'claude-code'

  const open = () => {
    setHovered(true)
    refetch()
  }
  const close = () => setHovered(false)

  const now = Date.now()

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
          color: var(--fg);
          cursor: pointer;
          border-radius: 50%;
        }
        .quota-indicator__button:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .quota-indicator__icon {
          position: absolute;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${ICON_DISC}px;
          height: ${ICON_DISC}px;
          border-radius: 50%;
          /* Glifo branco sobre o disco da marca — o ícone monocromático
             herda esta cor via currentColor. */
          color: #fff;
        }
        .quota-indicator__popover {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 0.5rem;
          width: 20rem;
          padding: 0;
          background: #17171a;
          color: var(--fg);
          border: 1px solid #2b2b31;
          border-radius: 10px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
          font-size: 0.8125rem;
          overflow: hidden;
          z-index: 10;
        }
        .quota-indicator__popover-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 0.75rem;
          border-bottom: 1px solid #2b2b31;
        }
        .quota-indicator__popover-title {
          font-size: 0.6875rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .quota-indicator__popover-gear {
          display: inline-flex;
          background: transparent;
          border: none;
          padding: 0.15rem;
          border-radius: 4px;
          color: var(--muted);
          cursor: pointer;
        }
        .quota-indicator__popover-gear:hover { color: var(--fg); background: rgba(255,255,255,0.06); }
        .quota-indicator__provider { padding: 0.7rem 0.75rem; }
        .quota-indicator__provider + .quota-indicator__provider { border-top: 1px solid #232329; }
        .quota-indicator__provider-head {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .quota-indicator__provider-name { font-weight: 600; flex: 1 1 auto; }
        .quota-indicator__badge {
          font-size: 0.6875rem;
          color: var(--muted);
          border: 1px solid #33333b;
          border-radius: 5px;
          padding: 0.05rem 0.35rem;
          white-space: nowrap;
        }
        .quota-indicator__note { color: var(--muted); margin: 0.35rem 0 0; }
        .quota-indicator__window { margin-top: 0.6rem; }
        .quota-indicator__window-row {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: baseline;
        }
        .quota-indicator__window-percent { font-weight: 600; font-variant-numeric: tabular-nums; }
        .quota-indicator__bar {
          margin-top: 0.3rem;
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.09);
          overflow: hidden;
        }
        .quota-indicator__bar-fill { height: 100%; border-radius: 999px; }
        .quota-indicator__reset { color: var(--muted); font-size: 0.75rem; margin: 0.3rem 0 0; }
        .quota-indicator__foot {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          border-top: 1px solid #2b2b31;
          color: var(--muted);
          font-size: 0.75rem;
        }
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
        onClick={onOpenSettings}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {kinds.map((kind, index) => {
            const radius = radiusFor(index)
            const circumference = 2 * Math.PI * radius
            const entry = windows.find((w) => w.kind === kind)
            const fraction = entry?.usedFraction ?? null
            const hasData = !loading && fraction !== null

            return (
              <g key={kind}>
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={STROKE}
                />
                <circle
                  data-kind={kind}
                  data-has-data={hasData}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={radius}
                  fill="none"
                  stroke={hasData ? ringColor(fraction ?? 0) : 'var(--muted)'}
                  strokeWidth={STROKE}
                  strokeOpacity={loading ? 0.35 : 1}
                  strokeDasharray={
                    hasData ? `${circumference * (fraction ?? 0)} ${circumference}` : `${circumference}`
                  }
                  strokeLinecap="round"
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                />
              </g>
            )
          })}
        </svg>
        <span
          className="quota-indicator__icon"
          style={{ background: providerMeta(defaultProviderId).color }}
        >
          <ProviderIcon id={defaultProviderId} size={ICON_GLYPH} monochrome />
        </span>
      </button>

      {hovered && state.status === 'ready' && (
        <div
          className="quota-indicator__popover"
          role="tooltip"
          onMouseEnter={open}
          onMouseLeave={close}
        >
          <div className="quota-indicator__popover-head">
            <span className="quota-indicator__popover-title">Cota por provedor</span>
            <button
              type="button"
              className="quota-indicator__popover-gear"
              aria-label="Abrir Configurações"
              onClick={onOpenSettings}
            >
              <Settings2 size={14} />
            </button>
          </div>

          {providerIds.map((id) => {
            const meta = providerMeta(id)

            // QUOTA-26: só o Claude tem endpoint de consumo hoje; os demais
            // rendem o selo e a frase do motivo, nunca uma barra em 0%.
            if (!meta.hasQuota) {
              return (
                <div className="quota-indicator__provider" key={id} data-provider={id}>
                  <div className="quota-indicator__provider-head">
                    <ProviderIcon id={id} size={16} />
                    <span className="quota-indicator__provider-name">{meta.name}</span>
                    {meta.badge && <span className="quota-indicator__badge">{meta.badge}</span>}
                  </div>
                  {meta.note && <p className="quota-indicator__note">{meta.note}</p>}
                </div>
              )
            }

            return (
              <div className="quota-indicator__provider" key={id} data-provider={id}>
                <div className="quota-indicator__provider-head">
                  <ProviderIcon id={id} size={16} />
                  <span className="quota-indicator__provider-name">{meta.name}</span>
                  <span className="quota-indicator__badge">
                    {state.snapshot.planLabel ?? 'Assinatura'}
                  </span>
                </div>

                {state.snapshot.state !== 'ok' ? (
                  <p className="quota-indicator__note">
                    {NO_DATA_MESSAGE[state.snapshot.state]?.(state.snapshot) ?? 'Sem dado.'}
                  </p>
                ) : (
                  kindsForPopover.map((kind) => {
                    const entry = windows.find((w) => w.kind === kind)
                    const fraction = entry?.usedFraction ?? null
                    const percent = fraction === null ? null : Math.round(fraction * 100)
                    // QUOTA-25: `resets_at` inválido/ausente preserva o
                    // percentual e omite o tempo até o reset.
                    const resetIn = formatResetIn(entry?.resetsAt ?? null, now)

                    return (
                      <div className="quota-indicator__window" key={kind} data-window={kind}>
                        <div className="quota-indicator__window-row">
                          <span>{entry?.label ?? kind} · usado</span>
                          <span className="quota-indicator__window-percent">
                            {percent === null ? 'sem dado' : `${percent}%`}
                          </span>
                        </div>
                        {percent !== null && (
                          <div className="quota-indicator__bar">
                            <div
                              className="quota-indicator__bar-fill"
                              style={{
                                width: `${percent}%`,
                                background: ringColor(fraction ?? 0),
                              }}
                            />
                          </div>
                        )}
                        {resetIn && <p className="quota-indicator__reset">{resetIn}</p>}
                      </div>
                    )
                  })
                )}
              </div>
            )
          })}

          <div className="quota-indicator__foot">
            <span>Inclui o consumo dos terminais abertos pelo SwarmDeck.</span>
            <span>{formatUpdatedAgo(state.snapshot.fetchedAt, now)}</span>
          </div>
        </div>
      )}
    </span>
  )
}
