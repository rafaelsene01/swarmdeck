// SPEC: silent-update (SILENT-09, SILENT-10, SILENT-11, SILENT-12, SILENT-13, SILENT-25, SILENT-32, SILENT-33, SILENT-34, SILENT-37, SILENT-38, SILENT-40, SILENT-41)

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

/**
 * Seção "Atualizações" das configurações — mesmo padrão de `GeneralPanel.tsx`:
 * puramente apresentacional, recebe dados prontos via props e noticia
 * intenções via callback, nunca chama `invoke()` diretamente.
 *
 * Mostra a versão instalada e a mais recente publicada lado a lado, mesmo
 * quando são iguais (SILENT-09..11). O fluxo confirmado tem dois cliques:
 * "Baixar" (com barra de progresso) e depois "Instalar" (SILENT-37/38). A
 * instalação troca o executável com o app rodando e NUNCA o reinicia — o
 * botão "Reabrir agora" existe, mas só o usuário o aciona (SILENT-40),
 * porque fechar o app derrubaria os terminais abertos.
 */
export default function UpdateSettings({
  state,
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

  return (
    <div className="update-settings">
      <h2 className="update-settings__title">Atualizações</h2>

      <dl className="update-settings__info">
        <div className="update-settings__info-row">
          <dt>Versão instalada</dt>
          <dd>
            {state.status === 'installed' ? state.version : state.current || '—'}
          </dd>
        </div>
      </dl>

      {canCheck && (
        <button type="button" className="update-settings__check-now" onClick={onCheck} disabled={busy}>
          {busy ? 'Verificando…' : 'Buscar atualizações'}
        </button>
      )}

      {state.status === 'ready' && !state.hasUpdate && (
        <p className="update-settings__message" role="status">
          Você já está na versão mais recente.
        </p>
      )}

      {state.status === 'ready' && state.hasUpdate && (
        <div className="update-settings__check">
          <p className="update-settings__message" role="status">
            Nova versão disponível: {state.latest}
          </p>
          <button type="button" onClick={onDownload}>
            Baixar
          </button>
        </div>
      )}

      {state.status === 'downloading' && (
        <div className="update-settings__check">
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
        </div>
      )}

      {state.status === 'downloaded' && (
        <div className="update-settings__check">
          <p className="update-settings__message" role="status">
            Versão {state.latest} baixada e verificada.
          </p>
          <button type="button" onClick={onInstall}>
            Instalar
          </button>
        </div>
      )}

      {state.status === 'installing' && (
        <div className="update-settings__check">
          <p className="update-settings__message" role="status">
            Instalando a versão {state.latest}…
          </p>
          <button type="button" disabled>
            Instalar
          </button>
        </div>
      )}

      {state.status === 'installed' && (
        <div className="update-settings__check">
          <p className="update-settings__message" role="status">
            Versão {state.version} instalada. Reabra o SwarmDeck quando quiser para começar a usá-la
            — seus terminais continuam abertos até lá.
          </p>
          <button type="button" onClick={onRestart}>
            Reabrir agora
          </button>
        </div>
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
