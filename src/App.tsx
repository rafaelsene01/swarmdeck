// SPEC: multi-terminal (TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06, TERM-07, TERM-08), terminal-tabs (TAB-01, TAB-02, TAB-03, TAB-04, TAB-05), terminal-chrome (CHROME-01, CHROME-02, CHROME-03), agent-selection (AGT-01, AGT-03, AGT-04), release-distribution (REL-52), quota-indicator (QUOTA-11)

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import GridLayout, { type Pane } from './components/grid/GridLayout'
import Header from './components/shell/Header'
import type { QuotaIndicatorProps } from './components/shell/QuotaIndicator'
import EmptyState from './components/shell/EmptyState'
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

/** Teto de terminais **por aba** — o grid 2×2 de `GridLayout` não vai além
 * disso. Mais que 4 terminais abertos ao mesmo tempo cabe agora em outra aba
 * (TAB-01), não em mais células. */
const MAX_TERMINALS = 4

/** Um conjunto de terminais visível de cada vez (TAB-01). As abas inativas
 * continuam montadas — só saem de vista —, então o PTY e o scrollback de cada
 * terminal sobrevivem à troca de aba, mesma garantia que `mode: 'minimized'`
 * já dava dentro de uma aba (TERM-08). */
interface TerminalTab {
  id: string
  name: string
  terminals: TerminalState[]
}

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

/** SPEC: terminal-tabs (TAB-03) — aba nova nasce vazia, no mesmo estado em
 * que o app abre (EMPTY-03). */
function createTab(name: string): TerminalTab {
  return { id: createTerminalId(), name, terminals: [] }
}

/** Redistribui a largura igualmente ao adicionar/remover um terminal —
 * mesma ideia de piso justo que `GridLayout` aplica ao arrasto (T8), só que
 * disparada por criação/fechamento em vez de arrasto de divisória. */
function evenWidths(terminals: TerminalState[]): TerminalState[] {
  const fracW = 1 / Math.max(terminals.length, 1)
  return terminals.map((t) => ({ ...t, fracW }))
}

export default function App() {
  // SPEC: shell-chrome (EMPTY-03) — boots with zero terminals so EmptyState
  // is reachable on fresh launch, not just after closing the last terminal.
  // SPEC: terminal-tabs (TAB-01) — os terminais passam a morar dentro de uma
  // aba; o app abre com uma aba vazia, que é o mesmo estado inicial de antes.
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [createTab('Aba 1')])
  /** `''` significa "a primeira aba" — evita ter que ler `tabs[0]` num
   * inicializador de `useState`, e é o mesmo caminho de queda usado quando a
   * aba ativa é fechada (TAB-02). */
  const [activeTabId, setActiveTabId] = useState('')
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
  // SPEC: multi-terminal (TERM-06)
  // Id REAL da sessão (o que `pty_spawn` devolve), reportado por
  // `TerminalPane` via `onSessionId` quando a promise resolve — chaveado
  // pelo `terminal.id` (UUID gerado no front, só identidade de painel/grid).
  // É ESTE id, não `terminal.id`, que precisa ir para `TerminalHeader`: é a
  // chave que `terminal_set_title` grava e que o agente usa via MCP — sem
  // isto o rename manual nunca colide com a escrita do agente (TERM-06).
  const [sessionIdByTerminalId, setSessionIdByTerminalId] = useState<Record<string, string>>({})
  // SPEC: release-distribution (REL-51, REL-52)
  // `02-background-auto-update` emite `update://available` (payload
  // `{ version }`) quando acha e baixa uma versão nova em segundo plano.
  // Só liga a bolinha (Header) uma vez por sessão — nunca desliga sozinha
  // (spec 03, Assumptions: "fica visível até o app fechar"), por isso um
  // `useState` simples em vez de guardar a versão em si (não usada aqui).
  const [hasUpdateAvailable, setHasUpdateAvailable] = useState(false)

  // SPEC: terminal-tabs (TAB-02) — `activeTabId` vazio (boot) ou apontando
  // para uma aba já fechada cai na primeira; `tabs` nunca fica vazio, mas o
  // último `??` mantém o tipo honesto sem `!`.
  const activeTab =
    tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? createTab('Aba 1')
  const terminals = activeTab.terminals

  /** Aplica `fn` só à aba ativa — todo handler de terminal passa por aqui,
   * para que nenhum deles precise saber que existem abas. */
  const setActiveTerminals = (fn: (prev: TerminalState[]) => TerminalState[]) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === activeTab.id ? { ...tab, terminals: fn(tab.terminals) } : tab)),
    )
  }

  // SPEC: terminal-tabs (TAB-03)
  const handleCreateTab = () => {
    const tab = createTab(`Aba ${tabs.length + 1}`)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }

  // SPEC: terminal-tabs (TAB-04) — fechar a aba desmonta seus `TerminalPane`,
  // e é a limpeza do próprio painel que chama `pty_kill`. A última aba nunca
  // fecha: sem aba não há onde criar terminal.
  const handleCloseTab = (id: string) => {
    if (tabs.length === 1) return
    const index = tabs.findIndex((tab) => tab.id === id)
    const remaining = tabs.filter((tab) => tab.id !== id)
    const next = remaining[Math.min(index, remaining.length - 1)]
    setTabs(remaining)
    if (id === activeTab.id && next) setActiveTabId(next.id)
  }

  // SPEC: quota-indicator (QUOTA-11)
  // A janela de Configurações é um `WebviewWindow` separado (SET-01) — uma
  // mudança de preferência lá não chega aqui por estado React compartilhado,
  // só pelo evento `quota://prefs-changed` (mesmo mecanismo de
  // `update://available` acima). `null` até a primeira leitura resolver:
  // mesmo efeito que `enabled: false` no `Header` (QUOTA-12).
  const [quotaPrefs, setQuotaPrefs] = useState<{
    enabled: boolean
    window: QuotaIndicatorProps['window']
  } | null>(null)

  useEffect(() => {
    const unlistenPromise = listen('update://available', () => {
      setHasUpdateAvailable(true)
    })

    return () => {
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void invoke<{ enabled: boolean; window: QuotaIndicatorProps['window'] }>(
      'quota_prefs_get',
    ).then((prefs) => {
      if (!cancelled) setQuotaPrefs(prefs)
    })

    const unlistenPromise = listen<{ enabled: boolean; window: QuotaIndicatorProps['window'] }>(
      'quota://prefs-changed',
      (event) => setQuotaPrefs(event.payload),
    )

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

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

  // SPEC: shell-chrome (EMPTY-07, EMPTY-08, EMPTY-09) — Ctrl+T only while
  // EmptyState is showing (no panel is mounted to steal the keystroke from);
  // re-bound whenever terminals.length or dialogOpen changes so the closure
  // never reads a stale value.
  useEffect(() => {
    if (terminals.length !== 0) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.key.toLowerCase() !== 't') return
      event.preventDefault()
      if (dialogOpen) return
      setDialogOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [terminals.length, dialogOpen])

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
  const handleResize = (id: string, fracW: number) => {
    setActiveTerminals((prev) => prev.map((t) => (t.id === id ? { ...t, fracW } : t)))
  }

  const handleMaximize = (id: string, currentMode: TerminalState['mode']) => {
    setActiveTerminals((prev) =>
      currentMode === 'maximized' ? restore(prev, id) : maximize(prev, id),
    )
  }

  const handleMinimize = (id: string, currentMode: TerminalState['mode']) => {
    setActiveTerminals((prev) =>
      currentMode === 'minimized' ? restore(prev, id) : minimize(prev, id),
    )
  }

  const handleCloseTerminal = (id: string) => {
    setActiveTerminals((prev) => evenWidths(close(prev, id)))
    setAgentByTerminalId((prev) => {
      const { [id]: _removed, ...rest } = prev
      return rest
    })
    setSessionIdByTerminalId((prev) => {
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
    setActiveTerminals((prev) => evenWidths([...prev, terminal]))
    setAgentByTerminalId((prev) => ({ ...prev, [terminal.id]: agentId }))
    setDialogOpen(false)
  }

  /** Conteúdo de uma aba. Toda aba é renderizada em todo quadro — a inativa
   * só recebe `display: none` — porque desmontar `TerminalPane` mataria o PTY
   * (a limpeza do efeito chama `pty_kill`). Ver TAB-01. */
  const renderTab = (tab: TerminalTab) => {
    const panes: Pane[] = tab.terminals.map((t) => ({
      id: t.id,
      fracW: t.fracW,
      fracH: t.fracH,
      mode: t.mode,
    }))
    const maximizedId = tab.terminals.find((t) => t.mode === 'maximized')?.id

    return (
      <div
        key={tab.id}
        className="app-tab-panel"
        style={{ display: tab.id === activeTab.id ? 'block' : 'none' }}
      >
        {tab.terminals.length === 0 ? (
          <EmptyState onCreateTerminal={() => setDialogOpen(true)} />
        ) : (
          <GridLayout
            panes={panes}
            onResize={handleResize}
            renderPane={(pane) => {
              const terminal = tab.terminals.find((t) => t.id === pane.id)
              if (!terminal) return null
              const index = tab.terminals.findIndex((t) => t.id === pane.id) + 1
              const isMaximized = terminal.mode === 'maximized'
              const isMinimized = terminal.mode === 'minimized'
              const hiddenByMaximize = maximizedId !== undefined && !isMaximized

              return (
                <div
                  className="app-pane"
                  style={{
                    // SPEC: terminal-chrome (CHROME-03) — maximizado sai do
                    // grid e cobre a janela inteira, header e barra de abas
                    // incluídos: `fixed` tira do fluxo e o z-index passa por
                    // cima dos dois (que não têm z-index próprio), ficando
                    // ainda abaixo do backdrop de diálogo (1000). Sem cantos
                    // arredondados nem sombra: não é mais um cartão.
                    position: isMaximized ? 'fixed' : undefined,
                    inset: isMaximized ? 0 : undefined,
                    zIndex: isMaximized ? 100 : undefined,
                    borderRadius: isMaximized ? 0 : undefined,
                    boxShadow: isMaximized ? 'none' : undefined,
                    display: hiddenByMaximize ? 'none' : undefined,
                    maxHeight: isMinimized ? '34px' : undefined,
                    overflow: isMinimized ? 'hidden' : undefined,
                  }}
                >
                  <TerminalHeader
                    index={index}
                    id={sessionIdByTerminalId[terminal.id]}
                    title={null}
                    hasActiveProcess
                    onMaximize={() => handleMaximize(terminal.id, terminal.mode)}
                    onMinimize={() => handleMinimize(terminal.id, terminal.mode)}
                    onClose={() => handleCloseTerminal(terminal.id)}
                  />
                  <div className="app-pane__body">
                    <TerminalPane
                      cwd={terminal.cwd}
                      agent={agentByTerminalId[terminal.id] ?? undefined}
                      onSessionId={(sessionId) =>
                        setSessionIdByTerminalId((prev) => ({ ...prev, [terminal.id]: sessionId }))
                      }
                    />
                  </div>
                </div>
              )
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* `.terminal-pane` (T7) e `.grid-layout__cell` (T8) não trazem altura
          própria — só a definem aqui, no ponto que os monta, em vez de em
          `styles.css` (fora dos arquivos permitidos a esta task). */}
      <style>{`
        .app-grid-area { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
        /* Cada aba preenche a área inteira; a inativa recebe display:none
           inline. Absoluto para que as abas se sobreponham em vez de empilhar
           — só uma está visível de cada vez. O padding aqui (e não em
           .app-grid-area) é o que afasta os cartões da borda da janela:
           filho absoluto se posiciona pela *padding box* do ancestral, então
           padding no ancestral seria ignorado. */
        .app-tab-panel { position: absolute; inset: 0; padding: var(--gap); }
        .app-tabbar {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          border-bottom: 1px solid var(--muted);
          flex: 0 0 auto;
          overflow-x: auto;
        }
        .app-tabbar__tab { display: inline-flex; align-items: center; border-radius: 4px; }
        .app-tabbar__tab[data-active='true'] { background: rgba(245, 183, 0, 0.18); }
        .app-tabbar button {
          background: transparent;
          border: none;
          color: var(--fg);
          padding: 0.25rem 0.5rem;
          cursor: pointer;
          font: inherit;
          white-space: nowrap;
        }
        .app-tabbar__count { margin-left: 0.35rem; opacity: 0.6; font-size: 0.8em; }
        .app-tabbar__close { padding: 0.25rem 0.35rem; opacity: 0.6; }
        .app-tabbar__close:hover { opacity: 1; }
        /* grid-layout__cell (T8) só define position relative|fixed via
           inline style — nenhum CSS em styles.css posiciona seus filhos.
           app-pane como bloco de altura 100% empurraria a divisória (T8,
           irmã seguinte no mesmo elemento da célula) para fora da área
           visível em fluxo normal; absoluto preenchendo a célula evita
           isso e deixa espaço para a tira de arrasto. overflow visible
           porque a divisória mora na calha do grid, fora da célula — quem
           recorta o conteúdo é o próprio cartão. */
        .grid-layout__cell { overflow: visible; }

        /* SPEC: terminal-chrome (CHROME-01) — cada terminal é uma "janela":
           cartão com barra de título, borda e cantos arredondados, separado
           dos vizinhos pela calha do grid. */
        .app-pane {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5), 0 10px 30px rgba(0, 0, 0, 0.28);
        }
        .app-pane__body {
          flex: 1 1 auto;
          min-height: 0;
          position: relative;
          overflow: hidden;
          background: var(--surface-2);
          padding: var(--gap);
        }

        /* SPEC: terminal-chrome (CHROME-02) — barra de título da janela. */
        .terminal-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex: 0 0 auto;
          height: 34px;
          padding: 0 0.3rem 0 0.4rem;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          color: var(--muted);
          font-size: 11px;
          user-select: none;
        }
        .terminal-header__grip { flex: 0 0 auto; opacity: 0.45; }
        .terminal-header__title,
        .terminal-header__title-input {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 600;
          color: #d7d7dd;
        }
        .terminal-header__title-input {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 0.15rem 0.35rem;
          font: inherit;
          font-weight: 600;
          outline: none;
        }
        .terminal-header__title-input:focus { border-color: var(--accent); }
        .terminal-header__actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
        .terminal-header__actions button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          padding: 0;
          border: 1px solid transparent;
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.04);
          color: var(--muted);
          cursor: pointer;
        }
        .terminal-header__actions button:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: var(--border);
          color: var(--fg);
        }
        .terminal-header__actions button:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 1px;
        }
        .terminal-header__close:hover {
          background: rgba(248, 113, 113, 0.18) !important;
          border-color: rgba(248, 113, 113, 0.4) !important;
          color: var(--danger) !important;
        }

        .grid-layout__divider {
          position: absolute;
          top: 0;
          right: calc(var(--gap) * -1);
          width: var(--gap);
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

      {/* SPEC: shell-chrome (HDR-01, HDR-08) — SET-01's settings_open wiring
          (src-tauri/src/windows/settings.rs) moved into onOpenSettings below. */}
      <Header
        onCreateTerminal={() => setDialogOpen(true)}
        onOpenSettings={() => void invoke('settings_open')}
        atMaxTerminals={terminals.length >= MAX_TERMINALS}
        hasUpdateAvailable={hasUpdateAvailable}
        quotaPrefs={quotaPrefs}
      />

      {/* SPEC: terminal-tabs (TAB-01, TAB-03, TAB-04) */}
      <div className="app-tabbar" role="tablist" aria-label="Abas de terminais">
        {tabs.map((tab) => (
          <span
            key={tab.id}
            className="app-tabbar__tab"
            data-active={tab.id === activeTab.id ? 'true' : undefined}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === activeTab.id}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.name}
              {tab.terminals.length > 0 && (
                <span className="app-tabbar__count">{tab.terminals.length}</span>
              )}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                className="app-tabbar__close"
                aria-label={`fechar ${tab.name}`}
                onClick={() => handleCloseTab(tab.id)}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button type="button" className="app-tabbar__new" aria-label="nova aba" onClick={handleCreateTab}>
          +
        </button>
      </div>

      <div className="app-grid-area">{tabs.map(renderTab)}</div>

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
