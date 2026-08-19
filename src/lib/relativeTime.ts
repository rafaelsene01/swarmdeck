// SPEC: projects (PROJ-15)

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/**
 * Idade compacta do último uso de um projeto (P1 AC11). `now` é injetado
 * para a função ser pura e testável nos limites de cada faixa.
 *
 * Um relógio adiantado (instante no futuro) cai em `agora` em vez de
 * produzir número negativo.
 */
export function formatAge(lastUsed: number | null, now: number): string {
  if (lastUsed === null) return 'nunca'

  const diff = now - lastUsed
  if (diff < MINUTE) return 'agora'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}min`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`
  if (diff < MONTH) return `${Math.floor(diff / WEEK)}sem`
  if (diff < YEAR) return `${Math.floor(diff / MONTH)}mes`
  return `${Math.floor(diff / YEAR)}a`
}
