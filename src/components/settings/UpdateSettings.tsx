// SPEC: release-distribution (REL-32, REL-33, REL-34)

export type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up_to_date' }
  | { status: 'available'; version: string }
  | { status: 'error'; message: string }

export interface UpdateSettingsProps {
  installedVersion: string
  mode: 'installed' | 'portable'
  autoCheckEnabled: boolean
  checkState: CheckState
  /** Persiste por fora (via `set_auto_check`, fora deste componente) — aqui só noticia a intenção. */
  onToggleAutoCheck: (enabled: boolean) => void
  /** Sempre disponível, mesmo com `autoCheckEnabled: false` (REL-34). */
  onCheckNow: () => void
}

const MODE_LABEL: Record<UpdateSettingsProps['mode'], string> = {
  installed: 'Instalado',
  portable: 'Portátil',
}

/**
 * Seção "Atualizações" das configurações — mesmo padrão de `ProjectsPanel.tsx`:
 * puramente apresentacional, recebe dados prontos via props e noticia
 * intenções via callback, nunca chama `invoke()` diretamente.
 *
 * O botão "Verificar agora" fica sempre habilitado (exceto durante a própria
 * checagem), independente do toggle de verificação automática (REL-34): o
 * toggle controla só a checagem em background, não a manual. O resultado da
 * checagem é sempre comunicado explicitamente, inclusive quando o app já
 * está na versão mais recente (REL-33) — nunca fica em silêncio.
 */
export default function UpdateSettings({
  installedVersion,
  mode,
  autoCheckEnabled,
  checkState,
  onToggleAutoCheck,
  onCheckNow,
}: UpdateSettingsProps) {
  const isChecking = checkState.status === 'checking'

  return (
    <div className="update-settings">
      <h2 className="update-settings__title">Atualizações</h2>

      <dl className="update-settings__info">
        <div className="update-settings__info-row">
          <dt>Versão instalada</dt>
          <dd>{installedVersion}</dd>
        </div>
        <div className="update-settings__info-row">
          <dt>Modo</dt>
          <dd>{MODE_LABEL[mode]}</dd>
        </div>
      </dl>

      <div className="update-settings__check">
        <button type="button" disabled={isChecking} onClick={onCheckNow}>
          {isChecking ? 'Verificando…' : 'Verificar agora'}
        </button>

        {checkState.status === 'up_to_date' && (
          <p className="update-settings__message" role="status">
            Você já está na versão mais recente.
          </p>
        )}
        {checkState.status === 'available' && (
          <p className="update-settings__message" role="status">
            Nova versão disponível: {checkState.version}
          </p>
        )}
        {checkState.status === 'error' && (
          <p className="update-settings__message update-settings__message--error" role="alert">
            Não foi possível verificar. Confira sua conexão. ({checkState.message})
          </p>
        )}
      </div>

      <label className="update-settings__auto-check">
        <input
          type="checkbox"
          checked={autoCheckEnabled}
          onChange={() => onToggleAutoCheck(!autoCheckEnabled)}
        />
        Verificar atualizações automaticamente
      </label>

      <p className="update-settings__explainer">
        A verificação automática roda ao abrir o SwarmDeck e a cada hora. Quando há uma versão
        nova, o download acontece em segundo plano, sem interromper o que você está fazendo; a
        instalação só ocorre no próximo fechamento do app.
      </p>
    </div>
  )
}
