// SPEC: multi-terminal (TERM-03, TERM-04), terminal-chrome (CHROME-01, CHROME-03)

import { useCallback, useRef, useState, type ReactNode } from 'react'

export interface Pane {
  id: string
  /** Fração da largura, `0..1`. Layout por fração — nunca por pixel — para
   * sobreviver a mudança de tamanho de janela e de monitor. */
  fracW: number
  fracH: number
  /** `undefined` equivale a `'normal'`. Ver `state/terminals.ts` (T10). */
  mode?: 'normal' | 'maximized' | 'minimized'
}

/** Piso mínimo de fração por painel. Abaixo disso o painel vira ilegível. */
export const MIN_FRAC = 0.15

export interface GridLayoutProps {
  panes: Pane[]
  onResize?: (id: string, fracW: number) => void
  renderPane?: (pane: Pane) => ReactNode
}

/**
 * Colunas/linhas do grid conforme a contagem de painéis.
 *
 * TERM-03: 2 painéis → 2 colunas de largura igual; 3 ou 4 → grid 2×2 (com a
 * quarta célula vazia quando há só 3).
 */
export function gridTemplate(count: number): { columns: number; rows: number } {
  if (count <= 1) return { columns: 1, rows: 1 }
  if (count === 2) return { columns: 2, rows: 1 }
  return { columns: 2, rows: 2 }
}

/**
 * Aplica o arrasto de uma divisória entre dois painéis vizinhos: um ganha
 * `deltaFrac`, o outro perde a mesma quantia — a soma das frações dos dois
 * se conserva. Nenhum dos dois pode cruzar `MIN_FRAC`.
 */
export function applyDrag(
  panes: Pane[],
  draggedId: string,
  neighborId: string,
  deltaFrac: number,
  minFrac: number = MIN_FRAC,
): Pane[] {
  const dragged = panes.find((p) => p.id === draggedId)
  const neighbor = panes.find((p) => p.id === neighborId)
  if (!dragged || !neighbor) return panes

  const total = dragged.fracW + neighbor.fracW
  const maxFrac = total - minFrac

  const nextDragged = Math.min(maxFrac, Math.max(minFrac, dragged.fracW + deltaFrac))
  const nextNeighbor = total - nextDragged

  return panes.map((p) => {
    if (p.id === draggedId) return { ...p, fracW: nextDragged }
    if (p.id === neighborId) return { ...p, fracW: nextNeighbor }
    return p
  })
}

export default function GridLayout({ panes, onResize, renderPane }: GridLayoutProps) {
  const [localPanes, setLocalPanes] = useState(panes)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ draggedId: string; neighborId: string; startX: number } | null>(
    null,
  )

  const effectivePanes = panes.length === localPanes.length ? localPanes : panes
  const maximizedId = effectivePanes.find((p) => p.mode === 'maximized')?.id
  const { columns, rows } = gridTemplate(effectivePanes.length)

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragState.current
      const container = containerRef.current
      if (!drag || !container) return

      const deltaPx = event.clientX - drag.startX
      const deltaFrac = deltaPx / container.clientWidth

      setLocalPanes((prev) => applyDrag(prev, drag.draggedId, drag.neighborId, deltaFrac))
      dragState.current = { ...drag, startX: event.clientX }

      const moved = applyDrag(localPanes, drag.draggedId, drag.neighborId, deltaFrac).find(
        (p) => p.id === drag.draggedId,
      )
      if (moved) onResize?.(drag.draggedId, moved.fracW)
    },
    [localPanes, onResize],
  )

  const handlePointerUp = useCallback(() => {
    dragState.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerMove])

  const startDrag = (draggedId: string, neighborId: string) => (event: React.PointerEvent) => {
    dragState.current = { draggedId, neighborId, startX: event.clientX }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div
      ref={containerRef}
      className="grid-layout"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        // Respiro entre os cartões de terminal; a divisória de arrasto (8px,
        // posicionada em `right: -4px`) mora exatamente nessa calha.
        gap: 'var(--gap, 8px)',
        width: '100%',
        height: '100%',
      }}
    >
      {effectivePanes.map((pane, index) => {
        const neighbor = effectivePanes[index + 1]
        const isMaximized = pane.mode === 'maximized'
        const isMinimized = pane.mode === 'minimized'
        // Um terminal maximizado ocupa a área toda; os demais continuam
        // montados (o PTY e o scrollback de xterm.js sobrevivem), só saem
        // de vista — nunca são desmontados. Mesma lógica para minimizado:
        // encolhe a uma barra compacta em vez de sumir do DOM (TERM-04, TERM-08).
        const hiddenByMaximize = maximizedId !== undefined && !isMaximized

        return (
          <div
            key={pane.id}
            className="grid-layout__cell"
            data-mode={pane.mode ?? 'normal'}
            style={{
              position: isMaximized ? 'fixed' : 'relative',
              inset: isMaximized ? 0 : undefined,
              // 100 para passar por cima do header e da barra de abas (nenhum
              // dos dois tem z-index próprio) e continuar abaixo do backdrop
              // de diálogo (1000). Altura de recolhido = altura da barra de
              // título de `.terminal-header`.
              zIndex: isMaximized ? 100 : undefined,
              display: hiddenByMaximize ? 'none' : undefined,
              minHeight: isMinimized ? '34px' : undefined,
              maxHeight: isMinimized ? '34px' : undefined,
              overflow: isMinimized ? 'hidden' : undefined,
            }}
          >
            {renderPane?.(pane)}
            {!isMaximized && !isMinimized && neighbor && (
              <div
                className="grid-layout__divider"
                onPointerDown={startDrag(pane.id, neighbor.id)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
