// SPEC: terminal-screenshot (SHOT-09, SHOT-10, SHOT-11, SHOT-12, SHOT-13, SHOT-22)

import type { Terminal, IBufferCell } from '@xterm/xterm'

export interface SnapshotOptions {
  cellWidth: number
  cellHeight: number
  fontFamily: string
  fontSize: number
  dpr: number
  /** Texto da faixa de título: índice do painel e diretório de trabalho. */
  title: string
  padding: number
}

/** Fundo do print — o mesmo `theme.background` que `TerminalPane` dá ao xterm. */
const BACKGROUND = '#0a0a0c'
/** Cor de texto padrão — o mesmo `theme.foreground` do `TerminalPane`. */
const FOREGROUND = '#e8e8ea'

/** As 16 cores base do xterm (paleta Tango); 16-255 são calculados abaixo. */
const ANSI_BASE = [
  '#2e3436', '#cc0000', '#4e9a06', '#c4a000',
  '#3465a4', '#75507b', '#06989a', '#d3d7cf',
  '#555753', '#ef2929', '#8ae234', '#fce94f',
  '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec',
]

const hex = (n: number) => n.toString(16).padStart(2, '0')

/** Tabela ANSI 256: 0-15 literais, 16-231 cubo 6x6x6, 232-255 escala de cinza. */
export const ANSI_PALETTE: string[] = Array.from({ length: 256 }, (_, i) => {
  if (i < 16) return ANSI_BASE[i] ?? FOREGROUND
  if (i < 232) {
    const n = i - 16
    const step = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    return `#${hex(step(Math.floor(n / 36)))}${hex(step(Math.floor(n / 6) % 6))}${hex(step(n % 6))}`
  }
  const gray = 8 + (i - 232) * 10
  return `#${hex(gray)}${hex(gray)}${hex(gray)}`
})

/** Altura lógica da faixa de título desenhada no topo do print (SHOT-22). */
export const TITLE_STRIP_HEIGHT = 28
/** Fundo da faixa de título — token `--surface`. */
const TITLE_BACKGROUND = '#131318'

const rgbOf = (value: number) =>
  `#${hex((value >> 16) & 0xff)}${hex((value >> 8) & 0xff)}${hex(value & 0xff)}`

const fgOf = (cell: IBufferCell) => {
  if (cell.isFgRGB()) return rgbOf(cell.getFgColor())
  if (cell.isFgPalette()) return ANSI_PALETTE[cell.getFgColor()] ?? FOREGROUND
  return FOREGROUND
}

const bgOf = (cell: IBufferCell) => {
  if (cell.isBgRGB()) return rgbOf(cell.getBgColor())
  if (cell.isBgPalette()) return ANSI_PALETTE[cell.getBgColor()] ?? BACKGROUND
  return BACKGROUND
}

/**
 * Desenha o viewport de `term` no contexto recebido.
 *
 * Função pura de desenho: não cria canvas, não mede DOM. Quem chama já
 * dimensionou o contexto — é o que torna isto testável com um contexto falso.
 */
export function paintSnapshot(
  term: Terminal,
  opts: SnapshotOptions,
  ctx: CanvasRenderingContext2D,
): void {
  const { cellWidth, cellHeight, fontFamily, fontSize, dpr, title, padding } = opts
  const buffer = term.buffer.active
  const width = term.cols * cellWidth + padding * 2
  const height = TITLE_STRIP_HEIGHT + term.rows * cellHeight + padding * 2

  ctx.scale(dpr, dpr)

  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, width, height)

  // SPEC: terminal-screenshot (SHOT-22) — faixa que identifica o painel de origem.
  ctx.fillStyle = TITLE_BACKGROUND
  ctx.fillRect(0, 0, width, TITLE_STRIP_HEIGHT)
  ctx.fillStyle = FOREGROUND
  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'middle'
  ctx.fillText(title, padding, TITLE_STRIP_HEIGHT / 2)

  ctx.textBaseline = 'top'
  const top = TITLE_STRIP_HEIGHT + padding
  const cell = buffer.getNullCell()

  for (let row = 0; row < term.rows; row++) {
    const line = buffer.getLine(buffer.baseY + row)
    if (!line) continue
    const y = top + row * cellHeight

    for (let col = 0; col < term.cols; col++) {
      // Célula de largura 0 é continuação de caractere de largura dupla:
      // o glifo já foi desenhado na célula anterior.
      const current = line.getCell(col, cell)
      if (!current || current.getWidth() === 0) continue

      const inverse = current.isInverse() !== 0
      const fg = inverse ? bgOf(current) : fgOf(current)
      const bg = inverse ? fgOf(current) : bgOf(current)
      const x = padding + col * cellWidth

      if (bg !== BACKGROUND) {
        ctx.fillStyle = bg
        ctx.fillRect(x, y, cellWidth * current.getWidth(), cellHeight)
      }

      const chars = current.getChars()
      if (chars === '' || chars === ' ') continue

      const style = `${current.isItalic() ? 'italic ' : ''}${current.isBold() ? 'bold ' : ''}`
      ctx.font = `${style}${fontSize}px ${fontFamily}`
      ctx.globalAlpha = current.isDim() ? 0.5 : 1
      ctx.fillStyle = fg
      ctx.fillText(chars, x, y)
      ctx.globalAlpha = 1

      if (current.isUnderline()) {
        ctx.fillRect(x, y + cellHeight - 1, cellWidth * current.getWidth(), 1)
      }
    }
  }
}

/** Respiro entre a borda do PNG e a área de texto. */
const PADDING = 12

/**
 * Converte o viewport de `term` num PNG.
 *
 * Rejeita quando o painel não está na tela (aba inativa, painel minimizado):
 * ali `.xterm-screen` mede zero e o print sairia degenerado — SHOT-13.
 */
export async function snapshotBlob(
  term: Terminal,
  meta: { index: number; cwd: string },
): Promise<Blob> {
  const screen = term.element?.querySelector('.xterm-screen') as HTMLElement | null
  if (!screen) throw new Error('terminal sem elemento na tela')

  // A ordem importa: dividir antes de validar transformaria zero linhas ou
  // zero colunas em `Infinity`, que passa por qualquer teste de verdade.
  if (!term.cols || !term.rows || !screen.clientWidth || !screen.clientHeight) {
    throw new Error('terminal sem dimensão visível')
  }
  const cellWidth = screen.clientWidth / term.cols
  const cellHeight = screen.clientHeight / term.rows

  const dpr = window.devicePixelRatio || 1
  const width = term.cols * cellWidth + PADDING * 2
  const height = TITLE_STRIP_HEIGHT + term.rows * cellHeight + PADDING * 2

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas sem contexto 2D')

  paintSnapshot(
    term,
    {
      cellWidth,
      cellHeight,
      fontFamily: String(term.options.fontFamily ?? 'monospace'),
      fontSize: Number(term.options.fontSize ?? 14),
      dpr,
      title: `#${meta.index} · ${meta.cwd}`,
      padding: PADDING,
    },
    ctx,
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('falha ao gerar o PNG'))
    }, 'image/png')
  })
}
