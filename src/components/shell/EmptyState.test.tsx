// SPEC: shell-chrome (EMPTY-05, EMPTY-06)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import EmptyState from './EmptyState'

describe('EmptyState', () => {
  it('renders icon, heading, body, CTA, and the Ctrl+T hint row (EMPTY-05)', () => {
    const { container } = render(<EmptyState onCreateTerminal={vi.fn()} />)

    expect(container.querySelector('svg.lucide')).toBeInTheDocument()
    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
    expect(
      screen.getByText('Create a terminal to start working with your AI agents'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Create Terminal' })).toBeInTheDocument()
    expect(screen.getByText('Ctrl')).toBeInTheDocument()
    expect(screen.getByText('T')).toBeInTheDocument()
    expect(screen.getByText('to create quickly')).toBeInTheDocument()
  })

  it('calls onCreateTerminal exactly once when "+ Create Terminal" is clicked (EMPTY-06)', () => {
    const onCreateTerminal = vi.fn()
    render(<EmptyState onCreateTerminal={onCreateTerminal} />)

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))

    expect(onCreateTerminal).toHaveBeenCalledTimes(1)
  })
})
