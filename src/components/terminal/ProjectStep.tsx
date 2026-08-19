// SPEC: projects (PROJ-10, PROJ-16, PROJ-17, PROJ-18)

import { useMemo } from 'react'
import { formatAge } from '../../lib/relativeTime'
import {
  filterProjects,
  sortByLastUsed,
  truncatePath,
  type ProjectRow,
} from '../../routes/settings/ProjectsPanel'

export interface ProjectStepProps {
  projects: ProjectRow[]
  /** Estado do pai (`PaneWizard`): é o que preserva a busca no "Voltar". */
  query: string
  onQueryChange: (query: string) => void
  onSelect: (project: ProjectRow) => void
  onNewProject: () => void
  onImportProject: () => void
  onNoProject: () => void
  onCancel: () => void
  error: string | null
}

/**
 * Etapa 1 do wizard de novo terminal: busca, lista de recentes, contador e
 * rodapé. Apresentacional, como `AgentPanel` e `ProjectsPanel` — quem fala
 * com o backend é `PaneWizard`.
 *
 * Os rótulos "New Project", "Import Project", "No Project" e o formato
 * "N / M projects" vêm literais da spec (P1 AC3, P2 AC1/AC4/AC6), que os
 * cita entre aspas como texto de tela; o resto da interface é pt-BR.
 */
export default function ProjectStep({
  projects,
  query,
  onQueryChange,
  onSelect,
  onNewProject,
  onImportProject,
  onNoProject,
  onCancel,
  error,
}: ProjectStepProps) {
  const visibleProjects = useMemo(
    () => sortByLastUsed(filterProjects(projects, query)),
    [projects, query],
  )
  const now = Date.now()

  return (
    <div className="project-step">
      <style>{`
        .project-step {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          height: 100%;
          padding: 0.75rem;
          overflow: hidden;
          background: var(--surface-2, #0a0a0c);
          color: var(--fg, #e8e8ea);
        }
        .project-step__head { display: flex; align-items: center; justify-content: space-between; }
        .project-step__step-label {
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          color: var(--muted, #8a8a92);
        }
        .project-step__search {
          padding: 0.4rem 0.55rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 6px;
          background: var(--surface, #131318);
          color: var(--fg, #e8e8ea);
          font-size: 0.8rem;
        }
        .project-step__counter { margin: 0; font-size: 0.72rem; color: var(--muted, #8a8a92); }
        .project-step__error { margin: 0; font-size: 0.72rem; color: #ef4444; }
        .project-step__list {
          flex: 1;
          margin: 0;
          padding: 0;
          list-style: none;
          overflow-y: auto;
        }
        .project-step__row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          width: 100%;
          padding: 0.4rem 0.45rem;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }
        .project-step__row:hover { background: rgba(255, 255, 255, 0.06); }
        .project-step__initial {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 6px;
          color: #0a0a0c;
          font-size: 0.72rem;
          font-weight: 700;
        }
        .project-step__name { font-size: 0.8rem; }
        .project-step__path { flex: 1; font-size: 0.7rem; color: var(--muted, #8a8a92); }
        .project-step__age { font-size: 0.7rem; color: var(--muted, #8a8a92); }
        .project-step__footer { display: flex; gap: 0.4rem; }
      `}</style>

      <div className="project-step__head">
        <span className="project-step__step-label">PROJECT</span>
        <button type="button" aria-label="fechar" onClick={onCancel}>
          ×
        </button>
      </div>

      <input
        type="search"
        className="project-step__search"
        placeholder="Buscar por nome ou caminho..."
        aria-label="Buscar projetos"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />

      <p className="project-step__counter">
        {visibleProjects.length} / {projects.length} projects
      </p>

      {error !== null && (
        <p className="project-step__error" role="alert">
          {error}
        </p>
      )}

      <ul className="project-step__list">
        {visibleProjects.map((project) => (
          <li key={project.id}>
            <button type="button" className="project-step__row" onClick={() => onSelect(project)}>
              <span className="project-step__initial" style={{ backgroundColor: project.color }}>
                {project.name.charAt(0).toUpperCase()}
              </span>
              <span className="project-step__name">{project.name}</span>
              <span className="project-step__path" title={project.path}>
                {truncatePath(project.path)}
              </span>
              <span className="project-step__age">{formatAge(project.lastUsed, now)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="project-step__footer">
        <button type="button" onClick={onNewProject}>
          New Project
        </button>
        <button type="button" onClick={onImportProject}>
          Import Project
        </button>
        <button type="button" onClick={onNoProject}>
          No Project
        </button>
      </div>
    </div>
  )
}
