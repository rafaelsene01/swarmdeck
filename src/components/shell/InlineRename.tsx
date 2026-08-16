// SPEC: multi-terminal (TERM-06), terminal-tabs (TAB-06)

import { useState } from 'react'
import { Check, X } from 'lucide-react'

export interface InlineRenameProps {
  /** Valor inicial do campo. */
  value: string
  /** `aria-label` do input e base dos rótulos dos dois botões. */
  label: string
  /** Chamado com o texto já aparado. Texto vazio nunca chega aqui. */
  onCommit: (next: string) => void
  onCancel: () => void
}

/**
 * Campo de renomeação inline com confirmar/cancelar explícitos — o mesmo
 * componente serve à aba e ao cabeçalho do terminal, para que as duas
 * renomeações tenham teclas e botões idênticos.
 *
 * Não commita no `blur`: o clique em "cancelar" dispara o `blur` do input
 * antes do próprio clique, e um commit ali desfaria o cancelamento.
 * Confirmar é Enter ou ✓; cancelar é Escape ou ✗.
 */
export default function InlineRename({ value, label, onCommit, onCancel }: InlineRenameProps) {
  const [draft, setDraft] = useState(value)

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      onCancel()
      return
    }
    onCommit(trimmed)
  }

  return (
    <span className="inline-rename">
      <style>{`
        .inline-rename { display: inline-flex; align-items: center; gap: 0.2rem; }
        .inline-rename input {
          min-width: 6rem;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--accent);
          border-radius: 4px;
          color: var(--fg);
          font: inherit;
          padding: 0.05rem 0.3rem;
          outline: none;
        }
        .inline-rename button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          padding: 0.15rem;
          border-radius: 4px;
          color: var(--muted);
          cursor: pointer;
        }
        .inline-rename button:hover { background: rgba(255, 255, 255, 0.08); }
        .inline-rename__confirm:hover { color: var(--accent); }
      `}</style>
      <input
        value={draft}
        autoFocus
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        onClick={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        className="inline-rename__confirm"
        aria-label={`confirmar ${label}`}
        onClick={(event) => {
          event.stopPropagation()
          commit()
        }}
      >
        <Check size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`cancelar ${label}`}
        onClick={(event) => {
          event.stopPropagation()
          onCancel()
        }}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </span>
  )
}
