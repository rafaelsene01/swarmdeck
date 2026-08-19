// SPEC: editor-launch (EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04)

import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { FolderCode } from 'lucide-react'
import EditorGlyph from './EditorGlyph'

/** Espelha `EditorEntry` de `src-tauri/src/commands/editors.rs`. */
export interface EditorEntry {
  id: string
  name: string
}

export interface EditorMenuProps {
  /** Pasta do terminal — é ela que o editor escolhido abre (EDITOR-04).
   * `undefined` desabilita o botão: sem pasta não há o que abrir. */
  cwd?: string
}

/** Posição do popover na viewport. `position: fixed` de propósito: dentro do
 * cabeçalho o popover cairia sobre a camada de scroll do xterm.js, que não
 * tem clipping e intercepta cliques (mesmo problema já documentado em
 * `App.tsx` para o diálogo de restauração). Ancorar na viewport tira o popover
 * do fluxo do painel e do contexto de empilhamento dele. */
interface Anchor {
  top: number
  right: number
}

/**
 * Botão "abrir no editor" da barra de título do terminal (EDITOR-01) e seu
 * popover com os editores instalados na máquina (EDITOR-02).
 *
 * O catálogo é buscado a cada abertura, não no mount: instalar um editor com
 * o app aberto passa a valer na próxima vez que o popover abrir, e um
 * terminal que nunca usa o botão não paga varredura de PATH nenhuma.
 */
export default function EditorMenu({ cwd }: EditorMenuProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  /** `null` enquanto a busca não voltou — é o que separa "carregando" de
   * "nenhum editor encontrado" (EDITOR-03). */
  const [editors, setEditors] = useState<EditorEntry[] | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Escape e clique fora fecham — mesmo mecanismo do `LayoutMenu`.
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open])

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }

    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setAnchor({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
    }
    setEditors(null)
    setOpen(true)
    // Falha de IPC vira lista vazia: o popover diz "nenhum editor
    // encontrado" (EDITOR-03) em vez de ficar preso em "procurando…".
    void invoke<EditorEntry[]>('editor_catalog')
      .then(setEditors)
      .catch(() => setEditors([]))
  }

  const choose = (id: string) => {
    setOpen(false)
    if (!cwd) return
    void invoke('editor_open', { id, cwd }).catch(() => {})
  }

  return (
    <>
      <style>{`
        .editor-menu__popover {
          position: fixed;
          width: max-content;
          min-width: 190px;
          max-height: 60vh;
          overflow-y: auto;
          padding: 0.3rem;
          background: #17171a;
          color: var(--fg);
          border: 1px solid #2b2b31;
          border-radius: 10px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
          font-size: 0.8125rem;
          z-index: 1100;
        }
        .editor-menu__head {
          padding: 0.35rem 0.5rem 0.45rem;
          font-size: 0.6875rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .editor-menu__item {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          width: 100%;
          padding: 0.42rem 0.5rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 7px;
          color: var(--fg);
          font: inherit;
          text-align: left;
          white-space: nowrap;
          cursor: pointer;
        }
        /* Slot fixo: os nomes começam todos na mesma coluna, seja qual for a
           largura do desenho da marca. */
        .editor-menu__item svg { flex: 0 0 16px; }
        .editor-menu__item:hover { background: rgba(255, 255, 255, 0.07); }
        .editor-menu__item:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -1px;
        }
        .editor-menu__empty {
          padding: 0.45rem 0.5rem 0.6rem;
          color: var(--muted);
          max-width: 220px;
          line-height: 1.35;
        }
      `}</style>

      <button
        type="button"
        ref={buttonRef}
        aria-label="abrir pasta no editor"
        title={cwd ? `Abrir ${cwd} num editor de código` : 'Abrir num editor de código'}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!cwd}
        onClick={toggle}
      >
        <FolderCode size={13} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="editor-menu__popover"
          role="menu"
          style={{ top: anchor?.top ?? 0, right: anchor?.right ?? 8 }}
        >
          <div className="editor-menu__head">Abrir no editor</div>

          {editors === null && <div className="editor-menu__empty">Procurando editores…</div>}

          {editors?.length === 0 && (
            // EDITOR-03: lista vazia é uma resposta, não um popover em branco.
            <div className="editor-menu__empty">
              Nenhum editor encontrado no PATH. Instale o comando de linha do
              seu editor (ex.: “Shell Command: Install ‘code’ command”).
            </div>
          )}

          {editors?.map((editor) => (
            <button
              key={editor.id}
              type="button"
              role="menuitem"
              className="editor-menu__item"
              onClick={() => choose(editor.id)}
            >
              <EditorGlyph id={editor.id} size={16} />
              {editor.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
