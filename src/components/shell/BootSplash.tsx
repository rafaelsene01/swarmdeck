// SPEC: terminal-boot-loading (BOOT-04, BOOT-05, BOOT-06, BOOT-08, BOOT-09)

/**
 * Full-window boot overlay.
 *
 * Purely presentational, like `RestoreSessionDialog`: it renders the phase it
 * is handed and knows nothing about the workspace read, the restore choice, or
 * the PTY sessions. `App` owns the state machine.
 *
 * Design follows two references gathered for this change: a splash that hands
 * over to a *skeleton* of the real layout rather than to blank content, and a
 * shimmer sweep as the "work is happening right now" signal (see the feature
 * spec's References). Everything is drawn with the tokens already in
 * `styles.css` — no new colour, no asset, no animation library.
 */

export interface BootSplashProps {
  /** Short line describing what the app is doing right now. */
  label: string
  /**
   * Terminals already reporting a live PTY, over the number being restored.
   * `null` while there is nothing countable yet (the workspace read), which is
   * what switches the bar from determinate to an indeterminate sweep.
   */
  progress: { done: number; total: number } | null
}

/** Three skeleton panes, the shape the grid takes right after a restore. */
const SKELETON_PANES = [0, 1, 2]

export default function BootSplash({ label, progress }: BootSplashProps) {
  const percent =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null

  return (
    <div
      className="boot-splash"
      data-testid="boot-splash"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <style>{`
        /* Above the grid and the header, below .app-dialog-backdrop (1000):
           the restore modal has to sit ON TOP of this overlay, not behind it
           (BOOT-05). */
        .boot-splash {
          position: fixed;
          inset: 0;
          z-index: 900;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1.75rem;
          background:
            radial-gradient(120% 80% at 50% 0%, rgba(245, 183, 0, 0.07), transparent 62%),
            radial-gradient(90% 60% at 50% 110%, rgba(245, 183, 0, 0.05), transparent 60%),
            var(--bg);
          user-select: none;
        }

        /* Skeleton of the grid, faint, behind the badge — the "hand over to a
           skeleton, not to blank space" reference. Non-interactive and hidden
           from assistive tech: it carries no information. */
        .boot-splash__skeleton {
          position: absolute;
          inset: 32px var(--gap) var(--gap);
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--gap);
          opacity: 0.5;
          pointer-events: none;
        }
        .boot-splash__pane {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--surface);
          overflow: hidden;
        }
        .boot-splash__pane-head {
          height: 34px;
          flex: 0 0 auto;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
        }
        .boot-splash__pane-body {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          padding: 1rem;
          background: var(--surface-2);
        }
        .boot-splash__line {
          height: 9px;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.045) 0%,
            rgba(255, 255, 255, 0.11) 50%,
            rgba(255, 255, 255, 0.045) 100%
          );
          background-size: 220% 100%;
          animation: boot-splash-sweep 1.6s ease-in-out infinite;
        }
        .boot-splash__line:nth-child(1) { width: 62%; animation-delay: 0s; }
        .boot-splash__line:nth-child(2) { width: 84%; animation-delay: 0.12s; }
        .boot-splash__line:nth-child(3) { width: 45%; animation-delay: 0.24s; }
        .boot-splash__line:nth-child(4) { width: 71%; animation-delay: 0.36s; }

        .boot-splash__card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.1rem;
          width: min(22rem, calc(100vw - 3rem));
          padding: 2rem 2rem 1.75rem;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: rgba(19, 19, 24, 0.86);
          backdrop-filter: blur(10px);
          box-shadow: 0 28px 70px rgba(0, 0, 0, 0.6);
          text-align: center;
        }

        /* Brand mark: the app's own prompt glyph, breathing so the overlay
           never reads as a frozen window. */
        .boot-splash__mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 46px;
          height: 46px;
          border-radius: 12px;
          border: 1px solid rgba(245, 183, 0, 0.32);
          background: rgba(245, 183, 0, 0.1);
          color: var(--accent);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: -0.04em;
          animation: boot-splash-breathe 2.4s ease-in-out infinite;
        }

        .boot-splash__title {
          margin: 0;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #d7d7dd;
        }
        .boot-splash__label { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.8125rem; }

        .boot-splash__bar {
          position: relative;
          width: 100%;
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.07);
          overflow: hidden;
        }
        /* Determinate: width follows the count of live PTYs (BOOT-06). */
        .boot-splash__fill {
          height: 100%;
          border-radius: 999px;
          background: var(--accent);
          transition: width 260ms ease-out;
        }
        /* Indeterminate: a sweep, for the phase with nothing to count yet. */
        .boot-splash__fill[data-indeterminate='true'] {
          width: 40%;
          animation: boot-splash-slide 1.25s ease-in-out infinite;
        }

        .boot-splash__count {
          margin: 0;
          font-variant-numeric: tabular-nums;
          font-size: 0.6875rem;
          letter-spacing: 0.06em;
          color: var(--muted);
        }

        @keyframes boot-splash-sweep {
          0% { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
        @keyframes boot-splash-slide {
          0% { transform: translateX(-105%); }
          100% { transform: translateX(255%); }
        }
        @keyframes boot-splash-breathe {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(245, 183, 0, 0.22); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 7px rgba(245, 183, 0, 0); }
        }

        /* The overlay must stay readable for a user who asked the OS for less
           motion — the label and the count already carry the state. */
        @media (prefers-reduced-motion: reduce) {
          .boot-splash__mark,
          .boot-splash__line,
          .boot-splash__fill[data-indeterminate='true'] {
            animation: none;
          }
          .boot-splash__fill[data-indeterminate='true'] { width: 100%; opacity: 0.35; }
        }
      `}</style>

      <div className="boot-splash__skeleton" aria-hidden="true">
        {SKELETON_PANES.map((pane) => (
          <div key={pane} className="boot-splash__pane">
            <div className="boot-splash__pane-head" />
            <div className="boot-splash__pane-body">
              <span className="boot-splash__line" />
              <span className="boot-splash__line" />
              <span className="boot-splash__line" />
              <span className="boot-splash__line" />
            </div>
          </div>
        ))}
      </div>

      <div className="boot-splash__card">
        <span className="boot-splash__mark" aria-hidden="true">
          {'>_'}
        </span>
        <div>
          <p className="boot-splash__title">SwarmDeck</p>
          <p className="boot-splash__label">{label}</p>
        </div>
        <div className="boot-splash__bar">
          <div
            className="boot-splash__fill"
            data-indeterminate={percent === null ? 'true' : undefined}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
        {progress && (
          <p className="boot-splash__count">
            {progress.done}/{progress.total} terminais prontos
          </p>
        )}
      </div>
    </div>
  )
}
