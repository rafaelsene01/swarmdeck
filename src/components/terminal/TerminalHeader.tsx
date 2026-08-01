// SPEC: multi-terminal (TERM-05, TERM-06)

export interface TerminalHeaderProps {
  /** Número sequencial exibido (#1..#4). */
  index: number
  title: string | null
  agent?: string | null
  status?: string | null
  /** Atividade mais recente do agente — mostrada no hover do header. */
  activity?: string | null
  /** Se true, fechar exige confirmação (há processo rodando). */
  hasActiveProcess?: boolean
  onMaximize?: () => void
  onMinimize?: () => void
  onClose?: () => void
}

/**
 * Identidade e ações de um terminal — puramente apresentacional (recebe
 * dados prontos via props, não busca nada sozinho). Ver
 * `.specs/codebase/TESTING.md` → matriz de cobertura.
 */
export default function TerminalHeader({
  index,
  title,
  agent,
  status,
  activity,
  hasActiveProcess = false,
  onMaximize,
  onMinimize,
  onClose,
}: TerminalHeaderProps) {
  const handleClose = () => {
    if (hasActiveProcess) {
      const confirmado = window.confirm(
        'Este terminal tem um processo ativo. Encerrar mesmo assim?',
      )
      if (!confirmado) return
    }
    onClose?.()
  }

  return (
    <header className="terminal-header" title={activity ?? undefined}>
      <span className="terminal-header__index">#{index}</span>
      <span className="terminal-header__title">{title ?? 'sem título'}</span>
      {agent && (
        <span className="terminal-header__agent-icon" aria-label={agent}>
          {agent}
        </span>
      )}
      {status && <span className="terminal-header__status-badge">{status}</span>}
      <div className="terminal-header__actions">
        <button type="button" onClick={onMinimize} aria-label="minimizar terminal">
          _
        </button>
        <button type="button" onClick={onMaximize} aria-label="maximizar terminal">
          □
        </button>
        <button type="button" onClick={handleClose} aria-label="fechar terminal">
          ×
        </button>
      </div>
    </header>
  )
}
