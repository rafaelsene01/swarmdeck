// SPEC: multi-terminal (TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06, TERM-07, TERM-08, TERM-12, TERM-13), terminal-tabs (TAB-01, TAB-02, TAB-03, TAB-04, TAB-05, TAB-06), terminal-chrome (CHROME-01, CHROME-02, CHROME-03), agent-selection (AGT-01, AGT-03, AGT-04), release-distribution (REL-52), quota-indicator (QUOTA-11), terminal-layout-options (LAYOUT-15, LAYOUT-16, LAYOUT-17, LAYOUT-19, LAYOUT-20, LAYOUT-21, LAYOUT-22, LAYOUT-23, LAYOUT-24, LAYOUT-25, LAYOUT-26), session-restore (SESS-01, SESS-02, SESS-06, SESS-07, SESS-08, SESS-10, SESS-11, SESS-15, SESS-16, SESS-17)

import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import GridLayout, { type Pane } from './components/grid/GridLayout'
import Header from './components/shell/Header'
import type { QuotaIndicatorProps } from './components/shell/QuotaIndicator'

/** Espelha `QuotaPrefs` de `src-tauri/src/db/quota_prefs.rs` — o mesmo tipo
 * volta de `quota_prefs_get` e do evento `quota://prefs-changed`. */
interface QuotaPrefsPayload {
  enabled: boolean
  window: QuotaIndicatorProps['window']
  providers?: { id: string; enabled: boolean }[]
}
import EmptyState from './components/shell/EmptyState'
import InlineRename from './components/shell/InlineRename'
import RestoreSessionDialog, {
  type RestoreSelection,
} from './components/shell/RestoreSessionDialog'
import TerminalPane from './components/terminal/TerminalPane'
import TerminalHeader from './components/terminal/TerminalHeader'
import NewTerminalDialog from './components/terminal/NewTerminalDialog'
import type { AgentDescriptor } from './routes/settings/AgentPanel'
import {
  type LayoutEntry,
  type TerminalState,
  fromLayoutEntries,
  maximize,
  minimize,
  moveTerminal,
  restore,
  close,
  toLayoutEntries,
} from './state/terminals'
import { DEFAULT_LAYOUT, type TabLayout } from './state/layout'

/** Espelha `TabEntry` de `src-tauri/src/terminal/layout.rs` — o mesmo tipo
 * volta de `terminal_workspace_get` e é o argumento de
 * `terminal_workspace_set`. `agentId` não faz parte do `LayoutEntry` do
 * front (é estado à parte, `agentByTerminalId`), então entra aqui. */
interface WorkspaceTerminal extends LayoutEntry {
  agentId?: string | null
}

interface WorkspaceTab {
  id: string
  slot: number
  name: string
  /** Já normalizado pelo backend (LAYOUT-28), nunca um valor desconhecido. */
  layoutMode: TabLayout['mode']
  layoutSpan: TabLayout['span']
  terminals: WorkspaceTerminal[]
}

/** Tipo MIME do arrasto de reordenação — próprio, para que soltar qualquer
 * outra coisa sobre um painel não seja confundido com reordenar. */
const REORDER_MIME = 'text/swarmdeck-terminal'

// SPEC: agent-selection (AGT-01, AGT-04)
// Forma devolvida por `agent_catalog` (T5, invólucro sobre
// `agents::catalog::detect_installed`, T1) — `AgentDescriptor` mais o status
// de instalação, que aqui vira `installedIds` para o diálogo.
interface AgentCatalogEntry extends AgentDescriptor {
  installed: boolean
  /** SPEC: session-restore (SESS-15) — o CLI aceita `--resume <id>`. */
  supportsSessionResume?: boolean
}

/** Janela de espera antes de gravar o workspace (LAYOUT-21). `handleResize`
 * dispara a cada `pointermove` do arrasto de divisória; gravar em SQLite por
 * evento de mouse seria desperdício. A última mudança da rajada vence. */
const SAVE_DEBOUNCE_MS = 500

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
  /** Disposição escolhida para esta aba — o escopo do modo é por aba, não
   * global (LAYOUT-15). */
  layout: TabLayout
}

function createTerminalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback só para ambientes sem `crypto.randomUUID` (não usado no alvo real).
  return `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** SPEC: session-restore (SESS-10) — id da **sessão do agente**, distinto do
 * `terminal.id` (identidade de painel no grid). Precisa ser UUID: é o que o
 * `claude --session-id` exige. Mesma fonte de `createTerminalId`, nome
 * separado para que a distinção fique visível em quem chama. */
function createAgentSessionId(): string {
  return createTerminalId()
}

/** Terminal recém-criado pela UI, antes de qualquer `cwd` escolhido. Não é
 * mais o ponto de partida do app: desde LAYOUT-23 quem decide o estado
 * inicial é `terminal_workspace_get`, e sem nada salvo o app abre numa aba
 * vazia com o `EmptyState` (LAYOUT-24) — `layout::default_entry` foi removido
 * justamente porque inventava um terminal onde EMPTY-03 pede nenhum. */
function defaultTerminal(): TerminalState {
  return {
    id: createTerminalId(),
    cwd: '.',
    fracW: 1,
    fracH: 1,
    mode: 'normal',
    // SESS-10: todo terminal nasce com sessão própria fixada pelo app — é o
    // que torna a retomada possível no boot seguinte.
    agentSessionId: createAgentSessionId(),
    resumeSession: false,
  }
}

/** SPEC: terminal-tabs (TAB-03) — aba nova nasce vazia, no mesmo estado em
 * que o app abre (EMPTY-03). */
function createTab(name: string): TerminalTab {
  return { id: createTerminalId(), name, terminals: [], layout: DEFAULT_LAYOUT }
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
  /** Id da aba em renomeação inline (TAB-06); `null` = nenhuma. */
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // SPEC: agent-selection (AGT-01, AGT-03, AGT-04)
  // Catálogo real e padrão efetivo, buscados uma vez no mount — antes disto
  // `NewTerminalDialog` recebia `agents={[]}`/`defaultAgentId={null}` fixos
  // (ver git blame / relatório da task T5) e a pré-seleção do padrão (AGT-01)
  // e a marcação de "não instalado" (AGT-04) nunca aconteciam de verdade.
  const [agents, setAgents] = useState<AgentDescriptor[]>([])
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  /** SPEC: session-restore (SESS-15) — ids cujo CLI aceita `--resume`; o modal
   * usa isto para decidir se o switch fica ativo ou travado. */
  const [resumableAgentIds, setResumableAgentIds] = useState<Set<string>>(new Set())
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
  // Contador de reinícios por terminal. Entra na `key` do `TerminalPane`:
  // incrementar remonta o painel, e é a limpeza do próprio efeito que chama
  // `pty_kill` e o mount seguinte que chama `pty_spawn` com o mesmo `cwd` e
  // o mesmo agente — não há comando de "reiniciar sessão" no backend, nem
  // precisa haver. A `key` mora no `TerminalPane`, não no `Pane` do grid:
  // trocar o id do terminal aqui mudaria a identidade do painel no grid, e
  // com ela a `key` de reconciliação — remontando o que se queria preservar.
  const [resetNonceByTerminalId, setResetNonceByTerminalId] = useState<Record<string, number>>({})
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
  const [quotaPrefs, setQuotaPrefs] = useState<QuotaPrefsPayload | null>(null)

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

    void invoke<QuotaPrefsPayload>('quota_prefs_get').then((prefs) => {
      if (!cancelled) setQuotaPrefs(prefs)
    })

    const unlistenPromise = listen<QuotaPrefsPayload>('quota://prefs-changed', (event) =>
      setQuotaPrefs(event.payload),
    )

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  // SPEC: terminal-layout-options (LAYOUT-23, LAYOUT-24, LAYOUT-26)
  // Guarda contra apagar o que acabou de ser lido: o efeito de gravação
  // (T12) é inerte enquanto isto for `false`. Sem ele o primeiro render (uma
  // aba vazia) gravaria por cima do workspace salvo antes da leitura chegar.
  const hydrated = useRef(false)

  /** SPEC: session-restore (SESS-01) — workspace lido no boot, **segurado**
   * até o usuário confirmar no modal. Enquanto isto não for `null` nenhum
   * `TerminalPane` está montado: `tabs` continua sendo a aba vazia inicial, e
   * é isso que garante que nenhum PTY sobe antes da escolha. */
  const [pendingRestore, setPendingRestore] = useState<WorkspaceTab[] | null>(null)

  /** Aplica um workspace ao estado do app. Usado pelo caminho sem modal
   * (SESS-02) e pela confirmação do modal (SESS-06). */
  const applyWorkspace = (saved: WorkspaceTab[], resumeByTerminalId: Record<string, boolean>) => {
    setTabs(
      saved.map((tab) => ({
        id: tab.id,
        name: tab.name,
        terminals: fromLayoutEntries(tab.terminals).map((terminal) => {
          const resume = resumeByTerminalId[terminal.id] === true
          return {
            ...terminal,
            // SESS-16: "nova sessão" (e terminal salvo sem id) arranca com id
            // novo; só a retomada reusa o id salvo.
            agentSessionId: resume ? terminal.agentSessionId : createAgentSessionId(),
            resumeSession: resume,
          }
        }),
        layout: { mode: tab.layoutMode, span: tab.layoutSpan },
      })),
    )
    setAgentByTerminalId(
      Object.fromEntries(
        saved.flatMap((tab) => tab.terminals.map((t) => [t.id, t.agentId ?? null])),
      ),
    )
    hydrated.current = true
  }

  useEffect(() => {
    let cancelled = false

    void invoke<WorkspaceTab[]>('terminal_workspace_get')
      .then((saved) => {
        if (cancelled) return

        // Vetor vazio (primeira execução) mantém a aba vazia inicial com o
        // `EmptyState` — LAYOUT-24, que preserva EMPTY-03.
        if (!saved?.length) {
          hydrated.current = true
          return
        }

        // SESS-01 / SESS-02: só há o que confirmar quando existe terminal
        // salvo. Workspace só com abas vazias volta direto, sem modal —
        // `hydrated` fica `false` enquanto o modal estiver aberto, o que
        // impede o efeito de gravação de apagar o que ainda não foi decidido.
        if (saved.some((tab) => tab.terminals.length > 0)) {
          setPendingRestore(saved)
          return
        }

        applyWorkspace(saved, {})
      })
      // LAYOUT-26: leitura que falha registra o erro e deixa o app abrir na
      // aba vazia; nunca impede a abertura — e sem modal.
      .catch((error) => {
        console.error('falha ao restaurar o workspace de terminais', error)
        if (!cancelled) hydrated.current = true
      })

    return () => {
      cancelled = true
    }
  }, [])

  /** SPEC: session-restore (SESS-06, SESS-16) — restaura só o marcado. */
  const handleRestoreSelection = (selection: RestoreSelection) => {
    const saved = pendingRestore ?? []
    const keptTabs = new Set(selection.tabIds)
    const keptTerminals = new Set(selection.terminalIds)

    applyWorkspace(
      saved
        .filter((tab) => keptTabs.has(tab.id))
        .map((tab) => ({
          ...tab,
          terminals: tab.terminals.filter((terminal) => keptTerminals.has(terminal.id)),
        })),
      selection.resumeByTerminalId,
    )
    setPendingRestore(null)
  }

  /** SPEC: session-restore (SESS-07, SESS-08) — "Começar do zero", o × e
   * Escape: uma aba vazia, nenhum terminal. `hydrated` passa a `true` aqui,
   * então o efeito de gravação substitui o workspace salvo por este estado. */
  const handleStartFresh = () => {
    setTabs([createTab('Aba 1')])
    setActiveTabId('')
    setAgentByTerminalId({})
    hydrated.current = true
    setPendingRestore(null)
  }

  // SPEC: terminal-layout-options (LAYOUT-21, LAYOUT-22)
  // Grava o workspace inteiro 500 ms depois da última mudança de abas,
  // terminais, layout ou agentes. Inerte enquanto a leitura do boot não
  // resolveu: sem essa guarda o primeiro render (uma aba vazia) gravaria por
  // cima do que ainda está sendo lido.
  useEffect(() => {
    if (!hydrated.current) return

    const timer = setTimeout(() => {
      const payload: WorkspaceTab[] = tabs.map((tab, index) => ({
        id: tab.id,
        slot: index,
        name: tab.name,
        layoutMode: tab.layout.mode,
        layoutSpan: tab.layout.span,
        terminals: toLayoutEntries(tab.terminals).map((entry) => ({
          ...entry,
          agentId: agentByTerminalId[entry.id] ?? null,
        })),
      }))

      void invoke('terminal_workspace_set', { tabs: payload }).catch((error) =>
        console.error('falha ao gravar o workspace de terminais', error),
      )
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [tabs, agentByTerminalId])

  useEffect(() => {
    let cancelled = false

    void invoke<AgentCatalogEntry[]>('agent_catalog').then((entries) => {
      if (cancelled) return
      setAgents(
        entries.map(
          ({ installed: _installed, supportsSessionResume: _resume, ...agent }) => agent,
        ),
      )
      setInstalledIds(new Set(entries.filter((entry) => entry.installed).map((entry) => entry.id)))
      setResumableAgentIds(
        new Set(entries.filter((entry) => entry.supportsSessionResume).map((entry) => entry.id)),
      )
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

  // `GridLayout` sincroniza `panes` pela sequência de ids (AD-011), então
  // reordenar chega ao grid. Trocar só o `mode` com a mesma ordem continua
  // preso no snapshot interno (`localPanes`), e é por isso que o
  // destaque/ocultação de "maximizado"/"minimizado" segue calculado aqui, a
  // partir do estado sempre atualizado de `terminals`, e aplicado como
  // estilo inline no wrapper de cada painel. Forçar remount resolveria os
  // dois de uma vez, mas mata e respawna o PTY de *todos* os terminais a
  // cada troca de modo — já foi tentado e descartado.
  const handleResize = (id: string, fracW: number) => {
    setActiveTerminals((prev) => prev.map((t) => (t.id === id ? { ...t, fracW } : t)))
  }

  /** Painel sob o cursor durante um arrasto de reordenação (LAYOUT-17). */
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  /** SPEC: terminal-layout-options (LAYOUT-25) — o backend abre em home o
   * terminal cujo `cwd` salvo sumiu e diz qual era. Sem este aviso a troca
   * seria silenciosa. Um clique dispensa o aviso inteiro pelo resto da
   * sessão; ele só reaparece na próxima restauração. */
  const [cwdWarningDismissed, setCwdWarningDismissed] = useState(false)
  const cwdFallbacks = tabs.flatMap((tab) =>
    tab.terminals.flatMap((t) => (t.cwdFallbackFrom ? [{ id: t.id, from: t.cwdFallbackFrom }] : [])),
  )

  /** SPEC: terminal-layout-options (LAYOUT-15) — o modo vale só para a aba
   * ativa; as demais mantêm o delas. */
  const handleLayoutChange = (layout: TabLayout) => {
    setTabs((prev) => prev.map((tab) => (tab.id === activeTab.id ? { ...tab, layout } : tab)))
  }

  /** SPEC: terminal-layout-options (LAYOUT-16, LAYOUT-19, LAYOUT-20) — solta
   * sobre `targetId`: o arrastado assume aquela posição e o grid reaplica o
   * plano do modo à nova ordem. Soltar sem o id (arrasto de outra origem) ou
   * sobre si mesmo não muda nada; `moveTerminal` já trata este último. */
  const handleReorderDrop = (targetId: string) => (event: React.DragEvent) => {
    event.preventDefault()
    setDropTargetId(null)
    const draggedId = event.dataTransfer?.getData(REORDER_MIME)
    if (!draggedId) return
    setActiveTerminals((prev) => moveTerminal(prev, draggedId, targetId))
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

  /** Clonar: outro terminal na mesma aba, mesmo projeto (`cwd`) e mesmo
   * provedor. Respeita o teto de 4 por aba — o botão já vem desabilitado no
   * header, esta guarda é a que vale se ele for chamado de outro caminho. */
  const handleCloneTerminal = (id: string) => {
    const source = terminals.find((t) => t.id === id)
    if (!source || terminals.length >= MAX_TERMINALS) return

    // SESS-11: `defaultTerminal` já dá um id de sessão novo ao clone. Herdar
    // o do original apontaria os dois painéis para a mesma conversa do CLI —
    // TERM-12 pede mesmo `cwd` e mesmo provedor, nunca a mesma conversa.
    const clone = { ...defaultTerminal(), cwd: source.cwd }
    setActiveTerminals((prev) => evenWidths([...prev, clone]))
    setAgentByTerminalId((prev) => ({ ...prev, [clone.id]: prev[id] ?? null }))
  }

  /** Reiniciar: mata a sessão e abre outra no mesmo painel, com o mesmo
   * `cwd` e o mesmo agente. O id da sessão antiga é descartado junto — o
   * novo chega por `onSessionId` quando o `pty_spawn` do remount resolver.
   *
   * SPEC: session-restore (SESS-17) — a conversa do agente também recomeça:
   * id de sessão novo e `resumeSession: false`. Reusar o id salvo aqui
   * devolveria o contexto que TERM-13 promete zerar. */
  const handleResetTerminal = (id: string) => {
    setActiveTerminals((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, agentSessionId: createAgentSessionId(), resumeSession: false }
          : t,
      ),
    )
    setResetNonceByTerminalId((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
    setSessionIdByTerminalId((prev) => {
      const { [id]: _removed, ...rest } = prev
      return rest
    })
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
    setResetNonceByTerminalId((prev) => {
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
            layout={tab.layout}
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
                  // SPEC: terminal-layout-options (LAYOUT-17) — alvo do
                  // arrasto de reordenação. `preventDefault` no dragover é o
                  // que habilita o drop; sem ele o `onDrop` nunca dispara.
                  data-drop-target={dropTargetId === terminal.id ? 'true' : undefined}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDropTargetId(terminal.id)
                  }}
                  onDragLeave={() =>
                    setDropTargetId((prev) => (prev === terminal.id ? null : prev))
                  }
                  onDrop={handleReorderDrop(terminal.id)}
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
                    onClone={() => handleCloneTerminal(terminal.id)}
                    onReset={() => handleResetTerminal(terminal.id)}
                    canClone={tab.terminals.length < MAX_TERMINALS}
                    onClose={() => handleCloseTerminal(terminal.id)}
                    onDragStartReorder={(event) => {
                      event.dataTransfer.setData(REORDER_MIME, terminal.id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                  />
                  <div className="app-pane__body">
                    <TerminalPane
                      key={`${terminal.id}:${resetNonceByTerminalId[terminal.id] ?? 0}`}
                      cwd={terminal.cwd}
                      agent={agentByTerminalId[terminal.id] ?? undefined}
                      sessionId={terminal.agentSessionId ?? null}
                      resume={terminal.resumeSession ?? false}
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
        /* SPEC: terminal-layout-options (LAYOUT-25) — aviso de diretório que
           sumiu, dispensável com um clique. */
        .app-cwd-warning {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          flex: 0 0 auto;
          padding: 0.35rem 0.6rem;
          background: rgba(245, 183, 0, 0.12);
          border-bottom: 1px solid var(--accent);
          color: var(--fg);
          font-size: 12px;
        }
        .app-cwd-warning p { margin: 0; }
        .app-cwd-warning button {
          margin-left: auto;
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          font: inherit;
          line-height: 1;
        }
        .app-cwd-warning button:hover { color: var(--fg); }
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
        /* SPEC: terminal-layout-options (LAYOUT-17) — painel sob o cursor
           durante o arrasto de reordenação. */
        .app-pane[data-drop-target='true'] {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent);
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
        terminalCount={terminals.length}
        layout={activeTab.layout}
        onLayoutChange={handleLayoutChange}
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
            {renamingTabId === tab.id ? (
              <InlineRename
                value={tab.name}
                label="renomear aba"
                onCommit={(name) => {
                  setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, name } : t)))
                  setRenamingTabId(null)
                }}
                onCancel={() => setRenamingTabId(null)}
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === activeTab.id}
                // TAB-06: clicar na aba já ativa entra em renomeação; clicar
                // numa inativa só troca de aba — senão não haveria como
                // navegar sem cair no campo de texto.
                onClick={() =>
                  tab.id === activeTab.id ? setRenamingTabId(tab.id) : setActiveTabId(tab.id)
                }
              >
                {tab.name}
                {tab.terminals.length > 0 && (
                  <span className="app-tabbar__count">{tab.terminals.length}</span>
                )}
              </button>
            )}
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

      {/* SPEC: terminal-layout-options (LAYOUT-25) — uma linha por terminal
          que perdeu o diretório salvo. Fica logo acima da área dos painéis:
          dentro dela as abas são absolutas e cobririam o aviso. */}
      {cwdFallbacks.length > 0 && !cwdWarningDismissed && (
        <div className="app-cwd-warning" role="status">
          <div>
            {cwdFallbacks.map((fallback) => (
              <p key={fallback.id}>
                O diretório {fallback.from} não existe mais. O terminal abriu em home.
              </p>
            ))}
          </div>
          <button
            type="button"
            aria-label="fechar aviso de diretório"
            onClick={() => setCwdWarningDismissed(true)}
          >
            ×
          </button>
        </div>
      )}

      <div className="app-grid-area">{tabs.map(renderTab)}</div>

      {/* SPEC: session-restore (SESS-01) — enquanto isto está montado nenhum
          `TerminalPane` existe: `tabs` continua sendo a aba vazia inicial. */}
      {pendingRestore && (
        <div className="app-dialog-backdrop">
          <RestoreSessionDialog
            tabs={pendingRestore.map((tab) => ({
              id: tab.id,
              name: tab.name,
              terminals: tab.terminals.map((terminal) => ({
                id: terminal.id,
                cwd: terminal.cwd,
                agentId: terminal.agentId ?? null,
                agentSessionId: terminal.agentSessionId ?? null,
              })),
            }))}
            resumableAgentIds={resumableAgentIds}
            onRestore={handleRestoreSelection}
            onStartFresh={handleStartFresh}
          />
        </div>
      )}

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
