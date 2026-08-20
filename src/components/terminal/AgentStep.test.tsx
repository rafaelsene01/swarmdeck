// SPEC: projects (PROJ-13, PROJ-21)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AgentStep from './AgentStep'
import type { AgentDescriptor } from '../../routes/settings/AgentPanel'

const CATALOG: AgentDescriptor[] = [
  { id: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', command: 'claude', beta: false },
  { id: 'codex-cli', name: 'Codex CLI', vendor: 'OpenAI', command: 'codex', beta: false },
  { id: 'opencode', name: 'opencode', vendor: 'opencode', command: 'opencode', beta: false },
]

const SELECTION = { name: 'alpha', path: '/home/user/dev/alpha', color: '#ef4444' }

function renderStep(props: Partial<Parameters<typeof AgentStep>[0]> = {}) {
  return render(
    <AgentStep
      selection={SELECTION}
      agents={CATALOG}
      installedIds={new Set(CATALOG.map((a) => a.id))}
      selectedAgentId="claude-code"
      onSelectAgent={vi.fn()}
      onBack={vi.fn()}
      onConfirm={vi.fn()}
      {...props}
    />,
  )
}

const agentButtons = () =>
  screen
    .getAllByRole('button')
    .filter(
      (b) =>
        b.classList.contains('agent-step__agent') && !b.classList.contains('agent-step__plain'),
    )

const plainButton = () => screen.getByRole('button', { name: /Terminal limpo/ })

describe('AgentStep', () => {
  it('os agentes aparecem na ordem recebida, com o padrão pré-selecionado (P1 AC7)', () => {
    renderStep()

    // Ladrilhos são só ícone (P1 AC7): o nome vive em `aria-label`.
    expect(agentButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Claude Code',
      'Codex CLI',
      'opencode',
    ])
    expect(screen.getByRole('button', { name: 'Claude Code' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Codex CLI' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('agente não instalado fica desabilitado e clicar nele não seleciona nada (P1 AC7)', () => {
    const onSelectAgent = vi.fn()
    renderStep({ installedIds: new Set(['claude-code']), onSelectAgent })

    const codex = screen.getByRole('button', { name: 'Codex CLI' })
    expect(codex).toBeDisabled()

    fireEvent.click(codex)

    expect(onSelectAgent).not.toHaveBeenCalled()
  })

  it('clicar num agente instalado chama onSelectAgent com o id dele', () => {
    const onSelectAgent = vi.fn()
    renderStep({ onSelectAgent })

    fireEvent.click(screen.getByRole('button', { name: 'Codex CLI' }))

    expect(onSelectAgent).toHaveBeenCalledWith('codex-cli')
  })

  it('"Voltar" chama onBack (P1 AC6)', () => {
    const onBack = vi.fn()
    renderStep({ onBack })

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('o cartão mostra nome, caminho e cor do projeto escolhido (P1 AC5)', () => {
    renderStep()

    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('/home/user/dev/alpha')).toBeInTheDocument()
    expect(screen.getByTestId('agent-step-swatch').style.backgroundColor).toBe('rgb(239, 68, 68)')
  })

  it('"Terminal limpo" chama onSelectAgent com null e nunca desabilita (P1 AC20)', () => {
    const onSelectAgent = vi.fn()
    renderStep({ installedIds: new Set<string>(), onSelectAgent })

    const plain = plainButton()
    expect(plain).toBeEnabled()

    fireEvent.click(plain)

    expect(onSelectAgent).toHaveBeenCalledWith(null)
  })

  it('selectedAgentId nulo marca "Terminal limpo" e nenhum agente (P1 AC20)', () => {
    renderStep({ selectedAgentId: null })

    expect(plainButton()).toHaveAttribute('aria-pressed', 'true')
    expect(agentButtons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('com zero agentes instalados, "Nova sessão" continua habilitada (edge case)', () => {
    const onConfirm = vi.fn()
    renderStep({ installedIds: new Set<string>(), onConfirm })

    const confirm = screen.getByRole('button', { name: 'Nova sessão' })
    expect(confirm).toBeEnabled()

    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
