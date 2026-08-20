// SPEC: multi-terminal (TERM-05, TERM-12, TERM-13), terminal-statuses (STAT-01, STAT-06), terminal-chrome (CHROME-02, CHROME-04), terminal-layout-options (LAYOUT-17), editor-launch (EDITOR-01), terminal-screenshot (SHOT-01, SHOT-23), minimized-tray (MIN-13), projects (PROJ-11, PROJ-12), agent-permission-mode (PERM-07)

import { Camera, CopyPlus, GripVertical, Maximize2, Minimize2, Moon, RotateCcw, X } from 'lucide-react'
import EditorMenu from './EditorMenu'
import { PERMISSION_MODE_INFO, permissionModeLabel } from './AgentStep'
import StatusBadge from './StatusBadge'
import ActivityLog, { type ActivityEntry, sortByMostRecent } from './ActivityLog'

export interface TerminalHeaderProps {
  /** Número sequencial exibido (#1..#4). */
  index: number
  /** SPEC: projects (PROJ-11) — nome do projeto deste terminal, mostrado como
   * identidade do painel. `null` cai em `Terminal <n>`. Só leitura: o rename
   * manual do cabeçalho saiu (AD-020). */
  title: string | null
  agent?: string | null
  /**
   * SPEC: agent-permission-mode (PERM-07) — modo de permissão com que o
   * agente **desta** sessão foi lançado. `undefined`/`null` não renderiza
   * nada: shell puro e agente sem a flag não têm modo a mostrar.
   */
  permissionMode?: string | null
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
  /**
   * SPEC: terminal-chrome (CHROME-04) — `true` troca o controle de maximizar
   * pelo de restaurar (ícone e rótulo). O clique é o mesmo `onMaximize`:
   * quem monta o header é que alterna o modo.
   */
  isMaximized?: boolean
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
  /**
   * SPEC: projects (PROJ-11, PROJ-12) — o painel ainda é rascunho: não há PTY
   * atrás dele, então capturar, clonar, reiniciar e minimizar (AD-016) não têm
   * o que operar e não são renderizados. Fechar continua: é como se desiste do
   * wizard.
   */
  draft?: boolean
}

/**
 * Identidade e ações de um terminal — apresentacional: recebe tudo pronto via
 * props e não busca nem grava nada. O título é o nome do projeto, só leitura
 * (AD-020 revogou o gesto de rename manual no cabeçalho).
 */
export default function TerminalHeader({
  index,
  title,
  agent,
  permissionMode,
  status,
  statusColor,
  activities,
  cwd,
  hasActiveProcess = false,
  isMaximized = false,
  onMaximize,
  onMinimize,
  onClone,
  onReset,
  canClone = true,
  onScreenshot,
  onClose,
  onDragStartReorder,
  draft = false,
}: TerminalHeaderProps) {
  const draggable = Boolean(onDragStartReorder)

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
      <span className="terminal-header__title">{title ?? `Terminal ${index}`}</span>
      {agent && (
        <span className="terminal-header__agent-icon" aria-label={agent}>
          {agent}
        </span>
      )}
      {/* SPEC: agent-permission-mode (PERM-07) — deixa explícito, no cabeçalho,
          sob qual regime de permissão o agente está rodando. O `title` repete
          a descrição do modo, a mesma que o passo AGENT mostra na escolha. */}
      {permissionMode && (
        <span
          className="terminal-header__permission-mode"
          data-mode={permissionMode}
          title={PERMISSION_MODE_INFO[permissionMode]?.description ?? permissionMode}
        >
          {permissionModeLabel(permissionMode)}
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
        {!draft && (
          <button
            type="button"
            onClick={(event) => onScreenshot?.(event.currentTarget)}
            aria-label="capturar terminal"
            title="capturar este terminal"
          >
            <Camera size={13} aria-hidden="true" />
          </button>
        )}
        {/* SPEC: terminal-chrome (CHROME-04) — maximizado, o mesmo botão vira
            "restaurar": setas para dentro em vez de para fora. */}
        <button
          type="button"
          onClick={onMaximize}
          aria-label={isMaximized ? 'restaurar terminal' : 'maximizar terminal'}
          title={isMaximized ? 'restaurar tamanho' : 'maximizar terminal'}
        >
          {isMaximized ? (
            <Minimize2 size={13} aria-hidden="true" />
          ) : (
            <Maximize2 size={13} aria-hidden="true" />
          )}
        </button>
        {/* SPEC: minimized-tray (MIN-13) — esconder o terminal é "botar para
            dormir": mesma lua da bandeja do header, não um traço genérico. */}
        {!draft && (
          <button
            type="button"
            onClick={onMinimize}
            aria-label="minimizar terminal"
            title="minimizar para a bandeja"
          >
            <Moon size={13} aria-hidden="true" />
          </button>
        )}
        {!draft && (
          <button
            type="button"
            onClick={onClone}
            disabled={!canClone}
            aria-label="clonar terminal"
            title={canClone ? 'clonar terminal' : 'a aba já tem 4 terminais'}
          >
            <CopyPlus size={13} aria-hidden="true" />
          </button>
        )}
        {!draft && (
          <button
            type="button"
            onClick={handleReset}
            aria-label="reiniciar terminal"
            title="reiniciar com o mesmo projeto e provedor"
          >
            <RotateCcw size={13} aria-hidden="true" />
          </button>
        )}
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
