// SPEC: settings-shell (SET-02, SET-03, SET-04, SET-05, SET-06, SET-07, SET-08, SET-09, SET-10), quota-indicator (QUOTA-08, QUOTA-09, QUOTA-10)

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { CircleDot, Download, FolderOpen, SlidersHorizontal, Users, X } from 'lucide-react'
import AgentPanel, { type AgentDescriptor } from './AgentPanel'
import GeneralPanel, { type QuotaPrefs } from './GeneralPanel'
import ProjectsPanel, { type ProjectRow } from './ProjectsPanel'
import StatusesPanel, { type StatusRow } from './StatusesPanel'
import UpdateSettings, { type CheckState } from '../../components/settings/UpdateSettings'
import packageJson from '../../../package.json'

type SectionId = 'general' | 'agents' | 'projects' | 'statuses' | 'updates'

const DEFAULT_QUOTA_PREFS: QuotaPrefs = { enabled: true, window: 'both' }

// SET-07: ícone por seção — nenhuma escolha específica foi pedida, reaproveita
// `lucide-react` (já instalado, mesmo padrão de `Header.tsx`).
// QUOTA-08: "Geral" é o primeiro item — a spec pede que ela seja a seção
// padrão da janela.
const SECTIONS: ReadonlyArray<{ id: SectionId; label: string; icon: typeof Users }> = [
  { id: 'general', label: 'Geral', icon: SlidersHorizontal },
  { id: 'agents', label: 'Agentes', icon: Users },
  { id: 'projects', label: 'Projetos', icon: FolderOpen },
  { id: 'statuses', label: 'Status de terminal', icon: CircleDot },
  { id: 'updates', label: 'Atualizações', icon: Download },
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
  const [section, setSection] = useState<SectionId>('general')

  // Geral (QUOTA-09/10): carrega ao abrir a seção; falha de `invoke` mantém
  // o default local em vez de travar a seção — mesmo tratamento do bloco de
  // Atualizações abaixo (SET-09).
  const [quotaPrefs, setQuotaPrefs] = useState<QuotaPrefs>(DEFAULT_QUOTA_PREFS)

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
  // `statuses` acima). `autoCheckEnabled` (SET-09/SET-10) carrega e persiste
  // de verdade via `update_auto_check_get`/`update_auto_check_set`
  // (`release-distribution/01-auto-check-toggle-commands`) — o `true` aqui
  // é só o valor inicial até a resposta chegar.
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

  // SET-09: carrega o valor real de `auto_check` quando a seção Atualizações
  // é aberta. Falha de `invoke` mantém o padrão atual do componente (`true`)
  // em vez de travar a seção (edge case da spec).
  useEffect(() => {
    if (section !== 'updates') return
    let cancelled = false
    invoke<boolean>('update_auto_check_get').then(
      (value) => {
        if (!cancelled) setAutoCheckEnabled(value)
      },
      () => {
        /* mantém o valor padrão atual — edge case da spec */
      },
    )
    return () => {
      cancelled = true
    }
  }, [section])

  // SET-10: alternar o toggle persiste de verdade.
  const handleToggleAutoCheck = (enabled: boolean) => {
    setAutoCheckEnabled(enabled)
    void invoke('update_auto_check_set', { enabled })
  }

  // QUOTA-09/10: carrega ao abrir a seção "Geral", mesmo padrão do bloco de
  // Atualizações acima — falha mantém `DEFAULT_QUOTA_PREFS` em vez de
  // travar a seção.
  useEffect(() => {
    if (section !== 'general') return
    let cancelled = false
    invoke<QuotaPrefs>('quota_prefs_get').then(
      (prefs) => {
        if (!cancelled) setQuotaPrefs(prefs)
      },
      () => {
        /* mantém o default local — edge case da spec */
      },
    )
    return () => {
      cancelled = true
    }
  }, [section])

  // QUOTA-09/10: cada mudança persiste de imediato — `GeneralPanel` é
  // apresentacional e não chama `invoke` sozinho.
  const handleChangeQuotaPrefs = (next: QuotaPrefs) => {
    setQuotaPrefs(next)
    void invoke('quota_prefs_set', { prefs: next })
  }

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

  // SET-06: trilho "Configurações › [Seção ativa]".
  const activeSection = SECTIONS.find((item) => item.id === section)

  // SET-04/SET-05: X e "Fechar" fecham a janela `settings` de dentro do
  // app — a capability `core:window:allow-close` (T1) autoriza a chamada.
  const handleClose = () => {
    void getCurrentWindow().close()
  }

  return (
    <div className="settings-shell">
      <style>{`
        .settings-shell { display: flex; flex-direction: column; height: 100%; }
        .settings-shell__body { display: flex; flex: 1 1 auto; min-height: 0; }
        .settings-shell__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid #222;
        }
        .settings-shell__breadcrumb { font-size: 0.9rem; opacity: 0.8; }
        .settings-shell__close {
          padding: 0.25rem;
          border: none;
          background: transparent;
          color: inherit;
          cursor: pointer;
          border-radius: 6px;
        }
        .settings-shell__close:hover { background: rgba(255, 255, 255, 0.06); }
        .settings-shell__footer {
          display: flex;
          justify-content: flex-end;
          padding: 0.75rem 1rem;
          border-top: 1px solid #222;
        }
        .settings-shell__footer-close {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          border: 1px solid #333;
          background: transparent;
          color: inherit;
          cursor: pointer;
        }
        .settings-shell__footer-close:hover { background: rgba(255, 255, 255, 0.06); }
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
          display: flex;
          align-items: center;
          gap: 0.5rem;
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

      <div className="settings-shell__header">
        <span className="settings-shell__breadcrumb">Configurações › {activeSection?.label}</span>
        <button
          type="button"
          className="settings-shell__close"
          aria-label="Fechar Configurações"
          onClick={handleClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="settings-shell__body">
        <nav className="settings-shell__nav" aria-label="Seções de Configurações">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="settings-shell__nav-item"
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => setSection(item.id)}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-shell__content">
          {section === 'general' && (
            <GeneralPanel prefs={quotaPrefs} onChange={handleChangeQuotaPrefs} />
          )}

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
              onToggleAutoCheck={handleToggleAutoCheck}
              onCheckNow={handleCheckNow}
            />
          )}
        </div>
      </div>

      <div className="settings-shell__footer">
        <button type="button" className="settings-shell__footer-close" onClick={handleClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}
