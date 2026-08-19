// SPEC: projects (PROJ-13, PROJ-21)

import ProviderIcon from '../shell/ProviderIcon'
import type { AgentDescriptor } from '../../routes/settings/AgentPanel'

export interface AgentStepSelection {
  name: string
  path: string
  /** `null` no "No Project": a pasta-sandbox não é projeto e não tem cor. */
  color: string | null
}

export interface AgentStepProps {
  selection: AgentStepSelection
  agents: AgentDescriptor[]
  /** Ids com comando resolvido no PATH, como `AgentPanel` lê (AGT-04). */
  installedIds: Set<string>
  /** `null` = terminal limpo: shell puro na pasta, sem agente (PROJ-21). */
  selectedAgentId: string | null
  onSelectAgent: (id: string | null) => void
  onBack: () => void
  onConfirm: () => void
}

/**
 * Etapa 2 do wizard: cartão do lugar escolhido, grade de agentes e o botão
 * que abre o terminal. Apresentacional — a seleção mora em `PaneWizard`.
 *
 * "Nova sessão" nunca desabilita: sem nenhum agente resolvido no PATH o
 * terminal ainda sobe no shell puro (edge case da spec). "Terminal limpo" é
 * a escolha explícita desse shell puro (PROJ-21) e nunca desabilita — não
 * depende de comando nenhum no PATH.
 */
export default function AgentStep({
  selection,
  agents,
  installedIds,
  selectedAgentId,
  onSelectAgent,
  onBack,
  onConfirm,
}: AgentStepProps) {
  return (
    <div className="agent-step">
      <style>{`
        .agent-step {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          height: 100%;
          padding: 0.75rem;
          overflow: hidden;
          background: var(--surface-2, #0a0a0c);
          color: var(--fg, #e8e8ea);
        }
        .agent-step__head { display: flex; align-items: center; justify-content: space-between; }
        .agent-step__step-label {
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          color: var(--muted, #8a8a92);
        }
        .agent-step__card {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          padding: 0.5rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 8px;
          background: var(--surface, #131318);
        }
        .agent-step__swatch { width: 20px; height: 20px; border-radius: 6px; }
        .agent-step__card-name { font-size: 0.8rem; }
        .agent-step__card-path { font-size: 0.7rem; color: var(--muted, #8a8a92); }
        .agent-step__choices { display: flex; gap: 0.5rem; overflow: hidden; }
        .agent-step__plain { flex: 0 0 130px; align-self: flex-start; flex-direction: column; align-items: flex-start; gap: 0.15rem; }
        .agent-step__plain-hint { font-size: 0.65rem; color: var(--muted, #8a8a92); }
        .agent-step__grid {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 0.4rem;
          overflow-y: auto;
        }
        .agent-step__agent {
          display: flex;
          gap: 0.4rem;
          align-items: center;
          padding: 0.45rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 8px;
          background: transparent;
          color: inherit;
          font-size: 0.75rem;
          cursor: pointer;
        }
        .agent-step__agent[aria-pressed='true'] { border-color: var(--accent, #f5b700); }
        .agent-step__agent:disabled { opacity: 0.45; cursor: default; }
        .agent-step__actions { display: flex; justify-content: flex-end; }
      `}</style>

      <div className="agent-step__head">
        <span className="agent-step__step-label">AGENT</span>
        <button type="button" onClick={onBack}>
          Voltar
        </button>
      </div>

      <div className="agent-step__card">
        {selection.color !== null && (
          <span
            className="agent-step__swatch"
            style={{ backgroundColor: selection.color }}
            data-testid="agent-step-swatch"
            aria-hidden="true"
          />
        )}
        <span className="agent-step__card-name">{selection.name}</span>
        <span className="agent-step__card-path">{selection.path}</span>
      </div>

      <div className="agent-step__choices">
        <button
          type="button"
          className="agent-step__agent agent-step__plain"
          aria-pressed={selectedAgentId === null}
          onClick={() => onSelectAgent(null)}
        >
          Terminal limpo
          <span className="agent-step__plain-hint">sem agente</span>
        </button>

        <div className="agent-step__grid">
          {agents.map((agent) => {
            const installed = installedIds.has(agent.id)

            return (
              <button
                key={agent.id}
                type="button"
                className="agent-step__agent"
                aria-pressed={agent.id === selectedAgentId}
                disabled={!installed}
                onClick={() => onSelectAgent(agent.id)}
              >
                <ProviderIcon id={agent.id} />
                {agent.name}
              </button>
            )
          })}
        </div>
      </div>

      <div className="agent-step__actions">
        <button type="button" onClick={onConfirm}>
          Nova sessão
        </button>
      </div>
    </div>
  )
}
