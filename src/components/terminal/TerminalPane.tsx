// SPEC: multi-terminal (TERM-01, TERM-02, TERM-06, TERM-14), terminal-chrome (CHROME-01), session-restore (SESS-12, SESS-13), terminal-screenshot (SHOT-13), agent-permission-mode (PERM-01), terminal-font (TFONT-01, TFONT-02)
// SPEC: wsl-terminal-profile (WSLP-12)
// SPEC: terminal-boot-loading (BOOT-02, BOOT-03, BOOT-06)
// SPEC: terminal-resize-floor (TRSZ-01, TRSZ-02, TRSZ-03)
// SPEC: terminal-glyph-metrics (TGLY-01, TGLY-02, TGLY-03)

import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { invoke, Channel } from '@tauri-apps/api/core'
import '@xterm/xterm/css/xterm.css'

/**
 * SPEC: terminal-font (TFONT-01, TFONT-02)
 *
 * Ordem importa: as monoespaçadas do sistema primeiro (é delas que sai a
 * métrica da célula), a Nerd Font embarcada por último, só como fallback de
 * glifo. Invertê-la faria o xterm medir a célula por uma fonte de ícones.
 */
const TERMINAL_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace, 'Symbols Nerd Font Mono'"

export interface TerminalPaneProps {
  /** Diretório de trabalho da sessão. */
  cwd: string
  agent?: string
  /**
   * SPEC: session-restore (SESS-12, SESS-13) — id da sessão do agente que
   * este painel fixa no CLI, e se deve retomá-la em vez de fixá-la nova.
   *
   * Lidas **no mount**, de propósito fora das dependências do efeito:
   * `resetNonceByTerminalId` (TERM-13) já remonta o painel na hora certa via
   * `key`, e colocá-las aqui criaria um segundo caminho de remonte
   * disparando junto com o primeiro.
   */
  sessionId?: string | null
  resume?: boolean
  /**
   * SPEC: agent-permission-mode (PERM-01) — modo escolhido no passo AGENT,
   * repassado a `pty_spawn` como `--permission-mode <modo>`. Lido no mount,
   * como `sessionId`/`resume`: trocar o modo de uma sessão viva não é o que
   * esta feature promete — trocar exige reiniciar o terminal, que já remonta
   * o painel (TERM-13).
   */
  permissionMode?: string | null
  /**
   * Reporta o id REAL da sessão (o `TerminalId` devolvido por `pty_spawn`,
   * o mesmo que o backend injeta no processo filho via `TERMINAL_ID_ENV` e
   * que `TerminalMetaService::set_title` usa como chave) assim que a
   * promise de `pty_spawn` resolve. Quem monta este painel (`App.tsx`)
   * precisa desse id — não do UUID gerado no front para chaves de grid —
   * para repassar a `TerminalHeader` como `id`, senão o rename manual
   * (TERM-06) nunca colide com a chave que o agente usa via MCP.
   */
  onSessionId?: (id: string) => void
  /**
   * SPEC: terminal-screenshot (SHOT-13) — entrega a instância viva do xterm
   * a quem montou o painel, e `null` no cleanup. O `Terminal` nasce e morre
   * dentro do efeito abaixo; sem esta ponte, `App.tsx` não tem como pedir o
   * buffer do painel que o usuário clicou no modo de captura.
   */
  onTerminal?: (term: Terminal | null) => void
  /**
   * SPEC: terminal-boot-loading (BOOT-03, BOOT-06) — fires once, when the
   * pane stops loading: `pty_spawn` resolved, or it rejected and the error is
   * already on screen. Both count as "done" on purpose — the boot overlay
   * (BOOT-06) waits on this, and a pane whose profile is unavailable would
   * otherwise hold the whole window hostage.
   */
  onReady?: () => void
}

/** ConPTY tem custo real em resize; arrastar divisória dispararia dezenas
 * de chamadas sem isto. Ver design.md → Decisões técnicas. */
const RESIZE_DEBOUNCE_MS = 100

/**
 * SPEC: terminal-resize-floor (TRSZ-01, TRSZ-02) — piso de colunas abaixo do
 * qual nenhuma dimensão proposta é aplicada, nem ao xterm nem ao PTY.
 *
 * Nunca morde um layout legítimo: `tauri.conf.json` fixa `minWidth: 900`, o
 * que dá ~442 px por célula no grid 2×2 — cerca de 55 colunas. Painel medido
 * abaixo disso é ilegível de qualquer forma; congelar o tamanho anterior é
 * melhor que repassar a largura degenerada ao provedor.
 */
const MIN_COLS = 20

/** SPEC: terminal-resize-floor (TRSZ-03) — acima do padrão de 1000 da
 * biblioteca, para o re-wrap de um estreitamento legítimo não descartar
 * histórico. */
const TERMINAL_SCROLLBACK = 10_000

/**
 * SPEC: terminal-glyph-metrics (TGLY-01, TGLY-02, TGLY-03) — força o xterm a
 * remedir a célula e a descartar o cache de largura de glifo.
 *
 * O renderizador DOM guarda a largura medida por ponto de código e, quando a
 * medida sai `0` (caixa transitoriamente degenerada — arraste/reordenação do
 * painel, `display: none` de aba inativa ou de irmão maximizado), ele
 * **grava o zero** (`WidthCache._measure`), ao contrário do `CharSizeService`,
 * que preserva o valor anterior. Nada limpa esse cache depois: só `setFont()`
 * ou um evento de mudança de métrica — que nunca chega, porque a fonte do
 * sistema não mudou. Todo repaint seguinte reusa a largura zerada, e o
 * próximo `fit()` reflowa a buffer contra a célula errada. É o que produz a
 * tira de caracteres à esquerda, as letras em offsets irregulares e o corte
 * no meio da palavra na borda direita.
 *
 * TGLY-03: a atribuição precisa passar por um valor **diferente** do canônico.
 * O `OptionsService` só emite `onOptionChange` quando o valor atribuído difere
 * do guardado, então reatribuir o mesmo valor é um no-op silencioso que não
 * invalida nada.
 */
const refreshMetrics = (terminal: Terminal) => {
  terminal.options.fontFamily = `${TERMINAL_FONT_FAMILY}, monospace`
  terminal.options.fontFamily = TERMINAL_FONT_FAMILY
}

/**
 * Casa uma instância de xterm.js com uma sessão do backend.
 *
 * ⚠️ Ordem importa: o teclado (`onData` → `pty_write`) e a saída
 * (`Channel` → `terminal.write`) precisam estar ligados **antes** de
 * `pty_spawn` ser chamado. O ConPTY bloqueia o processo filho logo na
 * abertura até responder ao DSR (`ESC[6n`), e é o próprio xterm.js quem
 * responde a isso automaticamente — mas só se o caminho de volta já
 * existir quando a consulta chegar. Ver design.md → "Handshake de DSR no
 * Windows".
 */
export default function TerminalPane({
  cwd,
  agent,
  sessionId,
  resume,
  permissionMode,
  onSessionId,
  onTerminal,
  onReady,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  /**
   * SPEC: terminal-boot-loading (BOOT-02) — `false` from mount until
   * `pty_spawn` settles. Drives the skeleton below; the xterm element itself
   * is always mounted, because the DSR handshake needs it alive before the
   * first byte arrives (see the note on this component).
   */
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // SPEC: terminal-chrome (CHROME-01) — o xterm.js pinta o próprio fundo
    // (#000 por padrão); sem alinhar com `--surface-2` fica uma moldura de
    // tom diferente ao redor da área de texto dentro do cartão.
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      // SPEC: terminal-font (TFONT-01) — sem `fontFamily` o xterm usa
      // `courier-new, courier, monospace`, que não tem os glifos de ícone do
      // prompt (ramo do git, seta do Powerline). A Nerd Font entra por último:
      // o texto sai na monoespaçada do sistema e só os pontos de código que
      // faltam nela caem no arquivo embarcado.
      fontFamily: TERMINAL_FONT_FAMILY,
      // SPEC: terminal-resize-floor (TRSZ-03) — o padrão da biblioteca é 1000
      // linhas. Estreitar a caixa re-wrappa o histórico e multiplica a
      // contagem de linhas; no padrão, o excedente é descartado (medido em
      // @xterm/headless: 600 linhas viram 11 ao encolher para 2 colunas e
      // voltar).
      scrollback: TERMINAL_SCROLLBACK,
      theme: { background: '#0a0a0c', foreground: '#e8e8ea', cursor: '#f5b700' },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    onTerminal?.(terminal)

    let terminalId: string | null = null
    let disposed = false
    /**
     * Bytes produzidos pelo xterm ANTES de `pty_spawn` resolver.
     *
     * O ConPTY já emite o DSR (`ESC[6n`) na abertura, e esses bytes chegam
     * pelo `Channel` — que o backend alimenta a cada 16 ms — sem esperar a
     * resposta do `invoke`. Com dois painéis subindo juntos (restauração de
     * sessão) o `invoke` de um deles resolve depois desse primeiro chunk: a
     * resposta ao DSR era descartada por falta de `terminalId`, o ConPTY
     * nunca destravava o processo filho e o painel ficava preto para sempre.
     * Guardar e reenviar no `then` fecha essa janela.
     */
    let pending: number[] = []

    /**
     * TGLY-01: a Nerd Font embarcada é declarada com `font-display: block` e
     * nada espera `document.fonts` antes de `terminal.open()`. O xterm não
     * registra listener de `FontFaceSet`, então uma fonte que resolve depois do
     * `open()` deixa a métrica da célula e o cache de largura obsoletos sem
     * nenhum evento que os corrija. `document.fonts` pode não existir (jsdom),
     * por isso o acesso é opcional.
     */
    void document.fonts?.ready.then(() => {
      if (disposed) return
      refreshMetrics(terminal)
    })

    const sendToPty = (data: number[]) => {
      if (!terminalId) {
        pending.push(...data)
        return
      }
      void invoke('pty_write', { id: terminalId, data })
    }

    /**
     * Reajusta xterm ao tamanho atual do container e repassa as dimensões
     * ao ConPTY.
     *
     * O `pty_resize` precisa acontecer também logo depois de `pty_spawn`
     * resolver: a sessão nasce em 24x80 fixo (`manager::default_size`) e o
     * único disparo do `ResizeObserver` num painel que nunca muda de tamanho
     * é o inicial — que chega antes de `terminalId` existir e era descartado,
     * deixando o shell quebrando linha em 80 colunas dentro de um painel do
     * tamanho da janela.
     *
     * Container de tamanho zero (aba inativa, painel minimizado) é ignorado:
     * `fit()` ali produziria dimensões degeneradas e mandaria o PTY para elas.
     *
     * SPEC: terminal-resize-floor (TRSZ-01, TRSZ-02) — caixa medida estreita
     * (mas não zero) é ignorada do mesmo jeito, e por um motivo pior: o
     * `FitAddon` não desiste nesse caso, ele grampeia a proposta no piso
     * dele, `MINIMUM_COLS = 2`. Aplicar isso manda o provedor redesenhar em
     * duas colunas, e um CLI de Ink emite `\r\n` por segmento — cada
     * caractere vira uma LINHA LÓGICA, que o reflow de alargamento nunca
     * refunde (só refunde o que está marcado `isWrapped`). O histórico fica
     * uma tira de um caractere para sempre. Consultar `proposeDimensions()`
     * antes de `fit()` é o que deixa esta função recusar em vez de aplicar.
     */
    const syncSize = () => {
      if (disposed) return
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      const proposed = fitAddon.proposeDimensions()
      if (!proposed || proposed.cols < MIN_COLS) return
      // TGLY-02: depois das guardas e antes do `fit()`, incondicionalmente. O
      // gatilho confirmado pelo usuário é o próprio resize/arraste, não a volta
      // de um painel oculto, então não há transição a detectar — e detectar
      // qual frame mediu zero seria mais código para cobertura menor.
      refreshMetrics(terminal)
      fitAddon.fit()
      if (!terminalId) return
      void invoke('pty_resize', { id: terminalId, rows: terminal.rows, cols: terminal.cols })
    }

    // TRSZ-02: o ajuste inicial passa pelo mesmo piso — antes ele chamava
    // `fit()` cru, sem guarda nenhuma, e podia aplicar a largura degenerada
    // antes do primeiro byte chegar. `terminalId` ainda é `null` aqui, então
    // o `pty_resize` de fato acontece no `then` de `pty_spawn`.
    syncSize()

    /**
     * SPEC: multi-terminal (TERM-14) — Ctrl+V (e Ctrl+Shift+V) colam o texto
     * da área de transferência.
     *
     * Sem isto o Ctrl+V chega ao shell como o byte de controle literal
     * (`^V`, "quoted-insert" do readline), que é o oposto do que se espera.
     *
     * `terminal.paste()` em vez de escrever direto no PTY: é ele quem aplica
     * a transformação de texto colado — normaliza as quebras de linha e
     * envolve o conteúdo nos marcadores de *bracketed paste* quando o
     * programa em primeiro plano ligou esse modo, o que impede um editor de
     * interpretar cada linha colada como comando. O texto sai por `onData`,
     * o mesmo caminho do teclado.
     *
     * `preventDefault()` é obrigatório: sem ele o próprio webview ainda
     * dispararia seu evento `paste` nativo sobre o textarea do xterm, e o
     * conteúdo entraria duas vezes.
     */
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      if (!event.ctrlKey || event.altKey || event.metaKey) return true
      if (event.key !== 'v' && event.key !== 'V') return true

      event.preventDefault()
      void navigator.clipboard
        ?.readText()
        .then((text) => {
          if (text) terminal.paste(text)
        })
        .catch((error: unknown) => {
          console.error('falha ao ler a área de transferência', error)
        })
      return false
    })

    // Teclado ligado antes do primeiro byte do processo.
    const dataDisposable = terminal.onData((data) => {
      sendToPty(Array.from(new TextEncoder().encode(data)))
    })

    // Saída ligada antes do primeiro byte do processo.
    const channel = new Channel<number[]>()
    channel.onmessage = (bytes) => {
      terminal.write(new Uint8Array(bytes))
    }

    invoke<string>('pty_spawn', {
      cwd,
      agent,
      sessionId: sessionId ?? null,
      resume: resume ?? false,
      permissionMode: permissionMode ?? null,
      channel,
    })
      .then((id) => {
        if (disposed) {
          void invoke('pty_kill', { id })
          return
        }
        terminalId = id
        if (pending.length > 0) {
          const buffered = pending
          pending = []
          sendToPty(buffered)
        }
        onSessionId?.(id)
        syncSize()
        // BOOT-02: the PTY is live — drop the skeleton and release the boot
        // overlay, in that order.
        setStarted(true)
        onReady?.()
      })
      .catch((error) => {
        terminal.write(`\r\nfalha ao iniciar o terminal: ${String(error)}\r\n`)
        // BOOT-03: a failed spawn still ends the loading state, otherwise the
        // message it just wrote would sit behind the skeleton.
        if (disposed) return
        setStarted(true)
        onReady?.()
      })

    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(syncSize, RESIZE_DEBOUNCE_MS)
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      onTerminal?.(null)
      if (terminalId) {
        void invoke('pty_kill', { id: terminalId })
      }
      terminal.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, agent])

  return (
    <div className="terminal-pane">
      {/* SPEC: terminal-boot-loading (BOOT-02, BOOT-08) — skeleton over the
          live xterm host. Overlay instead of a swap because the xterm element
          has to exist before the ConPTY's DSR query arrives; unmounting it
          while the session starts is exactly the black-pane bug documented
          above. */}
      <style>{`
        .terminal-pane { position: relative; }
        .terminal-pane__host { width: 100%; height: 100%; }
        .terminal-pane__boot {
          position: absolute;
          inset: 0;
          z-index: 2;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          padding: 0.15rem 0.1rem;
          background: var(--surface-2);
        }
        .terminal-pane__boot-status {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          color: var(--muted);
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        .terminal-pane__boot-caret {
          width: 7px;
          height: 13px;
          flex: 0 0 auto;
          background: var(--accent);
          animation: terminal-pane-blink 1s steps(2, start) infinite;
        }
        .terminal-pane__boot-line {
          height: 8px;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.04) 0%,
            rgba(255, 255, 255, 0.1) 50%,
            rgba(255, 255, 255, 0.04) 100%
          );
          background-size: 220% 100%;
          animation: terminal-pane-sweep 1.6s ease-in-out infinite;
        }
        .terminal-pane__boot-line:nth-of-type(1) { width: 54%; animation-delay: 0s; }
        .terminal-pane__boot-line:nth-of-type(2) { width: 78%; animation-delay: 0.12s; }
        .terminal-pane__boot-line:nth-of-type(3) { width: 38%; animation-delay: 0.24s; }
        @keyframes terminal-pane-sweep {
          0% { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
        @keyframes terminal-pane-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        @media (prefers-reduced-motion: reduce) {
          .terminal-pane__boot-caret,
          .terminal-pane__boot-line { animation: none; }
        }
      `}</style>

      <div className="terminal-pane__host" ref={containerRef} />

      {!started && (
        <div className="terminal-pane__boot" role="status" aria-live="polite">
          <p className="terminal-pane__boot-status">
            <span className="terminal-pane__boot-caret" aria-hidden="true" />
            iniciando sessão…
          </p>
          <span className="terminal-pane__boot-line" />
          <span className="terminal-pane__boot-line" />
          <span className="terminal-pane__boot-line" />
        </div>
      )}
    </div>
  )
}
