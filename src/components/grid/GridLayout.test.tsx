// SPEC: multi-terminal (TERM-03, TERM-04, TERM-08), terminal-chrome (CHROME-01), terminal-layout-options (LAYOUT-07, LAYOUT-08, LAYOUT-09, LAYOUT-10, LAYOUT-11, LAYOUT-12, LAYOUT-18, LAYOUT-20)

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import GridLayout, { applyDrag, gridTemplate, MIN_FRAC, type Pane } from './GridLayout'
import type { TabLayout } from '../../state/layout'

describe('gridTemplate', () => {
  it('dispõe 2 painéis em 2 colunas de largura igual', () => {
    expect(gridTemplate(2)).toEqual({ columns: 2, rows: 1 })
  })

  it('dispõe 3 painéis em grid 2x2', () => {
    expect(gridTemplate(3)).toEqual({ columns: 2, rows: 2 })
  })

  it('dispõe 4 painéis em grid 2x2', () => {
    expect(gridTemplate(4)).toEqual({ columns: 2, rows: 2 })
  })
})

describe('GridLayout — calha entre cartões (CHROME-01)', () => {
  it('separa as células com a calha de 8px em vez de encostá-las', () => {
    const { container } = render(
      <GridLayout
        panes={[
          { id: 'a', fracW: 0.5, fracH: 1 },
          { id: 'b', fracW: 0.5, fracH: 1 },
        ]}
      />,
    )

    const grid = container.querySelector<HTMLElement>('.grid-layout')
    expect(grid?.style.gap).toBe('var(--gap, 8px)')
  })
})

describe('GridLayout — aplica o plano de layout da aba', () => {
  const horizontal = (span: TabLayout['span'] = 'first'): TabLayout => ({
    mode: 'horizontal',
    span,
  })

  function panesOf(...ids: string[]): Pane[] {
    return ids.map((id) => ({ id, fracW: 1 / ids.length, fracH: 1 }))
  }

  function renderGrid(panes: Pane[], layout?: TabLayout) {
    return render(
      <GridLayout panes={panes} layout={layout} renderPane={(pane) => <b>{pane.id}</b>} />,
    )
  }

  function cells(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('.grid-layout__cell')]
  }

  // LAYOUT-07: 2 terminais em 2 colunas e 1 linha.
  it('dispõe 2 terminais em 2 colunas e 1 linha, cada célula ocupando 1 coluna', () => {
    const { container } = renderGrid(panesOf('a', 'b'), horizontal())

    const grid = container.querySelector<HTMLElement>('.grid-layout')
    expect(grid?.style.gridTemplateColumns).toBe('repeat(2, 1fr)')
    expect(grid?.style.gridTemplateRows).toBe('repeat(1, 1fr)')
    expect(cells(container).map((c) => c.style.gridColumn)).toEqual(['span 1', 'span 1'])
  })

  // LAYOUT-09: variante `first` dá a linha de cima inteira à posição 1.
  it('com 3 terminais e variante first, o primeiro painel ocupa a linha de cima inteira', () => {
    const { container } = renderGrid(panesOf('a', 'b', 'c'), horizontal('first'))

    const grid = container.querySelector<HTMLElement>('.grid-layout')
    expect(grid?.style.gridTemplateColumns).toBe('repeat(2, 1fr)')
    expect(grid?.style.gridTemplateRows).toBe('repeat(2, 1fr)')
    expect(cells(container).map((c) => c.style.gridColumn)).toEqual(['span 2', 'span 1', 'span 1'])
  })

  // LAYOUT-10: variante `last` dá a linha de baixo inteira à posição 3.
  it('com 3 terminais e variante last, o terceiro painel ocupa a linha de baixo inteira', () => {
    const { container } = renderGrid(panesOf('a', 'b', 'c'), horizontal('last'))

    expect(cells(container).map((c) => c.style.gridColumn)).toEqual(['span 1', 'span 1', 'span 2'])
  })

  // LAYOUT-11 + LAYOUT-12: vertical empilha; 1 terminal ocupa tudo.
  it('no modo vertical empilha em 1 coluna e N linhas, e com 1 terminal ocupa a área inteira', () => {
    const vertical: TabLayout = { mode: 'vertical', span: 'first' }
    const { container, rerender } = renderGrid(panesOf('a', 'b', 'c'), vertical)

    const grid = () => container.querySelector<HTMLElement>('.grid-layout')
    expect(grid()?.style.gridTemplateColumns).toBe('repeat(1, 1fr)')
    expect(grid()?.style.gridTemplateRows).toBe('repeat(3, 1fr)')

    rerender(<GridLayout panes={panesOf('a')} layout={vertical} />)
    expect(grid()?.style.gridTemplateColumns).toBe('repeat(1, 1fr)')
    expect(grid()?.style.gridTemplateRows).toBe('repeat(1, 1fr)')
  })

  // LAYOUT-18, LAYOUT-20: reordenar mantém a contagem; a nova ordem tem que
  // chegar à tela, e sem trocar os nós de painel (nada é desmontado).
  it('reordenar os painéis mantendo a contagem re-renderiza na nova ordem', () => {
    const { container, rerender } = renderGrid(panesOf('a', 'b', 'c'), horizontal())
    expect(cells(container).map((c) => c.textContent)).toEqual(['a', 'b', 'c'])
    const paneA = container.querySelector('b')!

    rerender(
      <GridLayout
        panes={panesOf('c', 'a', 'b')}
        layout={horizontal()}
        renderPane={(pane) => <b>{pane.id}</b>}
      />,
    )

    expect(cells(container).map((c) => c.textContent)).toEqual(['c', 'a', 'b'])
    // Mesmo nó movido de lugar: a `key` é o id, então React reordena em vez
    // de remontar — é isso que preserva PTY e scrollback.
    expect([...container.querySelectorAll('b')].find((n) => n.textContent === 'a')).toBe(paneA)
  })

  // Edge case: painel maximizado mantém TERM-04 em qualquer modo de layout.
  it('painel maximizado no modo vertical continua cobrindo tudo, com os outros montados e fora de vista', () => {
    const vertical: TabLayout = { mode: 'vertical', span: 'first' }
    const panes = panesOf('a', 'b', 'c')
    panes[1]!.mode = 'maximized'

    const { container } = renderGrid(panes, vertical)

    const [celulaA, celulaB, celulaC] = cells(container)
    expect(celulaB!.style.position).toBe('fixed')
    expect(celulaB!.style.display).toBe('')
    // Os outros não somem do DOM: só saem de vista, com PTY e scrollback vivos.
    expect(celulaA!.style.display).toBe('none')
    expect(celulaC!.style.display).toBe('none')
    expect([...container.querySelectorAll('b')].map((n) => n.textContent)).toEqual(['a', 'b', 'c'])
  })

  // SPEC: minimized-tray (MIN-01) — minimizado sai da tela por inteiro e sai
  // do plano; os visíveis se redistribuem como se ele não existisse. A célula
  // continua no DOM: desmontar mataria o PTY (TERM-08).
  it('painel minimizado sai do plano do grid sem desmontar', () => {
    const panes = panesOf('a', 'b', 'c')
    panes[1]!.mode = 'minimized'

    const { container } = renderGrid(panes, horizontal('last'))

    const celulas = cells(container)
    expect(celulas.map((c) => c.textContent)).toEqual(['a', 'b', 'c'])
    expect(celulas[1]!.style.display).toBe('none')
    // Sobraram 2 visíveis: duas colunas de span 1, sem a linha inteira que a
    // variante `last` daria ao terceiro de três.
    expect(celulas[0]!.style.gridColumn).toBe('span 1')
    expect(celulas[2]!.style.gridColumn).toBe('span 1')
    expect(container.querySelector('.grid-layout')!.getAttribute('style')).toContain(
      'grid-template-columns: repeat(2, 1fr)',
    )
  })

  it('só renderiza divisória entre vizinhos da mesma linha e sem span', () => {
    const dividers = (container: HTMLElement) =>
      container.querySelectorAll('.grid-layout__divider').length

    // 4 terminais em 2×2: divisória dentro de cada linha (0-1 e 2-3), nunca
    // entre as linhas.
    const quatro = renderGrid(panesOf('a', 'b', 'c', 'd'), horizontal())
    expect(dividers(quatro.container)).toBe(2)

    // 3 com variante first: o painel de span 2 não tem vizinho lateral.
    const tres = renderGrid(panesOf('a', 'b', 'c'), horizontal('first'))
    expect(dividers(tres.container)).toBe(1)

    // Modo vertical: uma coluna só, nada a redimensionar.
    const empilhado = renderGrid(panesOf('a', 'b', 'c'), { mode: 'vertical', span: 'first' })
    expect(dividers(empilhado.container)).toBe(0)
  })
})

describe('applyDrag', () => {
  function panes(): Pane[] {
    return [
      { id: 'a', fracW: 0.5, fracH: 1 },
      { id: 'b', fracW: 0.5, fracH: 1 },
    ]
  }

  it('arrastar a divisória redistribui a fração entre os dois vizinhos, conservando a soma', () => {
    const result = applyDrag(panes(), 'a', 'b', 0.1)

    const a = result.find((p) => p.id === 'a')!
    const b = result.find((p) => p.id === 'b')!

    expect(a.fracW).toBeCloseTo(0.6)
    expect(b.fracW).toBeCloseTo(0.4)
    expect(a.fracW + b.fracW).toBeCloseTo(1)
  })

  it('respeita o piso mínimo de largura e não deixa nenhum painel encolher além dele', () => {
    // Arrasto enorme tentando espremer `b` bem abaixo do piso.
    const result = applyDrag(panes(), 'a', 'b', 10)

    const a = result.find((p) => p.id === 'a')!
    const b = result.find((p) => p.id === 'b')!

    expect(b.fracW).toBeCloseTo(MIN_FRAC)
    expect(a.fracW).toBeGreaterThanOrEqual(MIN_FRAC)
    expect(a.fracW + b.fracW).toBeCloseTo(1)
  })
})
