// SPEC: minimized-tray (MIN-02, MIN-03, MIN-04, MIN-05, MIN-06, MIN-07, MIN-08)

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MinimizedTray, { type MinimizedTerminal } from './MinimizedTray'

const ITEMS: MinimizedTerminal[] = [
  { id: 't-1', tabName: 'Aba 1', name: 'Terminal 1' },
  { id: 't-2', tabName: 'Aba 2', name: 'Terminal 2' },
]

function renderTray(props: Partial<Parameters<typeof MinimizedTray>[0]> = {}) {
  const onRestore = vi.fn()
  const onClose = vi.fn()
  const result = render(
    <MinimizedTray items={ITEMS} onRestore={onRestore} onClose={onClose} {...props} />,
  )
  return { ...result, onRestore, onClose }
}

/** O popover só existe depois do clique no ícone (MIN-03). */
function open() {
  fireEvent.click(screen.getByLabelText('minimized terminals'))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MinimizedTray', () => {
  // MIN-02
  it('não renderiza nada sem minimizados', () => {
    const { container } = renderTray({ items: [] })

    expect(container).toBeEmptyDOMElement()
  })

  // MIN-02
  it('mostra a contagem de minimizados no ícone', () => {
    renderTray()

    expect(screen.getByLabelText('minimized terminals')).toHaveTextContent('2')
  })

  // MIN-04, MIN-08
  it('lista cada minimizado com o nome da aba e o nome do terminal', () => {
    renderTray()
    open()

    expect(screen.getByText('Minimized (2)')).toBeInTheDocument()
    expect(screen.getByText('Aba 1')).toBeInTheDocument()
    expect(screen.getByText('Terminal 1')).toBeInTheDocument()
    expect(screen.getByText('Aba 2')).toBeInTheDocument()
    expect(screen.getByText('Terminal 2')).toBeInTheDocument()
  })

  // MIN-03
  it('abre e fecha no clique, e fecha com Escape e clique fora', () => {
    renderTray()

    open()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    open()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    open()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // MIN-05
  it('restaura o terminal clicado e fecha o popover', () => {
    const { onRestore } = renderTray()
    open()

    fireEvent.click(screen.getByText('Terminal 2'))

    expect(onRestore.mock.calls).toEqual([['t-2']])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // MIN-06: o PTY segue vivo, então fechar pede confirmação — e desistir não
  // fecha nada.
  it('fecha o terminal do X só após confirmação', () => {
    const { onClose } = renderTray()
    open()

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByLabelText('fechar Terminal 1'))
    expect(onClose).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByLabelText('fechar Terminal 1'))
    expect(onClose.mock.calls).toEqual([['t-1']])
  })

  // MIN-07
  it('"Close all" fecha todos os minimizados, uma chamada por terminal', () => {
    const { onClose } = renderTray()
    open()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('Close all'))

    expect(onClose.mock.calls).toEqual([['t-1'], ['t-2']])
  })

  // Edge case: esvaziar a lista com o popover aberto não pode deixar um
  // popover órfão sobre um botão que deixou de existir.
  it('fecha o popover quando o último minimizado sai da lista', () => {
    const { rerender } = renderTray()
    open()
    expect(screen.getByRole('menu')).toBeInTheDocument()

    rerender(<MinimizedTray items={[]} onRestore={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    rerender(<MinimizedTray items={ITEMS} onRestore={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
