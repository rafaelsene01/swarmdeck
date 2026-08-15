// SPEC: quota-indicator (QUOTA-09, QUOTA-10)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import GeneralPanel, { type QuotaPrefs } from './GeneralPanel'

function renderPanel(prefs: QuotaPrefs, onChange = vi.fn()) {
  render(<GeneralPanel prefs={prefs} onChange={onChange} />)
  return onChange
}

describe('GeneralPanel', () => {
  it('alternar o switch chama onChange com enabled invertido', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalledWith({ enabled: false, window: 'both' })
  })

  it('selecionar "5 horas" chama onChange com window: five_hour', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('radio', { name: '5 horas' }))

    expect(onChange).toHaveBeenCalledWith({ enabled: true, window: 'five_hour' })
  })

  it('selecionar "Semanal" e "Ambos" chamam onChange com o valor certo cada', () => {
    const onChange = renderPanel({ enabled: true, window: 'five_hour' })

    fireEvent.click(screen.getByRole('radio', { name: 'Semanal' }))
    expect(onChange).toHaveBeenCalledWith({ enabled: true, window: 'weekly' })

    fireEvent.click(screen.getByRole('radio', { name: 'Ambos' }))
    expect(onChange).toHaveBeenCalledWith({ enabled: true, window: 'both' })
  })
})
