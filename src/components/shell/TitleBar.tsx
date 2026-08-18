// SPEC: window-chrome (WIN-01, WIN-02, WIN-03, WIN-04)

import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Barra de título própria — a nativa saiu com `decorations: false`
 * (`src-tauri/tauri.conf.json`). Escura como o resto do app (WIN-01), sem
 * ícone nem nome à esquerda (WIN-02); só os controles de janela à direita
 * (WIN-03). O arrasto é o `data-tauri-drag-region` nativo, sem JS.
 */
export default function TitleBar() {
  return (
    <div className="app-titlebar" data-tauri-drag-region>
      <style>{`
        .app-titlebar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          height: 32px;
          flex: 0 0 auto;
          background: var(--surface-2);
          border-bottom: 1px solid var(--surface);
          user-select: none;
        }
        .app-titlebar button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 46px;
          height: 100%;
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
        }
        .app-titlebar button:hover { background: var(--surface); color: var(--fg); }
        .app-titlebar button.app-titlebar__close:hover { background: var(--accent); color: var(--bg); }
      `}</style>

      <button type="button" aria-label="minimizar janela" onClick={() => void getCurrentWindow().minimize()}>
        <Minus size={16} />
      </button>
      <button
        type="button"
        aria-label="maximizar janela"
        onClick={() => void getCurrentWindow().toggleMaximize()}
      >
        <Square size={13} />
      </button>
      <button
        type="button"
        className="app-titlebar__close"
        aria-label="fechar janela"
        onClick={() => void getCurrentWindow().close()}
      >
        <X size={16} />
      </button>
    </div>
  )
}
