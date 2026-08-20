// SPEC: multi-terminal (TERM-01, TERM-02, TERM-14), terminal-screenshot (SHOT-13), agent-permission-mode (PERM-01)

import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

// Same `vi.hoisted` pattern as `App.test.tsx` — the `vi.mock` factories below
// are hoisted above these imports by Vitest's transform.
const { invokeMock, onDataHandlers, keyHandlers, pasteMock, writeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  onDataHandlers: [] as Array<(data: string) => void>,
  /** TERM-14: os handlers passados a `attachCustomKeyEventHandler`. */
  keyHandlers: [] as Array<(event: KeyboardEvent) => boolean>,
  pasteMock: vi.fn(),
  /** WSLP-12: o que o painel escreveu no terminal (ex.: erro de spawn). */
  writeMock: vi.fn(),
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
    write(data: string) {
      writeMock(data)
    }
    dispose() {}
    paste(text: string) {
      pasteMock(text)
    }
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      keyHandlers.push(handler)
    }
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

  // SHOT-13: a captura precisa da instância viva do painel clicado.
  it('entrega a instância do xterm no mount e `null` no unmount', async () => {
    invokeMock.mockResolvedValue('term-1')
    const onTerminal = vi.fn()

    const { unmount } = render(<TerminalPane cwd="." onTerminal={onTerminal} />)

    expect(onTerminal).toHaveBeenCalledTimes(1)
    expect(onTerminal.mock.calls[0]![0]).toBeTruthy()

    unmount()

    expect(onTerminal).toHaveBeenLastCalledWith(null)
  })

  // A prop é opcional: sem ela o painel monta e desmonta como antes.
  it('monta e desmonta sem a prop `onTerminal`', () => {
    invokeMock.mockResolvedValue('term-1')

    const { unmount } = render(<TerminalPane cwd="." />)

    expect(() => unmount()).not.toThrow()
  })
})

// SPEC: wsl-terminal-profile (WSLP-12)
describe('TerminalPane — falha de spawn (WSLP-12)', () => {
  // O texto exato inclui o rótulo do perfil e o stderr do `wsl.exe` porque
  // é isso que `ManagerError::Profile` devolve verbatim (WSLP-10, WSLP-11)
  // — o painel só escreve a mensagem, não reformata nem resume nada.
  it('spawn rejeitado escreve a mensagem verbatim, com rótulo do perfil e texto do wsl.exe', async () => {
    writeMock.mockClear()
    const mensagemDoBackend =
      'perfil `wsl:Ubuntu-24.04` indisponível: Ubuntu-24.04 não está mais registrada'
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'pty_spawn') return Promise.reject(mensagemDoBackend)
      return Promise.resolve()
    })

    render(<TerminalPane cwd="." />)

    await vi.waitFor(() =>
      expect(writeMock).toHaveBeenCalledWith(expect.stringContaining(mensagemDoBackend)),
    )
  })

  it('spawn bem-sucedido não escreve erro nenhum, como antes', async () => {
    writeMock.mockClear()
    invokeMock.mockResolvedValue('term-1')

    render(<TerminalPane cwd="." />)

    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledWith('pty_spawn', expect.anything()))
    expect(writeMock).not.toHaveBeenCalledWith(expect.stringContaining('falha ao iniciar'))
  })

  it('o payload de `pty_spawn` não manda mais o campo `shell`', async () => {
    invokeMock.mockResolvedValue('term-1')

    render(<TerminalPane cwd="." />)

    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledWith('pty_spawn', expect.anything()))
    const payload = invokeMock.mock.calls.find(([cmd]) => cmd === 'pty_spawn')?.[1]
    expect(payload).not.toHaveProperty('shell')
  })
})

// SPEC: multi-terminal (TERM-14) — Ctrl+V cola o texto da área de transferência
// em vez de mandar o `^V` literal para o shell.
describe('TerminalPane — colar com Ctrl+V (TERM-14)', () => {
  function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      type: 'keydown',
      key: 'v',
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      ...init,
    } as unknown as KeyboardEvent
  }

  /** Monta o painel e devolve o handler que ele registrou no xterm. */
  function mountAndGetHandler(clipboard: { readText: () => Promise<string> }) {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue('t1')
    keyHandlers.length = 0
    pasteMock.mockReset()
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: clipboard,
      configurable: true,
    })
    render(<TerminalPane cwd="/tmp" />)
    const handler = keyHandlers[0]
    expect(handler).toBeDefined()
    return handler!
  }

  it('Ctrl+V lê a área de transferência e cola pelo xterm', async () => {
    const handler = mountAndGetHandler({ readText: () => Promise.resolve('npm run build') })

    const event = keyEvent({ ctrlKey: true, key: 'v' })
    expect(handler(event)).toBe(false)
    expect(event.preventDefault).toHaveBeenCalled()

    await vi.waitFor(() => expect(pasteMock).toHaveBeenCalledWith('npm run build'))
  })

  it('Ctrl+Shift+V também cola', async () => {
    const handler = mountAndGetHandler({ readText: () => Promise.resolve('texto') })

    expect(handler(keyEvent({ ctrlKey: true, shiftKey: true, key: 'V' }))).toBe(false)

    await vi.waitFor(() => expect(pasteMock).toHaveBeenCalledWith('texto'))
  })

  it('área de transferência vazia não cola nada', async () => {
    const readText = vi.fn(() => Promise.resolve(''))
    const handler = mountAndGetHandler({ readText })

    handler(keyEvent({ ctrlKey: true, key: 'v' }))

    // Espera a leitura e o `.then` que ela encadeia — sem isto o `expect`
    // rodaria antes do handler ter chance de colar, e passaria por acidente.
    await readText.mock.results[0]!.value
    await Promise.resolve()

    expect(pasteMock).not.toHaveBeenCalled()
  })

  it('leitura negada não derruba o painel', async () => {
    const handler = mountAndGetHandler({ readText: () => Promise.reject(new Error('negado')) })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(handler(keyEvent({ ctrlKey: true, key: 'v' }))).toBe(false)

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(pasteMock).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('tecla sem Ctrl, com Alt, ou que não seja V segue para o xterm', () => {
    const handler = mountAndGetHandler({ readText: () => Promise.resolve('x') })

    expect(handler(keyEvent({ key: 'v' }))).toBe(true)
    expect(handler(keyEvent({ ctrlKey: true, altKey: true, key: 'v' }))).toBe(true)
    expect(handler(keyEvent({ ctrlKey: true, key: 'c' }))).toBe(true)
    expect(handler(keyEvent({ type: 'keyup', ctrlKey: true, key: 'v' }))).toBe(true)
    expect(pasteMock).not.toHaveBeenCalled()
  })
})

// SPEC: agent-permission-mode (PERM-01) — o modo escolhido no wizard chega ao
// `pty_spawn`, que é quem monta a linha de comando do agente.
describe('TerminalPane — modo de permissão (PERM-01)', () => {
  function spawnArgs() {
    return invokeMock.mock.calls.find(([cmd]) => cmd === 'pty_spawn')?.[1] as
      | Record<string, unknown>
      | undefined
  }

  it('repassa o modo escolhido', () => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue('t1')

    render(<TerminalPane cwd="." agent="claude-code" permissionMode="bypassPermissions" />)

    expect(spawnArgs()?.permissionMode).toBe('bypassPermissions')
  })

  it('sem modo escolhido manda null, e o backend deixa o CLI decidir', () => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue('t1')

    render(<TerminalPane cwd="." agent="codex-cli" />)

    expect(spawnArgs()?.permissionMode).toBeNull()
  })
})
