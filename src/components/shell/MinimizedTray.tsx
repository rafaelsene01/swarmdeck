// SPEC: minimized-tray (MIN-02, MIN-03, MIN-04, MIN-05, MIN-06, MIN-07, MIN-08, MIN-11, MIN-12)

import { useEffect, useRef, useState } from 'react'
import { MoonStar, X } from 'lucide-react'

export interface MinimizedTerminal {
  id: string
  /** Nome da aba dona do terminal — o mesmo texto da barra de abas. */
  tabName: string
  /** Nome do terminal, já resolvido por quem monta (`Terminal <n>`). */
  name: string
}

export interface MinimizedTrayProps {
  items: MinimizedTerminal[]
  /** Devolve o terminal ao grid e ativa a aba dele (MIN-05). */
  onRestore: (id: string) => void
  /** Encerra o terminal (MIN-06, MIN-07). */
  onClose: (id: string) => void
}

/**
 * Bandeja de terminais minimizados do header: um ícone com a contagem, e um
 * popover que lista cada minimizado com a aba de origem. Some inteira quando
 * não há nenhum minimizado — não há bandeja vazia para clicar (MIN-02).
 */
export default function MinimizedTray({ items, onRestore, onClose }: MinimizedTrayProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  // MIN-03: Escape e clique fora fecham. Mesmo mecanismo de `LayoutMenu`.
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

  // Fechar o último minimizado esvazia a lista: o popover não pode ficar
  // aberto sobre um botão que deixou de existir.
  useEffect(() => {
    if (items.length === 0) setOpen(false)
  }, [items.length])

  if (items.length === 0) return null

  // O PTY segue vivo enquanto minimizado, então fechar daqui perde processo
  // em curso — a mesma confirmação que `TerminalHeader` pede (TERM-05).
  const confirmClose = (message: string) => window.confirm(message)

  return (
    <span className="minimized-tray" ref={rootRef}>
      <style>{`
        .minimized-tray { position: relative; display: inline-flex; }
        .minimized-tray .minimized-tray__toggle {
          gap: 0.3rem;
          padding: 0.28rem 0.5rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          color: var(--fg);
          font-size: 0.75rem;
          font-variant-numeric: tabular-nums;
        }
        .minimized-tray .minimized-tray__toggle:hover { background: rgba(255, 255, 255, 0.1); }
        .minimized-tray .minimized-tray__toggle[aria-expanded='true'] { border-color: var(--accent); }
        .minimized-tray__popover {
          position: absolute;
          top: 100%;
          /* MIN-11: a bandeja vive no grupo direito do header, então o popover
             cresce para a esquerda: ancorado a left ele sairia da janela. */
          right: 0;
          margin-top: 0.5rem;
          width: max-content;
          min-width: 240px;
          padding: 0.35rem;
          background: #17171a;
          color: var(--fg);
          border: 1px solid #2b2b31;
          border-radius: 10px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
          font-size: 0.8125rem;
          z-index: 20;
        }
        .minimized-tray__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.35rem 0.5rem 0.5rem;
          font-size: 0.6875rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .minimized-tray .minimized-tray__close-all {
          padding: 0;
          background: transparent;
          border: none;
          color: var(--muted);
          font: inherit;
          letter-spacing: inherit;
          text-transform: inherit;
          cursor: pointer;
        }
        .minimized-tray .minimized-tray__close-all:hover { color: var(--danger); }
        .minimized-tray__row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 6px;
        }
        .minimized-tray__row:hover { background: rgba(255, 255, 255, 0.06); }
        .minimized-tray .minimized-tray__item {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 0.5rem;
          flex: 1 1 auto;
          min-width: 0;
          padding: 0.4rem 0.5rem;
          background: transparent;
          border: none;
          color: var(--fg);
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        /* Faixa de acento à esquerda, como em print/min_poput.png. */
        .minimized-tray__bar {
          flex: 0 0 auto;
          width: 3px;
          height: 16px;
          border-radius: 2px;
          background: var(--accent);
        }
        .minimized-tray__tab {
          flex: 0 0 auto;
          max-width: 7rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 0.05rem 0.35rem;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--muted);
          font-size: 0.6875rem;
        }
        .minimized-tray__name {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .minimized-tray .minimized-tray__dismiss {
          flex: 0 0 auto;
          margin-right: 0.35rem;
          padding: 0.2rem;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: var(--muted);
          cursor: pointer;
        }
        .minimized-tray .minimized-tray__dismiss:hover { color: var(--danger); }
      `}</style>

      <button
        type="button"
        className="minimized-tray__toggle"
        aria-label="minimized terminals"
        aria-expanded={open}
        title="Terminais minimizados"
        onClick={() => setOpen((prev) => !prev)}
      >
        {/* MIN-12: lua com estrela — terminal minimizado está dormindo. */}
        <MoonStar size={14} aria-hidden="true" />
        {items.length}
      </button>

      {open && (
        <div className="minimized-tray__popover" role="menu">
          <div className="minimized-tray__head">
            {/* MIN-08 */}
            <span>Minimized ({items.length})</span>
            <button
              type="button"
              className="minimized-tray__close-all"
              onClick={() => {
                if (!confirmClose('Encerrar todos os terminais minimizados?')) return
                for (const item of items) onClose(item.id)
              }}
            >
              Close all
            </button>
          </div>

          {items.map((item) => (
            <div key={item.id} className="minimized-tray__row">
              <button
                type="button"
                role="menuitem"
                className="minimized-tray__item"
                onClick={() => {
                  onRestore(item.id)
                  setOpen(false)
                }}
              >
                <span className="minimized-tray__bar" aria-hidden="true" />
                <span className="minimized-tray__tab">{item.tabName}</span>
                <span className="minimized-tray__name">{item.name}</span>
              </button>
              <button
                type="button"
                className="minimized-tray__dismiss"
                aria-label={`fechar ${item.name}`}
                onClick={() => {
                  if (!confirmClose(`Encerrar ${item.name}? O processo ativo será perdido.`)) return
                  onClose(item.id)
                }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
