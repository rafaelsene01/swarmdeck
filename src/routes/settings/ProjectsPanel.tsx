// SPEC: projects (PROJ-05, PROJ-19, PROJ-22, PROJ-23, PROJ-24)

import { useMemo, useState } from 'react'
import { FolderOpen, Plus, Search, Terminal, Trash2 } from 'lucide-react'

export interface ProjectRow {
  id: string
  name: string
  path: string
  color: string
  lastUsed: number | null
}

export interface ProjectsPanelProps {
  projects: ProjectRow[]
  /**
   * SPEC: projects (PROJ-23) — quantos terminais abertos vivem dentro de cada
   * projeto, por `id`. Quem monta o painel resolve isso a partir do workspace
   * (`countTerminalsByProject`); um id ausente do mapa conta como 0.
   */
  terminalCountByProject?: Record<string, number>
  /** SPEC: projects (PROJ-19) — abre o formulário de criação. */
  onCreate?: () => void
  /** SPEC: projects (PROJ-24) — confirmado pelo diálogo desta tela. */
  onDelete?: (project: ProjectRow) => void
  /** Erro devolvido por `project_delete` (PROJ-24 AC11). */
  deleteError?: string | null
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

/** SPEC: projects (PROJ-22) — a inicial desenhada dentro do quadrado de cor.
 * Nome só com espaços cai em `?`, porque um quadrado vazio leria como falha
 * de render. */
export function projectInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

/** Componentes de um caminho, em minúsculas e com `\` e `/` equivalentes —
 * espelha `normalized_components` de `src-tauri/src/projects/resolve.rs`.
 * Comparar por componente evita casar `D:\ide-old` com o projeto `D:\ide`. */
function pathComponents(path: string): string[] {
  return path
    .split(/[\\/]+/)
    .filter((part) => part !== '')
    .map((part) => part.toLowerCase())
}

function isPrefix(prefix: string[], full: string[]): boolean {
  return prefix.length <= full.length && prefix.every((part, i) => part === full[i])
}

/**
 * SPEC: projects (PROJ-23) — conta terminais abertos por projeto a partir dos
 * `cwd` deles. Porta em TypeScript da regra de `projects::resolve`: um `cwd`
 * pertence ao projeto cujo `path` é prefixo dele, e quando dois projetos
 * casam (um registrado dentro do outro) vence o mais específico — o de mais
 * componentes. `cwd` que não casa com nada não conta para ninguém.
 */
export function countTerminalsByProject(
  projects: ProjectRow[],
  cwds: string[],
): Record<string, number> {
  const registered = projects.map((project) => ({
    id: project.id,
    components: pathComponents(project.path),
  }))

  const counts: Record<string, number> = {}
  for (const cwd of cwds) {
    const cwdComponents = pathComponents(cwd)
    let best: { id: string; depth: number } | null = null
    for (const project of registered) {
      if (!isPrefix(project.components, cwdComponents)) continue
      if (best === null || project.components.length > best.depth) {
        best = { id: project.id, depth: project.components.length }
      }
    }
    if (best !== null) counts[best.id] = (counts[best.id] ?? 0) + 1
  }
  return counts
}

const PANEL_STYLES = `
  /* SPEC: projects (PROJ-19, PROJ-22, PROJ-23, PROJ-24) — as medidas seguem
     print/project.png: cabeçalho com ícone e descrição, barra de busca e CTA
     na mesma linha, e a lista como uma grade de colunas fixas para que cor,
     nome, caminho e contagem alinhem entre as linhas. */
  .projects-panel { display: flex; flex-direction: column; gap: 1.25rem; }
  .projects-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
    flex-wrap: wrap;
  }
  .projects-panel__heading { display: flex; gap: 0.7rem; max-width: 22rem; }
  .projects-panel__heading-icon { color: var(--accent, #f5b700); flex: 0 0 auto; margin-top: 0.15rem; }
  .projects-panel__title { margin: 0; font-size: 1rem; font-weight: 600; letter-spacing: -0.01em; }
  .projects-panel__subtitle { margin: 0.25rem 0 0; font-size: 0.8rem; line-height: 1.4; color: var(--muted, #8a8a92); }
  .projects-panel__tools { display: flex; align-items: center; gap: 0.6rem; }
  .projects-panel__search-field { position: relative; display: flex; align-items: center; }
  .projects-panel__search-icon {
    position: absolute;
    left: 0.6rem;
    color: var(--muted, #8a8a92);
    pointer-events: none;
  }
  .projects-panel__search {
    width: 15rem;
    padding: 0.45rem 0.6rem 0.45rem 2rem;
    border: 1px solid var(--border, #26262d);
    border-radius: 8px;
    background: var(--surface-2, #0a0a0c);
    color: var(--fg, #e8e8ea);
    font-size: 0.8rem;
  }
  .projects-panel__search::placeholder { color: var(--muted, #8a8a92); }
  .projects-panel__search:focus-visible { outline: none; border-color: var(--accent, #f5b700); }
  .projects-panel__cta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border: none;
    border-radius: 8px;
    background: var(--accent, #f5b700);
    color: #1a1400;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: filter 120ms ease;
  }
  .projects-panel__cta:hover { filter: brightness(1.08); }
  .projects-panel__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .projects-panel__row {
    display: grid;
    grid-template-columns: 34px minmax(7rem, 1fr) minmax(0, 1.6fr) 6.5rem 32px;
    align-items: center;
    gap: 0.9rem;
    padding: 0.65rem 0.5rem;
    border-bottom: 1px solid var(--border, #26262d);
  }
  .projects-panel__row:hover { background: rgba(255, 255, 255, 0.03); }
  .projects-panel__color {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    color: #10100c;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .projects-panel__name { font-size: 0.85rem; font-weight: 600; }
  .projects-panel__path {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.75rem;
    color: var(--muted, #8a8a92);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .projects-panel__terminals {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: var(--muted, #8a8a92);
  }
  .projects-panel__delete {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--muted, #8a8a92);
    cursor: pointer;
    transition: background 120ms ease, color 120ms ease;
  }
  .projects-panel__delete:hover:not(:disabled) {
    background: rgba(248, 113, 113, 0.14);
    color: var(--danger, #f87171);
  }
  .projects-panel__delete:disabled { opacity: 0.35; cursor: not-allowed; }
  .projects-panel__empty-query { margin: 0; padding: 1rem 0.5rem; font-size: 0.8rem; color: var(--muted, #8a8a92); }
  .projects-panel--empty { align-items: flex-start; gap: 0.4rem; }
  .projects-panel__empty-title { margin: 0; font-size: 0.9rem; font-weight: 600; }
  .projects-panel__empty-hint { margin: 0 0 0.6rem; font-size: 0.8rem; color: var(--muted, #8a8a92); }
  .projects-panel__error { margin: 0; font-size: 0.75rem; color: var(--danger, #f87171); }

  .projects-panel__confirm {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 26rem;
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--border, #26262d);
    border-radius: 10px;
    background: var(--surface, #131318);
    color: var(--fg, #e8e8ea);
  }
  .projects-panel__confirm-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
  .projects-panel__confirm-text { margin: 0; font-size: 0.8rem; line-height: 1.45; color: var(--muted, #8a8a92); }
  .projects-panel__confirm-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .projects-panel__confirm-danger {
    padding: 0.4rem 0.9rem;
    border: none;
    border-radius: 6px;
    background: var(--danger, #f87171);
    color: #2a0b0b;
    font-weight: 600;
    cursor: pointer;
  }
`

/**
 * Listagem e organização de projetos — puramente apresentacional, no mesmo
 * padrão de `AgentPanel.tsx`: recebe os dados prontos via props, não busca
 * nada sozinho. Busca é estado local (PROJ-05), e o diálogo de confirmação da
 * exclusão também: quem recebe `onDelete` já recebe a decisão tomada.
 */
export default function ProjectsPanel({
  projects,
  terminalCountByProject = {},
  onCreate,
  onDelete,
  deleteError = null,
}: ProjectsPanelProps) {
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<ProjectRow | null>(null)

  const visibleProjects = useMemo(
    () => sortByLastUsed(filterProjects(projects, query)),
    [projects, query],
  )

  if (projects.length === 0) {
    return (
      <div className="projects-panel projects-panel--empty">
        <style>{PANEL_STYLES}</style>
        <p className="projects-panel__empty-title">Nenhum projeto ainda</p>
        <p className="projects-panel__empty-hint">
          Crie seu primeiro projeto para organizar as tarefas por diretório.
        </p>
        <button type="button" className="projects-panel__cta" onClick={onCreate}>
          <Plus size={14} aria-hidden="true" />
          Criar projeto
        </button>
      </div>
    )
  }

  return (
    <div className="projects-panel">
      <style>{PANEL_STYLES}</style>

      <div className="projects-panel__header">
        <div className="projects-panel__heading">
          <FolderOpen size={18} className="projects-panel__heading-icon" aria-hidden="true" />
          <div>
            <h2 className="projects-panel__title">Gerenciar projetos</h2>
            <p className="projects-panel__subtitle">
              Diretórios, cores e organização do workspace.
            </p>
          </div>
        </div>

        <div className="projects-panel__tools">
          <div className="projects-panel__search-field">
            <Search size={14} className="projects-panel__search-icon" aria-hidden="true" />
            <input
              type="search"
              className="projects-panel__search"
              placeholder="Buscar projetos..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Buscar projetos"
            />
          </div>

          <button type="button" className="projects-panel__cta" onClick={onCreate}>
            <Plus size={14} aria-hidden="true" />
            Criar projeto
          </button>
        </div>
      </div>

      {deleteError !== null && (
        <p className="projects-panel__error" role="alert">
          {deleteError}
        </p>
      )}

      {visibleProjects.length === 0 ? (
        <p className="projects-panel__empty-query">Nenhum projeto casa com a busca.</p>
      ) : (
        <ul className="projects-panel__list">
          {visibleProjects.map((project) => {
            const openTerminals = terminalCountByProject[project.id] ?? 0
            return (
              <li key={project.id} className="projects-panel__row">
                {/* SPEC: projects (PROJ-22) — cor e inicial no mesmo quadrado. */}
                <span
                  className="projects-panel__color"
                  style={{ backgroundColor: project.color }}
                  aria-hidden="true"
                >
                  {projectInitial(project.name)}
                </span>
                <span className="projects-panel__name">{project.name}</span>
                <span className="projects-panel__path" title={project.path}>
                  {truncatePath(project.path)}
                </span>
                {/* SPEC: projects (PROJ-23) */}
                <span className="projects-panel__terminals">
                  <Terminal size={13} aria-hidden="true" />
                  {openTerminals} {openTerminals === 1 ? 'terminal' : 'terminais'}
                </span>
                {/* SPEC: projects (PROJ-24) — travado enquanto o projeto tiver
                    terminal aberto: excluir sob os pés de uma sessão viva
                    deixaria o terminal apontando para um projeto que não
                    existe mais. */}
                <button
                  type="button"
                  className="projects-panel__delete"
                  disabled={openTerminals > 0}
                  onClick={() => setConfirming(project)}
                  aria-label={`excluir ${project.name}`}
                  title={
                    openTerminals > 0
                      ? 'Feche os terminais deste projeto para poder excluí-lo'
                      : undefined
                  }
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {confirming !== null && (
        <div className="app-dialog-backdrop">
          <div
            className="projects-panel__confirm"
            role="dialog"
            aria-label={`excluir projeto ${confirming.name}`}
          >
            <h2 className="projects-panel__confirm-title">Excluir “{confirming.name}”?</h2>
            <p className="projects-panel__confirm-text">
              O projeto sai da lista e as tarefas dele ficam sem projeto. A pasta em disco não é
              apagada.
            </p>
            <div className="projects-panel__confirm-actions">
              <button type="button" onClick={() => setConfirming(null)}>
                cancelar
              </button>
              <button
                type="button"
                className="projects-panel__confirm-danger"
                onClick={() => {
                  onDelete?.(confirming)
                  setConfirming(null)
                }}
              >
                excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
