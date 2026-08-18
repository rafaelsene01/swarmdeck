// SPEC: shell-chrome (HDR-01, HDR-02, HDR-03, HDR-04, HDR-05, HDR-06, HDR-07, HDR-09, HDR-10, HDR-11), release-distribution (REL-51), quota-indicator (QUOTA-01, QUOTA-12), terminal-layout-options (LAYOUT-02), terminal-screenshot (SHOT-01, SHOT-06, SHOT-07, SHOT-23)

import type { Ref } from 'react'
import { Plus, Camera, Play, Copy, Settings } from 'lucide-react'
import QuotaIndicator, { type QuotaIndicatorProps } from './QuotaIndicator'
import LayoutMenu from './LayoutMenu'
import { DEFAULT_LAYOUT, type TabLayout } from '../../state/layout'

export interface HeaderProps {
  onCreateTerminal: () => void
  onOpenSettings: () => void
  atMaxTerminals: boolean
  hasUpdateAvailable?: boolean
  /** Terminais da aba ativa — o menu de layout fica desabilitado em 0 (LAYOUT-06). */
  terminalCount?: number
  /** Layout da aba ativa; ausente = o horizontal de sempre. */
  layout?: TabLayout
  onLayoutChange?: (layout: TabLayout) => void
  /** SPEC: terminal-screenshot (SHOT-01) — modo de captura armado. */
  captureArmed?: boolean
  /** Arma e desarma o modo de captura (SHOT-01, SHOT-06). */
  onToggleCapture?: () => void
  /** SPEC: terminal-screenshot (SHOT-23) — para devolver o foco ao fechar o modal. */
  cameraRef?: Ref<HTMLButtonElement>
  /** `undefined`/`null` = preferências ainda não carregadas, mesmo efeito que `enabled: false` (QUOTA-12). */
  quotaPrefs?: {
    enabled: boolean
    window: QuotaIndicatorProps['window']
    /** QUOTA-26: lista ordenada do popover. Ausente = só o Claude. */
    providers?: { id: string; enabled: boolean }[]
  } | null
}

/**
 * App shell header — icon toolbar replacing the old text `.app-toolbar`.
 * Only "new terminal" and "settings" have real behavior (HDR-05..HDR-08);
 * every other icon is inert on purpose (HDR-09..HDR-11) — see
 * `.specs/features/shell-chrome/overview.md` Out of Scope.
 */
export default function Header({
  onCreateTerminal,
  onOpenSettings,
  atMaxTerminals,
  hasUpdateAvailable = false,
  terminalCount = 0,
  layout = DEFAULT_LAYOUT,
  onLayoutChange,
  captureArmed = false,
  onToggleCapture,
  cameraRef,
  quotaPrefs,
}: HeaderProps) {
  return (
    <header className="shell-header">
      <style>{`
        .shell-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.5rem 1rem;
          background: var(--bg);
          color: var(--fg);
          border-bottom: 1px solid var(--muted);
          flex: 0 0 auto;
        }
        .shell-header__group { display: flex; align-items: center; gap: 0.5rem; }
        .shell-header__settings { position: relative; }
        .shell-header__update-dot {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
        }
        .shell-header button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--fg);
          padding: 0.35rem;
          border-radius: 4px;
          cursor: pointer;
        }
        .shell-header button:disabled { color: var(--muted); cursor: default; }
        .shell-header__camera {
          transition: background 120ms ease, border-color 120ms ease;
        }
        .shell-header__camera[data-armed='true'] {
          border: 1px solid var(--accent);
          background: rgba(245, 183, 0, 0.14);
          color: var(--accent);
        }
        .shell-header__run {
          gap: 0.25rem;
          padding: 0.3rem 0.6rem;
          border-radius: 999px;
          border: 1px solid var(--muted);
          color: var(--muted);
        }
      `}</style>

      <div className="shell-header__group">
        <button
          type="button"
          onClick={onCreateTerminal}
          disabled={atMaxTerminals}
          aria-label="new terminal"
        >
          <Plus size={18} />
        </button>
        {/* SPEC: terminal-screenshot (SHOT-01, SHOT-06, SHOT-07) — o botão
            deixa de ser inerte: arma e desarma o modo de captura, e fica
            desabilitado sem terminal para clicar. */}
        <button
          type="button"
          ref={cameraRef}
          className="shell-header__camera"
          onClick={onToggleCapture}
          disabled={terminalCount === 0}
          aria-pressed={captureArmed}
          data-armed={captureArmed}
          aria-label="camera"
        >
          <Camera size={18} />
        </button>
      </div>

      <div className="shell-header__group">
        <button type="button" disabled className="shell-header__run" aria-label="run">
          <Play size={14} />
          RUN
        </button>
        <button type="button" disabled aria-label="copy">
          <Copy size={18} />
        </button>
        {/* SPEC: terminal-layout-options (LAYOUT-02) — o menu de layout ocupa
            o lugar do antigo botão inerte `split`, imediatamente à esquerda do
            indicador de cota. */}
        <LayoutMenu
          count={terminalCount}
          layout={layout}
          onChange={(next) => onLayoutChange?.(next)}
        />
        {quotaPrefs?.enabled && (
          <QuotaIndicator
            window={quotaPrefs.window}
            providerIds={quotaPrefs.providers?.filter((p) => p.enabled).map((p) => p.id)}
            onOpenSettings={onOpenSettings}
          />
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="settings"
          className="shell-header__settings"
        >
          <Settings size={18} />
          {hasUpdateAvailable && (
            <span className="shell-header__update-dot" aria-label="update available" />
          )}
        </button>
      </div>
    </header>
  )
}
