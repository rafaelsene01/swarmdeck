// SPEC: silent-update (SILENT-09, SILENT-10, SILENT-11, SILENT-12, SILENT-13, SILENT-25, SILENT-32, SILENT-33, SILENT-34)

export type UpdateState =
  /** `current` pode chegar vazio no primeiro quadro, antes de `getVersion()`
   * resolver — a linha da versão só some nesse instante, nunca por causa da
   * consulta de rede (SILENT-33). */
  | { status: 'loading'; current: string }
  | { status: 'ready'; current: string; latest: string; hasUpdate: boolean; mode: 'installed' | 'portable' }
  | { status: 'unavailable'; current: string }
  | { status: 'applying'; current: string; latest: string }
  | { status: 'applied'; version: string }
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
  /** Baixa e aplica a atualização confirmada (`update_apply`). */
  onApply: () => void
  /** Reinicia o app depois de uma troca aplicada (`update_restart`). */
  onRestart: () => void
}

const MODE_LABEL: Record<'installed' | 'portable', string> = {
  installed: 'Instalado',
  portable: 'Portátil',
}

/**
 * Seção "Atualizações" das configurações — mesmo padrão de `GeneralPanel.tsx`:
 * puramente apresentacional, recebe dados prontos via props e noticia
 * intenções via callback, nunca chama `invoke()` diretamente.
 *
 * Mostra a versão instalada e a mais recente publicada lado a lado, mesmo
 * quando são iguais (SILENT-09..11) — nunca fica em silêncio sobre o
 * resultado da consulta. A atualização só é baixada mediante confirmação
 * explícita (`onApply`); nada acontece sozinho no fechamento do app.
 */
export default function UpdateSettings({
  state,
  autoCheckEnabled,
  checking,
  onToggleAutoCheck,
  onCheck,
  onApply,
  onRestart,
}: UpdateSettingsProps) {
  // SILENT-32/33: a busca sob demanda vale enquanto a tela está mostrando
  // versão — some só durante a própria troca (`applying`) e depois dela
  // (`applied`), quando o número em tela já é o da versão recém-aplicada e
  // reconsultar não decide mais nada. `loading` entra aqui porque a consulta
  // de abertura pode demorar (ou falhar) e o botão é justamente a saída.
  const canCheck = state.status !== 'applying' && state.status !== 'applied'
  const busy = checking || state.status === 'loading'

  return (
    <div className="update-settings">
      <h2 className="update-settings__title">Atualizações</h2>

      <dl className="update-settings__info">
        <div className="update-settings__info-row">
          <dt>Versão instalada</dt>
          <dd>
            {state.status === 'applied' ? state.version : state.current || '—'}
          </dd>
        </div>
        {state.status === 'ready' && (
          <div className="update-settings__info-row">
            <dt>Modo</dt>
            <dd>{MODE_LABEL[state.mode]}</dd>
          </div>
        )}
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
          <button type="button" onClick={onApply}>
            Baixar e atualizar
          </button>
        </div>
      )}

      {state.status === 'applying' && (
        <div className="update-settings__check">
          <p className="update-settings__message" role="status">
            Baixando e aplicando a versão {state.latest}…
          </p>
          <button type="button" disabled>
            Baixar e atualizar
          </button>
        </div>
      )}

      {state.status === 'applied' && (
        <div className="update-settings__check">
          <p className="update-settings__message" role="status">
            Atualizado para {state.version}. Reinicie para concluir.
          </p>
          <button type="button" onClick={onRestart}>
            Reiniciar agora
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
        Quando há uma versão nova, você decide quando baixar e aplicar — a troca do executável
        acontece na hora da confirmação, sem instalador, e vale assim que o app reiniciar.
      </p>
    </div>
  )
}
