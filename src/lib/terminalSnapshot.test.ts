// SPEC: terminal-screenshot (SHOT-09, SHOT-10, SHOT-11, SHOT-12, SHOT-13, SHOT-14, SHOT-22)

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Terminal, IBufferCell } from '@xterm/xterm'
import {
  ANSI_PALETTE,
  TITLE_STRIP_HEIGHT,
  paintSnapshot,
  snapshotBlob,
  type SnapshotOptions,
} from './terminalSnapshot'

type Call = { op: string; args: unknown[]; fillStyle: string; font: string; alpha: number }

/** Contexto 2D falso: registra cada chamada junto do estado corrente do pincel. */
function fakeContext() {
  const calls: Call[] = []
  const ctx = {
    fillStyle: '',
    font: '',
    textBaseline: '',
    globalAlpha: 1,
    scale: (...args: unknown[]) => record('scale', args),
    fillRect: (...args: unknown[]) => record('fillRect', args),
    fillText: (...args: unknown[]) => record('fillText', args),
  }
  function record(op: string, args: unknown[]) {
    calls.push({ op, args, fillStyle: ctx.fillStyle, font: ctx.font, alpha: ctx.globalAlpha })
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

interface CellSpec {
  chars?: string
  width?: number
  fg?: { rgb?: number; palette?: number }
  bg?: { rgb?: number; palette?: number }
  bold?: boolean
  italic?: boolean
  dim?: boolean
  underline?: boolean
  inverse?: boolean
}

const cellOf = (spec: CellSpec): IBufferCell =>
  ({
    getChars: () => spec.chars ?? 'a',
    getWidth: () => spec.width ?? 1,
    getFgColor: () => spec.fg?.rgb ?? spec.fg?.palette ?? 0,
    getBgColor: () => spec.bg?.rgb ?? spec.bg?.palette ?? 0,
    isFgRGB: () => spec.fg?.rgb !== undefined,
    isBgRGB: () => spec.bg?.rgb !== undefined,
    isFgPalette: () => spec.fg?.palette !== undefined,
    isBgPalette: () => spec.bg?.palette !== undefined,
    isBold: () => (spec.bold ? 1 : 0),
    isItalic: () => (spec.italic ? 1 : 0),
    isDim: () => (spec.dim ? 1 : 0),
    isUnderline: () => (spec.underline ? 1 : 0),
    isInverse: () => (spec.inverse ? 1 : 0),
  }) as unknown as IBufferCell

/** Terminal falso: `rows` linhas de `cols` células, a partir de `baseY`. */
function fakeTerminal(grid: CellSpec[][], baseY = 0, scrollback: CellSpec[][] = []) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const lines = [...scrollback, ...grid]
  return {
    rows,
    cols,
    buffer: {
      active: {
        baseY,
        getNullCell: () => cellOf({}),
        getLine: (y: number) => {
          const line = lines[y]
          if (!line) return undefined
          return {
            getCell: (x: number) => (line[x] ? cellOf(line[x]) : undefined),
          }
        },
      },
    },
  } as unknown as Terminal
}

const opts: SnapshotOptions = {
  cellWidth: 10,
  cellHeight: 20,
  fontFamily: 'monospace',
  fontSize: 14,
  dpr: 1,
  title: '#2 · D:/ide',
  padding: 12,
}

const allTextCalls = (calls: Call[]) => calls.filter((c) => c.op === 'fillText')
/** Texto das células — o primeiro `fillText` é sempre o da faixa de título. */
const textCalls = (calls: Call[]) => allTextCalls(calls).slice(1)

describe('ANSI_PALETTE', () => {
  // SHOT-11: a resolução por paleta precisa cobrir os 256 índices.
  it('tem 0-15 literais, 16-231 do cubo 6x6x6 e 232-255 em escala de cinza', () => {
    expect(ANSI_PALETTE).toHaveLength(256)
    expect(ANSI_PALETTE[1]).toBe('#cc0000')
    expect(ANSI_PALETTE[16]).toBe('#000000')
    expect(ANSI_PALETTE[21]).toBe('#0000ff')
    expect(ANSI_PALETTE[231]).toBe('#ffffff')
    expect(ANSI_PALETTE[232]).toBe('#080808')
    expect(ANSI_PALETTE[255]).toBe('#eeeeee')
  })
})

describe('paintSnapshot', () => {
  // SHOT-10: fundo do print e escala de devicePixelRatio.
  it('pinta o fundo do viewport e escala pelo dpr', () => {
    const { ctx, calls } = fakeContext()
    paintSnapshot(fakeTerminal([[{ chars: ' ' }]]), { ...opts, dpr: 2 }, ctx)

    expect(calls[0]).toMatchObject({ op: 'scale', args: [2, 2] })
    expect(calls[1]).toMatchObject({ op: 'fillRect', args: [0, 0, 34, 72], fillStyle: '#0a0a0c' })
  })

  // SHOT-11: célula sem atributo de cor cai no foreground do tema.
  it('usa o foreground do tema numa célula de cor padrão', () => {
    const { ctx, calls } = fakeContext()
    paintSnapshot(fakeTerminal([[{ chars: 'x' }]]), opts, ctx)

    expect(textCalls(calls)[0]).toMatchObject({ args: ['x', 12, 40], fillStyle: '#e8e8ea' })
  })

  // SHOT-11: cor RGB verdadeira desmontada do inteiro.
  it('resolve a cor RGB de frente e de fundo', () => {
    const { ctx, calls } = fakeContext()
    const cell: CellSpec = { chars: 'x', fg: { rgb: 0xff8000 }, bg: { rgb: 0x102030 } }
    paintSnapshot(fakeTerminal([[cell]]), opts, ctx)

    expect(calls.find((c) => c.op === 'fillRect' && c.fillStyle === '#102030')).toBeDefined()
    expect(textCalls(calls)[0]).toMatchObject({ fillStyle: '#ff8000' })
  })

  // SHOT-11: cor indexada resolve pela tabela ANSI.
  it('resolve a cor de paleta pela tabela ANSI', () => {
    const { ctx, calls } = fakeContext()
    paintSnapshot(fakeTerminal([[{ chars: 'x', fg: { palette: 2 } }]]), opts, ctx)

    expect(textCalls(calls)[0]).toMatchObject({ fillStyle: '#4e9a06' })
  })

  // SHOT-12: inverse troca frente e fundo depois de resolver as duas.
  it('troca frente e fundo na célula com atributo inverse', () => {
    const { ctx, calls } = fakeContext()
    const cell: CellSpec = { chars: 'x', fg: { rgb: 0xff0000 }, bg: { rgb: 0x0000ff }, inverse: true }
    paintSnapshot(fakeTerminal([[cell]]), opts, ctx)

    expect(calls.find((c) => c.op === 'fillRect' && c.fillStyle === '#ff0000')).toBeDefined()
    expect(textCalls(calls)[0]).toMatchObject({ fillStyle: '#0000ff' })
  })

  // SHOT-11: bold, italic, dim e underline saem no desenho.
  it('aplica bold, italic, dim e underline', () => {
    const { ctx, calls } = fakeContext()
    const cell: CellSpec = { chars: 'x', bold: true, italic: true, dim: true, underline: true }
    paintSnapshot(fakeTerminal([[cell]]), opts, ctx)

    const text = textCalls(calls)[0]!
    expect(text.font).toBe('italic bold 14px monospace')
    expect(text.alpha).toBe(0.5)
    expect(calls.some((c) => c.op === 'fillRect' && c.args[1] === 59 && c.args[3] === 1)).toBe(true)
  })

  // SHOT-11: continuação de caractere de largura dupla não é redesenhada.
  it('pula a célula de largura 0', () => {
    const { ctx, calls } = fakeContext()
    paintSnapshot(fakeTerminal([[{ chars: '漢', width: 2 }, { chars: '', width: 0 }]]), opts, ctx)

    expect(textCalls(calls).map((c) => c.args[0])).toEqual(['漢'])
  })

  // SHOT-09: só as linhas de baseY a baseY + rows - 1 entram no print.
  it('desenha apenas as linhas visíveis, a partir de baseY', () => {
    const { ctx, calls } = fakeContext()
    const term = fakeTerminal(
      [[{ chars: 'A' }], [{ chars: 'B' }]],
      2,
      [[{ chars: 'velha1' }], [{ chars: 'velha2' }]],
    )
    paintSnapshot(term, opts, ctx)

    expect(textCalls(calls).map((c) => c.args)).toEqual([
      ['A', 12, 40],
      ['B', 12, 60],
    ])
  })

  // SHOT-22: a faixa de título tem a cor e a altura da especificação visual.
  it('desenha a faixa de título com o fundo e a altura especificados', () => {
    const { ctx, calls } = fakeContext()
    paintSnapshot(fakeTerminal([[{ chars: 'x' }]]), opts, ctx)

    expect(TITLE_STRIP_HEIGHT).toBe(28)
    expect(calls[2]).toMatchObject({
      op: 'fillRect',
      args: [0, 0, 34, TITLE_STRIP_HEIGHT],
      fillStyle: '#131318',
    })
  })

  // SHOT-22: o texto da faixa identifica o painel, e o conteúdo começa abaixo dela.
  it('escreve o título na faixa e desloca a primeira linha para baixo dela', () => {
    const { ctx, calls } = fakeContext()
    paintSnapshot(fakeTerminal([[{ chars: 'x' }]]), opts, ctx)

    const texts = allTextCalls(calls)
    expect(texts[0]).toMatchObject({ args: ['#2 · D:/ide', 12, 14], fillStyle: '#e8e8ea' })
    expect(texts[1]!.args).toEqual(['x', 12, TITLE_STRIP_HEIGHT + 12])
  })

  // SHOT-09: linha ausente no buffer não interrompe o desenho das demais.
  it('ignora linha ausente sem derrubar o restante', () => {
    const { ctx, calls } = fakeContext()
    const term = fakeTerminal([[{ chars: 'A' }]])
    vi.spyOn(term.buffer.active, 'getLine').mockReturnValue(undefined)
    paintSnapshot(term, opts, ctx)

    expect(textCalls(calls)).toHaveLength(0)
  })
})

describe('snapshotBlob', () => {
  /** Anexa ao terminal falso um elemento medindo `width` x `height`. */
  function withScreen(term: Terminal, width: number, height: number) {
    const screen = document.createElement('div')
    Object.defineProperty(screen, 'clientWidth', { value: width })
    Object.defineProperty(screen, 'clientHeight', { value: height })
    screen.className = 'xterm-screen'
    const root = document.createElement('div')
    root.appendChild(screen)
    Object.defineProperty(term, 'element', { value: root, configurable: true })
    Object.defineProperty(term, 'options', { value: { fontFamily: 'monospace', fontSize: 14 } })
    return term
  }

  function stubCanvas(dpr = 1) {
    window.devicePixelRatio = dpr
    const { ctx } = fakeContext()
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx as unknown as RenderingContext)
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (this: HTMLCanvasElement, cb, type) {
        cb(new Blob(['png'], { type: String(type) }))
      })
    return { getContext, toBlob }
  }

  afterEach(() => vi.restoreAllMocks())

  // SHOT-10: dimensões do canvas saem da medida da célula, do padding e do dpr.
  it('dimensiona o canvas pelas colunas, pela faixa de título e pelo dpr', async () => {
    const term = withScreen(fakeTerminal([[{ chars: 'x' }, { chars: 'y' }]]), 20, 20)
    const { getContext } = stubCanvas(2)

    await snapshotBlob(term, { index: 1, cwd: 'D:/ide' })

    const canvas = getContext.mock.instances[0] as unknown as HTMLCanvasElement
    // 2 colunas * 10px + 24 de padding = 44 lógicos; 1 linha * 20 + 28 + 24 = 72.
    expect(canvas.width).toBe(88)
    expect(canvas.height).toBe(144)
  })

  // SHOT-14: o blob sai no formato pedido pelo modal e pela área de transferência.
  it('devolve um blob image/png', async () => {
    const term = withScreen(fakeTerminal([[{ chars: 'x' }]]), 10, 20)
    const { toBlob } = stubCanvas()

    const blob = await snapshotBlob(term, { index: 1, cwd: 'D:/ide' })

    expect(toBlob.mock.calls[0]![1]).toBe('image/png')
    expect(blob.type).toBe('image/png')
  })

  // SHOT-13: painel de aba inativa mede zero; a promise rejeita sem criar canvas.
  it('rejeita quando a medida da célula é zero, sem criar canvas', async () => {
    const term = withScreen(fakeTerminal([[{ chars: 'x' }]]), 0, 0)
    const { getContext } = stubCanvas()

    await expect(snapshotBlob(term, { index: 1, cwd: 'D:/ide' })).rejects.toThrow(
      'terminal sem dimensão visível',
    )
    expect(getContext).not.toHaveBeenCalled()
  })

  // SHOT-13: terminal que reporta zero linhas ou zero colunas.
  it('rejeita quando o terminal reporta zero colunas', async () => {
    const term = withScreen(fakeTerminal([[{ chars: 'x' }]]), 10, 20)
    Object.defineProperty(term, 'cols', { value: 0 })
    const { getContext } = stubCanvas()

    await expect(snapshotBlob(term, { index: 1, cwd: 'D:/ide' })).rejects.toThrow(
      'terminal sem dimensão visível',
    )
    expect(getContext).not.toHaveBeenCalled()
  })

  // SHOT-13: terminal já descartado não tem elemento na tela.
  it('rejeita quando o terminal não tem elemento', async () => {
    const term = fakeTerminal([[{ chars: 'x' }]])
    const { getContext } = stubCanvas()

    await expect(snapshotBlob(term, { index: 1, cwd: 'D:/ide' })).rejects.toThrow(
      'terminal sem elemento na tela',
    )
    expect(getContext).not.toHaveBeenCalled()
  })
})
