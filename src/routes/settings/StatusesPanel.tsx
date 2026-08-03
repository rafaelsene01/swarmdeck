// SPEC: terminal-statuses (STAT-02, STAT-03)

import { useState } from 'react'

/**
 * Espelha `StatusRecord` de `src-tauri/src/terminal/status_catalog.rs` (T1)
 * — o catálogo é a fonte única de verdade, este tipo só descreve a forma que
 * chega ao frontend via `invoke()` (buscado pelo componente pai, fora do
 * escopo desta tarefa, assim como `AgentDescriptor` em `AgentPanel.tsx`).
 */
export interface StatusRow {
  id: string
  label: string
  color: string
  instruction: string
  sortOrder: number
  enabled: boolean
  isDefault: boolean
}

export interface StatusesPanelProps {
  statuses: StatusRow[]
  /**
   * Quantos terminais conhecidos exibem cada status agora, por `id`. Usado
   * só para calcular o aviso do caso de borda ("QUANDO o usuário exclui um
   * status em uso ENTÃO o sistema DEVE informar quantos terminais foram
   * afetados") — quem monta o painel extrai isso de `TerminalMetaService`,
   * o mesmo dado que `status_catalog::delete` recebe via `current_statuses`
   * no backend. Um id ausente do mapa conta como 0.
   */
  terminalCountByStatus: Record<string, number>
  onCreate: (label: string, instruction: string) => void
  onEdit: (id: string, changes: { label: string; color: string; instruction: string }) => void
  onToggleEnabled: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  /** Chamado com a lista completa de ids na nova ordem (P1, critério 5). */
  onReorder: (orderedIds: string[]) => void
  onRestoreDefaults: () => void
}

/** Tamanho máximo da instrução exibida na linha antes de truncar. */
const INSTRUCTION_TRUNCATE_LENGTH = 60

/** Trunca a instrução para caber numa linha, com `...` no fim. */
export function truncateInstruction(
  instruction: string,
  maxLength: number = INSTRUCTION_TRUNCATE_LENGTH,
): string {
  if (instruction.length <= maxLength) return instruction
  return `${instruction.slice(0, maxLength).trimEnd()}...`
}

/**
 * Painel de configurações do catálogo de status — puramente apresentacional
 * (mesmo padrão de `ProjectsPanel.tsx` / `AgentPanel.tsx`): recebe o
 * catálogo pronto via props e noticia intenções via callback, nunca chama
 * `invoke()` diretamente. Quem monta este painel (fora do escopo desta
 * task) decide de onde vêm os dados e como persistir de volta.
 *
 * Arrastar usa a API HTML5 de drag-and-drop nativa (nenhuma dependência de
 * DnD estava instalada em `package.json`, e a task pede para não adicionar
 * uma nova sem necessidade). A ordem é estado local, atualizado
 * otimisticamente no drop e comunicado ao pai via `onReorder` — persistir de
 * fato é responsabilidade de quem recebe o callback.
 */
export default function StatusesPanel({
  statuses,
  terminalCountByStatus,
  onCreate,
  onEdit,
  onToggleEnabled,
  onDelete,
  onReorder,
  onRestoreDefaults,
}: StatusesPanelProps) {
  const [order, setOrder] = useState<string[]>(() =>
    [...statuses].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id),
  )
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editInstruction, setEditInstruction] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingRestore, setConfirmingRestore] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newInstruction, setNewInstruction] = useState('')

  const byId = new Map(statuses.map((s) => [s.id, s]))
  const orderedStatuses = order
    .map((id) => byId.get(id))
    .filter((s): s is StatusRow => s !== undefined)

  /**
   * Move `draggedId` para logo antes de `targetId` na ordem local, dispara
   * `onReorder` com a lista completa resultante. Soltar sobre a própria
   * linha, ou sem nada sendo arrastado, não faz nada.
   */
  const handleDrop = (targetId: string) => {
    if (draggedId === null || draggedId === targetId) {
      setDraggedId(null)
      return
    }
    const withoutDragged = order.filter((id) => id !== draggedId)
    const targetIndex = withoutDragged.indexOf(targetId)
    const next = [
      ...withoutDragged.slice(0, targetIndex),
      draggedId,
      ...withoutDragged.slice(targetIndex),
    ]
    setOrder(next)
    setDraggedId(null)
    onReorder(next)
  }

  const startEdit = (status: StatusRow) => {
    setEditingId(status.id)
    setEditLabel(status.label)
    setEditColor(status.color)
    setEditInstruction(status.instruction)
  }

  const saveEdit = () => {
    if (editingId === null) return
    onEdit(editingId, { label: editLabel, color: editColor, instruction: editInstruction })
    setEditingId(null)
  }

  const handleCreate = () => {
    if (!newLabel.trim() || !newInstruction.trim()) return
    onCreate(newLabel, newInstruction)
    setNewLabel('')
    setNewInstruction('')
  }

  const handleConfirmDelete = (id: string) => {
    onDelete(id)
    setDeletingId(null)
  }

  const handleConfirmRestore = () => {
    onRestoreDefaults()
    setConfirmingRestore(false)
  }

  return (
    <div className="statuses-panel">
      <ul className="statuses-panel__list">
        {orderedStatuses.map((status) => {
          const isEditing = editingId === status.id
          const isDeleting = deletingId === status.id
          const affectedCount = terminalCountByStatus[status.id] ?? 0

          return (
            <li
              key={status.id}
              className="statuses-panel__row"
              draggable
              onDragStart={() => setDraggedId(status.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(status.id)}
            >
              {isEditing ? (
                <div className="statuses-panel__edit-form">
                  <label htmlFor={`edit-label-${status.id}`}>Rótulo</label>
                  <input
                    id={`edit-label-${status.id}`}
                    type="text"
                    value={editLabel}
                    onChange={(event) => setEditLabel(event.target.value)}
                  />

                  <label htmlFor={`edit-color-${status.id}`}>Cor</label>
                  <input
                    id={`edit-color-${status.id}`}
                    type="text"
                    value={editColor}
                    onChange={(event) => setEditColor(event.target.value)}
                  />

                  <label htmlFor={`edit-instruction-${status.id}`}>Instrução</label>
                  <textarea
                    id={`edit-instruction-${status.id}`}
                    value={editInstruction}
                    onChange={(event) => setEditInstruction(event.target.value)}
                  />

                  <button type="button" onClick={saveEdit}>
                    salvar
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}>
                    cancelar
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className="statuses-panel__color"
                    style={{ backgroundColor: status.color }}
                    aria-hidden="true"
                  />
                  <span className="statuses-panel__label">{status.label}</span>
                  <span className="statuses-panel__instruction" title={status.instruction}>
                    {truncateInstruction(status.instruction)}
                  </span>

                  <input
                    type="checkbox"
                    className="statuses-panel__toggle"
                    checked={status.enabled}
                    onChange={() => onToggleEnabled(status.id, !status.enabled)}
                    aria-label={`Ativar/desativar ${status.label}`}
                  />

                  <button type="button" onClick={() => startEdit(status)}>
                    editar
                  </button>

                  {isDeleting ? (
                    <span className="statuses-panel__delete-confirm">
                      <span>
                        {affectedCount > 0
                          ? `${affectedCount} terminal(is) exibem este status agora e continuarão a exibi-lo. Excluir mesmo assim?`
                          : 'Excluir este status?'}
                      </span>
                      <button type="button" onClick={() => handleConfirmDelete(status.id)}>
                        confirmar
                      </button>
                      <button type="button" onClick={() => setDeletingId(null)}>
                        cancelar
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setDeletingId(status.id)}>
                      excluir
                    </button>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>

      <div className="statuses-panel__create">
        <label htmlFor="new-status-label">Rótulo</label>
        <input
          id="new-status-label"
          type="text"
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
        />

        <label htmlFor="new-status-instruction">Instrução</label>
        <input
          id="new-status-instruction"
          type="text"
          value={newInstruction}
          onChange={(event) => setNewInstruction(event.target.value)}
        />

        <button
          type="button"
          onClick={handleCreate}
          disabled={!newLabel.trim() || !newInstruction.trim()}
        >
          criar status
        </button>
      </div>

      {confirmingRestore ? (
        <div className="statuses-panel__restore-confirm">
          <span>Restaurar os 4 status padrão? Isso substitui as edições feitas neles.</span>
          <button type="button" onClick={handleConfirmRestore}>
            confirmar
          </button>
          <button type="button" onClick={() => setConfirmingRestore(false)}>
            cancelar
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmingRestore(true)}>
          restaurar padrões
        </button>
      )}
    </div>
  )
}
