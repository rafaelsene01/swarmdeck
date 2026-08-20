// SPEC: projects (PROJ-13, PROJ-14, PROJ-16, PROJ-17, PROJ-18, PROJ-21)

import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import ProjectStep from './ProjectStep'
import AgentStep, { DEFAULT_PERMISSION_MODE } from './AgentStep'
import ProjectFormModal, { type ProjectFormValues } from '../project/ProjectFormModal'
import type { AgentDescriptor } from '../../routes/settings/AgentPanel'
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
  agents: AgentDescriptor[]
  installedIds: Set<string>
  defaultAgentId: string | null
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
  defaultAgentId,
  onConfirm,
  onCancel,
}: PaneWizardProps) {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  /** `null` = o usuário ainda não escolheu; o padrão vale enquanto isso. O
   * catálogo chega por IPC depois do mount (`App.tsx`), então guardar o
   * `defaultAgentId` em estado congelaria um `null` inicial. O envelope
   * `{ id }` separa "não escolheu" de "escolheu terminal limpo" (PROJ-21),
   * que também é um `id` nulo. */
  const [chosen, setChosen] = useState<{ id: string | null } | null>(null)
  const selectedAgentId = chosen === null ? defaultAgentId : chosen.id
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
    })
  }, [])

  const handleNoProject = async () => {
    try {
      const dir = await invoke<string>('project_sandbox_dir')
      setError(null)
      setSelection({ id: null, name: 'Sem projeto', path: dir, color: null })
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
    return (
      <AgentStep
        selection={{ name: selection.name, path: selection.path, color: selection.color }}
        agents={agents}
        installedIds={installedIds}
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
            (agents.find((agent) => agent.id === selectedAgentId)?.permissionModes ?? []).includes(
              permissionMode,
            )
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
