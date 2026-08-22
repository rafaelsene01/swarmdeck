// SPEC: projects (PROJ-13, PROJ-21), agent-permission-mode (PERM-05, PERM-06)
// SPEC: terminal-boot-loading (BOOT-12), providers-panel (PROV-14, PROV-15, PROV-16)

import { useState } from 'react'
import ProviderIcon from '../shell/ProviderIcon'
import WizardHeader from './WizardHeader'
import type { AgentDescriptor } from '../../types/agents'

export interface AgentStepSelection {
  name: string
  path: string
  /** `null` no "No Project": a pasta-sandbox não é projeto e não tem cor. */
  color: string | null
}

/**
 * SPEC: agent-permission-mode (PERM-05, PERM-06) — rótulo curto e descrição de
 * cada modo, na hora de escolher.
 *
 * As descrições são as da documentação oficial (code.claude.com/docs/en/
 * permission-modes, tabela "Available modes"): a coluna "What runs without
 * asking" vira a primeira frase e "Best for" a segunda. Não são paráfrase
 * livre — quem escolhe `bypassPermissions` precisa ler o que a Anthropic
 * escreveu, não o que o app achou que aquilo significa.
 *
 * A **lista** de modos não mora aqui: vem de `agent.permissionModes`
 * (`agent_catalog`, derivado de `PERMISSION_MODES` no Rust). Este mapa só
 * traduz; um modo novo no CLI aparece mesmo sem entrada aqui, com o próprio
 * id como rótulo.
 */
export const PERMISSION_MODE_INFO: Record<string, { label: string; description: string }> = {
  manual: {
    label: 'Manual',
    description:
      'Roda sem perguntar: só leitura. Para revisar cada ação você mesmo, em trabalho sensível.',
  },
  plan: {
    label: 'Plano',
    description:
      'Roda sem perguntar: leitura, mais os comandos aprovados pelo classificador quando o modo automático está disponível. Para explorar o código antes de mudar.',
  },
  acceptEdits: {
    label: 'Aceitar edições',
    description:
      'Roda sem perguntar: leitura, edição de arquivos e comandos comuns de sistema de arquivos (mkdir, touch, mv, cp). Para iterar em código que você está revisando.',
  },
  auto: {
    label: 'Automático',
    description:
      'Roda sem perguntar: tudo, com verificações de segurança em segundo plano. Para tarefas longas, reduzindo a fadiga de aprovação.',
  },
  dontAsk: {
    label: 'Não perguntar',
    description:
      'Roda sem perguntar: apenas as ferramentas pré-aprovadas. Para CI e scripts fechados.',
  },
  bypassPermissions: {
    label: 'Sem verificação',
    description:
      'Roda sem perguntar: tudo, sem nenhuma verificação. Só para contêineres e VMs isolados.',
  },
}

/** SPEC: agent-permission-mode (PERM-05) — o modo pré-marcado. */
export const DEFAULT_PERMISSION_MODE = 'auto'

/** Rótulo curto de um modo; um id sem entrada no mapa vira o próprio id. */
export function permissionModeLabel(mode: string): string {
  return PERMISSION_MODE_INFO[mode]?.label ?? mode
}

export interface AgentStepProps {
  selection: AgentStepSelection
  agents: AgentDescriptor[]
  /** Ids com comando resolvido no perfil deste caminho (AGT-04). */
  installedIds: Set<string>
  /**
   * SPEC: providers-panel (PROV-14, PROV-15) — ids habilitados em
   * Configurações › Provedores. Um provedor instalado mas desligado ali
   * aparece na grade desabilitado: é o switch que governa o que o wizard
   * oferece.
   */
  enabledIds: Set<string>
  /** `null` = terminal limpo: shell puro na pasta, sem agente (PROJ-21). */
  selectedAgentId: string | null
  onSelectAgent: (id: string | null) => void
  /**
   * SPEC: agent-permission-mode (PERM-05) — modo escolhido agora. `null`
   * enquanto o agente selecionado não oferecer modos.
   */
  permissionMode?: string | null
  onSelectPermissionMode?: (mode: string) => void
  onBack: () => void
  onConfirm: () => void
  /** "N / M projects" do passo anterior, para o cabeçalho não zerar aqui. */
  counter?: string
  /**
   * SPEC: terminal-boot-loading (BOOT-12) — rótulo do perfil em que este
   * caminho vai rodar ("Windows", "Ubuntu-24.04"). Vem de
   * `shell_profile_for_path`, e é o que explica por que a grade mostra este
   * conjunto de agentes e não outro: uma pasta dentro de uma distro procura
   * o CLI lá dentro, não no PATH do Windows. `undefined` omite a linha.
   */
  terminalLabel?: string
}

/** Id sintético do ladrilho "Terminal": a escolha é `null`, mas o estado de
 *  hover precisa distinguir "nada sob o cursor" de "cursor no terminal
 *  puro". */
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
 * terminal ainda sobe no shell puro (edge case da spec). "Terminal" é a
 * escolha explícita desse shell puro (PROJ-21) e nunca desabilita — não
 * depende de comando nenhum no PATH nem de provedor habilitado (PROV-16).
 */
export default function AgentStep({
  selection,
  agents,
  installedIds,
  enabledIds,
  selectedAgentId,
  onSelectAgent,
  permissionMode,
  onSelectPermissionMode,
  onBack,
  onConfirm,
  counter = '',
  terminalLabel,
}: AgentStepProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  /**
   * SPEC: agent-permission-mode (PERM-05) — os modos vêm do agente
   * **selecionado**, não do que está sob o cursor: o seletor governa o que
   * vai subir, e piscar a cada passagem de mouse seria ruído.
   */
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null
  const permissionModes = selectedAgent?.permissionModes ?? []

  const focusedId = hovered ?? (selectedAgentId === null ? PLAIN : selectedAgentId)
  const focusedAgent = agents.find((agent) => agent.id === focusedId) ?? null
  const caption =
    focusedId === PLAIN
      ? { name: 'Terminal', meta: 'shell puro · sem agente' }
      : focusedAgent !== null
        ? { name: focusedAgent.name, meta: focusedAgent.vendor }
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
          color: #0a0a0c;
          font-size: 0.85rem;
          font-weight: 700;
        }
        .agent-step__card-meta {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
        }
        .agent-step__card-name { font-size: 0.83rem; font-weight: 700; }
        /* SPEC: terminal-boot-loading (BOOT-12) — selo do terminal em que a
           pasta vai rodar. Fica à direita do cartão, alinhado ao nome, para
           ser lido junto com ele sem competir com o caminho. */
        .agent-step__terminal {
          flex: none;
          align-self: center;
          padding: 0.1rem 0.45rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          color: var(--muted, #8a8a92);
          font-size: 0.68rem;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
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
        /* SPEC: agent-permission-mode (PERM-05) — a fileira de modos fica
           entre a legenda do agente e o botão de abrir, porque é a última
           decisão antes de subir a sessão. */
        .agent-step__modes {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          justify-content: center;
        }
        .agent-step__mode {
          padding: 0.28rem 0.6rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 999px;
          background: var(--surface, #131318);
          color: var(--muted, #8a8a92);
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 120ms ease, color 120ms ease;
        }
        .agent-step__mode:hover { color: var(--fg, #e8e8ea); border-color: var(--muted, #8a8a92); }
        .agent-step__mode[aria-pressed='true'] {
          border-color: var(--accent, #f5b700);
          background: rgba(245, 183, 0, 0.14);
          color: var(--accent, #f5b700);
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
              >
                {selection.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="agent-step__card-meta">
              <span className="agent-step__card-name">{selection.name}</span>
              <span className="agent-step__card-path">{selection.path}</span>
            </span>
            {/* SPEC: terminal-boot-loading (BOOT-12) */}
            {terminalLabel !== undefined && (
              <span className="agent-step__terminal" title="terminal onde esta pasta vai rodar">
                {terminalLabel}
              </span>
            )}
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
              aria-label="Terminal"
              title="Terminal"
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
              // SPEC: providers-panel (PROV-14) — encontrado neste terminal
              // **e** habilitado. AD-036: era uma lista fixa com
              // `claude-code`, então um CLI instalado do Codex ou do opencode
              // ficava permanentemente cinza.
              const enabled = enabledIds.has(agent.id) && installedIds.has(agent.id)

              return (
                <button
                  key={agent.id}
                  type="button"
                  className="agent-step__agent"
                  aria-label={agent.name}
                  // SPEC: providers-panel (PROV-15) — o motivo de o ladrilho
                  // estar travado vive no `title`, e não na legenda de hover:
                  // um botão `disabled` não dispara evento de mouse, então
                  // aquela linha nunca chegaria a aparecer para ele.
                  title={
                    !installedIds.has(agent.id)
                      ? `${agent.name} · não encontrado neste terminal`
                      : !enabledIds.has(agent.id)
                        ? `${agent.name} · desabilitado em Configurações › Provedores`
                        : agent.name
                  }
                  aria-pressed={agent.id === selectedAgentId}
                  disabled={!enabled}
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

          {/* SPEC: agent-permission-mode (PERM-05, PERM-06) — só aparece
              para agente que declara modos; o `title` de cada botão é a
              descrição oficial daquele modo. */}
          {permissionModes.length > 0 && (
            <>
              <span className="agent-step__legend">MODO DE PERMISSÃO</span>
              <div
                className="agent-step__modes"
                role="group"
                aria-label="Modo de permissão"
              >
                {permissionModes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="agent-step__mode"
                    aria-pressed={mode === permissionMode}
                    title={PERMISSION_MODE_INFO[mode]?.description ?? mode}
                    onClick={() => onSelectPermissionMode?.(mode)}
                  >
                    {permissionModeLabel(mode)}
                  </button>
                ))}
              </div>
            </>
          )}

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
            <span className="agent-step__confirm-name">Nova sessão</span>
          </button>
        </div>
      </div>
    </div>
  )
}
