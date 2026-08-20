// SPEC: projects (PROJ-10, PROJ-16, PROJ-17, PROJ-18)

import { useMemo } from 'react'
import { formatAge } from '../../lib/relativeTime'
import WizardHeader from './WizardHeader'
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
          height: 100%;
          padding: 1rem 1.15rem;
          overflow: hidden;
          background: var(--surface-2, #0a0a0c);
          color: var(--fg, #e8e8ea);
        }
        /* Mesma coluna centrada da etapa AGENT: em painel largo o conteúdo
           não estica de borda a borda, em painel estreito ocupa tudo. */
        .project-step__inner {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          width: min(820px, 100%);
          height: 100%;
          margin: 0 auto;
          overflow: hidden;
        }
        .project-step__search-wrap {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0 0.85rem;
          height: 44px;
          border: 1px solid var(--border, #26262d);
          border-radius: 10px;
          background: var(--surface, #131318);
          transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        .project-step__search-wrap:focus-within {
          border-color: var(--accent, #f5b700);
          box-shadow: 0 0 0 3px rgba(245, 183, 0, 0.12);
        }
        .project-step__search-icon { color: var(--muted, #8a8a92); flex: none; }
        .project-step__search {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          color: var(--fg, #e8e8ea);
          font-size: 0.85rem;
        }
        .project-step__search::placeholder { color: var(--muted, #8a8a92); }
        .project-step__error { margin: 0; font-size: 0.75rem; color: var(--danger, #f87171); }
        .project-step__list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          margin: 0;
          padding: 0;
          list-style: none;
          overflow-y: auto;
        }
        .project-step__row {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          width: 100%;
          padding: 0.5rem 0.6rem;
          border: 1px solid transparent;
          border-radius: 10px;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }
        .project-step__row:hover {
          background: var(--surface, #131318);
          border-color: var(--border, #26262d);
        }
        .project-step__initial {
          display: inline-flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 9px;
          color: #0a0a0c;
          font-size: 0.85rem;
          font-weight: 700;
        }
        .project-step__meta {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
        }
        .project-step__name { font-size: 0.83rem; font-weight: 700; }
        .project-step__path {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.72rem;
          color: var(--muted, #8a8a92);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .project-step__age {
          flex: none;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.7rem;
          color: var(--muted, #8a8a92);
        }
        .project-step__footer {
          display: flex;
          gap: 0.5rem;
          padding-top: 0.85rem;
          border-top: 1px solid var(--border, #26262d);
        }
        /* Um só tamanho para os três: o rodapé é uma faixa, não três botões
           de larguras diferentes. */
        .project-step__action {
          display: inline-flex;
          flex: 1;
          gap: 0.5rem;
          align-items: center;
          justify-content: center;
          height: 44px;
          padding: 0 0.75rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 10px;
          background: var(--surface, #131318);
          color: inherit;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
        }
        .project-step__action:hover { border-color: var(--muted, #8a8a92); }
        .project-step__action[data-primary='true'] {
          border-color: var(--accent, #f5b700);
          background: var(--accent, #f5b700);
          color: #0a0a0c;
        }
        .project-step__close {
          display: inline-flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border: 1px solid var(--border, #26262d);
          border-radius: 10px;
          background: var(--surface, #131318);
          color: var(--muted, #8a8a92);
          cursor: pointer;
        }
        .project-step__close:hover { color: var(--fg, #e8e8ea); border-color: var(--muted, #8a8a92); }
      `}</style>

      <div className="project-step__inner">
        <WizardHeader
          step={1}
          counter={`${visibleProjects.length} / ${projects.length} projects`}
        />

        <div className="project-step__search-wrap">
          <svg
            className="project-step__search-icon"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="project-step__search"
            placeholder="Buscar por nome ou caminho..."
            aria-label="Buscar projetos"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>

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
                <span className="project-step__meta">
                  <span className="project-step__name">{project.name}</span>
                  <span className="project-step__path" title={project.path}>
                    {truncatePath(project.path)}
                  </span>
                </span>
                <span className="project-step__age">{formatAge(project.lastUsed, now)}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="project-step__footer">
          <button
            type="button"
            className="project-step__action"
            data-primary="true"
            onClick={onNewProject}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Project
          </button>

          <button type="button" className="project-step__action" onClick={onImportProject}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z" />
              <line x1="11" y1="11.5" x2="11" y2="16" />
              <path d="m8.75 13.75 2.25 2.25 2.25-2.25" />
            </svg>
            Import Project
          </button>

          <button type="button" className="project-step__action" onClick={onNoProject}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5z" />
            </svg>
            No Project
          </button>

          <button
            type="button"
            className="project-step__close"
            aria-label="fechar"
            onClick={onCancel}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
