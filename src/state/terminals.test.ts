// SPEC: multi-terminal (TERM-04, TERM-08), terminal-layout-options (LAYOUT-16, LAYOUT-19, LAYOUT-25), session-restore (SESS-10, SESS-16)

import { describe, expect, it } from 'vitest'
import {
  close,
  fromLayoutEntries,
  maximize,
  minimize,
  moveTerminal,
  restore,
  toLayoutEntries,
  type LayoutEntry,
  type TerminalState,
} from './terminals'

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

describe('moveTerminal', () => {
  // LAYOUT-16: o arrastado vai para a posição do alvo, os demais mantêm a
  // ordem relativa entre si.
  it('move para frente colocando o arrastado na posição do alvo', () => {
    const result = moveTerminal(terminals(), 'a', 'c')

    expect(result.map((t) => t.id)).toEqual(['b', 'c', 'a'])
    // A fração acompanha o terminal — nada é redistribuído.
    expect(result.find((t) => t.id === 'a')?.fracW).toBe(0.34)
    expect(result.find((t) => t.id === 'b')?.fracW).toBe(0.33)
  })

  it('move para trás colocando o arrastado na posição do alvo', () => {
    const result = moveTerminal(terminals(), 'c', 'a')

    expect(result.map((t) => t.id)).toEqual(['c', 'a', 'b'])
    expect(result.find((t) => t.id === 'c')?.fracW).toBe(0.33)
    expect(result.find((t) => t.id === 'a')?.fracW).toBe(0.34)
  })

  // LAYOUT-19 / edge case "arrastar sobre si mesmo".
  it('soltar o terminal sobre ele mesmo mantém a ordem inalterada', () => {
    expect(moveTerminal(terminals(), 'b', 'b').map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  // LAYOUT-19: soltar fora de um alvo válido não muda nada.
  it('id inexistente na origem ou no alvo mantém a ordem inalterada', () => {
    expect(moveTerminal(terminals(), 'a', 'z').map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(moveTerminal(terminals(), 'z', 'a').map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('lista de um terminal devolve a lista original', () => {
    const single: TerminalState[] = [
      { id: 'a', cwd: '/a', fracW: 1, fracH: 1, mode: 'normal' },
    ]

    expect(moveTerminal(single, 'a', 'a')).toEqual(single)
    expect(moveTerminal(single, 'a', 'b')).toEqual(single)
  })
})

// SPEC: session-restore (SESS-10, SESS-16)
describe('toLayoutEntries', () => {
  it('grava o agentSessionId e não grava resumeSession', () => {
    const [entry] = toLayoutEntries([
      { id: 'a', cwd: '/a', fracW: 1, fracH: 1, mode: 'normal', agentSessionId: 's-1', resumeSession: true },
    ])

    expect(entry?.agentSessionId).toBe('s-1')
    expect(entry).not.toHaveProperty('resumeSession')
  })

  it('terminal sem sessão grava agentSessionId nulo', () => {
    const [entry] = toLayoutEntries([{ id: 'a', cwd: '/a', fracW: 1, fracH: 1, mode: 'normal' }])

    expect(entry?.agentSessionId).toBeNull()
  })
})

describe('fromLayoutEntries', () => {
  function entry(overrides: Partial<LayoutEntry> = {}): LayoutEntry {
    return { id: 't-0', slot: 0, fracW: 1, fracH: 1, cwd: '/home/user', minimized: false, ...overrides }
  }

  // LAYOUT-25: o backend diz qual diretório sumiu; se a conversão descartar o
  // campo, o app abre em home em silêncio e o aviso nunca tem o que mostrar.
  it('carrega cwdFallbackFrom do terminal restaurado', () => {
    const [terminal] = fromLayoutEntries([entry({ cwdFallbackFrom: '/projeto/que/sumiu' })])

    expect(terminal?.cwdFallbackFrom).toBe('/projeto/que/sumiu')
    expect(terminal?.cwd).toBe('/home/user')
  })

  it('terminal sem fallback não ganha diretório sumido nenhum', () => {
    const [terminal] = fromLayoutEntries([entry()])

    expect(terminal?.cwdFallbackFrom).toBeNull()
  })

  // SPEC: session-restore (SESS-10) — sem o id de sessão na volta não há o
  // que retomar: o switch do modal nasceria travado mesmo com sessão salva.
  it('carrega agentSessionId do terminal restaurado', () => {
    const [terminal] = fromLayoutEntries([entry({ agentSessionId: 'sessao-1' })])

    expect(terminal?.agentSessionId).toBe('sessao-1')
  })

  it('terminal salvo antes da feature volta com agentSessionId nulo', () => {
    const [terminal] = fromLayoutEntries([entry()])

    expect(terminal?.agentSessionId).toBeNull()
  })

  it('ordena pelo slot, não pela ordem do vetor', () => {
    const restaurados = fromLayoutEntries([
      entry({ id: 't-1', slot: 1, cwd: '/b' }),
      entry({ id: 't-0', slot: 0, cwd: '/a' }),
    ])

    expect(restaurados.map((t) => t.id)).toEqual(['t-0', 't-1'])
  })
})
