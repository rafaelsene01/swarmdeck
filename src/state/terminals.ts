// SPEC: multi-terminal (TERM-04, TERM-07, TERM-08), terminal-layout-options (LAYOUT-16, LAYOUT-19, LAYOUT-25), session-restore (SESS-10, SESS-16), minimized-tray (MIN-01), projects (PROJ-12)

/**
 * Estado de exibição de um terminal no grid.
 *
 * - `normal`: ocupa sua célula no grid, como os demais.
 * - `maximized`: ocupa toda a área de terminais; os outros continuam
 *   montados (vivos), só ficam fora de vista.
 * - `minimized`: fora da tela por inteiro (a célula sai do plano do grid e
 *   recebe `display: none`) e listado na bandeja do header; o PTY continua
 *   rodando e acumulando saída — o componente permanece montado (MIN-01).
 */
export type PaneMode = 'normal' | 'maximized' | 'minimized'

export interface TerminalState {
  id: string
  cwd: string
  fracW: number
  fracH: number
  mode: PaneMode
  /** Diretório salvo que sumiu: o backend caiu para home e informa qual era
   * (LAYOUT-25 / TERM-07). Só vem preenchido em terminal restaurado do banco;
   * é o que o aviso do `App` mostra ao usuário. */
  cwdFallbackFrom?: string | null
  /** SPEC: session-restore (SESS-10) — id da sessão do agente que este painel
   * fixa no CLI (`claude --session-id <uuid>`). Persistido: é o ponteiro para
   * a conversa que o boot seguinte pode retomar. */
  agentSessionId?: string | null
  /** SPEC: session-restore (SESS-12, SESS-13) — arrancar retomando
   * (`--resume`) em vez de fixar uma sessão nova. **Não** é persistido: é
   * decisão de arranque, e guardá-la faria o segundo boot herdar a escolha do
   * primeiro sem o usuário ter dito nada. */
  resumeSession?: boolean
  /** SPEC: projects (PROJ-12) — painel que ainda não escolheu projeto/agente:
   * renderiza o wizard em vez de `TerminalPane`, nunca é persistido, e some ao
   * ser fechado sem `pty_kill`. */
  draft?: boolean
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
 * scrollback acumulado enquanto o terminal está fora da tela (TERM-08,
 * MIN-01).
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
 * Move `fromId` para a posição que `toId` ocupa, preservando a ordem relativa
 * dos demais (LAYOUT-16). Soltar sobre si mesmo, sobre um id inexistente ou
 * numa lista de um devolve a lista original (LAYOUT-19).
 *
 * `fracW` não é redistribuída: a fração acompanha o terminal para a nova
 * posição — quem estava com 0.7 continua com 0.7. `evenWidths` (App.tsx) só
 * roda em criar/fechar.
 *
 * SPEC_DEVIATION: o design (§2) manda reinserir no índice que `toId` ocupa na
 * lista *já sem* o arrastado. Por essa regra arrastar um painel sobre o
 * vizinho imediato da direita não muda nada ([a,b,c] com a→b devolve
 * [a,b,c]), o que contradiz LAYOUT-16 ("mover o terminal arrastado para a
 * posição do alvo"). O AC é a fonte de verdade, então o índice usado é o que
 * `toId` ocupa na lista original.
 */
export function moveTerminal(
  terminals: TerminalState[],
  fromId: string,
  toId: string,
): TerminalState[] {
  if (fromId === toId) return terminals

  const from = terminals.findIndex((t) => t.id === fromId)
  const to = terminals.findIndex((t) => t.id === toId)
  if (from === -1 || to === -1) return terminals

  const next = [...terminals]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
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
  /** SPEC: session-restore (SESS-10) — espelha a coluna `agent_session_id`
   * (migração 009). `null` em terminal salvo antes da feature. */
  agentSessionId?: string | null
}

/** Converte o estado de exibição para a forma que `layout.rs::save` grava.
 * Rascunhos ficam de fora (PROJ-12): o painel ainda não tem `cwd` escolhido, e
 * os `slot` dos demais seguem contíguos porque o filtro roda antes do índice. */
export function toLayoutEntries(terminals: TerminalState[]): LayoutEntry[] {
  return terminals
    .filter((t) => !t.draft)
    .map((t, index) => ({
      id: t.id,
      slot: index,
      fracW: t.fracW,
      fracH: t.fracH,
      cwd: t.cwd,
      minimized: t.mode === 'minimized',
      // SESS-10: o id da sessão vai junto; `resumeSession` não — é decisão de
      // arranque, não estado do workspace.
      agentSessionId: t.agentSessionId ?? null,
    }))
}

/** Reconstrói o estado de exibição a partir do que `layout.rs::restore`
 * devolveu, respeitando a ordem de `slot`. `cwdFallbackFrom` vem junto: sem
 * ele o app abriria em home em silêncio, e LAYOUT-25 manda informar qual
 * diretório sumiu. */
export function fromLayoutEntries(entries: LayoutEntry[]): TerminalState[] {
  return [...entries]
    .sort((a, b) => a.slot - b.slot)
    .map((e) => ({
      id: e.id,
      cwd: e.cwd,
      fracW: e.fracW,
      fracH: e.fracH,
      mode: e.minimized ? 'minimized' : 'normal',
      cwdFallbackFrom: e.cwdFallbackFrom ?? null,
      agentSessionId: e.agentSessionId ?? null,
    }))
}
