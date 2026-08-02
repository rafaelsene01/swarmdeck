// SPEC: agent-selection (AGT-01, AGT-03, AGT-04)

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AgentPanel, { type AgentDescriptor } from './AgentPanel'

const CATALOG: AgentDescriptor[] = [
  { id: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', command: 'claude', beta: false },
  { id: 'codex-cli', name: 'Codex CLI', vendor: 'OpenAI', command: 'codex', beta: false },
  {
    id: 'antigravity-cli',
    name: 'Antigravity CLI',
    vendor: 'Google',
    command: 'antigravity',
    beta: false,
  },
  { id: 'opencode', name: 'opencode', vendor: 'SST', command: 'opencode', beta: false },
  { id: 'kimi-code', name: 'Kimi Code', vendor: 'Moonshot AI', command: 'kimi', beta: true },
]

describe('AgentPanel', () => {
  it('renderiza os 5 agentes do catálogo recebido via props', () => {
    render(
      <AgentPanel
        agents={CATALOG}
        installedIds={new Set(CATALOG.map((a) => a.id))}
        defaultAgentId="claude-code"
        onSelectDefault={vi.fn()}
      />,
    )

    for (const agent of CATALOG) {
      expect(screen.getByText(agent.name)).toBeInTheDocument()
      expect(screen.getByText(agent.vendor)).toBeInTheDocument()
    }
  })

  it('mostra o selo de beta só no agente com beta: true', () => {
    render(
      <AgentPanel
        agents={CATALOG}
        installedIds={new Set(CATALOG.map((a) => a.id))}
        defaultAgentId={null}
        onSelectDefault={vi.fn()}
      />,
    )

    const badges = screen.getAllByText('beta')
    expect(badges).toHaveLength(1)

    const kimiCard = screen.getByText('Kimi Code').closest('button')
    expect(kimiCard).not.toBeNull()
    expect(kimiCard).toContainElement(badges[0] ?? null)

    for (const agent of CATALOG.filter((a) => !a.beta)) {
      const card = screen.getByText(agent.name).closest('button')
      expect(card).not.toBeNull()
      expect(card?.querySelector('.agent-panel__beta-badge')).toBeNull()
    }
  })

  it('marca visualmente o agente não instalado e explica o motivo', () => {
    const installedIds = new Set(CATALOG.filter((a) => a.id !== 'opencode').map((a) => a.id))

    render(
      <AgentPanel
        agents={CATALOG}
        installedIds={installedIds}
        defaultAgentId={null}
        onSelectDefault={vi.fn()}
      />,
    )

    const notInstalledCard = screen.getByText('opencode').closest('button')
    expect(notInstalledCard).not.toBeNull()
    expect(notInstalledCard).toHaveAttribute('data-installed', 'false')
    expect(notInstalledCard).toBeDisabled()
    expect(notInstalledCard).toHaveTextContent('Não encontrado no PATH')

    const installedCard = screen.getByText('Claude Code').closest('button')
    expect(installedCard).toHaveAttribute('data-installed', 'true')
    expect(installedCard).not.toHaveTextContent('Não encontrado no PATH')
  })
})
