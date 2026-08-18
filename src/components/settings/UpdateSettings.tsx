// SPEC: silent-update (SILENT-09, SILENT-10, SILENT-11, SILENT-12, SILENT-13, SILENT-25, SILENT-32, SILENT-33, SILENT-34, SILENT-37, SILENT-38, SILENT-40, SILENT-41, SILENT-42, SILENT-43, SILENT-44, SILENT-45)

import type { ReactNode } from 'react'
import { Download, RefreshCw, Sparkles } from 'lucide-react'

export type UpdateState =
  /** `current` pode chegar vazio no primeiro quadro, antes de `getVersion()`
   * resolver — a linha da versão só some nesse instante, nunca por causa da
   * consulta de rede (SILENT-33). */
  | { status: 'loading'; current: string }
  | { status: 'ready'; current: string; latest: string; hasUpdate: boolean }
  | { status: 'unavailable'; current: string }
  /** `total` é `null` quando o servidor não manda `Content-Length` — a barra
   * vira indeterminada em vez de mentir uma porcentagem (SILENT-37). */
  | { status: 'downloading'; current: string; latest: string; downloaded: number; total: number | null }
  | { status: 'downloaded'; current: string; latest: string }
  | { status: 'installing'; current: string; latest: string }
  | { status: 'installed'; version: string }
  | { status: 'error'; current: string; message: string }

export interface UpdateSettingsProps {
  state: UpdateState
  /** Corpo da release do GitHub (`notes` do manifesto), em Markdown. Vazio
   * quando a consulta falhou ou a release saiu sem notas (SILENT-42/43). */
  notes?: string
  autoCheckEnabled: boolean
  /** `true` enquanto uma consulta acionada por `onCheck` está em andamento (SILENT-34). */
  checking: boolean
  /** Persiste por fora (via `set_auto_check`, fora deste componente) — aqui só noticia a intenção. */
  onToggleAutoCheck: (enabled: boolean) => void
  /** Reconsulta o manifesto sob demanda (`update_status`), SILENT-32/33. */
  onCheck: () => void
  /** Baixa o artefato da versão nova (`update_download`), SILENT-37. */
  onDownload: () => void
  /** Instala o que já foi baixado (`update_install`), SILENT-39. */
  onInstall: () => void
  /** Reabre o app depois da troca aplicada (`update_restart`) — só por
   * clique do usuário, nunca sozinho (SILENT-40). */
  onRestart: () => void
}

function formatMb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1)
}

/** `**forte**`, `*ênfase*` e `` `código` `` — o resto sai literal. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>
      return part
    })
}

/**
 * Renderiza o subconjunto de Markdown que as notas de release usam de fato:
 * títulos `#`..`######`, itens `-`/`*` e parágrafos (SILENT-42). O gerador
 * é o nosso próprio `cliff.toml` (`### Grupo` + lista de commits), então o
 * subconjunto é conhecido e não justifica um parser de terceiros.
 *
 * ponytail: subconjunto fixo — trocar por um parser de verdade se as notas
 * passarem a ser escritas à mão com tabelas, blocos de código ou links.
 */
function renderNotes(markdown: string): ReactNode[] {
  const blocks: ReactNode[] = []
  let items: ReactNode[] = []

  const flush = () => {
    if (items.length === 0) return
    blocks.push(<ul key={`list-${blocks.length}`}>{items}</ul>)
    items = []
  }

  markdown.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    if (!line) {
      flush()
      return
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const Tag = (heading[1] ?? '').length <= 2 ? 'h4' : 'h5'
      blocks.push(<Tag key={index}>{inline(heading[2] ?? '')}</Tag>)
      return
    }

    const item = /^[-*]\s+(.*)$/.exec(line)
    if (item) {
      items.push(<li key={index}>{inline(item[1] ?? '')}</li>)
      return
    }

    flush()
    blocks.push(<p key={index}>{inline(line)}</p>)
  })

  flush()
  return blocks
}

/**
 * Seção "Atualizações" das configurações — mesmo padrão de `GeneralPanel.tsx`:
 * puramente apresentacional, recebe dados prontos via props e noticia
 * intenções via callback, nunca chama `invoke()` diretamente.
 *
 * Dois cartões: o de cima resume as versões (instalada e disponível, mesmo
 * quando iguais — SILENT-09..11); o de baixo só existe quando há versão nova
 * e carrega as notas da release e a ação primária (SILENT-42/44). O fluxo
 * confirmado tem dois cliques: "Baixar" (com barra de progresso) e depois
 * "Instalar" (SILENT-37/38). A instalação troca o executável com o app
 * rodando e NUNCA o reinicia — o botão "Reabrir agora" existe, mas só o
 * usuário o aciona (SILENT-40), porque fechar o app derrubaria os terminais
 * abertos. Não há ação de pular versão (SILENT-45).
 */
export default function UpdateSettings({
  state,
  notes = '',
  autoCheckEnabled,
  checking,
  onToggleAutoCheck,
  onCheck,
  onDownload,
  onInstall,
  onRestart,
}: UpdateSettingsProps) {
  // SILENT-32/33: a busca sob demanda vale enquanto a tela está mostrando
  // versão — some durante o download/instalação e depois deles, quando o
  // número em tela já é o da versão recém-aplicada e reconsultar não decide
  // mais nada. `loading` entra aqui porque a consulta de abertura pode
  // demorar (ou falhar) e o botão é justamente a saída.
  const canCheck =
    state.status !== 'downloading' && state.status !== 'installing' && state.status !== 'installed'
  const busy = checking || state.status === 'loading'
  const percent =
    state.status === 'downloading' && state.total
      ? Math.min(100, Math.round((state.downloaded / state.total) * 100))
      : null

  // SILENT-44: o cartão da versão nova sobrevive ao download e à instalação —
  // as notas continuam à vista enquanto a ação primária troca de "Baixar"
  // para "Instalar".
  const pending =
    state.status === 'ready' && state.hasUpdate
      ? state.latest
      : state.status === 'downloading' || state.status === 'downloaded' || state.status === 'installing'
        ? state.latest
        : null

  return (
    <div className="update-settings">
      <style>{`
        .update-settings { max-width: 46rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .update-settings__title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 0.25rem;
          font-size: 1.05rem;
        }
        .update-settings__title svg { color: var(--accent); }
        .update-settings__card {
          border: 1px solid #26262c;
          border-radius: 10px;
          background: #151518;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .update-settings__info { margin: 0; display: flex; align-items: baseline; gap: 0.5rem; }
        .update-settings__info dt { color: var(--muted); font-size: 0.8125rem; }
        .update-settings__info dd {
          margin: 0;
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
          font-size: 0.875rem;
        }
        .update-settings__message {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8125rem;
          color: var(--muted);
        }
        .update-settings__message svg { color: var(--accent); flex: 0 0 auto; }
        .update-settings__message--error { color: var(--danger); }
        .update-settings__check-now {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          border: 1px solid #2f2f37;
          border-radius: 8px;
          background: #1c1c21;
          color: var(--fg);
          font-size: 0.8125rem;
          cursor: pointer;
        }
        .update-settings__check-now:hover:not(:disabled) { border-color: #3a3a44; }
        .update-settings__check-now:disabled { opacity: 0.6; cursor: default; }

        .update-settings__release-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
        .update-settings__release-version { margin: 0; font-size: 0.8125rem; color: var(--muted); }
        .update-settings__release-version code {
          color: var(--accent);
          font-size: 0.8125rem;
        }
        /* As notas vêm da release e podem ser longas: a rolagem é da seção,
           para o botão de ação continuar visível sem rolar a tela toda. */
        .update-settings__notes {
          max-height: 15rem;
          overflow-y: auto;
          padding: 0.75rem 0.9rem;
          border: 1px solid #232329;
          border-radius: 8px;
          background: #101013;
          font-size: 0.8125rem;
          line-height: 1.5;
        }
        .update-settings__notes h4 { margin: 0.75rem 0 0.35rem; font-size: 0.875rem; }
        .update-settings__notes h5 { margin: 0.75rem 0 0.35rem; font-size: 0.8125rem; color: var(--accent); }
        .update-settings__notes > :first-child { margin-top: 0; }
        .update-settings__notes p { margin: 0.35rem 0; color: var(--fg); }
        .update-settings__notes ul { margin: 0.35rem 0; padding-left: 1.1rem; }
        .update-settings__notes li { margin: 0.2rem 0; }
        .update-settings__notes code {
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
          font-size: 0.78rem;
        }

        .update-settings__action {
          align-self: stretch;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.6rem 1rem;
          border: none;
          border-radius: 8px;
          background: var(--accent);
          color: #17170f;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
        }
        .update-settings__action:disabled { opacity: 0.6; cursor: default; }
        .update-settings__progress { width: 100%; height: 0.4rem; }

        .update-settings__auto-check {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8125rem;
        }
        .update-settings__explainer { margin: 0; color: var(--muted); font-size: 0.75rem; line-height: 1.5; }
      `}</style>

      <h2 className="update-settings__title">
        <Download size={18} aria-hidden="true" />
        Atualizações
      </h2>

      <div className="update-settings__card">
        <dl className="update-settings__info">
          <dt>Versão instalada</dt>
          <dd>{state.status === 'installed' ? state.version : state.current || '—'}</dd>
        </dl>

        {state.status === 'ready' && !state.hasUpdate && (
          <p className="update-settings__message" role="status">
            Você já está na versão mais recente.
          </p>
        )}

        {pending && (
          <p className="update-settings__message" role="status">
            <Sparkles size={14} aria-hidden="true" />
            Atualização disponível!
          </p>
        )}

        {state.status === 'installed' && (
          <p className="update-settings__message" role="status">
            Versão {state.version} instalada. Reabra o SwarmDeck quando quiser para começar a usá-la
            — seus terminais continuam abertos até lá.
          </p>
        )}

        {state.status === 'unavailable' && (
          <p className="update-settings__message" role="status">
            Não foi possível consultar a versão mais recente. Confira sua conexão.
          </p>
        )}

        {state.status === 'error' && (
          <p className="update-settings__message update-settings__message--error" role="alert">
            Não foi possível atualizar. ({state.message})
          </p>
        )}

        {canCheck && (
          <button type="button" className="update-settings__check-now" onClick={onCheck} disabled={busy}>
            <RefreshCw size={14} aria-hidden="true" />
            {busy ? 'Verificando…' : 'Buscar atualizações'}
          </button>
        )}

        {state.status === 'installed' && (
          <button type="button" className="update-settings__action" onClick={onRestart}>
            Reabrir agora
          </button>
        )}
      </div>

      {pending && (
        <section className="update-settings__card">
          <h3 className="update-settings__release-title">Nova versão disponível</h3>
          <p className="update-settings__release-version">
            Versão <code>{pending}</code>
          </p>

          {notes.trim() && <div className="update-settings__notes">{renderNotes(notes)}</div>}

          {state.status === 'ready' && (
            <button type="button" className="update-settings__action" onClick={onDownload}>
              <Download size={16} aria-hidden="true" />
              Baixar
            </button>
          )}

          {state.status === 'downloading' && (
            <>
              <p className="update-settings__message" role="status">
                {percent === null
                  ? `Baixando a versão ${state.latest}… (${formatMb(state.downloaded)} MB)`
                  : `Baixando a versão ${state.latest}… ${percent}%`}
              </p>
              <progress
                className="update-settings__progress"
                aria-label={`Baixando a versão ${state.latest}`}
                {...(state.total ? { value: state.downloaded, max: state.total } : {})}
              />
            </>
          )}

          {state.status === 'downloaded' && (
            <>
              <p className="update-settings__message" role="status">
                Versão {state.latest} baixada e verificada.
              </p>
              <button type="button" className="update-settings__action" onClick={onInstall}>
                Instalar
              </button>
            </>
          )}

          {state.status === 'installing' && (
            <>
              <p className="update-settings__message" role="status">
                Instalando a versão {state.latest}…
              </p>
              <button type="button" className="update-settings__action" disabled>
                Instalar
              </button>
            </>
          )}
        </section>
      )}

      <label className="update-settings__auto-check">
        <input
          type="checkbox"
          checked={autoCheckEnabled}
          onChange={() => onToggleAutoCheck(!autoCheckEnabled)}
        />
        Verificar atualizações automaticamente
      </label>

      <p className="update-settings__explainer">
        A verificação automática roda ao abrir o SwarmDeck e a cada hora, sem baixar nada sozinha.
        Baixar e instalar são dois passos seus. A instalação acontece em silêncio, com o app aberto,
        e o SwarmDeck só é fechado quando você mandar.
      </p>
    </div>
  )
}
