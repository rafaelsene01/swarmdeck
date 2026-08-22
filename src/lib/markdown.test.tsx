// SPEC: feedback-form (FEED-14), silent-update (SILENT-42)

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderInline, renderMarkdown } from './markdown'

function renderMd(markdown: string) {
  return render(<div>{renderMarkdown(markdown)}</div>)
}

describe('renderMarkdown', () => {
  it('título vira heading', () => {
    renderMd('# Título\n\n### Subtítulo')

    expect(screen.getByRole('heading', { name: 'Título' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Subtítulo' })).toBeInTheDocument()
  })

  it('item de lista vira listitem, com `-` e `*`', () => {
    renderMd('- primeiro\n* segundo')

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('primeiro')
    expect(items[1]).toHaveTextContent('segundo')
    expect(screen.getAllByRole('list')).toHaveLength(1)
  })

  it('linha solta vira parágrafo', () => {
    const { container } = renderMd('uma linha qualquer')

    expect(container.querySelector('p')).toHaveTextContent('uma linha qualquer')
  })

  it('`**forte**` vira strong e `` `código` `` vira code', () => {
    const { container } = renderMd('texto **forte** com `código` e *ênfase*')

    expect(container.querySelector('strong')).toHaveTextContent('forte')
    expect(container.querySelector('code')).toHaveTextContent('código')
    expect(container.querySelector('em')).toHaveTextContent('ênfase')
  })

  it('linha vazia fecha a lista aberta', () => {
    renderMd('- um\n\n- dois')

    expect(screen.getAllByRole('list')).toHaveLength(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('lista ordenada vira <ol> e a lista `-` continua <ul>', () => {
    const { container } = renderMd('1. um\n2. dois\n\n- traço')

    expect(container.querySelector('ol')?.querySelectorAll('li')).toHaveLength(2)
    expect(container.querySelector('ul')?.querySelectorAll('li')).toHaveLength(1)
  })

  it('troca de tipo de lista sem linha em branco fecha a lista anterior', () => {
    const { container } = renderMd('- traço\n1. numerado')

    expect(container.querySelector('ul')?.querySelectorAll('li')).toHaveLength(1)
    expect(container.querySelector('ol')?.querySelectorAll('li')).toHaveLength(1)
  })

  it('`> texto` vira blockquote', () => {
    const { container } = renderMd('> uma citação')

    expect(container.querySelector('blockquote')).toHaveTextContent('uma citação')
  })

  it('bloco cercado vira <pre><code> com o conteúdo literal', () => {
    const { container } = renderMd('```\n# não é título\n**não é forte**\n```')

    expect(container.querySelector('pre > code')?.textContent).toBe('# não é título\n**não é forte**')
    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('h4')).toBeNull()
  })

  it('bloco cercado não fechado renderiza até o fim, sem descartar conteúdo', () => {
    const { container } = renderMd('```\nlinha um\nlinha dois')

    expect(container.querySelector('pre > code')?.textContent).toBe('linha um\nlinha dois')
  })

  // Fora do subconjunto: o valor da prova está no texto preservado, não em
  // "não existe <table>" — o renderizador não tem caminho que crie uma.
  it('tabela sai como parágrafo de texto literal', () => {
    const { container } = renderMd('| a | b |\n| - | - |')

    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]).toHaveTextContent('| a | b |')
  })

  it('link Markdown sai com os colchetes e a URL à vista, e sem virar âncora', () => {
    const { container } = renderMd('veja [texto](http://x) aqui')

    expect(container.querySelector('p')?.textContent).toBe('veja [texto](http://x) aqui')
  })

  it('lista de tarefas vira item de lista com os colchetes no texto', () => {
    renderMd('- [ ] pendente\n- [x] feito')

    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['[ ] pendente', '[x] feito'])
  })

  it('texto vazio não produz nenhum bloco', () => {
    expect(renderMarkdown('')).toHaveLength(0)
  })
})

describe('renderInline', () => {
  it('devolve texto literal quando não há marcação', () => {
    render(<span>{renderInline('só texto')}</span>)

    expect(screen.getByText('só texto')).toBeInTheDocument()
  })
})
