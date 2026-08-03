// SPEC: multi-terminal (TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-07, TERM-08), agent-selection (AGT-01, AGT-03, AGT-04)

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import GridLayout, { type Pane } from './components/grid/GridLayout'
import TerminalPane from './components/terminal/TerminalPane'
import TerminalHeader from './components/terminal/TerminalHeader'
import NewTerminalDialog from './components/terminal/NewTerminalDialog'
import type { AgentDescriptor } from './routes/settings/AgentPanel'
import { type TerminalState, maximize, minimize, restore, close } from './state/terminals'

// SPEC: agent-selection (AGT-01, AGT-04)
// Forma devolvida por `agent_catalog` (T5, invólucro sobre
// `agents::catalog::detect_installed`, T1) — `AgentDescriptor` mais o status
// de instalação, que aqui vira `installedIds` para o diálogo.
interface AgentCatalogEntry extends AgentDescriptor {
  installed: boolean
}

/** Limite do v1 — ver `spec.md` → "Fora de escopo" (mais de 4 terminais). */
const MAX_TERMINALS = 4

function createTerminalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback só para ambientes sem `crypto.randomUUID` (não usado no alvo real).
  return `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Mesma regra do `layout::default_entry` do backend (T11): sem layout salvo
 * para restaurar, abre com 1 terminal em `home`. Não há comando Tauri que
 * exponha `layout::restore` ao frontend ainda (ver relatório desta task) —
 * este é o ponto de partida em memória até essa ponte existir. */
function defaultTerminal(): TerminalState {
  return { id: createTerminalId(), cwd: '.', fracW: 1, fracH: 1, mode: 'normal' }
}

/** Redistribui a largura igualmente ao adicionar/remover um terminal —
 * mesma ideia de piso justo que `GridLayout` aplica ao arrasto (T8), só que
 * disparada por criação/fechamento em vez de arrasto de divisória. */
function evenWidths(terminals: TerminalState[]): TerminalState[] {
  const fracW = 1 / Math.max(terminals.length, 1)
  return terminals.map((t) => ({ ...t, fracW }))
}

export default function App() {
  const [terminals, setTerminals] = useState<TerminalState[]>(() => [defaultTerminal()])
  const [dialogOpen, setDialogOpen] = useState(false)

  // SPEC: agent-selection (AGT-01, AGT-03, AGT-04)
  // Catálogo real e padrão efetivo, buscados uma vez no mount — antes disto
  // `NewTerminalDialog` recebia `agents={[]}`/`defaultAgentId={null}` fixos
  // (ver git blame / relatório da task T5) e a pré-seleção do padrão (AGT-01)
  // e a marcação de "não instalado" (AGT-04) nunca aconteciam de verdade.
  const [agents, setAgents] = useState<AgentDescriptor[]>([])
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null)
  // Agente escolhido por sessão (AGT-03): sobrescreve o padrão só para o
  // terminal criado com aquela escolha, sem tocar a preferência global.
  const [agentByTerminalId, setAgentByTerminalId] = useState<Record<string, string | null>>({})

  useEffect(() => {
    let cancelled = false

    void invoke<AgentCatalogEntry[]>('agent_catalog').then((entries) => {
      if (cancelled) return
      setAgents(entries.map(({ installed: _installed, ...agent }) => agent))
      setInstalledIds(new Set(entries.filter((entry) => entry.installed).map((entry) => entry.id)))
    })

    void invoke<string | null>('agent_default').then((id) => {
      if (!cancelled) setDefaultAgentId(id)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const panes: Pane[] = terminals.map((t) => ({
    id: t.id,
    fracW: t.fracW,
    fracH: t.fracH,
    mode: t.mode,
  }))

  // `GridLayout` (T8) só relê a prop `panes` quando a contagem muda — troca
  // de `mode` (maximizar/minimizar/restaurar) com a mesma contagem fica
  // presa no snapshot interno do componente (`localPanes`), e `GridLayout`
  // não está na lista de arquivos que esta task pode tocar. Em vez de forçar
  // remount (isso já foi tentado e descartado: mata e resspawna o PTY de
  // *todos* os terminais a cada criação/troca de modo — ver DESVIO no
  // relatório desta task), o destaque/ocultação de "maximizado"/"minimizado"
  // é calculado aqui, a partir do estado sempre atualizado de `terminals`,
  // e aplicado como estilo inline no wrapper de cada painel — independente
  // do que o cálculo (potencialmente obsoleto) de `GridLayout` decida fazer
  // com o próprio `<div>` da célula.
  const maximizedId = terminals.find((t) => t.mode === 'maximized')?.id

  const handleResize = (id: string, fracW: number) => {
    setTerminals((prev) => prev.map((t) => (t.id === id ? { ...t, fracW } : t)))
  }

  const handleMaximize = (id: string, currentMode: TerminalState['mode']) => {
    setTerminals((prev) => (currentMode === 'maximized' ? restore(prev, id) : maximize(prev, id)))
  }

  const handleMinimize = (id: string, currentMode: TerminalState['mode']) => {
    setTerminals((prev) => (currentMode === 'minimized' ? restore(prev, id) : minimize(prev, id)))
  }

  const handleCloseTerminal = (id: string) => {
    setTerminals((prev) => evenWidths(close(prev, id)))
    setAgentByTerminalId((prev) => {
      const { [id]: _removed, ...rest } = prev
      return rest
    })
  }

  // SPEC: agent-selection (AGT-03)
  // `agentId` escolhido no diálogo (troca local à sessão, `NewTerminalDialog`
  // já garante isso) precisa sobreviver até `TerminalPane`/`pty_spawn` — antes
  // desta task o parâmetro era descartado (`_agentId`) e todo terminal
  // arrancava sem `agent`, caindo sempre no shell puro.
  const handleCreate = (cwd: string, agentId: string | null) => {
    const terminal = { ...defaultTerminal(), cwd: cwd.trim() || '.' }
    setTerminals((prev) => evenWidths([...prev, terminal]))
    setAgentByTerminalId((prev) => ({ ...prev, [terminal.id]: agentId }))
    setDialogOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* `.terminal-pane` (T7) e `.grid-layout__cell` (T8) não trazem altura
          própria — só a definem aqui, no ponto que os monta, em vez de em
          `styles.css` (fora dos arquivos permitidos a esta task). */}
      <style>{`
        .app-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid #222;
          flex: 0 0 auto;
        }
        .app-toolbar__title { color: var(--accent); font-weight: 600; }
        .app-grid-area { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
        /* grid-layout__cell (T8) só define position relative|fixed via
           inline style — nenhum CSS em styles.css posiciona seus filhos.
           app-pane como bloco de altura 100% empurraria a divisória (T8,
           irmã seguinte no mesmo elemento da célula) para fora da área
           visível em fluxo normal; absoluto preenchendo a célula evita
           isso e deixa espaço para a tira de arrasto. */
        .grid-layout__cell { overflow: hidden; }
        .app-pane { position: absolute; inset: 0; display: flex; flex-direction: column; }
        .app-pane__body { flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden; }
        .grid-layout__divider {
          position: absolute;
          top: 0;
          right: -4px;
          width: 8px;
          height: 100%;
          cursor: col-resize;
          z-index: 5;
        }
        .grid-layout__divider:hover { background: rgba(245, 183, 0, 0.35); }
        .terminal-pane { width: 100%; height: 100%; }
        /* NewTerminalDialog (agent-selection/T4) não traz posicionamento
           próprio — é apresentacional, recebe o layout de quem monta. Sem
           isto ele nasce inline no fim da coluna, onde a camada de scroll
           do xterm.js (sem clipping) fica por cima e intercepta cliques
           nos botões do diálogo. Modal com backdrop é o tratamento correto
           de qualquer forma. */
        .app-dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.6);
        }
        .app-dialog-backdrop .new-terminal-dialog {
          background: #1c1c1f;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 1.25rem 1.5rem;
          min-width: 320px;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
      `}</style>

      <div className="app-toolbar">
        <span className="app-toolbar__title">SwarmDeck</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            disabled={terminals.length >= MAX_TERMINALS}
            title={
              terminals.length >= MAX_TERMINALS
                ? `Limite de ${MAX_TERMINALS} terminais atingido`
                : undefined
            }
          >
            + novo terminal
          </button>
          {/* SPEC: settings-shell (SET-01) — abre/foca a janela dedicada de
              Configurações; ver `src-tauri/src/windows/settings.rs`. */}
          <button type="button" onClick={() => void invoke('settings_open')}>
            Configurações
          </button>
        </div>
      </div>

      <div className="app-grid-area">
        <GridLayout
          panes={panes}
          onResize={handleResize}
          renderPane={(pane) => {
            const terminal = terminals.find((t) => t.id === pane.id)
            if (!terminal) return null
            const index = terminals.findIndex((t) => t.id === pane.id) + 1
            const isMaximized = terminal.mode === 'maximized'
            const isMinimized = terminal.mode === 'minimized'
            const hiddenByMaximize = maximizedId !== undefined && !isMaximized

            return (
              <div
                className="app-pane"
                style={{
                  position: isMaximized ? 'fixed' : undefined,
                  inset: isMaximized ? 0 : undefined,
                  zIndex: isMaximized ? 20 : undefined,
                  display: hiddenByMaximize ? 'none' : undefined,
                  maxHeight: isMinimized ? '2rem' : undefined,
                  overflow: isMinimized ? 'hidden' : undefined,
                }}
              >
                <TerminalHeader
                  index={index}
                  title={null}
                  hasActiveProcess
                  onMaximize={() => handleMaximize(terminal.id, terminal.mode)}
                  onMinimize={() => handleMinimize(terminal.id, terminal.mode)}
                  onClose={() => handleCloseTerminal(terminal.id)}
                />
                <div className="app-pane__body">
                  <TerminalPane cwd={terminal.cwd} agent={agentByTerminalId[terminal.id] ?? undefined} />
                </div>
              </div>
            )
          }}
        />
      </div>

      {dialogOpen && (
        <div className="app-dialog-backdrop">
          <NewTerminalDialog
            agents={agents}
            installedIds={installedIds}
            defaultAgentId={defaultAgentId}
            onConfirm={handleCreate}
            onCancel={() => setDialogOpen(false)}
          />
        </div>
      )}
    </div>
  )
}
