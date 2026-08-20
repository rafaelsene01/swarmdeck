// SPEC: agent-selection (AGT-01, AGT-03, AGT-04)

/**
 * Espelha `AgentDescriptor` de `src-tauri/src/agents/catalog.rs` (T1) — o
 * catálogo é a fonte única de verdade, este tipo só descreve a forma que
 * chega ao frontend via `invoke()` (buscado pelo componente pai, fora do
 * escopo desta tarefa).
 */
export interface AgentDescriptor {
  id: string
  name: string
  vendor: string
  command: string
  beta: boolean
  /**
   * SPEC: agent-permission-mode (PERM-03) — modos que o CLI deste agente
   * aceita em `--permission-mode`, na ordem de exibição. Vetor vazio (ou
   * ausente) = o CLI não expõe esse controle, e o passo AGENT não mostra o
   * seletor. Vem de `agent_catalog`, que o deriva de `permission_mode_flag`
   * no catálogo Rust — o frontend nunca decide por id.
   */
  permissionModes?: string[]
}

export interface AgentPanelProps {
  agents: AgentDescriptor[]
  /** Ids presentes em `AgentStatus::installed === true` (T1/T2). */
  installedIds: Set<string>
  defaultAgentId: string | null
  onSelectDefault: (id: string) => void
}

/**
 * Cards selecionáveis do catálogo de agentes — puramente apresentacional,
 * no mesmo padrão de `TerminalHeader.tsx`: recebe os dados prontos via
 * props, não busca nada sozinho. Clicar um card instalado define o padrão
 * global (AGT-01); um card não instalado é marcado e não é clicável
 * (AGT-04).
 */
export default function AgentPanel({
  agents,
  installedIds,
  defaultAgentId,
  onSelectDefault,
}: AgentPanelProps) {
  return (
    <div className="agent-panel">
      {agents.map((agent) => {
        const installed = installedIds.has(agent.id)
        const isDefault = agent.id === defaultAgentId

        return (
          <button
            key={agent.id}
            type="button"
            className="agent-panel__card"
            data-installed={installed}
            data-default={isDefault}
            aria-pressed={isDefault}
            disabled={!installed}
            onClick={() => {
              if (installed) onSelectDefault(agent.id)
            }}
          >
            <span className="agent-panel__name">{agent.name}</span>
            <span className="agent-panel__vendor">{agent.vendor}</span>
            {agent.beta && <span className="agent-panel__beta-badge">beta</span>}
            {!installed && (
              <span className="agent-panel__not-installed">Não encontrado no PATH</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
