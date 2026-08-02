// SPEC: agent-selection (AGT-01, AGT-03, AGT-04)

import { useState } from 'react'
import type { AgentDescriptor } from '../../routes/settings/AgentPanel'

export interface NewTerminalDialogProps {
  agents: AgentDescriptor[]
  installedIds: Set<string>
  defaultAgentId: string | null
  onConfirm: (cwd: string, agentId: string | null) => void
  onCancel: () => void
}

/**
 * Diálogo de novo terminal — puramente apresentacional (mesmo padrão de
 * `AgentPanel.tsx` / `TerminalHeader.tsx`). Pré-seleciona `defaultAgentId`
 * (AGT-01) mas a troca de agente aqui é local a esta sessão de terminal
 * (AGT-03): fica em `useState`, nunca chama nada que mute o padrão global —
 * a prop `defaultAgentId` não é reescrita, só usada como valor inicial.
 */
export default function NewTerminalDialog({
  agents,
  installedIds,
  defaultAgentId,
  onConfirm,
  onCancel,
}: NewTerminalDialogProps) {
  const [cwd, setCwd] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(defaultAgentId)

  const handleConfirm = () => {
    onConfirm(cwd, selectedAgentId)
  }

  return (
    <div className="new-terminal-dialog" role="dialog" aria-label="novo terminal">
      <label htmlFor="new-terminal-cwd">Diretório</label>
      <input
        id="new-terminal-cwd"
        type="text"
        value={cwd}
        onChange={(event) => setCwd(event.target.value)}
      />

      <label htmlFor="new-terminal-agent">Agente</label>
      <select
        id="new-terminal-agent"
        value={selectedAgentId ?? ''}
        onChange={(event) => setSelectedAgentId(event.target.value || null)}
      >
        {agents.map((agent) => {
          const installed = installedIds.has(agent.id)
          const label = [agent.name, agent.beta ? '(beta)' : null, !installed ? '— não encontrado' : null]
            .filter(Boolean)
            .join(' ')

          return (
            <option key={agent.id} value={agent.id} disabled={!installed}>
              {label}
            </option>
          )
        })}
      </select>

      <div className="new-terminal-dialog__actions">
        <button type="button" onClick={onCancel}>
          cancelar
        </button>
        <button type="button" onClick={handleConfirm}>
          criar
        </button>
      </div>
    </div>
  )
}
