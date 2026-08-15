// SPEC: quota-indicator (QUOTA-01, QUOTA-02, QUOTA-03, QUOTA-04, QUOTA-05, QUOTA-06, QUOTA-07, QUOTA-20, QUOTA-21, QUOTA-22, QUOTA-23, QUOTA-25)

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import QuotaIndicator, { type QuotaSnapshot } from './QuotaIndicator'

// `vi.mock` é hoisted para o topo do arquivo pelo transform do Vitest — mesmo
// padrão de `NewTerminalDialog.test.tsx`.
const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

function okSnapshot(overrides: Partial<QuotaSnapshot> = {}): QuotaSnapshot {
  return {
    state: 'ok',
    windows: [
      { kind: 'five_hour', label: '5 horas', usedFraction: 0.18, resetsAt: null },
      { kind: 'weekly', label: 'Semanal', usedFraction: 0.08, resetsAt: null },
    ],
    planLabel: 'Pro',
    fetchedAt: Date.now(),
    retryAt: null,
    ...overrides,
  }
}

describe('QuotaIndicator', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('window="both" desenha 2 arcos; window="weekly" desenha 1', async () => {
    invokeMock.mockResolvedValue(okSnapshot())
    const { container, unmount } = render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(container.querySelectorAll('[data-kind]')).toHaveLength(2))
    unmount()

    invokeMock.mockResolvedValue(okSnapshot())
    const { container: single } = render(<QuotaIndicator window="weekly" />)
    await waitFor(() => expect(single.querySelectorAll('[data-kind]')).toHaveLength(1))
    expect(single.querySelector('[data-kind="weekly"]')).toBeInTheDocument()
  })

  it('estado sem dado não renderiza nenhum texto casando com /%/', async () => {
    invokeMock.mockResolvedValue(
      okSnapshot({ state: 'no_credential', windows: [], planLabel: null, fetchedAt: null }),
    )
    render(<QuotaIndicator window="both" />)

    await waitFor(() =>
      expect(screen.getByLabelText('quota')).toHaveAttribute('data-quota-state', 'no_credential'),
    )
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('estado de carregamento difere do render de usedFraction: 0', async () => {
    invokeMock.mockReturnValue(new Promise(() => {})) // nunca resolve
    const { container: loadingContainer } = render(<QuotaIndicator window="five_hour" />)
    expect(screen.getByLabelText('quota')).toHaveAttribute('data-quota-state', 'loading')
    expect(loadingContainer.querySelector('[data-kind="five_hour"]')).toHaveAttribute(
      'data-has-data',
      'false',
    )

    invokeMock.mockResolvedValue(
      okSnapshot({
        windows: [{ kind: 'five_hour', label: '5 horas', usedFraction: 0, resetsAt: null }],
      }),
    )
    const { container: readyContainer } = render(<QuotaIndicator window="five_hour" />)
    await waitFor(() =>
      expect(
        readyContainer.querySelector('[data-kind="five_hour"]'),
      ).toHaveAttribute('data-has-data', 'true'),
    )
  })

  it('entrar com o cursor abre o popover; sair fecha', async () => {
    invokeMock.mockResolvedValue(okSnapshot())
    render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())

    const indicator = screen.getByLabelText('quota')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.mouseEnter(indicator)
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument())

    fireEvent.mouseLeave(indicator)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('hover renderiza as duas janelas com percentual inteiro e tempo até o reset', async () => {
    const inOneHour = new Date(Date.now() + 60 * 60_000).toISOString()
    invokeMock.mockResolvedValue(
      okSnapshot({
        windows: [
          { kind: 'five_hour', label: '5 horas', usedFraction: 0.184, resetsAt: inOneHour },
          { kind: 'weekly', label: 'Semanal', usedFraction: 0.083, resetsAt: inOneHour },
        ],
      }),
    )
    render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())

    fireEvent.mouseEnter(screen.getByLabelText('quota'))
    const tooltip = await screen.findByRole('tooltip')

    expect(tooltip).toHaveTextContent('18%')
    expect(tooltip).toHaveTextContent('8%')
    expect(tooltip).toHaveTextContent('reseta em 1h 0min')
  })

  it('popover mostra o rótulo do plano e "atualizado há 3 min"', async () => {
    invokeMock.mockResolvedValue(okSnapshot({ planLabel: 'Pro', fetchedAt: Date.now() - 3 * 60_000 }))
    render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())

    fireEvent.mouseEnter(screen.getByLabelText('quota'))
    const tooltip = await screen.findByRole('tooltip')

    expect(tooltip).toHaveTextContent('Pro')
    expect(tooltip).toHaveTextContent('atualizado há 3 min')
  })

  it('no_credential mostra que o Claude Code não está conectado, sem percentual', async () => {
    invokeMock.mockResolvedValue(
      okSnapshot({ state: 'no_credential', windows: [], planLabel: null, fetchedAt: null }),
    )
    render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())

    fireEvent.mouseEnter(screen.getByLabelText('quota'))
    const tooltip = await screen.findByRole('tooltip')

    expect(tooltip).toHaveTextContent('O Claude Code não está conectado.')
    expect(tooltip).not.toHaveTextContent(/\d+%/)
  })

  it('unauthorized mostra que a sessão expirou', async () => {
    invokeMock.mockResolvedValue(
      okSnapshot({ state: 'unauthorized', windows: [], planLabel: null, fetchedAt: null }),
    )
    render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())

    fireEvent.mouseEnter(screen.getByLabelText('quota'))
    const tooltip = await screen.findByRole('tooltip')

    expect(tooltip).toHaveTextContent('A sessão expirou. Abra o Claude Code para renovar.')
    expect(tooltip).not.toHaveTextContent(/\d+%/)
  })

  it('rate_limited mostra o horário da próxima tentativa; offline mostra sem conexão', async () => {
    const retryAt = new Date('2026-08-15T18:45:00Z').getTime()
    invokeMock.mockResolvedValue(
      okSnapshot({ state: 'rate_limited', windows: [], planLabel: null, fetchedAt: null, retryAt }),
    )
    const { unmount } = render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())
    fireEvent.mouseEnter(screen.getByLabelText('quota'))
    let tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Próxima tentativa às')
    expect(tooltip).not.toHaveTextContent(/\d+%/)
    unmount()

    invokeMock.mockResolvedValue(
      okSnapshot({ state: 'offline', windows: [], planLabel: null, fetchedAt: null }),
    )
    render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())
    fireEvent.mouseEnter(screen.getByLabelText('quota'))
    tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Sem conexão.')
    expect(tooltip).not.toHaveTextContent(/\d+%/)
  })

  it('é um <button> de verdade, e focá-lo (teclado) abre o popover (QUOTA-01)', async () => {
    invokeMock.mockResolvedValue(okSnapshot())
    render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())

    const indicator = screen.getByLabelText('quota')
    expect(indicator.tagName).toBe('BUTTON')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focus(indicator)
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument())

    fireEvent.blur(indicator)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('resetsAt inválido/ausente mostra o percentual sem separador pendurado (QUOTA-25)', async () => {
    invokeMock.mockResolvedValue(
      okSnapshot({
        windows: [
          { kind: 'five_hour', label: '5 horas', usedFraction: 0.42, resetsAt: null },
          { kind: 'weekly', label: 'Semanal', usedFraction: 0.08, resetsAt: null },
        ],
      }),
    )
    render(<QuotaIndicator window="both" />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalled())

    fireEvent.mouseEnter(screen.getByLabelText('quota'))
    const tooltip = await screen.findByRole('tooltip')

    expect(tooltip).toHaveTextContent('42%')
    expect(tooltip).not.toHaveTextContent('42% ·')
    expect(tooltip).not.toHaveTextContent('reseta em')
  })
})
