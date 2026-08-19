// SPEC: projects (PROJ-15)

import { describe, expect, it } from 'vitest'
import { formatAge } from './relativeTime'

const NOW = 1_700_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/** Idade de `ms` atrás, com `now` fixo. */
const age = (ms: number) => formatAge(NOW - ms, NOW)

describe('formatAge', () => {
  it('devolve "nunca" para last_used nulo (P1 AC11, AD-004)', () => {
    expect(formatAge(null, NOW)).toBe('nunca')
  })

  it('faixa "agora": abaixo de 1 minuto, do limite inferior ao superior', () => {
    expect(age(0)).toBe('agora')
    expect(age(MINUTE - 1)).toBe('agora')
  })

  it('faixa "Nmin": de 1 minuto até abaixo de 1 hora', () => {
    expect(age(MINUTE)).toBe('1min')
    expect(age(HOUR - 1)).toBe('59min')
  })

  it('faixa "Nh": de 1 hora até abaixo de 24 horas', () => {
    expect(age(HOUR)).toBe('1h')
    expect(age(DAY - 1)).toBe('23h')
  })

  it('faixa "Nd": de 24 horas até abaixo de 7 dias', () => {
    expect(age(DAY)).toBe('1d')
    expect(age(WEEK - 1)).toBe('6d')
  })

  it('faixa "Nsem": de 7 dias até abaixo de 30 dias', () => {
    expect(age(WEEK)).toBe('1sem')
    expect(age(MONTH - 1)).toBe('4sem')
  })

  it('faixa "Nmes": de 30 dias até abaixo de 365 dias', () => {
    expect(age(MONTH)).toBe('1mes')
    expect(age(YEAR - 1)).toBe('12mes')
  })

  it('faixa "Na": de 365 dias para cima', () => {
    expect(age(YEAR)).toBe('1a')
    expect(age(10 * YEAR)).toBe('10a')
  })

  it('instante no futuro (relógio adiantado) devolve "agora", nunca número negativo', () => {
    expect(formatAge(NOW + HOUR, NOW)).toBe('agora')
  })
})
