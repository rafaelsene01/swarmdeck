// SPEC: multi-terminal (TERM-01, TERM-02, TERM-06)

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

    const terminal = new Terminal({ convertEol: true, cursorBlink: true })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    fitAddon.fit()

    let terminalId: string | null = null
    let disposed = false

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
      })
      .catch((error) => {
        terminal.write(`\r\nfalha ao iniciar o terminal: ${String(error)}\r\n`)
      })

    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        fitAddon.fit()
        if (terminalId) {
          void invoke('pty_resize', {
            id: terminalId,
            rows: terminal.rows,
            cols: terminal.cols,
          })
        }
      }, RESIZE_DEBOUNCE_MS)
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
