// SPEC: providers-panel (PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PROV-08)

import { RefreshCw, Users } from 'lucide-react'
import ProviderIcon, { providerMeta } from '../../components/shell/ProviderIcon'

/**
 * Espelha `ProviderPref` de `src-tauri/src/db/provider_prefs.rs` (serde
 * camelCase): o que a última varredura gravou para cada provedor do catálogo.
 *
 * AD-036: o painel deixou de ser a grade de cards que escolhia o "agente
 * padrão" (AGT-01/03/04) — AD-035 já havia revogado a decisão que ela tomava.
 */
export interface ProviderRow {
  /** Id do catálogo (`agents::catalog::CATALOG`). */
  id: string
  enabled: boolean
  /**
   * SPEC: providers-panel (PROV-02) — rótulos dos perfis de terminal onde o
   * CLI foi achado ("Windows", "Ubuntu-24.04"). Vazio = não
   * encontrado em nenhum terminal disponível (PROV-04).
   */
  foundIn: string[]
}

export interface AgentPanelProps {
  providers: ProviderRow[]
  /** SPEC: providers-panel (PROV-08) — varredura em curso. */
  refreshing?: boolean
  onRefresh?: () => void
  onToggle?: (id: string, enabled: boolean) => void
}

const PANEL_STYLES = `
  /* As medidas são as de \`ProjectsPanel\`: mesma seção de Configurações,
     mesma identidade — cabeçalho com ícone e descrição, ação à direita, e a
     lista como uma grade de colunas fixas para que ícone, nome, locais e
     switch alinhem entre as linhas. */
  .providers-panel { display: flex; flex-direction: column; gap: 1.25rem; }
  .providers-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
    flex-wrap: wrap;
  }
  .providers-panel__heading { display: flex; gap: 0.7rem; max-width: 22rem; }
  .providers-panel__heading-icon { color: var(--accent, #f5b700); flex: 0 0 auto; margin-top: 0.15rem; }
  .providers-panel__title { margin: 0; font-size: 1rem; font-weight: 600; letter-spacing: -0.01em; }
  .providers-panel__subtitle { margin: 0.25rem 0 0; font-size: 0.8rem; line-height: 1.4; color: var(--muted, #8a8a92); }
  .providers-panel__cta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border: none;
    border-radius: 8px;
    background: var(--accent, #f5b700);
    color: #1a1400;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: filter 120ms ease;
  }
  .providers-panel__cta:hover:not(:disabled) { filter: brightness(1.08); }
  .providers-panel__cta:disabled { opacity: 0.55; cursor: default; }
  .providers-panel__cta[data-refreshing='true'] svg { animation: providers-spin 900ms linear infinite; }
  @keyframes providers-spin { to { transform: rotate(360deg); } }
  .providers-panel__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .providers-panel__row {
    display: grid;
    grid-template-columns: 34px minmax(7rem, 1fr) minmax(0, 1.6fr) 2.6rem;
    align-items: center;
    gap: 0.9rem;
    padding: 0.65rem 0.5rem;
    border-bottom: 1px solid var(--border, #26262d);
  }
  .providers-panel__row:hover { background: rgba(255, 255, 255, 0.03); }
  .providers-panel__row[data-found='false'] { opacity: 0.55; }
  .providers-panel__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--border, #26262d);
    border-radius: 8px;
    background: var(--surface-2, #0a0a0c);
  }
  .providers-panel__name { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .providers-panel__name-text { font-size: 0.85rem; font-weight: 600; }
  .providers-panel__missing { font-size: 0.72rem; color: var(--muted, #8a8a92); }
  .providers-panel__found { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .providers-panel__place {
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--border, #26262d);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--muted, #8a8a92);
    font-size: 0.68rem;
    white-space: nowrap;
  }
  /* Switch: o mesmo <input type="checkbox"> repintado de \`GeneralPanel\` — o
     foco de teclado e o leitor de tela continuam sendo os nativos. */
  .providers-panel__switch { position: relative; display: inline-flex; flex: 0 0 auto; }
  .providers-panel__switch input {
    appearance: none;
    width: 2.6rem;
    height: 1.4rem;
    margin: 0;
    border-radius: 999px;
    background: #3a3a42;
    cursor: pointer;
    transition: background 140ms ease;
  }
  .providers-panel__switch input:checked { background: var(--accent, #f5b700); }
  .providers-panel__switch input:focus-visible { outline: 2px solid var(--accent, #f5b700); outline-offset: 2px; }
  .providers-panel__switch input:disabled { cursor: default; opacity: 0.6; }
  .providers-panel__switch input::after {
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
  .providers-panel__switch input:checked::after { transform: translateX(1.2rem); }
  .providers-panel__empty { margin: 0; padding: 1rem 0.5rem; font-size: 0.8rem; color: var(--muted, #8a8a92); }
`

/**
 * Lista de provedores — apresentacional, no mesmo padrão de `ProjectsPanel`:
 * recebe as linhas prontas via props e não chama `invoke` sozinho. Quem monta
 * (`SettingsShell`) é quem varre e persiste.
 */
export default function AgentPanel({
  providers,
  refreshing = false,
  onRefresh,
  onToggle,
}: AgentPanelProps) {
  return (
    <div className="providers-panel">
      <style>{PANEL_STYLES}</style>

      <div className="providers-panel__header">
        <div className="providers-panel__heading">
          <Users size={18} className="providers-panel__heading-icon" aria-hidden="true" />
          <div>
            <h2 className="providers-panel__title">Provedores de agente</h2>
            <p className="providers-panel__subtitle">
              O que está habilitado aqui é o que o wizard oferece ao abrir um terminal.
            </p>
          </div>
        </div>

        {/* SPEC: providers-panel (PROV-06, PROV-08) */}
        <button
          type="button"
          className="providers-panel__cta"
          data-refreshing={refreshing}
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {refreshing ? 'Buscando...' : 'Atualizar'}
        </button>
      </div>

      {providers.length === 0 ? (
        <p className="providers-panel__empty">Nenhum provedor varrido ainda.</p>
      ) : (
        <ul className="providers-panel__list">
          {providers.map((provider) => {
            const found = provider.foundIn.length > 0
            const name = providerMeta(provider.id).name

            return (
              <li
                key={provider.id}
                className="providers-panel__row"
                data-provider={provider.id}
                data-found={found}
              >
                <span className="providers-panel__icon">
                  <ProviderIcon id={provider.id} size={20} />
                </span>

                <span className="providers-panel__name">
                  <span className="providers-panel__name-text">{name}</span>
                  {/* SPEC: providers-panel (PROV-04) */}
                  {!found && (
                    <span className="providers-panel__missing">
                      Não encontrado em nenhum terminal
                    </span>
                  )}
                </span>

                {/* SPEC: providers-panel (PROV-02, PROV-03) — um lugar só não
                    paga a coluna: a informação existe para desempatar entre
                    terminais, e com um terminal não há empate. */}
                <span className="providers-panel__found">
                  {provider.foundIn.length > 1 &&
                    provider.foundIn.map((place) => (
                      <span key={place} className="providers-panel__place">
                        {place}
                      </span>
                    ))}
                </span>

                {/* SPEC: providers-panel (PROV-04, PROV-05) — travado sem
                    lugar nenhum: ligar um provedor que não existe ofereceria
                    no wizard uma sessão que falha ao subir. */}
                <span className="providers-panel__switch">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={name}
                    checked={found && provider.enabled}
                    disabled={!found}
                    onChange={(event) => onToggle?.(provider.id, event.target.checked)}
                  />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
