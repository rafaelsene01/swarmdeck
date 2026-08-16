// SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-26)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import GeneralPanel, { type QuotaPrefs } from './GeneralPanel'

const PROVIDERS = [
  { id: 'claude-code', enabled: true },
  { id: 'codex-cli', enabled: true },
  { id: 'opencode', enabled: true },
]

function renderPanel(prefs: Omit<QuotaPrefs, 'providers'> & { providers?: QuotaPrefs['providers'] }) {
  const onChange = vi.fn()
  render(<GeneralPanel prefs={{ providers: PROVIDERS, ...prefs }} onChange={onChange} />)
  return onChange
}

describe('GeneralPanel', () => {
  it('alternar o switch mestre chama onChange com enabled invertido', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar o indicador de cota' }))

    expect(onChange).toHaveBeenCalledWith({
      enabled: false,
      window: 'both',
      providers: PROVIDERS,
    })
  })

  it('selecionar "5 horas" chama onChange com window: five_hour', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('radio', { name: '5 horas' }))

    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      window: 'five_hour',
      providers: PROVIDERS,
    })
  })

  it('selecionar "Semanal" e "Ambos" chamam onChange com o valor certo cada', () => {
    const onChange = renderPanel({ enabled: true, window: 'five_hour' })

    fireEvent.click(screen.getByRole('radio', { name: 'Semanal' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ window: 'weekly' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Ambos' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ window: 'both' }))
  })

  // QUOTA-26: a lista do popover é ordenável e cada linha liga/desliga.
  it('lista um provedor por linha, na ordem das prefs', () => {
    renderPanel({ enabled: true, window: 'both' })

    const rows = document.querySelectorAll('[data-provider]')
    expect([...rows].map((row) => row.getAttribute('data-provider'))).toEqual([
      'claude-code',
      'codex-cli',
      'opencode',
    ])
  })

  it('"descer" troca o provedor com o seguinte', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('button', { name: 'Descer Claude' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: [
          { id: 'codex-cli', enabled: true },
          { id: 'claude-code', enabled: true },
          { id: 'opencode', enabled: true },
        ],
      }),
    )
  })

  it('"subir" está desabilitado no primeiro e "descer" no último', () => {
    renderPanel({ enabled: true, window: 'both' })

    expect(screen.getByRole('button', { name: 'Subir Claude' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descer opencode' })).toBeDisabled()
  })

  it('desligar um provedor preserva a posição dele na lista', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar Codex no popover' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: [
          { id: 'claude-code', enabled: true },
          { id: 'codex-cli', enabled: false },
          { id: 'opencode', enabled: true },
        ],
      }),
    )
  })
})
