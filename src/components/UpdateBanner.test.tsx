// SPEC: release-distribution (REL-20, REL-23, REL-26)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import UpdateBanner from './UpdateBanner'

const UPDATE = { version: '0.2.0', notes: 'Correções e melhorias.' }

describe('UpdateBanner', () => {
  it('update null -> nada é renderizado', () => {
    const { container } = render(
      <UpdateBanner
        update={null}
        activeTerminalCount={0}
        onUpdateNow={vi.fn()}
        onLater={vi.fn()}
        onSkip={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('update presente -> mostra versão, notas e os 3 botões', () => {
    render(
      <UpdateBanner
        update={UPDATE}
        activeTerminalCount={0}
        onUpdateNow={vi.fn()}
        onLater={vi.fn()}
        onSkip={vi.fn()}
      />,
    )

    expect(screen.getByText(/0\.2\.0/)).toBeInTheDocument()
    expect(screen.getByText('Correções e melhorias.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Depois' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pular' })).toBeInTheDocument()
  })

  it('"Depois" chama onLater e o banner desaparece do DOM nesta sessão', () => {
    const onLater = vi.fn()

    const { container } = render(
      <UpdateBanner
        update={UPDATE}
        activeTerminalCount={0}
        onUpdateNow={vi.fn()}
        onLater={onLater}
        onSkip={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Depois' }))

    expect(onLater).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })

  it('"Atualizar" com activeTerminalCount 0 chama onUpdateNow direto, sem confirmação', () => {
    const onUpdateNow = vi.fn()

    render(
      <UpdateBanner
        update={UPDATE}
        activeTerminalCount={0}
        onUpdateNow={onUpdateNow}
        onLater={vi.fn()}
        onSkip={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))

    expect(onUpdateNow).toHaveBeenCalledTimes(1)
  })

  it('"Atualizar" com PTYs ativos mostra confirmação e só chama onUpdateNow após confirmar', () => {
    const onUpdateNow = vi.fn()

    render(
      <UpdateBanner
        update={UPDATE}
        activeTerminalCount={2}
        onUpdateNow={onUpdateNow}
        onLater={vi.fn()}
        onSkip={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))

    expect(onUpdateNow).not.toHaveBeenCalled()
    expect(screen.getByText(/terminais ativos serão encerrados/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'confirmar' }))

    expect(onUpdateNow).toHaveBeenCalledTimes(1)
  })
})
