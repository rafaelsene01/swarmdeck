// SPEC: multi-terminal (TERM-05, TERM-06, TERM-12, TERM-13), terminal-statuses (STAT-01, STAT-06), terminal-chrome (CHROME-02), terminal-layout-options (LAYOUT-17), editor-launch (EDITOR-01), terminal-screenshot (SHOT-01, SHOT-23)

import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Camera, CopyPlus, GripVertical, Maximize2, Minus, RotateCcw, X } from 'lucide-react'
import InlineRename from '../shell/InlineRename'
import EditorMenu from './EditorMenu'
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
  /** SPEC: editor-launch (EDITOR-01) — pasta de trabalho deste terminal,
   * repassada ao `EditorMenu`. `undefined` deixa o botão desabilitado. */
  cwd?: string
  /** Se true, fechar exige confirmação (há processo rodando). */
  hasActiveProcess?: boolean
  onMaximize?: () => void
  onMinimize?: () => void
  /** Abre outro terminal na mesma aba com o mesmo projeto e provedor. */
  onClone?: () => void
  /** Reabre esta sessão do zero, mantendo projeto e provedor. */
  onReset?: () => void
  /** `false` desabilita clonar — a aba já está no teto de 4 terminais. */
  canClone?: boolean
  /**
   * SPEC: terminal-screenshot (SHOT-01) — captura este painel. Recebe o
   * próprio botão para que quem abre o modal saiba a quem devolver o foco
   * ao fechá-lo (SHOT-23).
   */
  onScreenshot?: (button: HTMLButtonElement) => void
  onClose?: () => void
  /**
   * Torna a alça a origem do arrasto de reordenação (LAYOUT-17). Sem esta
   * prop a alça segue decorativa, fora da ordem de leitura. Quem monta o
   * painel é que publica o id em `event.dataTransfer` — é ele que conhece o
   * id do terminal no grid (`id` aqui é o da sessão do backend, outra coisa).
   */
  onDragStartReorder?: (event: React.DragEvent) => void
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
  cwd,
  hasActiveProcess = false,
  onMaximize,
  onMinimize,
  onClone,
  onReset,
  canClone = true,
  onScreenshot,
  onClose,
  onDragStartReorder,
}: TerminalHeaderProps) {
  const draggable = Boolean(onDragStartReorder)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
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

  // Reset mata a sessão atual para abrir outra no lugar — mesma perda de
  // processo em curso que fechar, então pede a mesma confirmação.
  const handleReset = () => {
    if (hasActiveProcess) {
      const confirmado = window.confirm(
        'Reiniciar encerra o processo ativo deste terminal. Continuar?',
      )
      if (!confirmado) return
    }
    onReset?.()
  }

  const startEditingTitle = () => {
    setIsEditingTitle(true)
  }

  const cancelEditingTitle = () => {
    setIsEditingTitle(false)
  }

  const commitEditingTitle = (trimmed: string) => {
    setIsEditingTitle(false)
    if (trimmed === displayTitle) return

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
      {/* Alça de arrasto. Com `onDragStartReorder` ela é a origem do arrasto
          de reordenação (LAYOUT-17); sem a prop segue puramente visual — é
          ela que dá ao cabeçalho a leitura de "barra de título de janela" —
          e fora da ordem de leitura. O corpo do painel não serve como origem:
          roubaria a seleção de texto do xterm. */}
      <span
        className="terminal-header__grip-handle"
        style={{ display: 'inline-flex', cursor: draggable ? 'grab' : undefined }}
        draggable={draggable}
        aria-hidden={draggable ? undefined : true}
        aria-label={draggable ? 'reordenar terminal' : undefined}
        onDragStart={onDragStartReorder}
      >
        <GripVertical className="terminal-header__grip" size={14} aria-hidden="true" />
      </span>
      {isEditingTitle ? (
        <InlineRename
          value={displayTitle ?? ''}
          label="renomear terminal"
          onCommit={commitEditingTitle}
          onCancel={cancelEditingTitle}
        />
      ) : (
        <span
          className="terminal-header__title"
          role="button"
          tabIndex={0}
          onClick={startEditingTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              startEditingTitle()
            }
          }}
          title="clique para renomear"
        >
          {displayTitle ?? `Terminal ${index}`}
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
        {/* EDITOR-01: abre o `cwd` deste terminal num editor instalado. */}
        <EditorMenu cwd={cwd} />
        {/* SPEC: terminal-screenshot (SHOT-01) — captura direta deste painel:
            dentro do header do terminal não há o que selecionar. */}
        <button
          type="button"
          onClick={(event) => onScreenshot?.(event.currentTarget)}
          aria-label="capturar terminal"
          title="capturar este terminal"
        >
          <Camera size={13} aria-hidden="true" />
        </button>
        <button type="button" onClick={onMaximize} aria-label="maximizar terminal">
          <Maximize2 size={13} aria-hidden="true" />
        </button>
        <button type="button" onClick={onMinimize} aria-label="minimizar terminal">
          <Minus size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClone}
          disabled={!canClone}
          aria-label="clonar terminal"
          title={canClone ? 'clonar terminal' : 'a aba já tem 4 terminais'}
        >
          <CopyPlus size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          aria-label="reiniciar terminal"
          title="reiniciar com o mesmo projeto e provedor"
        >
          <RotateCcw size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="terminal-header__close"
          onClick={handleClose}
          aria-label="fechar terminal"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
