// SPEC: multi-terminal (TERM-04, TERM-07, TERM-08)

/**
 * Estado de exibição de um terminal no grid.
 *
 * - `normal`: ocupa sua célula no grid, como os demais.
 * - `maximized`: ocupa toda a área de terminais; os outros continuam
 *   montados (vivos), só ficam fora de vista.
 * - `minimized`: recolhido a uma barra compacta; o PTY continua rodando e
 *   acumulando saída — o componente permanece montado, só oculto.
 */
export type PaneMode = 'normal' | 'maximized' | 'minimized'

export interface TerminalState {
  id: string
  cwd: string
  fracW: number
  fracH: number
  mode: PaneMode
}

/**
 * Maximiza `id`. Qualquer outro terminal já maximizado volta a `normal` —
 * só um pode ocupar a área toda por vez. Nenhum terminal é removido: os
 * demais continuam na lista, vivos em segundo plano (TERM-04).
 */
export function maximize(terminals: TerminalState[], id: string): TerminalState[] {
  return terminals.map((t) => ({
    ...t,
    mode: t.id === id ? 'maximized' : t.mode === 'maximized' ? 'normal' : t.mode,
  }))
}

/**
 * Minimiza `id`. A sessão continua na lista — é isso que preserva o PTY e o
 * scrollback acumulado enquanto o terminal está recolhido (TERM-08).
 */
export function minimize(terminals: TerminalState[], id: string): TerminalState[] {
  return terminals.map((t) => (t.id === id ? { ...t, mode: 'minimized' } : t))
}

/** Restaura `id` a `normal`, reexibindo o que se acumulou enquanto estava
 * minimizado — o componente nunca desmontou, então o scrollback é o mesmo. */
export function restore(terminals: TerminalState[], id: string): TerminalState[] {
  return terminals.map((t) => (t.id === id ? { ...t, mode: 'normal' } : t))
}

/** Remove `id` da lista — o chamador é responsável por encerrar o PTY
 * (`pty_kill`) antes ou depois desta chamada; esta função só reorganiza o
 * estado do grid. */
export function close(terminals: TerminalState[], id: string): TerminalState[] {
  return terminals.filter((t) => t.id !== id)
}

/**
 * Forma persistida de um terminal — espelha `LayoutEntry` do backend
 * (`src-tauri/src/terminal/layout.rs`, T11). `cwdFallbackFrom` só vem
 * preenchido quando o `cwd` salvo não existe mais e o backend caiu para
 * home (TERM-07).
 */
export interface LayoutEntry {
  id: string
  slot: number
  fracW: number
  fracH: number
  cwd: string
  minimized: boolean
  cwdFallbackFrom?: string | null
}

/** Converte o estado de exibição para a forma que `layout.rs::save` grava. */
export function toLayoutEntries(terminals: TerminalState[]): LayoutEntry[] {
  return terminals.map((t, index) => ({
    id: t.id,
    slot: index,
    fracW: t.fracW,
    fracH: t.fracH,
    cwd: t.cwd,
    minimized: t.mode === 'minimized',
  }))
}

/** Reconstrói o estado de exibição a partir do que `layout.rs::restore`
 * devolveu, respeitando a ordem de `slot`. */
export function fromLayoutEntries(entries: LayoutEntry[]): TerminalState[] {
  return [...entries]
    .sort((a, b) => a.slot - b.slot)
    .map((e) => ({
      id: e.id,
      cwd: e.cwd,
      fracW: e.fracW,
      fracH: e.fracH,
      mode: e.minimized ? 'minimized' : 'normal',
    }))
}
