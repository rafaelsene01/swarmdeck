// SPEC: terminal-statuses (STAT-05, STAT-06)

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ActivityLog, { type ActivityEntry } from './ActivityLog'

const ENTRIES: ActivityEntry[] = [
  { activity: 'Recording the screen capture', createdAt: 1_700_000_000 },
  { activity: 'Editing the WordPress embed', createdAt: 1_700_000_300 },
  { activity: 'Adding captions and music', createdAt: 1_700_000_600 },
]

describe('ActivityLog', () => {
  it('expõe a atividade mais recente via title, para o hover do terminal mostrá-la', () => {
    const { container } = render(<ActivityLog entries={ENTRIES} />)

    // As entradas chegam em ordem cronológica direta (mais antiga primeiro);
    // a mais recente é a de maior createdAt — "Adding captions and music".
    expect(container.firstChild).toHaveAttribute('title', 'Adding captions and music')
  })

  it('lista as atividades em ordem cronológica inversa, com horário', () => {
    render(<ActivityLog entries={ENTRIES} />)

    const items = screen.getAllByRole('listitem').map((item) => item.textContent)

    // Mais recente primeiro.
    expect(items[0]).toContain('Adding captions and music')
    expect(items[1]).toContain('Editing the WordPress embed')
    expect(items[2]).toContain('Recording the screen capture')

    // Cada item mostra um horário no formato HH:MM:SS.
    for (const text of items) {
      expect(text).toMatch(/\d{2}:\d{2}:\d{2}/)
    }
  })
})
