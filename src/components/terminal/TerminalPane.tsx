// SPEC: multi-terminal (TERM-01, TERM-02, TERM-06), terminal-chrome (CHROME-01)

import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { invoke, Channel } from '@tauri-apps/api/core'
import '@xterm/xterm/css/xterm.css'

export interface TerminalPaneProps {
  /** Diretório de trabalho da sessão. */
  cwd: string
  /** Shell a rodar; `undefined` deixa o backend resolver o padrão do SO. */
  shell?: string
  agent?: string
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
}

/** ConPTY tem custo real em resize; arrastar divisória dispararia dezenas
 * de chamadas sem isto. Ver design.md → Decisões técnicas. */
const RESIZE_DEBOUNCE_MS = 100

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
export default function TerminalPane({ cwd, shell, agent, onSessionId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // SPEC: terminal-chrome (CHROME-01) — o xterm.js pinta o próprio fundo
    // (#000 por padrão); sem alinhar com `--surface-2` fica uma moldura de
    // tom diferente ao redor da área de texto dentro do cartão.
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      theme: { background: '#0a0a0c', foreground: '#e8e8ea', cursor: '#f5b700' },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    fitAddon.fit()

    let terminalId: string | null = null
    let disposed = false

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
     */
    const syncSize = () => {
      if (disposed) return
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      fitAddon.fit()
      if (!terminalId) return
      void invoke('pty_resize', { id: terminalId, rows: terminal.rows, cols: terminal.cols })
    }

    // Teclado ligado antes do primeiro byte do processo.
    const dataDisposable = terminal.onData((data) => {
      if (!terminalId) return
      void invoke('pty_write', {
        id: terminalId,
        data: Array.from(new TextEncoder().encode(data)),
      })
    })

    // Saída ligada antes do primeiro byte do processo.
    const channel = new Channel<number[]>()
    channel.onmessage = (bytes) => {
      terminal.write(new Uint8Array(bytes))
    }

    invoke<string>('pty_spawn', { cwd, shell, agent, channel })
      .then((id) => {
        if (disposed) {
          void invoke('pty_kill', { id })
          return
        }
        terminalId = id
        onSessionId?.(id)
        syncSize()
      })
      .catch((error) => {
        terminal.write(`\r\nfalha ao iniciar o terminal: ${String(error)}\r\n`)
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
      if (terminalId) {
        void invoke('pty_kill', { id: terminalId })
      }
      terminal.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, shell, agent])

  return <div className="terminal-pane" ref={containerRef} />
}
