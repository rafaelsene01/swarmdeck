// SPEC: agent-selection (AGT-01, AGT-03, AGT-04), multi-terminal (TERM-10, TERM-11)

import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
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
 *
 * O campo "Diretório" é somente-leitura (TERM-10 AC3): a única forma de
 * preenchê-lo é o seletor nativo de pastas do SO, aberto por "buscar pasta".
 * Cancelar o seletor (`open()` resolve `null`) limpa `cwd` (TERM-10 AC4), e
 * "criar" fica desabilitado enquanto `cwd` estiver vazio (TERM-10 AC5). O
 * seletor abre no "último diretório usado" (TERM-11): buscado ao montar via
 * `terminal_picker_last_dir` e atualizado via `terminal_picker_set_last_dir`
 * após cada seleção bem-sucedida.
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
  const [lastDir, setLastDir] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void invoke<string | null>('terminal_picker_last_dir').then((path) => {
      if (!cancelled) {
        setLastDir(path)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleBrowse = async () => {
    const selected = await open({ directory: true, defaultPath: lastDir ?? undefined })

    if (selected === null) {
      setCwd('')
      return
    }

    const path = Array.isArray(selected) ? selected[0] : selected
    setCwd(path)
    setLastDir(path)
    void invoke('terminal_picker_set_last_dir', { path })
  }

  const handleConfirm = () => {
    onConfirm(cwd, selectedAgentId)
  }

  return (
    <div className="new-terminal-dialog" role="dialog" aria-label="novo terminal">
      <label htmlFor="new-terminal-cwd">Diretório</label>
      <input id="new-terminal-cwd" type="text" value={cwd} readOnly />
      <button type="button" onClick={handleBrowse}>
        buscar pasta
      </button>

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
        <button type="button" onClick={handleConfirm} disabled={cwd === ''}>
          criar
        </button>
      </div>
    </div>
  )
}
