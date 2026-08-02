// SPEC: projects (PROJ-05)

import { useMemo, useState } from 'react'

export interface ProjectRow {
  id: string
  name: string
  path: string
  color: string
  taskCount: number
  lastUsed: number | null
}

export interface ProjectsPanelProps {
  projects: ProjectRow[]
}

/** Quantidade de caracteres mantidos em cada ponta do caminho truncado. */
const TRUNCATE_EDGE = 20

/**
 * Trunca um caminho longo demais preservando início e fim, com `...` no
 * meio — cortar só o fim esconde o nome do projeto quando o caminho
 * compartilha um prefixo comum entre vários projetos (ex.: todos sob
 * `C:\Users\...\projects\`).
 */
export function truncatePath(path: string, edge: number = TRUNCATE_EDGE): string {
  const maxLen = edge * 2 + 3
  if (path.length <= maxLen) return path
  return `${path.slice(0, edge)}...${path.slice(path.length - edge)}`
}

/**
 * Ordena por último uso mais recente primeiro; projetos nunca usados
 * (`lastUsed: null`) vão para o fim, na ordem em que chegaram.
 */
export function sortByLastUsed(projects: ProjectRow[]): ProjectRow[] {
  return [...projects].sort((a, b) => {
    if (a.lastUsed === null && b.lastUsed === null) return 0
    if (a.lastUsed === null) return 1
    if (b.lastUsed === null) return -1
    return b.lastUsed - a.lastUsed
  })
}

/** Filtra por nome OU caminho, sem diferenciar maiúsculas/minúsculas. */
export function filterProjects(projects: ProjectRow[], query: string): ProjectRow[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return projects
  return projects.filter(
    (p) => p.name.toLowerCase().includes(needle) || p.path.toLowerCase().includes(needle),
  )
}

/**
 * Listagem e organização de projetos — puramente apresentacional, no mesmo
 * padrão de `AgentPanel.tsx`: recebe os dados prontos via props, não busca
 * nada sozinho. Busca e ordenação são estado local (PROJ-05).
 */
export default function ProjectsPanel({ projects }: ProjectsPanelProps) {
  const [query, setQuery] = useState('')

  const visibleProjects = useMemo(
    () => sortByLastUsed(filterProjects(projects, query)),
    [projects, query],
  )

  if (projects.length === 0) {
    return (
      <div className="projects-panel projects-panel--empty">
        <p className="projects-panel__empty-title">Nenhum projeto ainda</p>
        <p className="projects-panel__empty-hint">
          Crie seu primeiro projeto para organizar as tarefas por diretório.
        </p>
        <button type="button" className="projects-panel__cta">
          Criar projeto
        </button>
      </div>
    )
  }

  return (
    <div className="projects-panel">
      <input
        type="search"
        className="projects-panel__search"
        placeholder="Buscar por nome ou caminho..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Buscar projetos"
      />

      <ul className="projects-panel__list">
        {visibleProjects.map((project) => (
          <li key={project.id} className="projects-panel__row">
            <span
              className="projects-panel__color"
              style={{ backgroundColor: project.color }}
              aria-hidden="true"
            />
            <span className="projects-panel__name">{project.name}</span>
            <span className="projects-panel__path" title={project.path}>
              {truncatePath(project.path)}
            </span>
            <span className="projects-panel__task-count">{project.taskCount} tarefas</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
