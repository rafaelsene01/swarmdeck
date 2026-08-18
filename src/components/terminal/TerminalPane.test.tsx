// SPEC: multi-terminal (TERM-01, TERM-02)

import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

// Same `vi.hoisted` pattern as `App.test.tsx` — the `vi.mock` factories below
// are hoisted above these imports by Vitest's transform.
const { invokeMock, onDataHandlers } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  onDataHandlers: [] as Array<(data: string) => void>,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage: ((bytes: number[]) => void) | null = null
  },
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    rows = 24
    cols = 80
    loadAddon() {}
    open() {}
    write() {}
    dispose() {}
    onData(handler: (data: string) => void) {
      onDataHandlers.push(handler)
      return { dispose() {} }
    }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}))

// jsdom não implementa `ResizeObserver`, e o painel observa o container.
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

import TerminalPane from './TerminalPane'

describe('TerminalPane', () => {
  /**
   * O ConPTY manda o DSR (`ESC[6n`) na abertura e o xterm responde na hora —
   * possivelmente antes do `pty_spawn` resolver. Descartar essa resposta
   * deixa o processo filho travado e o painel preto (bug observado ao
   * restaurar dois terminais de uma vez).
   */
  it('reenvia ao PTY o que foi digitado antes de `pty_spawn` resolver', async () => {
    let resolveSpawn: (id: string) => void = () => {}
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'pty_spawn') return new Promise<string>((r) => (resolveSpawn = r))
      return Promise.resolve()
    })

    render(<TerminalPane cwd="." />)

    const onData = onDataHandlers.at(-1)!
    onData('[24;80R') // resposta ao DSR, antes do spawn resolver

    expect(invokeMock).not.toHaveBeenCalledWith('pty_write', expect.anything())

    resolveSpawn('term-1')
    await vi.waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('pty_write', {
        id: 'term-1',
        data: Array.from(new TextEncoder().encode('[24;80R')),
      }),
    )
  })
})
