// SPEC: release-distribution (REL-20, REL-23, REL-26)

import { useState } from 'react'

export interface UpdateBannerProps {
  /** `null` = nenhuma atualização para anunciar, nada é renderizado. */
  update: { version: string; notes: string } | null
  /** Quantos terminais estão ativos agora — decide se "Atualizar" pede confirmação (REL-26). */
  activeTerminalCount: number
  /** Progresso do download (0-100). Presente = substitui os 3 botões por um indicador. */
  downloadProgress?: number
  onUpdateNow: () => void
  onLater: () => void
  onSkip: () => void
}

/**
 * Banner não bloqueante de atualização disponível — puramente
 * apresentacional (mesmo padrão de `TerminalHeader.tsx` /
 * `NewTerminalDialog.tsx`): recebe dados prontos via props e noticia
 * intenções via callback, nunca chama `invoke()` diretamente.
 *
 * "Depois" esconde o banner localmente nesta sessão (REL-20) sem depender
 * de o pai voltar a passar `update: null`. "Pular" (REL-23) só noticia a
 * intenção — persistir cabe a quem intercepta `onSkip` fora deste
 * componente, chamando o comando `update_skip_version`.
 */
export default function UpdateBanner({
  update,
  activeTerminalCount,
  downloadProgress,
  onUpdateNow,
  onLater,
  onSkip,
}: UpdateBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)

  if (update === null || dismissed) {
    return null
  }

  const handleLater = () => {
    onLater()
    setDismissed(true)
  }

  const handleUpdateNow = () => {
    if (activeTerminalCount > 0) {
      setConfirmingClose(true)
      return
    }
    onUpdateNow()
  }

  const handleConfirmUpdateNow = () => {
    setConfirmingClose(false)
    onUpdateNow()
  }

  return (
    <div className="update-banner" role="status">
      <div className="update-banner__info">
        <span className="update-banner__version">Nova versão disponível: {update.version}</span>
        <p className="update-banner__notes">{update.notes}</p>
      </div>

      {downloadProgress !== undefined ? (
        <div className="update-banner__progress" role="progressbar" aria-valuenow={downloadProgress} aria-valuemin={0} aria-valuemax={100}>
          <div className="update-banner__progress-bar" style={{ width: `${downloadProgress}%` }} />
          <span className="update-banner__progress-label">{downloadProgress}%</span>
        </div>
      ) : confirmingClose ? (
        <div className="update-banner__confirm">
          <span>Os terminais ativos serão encerrados. Continuar?</span>
          <button type="button" onClick={handleConfirmUpdateNow}>
            confirmar
          </button>
          <button type="button" onClick={() => setConfirmingClose(false)}>
            cancelar
          </button>
        </div>
      ) : (
        <div className="update-banner__actions">
          <button type="button" onClick={handleUpdateNow}>
            Atualizar
          </button>
          <button type="button" onClick={handleLater}>
            Depois
          </button>
          <button type="button" onClick={onSkip}>
            Pular
          </button>
        </div>
      )}
    </div>
  )
}
