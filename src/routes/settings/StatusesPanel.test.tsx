// SPEC: terminal-statuses (STAT-02, STAT-03)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import StatusesPanel, { type StatusRow } from './StatusesPanel'

const STATUSES: StatusRow[] = [
  {
    id: 'working',
    label: 'Working',
    color: '#22c55e',
    instruction: 'Use when you start working on something.',
    sortOrder: 0,
    enabled: true,
    isDefault: true,
  },
  {
    id: 'needs_input',
    label: 'Needs input',
    color: '#eab308',
    instruction:
      'Use when you stop to ask the user something and are waiting for a reply before continuing further work.',
    sortOrder: 1,
    enabled: true,
    isDefault: true,
  },
  {
    id: 'done',
    label: 'Done',
    color: '#6b7280',
    instruction: 'Use when the work is fully finished.',
    sortOrder: 2,
    enabled: true,
    isDefault: true,
  },
]

function renderPanel(overrides: Partial<Parameters<typeof StatusesPanel>[0]> = {}) {
  const props = {
    statuses: STATUSES,
    terminalCountByStatus: {},
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onToggleEnabled: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
    onRestoreDefaults: vi.fn(),
    ...overrides,
  }
  render(<StatusesPanel {...props} />)
  return props
}

describe('StatusesPanel', () => {
  it('renderiza o catálogo: rótulo, cor, instrução truncada, toggle, editar e excluir por linha', () => {
    renderPanel()

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)

    // rows.toHaveLength(3) above guarantees indices 0-2 exist.
    const workingRow = within(rows[0]!)
    expect(workingRow.getByText('Working')).toBeInTheDocument()
    expect(workingRow.getByRole('checkbox', { name: 'Ativar/desativar Working' })).toBeChecked()
    expect(workingRow.getByRole('button', { name: 'editar' })).toBeInTheDocument()
    expect(workingRow.getByRole('button', { name: 'excluir' })).toBeInTheDocument()

    // Instrução longa truncada: texto exibido é mais curto que o original e termina em "...".
    const needsInputRow = within(rows[1]!)
    const fullInstruction = STATUSES[1]!.instruction
    const shown = needsInputRow.getByTitle(fullInstruction).textContent ?? ''
    expect(shown.length).toBeLessThan(fullInstruction.length)
    expect(shown.endsWith('...')).toBe(true)
  })

  it('arrastar uma linha e soltar sobre outra reordena a lista e persiste via onReorder', () => {
    const props = renderPanel()

    const rowsBefore = screen.getAllByRole('listitem')
    expect(rowsBefore.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Working'),
      expect.stringContaining('Needs input'),
      expect.stringContaining('Done'),
    ])

    // Arrasta "Done" (índice 2) e solta sobre "Working" (índice 0).
    // rowsBefore.map(...) above guarantees indices 0 and 2 exist.
    fireEvent.dragStart(rowsBefore[2]!)
    fireEvent.dragOver(rowsBefore[0]!)
    fireEvent.drop(rowsBefore[0]!)

    expect(props.onReorder).toHaveBeenCalledWith(['done', 'working', 'needs_input'])

    const rowsAfter = screen.getAllByRole('listitem')
    expect(rowsAfter[0]).toHaveTextContent('Done')
    expect(rowsAfter[1]).toHaveTextContent('Working')
    expect(rowsAfter[2]).toHaveTextContent('Needs input')
  })

  it('desmarcar o toggle de uma linha chama onToggleEnabled com false', () => {
    const props = renderPanel()

    const checkbox = screen.getByRole('checkbox', { name: 'Ativar/desativar Working' })
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)

    expect(props.onToggleEnabled).toHaveBeenCalledWith('working', false)
  })

  it('restaurar padrões pede confirmação antes de chamar onRestoreDefaults', () => {
    const props = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'restaurar padrões' }))

    expect(props.onRestoreDefaults).not.toHaveBeenCalled()
    expect(screen.getByText(/restaurar os 4 status padrão/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'confirmar' }))

    expect(props.onRestoreDefaults).toHaveBeenCalledTimes(1)
  })

  it('excluir um status em uso avisa quantos terminais serão afetados antes de confirmar', () => {
    const props = renderPanel({ terminalCountByStatus: { working: 2 } })

    const rows = screen.getAllByRole('listitem')
    // Single status configured (terminalCountByStatus: { working: 2 }), so index 0 exists.
    const workingRow = within(rows[0]!)

    fireEvent.click(workingRow.getByRole('button', { name: 'excluir' }))

    expect(props.onDelete).not.toHaveBeenCalled()
    expect(workingRow.getByText(/2 terminal\(is\)/)).toBeInTheDocument()

    fireEvent.click(workingRow.getByRole('button', { name: 'confirmar' }))

    expect(props.onDelete).toHaveBeenCalledWith('working')
  })
})
