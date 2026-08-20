// SPEC: settings-shell (SET-02, SET-03, SET-04, SET-05, SET-06, SET-07, SET-08, SET-09, SET-10), quota-indicator (QUOTA-08, QUOTA-09, QUOTA-10, QUOTA-31), silent-update (SILENT-09, SILENT-13, SILENT-25, SILENT-32, SILENT-33, SILENT-34, SILENT-37, SILENT-38, SILENT-40, SILENT-42), projects (PROJ-19, PROJ-23, PROJ-24)
// SPEC: wsl-terminal-profile (WSLP-02)

import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getVersion } from '@tauri-apps/api/app'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Download, FolderOpen, SlidersHorizontal, Users, X } from 'lucide-react'
import AgentPanel, { type AgentDescriptor } from './AgentPanel'
import GeneralPanel, { type ProfileEntry, type QuotaPrefs } from './GeneralPanel'
import ProjectsPanel, { countTerminalsByProject, type ProjectRow } from './ProjectsPanel'
import ProjectFormModal, { type ProjectFormValues } from '../../components/project/ProjectFormModal'
import UpdateSettings, { type UpdateState } from '../../components/settings/UpdateSettings'

type SectionId = 'general' | 'agents' | 'projects' | 'updates'

// QUOTA-26: mesma semente da migração 007 — se `quota_prefs_get` falhar, a
// seção ainda abre com a lista de provedores de fábrica.
const DEFAULT_QUOTA_PREFS: QuotaPrefs = {
  enabled: true,
  window: 'both',
  providers: [
    { id: 'claude-code', enabled: true },
    { id: 'codex-cli', enabled: true },
    { id: 'opencode', enabled: true },
  ],
}

// SET-07: ícone por seção — nenhuma escolha específica foi pedida, reaproveita
// `lucide-react` (já instalado, mesmo padrão de `Header.tsx`).
// QUOTA-08: "Geral" é o primeiro item — a spec pede que ela seja a seção
// padrão da janela.
const SECTIONS: ReadonlyArray<{ id: SectionId; label: string; icon: typeof Users }> = [
  { id: 'general', label: 'Geral', icon: SlidersHorizontal },
  { id: 'agents', label: 'Provedores', icon: Users },
  { id: 'projects', label: 'Projetos', icon: FolderOpen },
  { id: 'updates', label: 'Atualizações', icon: Download },
]

/** Espelha `AgentCatalogEntry` de `src-tauri/src/commands/agents.rs` (T5 de
 * `agent-selection`), já registrado no `invoke_handler!` — mesma forma que
 * `App.tsx` já consome para o `PaneWizard`. */
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

/** SPEC: projects (PROJ-23) — recorte de `TabEntry`
 * (`src-tauri/src/terminal/layout.rs`) com o único campo que a contagem usa.
 * O workspace persistido é a fonte que serve às duas montagens do shell: na
 * janela `settings` não existe estado de terminais em memória para consultar.
 * `App.tsx` grava com 500 ms de debounce, então a contagem pode ficar meio
 * segundo atrás do estado vivo (AD-024). */
interface WorkspaceTabCwds {
  terminals: { cwd: string }[]
}

/** Espelha `UpdateStatus` de `src-tauri/src/update/check.rs` — sem
 * `rename_all`, então os campos chegam em snake_case. */
interface UpdateStatusResult {
  current: string
  latest: string | null
  notes: string
  has_update: boolean
  mode: 'installed' | 'portable'
  platform_key: string
}

export interface SettingsShellProps {
  /** SET-01: set when the shell is mounted as an overlay inside the main
   * window (`App.tsx`) — closing then means unmounting the modal, not
   * closing an OS window. Absent when it runs in the `settings` window. */
  onClose?: () => void
}

export default function SettingsShell({ onClose }: SettingsShellProps = {}) {
  const [section, setSection] = useState<SectionId>('general')

  // Geral (QUOTA-09/10): carrega ao abrir a seção; falha de `invoke` mantém
  // o default local em vez de travar a seção — mesmo tratamento do bloco de
  // Atualizações abaixo (SET-09).
  const [quotaPrefs, setQuotaPrefs] = useState<QuotaPrefs>(DEFAULT_QUOTA_PREFS)

  // Perfil de terminal (WSLP-01/02): mesmo tratamento acima — `profiles`
  // nunca vira `null` (o `?? []` absorve um mock/borda que devolva isso),
  // `selectedProfileId` fica `null` de propósito quando não há preferência.
  const [profiles, setProfiles] = useState<ProfileEntry[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  // Agentes (AGT-01/03/04): dado real, via `agent_catalog`/`agent_default`,
  // já registrados no `invoke_handler!` — mesmo padrão de busca do `App.tsx`.
  const [agents, setAgents] = useState<AgentDescriptor[]>([])
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null)

  // Projetos (PROJ-05): dado real, via `project_list`, já registrado.
  const [projects, setProjects] = useState<ProjectRow[]>([])
  /** SPEC: projects (PROJ-19) — o formulário de criação está aberto. Editar
   * saiu da tela com PROJ-20 (AD-024), então o formulário só tem um modo. */
  const [projectFormOpen, setProjectFormOpen] = useState(false)
  const [projectFormError, setProjectFormError] = useState<string | null>(null)
  const [projectDeleteError, setProjectDeleteError] = useState<string | null>(null)
  /** SPEC: projects (PROJ-23) — terminais abertos por projeto. */
  const [terminalCwds, setTerminalCwds] = useState<string[]>([])

  // Atualizações (SILENT-09/13/25): `update_status` sempre consulta ao abrir
  // a seção, independente do toggle de verificação automática abaixo — esse
  // toggle só governa o checador em segundo plano. `autoCheckEnabled`
  // (SET-09/SET-10) carrega e persiste de verdade via
  // `update_auto_check_get`/`update_auto_check_set` — o `true` aqui é só o
  // valor inicial até a resposta chegar.
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true)
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'loading', current: '' })
  // SILENT-42: as notas da release acompanham a versão remota, não o passo do
  // fluxo — guardadas fora de `updateState` para sobreviverem às transições
  // de download e instalação sem serem repetidas em cada variante.
  const [updateNotes, setUpdateNotes] = useState('')
  // SILENT-34: só a consulta acionada pelo botão, não a da abertura da seção.
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  // Preserva a última versão instalada conhecida através de uma falha de
  // `update_status` (SILENT-25) — a versão instalada não muda entre
  // consultas, só a de rede pode falhar.
  const lastKnownVersionRef = useRef('')

  /** SPEC: projects (PROJ-19, PROJ-24) — a lista é relida do backend depois
   * de criar ou excluir: é o backend que canonicaliza caminho e cor. */
  /** SPEC: projects (PROJ-23) — falha de leitura vira lista vazia: uma
   * contagem ausente exibida como 0 é preferível a derrubar o painel, e o
   * botão de excluir destravado é o mesmo estado de "nenhum terminal aberto",
   * que o backend confirma na hora do delete. */
  const loadTerminalCounts = () =>
    invoke<WorkspaceTabCwds[]>('terminal_workspace_get')
      .then((tabs) => setTerminalCwds((tabs ?? []).flatMap((tab) => tab.terminals.map((t) => t.cwd))))
      .catch((error: unknown) => {
        console.error('falha ao ler os terminais abertos', error)
        setTerminalCwds([])
      })

  const loadProjects = () =>
    invoke<ProjectRecord[]>('project_list').then((records) => {
      setProjects(
        records.map((record) => ({
          id: record.id,
          name: record.name,
          path: record.path,
          color: record.color,
          lastUsed: record.last_used,
        })),
      )
    })

  const submitProjectForm = async (values: ProjectFormValues) => {
    try {
      await invoke('project_create_in', {
        name: values.name,
        baseDir: values.baseDir ?? '',
        color: values.color,
        gitInit: values.gitInit ?? false,
      })
      await loadProjects()
      setProjectFormOpen(false)
      setProjectFormError(null)
    } catch (error: unknown) {
      // O formulário continua aberto com a mensagem.
      setProjectFormError(String(error))
    }
  }

  /** SPEC: projects (PROJ-24) — o painel só chama isto depois da confirmação;
   * a lista é relida do backend, não podada localmente. */
  const deleteProject = async (project: ProjectRow) => {
    try {
      await invoke('project_delete', { id: project.id })
      await loadProjects()
      await loadTerminalCounts()
      setProjectDeleteError(null)
    } catch (error: unknown) {
      setProjectDeleteError(String(error))
    }
  }

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

    void loadProjects()
    void loadTerminalCounts()

    // SILENT-33: a versão instalada não depende da rede — `getVersion()` lê o
    // `package_info` do próprio app. Buscada no mount para que a seção
    // "Atualizações" já abra com o número em tela, em vez de esconder tudo
    // atrás do "Verificando…" da consulta ao manifesto.
    void getVersion().then((version) => {
      if (cancelled) return
      lastKnownVersionRef.current = version
      setUpdateState((prev) => (prev.status === 'loading' ? { status: 'loading', current: version } : prev))
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

  // WSLP-01/02: mesmo padrão do bloco de cota acima — carrega ao abrir a
  // seção "Geral", um `invoke` por comando.
  useEffect(() => {
    if (section !== 'general') return
    let cancelled = false
    invoke<ProfileEntry[]>('shell_profiles_list').then((list) => {
      if (!cancelled) setProfiles(list ?? [])
    })
    invoke<string | null>('shell_profile_get').then((id) => {
      if (!cancelled) setSelectedProfileId(id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [section])

  // WSLP-02: otimista — atualiza a tela na hora, mas desfaz se `invoke`
  // rejeitar, para nunca mostrar uma seleção que não foi de fato salva.
  const handleChangeProfile = (id: string) => {
    const previous = selectedProfileId
    setSelectedProfileId(id)
    invoke('shell_profile_set', { id }).catch(() => {
      setSelectedProfileId(previous)
    })
  }

  // SILENT-32: a mesma consulta serve à abertura da seção e ao botão
  // "Buscar atualizações" — um caminho só, para os dois não divergirem.
  // `isCancelled` existe porque o efeito precisa descartar a resposta ao
  // desmontar; o botão passa um cancelamento que nunca dispara.
  const fetchUpdateStatus = useCallback((isCancelled: () => boolean) => {
    return invoke<UpdateStatusResult>('update_status').then(
      (result) => {
        if (isCancelled()) return
        lastKnownVersionRef.current = result.current
        setUpdateNotes(result.notes ?? '')
        setUpdateState(
          result.latest === null
            ? { status: 'unavailable', current: result.current }
            : {
                status: 'ready',
                current: result.current,
                latest: result.latest,
                hasUpdate: result.has_update,
              },
        )
      },
      () => {
        if (isCancelled()) return
        setUpdateState({ status: 'unavailable', current: lastKnownVersionRef.current })
      },
    )
  }, [])

  // SILENT-09/SILENT-25: consulta ao abrir a seção — sempre, mesmo com a
  // verificação automática desligada (a preferência só governa o checador
  // em segundo plano). Falha de rede já chega como `latest: null` no `Ok`
  // (tratada abaixo); só a rejeição do próprio `invoke` (erro de backend)
  // cai no `catch`.
  useEffect(() => {
    if (section !== 'updates') return
    let cancelled = false
    setUpdateState({ status: 'loading', current: lastKnownVersionRef.current })
    void fetchUpdateStatus(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [section, fetchUpdateStatus])

  // SILENT-37: `update_download` emite o progresso a cada ~256 KB. Só o
  // estado `downloading` consome o evento — um evento atrasado que chegue
  // depois do download terminar não pode reabrir a barra.
  useEffect(() => {
    const unlisten = listen<{ downloaded: number; total: number | null }>(
      'update://download-progress',
      ({ payload }) => {
        setUpdateState((prev) =>
          prev.status === 'downloading'
            ? { ...prev, downloaded: payload.downloaded, total: payload.total }
            : prev,
        )
      },
    )
    return () => {
      void unlisten.then((off) => off())
    }
  }, [])

  // SILENT-33/34: a busca sob demanda não volta para `loading` — a versão
  // instalada continua em tela durante a consulta, e só o botão sinaliza o
  // andamento.
  const handleCheck = () => {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    void fetchUpdateStatus(() => false).finally(() => setCheckingUpdate(false))
  }

  // SILENT-02/37: primeiro clique só baixa, com progresso. Nada em disco
  // ainda, e o botão "Instalar" só aparece com os bytes já conferidos.
  const handleDownload = () => {
    if (updateState.status !== 'ready' || !updateState.hasUpdate) return
    const { current, latest } = updateState
    setUpdateState({ status: 'downloading', current, latest, downloaded: 0, total: null })
    void invoke<string>('update_download').then(
      () => setUpdateState({ status: 'downloaded', current, latest }),
      (error: unknown) => setUpdateState({ status: 'error', current, message: String(error) }),
    )
  }

  // SILENT-39/40: segundo clique troca o executável com o app rodando. O
  // app NÃO é reiniciado aqui — só o botão "Reabrir agora" faz isso, para
  // não derrubar terminais abertos sem autorização.
  const handleInstall = () => {
    if (updateState.status !== 'downloaded') return
    const { current, latest } = updateState
    setUpdateState({ status: 'installing', current, latest })
    void invoke<string>('update_install').then(
      (version) => setUpdateState({ status: 'installed', version }),
      (error: unknown) => setUpdateState({ status: 'error', current, message: String(error) }),
    )
  }

  const handleRestart = () => {
    void invoke('update_restart')
  }

  // SET-06: trilho "Configurações › [Seção ativa]".
  const activeSection = SECTIONS.find((item) => item.id === section)

  // SET-04/SET-05: X e "Fechar" fecham o shell. Montado como overlay
  // (`onClose` presente) isso é desmontar o modal; na janela `settings` é
  // fechar a janela — a capability `core:window:allow-close` (T1) autoriza
  // a chamada.
  const handleClose = () => {
    if (onClose) {
      onClose()
      return
    }
    void getCurrentWindow().close()
  }

  return (
    <div className="settings-shell">
      <style>{`
        /* SET-01: as medidas seguem print/modal_config.png — cabeçalho alto,
           trilho lateral escurecido e conteúdo com respiro largo, para o
           shell ler como um cartão e não como uma janela espremida. */
        .settings-shell {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--surface, #131318);
          color: var(--fg, #e8e8ea);
        }
        .settings-shell__body { display: flex; flex: 1 1 auto; min-height: 0; }
        .settings-shell__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 1.1rem 1.5rem;
          border-bottom: 1px solid var(--border, #26262d);
        }
        .settings-shell__breadcrumb {
          font-size: 1.05rem;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .settings-shell__close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--muted, #8a8a92);
          cursor: pointer;
          border-radius: 8px;
          transition: background 120ms ease, color 120ms ease;
        }
        .settings-shell__close:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--fg, #e8e8ea);
        }
        .settings-shell__footer {
          display: flex;
          justify-content: flex-end;
          padding: 0.9rem 1.5rem;
          border-top: 1px solid var(--border, #26262d);
          background: rgba(0, 0, 0, 0.2);
        }
        .settings-shell__footer-close {
          padding: 0.5rem 1.5rem;
          border-radius: 8px;
          border: 1px solid var(--border, #26262d);
          background: rgba(255, 255, 255, 0.04);
          color: inherit;
          font-size: 0.9rem;
          cursor: pointer;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .settings-shell__footer-close:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: #3a3a44;
        }
        .settings-shell__nav {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-width: 208px;
          padding: 1rem 0.65rem;
          border-right: 1px solid var(--border, #26262d);
          background: var(--surface-2, #0a0a0c);
          flex: 0 0 auto;
          overflow: auto;
        }
        .settings-shell__nav-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          text-align: left;
          padding: 0.55rem 0.75rem;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--muted, #8a8a92);
          font-size: 0.9rem;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease;
        }
        .settings-shell__nav-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--fg, #e8e8ea);
        }
        .settings-shell__nav-item[aria-current='page'] {
          background: rgba(245, 183, 0, 0.14);
          color: var(--accent, #f5b700);
          font-weight: 600;
        }
        .settings-shell__content {
          flex: 1 1 auto;
          min-width: 0;
          overflow: auto;
          padding: 1.5rem 1.75rem 2rem;
          scrollbar-width: thin;
        }
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
            <GeneralPanel
              prefs={quotaPrefs}
              onChange={handleChangeQuotaPrefs}
              agentIds={agents.map((agent) => agent.id)}
              profiles={profiles}
              selectedProfileId={selectedProfileId}
              onProfileChange={handleChangeProfile}
            />
          )}

          {section === 'agents' && (
            <AgentPanel
              agents={agents}
              installedIds={installedIds}
              defaultAgentId={defaultAgentId}
              onSelectDefault={setDefaultAgentId}
            />
          )}

          {section === 'projects' && (
            <ProjectsPanel
              projects={projects}
              terminalCountByProject={countTerminalsByProject(projects, terminalCwds)}
              deleteError={projectDeleteError}
              onCreate={() => {
                setProjectFormError(null)
                setProjectFormOpen(true)
              }}
              onDelete={(project) => void deleteProject(project)}
            />
          )}

          {section === 'updates' && (
            <UpdateSettings
              state={updateState}
              notes={updateNotes}
              autoCheckEnabled={autoCheckEnabled}
              checking={checkingUpdate}
              onToggleAutoCheck={handleToggleAutoCheck}
              onCheck={handleCheck}
              onDownload={handleDownload}
              onInstall={handleInstall}
              onRestart={handleRestart}
            />
          )}
        </div>
      </div>

      <div className="settings-shell__footer">
        <button type="button" className="settings-shell__footer-close" onClick={handleClose}>
          Fechar
        </button>
      </div>

      {/* SPEC: projects (PROJ-19) — o mesmo formulário do wizard. */}
      {projectFormOpen && (
        <ProjectFormModal
          error={projectFormError}
          onSubmit={(values) => void submitProjectForm(values)}
          onCancel={() => {
            setProjectFormOpen(false)
            setProjectFormError(null)
          }}
        />
      )}
    </div>
  )
}
