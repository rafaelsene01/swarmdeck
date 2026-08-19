// SPEC: shell-chrome (EMPTY-05, EMPTY-06), projects (PROJ-11)

import { SquareTerminal } from 'lucide-react'

export interface EmptyStateProps {
  onCreateTerminal: () => void
}

/**
 * Zero-terminal screen (EMPTY-01..EMPTY-05) — shown both on fresh boot and
 * after closing the last terminal (`App.tsx` gates on `terminals.length ===
 * 0`, no boot-only flag). The CTA opens a draft pane with the wizard
 * (PROJ-11); the
 * `Ctrl+T` shortcut hinted below is wired at the `App` level (T6), not here.
 */
export default function EmptyState({ onCreateTerminal }: EmptyStateProps) {
  return (
    <div className="shell-empty-state">
      <style>{`
        .shell-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 0.5rem;
          color: var(--fg);
          text-align: center;
        }
        .shell-empty-state__icon { color: var(--muted); }
        .shell-empty-state__body { color: var(--muted); max-width: 28rem; }
        .shell-empty-state__cta {
          margin-top: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--accent);
          color: var(--bg);
          border: none;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
        }
        .shell-empty-state__hint {
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          color: var(--muted);
          font-size: 0.85rem;
        }
        .shell-empty-state__key {
          border: 1px solid var(--muted);
          border-radius: 3px;
          padding: 0.05rem 0.35rem;
          font-family: monospace;
        }
      `}</style>

      <SquareTerminal size={40} className="shell-empty-state__icon" />
      <h2>No Terminals Active</h2>
      <p className="shell-empty-state__body">
        Create a terminal to start working with your AI agents
      </p>
      <button type="button" className="shell-empty-state__cta" onClick={onCreateTerminal}>
        + Create Terminal
      </button>
      <div className="shell-empty-state__hint">
        <span className="shell-empty-state__key">Ctrl</span>
        <span className="shell-empty-state__key">T</span>
        <span>to create quickly</span>
      </div>
    </div>
  )
}
