// SPEC: settings-shell (SET-02)

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import AgentPanel, { type AgentDescriptor } from './AgentPanel'
import ProjectsPanel, { type ProjectRow } from './ProjectsPanel'
import StatusesPanel, { type StatusRow } from './StatusesPanel'
import UpdateSettings, { type CheckState } from '../../components/settings/UpdateSettings'
import packageJson from '../../../package.json'

type SectionId = 'agents' | 'projects' | 'statuses' | 'updates'

const SECTIONS: ReadonlyArray<{ id: SectionId; label: string }> = [
  { id: 'agents', label: 'Agentes' },
  { id: 'projects', label: 'Projetos' },
  { id: 'statuses', label: 'Status de terminal' },
  { id: 'updates', label: 'Atualizações' },
]

/** Espelha `AgentCatalogEntry` de `src-tauri/src/commands/agents.rs` (T5 de
 * `agent-selection`), já registrado no `invoke_handler!` — mesma forma que
 * `App.tsx` já consome para `NewTerminalDialog`. */
interface AgentCatalogEntry extends AgentDescriptor {
  installed: boolean
}

/** Espelha `Project` de `src-tauri/src/projects/service.rs` tal como sai na
 * borda: essa struct não tem `#[serde(rename_all = "camelCase")]`, então o
 * campo chega `last_used`, não `lastUsed` (diferente de `AgentCatalogEntry`
 * acima). */
interface ProjectRecord {
  id: string
  name: string
  path: string
  color: string
  last_used: number | null
}

/** Forma que `update_check` devolve (`UpdateInfo` em
 * `src-tauri/src/update/check.rs`) quando há atualização — `null` quando o
 * app já está na versão mais recente ou `auto_check` está desligado. */
interface UpdateCheckResult {
  version: string
}

export default function SettingsShell() {
  const [section, setSection] = useState<SectionId>('agents')

  // Agentes (AGT-01/03/04): dado real, via `agent_catalog`/`agent_default`,
  // já registrados no `invoke_handler!` — mesmo padrão de busca do `App.tsx`.
  const [agents, setAgents] = useState<AgentDescriptor[]>([])
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null)

  // Projetos (PROJ-05): dado real, via `project_list`, já registrado.
  const [projects, setProjects] = useState<ProjectRow[]>([])

  // Status de terminal (STAT-02/03): NENHUM `#[tauri::command]` expõe o CRUD
  // de `status_catalog` (create/update/disable/delete/reorder/
  // restore_defaults, todos em `src-tauri/src/terminal/status_catalog.rs`)
  // ao frontend — nenhum está no `invoke_handler!` de `lib.rs`. Wirar isso
  // exigiria um `commands/statuses.rs` novo mais uma linha em `lib.rs`,
  // fora da lista fechada de arquivos desta task (`main.tsx` +
  // `SettingsShell.tsx`). Esta seção roda inteira em estado local desta
  // sessão — o painel fica clicável e navegável (o que esta task promete),
  // mas nada aqui persiste no banco. Ver DESVIO no relatório da task.
  const [statuses, setStatuses] = useState<StatusRow[]>([])

  // Atualizações (REL-32/33/34): `update_check` já está registrado e é
  // reusado como está. `installedVersion` vem do `package.json` (única
  // fonte hoje sem depender de comando novo); `mode` não tem detector
  // exposto ao frontend (fica fixo em `'installed'`, mesma limitação de
  // `statuses` acima); `autoCheckEnabled` reflete só o padrão documentado
  // em `db::auto_check`/`release-distribution/tasks.md` T13 ("`auto_check`
  // nasce ligado") — `db::auto_check`/`set_auto_check`
  // (`src-tauri/src/db/settings.rs`) existem mas não têm invólucro
  // `#[tauri::command]`, então o toggle aqui também é só local à sessão.
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true)
  const [checkState, setCheckState] = useState<CheckState>({ status: 'idle' })

  useEffect(() => {
    let cancelled = false

    void invoke<AgentCatalogEntry[]>('agent_catalog').then((entries) => {
      if (cancelled) return
      setAgents(entries.map(({ installed: _installed, ...agent }) => agent))
      setInstalledIds(new Set(entries.filter((entry) => entry.installed).map((entry) => entry.id)))
    })

    void invoke<string | null>('agent_default').then((id) => {
      if (!cancelled) setDefaultAgentId(id)
    })

    void invoke<ProjectRecord[]>('project_list').then((records) => {
      if (cancelled) return
      setProjects(
        records.map((record) => ({
          id: record.id,
          name: record.name,
          path: record.path,
          color: record.color,
          lastUsed: record.last_used,
          // `project_list` não junta contagem de tarefas — nenhum comando
          // expõe isso hoje (mesma limitação documentada acima).
          taskCount: 0,
        })),
      )
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleCheckNow = () => {
    setCheckState({ status: 'checking' })
    void invoke<UpdateCheckResult | null>('update_check')
      .then((info) => {
        setCheckState(info ? { status: 'available', version: info.version } : { status: 'up_to_date' })
      })
      .catch((error: unknown) => {
        setCheckState({ status: 'error', message: String(error) })
      })
  }

  const handleCreateStatus = (label: string, instruction: string) => {
    setStatuses((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-${prev.length}`,
        label,
        color: '#888888',
        instruction,
        sortOrder: prev.length,
        enabled: true,
        isDefault: false,
      },
    ])
  }

  const handleEditStatus = (
    id: string,
    changes: { label: string; color: string; instruction: string },
  ) => {
    setStatuses((prev) => prev.map((status) => (status.id === id ? { ...status, ...changes } : status)))
  }

  const handleToggleStatus = (id: string, enabled: boolean) => {
    setStatuses((prev) => prev.map((status) => (status.id === id ? { ...status, enabled } : status)))
  }

  const handleDeleteStatus = (id: string) => {
    setStatuses((prev) => prev.filter((status) => status.id !== id))
  }

  const handleReorderStatuses = (orderedIds: string[]) => {
    setStatuses((prev) => {
      const byId = new Map(prev.map((status) => [status.id, status]))
      return orderedIds
        .map((id, index) => {
          const status = byId.get(id)
          return status ? { ...status, sortOrder: index } : undefined
        })
        .filter((status): status is StatusRow => status !== undefined)
    })
  }

  const handleRestoreDefaults = () => {
    setStatuses([])
  }

  return (
    <div className="settings-shell">
      <style>{`
        .settings-shell { display: flex; height: 100%; }
        .settings-shell__nav {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 180px;
          padding: 1rem 0.5rem;
          border-right: 1px solid #222;
          flex: 0 0 auto;
        }
        .settings-shell__nav-item {
          text-align: left;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: inherit;
          cursor: pointer;
        }
        .settings-shell__nav-item:hover { background: rgba(255, 255, 255, 0.06); }
        .settings-shell__nav-item[aria-current='page'] {
          background: rgba(245, 183, 0, 0.18);
          font-weight: 600;
        }
        .settings-shell__content { flex: 1 1 auto; min-width: 0; overflow: auto; padding: 1rem; }
      `}</style>

      <nav className="settings-shell__nav" aria-label="Seções de Configurações">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="settings-shell__nav-item"
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="settings-shell__content">
        {section === 'agents' && (
          <AgentPanel
            agents={agents}
            installedIds={installedIds}
            defaultAgentId={defaultAgentId}
            onSelectDefault={setDefaultAgentId}
          />
        )}

        {section === 'projects' && <ProjectsPanel projects={projects} />}

        {section === 'statuses' && (
          <StatusesPanel
            statuses={statuses}
            terminalCountByStatus={{}}
            onCreate={handleCreateStatus}
            onEdit={handleEditStatus}
            onToggleEnabled={handleToggleStatus}
            onDelete={handleDeleteStatus}
            onReorder={handleReorderStatuses}
            onRestoreDefaults={handleRestoreDefaults}
          />
        )}

        {section === 'updates' && (
          <UpdateSettings
            installedVersion={packageJson.version}
            mode="installed"
            autoCheckEnabled={autoCheckEnabled}
            checkState={checkState}
            onToggleAutoCheck={setAutoCheckEnabled}
            onCheckNow={handleCheckNow}
          />
        )}
      </div>
    </div>
  )
}
