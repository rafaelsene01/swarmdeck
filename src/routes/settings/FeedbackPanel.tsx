// SPEC: feedback-form (FEED-02, FEED-03, FEED-04, FEED-05, FEED-06, FEED-07, FEED-08, FEED-09, FEED-10, FEED-11, FEED-12, FEED-13, FEED-14, FEED-15)

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, MessageSquare, Send, X } from 'lucide-react'
import { renderMarkdown } from '../../lib/markdown'

/** Ids estáveis em inglês: é o que a fase 2 mandará ao backend. Os rótulos
 * seguem a UI do app, toda em pt-BR. */
export const FEEDBACK_CATEGORIES = [
  { id: 'general', label: 'Feedback geral' },
  { id: 'bug', label: 'Relatar bug' },
  { id: 'feature', label: 'Pedido de recurso' },
  { id: 'improvement', label: 'Sugestão de melhoria' },
] as const

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]['id']

/** FEED-03: veio do print de referência (`0 / 255`). */
const TITLE_MAX = 255

/** FEED-13: "Escrever" é a aba da montagem — quem abre a seção vai digitar. */
const TABS = [
  { id: 'write', label: 'Escrever' },
  { id: 'preview', label: 'Visualizar' },
] as const

type TabId = (typeof TABS)[number]['id']

/** FEED-09/AD-031: o clique no primário não simula sucesso — ele diz que o
 * envio ainda não existe. Silêncio leria como tela quebrada. */
const NOT_IMPLEMENTED =
  'O envio ainda não foi implementado — nada saiu desta máquina. Seu texto continua aqui.'

/** FEED-07/FEED-08: os dois tetos do pedido. */
const MAX_FILES = 5
const MAX_BYTES = 10 * 1024 * 1024

/** Mesmo formato de `UpdateSettings.tsx` para tamanho de arquivo. */
function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface Attachment {
  /** Chave de render: o mesmo arquivo pode entrar duas vezes (assunção da
   * spec), então nome e tamanho não identificam a entrada. */
  key: number
  file: File
  url: string
}

/**
 * FEED-07/FEED-08/FEED-11: aplica as três regras de recusa a um lote, na
 * ordem tipo → tamanho → teto da lista. Pura, para os limites serem testáveis
 * sem montar o painel; devolve os aceitos e o nome de cada recusado com o
 * motivo.
 */
export function partitionFiles(
  current: number,
  files: File[],
): { accepted: File[]; rejected: string[] } {
  const accepted: File[] = []
  const rejected: string[] = []

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      rejected.push(`${file.name} não é uma imagem`)
      continue
    }
    if (file.size > MAX_BYTES) {
      rejected.push(`${file.name} passa de 10 MB`)
      continue
    }
    if (current + accepted.length >= MAX_FILES) {
      rejected.push(`${file.name} excede o limite de ${MAX_FILES} imagens`)
      continue
    }
    accepted.push(file)
  }

  return { accepted, rejected }
}

const PANEL_STYLES = `
  /* As medidas seguem print/feadback.png e o formato de ProjectsPanel:
     cabeçalho com ícone e descrição, campos empilhados num cartão só. */
  .feedback-panel { display: flex; flex-direction: column; gap: 1.25rem; max-width: 46rem; }
  .feedback-panel__heading { display: flex; gap: 0.7rem; }
  .feedback-panel__heading-icon { color: var(--accent, #f5b700); flex: 0 0 auto; margin-top: 0.15rem; }
  .feedback-panel__title { margin: 0; font-size: 1rem; font-weight: 600; letter-spacing: -0.01em; }
  .feedback-panel__subtitle { margin: 0.25rem 0 0; font-size: 0.8rem; line-height: 1.4; color: var(--muted, #8a8a92); }

  .feedback-panel__form { display: flex; flex-direction: column; gap: 1.1rem; }
  .feedback-panel__field { display: flex; flex-direction: column; gap: 0.4rem; }
  .feedback-panel__label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--fg, #e8e8ea);
  }
  /* Obrigatório marcado por texto, não só por cor: a estrela sozinha depende
     de convenção, e cor sozinha reprova em acessibilidade. O "(obrigatório)"
     fica fora da tela, para leitor de tela e para o nome acessível do campo. */
  .feedback-panel__required { color: var(--accent, #f5b700); font-weight: 700; }
  .feedback-panel__sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  .feedback-panel__counter {
    font-size: 0.72rem;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    color: var(--muted, #8a8a92);
  }
  .feedback-panel__control {
    width: 100%;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border, #26262d);
    border-radius: 8px;
    background: var(--surface-2, #0a0a0c);
    color: var(--fg, #e8e8ea);
    font-family: inherit;
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .feedback-panel__control::placeholder { color: var(--muted, #8a8a92); }
  .feedback-panel__control:focus-visible {
    outline: 2px solid var(--accent, #f5b700);
    outline-offset: 1px;
    border-color: var(--accent, #f5b700);
  }
  /* 44px de alvo: a regra de toque vale mesmo no desktop, onde ela vira
     conforto de mira. */
  select.feedback-panel__control { min-height: 44px; cursor: pointer; }

  /* FEED-13: abas coladas na borda de cima do campo, como no GitHub —
     escrever e visualizar ocupam o mesmo retângulo, então a troca não
     empurra o resto do formulário. */
  .feedback-panel__tablist { display: flex; gap: 0.25rem; }
  .feedback-panel__tab {
    min-height: 44px;
    padding: 0.5rem 0.9rem;
    border: 1px solid transparent;
    border-radius: 8px 8px 0 0;
    background: transparent;
    color: var(--muted, #8a8a92);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 120ms ease, color 120ms ease;
  }
  .feedback-panel__tab:hover { color: var(--fg, #e8e8ea); }
  .feedback-panel__tab[aria-selected='true'] {
    border-color: var(--border, #26262d);
    border-bottom-color: transparent;
    background: var(--surface-2, #0a0a0c);
    color: var(--fg, #e8e8ea);
    font-weight: 600;
  }
  .feedback-panel__tab:focus-visible { outline: 2px solid var(--accent, #f5b700); outline-offset: -2px; }
  .feedback-panel__tabpanel { margin-top: -1px; }
  textarea.feedback-panel__control {
    min-height: 11rem;
    border-top-left-radius: 0;
    resize: vertical;
  }
  /* O preview ocupa a mesma caixa do textarea para a troca de aba não
     redimensionar o formulário. */
  .feedback-panel__preview {
    min-height: 11rem;
    max-height: 22rem;
    overflow-y: auto;
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--border, #26262d);
    border-radius: 0 8px 8px 8px;
    background: var(--surface-2, #0a0a0c);
    font-size: 0.85rem;
    line-height: 1.55;
  }
  .feedback-panel__preview > :first-child { margin-top: 0; }
  .feedback-panel__preview > :last-child { margin-bottom: 0; }
  .feedback-panel__preview h4 { margin: 0.9rem 0 0.35rem; font-size: 0.95rem; }
  .feedback-panel__preview h5 { margin: 0.9rem 0 0.35rem; font-size: 0.85rem; color: var(--accent, #f5b700); }
  .feedback-panel__preview p { margin: 0.4rem 0; }
  .feedback-panel__preview ul,
  .feedback-panel__preview ol { margin: 0.4rem 0; padding-left: 1.2rem; }
  .feedback-panel__preview li { margin: 0.2rem 0; }
  .feedback-panel__preview blockquote {
    margin: 0.5rem 0;
    padding: 0.1rem 0 0.1rem 0.75rem;
    border-left: 3px solid var(--border, #26262d);
    color: var(--muted, #8a8a92);
  }
  .feedback-panel__preview pre {
    margin: 0.5rem 0;
    padding: 0.6rem 0.7rem;
    overflow-x: auto;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.35);
  }
  .feedback-panel__preview code {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.78rem;
  }
  .feedback-panel__preview-empty { margin: 0; font-size: 0.8rem; color: var(--muted, #8a8a92); }

  /* FEED-06: o input nativo fica escondido e o botão é o alvo visível — o
     input cru não aceita estilo e não tem alvo de 44px. */
  .feedback-panel__file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  .feedback-panel__pick {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.5rem 0.9rem;
    border: 1px dashed var(--border, #26262d);
    border-radius: 8px;
    background: var(--surface-2, #0a0a0c);
    color: var(--fg, #e8e8ea);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition: border-color 120ms ease, color 120ms ease;
  }
  .feedback-panel__pick:hover:not(:disabled) { border-color: var(--accent, #f5b700); }
  .feedback-panel__pick:focus-visible { outline: 2px solid var(--accent, #f5b700); outline-offset: 1px; }
  .feedback-panel__pick:disabled { opacity: 0.45; cursor: not-allowed; }
  .feedback-panel__hint { margin: 0; font-size: 0.72rem; color: var(--muted, #8a8a92); }
  .feedback-panel__rejected { margin: 0; font-size: 0.75rem; line-height: 1.45; color: var(--danger, #f87171); }
  .feedback-panel__thumbs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.6rem;
  }
  .feedback-panel__thumb {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.4rem;
    border: 1px solid var(--border, #26262d);
    border-radius: 8px;
    background: var(--surface-2, #0a0a0c);
  }
  .feedback-panel__thumb img {
    width: 100%;
    height: 5.5rem;
    object-fit: cover;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.35);
  }
  .feedback-panel__thumb-name {
    font-size: 0.72rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .feedback-panel__thumb-size { font-size: 0.68rem; color: var(--muted, #8a8a92); }
  .feedback-panel__thumb-remove {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.55);
    color: var(--fg, #e8e8ea);
    cursor: pointer;
    transition: background 120ms ease, color 120ms ease;
  }
  .feedback-panel__thumb-remove:hover { background: rgba(248, 113, 113, 0.35); color: var(--danger, #f87171); }
  .feedback-panel__thumb-remove:focus-visible { outline: 2px solid var(--accent, #f5b700); outline-offset: -2px; }

  .feedback-panel__actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    padding-top: 0.25rem;
  }
  .feedback-panel__submit,
  .feedback-panel__reset {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.5rem 1.1rem;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: filter 120ms ease, background 120ms ease;
  }
  .feedback-panel__submit {
    border: none;
    background: var(--accent, #f5b700);
    color: #1a1400;
  }
  .feedback-panel__submit:hover:not(:disabled) { filter: brightness(1.08); }
  .feedback-panel__reset {
    border: 1px solid var(--border, #26262d);
    background: transparent;
    color: var(--fg, #e8e8ea);
    font-weight: 500;
  }
  .feedback-panel__reset:hover:not(:disabled) { background: rgba(255, 255, 255, 0.06); }
  .feedback-panel__submit:disabled,
  .feedback-panel__reset:disabled { opacity: 0.45; cursor: not-allowed; }
  .feedback-panel__submit:focus-visible,
  .feedback-panel__reset:focus-visible { outline: 2px solid var(--accent, #f5b700); outline-offset: 2px; }
  .feedback-panel__notice { margin: 0; font-size: 0.78rem; line-height: 1.45; color: var(--muted, #8a8a92); }
`

/**
 * Seção "Feedback" das configurações — puramente apresentacional e local, no
 * mesmo padrão de `ProjectsPanel.tsx`. Nesta fase **nada sai da máquina**:
 * zero `invoke`, zero rede (FEED-12). O envio de verdade é fase 2 (AD-030).
 */
export default function FeedbackPanel() {
  const [category, setCategory] = useState<FeedbackCategory>('general')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tab, setTab] = useState<TabId>('write')

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nextKey = useRef(0)

  /** `URL.revokeObjectURL` pode não existir no ambiente (edge case da spec):
   * a miniatura some do mesmo jeito. */
  const revoke = (url: string) => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ambiente sem revoke — a lista já foi podada */
    }
  }

  /** FEED-09: só título e descrição gateiam o envio; espaço em branco conta
   * como vazio. */
  const canSubmit = title.trim() !== '' && description.trim() !== ''
  const isPristine =
    category === 'general' &&
    title === '' &&
    description === '' &&
    tab === 'write' &&
    attachments.length === 0 &&
    rejected.length === 0 &&
    notice === null

  const resetForm = () => {
    attachments.forEach((attachment) => revoke(attachment.url))
    setCategory('general')
    setTitle('')
    setDescription('')
    setTab('write')
    setAttachments([])
    setRejected([])
    setNotice(null)
  }

  /** FEED-10: o desmonte também revoga. A ref segue a lista viva porque o
   * cleanup do efeito vazio roda uma vez só, com o valor do primeiro render. */
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  useEffect(() => () => attachmentsRef.current.forEach((attachment) => revoke(attachment.url)), [])

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? [])
    // Cancelar o diálogo não dispara `change`; um lote vazio ainda assim não
    // pode apagar a lista atual nem a mensagem anterior (edge case da spec).
    if (picked.length === 0) return

    const { accepted, rejected: refused } = partitionFiles(attachments.length, picked)
    if (accepted.length > 0) {
      setAttachments((current) => [
        ...current,
        ...accepted.map((file) => ({ key: nextKey.current++, file, url: URL.createObjectURL(file) })),
      ])
    }
    setRejected(refused)
    // Zera o input para que escolher o mesmo arquivo de novo continue
    // disparando `change`.
    event.target.value = ''
  }

  const removeAttachment = (key: number) => {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.key === key)
      if (target) revoke(target.url)
      return current.filter((attachment) => attachment.key !== key)
    })
  }

  return (
    <div className="feedback-panel">
      <style>{PANEL_STYLES}</style>

      <div className="feedback-panel__heading">
        <MessageSquare size={18} className="feedback-panel__heading-icon" aria-hidden="true" />
        <div>
          <h2 className="feedback-panel__title">Enviar feedback</h2>
          <p className="feedback-panel__subtitle">
            Relate um bug, peça um recurso ou conte o que dá para melhorar.
          </p>
        </div>
      </div>

      <div className="feedback-panel__form">
        <div className="feedback-panel__field">
          <label className="feedback-panel__label" htmlFor="feedback-category">
            Categoria
          </label>
          <select
            id="feedback-category"
            className="feedback-panel__control"
            value={category}
            onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
          >
            {FEEDBACK_CATEGORIES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="feedback-panel__field">
          <label className="feedback-panel__label" htmlFor="feedback-title">
            <span>
              Título <span className="feedback-panel__required" aria-hidden="true">*</span><span className="feedback-panel__sr-only">(obrigatório)</span>
            </span>
            <span className="feedback-panel__counter">
              {title.length} / {TITLE_MAX}
            </span>
          </label>
          <input
            id="feedback-title"
            type="text"
            className="feedback-panel__control"
            required
            maxLength={TITLE_MAX}
            placeholder="Resuma em uma linha"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="feedback-panel__field">
          <label className="feedback-panel__label" htmlFor="feedback-description">
            <span>
              Descrição <span className="feedback-panel__required" aria-hidden="true">*</span><span className="feedback-panel__sr-only">(obrigatório)</span>
            </span>
          </label>

          {/* FEED-13: as abas trocam o que o painel mostra; o texto vive no
              estado, então ir e voltar nunca o perde. */}
          <div className="feedback-panel__tablist" role="tablist" aria-label="Modo da descrição">
            {TABS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                id={`feedback-tab-${option.id}`}
                className="feedback-panel__tab"
                aria-selected={tab === option.id}
                aria-controls="feedback-description-panel"
                onClick={() => setTab(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div
            className="feedback-panel__tabpanel"
            role="tabpanel"
            id="feedback-description-panel"
            aria-labelledby={`feedback-tab-${tab}`}
          >
            {tab === 'write' ? (
              <textarea
                id="feedback-description"
                className="feedback-panel__control"
                required
                rows={8}
                placeholder="Descreva o que aconteceu. Markdown é aceito."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            ) : (
              <div className="feedback-panel__preview">
                {description.trim() ? (
                  renderMarkdown(description)
                ) : (
                  <p className="feedback-panel__preview-empty">Nada para visualizar ainda.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="feedback-panel__field">
          <span className="feedback-panel__label" id="feedback-attachments-label">
            Anexos
          </span>
          <p className="feedback-panel__hint">
            Até {MAX_FILES} imagens, de no máximo 10 MB cada.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            className="feedback-panel__file-input"
            accept="image/*"
            multiple
            aria-labelledby="feedback-attachments-label"
            onChange={handleFiles}
          />
          <button
            type="button"
            className="feedback-panel__pick"
            disabled={attachments.length >= MAX_FILES}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={15} aria-hidden="true" />
            Selecionar imagens
          </button>

          {/* FEED-09: a recusa é anunciada, não só pintada de vermelho. */}
          {rejected.length > 0 && (
            <p className="feedback-panel__rejected" role="alert">
              {rejected.join('; ')}
            </p>
          )}

          {attachments.length > 0 && (
            <ul className="feedback-panel__thumbs">
              {attachments.map((attachment) => (
                <li key={attachment.key} className="feedback-panel__thumb">
                  <img src={attachment.url} alt="" />
                  <span className="feedback-panel__thumb-name" title={attachment.file.name}>
                    {attachment.file.name}
                  </span>
                  <span className="feedback-panel__thumb-size">{formatMb(attachment.file.size)}</span>
                  <button
                    type="button"
                    className="feedback-panel__thumb-remove"
                    aria-label={`Remover ${attachment.file.name}`}
                    onClick={() => removeAttachment(attachment.key)}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="feedback-panel__actions">
          <button
            type="button"
            className="feedback-panel__submit"
            disabled={!canSubmit}
            onClick={() => setNotice(NOT_IMPLEMENTED)}
          >
            <Send size={15} aria-hidden="true" />
            Enviar feedback
          </button>
          <button
            type="button"
            className="feedback-panel__reset"
            disabled={isPristine}
            onClick={resetForm}
          >
            Limpar
          </button>
        </div>

        {/* FEED-09/AD-031: a região viva é montada desde o início e só o texto
            muda — um `role="status"` que nasce junto com o conteúdo costuma
            não ser anunciado. O mesmo elemento receberá o texto real de
            sucesso ou erro quando o envio existir. */}
        <p className="feedback-panel__notice" role="status">
          {notice}
        </p>
      </div>
    </div>
  )
}
