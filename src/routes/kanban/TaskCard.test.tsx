// SPEC: task-kanban (KAN-03)

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaskCard, { truncateDescription, DESCRIPTION_MAX_LENGTH } from './TaskCard'
import type { Task } from '../../types/tasks'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 7,
    title: 'Tarefa de teste',
    description: null,
    plan: null,
    implementation: null,
    status: 'pending',
    project: { id: 'p1', name: 'SwarmDeck', color: '#f5b700' },
    terminalId: null,
    terminalAlive: false,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  }
}

describe('truncateDescription', () => {
  it('mantém descrições curtas intactas', () => {
    expect(truncateDescription('descrição curta')).toBe('descrição curta')
  })

  it('trunca descrições longas com reticências no limite', () => {
    const long = 'a'.repeat(DESCRIPTION_MAX_LENGTH + 50)

    const result = truncateDescription(long)

    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThan(long.length)
    expect(result.startsWith('a'.repeat(DESCRIPTION_MAX_LENGTH))).toBe(true)
  })

  it('descrição nula vira string vazia', () => {
    expect(truncateDescription(null)).toBe('')
  })
})

describe('TaskCard', () => {
  it('quebra o título em até 3 linhas e trunca, preservando o texto inteiro no DOM', () => {
    const longTitle =
      'Este é um título muito longo que deveria quebrar em várias linhas dentro do card ' +
      'e ser cortado com reticências depois da terceira linha, nunca escondendo o texto do DOM'
    const task = makeTask({ title: longTitle })

    render(<TaskCard task={task} />)

    const titleEl = screen.getByText(longTitle)
    expect(titleEl).toBeInTheDocument()
    // `WebkitBoxOrient` não é reconhecido pelo CSSOM do jsdom (fica de fora
    // do atributo `style` serializado mesmo quando setado) — verificamos o
    // que o ambiente de teste realmente reflete; o componente ainda define
    // as três propriedades, exigidas juntas em navegadores reais para o
    // clamp funcionar.
    expect(titleEl).toHaveStyle({ display: '-webkit-box', overflow: 'hidden' })
    expect(titleEl.style.webkitLineClamp).toBe('3')
  })

  it('trunca a descrição que excede o espaço, com reticências e texto completo no title', () => {
    const longDescription = 'x'.repeat(DESCRIPTION_MAX_LENGTH + 80)
    const task = makeTask({ description: longDescription })

    render(<TaskCard task={task} />)

    const descriptionEl = screen.getByText((_, element) =>
      element?.className === 'task-card__description',
    )
    expect(descriptionEl.textContent?.endsWith('…')).toBe(true)
    expect(descriptionEl.textContent?.length).toBeLessThan(longDescription.length)
    expect(descriptionEl).toHaveAttribute('title', longDescription)
  })
})
