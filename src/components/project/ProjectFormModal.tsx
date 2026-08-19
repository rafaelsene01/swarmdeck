// SPEC: projects (PROJ-18, PROJ-20)

import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import type { ProjectRow } from '../../routes/settings/ProjectsPanel'

/**
 * As 8 cores de `PALETTE` em `src-tauri/src/projects/service.rs`. Duplicadas
 * de propósito: um comando Tauri só para ler oito strings fixas não se paga.
 * `ProjectFormModal.test.tsx` lê o arquivo Rust e falha se os dois lados
 * divergirem.
 */
export const PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const

export interface ProjectFormValues {
  name: string
  /** Só no modo `create`: diretório onde a subpasta do projeto é criada. */
  baseDir?: string
  color: string
  gitInit?: boolean
}

export interface ProjectFormModalProps {
  mode: 'create' | 'edit'
  /** Semente do modo `edit`. */
  project?: ProjectRow
  onSubmit: (values: ProjectFormValues) => void
  onCancel: () => void
  /** Erro do backend: aparece na tela e o formulário continua aberto. */
  error: string | null
}

/**
 * Formulário de projeto, apresentacional: quem chama decide o que fazer com
 * os valores (`project_create_in` no wizard e em Configurações,
 * `project_update` na edição).
 *
 * O modo `edit` renderiza só nome e cor — trocar o `path` de um projeto
 * existente está fora de escopo (PROJ-20 AC4), e `git init` só faz sentido
 * numa pasta recém-criada.
 */
export default function ProjectFormModal({
  mode,
  project,
  onSubmit,
  onCancel,
  error,
}: ProjectFormModalProps) {
  const [name, setName] = useState(project?.name ?? '')
  const [baseDir, setBaseDir] = useState('')
  const [color, setColor] = useState<string>(project?.color ?? PALETTE[0])
  const [gitInit, setGitInit] = useState(false)

  const creating = mode === 'create'

  const handleBrowse = async () => {
    const selected = await open({ directory: true })
    // Cancelar o seletor deixa o campo como estava: apagar a escolha
    // anterior obrigaria o usuário a navegar tudo de novo.
    if (selected === null) return
    setBaseDir(Array.isArray(selected) ? selected[0] : selected)
  }

  const handleSubmit = () => {
    // Nome em branco não cria nada e não fecha o formulário (P2 AC9, P3 AC6).
    if (name.trim() === '') return
    onSubmit(creating ? { name, baseDir, color, gitInit } : { name, color })
  }

  return (
    <div className="app-dialog-backdrop">
      <style>{`
        .project-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          min-width: 340px;
          padding: 1.25rem 1.5rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 10px;
          background: var(--surface, #131318);
          color: var(--fg, #e8e8ea);
        }
        .project-form__title { margin: 0; font-size: 0.95rem; font-weight: 600; }
        .project-form__field { display: flex; flex-direction: column; gap: 0.3rem; }
        .project-form__field label { font-size: 0.75rem; color: var(--muted, #8a8a92); }
        .project-form__field input[type='text'] {
          padding: 0.4rem 0.55rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 6px;
          background: var(--surface-2, #0a0a0c);
          color: var(--fg, #e8e8ea);
          font-size: 0.8rem;
        }
        .project-form__dir { display: flex; gap: 0.4rem; align-items: center; }
        .project-form__dir input { flex: 1; }
        .project-form__colors { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .project-form__swatch {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          border: 2px solid transparent;
          cursor: pointer;
        }
        .project-form__swatch[aria-pressed='true'] { border-color: var(--fg, #e8e8ea); }
        .project-form__git { display: flex; gap: 0.4rem; align-items: center; font-size: 0.8rem; }
        .project-form__error { margin: 0; font-size: 0.75rem; color: #ef4444; }
        .project-form__actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
      `}</style>

      <div
        className="project-form"
        role="dialog"
        aria-label={creating ? 'novo projeto' : 'editar projeto'}
      >
        <h2 className="project-form__title">{creating ? 'Novo projeto' : 'Editar projeto'}</h2>

        <div className="project-form__field">
          <label htmlFor="project-form-name">Nome</label>
          <input
            id="project-form-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        {creating && (
          <div className="project-form__field">
            <label htmlFor="project-form-base-dir">Diretório base</label>
            <div className="project-form__dir">
              <input id="project-form-base-dir" type="text" value={baseDir} readOnly />
              <button type="button" onClick={handleBrowse}>
                escolher pasta
              </button>
            </div>
          </div>
        )}

        <div className="project-form__field">
          <span id="project-form-color-label">Cor</span>
          <div className="project-form__colors" role="group" aria-labelledby="project-form-color-label">
            {PALETTE.map((option) => (
              <button
                key={option}
                type="button"
                className="project-form__swatch"
                style={{ backgroundColor: option }}
                aria-label={`cor ${option}`}
                aria-pressed={option === color}
                onClick={() => setColor(option)}
              />
            ))}
          </div>
        </div>

        {creating && (
          <label className="project-form__git">
            <input
              type="checkbox"
              checked={gitInit}
              onChange={(event) => setGitInit(event.target.checked)}
            />
            Inicializar como repositório git
          </label>
        )}

        {error !== null && (
          <p className="project-form__error" role="alert">
            {error}
          </p>
        )}

        <div className="project-form__actions">
          <button type="button" onClick={onCancel}>
            cancelar
          </button>
          <button type="button" onClick={handleSubmit}>
            {creating ? 'criar' : 'salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
