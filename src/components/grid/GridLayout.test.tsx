// SPEC: multi-terminal (TERM-03, TERM-04), terminal-chrome (CHROME-01)

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import GridLayout, { applyDrag, gridTemplate, MIN_FRAC, type Pane } from './GridLayout'

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
