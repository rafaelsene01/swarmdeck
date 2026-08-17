// SPEC: terminal-chrome (CHROME-02), multi-terminal (TERM-05, TERM-06, TERM-12, TERM-13), terminal-layout-options (LAYOUT-17)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TerminalHeader from './TerminalHeader'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('TerminalHeader — barra de título da janela (CHROME-02)', () => {
  it('sem título vindo do backend, identifica o terminal pelo número em vez de "sem título"', () => {
    render(<TerminalHeader index={2} title={null} />)

    expect(screen.getByText('Terminal 2')).toBeInTheDocument()
  })

  it('expõe maximizar, minimizar, clonar, reiniciar e fechar como botões rotulados, nessa ordem', () => {
    const { container } = render(<TerminalHeader index={1} title={null} />)

    // Escopado à barra de ações: o próprio título também é um `role="button"`
    // desde que ganhou o clique-para-renomear.
    const labels = [...container.querySelectorAll('.terminal-header__actions button')].map(
      (button) => button.getAttribute('aria-label'),
    )

    expect(labels).toEqual([
      'maximizar terminal',
      'minimizar terminal',
      'clonar terminal',
      'reiniciar terminal',
      'fechar terminal',
    ])
  })

  it('clonar dispara onClone e fica desabilitado quando canClone é false', () => {
    const onClone = vi.fn()
    const { rerender } = render(<TerminalHeader index={1} title={null} onClone={onClone} />)

    fireEvent.click(screen.getByLabelText('clonar terminal'))
    expect(onClone).toHaveBeenCalledTimes(1)

    rerender(<TerminalHeader index={1} title={null} onClone={onClone} canClone={false} />)
    const button = screen.getByLabelText('clonar terminal')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClone).toHaveBeenCalledTimes(1)
  })

  it('reiniciar pede confirmação quando há processo ativo e respeita a recusa', () => {
    const onReset = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TerminalHeader index={1} title={null} hasActiveProcess onReset={onReset} />)

    fireEvent.click(screen.getByLabelText('reiniciar terminal'))
    expect(confirmSpy).toHaveBeenCalled()
    expect(onReset).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByLabelText('reiniciar terminal'))
    expect(onReset).toHaveBeenCalledTimes(1)

    confirmSpy.mockRestore()
  })

  it('sem processo ativo, reiniciar não pede confirmação', () => {
    const onReset = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<TerminalHeader index={1} title={null} hasActiveProcess={false} onReset={onReset} />)

    fireEvent.click(screen.getByLabelText('reiniciar terminal'))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onReset).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
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

  // TERM-06: renomeação inline por clique, com confirmar/cancelar explícitos.
  it('clicar no título abre o campo com confirmar e cancelar', () => {
    render(<TerminalHeader index={1} title="build" />)

    fireEvent.click(screen.getByText('build'))

    expect(screen.getByLabelText('renomear terminal')).toHaveValue('build')
    expect(screen.getByLabelText('confirmar renomear terminal')).toBeInTheDocument()
    expect(screen.getByLabelText('cancelar renomear terminal')).toBeInTheDocument()
  })

  it('confirmar aplica o novo nome; cancelar mantém o antigo', () => {
    render(<TerminalHeader index={1} title="build" />)

    fireEvent.click(screen.getByText('build'))
    fireEvent.change(screen.getByLabelText('renomear terminal'), { target: { value: 'deploy' } })
    fireEvent.click(screen.getByLabelText('confirmar renomear terminal'))

    expect(screen.getByText('deploy')).toBeInTheDocument()

    fireEvent.click(screen.getByText('deploy'))
    fireEvent.change(screen.getByLabelText('renomear terminal'), { target: { value: 'lixo' } })
    fireEvent.click(screen.getByLabelText('cancelar renomear terminal'))

    expect(screen.getByText('deploy')).toBeInTheDocument()
    expect(screen.queryByText('lixo')).not.toBeInTheDocument()
  })

  it('Enter confirma e Escape cancela', () => {
    render(<TerminalHeader index={1} title="build" />)

    fireEvent.click(screen.getByText('build'))
    const input = screen.getByLabelText('renomear terminal')
    fireEvent.change(input, { target: { value: 'deploy' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('deploy')).toBeInTheDocument()

    fireEvent.click(screen.getByText('deploy'))
    fireEvent.change(screen.getByLabelText('renomear terminal'), { target: { value: 'lixo' } })
    fireEvent.keyDown(screen.getByLabelText('renomear terminal'), { key: 'Escape' })
    expect(screen.getByText('deploy')).toBeInTheDocument()
  })

  it('nome só com espaços é tratado como cancelamento', () => {
    render(<TerminalHeader index={1} title="build" />)

    fireEvent.click(screen.getByText('build'))
    fireEvent.change(screen.getByLabelText('renomear terminal'), { target: { value: '   ' } })
    fireEvent.click(screen.getByLabelText('confirmar renomear terminal'))

    expect(screen.getByText('build')).toBeInTheDocument()
  })
})

describe('TerminalHeader — alça como origem do arrasto (LAYOUT-17)', () => {
  const grip = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.terminal-header__grip-handle')!

  it('sem onDragStartReorder a alça segue decorativa: aria-hidden e não arrastável', () => {
    const { container } = render(<TerminalHeader index={1} title="build" />)

    expect(grip(container)).toHaveAttribute('aria-hidden', 'true')
    expect(grip(container)).toHaveAttribute('draggable', 'false')
    expect(screen.queryByLabelText('reordenar terminal')).not.toBeInTheDocument()
  })

  it('com a prop a alça fica arrastável e o dragstart dispara o callback', () => {
    const onDragStartReorder = vi.fn()
    const { container } = render(
      <TerminalHeader index={1} title="build" onDragStartReorder={onDragStartReorder} />,
    )

    expect(grip(container)).toHaveAttribute('draggable', 'true')
    expect(grip(container)).not.toHaveAttribute('aria-hidden')

    fireEvent.dragStart(grip(container))

    expect(onDragStartReorder).toHaveBeenCalledTimes(1)
  })
})
