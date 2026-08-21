// SPEC: update-toast (TOAST-04, TOAST-05, TOAST-06)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import UpdateToast from './UpdateToast'

function renderToast(overrides: Partial<Parameters<typeof UpdateToast>[0]> = {}) {
  const props = { version: '0.2.0', onOpen: vi.fn(), onDismiss: vi.fn(), ...overrides }
  render(<UpdateToast {...props} />)
  return props
}

describe('UpdateToast', () => {
  // TOAST-04: o número tem de aparecer — "há uma atualização" sem dizer qual
  // deixa o usuário sem como saber se é a que ele já viu.
  it('nomeia a versão disponível', () => {
    renderToast({ version: '1.4.2' })

    expect(screen.getByText(/1\.4\.2/)).toBeInTheDocument()
    expect(screen.getByText('Nova versão disponível')).toBeInTheDocument()
  })

  // TOAST-06
  it('o botão "Abrir" avisa quem monta, para levar às Configurações', () => {
    const props = renderToast()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(props.onOpen).toHaveBeenCalledTimes(1)
    expect(props.onDismiss).not.toHaveBeenCalled()
  })

  // TOAST-05: fechar é do usuário; o componente não agenda nada sozinho.
  it('o X dispensa e nada mais dispensa', () => {
    vi.useFakeTimers()
    const props = renderToast()

    vi.advanceTimersByTime(60_000)
    expect(props.onDismiss).not.toHaveBeenCalled()
    vi.useRealTimers()

    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso de atualização' }))
    expect(props.onDismiss).toHaveBeenCalledTimes(1)
  })
})
