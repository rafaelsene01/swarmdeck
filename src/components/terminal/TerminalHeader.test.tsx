// SPEC: terminal-chrome (CHROME-02), multi-terminal (TERM-05, TERM-06)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TerminalHeader from './TerminalHeader'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('TerminalHeader — barra de título da janela (CHROME-02)', () => {
  it('sem título vindo do backend, identifica o terminal pelo número em vez de "sem título"', () => {
    render(<TerminalHeader index={2} title={null} />)

    expect(screen.getByText('Terminal 2')).toBeInTheDocument()
  })

  it('expõe maximizar, minimizar e fechar como botões rotulados, nessa ordem', () => {
    render(<TerminalHeader index={1} title={null} />)

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))

    expect(labels).toEqual(['maximizar terminal', 'minimizar terminal', 'fechar terminal'])
  })

  it('os três controles disparam os callbacks correspondentes', () => {
    const onMaximize = vi.fn()
    const onMinimize = vi.fn()
    const onClose = vi.fn()
    render(
      <TerminalHeader
        index={1}
        title="build"
        onMaximize={onMaximize}
        onMinimize={onMinimize}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByLabelText('maximizar terminal'))
    fireEvent.click(screen.getByLabelText('minimizar terminal'))
    fireEvent.click(screen.getByLabelText('fechar terminal'))

    expect(onMaximize).toHaveBeenCalledTimes(1)
    expect(onMinimize).toHaveBeenCalledTimes(1)
    // Sem `hasActiveProcess` não há confirmação no caminho.
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
