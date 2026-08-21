// SPEC: update-toast (TOAST-02, TOAST-04, TOAST-05, TOAST-06)

import { ArrowUpCircle, X } from 'lucide-react'

export interface UpdateToastProps {
  /** Versão anunciada pelo `update://available` — sai literal no texto (TOAST-04). */
  version: string
  /** Abre Configurações já na seção "Atualizações" (TOAST-06). */
  onOpen: () => void
  /** Fecha o aviso; quem decide que ele não volta nesta sessão é o `App` (TOAST-07). */
  onDismiss: () => void
}

/**
 * Aviso de nova versão, ancorado no rodapé da janela e centralizado.
 *
 * Sem auto-dismiss de propósito (TOAST-05): a decisão do usuário é abrir ou
 * fechar, e um aviso que some sozinho depois de alguns segundos é o que faz
 * o usuário nunca saber que existe uma versão nova — o problema que este
 * toast veio resolver, já que a bolinha do cabeçalho (REL-51) sozinha passa
 * despercebida.
 */
export default function UpdateToast({ version, onOpen, onDismiss }: UpdateToastProps) {
  return (
    <div className="update-toast" role="status" aria-live="polite">
      <style>{`
        .update-toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1200;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          max-width: min(520px, calc(100vw - 32px));
          padding: 0.65rem 0.75rem 0.65rem 0.9rem;
          background: var(--surface);
          color: var(--fg);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
        }
        .update-toast__icon { color: var(--accent); flex: 0 0 auto; }
        .update-toast__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .update-toast__title { font-size: 0.85rem; font-weight: 600; }
        .update-toast__version {
          font-size: 0.78rem;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .update-toast__open {
          flex: 0 0 auto;
          background: var(--accent);
          color: #1b1b0a;
          border: none;
          border-radius: 6px;
          padding: 0.35rem 0.75rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
        }
        .update-toast__close {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--muted);
          padding: 0.25rem;
          border-radius: 4px;
          cursor: pointer;
        }
        .update-toast__close:hover { color: var(--fg); }
      `}</style>

      <ArrowUpCircle size={18} className="update-toast__icon" aria-hidden="true" />

      <div className="update-toast__text">
        <span className="update-toast__title">Nova versão disponível</span>
        <span className="update-toast__version">SwarmDeck {version} já pode ser instalado.</span>
      </div>

      <button type="button" className="update-toast__open" onClick={onOpen}>
        Abrir
      </button>

      <button
        type="button"
        className="update-toast__close"
        onClick={onDismiss}
        aria-label="Fechar aviso de atualização"
      >
        <X size={16} />
      </button>
    </div>
  )
}
