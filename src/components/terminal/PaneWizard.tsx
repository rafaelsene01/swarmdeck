// SPEC: projects (PROJ-13, PROJ-14, PROJ-16, PROJ-17, PROJ-18, PROJ-21)
// SPEC: terminal-boot-loading (BOOT-11, BOOT-12)

import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import ProjectStep from './ProjectStep'
import AgentStep, { DEFAULT_PERMISSION_MODE } from './AgentStep'
import ProjectFormModal, { type ProjectFormValues } from '../project/ProjectFormModal'
import type { AgentDescriptor } from '../../routes/settings/AgentPanel'
import type { ProfileCatalogEntry } from '../../types/agents'
import { filterProjects, type ProjectRow } from '../../routes/settings/ProjectsPanel'

/** Espelha `projects::service::Project` — o campo chega `last_used`. */
interface ProjectRecord {
  id: string
  name: string
  path: string
  color: string
  last_used: number | null
}

function toRow(record: ProjectRecord): ProjectRow {
  return {
    id: record.id,
    name: record.name,
    path: record.path,
    color: record.color,
    lastUsed: record.last_used,
  }
}

/** Última pasta do caminho — o nome do projeto no "Import Project" (P2 AC4),
 *  e o rótulo de fallback do cabeçalho quando o `cwd` não é projeto conhecido. */
export function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** Normaliza para comparação: sem barra final, separador único, minúsculas —
 *  o seletor do SO devolve o caminho como o usuário navegou, o banco guarda o
 *  canonicalizado. */
export function normalizePath(p: string): string {
  return p.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase()
}

function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b)
}

export interface PaneWizardProps {
  /** Catálogo do perfil padrão — fallback de `profileCatalogs`. */
  agents: AgentDescriptor[]
  installedIds: Set<string>
  /**
   * SPEC: terminal-boot-loading (BOOT-10, BOOT-12) — catálogo por perfil,
   * varrido no boot. A etapa AGENT usa a entrada do perfil que o **caminho
   * escolhido** implica, não a do perfil padrão: uma pasta em
   * `\\wsl.localhost\Ubuntu-24.04\...` roda dentro da distro, e é lá que o
   * `claude` dela precisa estar. Sem isto a grade marcava "não encontrado no
   * PATH" para um CLI que está instalado — só não no Windows.
   *
   * Opcional: sem a varredura (ou com um perfil que não veio nela) a etapa
   * cai em `agents`/`installedIds`, exatamente o comportamento anterior.
   */
  profileCatalogs?: ProfileCatalogEntry[]
  /** SPEC: agent-permission-mode (PERM-05) — `permissionMode` é `null`
   * quando o agente escolhido não oferece modos (ou é terminal limpo). */
  onConfirm: (
    cwd: string,
    agentId: string | null,
    projectId: string | null,
    permissionMode: string | null,
  ) => void
  onCancel: () => void
}

interface Selection {
  /** `null` no "No Project": a sandbox não é linha de `projects`. */
  id: string | null
  name: string
  path: string
  color: string | null
  /**
   * SPEC: terminal-boot-loading (BOOT-11) — id do perfil que este caminho
   * implica, resolvido por `shell_profile_for_path`. `null` quando a consulta
   * falhou: a etapa AGENT então usa o catálogo do perfil padrão, como antes.
   */
  profileId: string | null
}

/**
 * Wizard de novo terminal, renderizado dentro do painel de rascunho. É o
 * único dos quatro componentes do fluxo que fala com o backend: as etapas e
 * o formulário são apresentacionais.
 *
 * A busca mora aqui, não em `ProjectStep`, para que "Voltar" na etapa AGENT
 * devolva o texto digitado (P1 AC6).
 */
export default function PaneWizard({
  agents,
  installedIds,
  profileCatalogs,
  onConfirm,
  onCancel,
}: PaneWizardProps) {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  /** AD-035 — `null` = o usuário ainda não escolheu, e nesse estado vale
   * "Terminal" (shell puro, PROJ-21), não um agente.
   *
   * Antes valia `defaultAgentId`, que vinha de `agent_default` →
   * `resolve_effective_default`: sem preferência utilizável, ele devolve *o
   * primeiro instalado na ordem do catálogo*. Num Windows com o `claude`
   * dentro da distro e o Antigravity no host, esse primeiro era
   * `antigravity-cli` — um ladrilho que a grade nem deixa escolher
   * (`AgentStep.SELECTABLE`). Pré-marcar shell puro nunca erra: ele não
   * depende de comando nenhum estar instalado.
   *
   * O envelope `{ id }` continua separando "não escolheu" de "escolheu
   * terminal limpo", que também é um `id` nulo. */
  const [chosen, setChosen] = useState<{ id: string | null } | null>(null)
  const selectedAgentId = chosen?.id ?? null
  /** SPEC: agent-permission-mode (PERM-05) — escolha do passo AGENT. Nasce
   * no padrão e sobrevive a trocar de agente e voltar para a etapa PROJECT:
   * quem já disse "sem verificação" não quer redizer a cada ida e volta. */
  const [permissionMode, setPermissionMode] = useState(DEFAULT_PERMISSION_MODE)
  const [formOpen, setFormOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void invoke<ProjectRecord[]>('project_list')
      .then((records) => {
        if (!cancelled) setProjects(records.map(toRow))
      })
      .catch((err: unknown) => {
        // Lista vazia com a mensagem: "Import Project" e "No Project"
        // continuam utilizáveis.
        if (!cancelled) setError(String(err))
      })

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * SPEC: terminal-boot-loading (BOOT-11) — o perfil de terminal que `path`
   * implica. Falha devolve `null` em vez de subir: não saber o perfil degrada
   * para o catálogo do padrão, e não vale bloquear a escolha do projeto por
   * causa disso.
   */
  const profileForPath = async (path: string): Promise<string | null> => {
    try {
      return await invoke<string>('shell_profile_for_path', { cwd: path })
    } catch (err: unknown) {
      console.error('falha ao resolver o terminal do caminho', err)
      return null
    }
  }

  /**
   * SPEC: projects (PROJ-13 AC15, PROJ-14 AC9) — `project_touch` faz as duas
   * coisas de uma vez: valida que o caminho ainda existe no disco
   * (`require_existing_dir` devolve `PathNotFound` com o caminho ausente) e
   * grava o uso. Erro mantém a etapa "PROJECT" com a mensagem, em vez de
   * levar o usuário para a etapa AGENT rumo a um `cwd` que não existe.
   */
  const selectProject = useCallback(async (project: ProjectRow) => {
    try {
      await invoke('project_touch', { id: project.id })
    } catch (err: unknown) {
      setError(String(err))
      return
    }
    setError(null)
    setSelection({
      id: project.id,
      name: project.name,
      path: project.path,
      color: project.color,
      profileId: await profileForPath(project.path),
    })
  }, [])

  const handleNoProject = async () => {
    try {
      const dir = await invoke<string>('project_sandbox_dir')
      setError(null)
      setSelection({
        id: null,
        name: 'Sem projeto',
        path: dir,
        color: null,
        profileId: await profileForPath(dir),
      })
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  const handleImportProject = async () => {
    const selected = await open({ directory: true })
    if (selected === null) return
    const path = Array.isArray(selected) ? selected[0] : selected

    // Pasta já registrada seleciona o projeto existente, sem criar outro
    // (P2 AC5).
    const existing = projects.find((project) => samePath(project.path, path))
    if (existing) {
      await selectProject(existing)
      return
    }

    try {
      const created = await invoke<ProjectRecord>('project_create', {
        name: lastSegment(path),
        path,
      })
      const row = toRow(created)
      setProjects((current) => [...current, row])
      await selectProject(row)
    } catch (err: unknown) {
      setError(String(err))
    }
  }

  const handleCreateProject = async (values: ProjectFormValues) => {
    try {
      const created = await invoke<ProjectRecord>('project_create_in', {
        name: values.name,
        baseDir: values.baseDir ?? '',
        color: values.color,
        gitInit: values.gitInit ?? false,
      })
      const row = toRow(created)
      setProjects((current) => [...current, row])
      setFormOpen(false)
      await selectProject(row)
    } catch (err: unknown) {
      // O formulário continua aberto com a mensagem (P2 AC10, AC11).
      setError(String(err))
    }
  }

  if (selection !== null) {
    // SPEC: terminal-boot-loading (BOOT-12) — o catálogo do perfil que este
    // caminho implica. Sem entrada correspondente (varredura ausente, perfil
    // que sumiu da lista), cai nas props de sempre.
    const profile =
      profileCatalogs?.find((entry) => entry.profileId === selection.profileId) ?? null
    // AD-035: a grade lista **somente** o que está instalado naquele
    // terminal. Antes listava o catálogo inteiro com os ausentes
    // desabilitados, o que num host sem agente nenhum era uma parede de
    // ladrilhos mortos. Sem perfil correspondente (varredura ausente), o
    // filtro cai em `installedIds`, que é a mesma informação vinda por prop.
    const stepAgents = profile
      ? profile.agents.filter((agent) => agent.installed)
      : agents.filter((agent) => installedIds.has(agent.id))
    const stepInstalledIds = new Set(stepAgents.map((agent) => agent.id))

    return (
      <AgentStep
        selection={{ name: selection.name, path: selection.path, color: selection.color }}
        agents={stepAgents}
        installedIds={stepInstalledIds}
        terminalLabel={profile?.label}
        selectedAgentId={selectedAgentId}
        onSelectAgent={(id) => setChosen({ id })}
        permissionMode={permissionMode}
        onSelectPermissionMode={setPermissionMode}
        onBack={() => setSelection(null)}
        counter={`${filterProjects(projects, query).length} / ${projects.length} projects`}
        onConfirm={() =>
          onConfirm(
            selection.path,
            selectedAgentId,
            selection.id,
            // PERM-05: só vai modo se o agente escolhido declarar algum — o
            // shell puro e os agentes sem a flag não têm o que receber.
            (
              stepAgents.find((agent) => agent.id === selectedAgentId)?.permissionModes ?? []
            ).includes(permissionMode)
              ? permissionMode
              : null,
          )
        }
      />
    )
  }

  return (
    <>
      <ProjectStep
        projects={projects}
        query={query}
        onQueryChange={setQuery}
        onSelect={(project) => void selectProject(project)}
        onNewProject={() => {
          setError(null)
          setFormOpen(true)
        }}
        onImportProject={() => void handleImportProject()}
        onNoProject={() => void handleNoProject()}
        onCancel={onCancel}
        error={error}
      />

      {formOpen && (
        <ProjectFormModal
          onSubmit={(values) => void handleCreateProject(values)}
          onCancel={() => {
            setError(null)
            setFormOpen(false)
          }}
          error={error}
        />
      )}
    </>
  )
}
