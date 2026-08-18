// SPEC: shell-chrome (HDR-01, HDR-02, HDR-03, HDR-04, HDR-05, HDR-06, HDR-07), release-distribution (REL-51), quota-indicator (QUOTA-01, QUOTA-12), terminal-layout-options (LAYOUT-02), minimized-tray (MIN-02, MIN-09, MIN-10, MIN-11)

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
  // dele. Em 18/08/2026 saíram também os inertes `layout` (o quadrado da ponta
  // esquerda), `history` e, por MIN-09, os dois últimos: `run` e `copy`.
  // HDR-02 descrevia 11 elementos; agora são 3.
  it('renders the three remaining elements of HDR-02 - the avatar slot is now QuotaIndicator (QUOTA-01)', () => {
    renderHeader()

    expect(screen.getByLabelText('new terminal')).toBeInTheDocument()
    expect(screen.queryByLabelText('camera')).not.toBeInTheDocument()
    // O terceiro é o menu de layout, que substituiu o `split` (LAYOUT-02).
    expect(screen.getByLabelText('layout options')).toBeInTheDocument()
    expect(screen.getByLabelText('settings')).toBeInTheDocument()
  })

  // SPEC: minimized-tray (MIN-09) — os dois últimos botões inertes saíram.
  it('não renderiza mais os botões inertes run e copy', () => {
    renderHeader()

    expect(screen.queryByLabelText('run')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('copy')).not.toBeInTheDocument()
  })

  // SPEC: minimized-tray (MIN-10) — o `+` virou ícone de terminal, sem texto.
  it('desenha o "new terminal" como ícone de terminal, sem rótulo textual', () => {
    renderHeader()

    const button = screen.getByLabelText('new terminal')
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg.lucide-square-terminal')).not.toBeNull()
  })

  // SPEC: minimized-tray (MIN-02) — sem minimizados não há bandeja.
  it('só mostra a bandeja de minimizados quando há algum, com a contagem', () => {
    const { unmount } = renderHeader()
    expect(screen.queryByLabelText('minimized terminals')).not.toBeInTheDocument()
    unmount()

    renderHeader({
      minimizedTerminals: [
        { id: 't-1', tabName: 'Aba 1', name: 'Terminal 1' },
        { id: 't-2', tabName: 'Aba 2', name: 'Terminal 2' },
      ],
    })

    expect(screen.getByLabelText('minimized terminals')).toHaveTextContent('2')
  })

  it('no longer renders the logo, the search field, the agents icon, the layout square or the history button', () => {
    renderHeader()

    expect(screen.queryByLabelText('layout')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('history')).not.toBeInTheDocument()
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

  it('renders every icon via a lucide-react SVG - one per described element (HDR-04)', () => {
    const { container } = renderHeader()

    // 3 icons with quotaPrefs absent (QuotaIndicator not mounted) and no
    // minimized terminal (MinimizedTray not mounted): SquareTerminal,
    // Columns2, Settings. A câmera saiu para o header do painel (SHOT-01).
    // `.lucide` is the base class every lucide-react icon renders (createLucideIcon.mjs) -
    // proves provenance, not just SVG count (no hand-drawn inline SVG would pass this).
    expect(container.querySelectorAll('svg.lucide')).toHaveLength(3)
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

    expect(labels).toEqual(['layout options', 'quota', 'settings'])
  })

  // SPEC: minimized-tray (MIN-11) — a bandeja mudou para o grupo direito,
  // imediatamente antes do menu de layout.
  it('põe a bandeja de minimizados no grupo direito, logo antes do menu de layout', () => {
    const { container } = renderHeader({
      terminalCount: 2,
      minimizedTerminals: [{ id: 't-1', tabName: 'Aba 1', name: 'Terminal 1' }],
    })

    const rightGroup = container.querySelectorAll('.shell-header__group')[1]!
    const tray = screen.getByLabelText('minimized terminals')

    expect(rightGroup).toContainElement(tray)
    expect(rightGroup.querySelector('.minimized-tray')!.nextElementSibling).toContainElement(
      screen.getByLabelText('layout options'),
    )
  })

  // SPEC: terminal-layout-options (LAYOUT-02)
  it('substitui o botão inerte "split" pelo menu de layout, no mesmo lugar', () => {
    renderHeader({ terminalCount: 2 })

    expect(screen.queryByLabelText('split')).not.toBeInTheDocument()
    expect(screen.getByLabelText('layout options')).toBeEnabled()
  })

  it('põe o menu de layout como irmão imediatamente anterior ao indicador de cota', async () => {
    const { container } = renderHeader({
      terminalCount: 2,
      quotaPrefs: { enabled: true, window: 'both' },
    })
    await waitFor(() => expect(screen.getByLabelText('quota')).toBeInTheDocument())

    const quota = container.querySelector('.quota-indicator')!
    const layoutButton = screen.getByLabelText('layout options')

    expect(quota.previousElementSibling).toContainElement(layoutButton)
  })

})
