// SPEC: shell-chrome (HDR-01, HDR-02, HDR-03, HDR-04, HDR-05, HDR-06, HDR-07, HDR-09, HDR-10, HDR-11), release-distribution (REL-51), quota-indicator (QUOTA-01, QUOTA-12)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Header from './Header'

// `QuotaIndicator` (QUOTA-01) chama `invoke('quota_claude')` na montagem —
// mesmo padrão hoisted de `QuotaIndicator.test.tsx`.
const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

const INERT_LABELS = ['layout', 'history', 'camera', 'run', 'copy', 'split']

function renderHeader(props: Partial<Parameters<typeof Header>[0]> = {}) {
  return render(
    <Header
      onCreateTerminal={vi.fn()}
      onOpenSettings={vi.fn()}
      atMaxTerminals={false}
      {...props}
    />,
  )
}

describe('Header', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue({
      state: 'disabled',
      windows: [],
      planLabel: null,
      fetchedAt: null,
      retryAt: null,
    })
  })

  // Saíram a pedido do usuário (16/08/2026): o logo genérico da esquerda
  // (não era a marca do app), o campo de busca e o ícone de agentes ao lado
  // dele. HDR-02 descrevia 11 elementos; agora são 7.
  it('renders the seven remaining elements of HDR-02 - the avatar slot is now QuotaIndicator (QUOTA-01)', () => {
    renderHeader()

    expect(screen.getByLabelText('layout')).toBeInTheDocument()
    expect(screen.getByLabelText('new terminal')).toBeInTheDocument()
    expect(screen.getByLabelText('history')).toBeInTheDocument()
    expect(screen.getByLabelText('camera')).toBeInTheDocument()
    expect(screen.getByLabelText('run')).toBeInTheDocument()
    expect(screen.getByLabelText('copy')).toBeInTheDocument()
    expect(screen.getByLabelText('split')).toBeInTheDocument()
    expect(screen.getByLabelText('settings')).toBeInTheDocument()
  })

  it('no longer renders the logo, the search field or the agents icon', () => {
    renderHeader()

    expect(screen.queryByLabelText('SwarmDeck')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('search')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('agents')).not.toBeInTheDocument()
  })

  it('calls onCreateTerminal exactly once when the "new terminal" button is activated', () => {
    const onCreateTerminal = vi.fn()
    renderHeader({ onCreateTerminal })

    fireEvent.click(screen.getByLabelText('new terminal'))

    expect(onCreateTerminal).toHaveBeenCalledTimes(1)
  })

  it('disables "new terminal" and does not call onCreateTerminal when atMaxTerminals is true', () => {
    const onCreateTerminal = vi.fn()
    renderHeader({ atMaxTerminals: true, onCreateTerminal })

    const button = screen.getByLabelText('new terminal')
    expect(button).toBeDisabled()

    fireEvent.click(button)

    expect(onCreateTerminal).not.toHaveBeenCalled()
  })

  it('calls onOpenSettings exactly once when the "settings" button is activated', () => {
    const onOpenSettings = vi.fn()
    renderHeader({ onOpenSettings })

    fireEvent.click(screen.getByLabelText('settings'))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('renders the undefined-behavior icons as disabled with no click handler (HDR-09..HDR-11)', () => {
    renderHeader()

    for (const label of INERT_LABELS) {
      const element = screen.getByLabelText(label)
      expect(element).toBeDisabled()
      expect(element.onclick).toBeNull()
    }
  })

  it('renders every icon via a lucide-react SVG - one per described element (HDR-04)', () => {
    const { container } = renderHeader()

    // 8 icons with quotaPrefs absent (QuotaIndicator not mounted): LayoutGrid,
    // Plus, History, Camera, Play, Copy, Columns2, Settings.
    // `.lucide` is the base class every lucide-react icon renders (createLucideIcon.mjs) -
    // proves provenance, not just SVG count (no hand-drawn inline SVG would pass this).
    expect(container.querySelectorAll('svg.lucide')).toHaveLength(8)
  })

  it('uses only --bg/--fg/--accent/--muted custom properties for color - no hex/rgb literal (HDR-03)', () => {
    const { container } = renderHeader()

    const styleText = container.querySelector('style')?.textContent ?? ''
    expect(styleText).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styleText).not.toMatch(/rgb\(/)
  })

  it('renders the update-available dot on the settings icon when hasUpdateAvailable is true (REL-51)', () => {
    renderHeader({ hasUpdateAvailable: true })

    expect(screen.getByLabelText('update available')).toBeInTheDocument()
  })

  it('does not render the update-available dot when hasUpdateAvailable is false or absent (REL-51)', () => {
    renderHeader({ hasUpdateAvailable: false })
    expect(screen.queryByLabelText('update available')).not.toBeInTheDocument()

    renderHeader()
    expect(screen.queryByLabelText('update available')).not.toBeInTheDocument()
  })

  it('shows the quota indicator when quotaPrefs.enabled is true, and nothing when false/absent (QUOTA-01, QUOTA-12)', async () => {
    const { unmount } = renderHeader({ quotaPrefs: { enabled: true, window: 'both' } })
    await waitFor(() => expect(screen.getByLabelText('quota')).toBeInTheDocument())
    unmount()

    renderHeader({ quotaPrefs: { enabled: false, window: 'both' } })
    expect(screen.queryByLabelText('quota')).not.toBeInTheDocument()

    renderHeader()
    expect(screen.queryByLabelText('quota')).not.toBeInTheDocument()
  })

  it('keeps the right-group button order unchanged around the quota indicator slot', async () => {
    const { container } = renderHeader({ quotaPrefs: { enabled: true, window: 'both' } })
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())

    const rightGroup = container.querySelectorAll('.shell-header__group')[1]!
    const labels = Array.from(rightGroup.querySelectorAll('[aria-label]')).map((el) =>
      el.getAttribute('aria-label'),
    )

    expect(labels).toEqual(['run', 'copy', 'split', 'quota', 'settings'])
  })
})
