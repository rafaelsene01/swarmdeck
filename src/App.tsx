// SPEC: multi-terminal (TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-07, TERM-08, TERM-12, TERM-13), terminal-tabs (TAB-01, TAB-02, TAB-03, TAB-04, TAB-05, TAB-06), terminal-chrome (CHROME-01, CHROME-02, CHROME-03), editor-launch (EDITOR-02), agent-selection (AGT-01, AGT-03, AGT-04), release-distribution (REL-52), quota-indicator (QUOTA-11), terminal-layout-options (LAYOUT-15, LAYOUT-16, LAYOUT-17, LAYOUT-19, LAYOUT-20, LAYOUT-21, LAYOUT-22, LAYOUT-23, LAYOUT-24, LAYOUT-25, LAYOUT-26), settings-shell (SET-01, SET-04, SET-05), session-restore (SESS-01, SESS-02, SESS-06, SESS-07, SESS-08, SESS-10, SESS-11, SESS-15, SESS-16, SESS-17), terminal-screenshot (SHOT-01, SHOT-13, SHOT-14, SHOT-16, SHOT-23), window-chrome (WIN-01, WIN-02, WIN-03), minimized-tray (MIN-01, MIN-02, MIN-04, MIN-05, MIN-06, MIN-07), projects (PROJ-11, PROJ-12, PROJ-13, PROJ-14, PROJ-16), terminal-boot-loading (BOOT-04, BOOT-05, BOOT-06, BOOT-07, BOOT-09, BOOT-10, BOOT-12)

import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Terminal } from '@xterm/xterm'
import GridLayout, { type Pane } from './components/grid/GridLayout'
import ScreenshotModal from './components/terminal/ScreenshotModal'
import { snapshotBlob } from './lib/terminalSnapshot'
import Header from './components/shell/Header'
import TitleBar from './components/shell/TitleBar'
import type { QuotaIndicatorProps } from './components/shell/QuotaIndicator'

/** SPEC: terminal-screenshot (SHOT-16) — `swarmdeck-terminal-<N>-<YYYYMMDD-HHMMSS>.png`,
 * ordenável por nome e identificando o painel de origem. */
function screenshotFileName(index: number): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `swarmdeck-terminal-${index}-${stamp}.png`
}

/** Espelha `QuotaPrefs` de `src-tauri/src/db/quota_prefs.rs` — o mesmo tipo
 * volta de `quota_prefs_get` e do evento `quota://prefs-changed`. */
interface QuotaPrefsPayload {
  enabled: boolean
  window: QuotaIndicatorProps['window']
  providers?: { id: string; enabled: boolean }[]
}
import BootSplash from './components/shell/BootSplash'
import EmptyState from './components/shell/EmptyState'
import InlineRename from './components/shell/InlineRename'
import RestoreSessionDialog, {
  type RestoreSelection,
} from './components/shell/RestoreSessionDialog'
import TerminalPane from './components/terminal/TerminalPane'
import TerminalHeader from './components/terminal/TerminalHeader'
import PaneWizard, { lastSegment, normalizePath } from './components/terminal/PaneWizard'
import type { AgentDescriptor } from './routes/settings/AgentPanel'
import type { ProfileCatalog, ProfileCatalogEntry } from './types/agents'
import SettingsShell from './routes/settings/SettingsShell'
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
  /** SPEC: agent-permission-mode (PERM-04) — mesmo tratamento de `agentId`:
   * é coluna de `terminal_layout` no backend, mas estado à parte no front
   * (`permissionModeByTerminalId`), então entra aqui na borda. */
  permissionMode?: string | null
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

// SPEC: agent-selection (AGT-01, AGT-04), terminal-boot-loading (BOOT-10)
// `AgentCatalogEntry` / `ProfileCatalog` moram em `types/agents.ts` desde
// BOOT-10: o wizard passou a consumir a mesma forma, e duas declarações da
// mesma resposta de IPC divergiriam.

/** Janela de espera antes de gravar o workspace (LAYOUT-21). `handleResize`
 * dispara a cada `pointermove` do arrasto de divisória; gravar em SQLite por
 * evento de mouse seria desperdício. A última mudança da rajada vence. */
const SAVE_DEBOUNCE_MS = 500

/** Teto de terminais **por aba** — o grid 2×2 de `GridLayout` não vai além
 * disso. Mais que 4 terminais abertos ao mesmo tempo cabe agora em outra aba
 * (TAB-01), não em mais células. */
const MAX_TERMINALS = 4

/** SPEC: terminal-boot-loading (BOOT-07) — teto sem progresso para o overlay
 * de boot. Cada terminal que reporta PTY vivo rearma a contagem, então isto é
 * "15 s sem nenhum avanço", não "15 s de boot". Sem este teto um painel cujo
 * `pty_spawn` nunca resolve (distro que subiu pela metade, ConPTY travado)
 * prenderia a janela inteira para sempre. */
const BOOT_STALL_MS = 15_000

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

/** SPEC: projects (PROJ-11) — lê o cadastro de projetos para o cabeçalho poder
 * chamar cada terminal pelo nome do projeto. Falha só custa o rótulo: o
 * cabeçalho cai no último segmento do `cwd`. */
function fetchProjectNames(apply: (byPath: Record<string, string>) => void) {
  void invoke<{ name: string; path: string }[]>('project_list')
    .then((records) =>
      apply(Object.fromEntries(records.map((record) => [normalizePath(record.path), record.name]))),
    )
    .catch((error) => console.error('falha ao ler os projetos', error))
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
  // SET-01: Settings is an overlay over the main window, not a separate
  // OS window — the whole shell mounts inline (see the backdrop below).
  const [settingsOpen, setSettingsOpen] = useState(false)
  // SPEC: terminal-screenshot (SHOT-14) — print pronto, aguardando salvar/copiar.
  const [capture, setCapture] = useState<{ blob: Blob; fileName: string } | null>(null)
  /** Instâncias vivas do xterm, por id de terminal (SHOT-13). */
  const terminalsRef = useRef<Map<string, Terminal>>(new Map())
  /** Botão de câmera que originou o print, para devolver o foco ao fechar o
   * modal (SHOT-23) — agora há um por painel, então guarda-se o clicado. */
  const cameraRef = useRef<HTMLButtonElement | null>(null)

  // SPEC: agent-selection (AGT-01, AGT-03, AGT-04)
  // Catálogo real e padrão efetivo, buscados uma vez no mount — antes disto
  // o antigo diálogo recebia `agents={[]}`/`defaultAgentId={null}` fixos
  // (ver git blame / relatório da task T5) e a pré-seleção do padrão (AGT-01)
  // e a marcação de "não instalado" (AGT-04) nunca aconteciam de verdade.
  const [agents, setAgents] = useState<AgentDescriptor[]>([])
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  /** SPEC: session-restore (SESS-15) — ids cujo CLI aceita `--resume`; o modal
   * usa isto para decidir se o switch fica ativo ou travado. */
  const [resumableAgentIds, setResumableAgentIds] = useState<Set<string>>(new Set())
  /** SPEC: session-restore (SESS-15) — o catálogo chega por IPC e demora mais
   * que a leitura do workspace (detecta o PATH). O modal congela os switches
   * na primeira renderização: montado com `resumableAgentIds` ainda vazio,
   * todo terminal nasceria em "nova sessão" e nenhuma conversa voltaria.
   * Segura o modal até o catálogo responder — erro incluso, senão a falha
   * esconderia o modal para sempre. */
  const [agentCatalogSettled, setAgentCatalogSettled] = useState(false)
  /** SPEC: terminal-boot-loading (BOOT-10) — resultado da varredura do boot:
   * um perfil de terminal por entrada, cada um com os agentes instalados
   * **nele**. Repassado ao wizard, que escolhe a entrada pelo caminho da pasta
   * em vez de usar sempre a do perfil padrão (BOOT-12). */
  const [profileCatalogs, setProfileCatalogs] = useState<ProfileCatalogEntry[]>([])
  // Agente escolhido por sessão (AGT-03): sobrescreve o padrão só para o
  // terminal criado com aquela escolha, sem tocar a preferência global.
  const [agentByTerminalId, setAgentByTerminalId] = useState<Record<string, string | null>>({})
  /** SPEC: agent-permission-mode (PERM-04) — modo com que cada terminal subiu.
   * Espelha `agentByTerminalId`: chave é o id do painel no grid, e o valor
   * acompanha o terminal por clonar, reiniciar e restaurar. */
  const [permissionModeByTerminalId, setPermissionModeByTerminalId] = useState<
    Record<string, string | null>
  >({})
  /** SPEC: projects (PROJ-11) — nome do projeto por caminho normalizado, para
   * o cabeçalho de cada terminal mostrar o projeto em que ele roda. O `cwd` é
   * o que o terminal guarda; o nome cadastrado pode diferir da pasta, por isso
   * vem de `project_list` e não do último segmento. */
  const [projectNameByPath, setProjectNameByPath] = useState<Record<string, string>>({})
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
  // Configurações agora é um overlay dentro desta janela (SET-01), mas
  // `SettingsShell` não levanta estado até aqui: uma mudança de preferência
  // lá continua chegando só pelo evento `quota://prefs-changed`, que
  // `quota_prefs_set` emite para a janela `main`
  // (`src-tauri/src/commands/quota.rs`) — mesmo mecanismo de
  // `update://available` acima. `null` até a primeira leitura resolver:
  // mesmo efeito que `enabled: false` no `Header` (QUOTA-12).
  const [quotaPrefs, setQuotaPrefs] = useState<QuotaPrefsPayload | null>(null)

  /** SPEC: terminal-boot-loading (BOOT-09) — `false` até a cota do boot
   * assentar. Segunda porta do overlay, ao lado da restauração de sessão: as
   * duas correm em paralelo e a tela só é liberada quando ambas fecham. */
  const [quotaReady, setQuotaReady] = useState(false)

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

    // SPEC: terminal-boot-loading (BOOT-09) — as preferências e a cota em si,
    // na ordem, antes de liberar a tela.
    //
    // O `quota_claude` aqui não é a busca do `QuotaIndicator`: é o que aquece
    // o cache do backend (piso de 5 min, QUOTA-14/QUOTA-28), para o anel do
    // cabeçalho nascer com dado em vez de nascer em carregamento. A busca do
    // próprio indicador continua onde estava e passa a ser servida do cache.
    //
    // Sem checar `prefs.enabled` de propósito: com a cota desligada
    // `quota_claude` devolve `state: "disabled"` sem tocar disco nem rede
    // (QUOTA-17), então o guard viveria em dois lugares dizendo a mesma coisa.
    // E o comando nunca rejeita — falha de rede vira `state: "offline"` —, por
    // isso o `.finally` é suficiente para fechar a porta em qualquer desfecho.
    void invoke<QuotaPrefsPayload>('quota_prefs_get')
      .then((prefs) => {
        if (cancelled) return
        setQuotaPrefs(prefs)
        return invoke('quota_claude', { force: false })
      })
      .catch((error) => console.error('falha ao preparar a cota no boot', error))
      .finally(() => {
        if (!cancelled) setQuotaReady(true)
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

  /** SPEC: terminal-boot-loading (BOOT-04, BOOT-06, BOOT-07) — enquanto isto
   * não é `null`, `BootSplash` cobre a janela.
   *
   * `total: 0` é a fase de verificação (leitura do workspace, catálogo de
   * agentes, escolha no modal): não há o que contar, e a barra fica
   * indeterminada. Depois da escolha, `pending` lista os terminais que ainda
   * não reportaram PTY vivo e `total` congela quantos eram — é o que dá a
   * barra determinada e o contador "N/M terminais prontos". */
  const [boot, setBoot] = useState<{ pending: string[]; total: number } | null>({
    pending: [],
    total: 0,
  })

  /** SPEC: terminal-boot-loading (BOOT-06) — um `TerminalPane` avisou que o
   * `pty_spawn` dele resolveu (ou falhou, BOOT-03). Atualização funcional de
   * propósito: o `onReady` que o painel captura no mount não é recriado a cada
   * render, então ler `boot` por closure aqui leria um valor velho. */
  const handlePaneReady = (id: string) => {
    setBoot((prev) =>
      prev ? { ...prev, pending: prev.pending.filter((entry) => entry !== id) } : prev,
    )
  }

  // BOOT-06: último terminal pronto fecha a porta da restauração.
  useEffect(() => {
    if (boot && boot.total > 0 && boot.pending.length === 0) setBoot(null)
  }, [boot])

  /** SPEC: terminal-boot-loading (BOOT-04, BOOT-09, BOOT-10) — as três portas
   * do boot, todas abertas em paralelo: a varredura de terminais/agentes, a
   * restauração de sessão e a cota. A tela só é liberada quando as três
   * fecham; qualquer uma pendente mantém o overlay. */
  const booting = !agentCatalogSettled || boot !== null || !quotaReady

  /** SPEC: terminal-boot-loading (BOOT-04, BOOT-09, BOOT-10) — a fase mais
   * informativa vence. Só "abrindo os terminais" tem número; as outras são
   * indeterminadas. A ordem dos empates segue o custo típico: a varredura de
   * perfis é a primeira a ser anunciada porque é ela que paga um `wsl.exe` por
   * distro, e a cota é a última porque é a única chamada de rede — anunciar
   * "verificando sessão" enquanto o que falta é a cota mentiria sobre o que
   * está segurando a tela. */
  const bootLabel = boot?.total
    ? 'Abrindo os terminais salvos…'
    : pendingRestore
      ? 'Sessão anterior encontrada'
      : !agentCatalogSettled
        ? 'Procurando terminais e agentes instalados…'
        : boot
          ? 'Verificando a sessão anterior…'
          : 'Consultando a cota dos agentes…'

  // BOOT-07: o teto só corre quando a espera é do app. Com o modal aberto a
  // espera é do usuário, e derrubar o overlay ali revelaria a área de painéis
  // vazia atrás dele. `boot` troca de identidade a cada terminal pronto, o que
  // rearma o `setTimeout` — o teto passa a valer por falta de progresso, e
  // vale para as duas portas: um `quota_claude` que nunca assenta prenderia a
  // janela do mesmo jeito que um `pty_spawn` travado.
  useEffect(() => {
    if (!booting || pendingRestore) return

    const timer = setTimeout(() => {
      console.error('boot excedeu o tempo sem progresso; liberando a tela')
      setBoot(null)
      setQuotaReady(true)
      setAgentCatalogSettled(true)
    }, BOOT_STALL_MS)

    return () => clearTimeout(timer)
    // `booting` é derivado dos três abaixo, e é a mudança de identidade de
    // `boot` (um terminal pronto) que rearma o teto.
  }, [booting, boot, quotaReady, agentCatalogSettled, pendingRestore])

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
    // PERM-04: o modo persistido volta junto, para o terminal restaurado subir
    // sob o mesmo regime de permissão em que foi aberto.
    setPermissionModeByTerminalId(
      Object.fromEntries(
        saved.flatMap((tab) => tab.terminals.map((t) => [t.id, t.permissionMode ?? null])),
      ),
    )
    hydrated.current = true

    // SPEC: projects (PROJ-14) — retomar o workspace é usar os projetos de
    // novo. Uma chamada só com todos os `cwd`: o backend casa cada um e
    // agrupa por projeto. Falha não interrompe a restauração.
    const cwds = saved.flatMap((tab) => tab.terminals.map((t) => t.cwd))
    if (cwds.length > 0) void invoke('project_touch_cwds', { cwds }).catch(() => {})
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
          // BOOT-07: nada salvo, nada a esperar — libera para o `EmptyState`.
          setBoot(null)
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
        // BOOT-07: abas sem terminal nenhum não têm PTY a esperar.
        setBoot(null)
      })
      // LAYOUT-26: leitura que falha registra o erro e deixa o app abrir na
      // aba vazia; nunca impede a abertura — e sem modal.
      .catch((error) => {
        console.error('falha ao restaurar o workspace de terminais', error)
        if (cancelled) return
        hydrated.current = true
        // BOOT-07: a falha não pode virar um overlay eterno.
        setBoot(null)
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

    const kept = saved
      .filter((tab) => keptTabs.has(tab.id))
      .map((tab) => ({
        ...tab,
        terminals: tab.terminals.filter((terminal) => keptTerminals.has(terminal.id)),
      }))

    applyWorkspace(kept, selection.resumeByTerminalId)
    setPendingRestore(null)

    // SPEC: terminal-boot-loading (BOOT-06) — o overlay continua até cada um
    // destes painéis reportar PTY vivo. Os ids vêm do workspace filtrado, e
    // não de `selection.terminalIds`, porque uma aba desmarcada leva os
    // terminais dela embora mesmo que estejam marcados (SESS-05).
    const restoring = kept.flatMap((tab) => tab.terminals.map((terminal) => terminal.id))
    setBoot(restoring.length > 0 ? { pending: restoring, total: restoring.length } : null)
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
    // BOOT-07: nenhum terminal sobe, então não há o que esperar.
    setBoot(null)
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
          permissionMode: permissionModeByTerminalId[entry.id] ?? null,
        })),
      }))

      void invoke('terminal_workspace_set', { tabs: payload }).catch((error) =>
        console.error('falha ao gravar o workspace de terminais', error),
      )
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [tabs, agentByTerminalId, permissionModeByTerminalId])

  useEffect(() => {
    let cancelled = false

    fetchProjectNames(setProjectNameByPath)

    // SPEC: terminal-boot-loading (BOOT-10) — uma varredura só: quais perfis
    // de terminal existem e, em cada um, quais agentes estão instalados. É o
    // que substitui o antigo `agent_catalog`, que só olhava o perfil padrão e
    // por isso marcava "não encontrado no PATH" um `claude` que estava
    // instalado dentro de uma distro WSL.
    //
    // Os três estados abaixo continuam sendo a visão do **perfil padrão** —
    // é ela que o modal de restauração (SESS-15) e o padrão do wizard usam.
    // A visão por caminho vive em `profileCatalogs`, consumida pelo wizard.
    void invoke<ProfileCatalog>('agent_catalog_all')
      .then((catalog) => {
        if (cancelled) return
        setProfileCatalogs(catalog.profiles)

        const fallback = catalog.profiles[0]?.agents ?? []
        const entries =
          catalog.profiles.find((profile) => profile.profileId === catalog.defaultProfileId)
            ?.agents ?? fallback

        setAgents(
          entries.map(
            ({ installed: _installed, supportsSessionResume: _resume, ...agent }) => agent,
          ),
        )
        setInstalledIds(
          new Set(entries.filter((entry) => entry.installed).map((entry) => entry.id)),
        )
        setResumableAgentIds(
          new Set(entries.filter((entry) => entry.supportsSessionResume).map((entry) => entry.id)),
        )
      })
      .catch((error) => console.error('falha ao ler o catálogo de agentes', error))
      // BOOT-10: erro incluso — uma varredura que falha não pode esconder o
      // modal de restauração para sempre nem prender o overlay de boot.
      .finally(() => {
        if (!cancelled) setAgentCatalogSettled(true)
      })

    // AD-035: `agent_default` saiu daqui. O wizard pré-marca "Terminal", não
    // um agente, então não há o que pré-resolver. O comando segue registrado e
    // é usado por Configurações › Agentes, que é onde a preferência vive.

    return () => {
      cancelled = true
    }
  }, [])

  // SPEC: shell-chrome (EMPTY-07, EMPTY-08, EMPTY-09) — Ctrl+T only while
  // EmptyState is showing (no panel is mounted to steal the keystroke from);
  // re-bound whenever terminals.length changes so the closure never reads a
  // stale value. SPEC: projects (PROJ-11) — o rascunho já é um painel, então
  // o próprio `terminals.length !== 0` é o que impede o segundo wizard
  // (EMPTY-08) desde que `dialogOpen` deixou de existir.
  useEffect(() => {
    if (terminals.length !== 0) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.key.toLowerCase() !== 't') return
      event.preventDefault()
      if (settingsOpen) return
      handleNewTerminalDraft()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [terminals.length, settingsOpen])

  // SET-04: Esc closes the Settings overlay — the modal covers the whole
  // app, so the usual dialog escape hatch has to work here too.
  useEffect(() => {
    if (!settingsOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [settingsOpen])

  /**
   * SPEC: terminal-screenshot (SHOT-01, SHOT-13, SHOT-14) — captura o painel
   * cujo botão de câmera foi clicado.
   *
   * Painel sem instância viva ou sem dimensão na tela não abre o modal.
   */
  const handleCapturePane = (
    terminalId: string,
    index: number,
    cwd: string,
    button: HTMLButtonElement,
  ) => {
    const term = terminalsRef.current.get(terminalId)
    cameraRef.current = button
    if (!term) return

    void snapshotBlob(term, { index, cwd })
      .then((blob) => setCapture({ blob, fileName: screenshotFileName(index) }))
      .catch(() => {
        /* painel sem dimensão visível: nada a mostrar (SHOT-13). */
      })
  }

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

  /** SPEC: minimized-tray (MIN-02, MIN-04) — minimizados de **todas** as abas,
   * com a aba de origem. O nome é o mesmo rótulo padrão que
   * `TerminalHeader` mostra (`Terminal <n>`, n = posição na aba): um rename
   * manual vive no estado local do header e não sobe até aqui. */
  const minimizedTerminals = tabs.flatMap((tab) =>
    tab.terminals.flatMap((t, index) =>
      t.mode === 'minimized'
        ? [{ id: t.id, tabName: tab.name, name: `Terminal ${index + 1}` }]
        : [],
    ),
  )

  /** SPEC: minimized-tray (MIN-05) — devolve o terminal ao grid e traz a aba
   * dele para a frente; restaurar um terminal de outra aba sem trocar de aba
   * não mostraria nada. */
  const handleRestoreMinimized = (id: string) => {
    const owner = tabs.find((tab) => tab.terminals.some((t) => t.id === id))
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === owner?.id ? { ...tab, terminals: restore(tab.terminals, id) } : tab,
      ),
    )
    if (owner) setActiveTabId(owner.id)
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
    // PERM-04: TERM-12 pede mesmo `cwd` e mesmo provedor; o regime de
    // permissão é parte de como aquele provedor roda, então acompanha.
    setPermissionModeByTerminalId((prev) => ({ ...prev, [clone.id]: prev[id] ?? null }))
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
  }

  /** Fecha `id` em qualquer aba — não só na ativa. A bandeja de minimizados
   * (MIN-06, MIN-07) fecha terminal de aba que não está na tela, e todo
   * chamador passa por aqui. */
  const handleCloseTerminal = (id: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.terminals.some((t) => t.id === id)
          ? { ...tab, terminals: evenWidths(close(tab.terminals, id)) }
          : tab,
      ),
    )
    setAgentByTerminalId((prev) => {
      const { [id]: _removed, ...rest } = prev
      return rest
    })
    setResetNonceByTerminalId((prev) => {
      const { [id]: _removed, ...rest } = prev
      return rest
    })
  }

  /** SPEC: projects (PROJ-11) — os três gatilhos de novo terminal inserem um
   * painel de rascunho na aba ativa, que renderiza o wizard. Nenhum
   * `pty_spawn` acontece aqui: o PTY só nasce quando o wizard confirma e
   * `TerminalPane` monta. O teto de 4 conta o rascunho (PROJ-11 AC14) porque
   * ele já está na lista. */
  const handleNewTerminalDraft = () => {
    if (terminals.length >= MAX_TERMINALS) return

    const draft = { ...defaultTerminal(), draft: true }
    setActiveTerminals((prev) => evenWidths([...prev, draft]))
  }

  // SPEC: agent-selection (AGT-03), projects (PROJ-11)
  // `agentId` escolhido no wizard (troca local à sessão) precisa sobreviver
  // até `TerminalPane`/`pty_spawn`. Confirmar limpa `draft`: é a mesma linha
  // do grid que deixa de renderizar o wizard e passa a montar o terminal.
  //
  // `projectId` não é usado aqui: quem grava `last_used` é o próprio wizard,
  // na seleção do projeto — lá o `project_touch` também é o que valida que o
  // caminho ainda existe (PROJ-13 AC15), e validar depois de o painel virar
  // terminal vivo seria tarde demais.
  /** Nome do projeto deste `cwd`; pasta sem projeto cadastrado (a sandbox do
   * "Sem projeto", por exemplo) cai no último segmento do caminho. */
  const projectNameFor = (cwd: string) => projectNameByPath[normalizePath(cwd)] ?? lastSegment(cwd)

  const handleWizardConfirm = (
    id: string,
    cwd: string,
    agentId: string | null,
    permissionMode: string | null,
  ) => {
    setActiveTerminals((prev) =>
      prev.map((t) => (t.id === id ? { ...t, cwd: cwd.trim() || '.', draft: false } : t)),
    )
    setAgentByTerminalId((prev) => ({ ...prev, [id]: agentId }))
    // O wizard pode ter acabado de criar/importar um projeto: relê o cadastro
    // para o cabeçalho já mostrar o nome certo (PROJ-11).
    fetchProjectNames(setProjectNameByPath)
    // SPEC: agent-permission-mode (PERM-01) — guardado antes de `TerminalPane`
    // montar, porque é o mount que dispara `pty_spawn`.
    setPermissionModeByTerminalId((prev) => ({ ...prev, [id]: permissionMode }))
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
          <EmptyState onCreateTerminal={handleNewTerminalDraft} />
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
                    // SPEC: minimized-tray (MIN-01) — minimizado sai da
                    // tela; a célula do grid já recebe `display: none`, e
                    // isto cobre o caso de a célula ficar visível por outro
                    // caminho. Nunca desmonta: o PTY morreria.
                    display: hiddenByMaximize || isMinimized ? 'none' : undefined,
                  }}
                >
                  <TerminalHeader
                    index={index}
                    // SPEC: projects (PROJ-11, PROJ-12) — rascunho reduz as
                    // ações do cabeçalho: não há PTY para capturar, clonar,
                    // reiniciar nem minimizar.
                    draft={terminal.draft}
                    title={projectNameFor(terminal.cwd)}
                    // SPEC: agent-permission-mode (PERM-07)
                    permissionMode={permissionModeByTerminalId[terminal.id] ?? null}
                    cwd={terminal.cwd}
                    hasActiveProcess
                    // SPEC: terminal-chrome (CHROME-04)
                    isMaximized={isMaximized}
                    onMaximize={() => handleMaximize(terminal.id, terminal.mode)}
                    onMinimize={() => handleMinimize(terminal.id, terminal.mode)}
                    onClone={() => handleCloneTerminal(terminal.id)}
                    onReset={() => handleResetTerminal(terminal.id)}
                    canClone={tab.terminals.length < MAX_TERMINALS}
                    // SPEC: terminal-screenshot (SHOT-01)
                    onScreenshot={(button) =>
                      handleCapturePane(terminal.id, index, terminal.cwd, button)
                    }
                    onClose={() => handleCloseTerminal(terminal.id)}
                    onDragStartReorder={(event) => {
                      event.dataTransfer.setData(REORDER_MIME, terminal.id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                  />
                  <div className="app-pane__body">
                    {/* SPEC: projects (PROJ-11) — enquanto o painel é
                        rascunho o wizard ocupa o corpo e `TerminalPane` não
                        monta: sem mount não há `pty_spawn`, e é isso que
                        mantém o painel sem processo até a confirmação. */}
                    {terminal.draft ? (
                      <PaneWizard
                        agents={agents}
                        installedIds={installedIds}
                        // SPEC: terminal-boot-loading (BOOT-12) — a etapa
                        // AGENT escolhe o catálogo pelo caminho da pasta.
                        profileCatalogs={profileCatalogs}
                        onConfirm={(cwd, agentId, _projectId, permissionMode) =>
                          handleWizardConfirm(terminal.id, cwd, agentId, permissionMode)
                        }
                        onCancel={() => handleCloseTerminal(terminal.id)}
                      />
                    ) : (
                      <TerminalPane
                        key={`${terminal.id}:${resetNonceByTerminalId[terminal.id] ?? 0}`}
                        cwd={terminal.cwd}
                        agent={agentByTerminalId[terminal.id] ?? undefined}
                        permissionMode={permissionModeByTerminalId[terminal.id] ?? null}
                        sessionId={terminal.agentSessionId ?? null}
                        resume={terminal.resumeSession ?? false}
                        // SPEC: terminal-boot-loading (BOOT-06) — painel criado
                        // depois do boot também chama, e `handlePaneReady` só
                        // remove de `boot.pending`: id que não está lá é no-op.
                        onReady={() => handlePaneReady(terminal.id)}
                        // SPEC: terminal-screenshot (SHOT-13)
                        onTerminal={(term) => {
                          if (term) terminalsRef.current.set(terminal.id, term)
                          else terminalsRef.current.delete(terminal.id)
                        }}
                      />
                    )}
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
        /* SPEC: agent-permission-mode (PERM-07) — selo do modo de permissão
           da sessão. O modo bypassPermissions sai em vermelho porque é o único que
           desliga toda verificação: no meio de quatro terminais, o cabeçalho
           precisa gritar qual deles está sem rede de proteção. */
        .terminal-header__permission-mode {
          flex: 0 0 auto;
          padding: 0.05rem 0.35rem;
          border: 1px solid var(--border);
          border-radius: 999px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
          color: var(--muted);
        }
        .terminal-header__permission-mode[data-mode='bypassPermissions'] {
          border-color: rgba(248, 113, 113, 0.5);
          background: rgba(248, 113, 113, 0.12);
          color: var(--danger);
        }
        .terminal-header__permission-mode[data-mode='auto'],
        .terminal-header__permission-mode[data-mode='dontAsk'] {
          border-color: rgba(245, 183, 0, 0.4);
          color: var(--accent);
        }
        .terminal-header__title {
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
        .terminal-header__actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
        /* Filho direto de propósito: os itens do popover do EditorMenu são
           botões descendentes deste contêiner e não podem herdar a caixa
           quadrada de 24px das ações do cabeçalho (EDITOR-02). */
        .terminal-header__actions > button {
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
        .terminal-header__actions > button:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: var(--border);
          color: var(--fg);
        }
        .terminal-header__actions > button:focus-visible {
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
        /* .app-dialog-backdrop mudou para src/styles.css (AD-024): a janela
           "settings" não monta o App, e o diálogo de exclusão de projeto
           precisa do mesmo backdrop lá. */
        /* SET-01: Settings overlays the whole main window instead of opening
           its own OS window. Margins follow print/modal_config.png: the card
           stops short of every edge so the app stays visible behind it, and
           it sits above every other layer (EditorMenu is the highest at
           1100). */
        .app-settings-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(16px, 5vh, 56px) clamp(16px, 7vw, 120px);
          background: rgba(0, 0, 0, 0.62);
          backdrop-filter: blur(4px);
        }
        .app-settings-modal {
          display: flex;
          width: 100%;
          max-width: 1120px;
          height: 100%;
          max-height: 860px;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--surface);
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.65);
        }
        .app-settings-modal > .settings-shell { flex: 1 1 auto; min-width: 0; }
      `}</style>

      {/* SPEC: window-chrome (WIN-01, WIN-02, WIN-03) — barra de título própria,
          no lugar da nativa que `decorations: false` removeu. */}
      <TitleBar />

      {/* SPEC: shell-chrome (HDR-01, HDR-08) — SET-01: the gear now opens the
          Settings overlay below instead of invoking `settings_open`
          (src-tauri/src/windows/settings.rs), which stays registered but is
          no longer called from the UI. */}
      <Header
        onCreateTerminal={handleNewTerminalDraft}
        onOpenSettings={() => setSettingsOpen(true)}
        atMaxTerminals={terminals.length >= MAX_TERMINALS}
        hasUpdateAvailable={hasUpdateAvailable}
        terminalCount={terminals.length}
        layout={activeTab.layout}
        onLayoutChange={handleLayoutChange}
        quotaPrefs={quotaPrefs}
        minimizedTerminals={minimizedTerminals}
        onRestoreMinimized={handleRestoreMinimized}
        onCloseMinimized={handleCloseTerminal}
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

      {/* SPEC: terminal-boot-loading (BOOT-04, BOOT-05, BOOT-06) — cobre a
          janela desde o primeiro quadro. Fica ABAIXO do backdrop do modal de
          restauração (z-index 900 contra 1000), então o modal aparece por
          cima do carregamento em vez de esperar por ele. */}
      {booting && (
        <BootSplash
          label={bootLabel}
          progress={
            boot && boot.total > 0
              ? { done: boot.total - boot.pending.length, total: boot.total }
              : null
          }
        />
      )}

      {/* SPEC: session-restore (SESS-01) — enquanto isto está montado nenhum
          `TerminalPane` existe: `tabs` continua sendo a aba vazia inicial. */}
      {pendingRestore && agentCatalogSettled && (
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

      {/* SPEC: terminal-screenshot (SHOT-14, SHOT-23) — o foco volta para a
          câmera por qualquer caminho de fechamento. */}
      {capture && (
        <ScreenshotModal
          blob={capture.blob}
          fileName={capture.fileName}
          onClose={() => {
            setCapture(null)
            cameraRef.current?.focus()
          }}
        />
      )}

      {/* SET-01/SET-04: clicking the backdrop closes, same as X/"Fechar"; the
          click guard keeps a click inside the card from bubbling out. */}
      {settingsOpen && (
        <div
          className="app-settings-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false)
          }}
        >
          <div className="app-settings-modal" role="dialog" aria-modal="true" aria-label="Configurações">
            <SettingsShell onClose={() => setSettingsOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
