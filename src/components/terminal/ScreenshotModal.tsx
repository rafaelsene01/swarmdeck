// SPEC: terminal-screenshot (SHOT-14, SHOT-16, SHOT-17, SHOT-18, SHOT-19, SHOT-20, SHOT-21)

import { useEffect, useState } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { Copy, Download, X } from 'lucide-react'

export interface ScreenshotModalProps {
  blob: Blob
  /** Nome sugerido no seletor nativo de gravação (SHOT-16). */
  fileName: string
  onClose: () => void
}

/**
 * Pré-visualização do print, com salvar e copiar.
 *
 * O modal só fecha quando a ação conclui: cancelar o seletor de gravação ou
 * falhar a escrita mantém a imagem na tela e mostra o motivo inline
 * (SHOT-19, SHOT-20, SHOT-21). Fechar em falso sucesso perderia o print,
 * que não é recuperável — o buffer já andou.
 */
export default function ScreenshotModal({ blob, fileName, onClose }: ScreenshotModalProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // SHOT-16, SHOT-19, SHOT-20: seletor nativo, escrita pelo Rust, e o modal
  // permanece se o usuário cancelar ou a escrita falhar.
  const onSave = async () => {
    setError(null)
    try {
      const path = await save({ defaultPath: fileName })
      if (!path) return
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await invoke('screenshot_save', { path, bytes })
      onClose()
    } catch (cause) {
      setError(`não foi possível salvar: ${String(cause)}`)
    }
  }

  // SHOT-17, SHOT-21: recurso nativo da plataforma; o blob já está em mãos,
  // então não há `await` entre o clique e o `write`.
  const onCopy = async () => {
    setError(null)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      onClose()
    } catch (cause) {
      setError(`não foi possível copiar: ${String(cause)}`)
    }
  }

  return (
    <div
      className="screenshot-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <style>{`
        .screenshot-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(16px, 5vh, 56px) clamp(16px, 7vw, 120px);
          background: rgba(0, 0, 0, 0.62);
          backdrop-filter: blur(4px);
        }
        .screenshot-modal {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          max-width: min(90vw, 1000px);
          max-height: 85vh;
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--surface);
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.65);
        }
        .screenshot-modal__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .screenshot-modal__name {
          font-size: 0.8rem;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .screenshot-modal img {
          max-width: 100%;
          max-height: 60vh;
          object-fit: contain;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface-2);
        }
        .screenshot-modal__error { color: var(--danger); font-size: 0.8rem; }
        .screenshot-modal__foot {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .screenshot-modal button {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.7rem;
          border-radius: 6px;
          cursor: pointer;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .screenshot-modal__close {
          border: none;
          background: transparent;
          color: var(--muted);
          padding: 0.25rem;
        }
        .screenshot-modal__close:hover { color: var(--fg); }
        .screenshot-modal__copy {
          border: 1px solid var(--border);
          background: transparent;
          color: var(--fg);
        }
        .screenshot-modal__save {
          border: none;
          background: var(--accent);
          color: #0d0d0f;
        }
      `}</style>

      <div className="screenshot-modal" role="dialog" aria-modal="true" aria-label="Captura do terminal">
        <div className="screenshot-modal__head">
          <span className="screenshot-modal__name">{fileName}</span>
          <button type="button" className="screenshot-modal__close" onClick={onClose} aria-label="fechar">
            <X size={18} />
          </button>
        </div>

        {url && <img src={url} alt="Captura do terminal" />}

        {error && (
          <p className="screenshot-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="screenshot-modal__foot">
          <button type="button" className="screenshot-modal__copy" onClick={() => void onCopy()} autoFocus>
            <Copy size={16} />
            Copiar
          </button>
          <button type="button" className="screenshot-modal__save" onClick={() => void onSave()}>
            <Download size={16} />
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
