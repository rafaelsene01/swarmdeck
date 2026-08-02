// SPEC: release-distribution (REL-32, REL-33, REL-34)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import UpdateSettings, { type CheckState } from './UpdateSettings'

function renderSettings(overrides: Partial<Parameters<typeof UpdateSettings>[0]> = {}) {
  const props = {
    installedVersion: '0.3.1',
    mode: 'installed' as const,
    autoCheckEnabled: true,
    checkState: { status: 'idle' } as CheckState,
    onToggleAutoCheck: vi.fn(),
    onCheckNow: vi.fn(),
    ...overrides,
  }
  render(<UpdateSettings {...props} />)
  return props
}

describe('UpdateSettings', () => {
  it('mostra a versão instalada e o rótulo do modo, para "installed" e "portable"', () => {
    const { unmount } = render(
      <UpdateSettings
        installedVersion="0.3.1"
        mode="installed"
        autoCheckEnabled={true}
        checkState={{ status: 'idle' }}
        onToggleAutoCheck={vi.fn()}
        onCheckNow={vi.fn()}
      />,
    )
    expect(screen.getByText('0.3.1')).toBeInTheDocument()
    expect(screen.getByText('Instalado')).toBeInTheDocument()
    unmount()

    render(
      <UpdateSettings
        installedVersion="0.4.0"
        mode="portable"
        autoCheckEnabled={true}
        checkState={{ status: 'idle' }}
        onToggleAutoCheck={vi.fn()}
        onCheckNow={vi.fn()}
      />,
    )
    expect(screen.getByText('0.4.0')).toBeInTheDocument()
    expect(screen.getByText('Portátil')).toBeInTheDocument()
  })

  it('checkState "up_to_date" mostra a mensagem de já atualizado (REL-33: não fica em silêncio)', () => {
    renderSettings({ checkState: { status: 'up_to_date' } })

    expect(screen.getByText('Você já está na versão mais recente.')).toBeInTheDocument()
  })

  it('checkState "error" mostra a mensagem de erro explícita (ex.: sem rede)', () => {
    renderSettings({
      checkState: { status: 'error', message: 'network unreachable' },
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível verificar. Confira sua conexão.')
    expect(alert).toHaveTextContent('network unreachable')
  })

  it('com autoCheckEnabled=false, o toggle reflete desligado e "Verificar agora" ainda chama onCheckNow', () => {
    const onCheckNow = vi.fn()
    renderSettings({ autoCheckEnabled: false, onCheckNow })

    const toggle = screen.getByRole('checkbox') as HTMLInputElement
    expect(toggle.checked).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Verificar agora' }))

    expect(onCheckNow).toHaveBeenCalledTimes(1)
  })
})
