// SPEC: session-restore (SESS-03, SESS-04, SESS-05, SESS-08, SESS-09, SESS-14, SESS-15)

import { useEffect, useMemo, useRef, useState } from 'react'
import ProviderIcon, { providerMeta } from './ProviderIcon'

/** Um terminal salvo, na forma mínima que o modal precisa exibir e devolver. */
export interface RestorableTerminal {
  id: string
  cwd: string
  agentId?: string | null
  /** `null` quando o terminal foi salvo antes desta feature: não há conversa
   * para retomar, e o switch nasce travado em "nova sessão" (SESS-15). */
  agentSessionId?: string | null
}

export interface RestorableTab {
  id: string
  name: string
  terminals: RestorableTerminal[]
}

export interface RestoreSelection {
  /** Ids das abas marcadas, na ordem em que chegaram. */
  tabIds: string[]
  /** Ids dos terminais marcados. */
  terminalIds: string[]
  /** `true` = retomar a conversa salva; `false` = sessão nova (SESS-16). */
  resumeByTerminalId: Record<string, boolean>
}

export interface RestoreSessionDialogProps {
  tabs: RestorableTab[]
  /** Ids de agente cujo CLI aceita retomada — vem de `agent_catalog`
   * (`supportsSessionResume`). */
  resumableAgentIds: Set<string>
  onRestore: (selection: RestoreSelection) => void
  /** "Start Fresh", o × e Escape caem todos aqui (SESS-08). */
  onStartFresh: () => void
}

/** Últimos dois segmentos do caminho — o caminho inteiro estoura a linha e o
 * que identifica o terminal é a pasta, não a raiz do disco. */
function shortCwd(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/') || cwd
}

/**
 * Modal de restauração do boot: confirma quais abas e terminais voltam e, para
 * cada terminal, se a conversa do agente é retomada ou recomeça.
 *
 * Apresentacional, como `PaneWizard` e `LayoutMenu`: recebe o workspace
 * lido e devolve a escolha; não invoca comando nenhum e não sabe o que o `App`
 * fará com o resultado.
 *
 * A marcação em cascata é de mão única de propósito (SESS-05): desmarcar a aba
 * desmarca seus terminais, mas desmarcar o último terminal **não** desmarca a
 * aba — aba marcada com zero terminais restaura vazia, com o `EmptyState`, e
 * essa é uma escolha legítima do usuário.
 */
export default function RestoreSessionDialog({
  tabs,
  resumableAgentIds,
  onRestore,
  onStartFresh,
}: RestoreSessionDialogProps) {
  const allTerminals = useMemo(() => tabs.flatMap((tab) => tab.terminals), [tabs])

  /** Um terminal só pode retomar se tem id salvo E o CLI do agente aceita
   * retomada (SESS-15). Sem as duas coisas o switch fica travado. */
  const canResume = (terminal: RestorableTerminal) =>
    Boolean(terminal.agentSessionId) &&
    Boolean(terminal.agentId) &&
    resumableAgentIds.has(terminal.agentId as string)

  // SESS-03 / SESS-14: tudo nasce marcado e em "restaurar sessão"; o que não
  // pode retomar nasce em "nova sessão".
  const [checkedTabs, setCheckedTabs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tabs.map((tab) => [tab.id, true])),
  )
  const [checkedTerminals, setCheckedTerminals] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allTerminals.map((terminal) => [terminal.id, true])),
  )
  const [resume, setResume] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allTerminals.map((terminal) => [terminal.id, canResume(terminal)])),
  )

  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    primaryRef.current?.focus()
  }, [])

  // SESS-08: Escape faz o mesmo que "Start Fresh".
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onStartFresh()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onStartFresh])

  const selectedCount = allTerminals.filter((t) => checkedTerminals[t.id]).length

  /** SESS-05: a aba propaga sua marcação para os terminais dela. */
  const toggleTab = (tab: RestorableTab) => {
    const next = !checkedTabs[tab.id]
    setCheckedTabs((prev) => ({ ...prev, [tab.id]: next }))
    setCheckedTerminals((prev) => ({
      ...prev,
      ...Object.fromEntries(tab.terminals.map((terminal) => [terminal.id, next])),
    }))
  }

  const handleRestore = () => {
    onRestore({
      tabIds: tabs.filter((tab) => checkedTabs[tab.id]).map((tab) => tab.id),
      terminalIds: allTerminals.filter((t) => checkedTerminals[t.id]).map((t) => t.id),
      resumeByTerminalId: resume,
    })
  }

  return (
    <div className="restore-dialog" role="dialog" aria-modal="true" aria-label="restaurar sessão anterior">
      <style>{`
        .restore-dialog {
          width: min(30rem, calc(100vw - 2rem));
          max-height: calc(100vh - 4rem);
          display: flex;
          flex-direction: column;
          background: var(--surface);
          color: var(--fg);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
          font-size: 0.8125rem;
        }
        .restore-dialog__head {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1.15rem 1.25rem 0.75rem;
        }
        .restore-dialog__title { margin: 0; font-size: 1.0625rem; font-weight: 650; letter-spacing: -0.01em; }
        .restore-dialog__subtitle { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.8125rem; }
        .restore-dialog__close {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          flex: 0 0 auto;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--muted);
          font: inherit;
          font-size: 1.1rem;
          line-height: 1;
          cursor: pointer;
        }
        .restore-dialog__close:hover { background: rgba(255, 255, 255, 0.07); color: var(--fg); }
        .restore-dialog__list {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 0 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .restore-dialog__tab {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.02);
          overflow: hidden;
        }
        .restore-dialog__tab-head {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 0.7rem;
          font-weight: 600;
        }
        .restore-dialog__tab-count { margin-left: auto; color: var(--muted); font-weight: 400; font-size: 0.75rem; }
        .restore-dialog__terminal {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.45rem 0.7rem 0.45rem 1.6rem;
          border-top: 1px solid var(--border);
        }
        .restore-dialog__cwd {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #d7d7dd;
        }
        .restore-dialog__empty { padding: 0.45rem 0.7rem 0.55rem 1.6rem; border-top: 1px solid var(--border); color: var(--muted); }
        /* Switch de dois estados. Dois botões com aria-pressed em vez de um
           toggle opaco: o estado escolhido fica legível para leitor de tela e
           o alvo de clique não depende de adivinhar o significado do lado. */
        .restore-dialog__switch { display: inline-flex; flex: 0 0 auto; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
        .restore-dialog__switch button {
          padding: 0.2rem 0.6rem;
          background: transparent;
          border: none;
          color: var(--muted);
          font: inherit;
          font-size: 0.6875rem;
          cursor: pointer;
        }
        .restore-dialog__switch button[aria-pressed='true'] { background: rgba(245, 183, 0, 0.18); color: var(--accent); }
        .restore-dialog__switch button:disabled { cursor: not-allowed; opacity: 0.55; }
        .restore-dialog__counter { padding: 0.85rem 1.25rem; text-align: center; color: var(--muted); font-size: 0.75rem; }
        .restore-dialog__actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.6rem;
          padding: 0 1.25rem 1.25rem;
        }
        .restore-dialog__actions button {
          padding: 0.6rem 0.9rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.04);
          color: var(--fg);
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .restore-dialog__actions button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.09); }
        .restore-dialog__primary {
          background: var(--accent) !important;
          border-color: var(--accent) !important;
          color: #1a1400 !important;
        }
        .restore-dialog__primary:hover:not(:disabled) { filter: brightness(1.08); }
        .restore-dialog__primary:disabled { opacity: 0.45; cursor: not-allowed; }
        /* Foco visível em todo controle — o modal é operável só pelo teclado. */
        .restore-dialog :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .restore-dialog input[type='checkbox'] { accent-color: var(--accent); width: 15px; height: 15px; flex: 0 0 auto; }
      `}</style>

      <div className="restore-dialog__head">
        <div>
          <h2 className="restore-dialog__title">Restaurar sessão anterior</h2>
          <p className="restore-dialog__subtitle">
            Escolha quais abas e terminais reabrir.
          </p>
        </div>
        <button
          type="button"
          className="restore-dialog__close"
          aria-label="fechar sem restaurar"
          onClick={onStartFresh}
        >
          ×
        </button>
      </div>

      <div className="restore-dialog__list">
        {tabs.map((tab) => (
          <div key={tab.id} className="restore-dialog__tab">
            <label className="restore-dialog__tab-head">
              <input
                type="checkbox"
                checked={checkedTabs[tab.id] ?? false}
                onChange={() => toggleTab(tab)}
                aria-label={`restaurar aba ${tab.name}`}
              />
              {tab.name}
              <span className="restore-dialog__tab-count">
                {tab.terminals.length === 1 ? '1 terminal' : `${tab.terminals.length} terminais`}
              </span>
            </label>

            {tab.terminals.length === 0 && (
              <p className="restore-dialog__empty">Aba sem terminais.</p>
            )}

            {tab.terminals.map((terminal) => {
              const resumable = canResume(terminal)
              const label = shortCwd(terminal.cwd)

              return (
                <div key={terminal.id} className="restore-dialog__terminal">
                  <input
                    type="checkbox"
                    checked={checkedTerminals[terminal.id] ?? false}
                    onChange={() =>
                      setCheckedTerminals((prev) => ({
                        ...prev,
                        [terminal.id]: !prev[terminal.id],
                      }))
                    }
                    aria-label={`restaurar terminal ${label}`}
                  />
                  {terminal.agentId && <ProviderIcon id={terminal.agentId} size={14} />}
                  <span className="restore-dialog__cwd" title={terminal.cwd}>
                    {label}
                  </span>
                  <span
                    className="restore-dialog__switch"
                    title={
                      resumable
                        ? undefined
                        : terminal.agentId && !resumableAgentIds.has(terminal.agentId)
                          ? `${providerMeta(terminal.agentId).name}: este agente não guarda sessão`
                          : 'este agente não guarda sessão'
                    }
                  >
                    <button
                      type="button"
                      aria-pressed={resume[terminal.id] === true}
                      disabled={!resumable}
                      aria-label={`restaurar sessão de ${label}`}
                      onClick={() => setResume((prev) => ({ ...prev, [terminal.id]: true }))}
                    >
                      sessão salva
                    </button>
                    <button
                      type="button"
                      aria-pressed={resume[terminal.id] !== true}
                      disabled={!resumable}
                      aria-label={`nova sessão para ${label}`}
                      onClick={() => setResume((prev) => ({ ...prev, [terminal.id]: false }))}
                    >
                      nova
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* SESS-04 */}
      <p className="restore-dialog__counter" role="status">
        {selectedCount}/{allTerminals.length} terminais selecionados
      </p>

      <div className="restore-dialog__actions">
        <button type="button" onClick={onStartFresh}>
          Começar do zero
        </button>
        <button
          type="button"
          ref={primaryRef}
          className="restore-dialog__primary"
          // SESS-09: sem nenhum terminal marcado não há o que restaurar —
          // quem quer abrir vazio usa "Começar do zero", que também limpa o
          // workspace salvo.
          disabled={selectedCount === 0}
          onClick={handleRestore}
        >
          Restaurar selecionados
        </button>
      </div>
    </div>
  )
}
