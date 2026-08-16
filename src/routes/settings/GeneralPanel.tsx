// SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-26)

import { ChevronDown, ChevronUp, Gauge } from 'lucide-react'
import ProviderIcon, { providerMeta } from '../../components/shell/ProviderIcon'

/** Espelha `QuotaProvider` de `src-tauri/src/db/quota_prefs.rs`. A ordem do
 * vetor **é** a ordem de exibição no popover — não há campo de índice. */
export interface QuotaProviderPref {
  id: string
  enabled: boolean
}

export interface QuotaPrefs {
  enabled: boolean
  window: 'five_hour' | 'weekly' | 'both'
  /** Opcional na borda: um backend antigo (antes da migração 007) não manda
   * o campo, e a seção precisa abrir mesmo assim. */
  providers?: QuotaProviderPref[]
}

export interface GeneralPanelProps {
  prefs: QuotaPrefs
  /** Quem persiste é o `SettingsShell` (T14) — aqui só noticia a intenção,
   * mesmo contrato que `UpdateSettings` já segue. */
  onChange: (next: QuotaPrefs) => void
}

const WINDOW_OPTIONS: ReadonlyArray<{ value: QuotaPrefs['window']; label: string }> = [
  { value: 'both', label: 'Ambos' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'five_hour', label: '5 horas' },
]

/**
 * Seção "Geral" das configurações: switch mestre, janela rastreada do anel
 * e a lista ordenada de provedores do popover (QUOTA-09, QUOTA-10,
 * QUOTA-26). Puramente apresentacional, mesmo molde de `UpdateSettings.tsx`
 * — não chama `invoke` diretamente.
 */
export default function GeneralPanel({ prefs, onChange }: GeneralPanelProps) {
  const providerList = prefs.providers ?? []

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= providerList.length) return
    const providers = [...providerList]
    const [moved] = providers.splice(index, 1)
    if (!moved) return
    providers.splice(target, 0, moved)
    onChange({ ...prefs, providers })
  }

  const toggleProvider = (index: number) => {
    const providers = providerList.map((provider, i) =>
      i === index ? { ...provider, enabled: !provider.enabled } : provider,
    )
    onChange({ ...prefs, providers })
  }

  return (
    <div className="general-panel">
      <style>{`
        .general-panel { max-width: 46rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .general-panel__title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 0.5rem;
          font-size: 1.05rem;
        }
        .general-panel__title svg { color: var(--accent); }
        .general-panel__group-label {
          margin-top: 1.25rem;
          font-size: 0.6875rem;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .general-panel__group-hint { color: var(--muted); font-size: 0.8125rem; margin: 0.2rem 0 0.5rem; }
        .general-panel__card {
          border: 1px solid #26262c;
          border-radius: 10px;
          background: #151518;
          overflow: hidden;
        }
        .general-panel__row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.85rem 1rem;
        }
        .general-panel__row + .general-panel__row { border-top: 1px solid #232329; }
        .general-panel__row-text { flex: 1 1 auto; min-width: 0; }
        .general-panel__row-title { font-weight: 600; font-size: 0.9rem; }
        .general-panel__row-desc { color: var(--muted); font-size: 0.8125rem; margin-top: 0.15rem; }

        /* Switch: um <input type="checkbox"> de verdade, só repintado — o
           foco de teclado e o leitor de tela continuam sendo os nativos. */
        .general-panel__switch { position: relative; display: inline-flex; flex: 0 0 auto; }
        .general-panel__switch input {
          appearance: none;
          width: 2.6rem;
          height: 1.4rem;
          margin: 0;
          border-radius: 999px;
          background: #3a3a42;
          cursor: pointer;
          transition: background 140ms ease;
        }
        .general-panel__switch input:checked { background: var(--accent); }
        .general-panel__switch input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .general-panel__switch input::after {
          content: '';
          position: absolute;
          top: 0.2rem;
          left: 0.2rem;
          width: 1rem;
          height: 1rem;
          border-radius: 50%;
          background: #fff;
          transition: transform 140ms ease;
        }
        .general-panel__switch input:checked::after { transform: translateX(1.2rem); }

        /* Segmented control sobre radios nativos. */
        .general-panel__segmented {
          display: inline-flex;
          border: 1px solid #33333b;
          border-radius: 8px;
          overflow: hidden;
          flex: 0 0 auto;
        }
        .general-panel__segment {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.35rem 0.85rem;
          font-size: 0.8125rem;
          cursor: pointer;
          color: var(--muted);
        }
        .general-panel__segment + .general-panel__segment { border-left: 1px solid #33333b; }
        .general-panel__segment input {
          position: absolute;
          inset: 0;
          margin: 0;
          opacity: 0;
          cursor: pointer;
        }
        .general-panel__segment:has(input:checked) {
          background: rgba(245, 183, 0, 0.16);
          color: var(--accent);
          font-weight: 600;
        }
        .general-panel__segment:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: -2px; }

        .general-panel__reorder { display: flex; flex-direction: column; gap: 2px; flex: 0 0 auto; }
        .general-panel__reorder button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.4rem;
          height: 1rem;
          border: 1px solid #33333b;
          border-radius: 4px;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
        }
        .general-panel__reorder button:hover:not(:disabled) { color: var(--fg); background: rgba(255,255,255,0.06); }
        .general-panel__reorder button:disabled { opacity: 0.35; cursor: default; }
        .general-panel__provider-name { display: flex; align-items: baseline; gap: 0.5rem; }
        .general-panel__provider-hint { color: var(--muted); font-size: 0.75rem; }
      `}</style>

      <h2 className="general-panel__title">
        <Gauge size={18} />
        Indicador de cota
      </h2>

      <div className="general-panel__card">
        <div className="general-panel__row">
          <div className="general-panel__row-text">
            <div className="general-panel__row-title">Mostrar o indicador de cota</div>
            <div className="general-panel__row-desc">
              Mostra o anel de consumo e o popover dele no cabeçalho.
            </div>
          </div>
          <span className="general-panel__switch">
            <input
              type="checkbox"
              aria-label="Mostrar o indicador de cota"
              checked={prefs.enabled}
              onChange={() => onChange({ ...prefs, enabled: !prefs.enabled })}
            />
          </span>
        </div>
      </div>

      <div className="general-panel__group-label">Anel do cabeçalho</div>
      <p className="general-panel__group-hint">
        O cabeçalho mostra um anel por janela. Escolha quais ele acompanha.
      </p>

      <div className="general-panel__card">
        <div className="general-panel__row">
          <div className="general-panel__row-text">
            <div className="general-panel__row-title">Janela rastreada</div>
            <div className="general-panel__row-desc">
              "Ambos" desenha os dois arcos: externo semanal, interno de 5 horas.
            </div>
          </div>
          <div className="general-panel__segmented" role="group" aria-label="Janela rastreada">
            {WINDOW_OPTIONS.map((option) => (
              <label key={option.value} className="general-panel__segment">
                <input
                  type="radio"
                  name="quota-window"
                  value={option.value}
                  checked={prefs.window === option.value}
                  onChange={() => onChange({ ...prefs, window: option.value })}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="general-panel__group-label">Popover do hover</div>
      <p className="general-panel__group-hint">
        Quais provedores são listados ao passar o mouse no anel, e em que ordem.
      </p>

      <div className="general-panel__card">
        {providerList.map((provider, index) => {
          const meta = providerMeta(provider.id)
          return (
            <div className="general-panel__row" key={provider.id} data-provider={provider.id}>
              <div className="general-panel__reorder">
                <button
                  type="button"
                  aria-label={`Subir ${meta.name}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  aria-label={`Descer ${meta.name}`}
                  disabled={index === providerList.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown size={12} />
                </button>
              </div>

              <ProviderIcon id={provider.id} size={18} />

              <div className="general-panel__row-text general-panel__provider-name">
                <span className="general-panel__row-title">{meta.name}</span>
                {meta.hint && <span className="general-panel__provider-hint">{meta.hint}</span>}
              </div>

              <span className="general-panel__switch">
                <input
                  type="checkbox"
                  aria-label={`Mostrar ${meta.name} no popover`}
                  checked={provider.enabled}
                  onChange={() => toggleProvider(index)}
                />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
