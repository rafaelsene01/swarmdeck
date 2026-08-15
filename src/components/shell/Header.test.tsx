// SPEC: shell-chrome (HDR-01, HDR-02, HDR-03, HDR-04, HDR-05, HDR-06, HDR-07, HDR-09, HDR-10, HDR-11), release-distribution (REL-51)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Header from './Header'

const INERT_LABELS = ['layout', 'history', 'camera', 'search', 'agents', 'run', 'copy', 'split', 'avatar']

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
  it('renders all twelve elements described by HDR-02 (logo + 11 icons)', () => {
    renderHeader()

    expect(screen.getByLabelText('SwarmDeck')).toBeInTheDocument()
    expect(screen.getByLabelText('layout')).toBeInTheDocument()
    expect(screen.getByLabelText('new terminal')).toBeInTheDocument()
    expect(screen.getByLabelText('history')).toBeInTheDocument()
    expect(screen.getByLabelText('camera')).toBeInTheDocument()
    expect(screen.getByLabelText('search')).toBeInTheDocument()
    expect(screen.getByLabelText('agents')).toBeInTheDocument()
    expect(screen.getByLabelText('run')).toBeInTheDocument()
    expect(screen.getByLabelText('copy')).toBeInTheDocument()
    expect(screen.getByLabelText('split')).toBeInTheDocument()
    expect(screen.getByLabelText('avatar')).toBeInTheDocument()
    expect(screen.getByLabelText('settings')).toBeInTheDocument()
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

  it('renders the nine undefined-behavior icons as disabled with no click handler (HDR-09..HDR-11)', () => {
    renderHeader()

    for (const label of INERT_LABELS) {
      const element = screen.getByLabelText(label)
      expect(element).toBeDisabled()
      expect(element.onclick).toBeNull()
    }
    expect(screen.getByLabelText('search')).toHaveAttribute('readonly')
  })

  it('renders every icon via a lucide-react SVG - one per described element (HDR-04)', () => {
    const { container } = renderHeader()

    // 12 icons: Hexagon, LayoutGrid, Plus, History, Camera, Search, Users, Play, Copy, Columns2, User, Settings.
    // `.lucide` is the base class every lucide-react icon renders (createLucideIcon.mjs) -
    // proves provenance, not just SVG count (no hand-drawn inline SVG would pass this).
    expect(container.querySelectorAll('svg.lucide')).toHaveLength(12)
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
})
