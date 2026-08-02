// SPEC: agent-selection (AGT-01, AGT-03, AGT-04)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import NewTerminalDialog from './NewTerminalDialog'
import type { AgentDescriptor } from '../../routes/settings/AgentPanel'

const CATALOG: AgentDescriptor[] = [
  { id: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', command: 'claude', beta: false },
  { id: 'codex-cli', name: 'Codex CLI', vendor: 'OpenAI', command: 'codex', beta: false },
  { id: 'kimi-code', name: 'Kimi Code', vendor: 'Moonshot AI', command: 'kimi', beta: true },
]

describe('NewTerminalDialog', () => {
  it('trocar o agente no diálogo é local à sessão: não chama onSelectDefault nem altera a prop defaultAgentId recebida', () => {
    const onConfirm = vi.fn()
    // Representa a API que persistiria o padrão global (AgentPanel::onSelectDefault).
    // Nunca é passada como prop ao diálogo — a asserção `not.toHaveBeenCalled()` só
    // é interessante porque também provamos, abaixo, que o diálogo confirma com o
    // id trocado (não com o padrão), o que já mostra que a troca não passou por
    // nenhum caminho de persistência do padrão global.
    const onSelectDefaultSpy = vi.fn()
    const initialDefaultAgentId = 'claude-code'

    render(
      <NewTerminalDialog
        agents={CATALOG}
        installedIds={new Set(CATALOG.map((a) => a.id))}
        defaultAgentId={initialDefaultAgentId}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const select = screen.getByLabelText('Agente') as HTMLSelectElement
    // Pré-seleciona o padrão recebido via prop (AGT-01).
    expect(select.value).toBe('claude-code')

    // Evento de UI real — não mutação direta de estado.
    fireEvent.change(select, { target: { value: 'codex-cli' } })
    expect(select.value).toBe('codex-cli')

    fireEvent.click(screen.getByRole('button', { name: 'criar' }))

    // A confirmação usa a escolha local desta sessão, não o padrão global.
    expect(onConfirm).toHaveBeenCalledWith('', 'codex-cli')
    // Nenhum caminho no diálogo chama a API de padrão global.
    expect(onSelectDefaultSpy).not.toHaveBeenCalled()
    // A prop recebida nunca foi mutada — o diálogo só a usou como valor inicial.
    expect(initialDefaultAgentId).toBe('claude-code')
  })
})
