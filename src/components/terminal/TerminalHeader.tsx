// SPEC: multi-terminal (TERM-05, TERM-06), terminal-statuses (STAT-01, STAT-06)

import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import StatusBadge from './StatusBadge'
import ActivityLog, { type ActivityEntry, sortByMostRecent } from './ActivityLog'

export interface TerminalHeaderProps {
  /** Número sequencial exibido (#1..#4). */
  index: number
  /**
   * Id real da sessão do backend (o `TerminalId`/Uuid devolvido por
   * `pty_spawn`) — é a chave que `terminal_set_title` (T16) usa para
   * persistir um rename manual em `TerminalMetaService`. `undefined`
   * enquanto quem monta este header ainda não tiver esse id à mão (hoje
   * `App.tsx` não expõe o id real da sessão até o painel montar o próprio
   * `TerminalPane` — ver DESVIO no relatório de T16): o campo de edição
   * ainda abre, mas o rename fica só local, sem persistir.
   */
  id?: string
  title: string | null
  agent?: string | null
  /** Rótulo do status ativo (STAT-01) — `undefined`/`null` não renderiza badge. */
  status?: string | null
  /** Cor do status ativo (STAT-01), repassada ao `StatusBadge`. */
  statusColor?: string | null
  /**
   * Histórico de atividades do agente (STAT-05, STAT-06), em qualquer ordem
   * de chegada — repassado direto para `ActivityLog`, que ordena e expõe a
   * mais recente no hover. `undefined`/vazio não renderiza o log.
   */
  activities?: ActivityEntry[]
  /** Se true, fechar exige confirmação (há processo rodando). */
  hasActiveProcess?: boolean
  onMaximize?: () => void
  onMinimize?: () => void
  onClose?: () => void
}

/**
 * Identidade e ações de um terminal — apresentacional (recebe dados prontos
 * via props, não busca nada sozinho), com uma exceção pontual: o rename
 * manual (TERM-06) chama `terminal_set_title` diretamente, no mesmo padrão
 * já usado por `NewTerminalDialog.tsx` para suas próprias ações locais (ex.
 * `terminal_picker_set_last_dir`) — não é uma regra de negócio, é só a ponte
 * para `TerminalMetaService::set_title` (mcp-task-server, já testado). Ver
 * `.specs/codebase/TESTING.md` → matriz de cobertura.
 */
export default function TerminalHeader({
  index,
  id,
  title,
  agent,
  status,
  statusColor,
  activities,
  hasActiveProcess = false,
  onMaximize,
  onMinimize,
  onClose,
}: TerminalHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  // Sobrepõe `title` depois de um rename bem-sucedido: `App.tsx` hoje não
  // realimenta um título atualizado de volta nesta prop (gap de integração,
  // ver relatório de T16), então o header precisa lembrar sozinho do último
  // valor que o próprio usuário confirmou.
  const [renamedTitle, setRenamedTitle] = useState<string | null>(null)

  const displayTitle = renamedTitle ?? title

  // STAT-06: a mesma ordenação usada por `ActivityLog` decide qual atividade
  // aparece no tooltip nativo do header (hover sobre o terminal inteiro,
  // critério 3 de "Título geral vs atividade") — reutilizada em vez de
  // reimplementada, para não haver duas fontes de "qual é a mais recente".
  const latestActivity = activities?.length ? sortByMostRecent(activities)[0]?.activity : undefined

  const handleClose = () => {
    if (hasActiveProcess) {
      const confirmado = window.confirm(
        'Este terminal tem um processo ativo. Encerrar mesmo assim?',
      )
      if (!confirmado) return
    }
    onClose?.()
  }

  const startEditingTitle = () => {
    setDraftTitle(displayTitle ?? '')
    setIsEditingTitle(true)
  }

  const cancelEditingTitle = () => {
    setIsEditingTitle(false)
  }

  const commitEditingTitle = () => {
    setIsEditingTitle(false)
    const trimmed = draftTitle.trim()
    if (!trimmed || trimmed === displayTitle) return

    setRenamedTitle(trimmed)
    if (id) {
      // TERM-06: `TitleSource::User` sempre vence sobre uma chamada seguinte
      // do agente — regra já implementada e testada em
      // `TerminalMetaService::set_title` (meta.rs); este comando só expõe
      // essa chamada ao header.
      void invoke('terminal_set_title', { id, title: trimmed }).catch(() => {})
    }
  }

  return (
    <header className="terminal-header" title={latestActivity}>
      <span className="terminal-header__index">#{index}</span>
      {isEditingTitle ? (
        <input
          className="terminal-header__title-input"
          value={draftTitle}
          autoFocus
          aria-label="renomear terminal"
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={commitEditingTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitEditingTitle()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              cancelEditingTitle()
            }
          }}
        />
      ) : (
        <span
          className="terminal-header__title"
          onDoubleClick={startEditingTitle}
          title="duplo-clique para renomear"
        >
          {displayTitle ?? 'sem título'}
        </span>
      )}
      {agent && (
        <span className="terminal-header__agent-icon" aria-label={agent}>
          {agent}
        </span>
      )}
      <StatusBadge label={status} color={statusColor} />
      {activities && activities.length > 0 && (
        <details className="terminal-header__activity-log">
          <summary aria-label="log de atividade">log</summary>
          <ActivityLog entries={activities} />
        </details>
      )}
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
