// SPEC: window-chrome (WIN-01, WIN-02, WIN-03, WIN-04)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TitleBar from './TitleBar'

const { minimize, toggleMaximize, close } = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ minimize, toggleMaximize, close }),
}))

describe('TitleBar', () => {
  // WIN-03: cada controle chama o método correspondente da janela.
  it('liga os três controles à janela atual', () => {
    render(<TitleBar />)

    fireEvent.click(screen.getByLabelText('minimizar janela'))
    fireEvent.click(screen.getByLabelText('maximizar janela'))
    fireEvent.click(screen.getByLabelText('fechar janela'))

    expect(minimize).toHaveBeenCalledTimes(1)
    expect(toggleMaximize).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  // WIN-02: nada de ícone ou nome do app à esquerda.
  it('não mostra ícone nem nome do app', () => {
    render(<TitleBar />)

    expect(screen.queryByText('SwarmDeck')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  // WIN-01: a região de arrasto existe e a barra usa os tokens escuros.
  it('é arrastável e usa os tokens de superfície escura', () => {
    const { container } = render(<TitleBar />)

    const bar = container.querySelector('.app-titlebar')!
    expect(bar).toHaveAttribute('data-tauri-drag-region')
    expect(container.querySelector('style')!.textContent).toContain('var(--surface-2)')
  })
})
