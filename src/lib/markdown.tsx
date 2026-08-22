// SPEC: feedback-form (FEED-14), silent-update (SILENT-42)

import type { ReactNode } from 'react'

/** `**forte**`, `*ênfase*` e `` `código` `` — o resto sai literal. */
export function renderInline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>
      return part
    })
}

/**
 * Renderiza o subconjunto de Markdown que as notas de release e as descrições
 * de feedback usam de fato (SILENT-42, FEED-14): títulos `#`..`######`, itens
 * `-`/`*`, listas ordenadas `1.`, citações `>`, blocos cercados por ``` e
 * parágrafos. Tudo fora disso sai como texto literal, sem quebrar o render.
 *
 * Monta nós React, nunca `dangerouslySetInnerHTML`: texto do usuário entra
 * como texto, não como HTML.
 *
 * ponytail: varredura linha a linha, sem estado aninhado — tabelas, listas de
 * tarefas (`- [ ]`) e listas aninhadas pedem um parser de verdade
 * (`react-markdown`), não mais regex em cima desta função.
 */
export function renderMarkdown(markdown: string): ReactNode[] {
  const blocks: ReactNode[] = []
  let items: ReactNode[] = []
  /** `null` fora de lista; `ul`/`ol` decide a tag no `flush`. */
  let listTag: 'ul' | 'ol' | null = null

  const flush = () => {
    if (items.length === 0) {
      listTag = null
      return
    }
    const Tag = listTag ?? 'ul'
    blocks.push(<Tag key={`list-${blocks.length}`}>{items}</Tag>)
    items = []
    listTag = null
  }

  /** Troca de tipo de lista fecha a lista aberta — `- a` seguido de `1. b`
   * são duas listas, não uma com dois itens de tipos diferentes. */
  const pushItem = (tag: 'ul' | 'ol', node: ReactNode) => {
    if (listTag !== null && listTag !== tag) flush()
    listTag = tag
    items.push(node)
  }

  const lines = markdown.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').trim()

    // Bloco cercado: o conteúdo é literal até a cerca de fechamento. Sem
    // fechamento, vai até o fim do texto em vez de descartar as linhas
    // (edge case da spec).
    if (line.startsWith('```')) {
      const body: string[] = []
      for (index += 1; index < lines.length; index += 1) {
        if ((lines[index] ?? '').trim().startsWith('```')) break
        body.push(lines[index] ?? '')
      }
      flush()
      blocks.push(
        <pre key={`fence-${index}`}>
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }

    if (!line) {
      flush()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const Tag = (heading[1] ?? '').length <= 2 ? 'h4' : 'h5'
      blocks.push(<Tag key={index}>{renderInline(heading[2] ?? '')}</Tag>)
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      flush()
      blocks.push(<blockquote key={index}>{renderInline(quote[1] ?? '')}</blockquote>)
      continue
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      pushItem('ol', <li key={index}>{renderInline(ordered[1] ?? '')}</li>)
      continue
    }

    const item = /^[-*]\s+(.*)$/.exec(line)
    if (item) {
      pushItem('ul', <li key={index}>{renderInline(item[1] ?? '')}</li>)
      continue
    }

    flush()
    blocks.push(<p key={index}>{renderInline(line)}</p>)
  }

  flush()
  return blocks
}
