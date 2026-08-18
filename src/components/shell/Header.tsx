// SPEC: shell-chrome (HDR-01, HDR-02, HDR-03, HDR-04, HDR-05, HDR-06, HDR-07), release-distribution (REL-51), quota-indicator (QUOTA-01, QUOTA-12), terminal-layout-options (LAYOUT-02), minimized-tray (MIN-02, MIN-09, MIN-10, MIN-11)

import { Settings, SquareTerminal } from 'lucide-react'
import QuotaIndicator, { type QuotaIndicatorProps } from './QuotaIndicator'
import LayoutMenu from './LayoutMenu'
import MinimizedTray, { type MinimizedTerminal } from './MinimizedTray'
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
  /** `undefined`/`null` = preferências ainda não carregadas, mesmo efeito que `enabled: false` (QUOTA-12). */
  quotaPrefs?: {
    enabled: boolean
    window: QuotaIndicatorProps['window']
    /** QUOTA-26: lista ordenada do popover. Ausente = só o Claude. */
    providers?: { id: string; enabled: boolean }[]
  } | null
  /** SPEC: minimized-tray (MIN-02) — minimizados de **todas** as abas; vazio
   * não renderiza a bandeja. */
  minimizedTerminals?: MinimizedTerminal[]
  onRestoreMinimized?: (id: string) => void
  onCloseMinimized?: (id: string) => void
}

/**
 * App shell header — icon toolbar replacing the old text `.app-toolbar`.
 *
 * SPEC: minimized-tray (MIN-09, MIN-10) — os dois últimos inertes (`run` e
 * `copy`, HDR-09/HDR-10) saíram, e o "new terminal" trocou o `+` por um
 * botão de ícone de terminal (`print/run.png`). Todo botão do header tem
 * comportamento real agora.
 */
export default function Header({
  onCreateTerminal,
  onOpenSettings,
  atMaxTerminals,
  hasUpdateAvailable = false,
  terminalCount = 0,
  layout = DEFAULT_LAYOUT,
  onLayoutChange,
  quotaPrefs,
  minimizedTerminals = [],
  onRestoreMinimized,
  onCloseMinimized,
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
        /* SPEC: minimized-tray (MIN-10) — botão de ícone de terminal, no
           formato de print/run.png: retângulo arredondado com borda, fundo
           levemente elevado e o glifo em acento. */
        .shell-header__new-terminal {
          padding: 0.3rem 0.55rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          color: var(--accent);
        }
        .shell-header__new-terminal:hover:not(:disabled) {
          background: rgba(245, 183, 0, 0.14);
          border-color: var(--accent);
        }
        .shell-header__new-terminal:disabled {
          border-color: var(--border);
          background: transparent;
        }
      `}</style>

      <div className="shell-header__group">
        <button
          type="button"
          className="shell-header__new-terminal"
          onClick={onCreateTerminal}
          disabled={atMaxTerminals}
          aria-label="new terminal"
          title="Novo terminal"
        >
          <SquareTerminal size={18} />
        </button>
      </div>

      <div className="shell-header__group">
        {/* SPEC: minimized-tray (MIN-02, MIN-11) — bandeja dos minimizados de
            todas as abas, no grupo direito, colada ao menu de layout; não
            renderiza nada quando não há nenhum. */}
        <MinimizedTray
          items={minimizedTerminals}
          onRestore={(id) => onRestoreMinimized?.(id)}
          onClose={(id) => onCloseMinimized?.(id)}
        />
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
