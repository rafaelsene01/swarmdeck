// SPEC: terminal-layout-options (LAYOUT-07, LAYOUT-08, LAYOUT-09, LAYOUT-10, LAYOUT-11, LAYOUT-12, LAYOUT-15)

import { gridTemplate } from '../components/grid/GridLayout'

/** Disposição escolhida para uma aba: lado a lado (o comportamento de sempre)
 * ou empilhada. */
export type LayoutMode = 'horizontal' | 'vertical'

/** Qual posição ganha a linha inteira quando a aba tem 3 terminais no modo
 * horizontal: a primeira (linha de cima) ou a última (linha de baixo). */
export type LayoutSpan = 'first' | 'last'

export interface TabLayout {
  mode: LayoutMode
  /** Guardada sempre, mesmo quando a aba não tem 3 terminais — é campo do
   * layout, não estado derivado da contagem (LAYOUT-15). */
  span: LayoutSpan
}

export const DEFAULT_LAYOUT: TabLayout = { mode: 'horizontal', span: 'first' }

export interface LayoutPlan {
  columns: number
  rows: number
  /** Quantas colunas cada painel ocupa, na ordem da aba. */
  spans: number[]
}

/**
 * Única fonte de verdade da disposição: decide colunas, linhas e o span de
 * cada painel a partir da contagem e do layout da aba. `GridLayout` só
 * traduz o plano em CSS.
 */
export function layoutPlan(count: number, layout: TabLayout): LayoutPlan {
  if (layout.mode === 'vertical') {
    // Uma coluna e N linhas de altura igual, na ordem da aba (LAYOUT-11).
    return { columns: 1, rows: Math.max(count, 1), spans: Array<number>(count).fill(1) }
  }

  // O ramo horizontal é o TERM-03 de sempre; as variantes só entram por cima.
  const { columns, rows } = gridTemplate(count)

  // Com 3 terminais o grid 2×2 deixaria uma célula vazia. A variante decide
  // qual posição ocupa a linha inteira (LAYOUT-09, LAYOUT-10).
  const spans =
    count === 3
      ? layout.span === 'first'
        ? [2, 1, 1]
        : [1, 1, 2]
      : Array<number>(count).fill(1)

  return { columns, rows, spans }
}
