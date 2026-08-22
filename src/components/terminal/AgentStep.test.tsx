// SPEC: projects (PROJ-13, PROJ-21), providers-panel (PROV-14, PROV-15, PROV-16)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AgentStep from './AgentStep'
import type { AgentDescriptor } from '../../types/agents'

const CATALOG: AgentDescriptor[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendor: 'Anthropic',
    command: 'claude',
    beta: false,
    // PERM-03: a lista que `agent_catalog` devolve para o Claude.
    permissionModes: ['manual', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions'],
  },
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
      enabledIds={new Set(CATALOG.map((a) => a.id))}
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

const plainButton = () => screen.getByRole('button', { name: /^Terminal$/ })

describe('AgentStep', () => {
  // SPEC: providers-panel (PROV-14) — encontrado no terminal e habilitado.
  it('libera todo provedor habilitado e instalado, não só o Claude', () => {
    renderStep()

    for (const agent of CATALOG) {
      expect(screen.getByRole('button', { name: agent.name })).toBeEnabled()
    }
  })

  // SPEC: providers-panel (PROV-15) — desligado em Configurações fica cinza
  // mesmo com o CLI instalado, e a legenda diz o motivo.
  it('desabilita o provedor instalado que está desligado em Configurações', () => {
    renderStep({ enabledIds: new Set(['claude-code']) })

    expect(screen.getByRole('button', { name: 'Claude Code' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Codex CLI' })).toBeDisabled()

    expect(screen.getByRole('button', { name: 'Codex CLI' })).toHaveAttribute(
      'title',
      'Codex CLI · desabilitado em Configurações › Provedores',
    )
  })

  // SPEC: providers-panel (PROV-16) — o shell puro não depende de provedor.
  it('mantém o ladrilho Terminal habilitado sem nenhum provedor habilitado', () => {
    renderStep({ enabledIds: new Set<string>() })

    expect(plainButton()).toBeEnabled()
    for (const agent of CATALOG) {
      expect(screen.getByRole('button', { name: agent.name })).toBeDisabled()
    }
  })


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
    renderStep({ installedIds: new Set<string>(), onSelectAgent })

    const claude = screen.getByRole('button', { name: 'Claude Code' })
    expect(claude).toBeDisabled()

    fireEvent.click(claude)

    expect(onSelectAgent).not.toHaveBeenCalled()
  })

  it('clicar num agente habilitado chama onSelectAgent com o id dele', () => {
    const onSelectAgent = vi.fn()
    renderStep({ onSelectAgent })

    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }))

    expect(onSelectAgent).toHaveBeenCalledWith('claude-code')
  })

  // SPEC: providers-panel (PROV-15) — AD-036: era "só Claude é escolhível",
  // com a lista fixa `SELECTABLE`. Agora quem decide é o switch: clicar num
  // ladrilho desligado não seleciona nada.
  it('clicar num provedor desabilitado em Configurações não seleciona nada', () => {
    const onSelectAgent = vi.fn()
    renderStep({ onSelectAgent, enabledIds: new Set(['claude-code']) })

    fireEvent.click(screen.getByRole('button', { name: 'Codex CLI' }))

    expect(onSelectAgent).not.toHaveBeenCalled()
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
    const swatch = screen.getByTestId('agent-step-swatch')
    expect(swatch.style.backgroundColor).toBe('rgb(239, 68, 68)')
    expect(swatch).toHaveTextContent('A')
  })

  it('"Terminal" chama onSelectAgent com null e nunca desabilita (P1 AC20)', () => {
    const onSelectAgent = vi.fn()
    renderStep({ installedIds: new Set<string>(), onSelectAgent })

    const plain = plainButton()
    expect(plain).toBeEnabled()

    fireEvent.click(plain)

    expect(onSelectAgent).toHaveBeenCalledWith(null)
  })

  it('selectedAgentId nulo marca "Terminal" e nenhum agente (P1 AC20)', () => {
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

// SPEC: agent-permission-mode (PERM-05, PERM-06) — o seletor de modo, e o
// hover que descreve cada um.
describe('AgentStep — modo de permissão (PERM-05, PERM-06)', () => {
  const modeButtons = () => [
    ...(document.querySelectorAll('.agent-step__mode') as NodeListOf<HTMLButtonElement>),
  ]

  it('mostra um botão por modo declarado pelo agente selecionado, na ordem do catálogo', () => {
    renderStep({ permissionMode: 'auto' })

    expect(modeButtons().map((b) => b.textContent)).toEqual([
      'Manual',
      'Plano',
      'Aceitar edições',
      'Automático',
      'Não perguntar',
      'Sem verificação',
    ])
  })

  it('o modo escolhido é o único marcado', () => {
    renderStep({ permissionMode: 'auto' })

    expect(screen.getByRole('button', { name: 'Automático' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Manual' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('cada botão descreve no hover o que aquele modo faz (PERM-06)', () => {
    renderStep({ permissionMode: 'auto' })

    for (const button of modeButtons()) {
      const title = button.getAttribute('title')
      expect(title).toBeTruthy()
      expect(title!.length).toBeGreaterThan(20)
    }

    expect(screen.getByRole('button', { name: 'Sem verificação' })).toHaveAttribute(
      'title',
      expect.stringContaining('contêineres e VMs isolados'),
    )
  })

  it('clicar num modo avisa quem monta o passo', () => {
    const onSelectPermissionMode = vi.fn()
    renderStep({ permissionMode: 'auto', onSelectPermissionMode })

    fireEvent.click(screen.getByRole('button', { name: 'Plano' }))

    expect(onSelectPermissionMode).toHaveBeenCalledWith('plan')
  })

  it('agente sem modos declarados não mostra o seletor', () => {
    renderStep({ selectedAgentId: 'codex-cli', permissionMode: 'auto' })

    expect(modeButtons()).toHaveLength(0)
    expect(screen.queryByRole('group', { name: 'Modo de permissão' })).not.toBeInTheDocument()
  })

  it('terminal limpo (sem agente) não mostra o seletor', () => {
    renderStep({ selectedAgentId: null, permissionMode: 'auto' })

    expect(modeButtons()).toHaveLength(0)
  })

  it('passar o mouse por outro agente não troca a lista de modos', () => {
    renderStep({ permissionMode: 'auto' })

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Codex CLI' }))

    expect(modeButtons()).toHaveLength(6)
  })
})
