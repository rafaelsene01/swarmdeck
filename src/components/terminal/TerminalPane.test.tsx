// SPEC: multi-terminal (TERM-01, TERM-02, TERM-14), terminal-screenshot (SHOT-13), agent-permission-mode (PERM-01), terminal-font (TFONT-01)
// SPEC: terminal-glyph-metrics (TGLY-01, TGLY-02, TGLY-03)

import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Same `vi.hoisted` pattern as `App.test.tsx` — the `vi.mock` factories below
// are hoisted above these imports by Vitest's transform.
const {
  invokeMock,
  onDataHandlers,
  keyHandlers,
  pasteMock,
  writeMock,
  termOptions,
  fitMock,
  proposed,
  metricLog,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  /** TRSZ-01: cada `fit()` que o painel aplicou de fato. */
  fitMock: vi.fn(),
  /**
   * TGLY-02, TGLY-03: escritas em `options.fontFamily` e `fit()` na ordem em
   * que aconteceram. É a ordem que prova a invalidação ANTES do fit, e a
   * sequência que prova que ela passa por um valor diferente do canônico.
   */
  metricLog: [] as string[],
  /** TRSZ-01: proposta que o `FitAddon` mockado devolve. */
  proposed: { value: { cols: 120, rows: 30 } as { cols: number; rows: number } | undefined },
  /** TFONT-01: as options passadas ao construtor do xterm. */
  termOptions: [] as Array<Record<string, unknown>>,
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
    /**
     * TGLY-03: o painel invalida o cache de glifo escrevendo em
     * `terminal.options.fontFamily`, então o mock precisa registrar cada
     * escrita — um `Record` cru perderia a sequência.
     */
    options: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
      set(target, prop, value) {
        if (prop === 'fontFamily') metricLog.push(`font:${String(value)}`)
        target[prop as string] = value
        return true
      },
    })
    constructor(options: Record<string, unknown>) {
      termOptions.push(options)
    }
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

// TRSZ-01: o piso de colunas decide pela proposta do addon, então o mock
// precisa devolver uma proposta controlável e registrar cada `fit()`.
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {
      metricLog.push('fit')
      fitMock()
    }
    proposeDimensions() {
      return proposed.value
    }
  },
}))

// jsdom não implementa `ResizeObserver`, e o painel observa o container.
// TGLY-02: o callback é guardado para os testes poderem simular um resize
// assentado, que é o caminho onde a invalidação precisa acontecer.
const resizeCallbacks: ResizeObserverCallback[] = []
globalThis.ResizeObserver = class {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback)
  }
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

/**
 * jsdom mede todo elemento com 0; sem isto `syncSize` desiste antes do piso
 * de colunas e nenhum dos casos que dependem de um fit aplicado exercita o
 * que interessa.
 */
const withMeasuredBox = () => {
  const patch = (name: 'clientWidth' | 'clientHeight', value: number) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value })
    return () => {
      if (original) Object.defineProperty(HTMLElement.prototype, name, original)
      else Reflect.deleteProperty(HTMLElement.prototype, name)
    }
  }
  const undo = [patch('clientWidth', 900), patch('clientHeight', 600)]
  return () => undo.forEach((fn) => fn())
}

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

// SPEC: terminal-boot-loading (BOOT-02, BOOT-03) — o painel mostra que está
// subindo a sessão, e avisa quem o montou quando o `pty_spawn` assenta.
describe('TerminalPane — carregamento do painel', () => {
  const BOOT_LABEL = 'iniciando sessão…'

  it('mostra o carregamento até `pty_spawn` resolver, e só então chama `onReady`', async () => {
    invokeMock.mockReset()
    let resolveSpawn: (id: string) => void = () => {}
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'pty_spawn') return new Promise<string>((r) => (resolveSpawn = r))
      return Promise.resolve()
    })
    const onReady = vi.fn()

    render(<TerminalPane cwd="." onReady={onReady} />)

    expect(screen.getByText(BOOT_LABEL)).toBeInTheDocument()
    expect(onReady).not.toHaveBeenCalled()

    resolveSpawn('term-1')

    await waitFor(() => expect(screen.queryByText(BOOT_LABEL)).not.toBeInTheDocument())
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  // BOOT-03: sem isto a mensagem de erro que WSLP-12 escreve ficaria atrás do
  // esqueleto, e o overlay de boot (BOOT-06) esperaria para sempre.
  it('spawn rejeitado encerra o carregamento e chama `onReady` do mesmo jeito', async () => {
    invokeMock.mockReset()
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'pty_spawn') return Promise.reject('perfil `wsl:Ubuntu` indisponível: x')
      return Promise.resolve()
    })
    const onReady = vi.fn()

    render(<TerminalPane cwd="." onReady={onReady} />)

    await waitFor(() => expect(screen.queryByText(BOOT_LABEL)).not.toBeInTheDocument())
    expect(onReady).toHaveBeenCalledTimes(1)
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

/**
 * SPEC: terminal-font (TFONT-01)
 *
 * O default do xterm (`courier-new, courier, monospace`) não tem os glifos de
 * ícone do prompt. A lista precisa terminar na fonte embarcada — e começar
 * por uma monoespaçada do sistema, que é quem dá a métrica da célula.
 */
describe('TerminalPane — fonte do terminal (TFONT-01)', () => {
  it('cria o xterm com a Nerd Font embarcada como último fallback', () => {
    invokeMock.mockResolvedValue('t-font')
    termOptions.length = 0

    render(<TerminalPane cwd="." />)

    const fontFamily = String(termOptions.at(-1)?.fontFamily ?? '')
    expect(fontFamily).toMatch(/monospace/)
    expect(fontFamily.trim().endsWith("'Symbols Nerd Font Mono'")).toBe(true)
  })
})

/**
 * SPEC: terminal-resize-floor (TRSZ-01, TRSZ-02, TRSZ-03)
 *
 * O `FitAddon` grampeia a proposta em `MINIMUM_COLS = 2` em vez de desistir.
 * Aplicar isso manda o provedor redesenhar em duas colunas, e cada caractere
 * vira uma linha lógica que o alargamento nunca refunde — o histórico fica
 * uma tira de um caractere.
 */
describe('TerminalPane — piso de colunas (TRSZ)', () => {
  it('não redimensiona quando a caixa é medida abaixo do piso de colunas', async () => {
    const restore = withMeasuredBox()
    try {
      fitMock.mockClear()
      invokeMock.mockClear()
      invokeMock.mockResolvedValue('t-floor')
      // O que o FitAddon devolve quando a caixa é estreita: o piso dele.
      proposed.value = { cols: 2, rows: 24 }

      render(<TerminalPane cwd="." />)

      await vi.waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith('pty_spawn', expect.anything()),
      )
      expect(fitMock).not.toHaveBeenCalled()
      expect(invokeMock).not.toHaveBeenCalledWith('pty_resize', expect.anything())
    } finally {
      restore()
      proposed.value = { cols: 120, rows: 30 }
    }
  })

  it('redimensiona normalmente quando a proposta está acima do piso', async () => {
    const restore = withMeasuredBox()
    try {
      fitMock.mockClear()
      invokeMock.mockClear()
      invokeMock.mockResolvedValue('t-wide')
      proposed.value = { cols: 120, rows: 30 }

      render(<TerminalPane cwd="." />)

      // TRSZ-02: o fit inicial passa pelo mesmo piso — e passa.
      expect(fitMock).toHaveBeenCalled()
      await vi.waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith('pty_resize', {
          id: 't-wide',
          rows: 24,
          cols: 80,
        }),
      )
    } finally {
      restore()
    }
  })

  it('proposta indisponível também não redimensiona', async () => {
    const restore = withMeasuredBox()
    try {
      fitMock.mockClear()
      invokeMock.mockClear()
      invokeMock.mockResolvedValue('t-undef')
      proposed.value = undefined

      render(<TerminalPane cwd="." />)

      await vi.waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith('pty_spawn', expect.anything()),
      )
      expect(fitMock).not.toHaveBeenCalled()
      expect(invokeMock).not.toHaveBeenCalledWith('pty_resize', expect.anything())
    } finally {
      restore()
      proposed.value = { cols: 120, rows: 30 }
    }
  })

  it('cria o xterm com scrollback acima do padrão da biblioteca', () => {
    invokeMock.mockResolvedValue('t-scroll')
    termOptions.length = 0

    render(<TerminalPane cwd="." />)

    expect(Number(termOptions.at(-1)?.scrollback)).toBeGreaterThan(1000)
  })
})

/**
 * SPEC: terminal-glyph-metrics (TGLY-01, TGLY-02, TGLY-03)
 *
 * O `WidthCache` do renderizador DOM grava `0` quando a caixa mede zero, e
 * nada limpa esse cache depois — nem o `/clear` do CLI, que só reescreve o
 * texto. O painel força a remedida trocando `options.fontFamily` por um valor
 * diferente e voltando ao canônico.
 */
describe('TerminalPane — métrica de glifo (TGLY)', () => {
  /** Controla o `document.fonts.ready` que o painel encadeia no mount. */
  const withFonts = (ready: Promise<unknown>) => {
    const original = Object.getOwnPropertyDescriptor(document, 'fonts')
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } })
    return () => {
      if (original) Object.defineProperty(document, 'fonts', original)
      else Reflect.deleteProperty(document, 'fonts')
    }
  }

  /** Promise que nunca assenta: isola o caminho do resize do da fonte. */
  const fontsNeverReady = () => withFonts(new Promise<void>(() => {}))

  const fitCount = () => metricLog.filter((entry) => entry === 'fit').length

  /** TGLY-02: nenhum `fit()` pode aparecer sem a invalidação imediatamente antes. */
  const everyFitPrecededByRefresh = (canonical: string) =>
    metricLog.every((entry, i) => entry !== 'fit' || metricLog[i - 1] === `font:${canonical}`)

  // TGLY-01: a Nerd Font tem `font-display: block` e ninguém espera
  // `document.fonts` antes do `open()`. O xterm não escuta `FontFaceSet`, então
  // sem isto a métrica fica obsoleta sem evento que a corrija.
  it('remedia a métrica quando a fonte termina de carregar', async () => {
    let resolveFonts: () => void = () => {}
    const restoreFonts = withFonts(new Promise<void>((r) => (resolveFonts = r)))
    try {
      metricLog.length = 0
      termOptions.length = 0
      invokeMock.mockReset()
      invokeMock.mockResolvedValue('t-fonts')

      // Caixa não medida de propósito (jsdom devolve 0): `syncSize` desiste
      // antes do fit, então tudo que sobrar no log vem da fonte.
      render(<TerminalPane cwd="." />)

      expect(metricLog).toEqual([])

      resolveFonts()

      await vi.waitFor(() => expect(metricLog.length).toBe(2))
      // TGLY-03 vale nos DOIS pontos de chamada, não só no do resize: se um dia
      // o caminho da fonte divergir e escrever só o valor canônico, a
      // invalidação ali vira no-op silencioso e este teste é quem pega.
      const canonical = String(termOptions.at(-1)?.fontFamily)
      expect(metricLog[0]).toMatch(/^font:/)
      expect(metricLog[0]).not.toBe(`font:${canonical}`)
      expect(metricLog[1]).toBe(`font:${canonical}`)
    } finally {
      restoreFonts()
    }
  })

  it('painel desmontado antes da fonte resolver não toca no terminal descartado', async () => {
    let resolveFonts: () => void = () => {}
    const restoreFonts = withFonts(new Promise<void>((r) => (resolveFonts = r)))
    try {
      metricLog.length = 0
      invokeMock.mockReset()
      invokeMock.mockResolvedValue('t-gone')

      const { unmount } = render(<TerminalPane cwd="." />)
      unmount()
      resolveFonts()

      // Duas voltas de microtask: a do `.then` e a do corpo dele.
      await Promise.resolve()
      await Promise.resolve()

      expect(metricLog).toEqual([])
    } finally {
      restoreFonts()
    }
  })

  it('remedia a métrica antes de cada fit aplicado, inclusive num resize entre dois tamanhos legítimos', async () => {
    const restoreBox = withMeasuredBox()
    const restoreFonts = fontsNeverReady()
    try {
      metricLog.length = 0
      termOptions.length = 0
      resizeCallbacks.length = 0
      invokeMock.mockReset()
      invokeMock.mockResolvedValue('t-metric')
      proposed.value = { cols: 120, rows: 30 }

      render(<TerminalPane cwd="." />)

      const canonical = String(termOptions.at(-1)?.fontFamily)
      await vi.waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith('pty_resize', expect.anything()),
      )
      expect(everyFitPrecededByRefresh(canonical)).toBe(true)

      // Resize assentado entre dois tamanhos legítimos: o caminho do arraste.
      const before = fitCount()
      proposed.value = { cols: 100, rows: 28 }
      resizeCallbacks.at(-1)!([], {} as ResizeObserver)

      await vi.waitFor(() => expect(fitCount()).toBeGreaterThan(before))
      expect(everyFitPrecededByRefresh(canonical)).toBe(true)
    } finally {
      restoreBox()
      restoreFonts()
      proposed.value = { cols: 120, rows: 30 }
    }
  })

  // TGLY-02: a invalidação vive DEPOIS das guardas. Um resize recusado não
  // aplica nada, então não tem métrica a remedir.
  it('resize recusado pela guarda não invalida nada', async () => {
    const restoreFonts = fontsNeverReady()
    const restoreBox = withMeasuredBox()
    try {
      metricLog.length = 0
      invokeMock.mockReset()
      invokeMock.mockResolvedValue('t-refuse')
      proposed.value = { cols: 2, rows: 24 }

      const abaixoDoPiso = render(<TerminalPane cwd="." />)

      await vi.waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith('pty_spawn', expect.anything()),
      )
      expect(metricLog).toEqual([])
      abaixoDoPiso.unmount()

      // Caixa zero: a outra guarda, e o mesmo desfecho.
      restoreBox()
      proposed.value = { cols: 120, rows: 30 }
      invokeMock.mockReset()
      invokeMock.mockResolvedValue('t-zero')

      render(<TerminalPane cwd="." />)

      await vi.waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith('pty_spawn', expect.anything()),
      )
      expect(metricLog).toEqual([])
    } finally {
      restoreFonts()
      proposed.value = { cols: 120, rows: 30 }
    }
  })

  // TGLY-03: `OptionsService` só emite `onOptionChange` quando o valor difere
  // do guardado. Reatribuir o mesmo valor é no-op silencioso — este teste falha
  // se alguém "simplificar" para uma atribuição só.
  it('a invalidação passa por um valor de fontFamily diferente antes de voltar ao canônico', async () => {
    const restoreBox = withMeasuredBox()
    const restoreFonts = fontsNeverReady()
    try {
      metricLog.length = 0
      termOptions.length = 0
      invokeMock.mockReset()
      invokeMock.mockResolvedValue('t-shape')
      proposed.value = { cols: 120, rows: 30 }

      render(<TerminalPane cwd="." />)

      const canonical = String(termOptions.at(-1)?.fontFamily)
      const fitAt = metricLog.indexOf('fit')
      expect(fitAt).toBeGreaterThanOrEqual(2)
      expect(metricLog[fitAt - 1]).toBe(`font:${canonical}`)
      expect(metricLog[fitAt - 2]).toMatch(/^font:/)
      expect(metricLog[fitAt - 2]).not.toBe(`font:${canonical}`)

      // Deixa o `pty_spawn` assentar antes do `finally` restaurar a caixa
      // medida, senão o `syncSize` do `then` roda contra o estado do teste
      // seguinte. (Não silencia o aviso de `act(...)`: ele sai em quase todo
      // teste deste arquivo, porque o `setStarted` do painel resolve numa
      // promise que nenhum teste envolve em `act`.)
      await vi.waitFor(() =>
        expect(invokeMock).toHaveBeenCalledWith('pty_spawn', expect.anything()),
      )
    } finally {
      restoreBox()
      restoreFonts()
    }
  })
})
