// SPEC: terminal-layout-options (LAYOUT-01, LAYOUT-03, LAYOUT-04, LAYOUT-05, LAYOUT-06, LAYOUT-13, LAYOUT-14)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import LayoutMenu from './LayoutMenu'
import type { TabLayout } from '../../state/layout'

const horizontal = (span: TabLayout['span'] = 'first'): TabLayout => ({ mode: 'horizontal', span })

function renderMenu(props: Partial<Parameters<typeof LayoutMenu>[0]> = {}) {
  const onChange = props.onChange ?? vi.fn()
  const result = render(
    <LayoutMenu count={props.count ?? 2} layout={props.layout ?? horizontal()} onChange={onChange} />,
  )
  return { ...result, onChange }
}

function openMenu() {
  fireEvent.click(screen.getByLabelText('layout options'))
}

describe('LayoutMenu — cabeçalho do popover (LAYOUT-01)', () => {
  it('mostra a contagem de terminais da aba ativa no singular com um terminal', () => {
    renderMenu({ count: 1 })
    openMenu()

    expect(screen.getByText('1 TERMINAL')).toBeInTheDocument()
  })

  it('mostra a contagem no plural com mais de um terminal', () => {
    renderMenu({ count: 3 })
    openMenu()

    expect(screen.getByText('3 TERMINAIS')).toBeInTheDocument()
  })
})

describe('LayoutMenu — modo ativo e escolha (LAYOUT-03, LAYOUT-04)', () => {
  it('marca só a entrada do modo ativo com a cor de acento', () => {
    renderMenu({ count: 2, layout: { mode: 'vertical', span: 'first' } })
    openMenu()

    expect(screen.getByRole('menuitem', { name: /Vertical/ })).toHaveStyle({
      color: 'var(--accent)',
    })
    expect(screen.getByRole('menuitem', { name: /Horizontal/ })).not.toHaveStyle({
      color: 'var(--accent)',
    })
    // "e nenhuma outra": exatamente uma entrada acentuada.
    const acentuadas = screen
      .getAllByRole('menuitem')
      .filter((item) => item.style.color === 'var(--accent)')
    expect(acentuadas).toHaveLength(1)
  })

  it('escolher um modo chama onChange com o modo novo e a variante preservada, e fecha o popover', () => {
    const { onChange } = renderMenu({ count: 2, layout: horizontal('last') })
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: /Vertical/ }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ mode: 'vertical', span: 'last' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('LayoutMenu — fechar sem alterar (LAYOUT-05)', () => {
  it('Escape fecha o popover sem chamar onChange', () => {
    const { onChange } = renderMenu()
    openMenu()
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clique fora fecha o popover sem chamar onChange', () => {
    const { onChange } = renderMenu()
    openMenu()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('LayoutMenu — aba sem terminais (LAYOUT-06)', () => {
  it('desabilita o botão e não abre o popover com 0 terminais', () => {
    renderMenu({ count: 0 })

    const button = screen.getByLabelText('layout options')
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('LayoutMenu — variantes de largura (LAYOUT-13, LAYOUT-14)', () => {
  it('exibe as duas variantes só com 3 terminais no modo horizontal, com a ativa marcada', () => {
    const { rerender } = renderMenu({ count: 3, layout: horizontal('last') })
    openMenu()

    expect(screen.getByRole('menuitem', { name: 'Largura toda em cima' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Largura toda embaixo' })).toHaveStyle({
      color: 'var(--accent)',
    })
    expect(screen.getByRole('menuitem', { name: 'Largura toda em cima' })).not.toHaveStyle({
      color: 'var(--accent)',
    })

    // Modo vertical com 3 terminais não tem variante de largura.
    rerender(
      <LayoutMenu count={3} layout={{ mode: 'vertical', span: 'last' }} onChange={vi.fn()} />,
    )
    expect(screen.queryByRole('menuitem', { name: 'Largura toda em cima' })).not.toBeInTheDocument()
  })

  it('omite as variantes quando a aba não tem exatamente 3 terminais', () => {
    const { rerender } = renderMenu({ count: 2, layout: horizontal() })
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Largura toda em cima' })).not.toBeInTheDocument()

    rerender(<LayoutMenu count={4} layout={horizontal()} onChange={vi.fn()} />)
    expect(screen.queryByRole('menuitem', { name: 'Largura toda embaixo' })).not.toBeInTheDocument()
  })

  it('escolher uma variante chama onChange com o span novo e o modo preservado', () => {
    const { onChange } = renderMenu({ count: 3, layout: horizontal('first') })
    openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Largura toda embaixo' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'horizontal', span: 'last' })
  })
})
