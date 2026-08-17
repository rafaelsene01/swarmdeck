// SPEC: terminal-layout-options (LAYOUT-01, LAYOUT-03, LAYOUT-04, LAYOUT-05, LAYOUT-06, LAYOUT-13, LAYOUT-14)

import { useEffect, useRef, useState } from 'react'
import { Columns2, Rows2 } from 'lucide-react'
import type { TabLayout } from '../../state/layout'

export interface LayoutMenuProps {
  /** Terminais da aba ativa — decide o cabeçalho, as variantes e se o botão
   * fica habilitado. */
  count: number
  layout: TabLayout
  onChange: (layout: TabLayout) => void
}

/** Contagem de 3 é a única que abre as variantes de largura (LAYOUT-13/14). */
const SPAN_COUNT = 3

/**
 * Botão "Layout Options" do header e seu popover: escolhe o modo de
 * disposição da aba ativa e, com exatamente 3 terminais no modo horizontal,
 * qual painel ocupa a linha inteira.
 */
export default function LayoutMenu({ count, layout, onChange }: LayoutMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  // LAYOUT-05: Escape e clique fora fecham sem tocar no modo da aba. Mesmo
  // mecanismo de listener em `document` já usado pelo Ctrl+T de `App.tsx`.
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open])

  /** Aplica a escolha e fecha (LAYOUT-04). */
  const choose = (next: TabLayout) => {
    onChange(next)
    setOpen(false)
  }

  const showSpans = count === SPAN_COUNT && layout.mode === 'horizontal'

  /** Cor de acento só na entrada ativa (LAYOUT-03, LAYOUT-13). */
  const accent = (active: boolean) => (active ? 'var(--accent)' : undefined)

  return (
    <span className="layout-menu" ref={rootRef}>
      <style>{`
        .layout-menu { position: relative; display: inline-flex; }
        .layout-menu__popover {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 0.5rem;
          width: 15rem;
          padding: 0.35rem;
          background: #17171a;
          color: var(--fg);
          border: 1px solid #2b2b31;
          border-radius: 10px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
          font-size: 0.8125rem;
          z-index: 10;
        }
        .layout-menu__head {
          padding: 0.35rem 0.5rem 0.5rem;
          font-size: 0.6875rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .layout-menu__item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.4rem 0.5rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--fg);
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        .layout-menu__item:hover { background: rgba(255, 255, 255, 0.06); }
        .layout-menu__item[data-active='true'] { border-color: var(--accent); }
        /* Variantes aninhadas sob "Horizontal" (LAYOUT-13). */
        .layout-menu__item--nested { width: calc(100% - 1.25rem); margin-left: 1.25rem; }
      `}</style>

      <button
        type="button"
        aria-label="layout options"
        title="Opções de layout"
        disabled={count === 0}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Columns2 size={18} />
      </button>

      {open && (
        <div className="layout-menu__popover" role="menu">
          {/* LAYOUT-01: contagem de terminais da aba ativa. */}
          <div className="layout-menu__head">
            {count} {count === 1 ? 'TERMINAL' : 'TERMINAIS'}
          </div>

          <button
            type="button"
            role="menuitem"
            className="layout-menu__item"
            data-active={layout.mode === 'horizontal'}
            style={{ color: accent(layout.mode === 'horizontal') }}
            onClick={() => choose({ ...layout, mode: 'horizontal' })}
          >
            <Columns2 size={14} aria-hidden="true" />
            Horizontal
          </button>

          {showSpans && (
            <>
              <button
                type="button"
                role="menuitem"
                className="layout-menu__item layout-menu__item--nested"
                data-active={layout.span === 'first'}
                style={{ color: accent(layout.span === 'first') }}
                onClick={() => choose({ ...layout, span: 'first' })}
              >
                Largura toda em cima
              </button>
              <button
                type="button"
                role="menuitem"
                className="layout-menu__item layout-menu__item--nested"
                data-active={layout.span === 'last'}
                style={{ color: accent(layout.span === 'last') }}
                onClick={() => choose({ ...layout, span: 'last' })}
              >
                Largura toda embaixo
              </button>
            </>
          )}

          <button
            type="button"
            role="menuitem"
            className="layout-menu__item"
            data-active={layout.mode === 'vertical'}
            style={{ color: accent(layout.mode === 'vertical') }}
            onClick={() => choose({ ...layout, mode: 'vertical' })}
          >
            <Rows2 size={14} aria-hidden="true" />
            Vertical
          </button>
        </div>
      )}
    </span>
  )
}
