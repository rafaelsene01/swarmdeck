// SPEC: projects (PROJ-13, PROJ-21)

import { useState } from 'react'
import ProviderIcon from '../shell/ProviderIcon'
import WizardHeader from './WizardHeader'
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
  /** "N / M projects" do passo anterior, para o cabeçalho não zerar aqui. */
  counter?: string
}

/** Id sintético do ladrilho "Terminal limpo": a escolha é `null`, mas o
 *  estado de hover precisa distinguir "nada sob o cursor" de "cursor no
 *  terminal limpo". */
const PLAIN = '__plain__'

/**
 * Etapa 2 do wizard: cartão do lugar escolhido, grade de agentes e o botão
 * que abre o terminal. Apresentacional — a seleção mora em `PaneWizard`.
 *
 * Todos os ladrilhos têm o mesmo tamanho e mostram só o ícone; o nome e o
 * fornecedor aparecem na linha abaixo da grade, para o item sob o cursor
 * (ou, sem cursor, para o item selecionado). O nome também vai em
 * `aria-label`, então leitor de tela e teste continuam achando o botão pelo
 * nome mesmo sem texto visível.
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
  counter = '',
}: AgentStepProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const focusedId = hovered ?? (selectedAgentId === null ? PLAIN : selectedAgentId)
  const focusedAgent = agents.find((agent) => agent.id === focusedId) ?? null
  const caption =
    focusedId === PLAIN
      ? { name: 'Terminal limpo', meta: 'shell puro · sem agente' }
      : focusedAgent !== null
        ? {
            name: focusedAgent.name,
            meta: installedIds.has(focusedAgent.id)
              ? focusedAgent.vendor
              : `${focusedAgent.vendor} · não encontrado no PATH`,
          }
        : null

  return (
    <div className="agent-step">
      <style>{`
        .agent-step {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 1rem 1.15rem;
          overflow: hidden;
          background: var(--surface-2, #0a0a0c);
          color: var(--fg, #e8e8ea);
        }
        .agent-step__inner {
          display: flex;
          flex-direction: column;
          width: min(820px, 100%);
          height: 100%;
          margin: 0 auto;
          overflow: hidden;
        }
        /* O miolo fica no centro vertical do painel; o cabeçalho continua no
           topo, como na etapa PROJECT. */
        .agent-step__body {
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: center;
          /* safe center evita cortar o topo quando o miolo nao cabe. */
          justify-content: safe center;
          gap: 0.85rem;
          overflow-y: auto;
        }
        .agent-step__card {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          padding: 0.7rem 0.8rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 10px;
          background: var(--surface, #131318);
        }
        .agent-step__swatch {
          display: inline-flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 9px;
        }
        .agent-step__card-meta {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
        }
        .agent-step__card-name { font-size: 0.83rem; font-weight: 700; }
        .agent-step__card-path {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.72rem;
          color: var(--muted, #8a8a92);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .agent-step__back {
          display: inline-flex;
          flex: none;
          gap: 0.35rem;
          align-items: center;
          height: 30px;
          padding: 0 0.7rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 8px;
          background: transparent;
          color: var(--muted, #8a8a92);
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .agent-step__back:hover { color: var(--fg, #e8e8ea); border-color: var(--muted, #8a8a92); }
        .agent-step__legend {
          display: flex;
          gap: 0.6rem;
          align-items: center;
          font-size: 0.66rem;
          font-weight: 600;
          letter-spacing: 0.14em;
          color: var(--muted, #8a8a92);
        }
        .agent-step__legend::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border, #26262d);
        }
        .agent-step__grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: center;
        }
        /* Um único tamanho para todo ladrilho, inclusive o terminal limpo. */
        .agent-step__agent {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 52px;
          height: 52px;
          padding: 0;
          border: 1px solid var(--border, #26262d);
          border-radius: 12px;
          background: var(--surface, #131318);
          color: inherit;
          cursor: pointer;
          transition: border-color 120ms ease, transform 120ms ease;
        }
        .agent-step__agent:hover:not(:disabled) {
          border-color: var(--muted, #8a8a92);
          transform: translateY(-1px);
        }
        .agent-step__agent[aria-pressed='true'] {
          border-color: var(--accent, #f5b700);
          box-shadow: 0 0 0 3px rgba(245, 183, 0, 0.12);
        }
        .agent-step__agent[aria-pressed='true']::after {
          content: '✓';
          position: absolute;
          top: -6px;
          right: -6px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--accent, #f5b700);
          color: #0a0a0c;
          font-size: 0.6rem;
          font-weight: 700;
        }
        .agent-step__agent:disabled { opacity: 0.4; cursor: default; }
        .agent-step__beta {
          position: absolute;
          bottom: -7px;
          left: 50%;
          transform: translateX(-50%);
          padding: 0 0.25rem;
          border-radius: 4px;
          background: var(--accent, #f5b700);
          color: #0a0a0c;
          font-size: 0.5rem;
          font-weight: 700;
          letter-spacing: 0.06em;
        }
        .agent-step__caption {
          display: flex;
          gap: 0.5rem;
          align-items: baseline;
          justify-content: center;
          /* Altura fixa: o nome muda com o cursor e a grade não pode pular. */
          min-height: 1.15rem;
          font-size: 0.78rem;
        }
        .agent-step__caption-name { font-weight: 700; }
        .agent-step__caption-meta { font-size: 0.72rem; color: var(--muted, #8a8a92); }
        .agent-step__confirm {
          display: flex;
          gap: 0.6rem;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 0.85rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 10px;
          background: var(--surface, #131318);
          color: inherit;
          cursor: pointer;
        }
        .agent-step__confirm:hover {
          border-color: var(--accent, #f5b700);
          box-shadow: 0 0 0 3px rgba(245, 183, 0, 0.1);
        }
        .agent-step__confirm-name { font-size: 0.85rem; font-weight: 700; }
        .agent-step__confirm-hint {
          font-size: 0.62rem;
          letter-spacing: 0.12em;
          color: var(--muted, #8a8a92);
        }
      `}</style>

      <div className="agent-step__inner">
        <WizardHeader step={2} counter={counter} />

        <div className="agent-step__body">
          <div className="agent-step__card">
            {selection.color !== null && (
              <span
                className="agent-step__swatch"
                style={{ backgroundColor: selection.color }}
                data-testid="agent-step-swatch"
                aria-hidden="true"
              />
            )}
            <span className="agent-step__card-meta">
              <span className="agent-step__card-name">{selection.name}</span>
              <span className="agent-step__card-path">{selection.path}</span>
            </span>
            <button type="button" className="agent-step__back" onClick={onBack}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="m14.5 5-7 7 7 7" />
              </svg>
              Voltar
            </button>
          </div>

          <span className="agent-step__legend">ESCOLHA SEU AGENTE</span>

          <div className="agent-step__grid">
            <button
              type="button"
              className="agent-step__agent agent-step__plain"
              aria-label="Terminal limpo"
              title="Terminal limpo"
              aria-pressed={selectedAgentId === null}
              onClick={() => onSelectAgent(null)}
              onMouseEnter={() => setHovered(PLAIN)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(PLAIN)}
              onBlur={() => setHovered(null)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <rect x="3" y="4.5" width="18" height="15" rx="3" />
                <path d="m7.5 10 2.5 2-2.5 2" />
                <line x1="12.5" y1="14.5" x2="16.5" y2="14.5" />
              </svg>
            </button>

            {agents.map((agent) => {
              const installed = installedIds.has(agent.id)

              return (
                <button
                  key={agent.id}
                  type="button"
                  className="agent-step__agent"
                  aria-label={agent.name}
                  title={agent.name}
                  aria-pressed={agent.id === selectedAgentId}
                  disabled={!installed}
                  onClick={() => onSelectAgent(agent.id)}
                  onMouseEnter={() => setHovered(agent.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(agent.id)}
                  onBlur={() => setHovered(null)}
                >
                  <ProviderIcon id={agent.id} size={24} />
                  {agent.beta && (
                    <span className="agent-step__beta" aria-hidden="true">
                      BETA
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <p className="agent-step__caption" aria-live="polite">
            {caption !== null && (
              <>
                <span className="agent-step__caption-name">{caption.name}</span>
                <span className="agent-step__caption-meta">{caption.meta}</span>
              </>
            )}
          </p>

          <button
            type="button"
            className="agent-step__confirm"
            aria-label="Nova sessão"
            onClick={onConfirm}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <span>
              <span className="agent-step__confirm-name">Nova sessão</span>{' '}
              <span className="agent-step__confirm-hint">COMEÇAR DO ZERO</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
