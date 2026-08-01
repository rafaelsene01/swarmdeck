// SPEC: multi-terminal (TERM-04, TERM-08)

import { describe, expect, it } from 'vitest'
import { close, maximize, minimize, restore, type TerminalState } from './terminals'

function terminals(): TerminalState[] {
  return [
    { id: 'a', cwd: '/a', fracW: 0.34, fracH: 0.5, mode: 'normal' },
    { id: 'b', cwd: '/b', fracW: 0.33, fracH: 0.5, mode: 'normal' },
    { id: 'c', cwd: '/c', fracW: 0.33, fracH: 0.5, mode: 'normal' },
  ]
}

describe('maximize', () => {
  it('isola o terminal maximizado e mantém os demais vivos em segundo plano', () => {
    const result = maximize(terminals(), 'b')

    expect(result.find((t) => t.id === 'b')?.mode).toBe('maximized')
    // "vivo em segundo plano" = continua na lista, não some.
    expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(result.find((t) => t.id === 'a')?.mode).toBe('normal')
    expect(result.find((t) => t.id === 'c')?.mode).toBe('normal')
  })
})

describe('minimize', () => {
  it('preserva a sessão do terminal minimizado — continua na lista, só muda de modo', () => {
    const result = minimize(terminals(), 'a')

    const a = result.find((t) => t.id === 'a')
    expect(a?.mode).toBe('minimized')
    expect(a?.cwd).toBe('/a') // mesma sessão, não recriada
    expect(result).toHaveLength(3)
  })
})

describe('restore', () => {
  it('reexibe o terminal minimizado, voltando ao modo normal sem perder a sessão', () => {
    const minimizado = minimize(terminals(), 'c')
    const result = restore(minimizado, 'c')

    const c = result.find((t) => t.id === 'c')
    expect(c?.mode).toBe('normal')
    expect(c?.cwd).toBe('/c')
  })
})

describe('close', () => {
  it('remove o terminal fechado e reorganiza a lista restante', () => {
    const result = close(terminals(), 'b')

    expect(result.map((t) => t.id)).toEqual(['a', 'c'])
    expect(result).toHaveLength(2)
  })
})
