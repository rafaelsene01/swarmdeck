// SPEC: terminal-layout-options (LAYOUT-07, LAYOUT-08, LAYOUT-09, LAYOUT-10, LAYOUT-11, LAYOUT-12, LAYOUT-15)

import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, layoutPlan, type TabLayout } from './layout'

const horizontal = (span: TabLayout['span'] = 'first'): TabLayout => ({ mode: 'horizontal', span })
const vertical = (span: TabLayout['span'] = 'first'): TabLayout => ({ mode: 'vertical', span })

describe('layoutPlan — modo horizontal', () => {
  // LAYOUT-12: um terminal ocupa a área inteira, em qualquer modo.
  it('com 1 terminal dá a área inteira ao único painel', () => {
    expect(layoutPlan(1, horizontal())).toEqual({ columns: 1, rows: 1, spans: [1] })
  })

  // LAYOUT-07: 2 terminais em 2 colunas e 1 linha.
  it('com 2 terminais dispõe em 2 colunas e 1 linha', () => {
    expect(layoutPlan(2, horizontal())).toEqual({ columns: 2, rows: 1, spans: [1, 1] })
  })

  // LAYOUT-09: variante `first` dá a linha de cima inteira à posição 1.
  it('com 3 terminais e variante first, a posição 1 ocupa a linha de cima inteira', () => {
    expect(layoutPlan(3, horizontal('first'))).toEqual({ columns: 2, rows: 2, spans: [2, 1, 1] })
  })

  // LAYOUT-10: variante `last` dá a linha de baixo inteira à posição 3.
  it('com 3 terminais e variante last, a posição 3 ocupa a linha de baixo inteira', () => {
    expect(layoutPlan(3, horizontal('last'))).toEqual({ columns: 2, rows: 2, spans: [1, 1, 2] })
  })

  // LAYOUT-08: 4 terminais em 2 colunas e 2 linhas.
  it('com 4 terminais dispõe em 2 colunas e 2 linhas', () => {
    expect(layoutPlan(4, horizontal())).toEqual({ columns: 2, rows: 2, spans: [1, 1, 1, 1] })
  })
})

describe('layoutPlan — modo vertical', () => {
  // LAYOUT-11: 1 coluna e N linhas de altura igual, na ordem da aba.
  it('empilha N terminais em 1 coluna e N linhas, todas de span 1', () => {
    expect(layoutPlan(4, vertical())).toEqual({ columns: 1, rows: 4, spans: [1, 1, 1, 1] })
    expect(layoutPlan(3, vertical())).toEqual({ columns: 1, rows: 3, spans: [1, 1, 1] })
  })

  // LAYOUT-12 + edge case: vertical com 1 terminal não tem tratamento especial.
  it('com 1 terminal dá a área inteira, sem tratamento especial', () => {
    expect(layoutPlan(1, vertical())).toEqual({ columns: 1, rows: 1, spans: [1] })
  })
})

describe('layoutPlan — variante de largura (LAYOUT-15)', () => {
  it('mantém a variante gravada quando a contagem deixa de ser 3 e volta a aplicá-la ao retornar a 3', () => {
    // `span` é campo do TabLayout, não estado derivado da contagem: o mesmo
    // objeto de layout atravessa a mudança de contagem sem perder a escolha.
    const layout = horizontal('last')

    expect(layoutPlan(2, layout).spans).toEqual([1, 1])
    expect(layout.span).toBe('last')
    expect(layoutPlan(3, layout).spans).toEqual([1, 1, 2])
  })

  it('o layout padrão é horizontal com a variante first', () => {
    expect(DEFAULT_LAYOUT).toEqual({ mode: 'horizontal', span: 'first' })
  })
})
