// SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-26; QUOTA-31 — REVOKED by
// AD-044: a lista deixou de mostrar o catálogo inteiro), quota-provider-source
// (QSRC-01, QSRC-02, QSRC-03, QSRC-04, QSRC-07, QSRC-09)

import { ChevronDown, ChevronUp, Gauge } from 'lucide-react'
import ProviderIcon, { providerMeta } from '../../components/shell/ProviderIcon'
import type { ProviderRow } from './AgentPanel'
import type { ProfileCatalogEntry } from '../../types/agents'

/** Espelha `QuotaProvider` de `src-tauri/src/db/quota_prefs.rs`. A ordem do
 * vetor **é** a ordem de exibição no popover — não há campo de índice. */
export interface QuotaProviderPref {
  id: string
  enabled: boolean
  /**
   * SPEC: quota-provider-source (QSRC-04) — id do perfil de terminal de onde a
   * cota deste provedor é buscada. Ausente = o usuário não escolheu, e a busca
   * mantém a cadeia de candidatos de sempre (QSRC-06).
   */
  profileId?: string | null
}

export interface QuotaPrefs {
  enabled: boolean
  window: 'five_hour' | 'weekly' | 'both'
  /** Opcional na borda: um backend antigo (antes da migração 007) não manda
   * o campo, e a seção precisa abrir mesmo assim. */
  providers?: QuotaProviderPref[]
}

export interface GeneralPanelProps {
  prefs: QuotaPrefs
  /** Quem persiste é o `SettingsShell` (T14) — aqui só noticia a intenção,
   * mesmo contrato que `UpdateSettings` já segue. */
  onChange: (next: QuotaPrefs) => void
  /**
   * SPEC: quota-provider-source (QSRC-01) — o estado da última varredura, uma
   * entrada por provedor do catálogo (`provider_prefs_get`). Só quem tem
   * `foundIn` não vazio vira linha: o resto não está instalado em terminal
   * nenhum e não tem cota a mostrar.
   *
   * AD-044 revoga QUOTA-31, que mandava listar o catálogo inteiro com os
   * ausentes travados. Vazio (ou ainda carregando) = nenhuma linha.
   */
  providers?: ProviderRow[]
  /**
   * SPEC: quota-provider-source (QSRC-07) — perfis de terminal do app
   * (`agent_catalog_all`), usados para casar o rótulo de `foundIn` com o
   * `profileId` que é o valor persistido. Rótulo sem par aqui não vira opção.
   */
  profiles?: ProfileCatalogEntry[]
  /**
   * SPEC: quota-provider-source (QSRC-03) — perfil padrão do app. É o que fica
   * marcado quando o usuário ainda não escolheu, porque é ele que a busca tenta
   * primeiro nesse caso (QSRC-06) — marcar outro mentiria sobre de onde a cota
   * está vindo.
   */
  defaultProfileId?: string
}

const WINDOW_OPTIONS: ReadonlyArray<{ value: QuotaPrefs['window']; label: string }> = [
  { value: 'both', label: 'Ambos' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'five_hour', label: '5 horas' },
]

/**
 * Seção "Geral" das configurações: switch mestre, janela rastreada do anel
 * e a lista ordenada de provedores do popover (QUOTA-09, QUOTA-10,
 * QUOTA-26). Puramente apresentacional, mesmo molde de `UpdateSettings.tsx`
 * — não chama `invoke` diretamente.
 */
export default function GeneralPanel({
  prefs,
  onChange,
  providers = [],
  profiles = [],
  defaultProfileId,
}: GeneralPanelProps) {
  const providerList = prefs.providers ?? []

  /**
   * SPEC: quota-provider-source (QSRC-01) — só provedor achado pela varredura
   * vira linha. A ordem é a das prefs (é ela que ordena o popover, QUOTA-26) e
   * os achados que ainda não estão nas prefs entram no fim, na ordem do
   * catálogo — o mesmo encaixe que QUOTA-31 fazia, agora filtrado pelo que
   * existe na máquina.
   *
   * `locked` acompanha `hasQuota`: só o provedor com endpoint de consumo real
   * (Claude, hoje) tem o que ligar, desligar ou reordenar. Quando o segundo
   * provedor ganhar cota, `hasQuota` vira `true` e a linha destrava sozinha.
   *
   * A linha travada renderiza `false`, **mesmo que a preferência persistida
   * diga `true`** (é o caso de `codex-cli` e `opencode`, semeados como `true`
   * pela migração 007 — `db::quota_prefs::default_providers`). Um switch
   * marcado e desabilitado lê como "ligado e você não pode desligar", que é a
   * leitura errada: para esses provedores não há cota a mostrar (AD-033).
   */
  const foundById = new Map(
    providers.filter((provider) => provider.foundIn.length > 0).map((p) => [p.id, p]),
  )

  /**
   * SPEC: quota-provider-source (QSRC-07) — rótulo de `foundIn` casado com o
   * perfil de mesmo rótulo. `foundIn` guarda rótulos (PROV-02) e o valor
   * persistido é o `profileId`; casar aqui evita mudar o schema de
   * `provider_prefs` e o painel de Provedores, que já mostra esses rótulos.
   */
  const profileOptionsFor = (id: string) =>
    (foundById.get(id)?.foundIn ?? [])
      .map((label) => profiles.find((profile) => profile.label === label))
      .filter((profile): profile is ProfileCatalogEntry => Boolean(profile))

  const rows = [
    ...providerList.filter((provider) => foundById.has(provider.id)),
    ...[...foundById.keys()]
      .filter((id) => !providerList.some((provider) => provider.id === id))
      .map((id) => ({ id, enabled: false, profileId: null })),
  ].map((row) => {
    const locked = !providerMeta(row.id).hasQuota
    const options = profileOptionsFor(row.id)
    /**
     * QSRC-03: exatamente um marcado. Sem escolha gravada, o marcado é o perfil
     * padrão — é o primeiro que a busca tenta nesse caso (QSRC-06). Padrão fora
     * das opções cai na primeira, que é a ordem de `list_profiles`.
     */
    const selected =
      options.find((option) => option.profileId === row.profileId)?.profileId ??
      options.find((option) => option.profileId === defaultProfileId)?.profileId ??
      options[0]?.profileId
    return { ...row, locked, enabled: locked ? false : row.enabled, options, selected }
  })

  const move = (id: string, delta: number) => {
    const index = providerList.findIndex((provider) => provider.id === id)
    const target = index + delta
    if (index === -1 || target < 0 || target >= providerList.length) return
    const providers = [...providerList]
    const [moved] = providers.splice(index, 1)
    if (!moved) return
    providers.splice(target, 0, moved)
    onChange({ ...prefs, providers })
  }

  /**
   * QSRC-09: o switch mexe só em `enabled` — o `profileId` gravado atravessa
   * intacto. E QSRC-01 trouxe linhas que podem não estar nas prefs (achadas
   * pela varredura, nunca gravadas): para essas, alternar **acrescenta** a
   * entrada em vez de virar um no-op.
   */
  const toggleProvider = (id: string) => {
    const known = providerList.some((provider) => provider.id === id)
    const providers = known
      ? providerList.map((provider) =>
          provider.id === id ? { ...provider, enabled: !provider.enabled } : provider,
        )
      : [...providerList, { id, enabled: true }]
    onChange({ ...prefs, providers })
  }

  /**
   * SPEC: quota-provider-source (QSRC-04) — grava de qual terminal a cota deste
   * provedor vem. Mesmo upsert do switch: um provedor achado e nunca gravado
   * precisa poder receber a escolha.
   */
  const chooseProfile = (id: string, profileId: string) => {
    const known = providerList.some((provider) => provider.id === id)
    const providers = known
      ? providerList.map((provider) => (provider.id === id ? { ...provider, profileId } : provider))
      : [...providerList, { id, enabled: true, profileId }]
    onChange({ ...prefs, providers })
  }

  return (
    <div className="general-panel">
      <style>{`
        .general-panel { max-width: 46rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .general-panel__title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 0.5rem;
          font-size: 1.05rem;
        }
        .general-panel__title svg { color: var(--accent); }
        .general-panel__group-label {
          margin-top: 1.25rem;
          font-size: 0.6875rem;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .general-panel__group-hint { color: var(--muted); font-size: 0.8125rem; margin: 0.2rem 0 0.5rem; }
        .general-panel__card {
          border: 1px solid #26262c;
          border-radius: 10px;
          background: #151518;
          overflow: hidden;
        }
        .general-panel__row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.85rem 1rem;
        }
        .general-panel__row + .general-panel__row { border-top: 1px solid #232329; }
        .general-panel__row-text { flex: 1 1 auto; min-width: 0; }
        .general-panel__row-title { font-weight: 600; font-size: 0.9rem; }
        .general-panel__row-desc { color: var(--muted); font-size: 0.8125rem; margin-top: 0.15rem; }

        /* Switch: um <input type="checkbox"> de verdade, só repintado — o
           foco de teclado e o leitor de tela continuam sendo os nativos. */
        .general-panel__switch { position: relative; display: inline-flex; flex: 0 0 auto; }
        .general-panel__switch input {
          appearance: none;
          width: 2.6rem;
          height: 1.4rem;
          margin: 0;
          border-radius: 999px;
          background: #3a3a42;
          cursor: pointer;
          transition: background 140ms ease;
        }
        .general-panel__switch input:checked { background: var(--accent); }
        .general-panel__switch input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .general-panel__switch input::after {
          content: '';
          position: absolute;
          top: 0.2rem;
          left: 0.2rem;
          width: 1rem;
          height: 1rem;
          border-radius: 50%;
          background: #fff;
          transition: transform 140ms ease;
        }
        .general-panel__switch input:checked::after { transform: translateX(1.2rem); }

        /* Segmented control sobre radios nativos. */
        .general-panel__segmented {
          display: inline-flex;
          border: 1px solid #33333b;
          border-radius: 8px;
          overflow: hidden;
          flex: 0 0 auto;
        }
        .general-panel__segment {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.35rem 0.85rem;
          font-size: 0.8125rem;
          cursor: pointer;
          color: var(--muted);
        }
        .general-panel__segment + .general-panel__segment { border-left: 1px solid #33333b; }
        .general-panel__segment input {
          position: absolute;
          inset: 0;
          margin: 0;
          opacity: 0;
          cursor: pointer;
        }
        .general-panel__segment:has(input:checked) {
          background: rgba(245, 183, 0, 0.16);
          color: var(--accent);
          font-weight: 600;
        }
        .general-panel__segment:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: -2px; }

        .general-panel__reorder { display: flex; flex-direction: column; gap: 2px; flex: 0 0 auto; }
        .general-panel__reorder button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.4rem;
          height: 1rem;
          border: 1px solid #33333b;
          border-radius: 4px;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
        }
        .general-panel__reorder button:hover:not(:disabled) { color: var(--fg); background: rgba(255,255,255,0.06); }
        .general-panel__reorder button:disabled { opacity: 0.35; cursor: default; }
        /* SPEC: quota-provider-source (QSRC-03) — chips de terminal, no molde
           do .providers-panel__place de Provedores, mas selecionáveis: radio
           nativo por baixo, então foco e leitor de tela seguem sendo os do
           navegador (mesma escolha do segmented control acima). */
        .general-panel__places {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex: 0 0 auto;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .general-panel__place {
          position: relative;
          padding: 0.1rem 0.45rem;
          border: 1px solid var(--border, #26262d);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          color: var(--muted, #8a8a92);
          font-size: 0.68rem;
          white-space: nowrap;
          cursor: pointer;
        }
        .general-panel__place input {
          position: absolute;
          inset: 0;
          margin: 0;
          opacity: 0;
          cursor: pointer;
        }
        .general-panel__place:has(input:checked) {
          border-color: var(--accent);
          background: rgba(245, 183, 0, 0.16);
          color: var(--accent);
          font-weight: 600;
        }
        .general-panel__place:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
        .general-panel__place:has(input:disabled) { cursor: default; }
        .general-panel__provider-name { display: flex; align-items: baseline; gap: 0.5rem; }
        .general-panel__provider-hint { color: var(--muted); font-size: 0.75rem; }
        /* Linha travada: o mesmo esmaecido que o passo 2 do wizard usa nos
           agentes ainda nao integrados (.agent-step__agent:disabled). */
        .general-panel__row--locked { opacity: 0.45; }
        .general-panel__switch input:disabled { cursor: default; }
      `}</style>

      <h2 className="general-panel__title">
        <Gauge size={18} />
        Indicador de cota
      </h2>

      <div className="general-panel__card">
        <div className="general-panel__row">
          <div className="general-panel__row-text">
            <div className="general-panel__row-title">Mostrar o indicador de cota</div>
            <div className="general-panel__row-desc">
              Mostra o anel de consumo e o popover dele no cabeçalho.
            </div>
          </div>
          <span className="general-panel__switch">
            <input
              type="checkbox"
              aria-label="Mostrar o indicador de cota"
              checked={prefs.enabled}
              onChange={() => onChange({ ...prefs, enabled: !prefs.enabled })}
            />
          </span>
        </div>
      </div>

      <div className="general-panel__group-label">Anel do cabeçalho</div>
      <p className="general-panel__group-hint">
        O cabeçalho mostra um anel por janela. Escolha quais ele acompanha.
      </p>

      <div className="general-panel__card">
        <div className="general-panel__row">
          <div className="general-panel__row-text">
            <div className="general-panel__row-title">Janela rastreada</div>
            <div className="general-panel__row-desc">
              "Ambos" desenha os dois arcos: externo semanal, interno de 5 horas.
            </div>
          </div>
          <div className="general-panel__segmented" role="group" aria-label="Janela rastreada">
            {WINDOW_OPTIONS.map((option) => (
              <label key={option.value} className="general-panel__segment">
                <input
                  type="radio"
                  name="quota-window"
                  value={option.value}
                  checked={prefs.window === option.value}
                  onChange={() => onChange({ ...prefs, window: option.value })}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="general-panel__group-label">Popover do hover</div>
      <p className="general-panel__group-hint">
        Quais provedores são listados ao passar o mouse no anel, e em que ordem.
      </p>

      <div className="general-panel__card">
        {rows.map((row) => {
          const meta = providerMeta(row.id)
          const index = providerList.findIndex((provider) => provider.id === row.id)
          return (
            <div
              className={`general-panel__row${row.locked ? ' general-panel__row--locked' : ''}`}
              key={row.id}
              data-provider={row.id}
              data-locked={row.locked ? 'true' : undefined}
            >
              <div className="general-panel__reorder">
                <button
                  type="button"
                  aria-label={`Subir ${meta.name}`}
                  disabled={row.locked || index <= 0}
                  onClick={() => move(row.id, -1)}
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  aria-label={`Descer ${meta.name}`}
                  disabled={row.locked || index === providerList.length - 1}
                  onClick={() => move(row.id, 1)}
                >
                  <ChevronDown size={12} />
                </button>
              </div>

              <ProviderIcon id={row.id} size={18} />

              <div className="general-panel__row-text general-panel__provider-name">
                <span className="general-panel__row-title">{meta.name}</span>
                <span className="general-panel__provider-hint">
                  {row.locked ? (meta.hint ?? 'sem cota') : meta.hint}
                </span>
              </div>

              {/* SPEC: quota-provider-source (QSRC-03) — achado em mais de um
                  terminal, o centro da linha escolhe de qual deles a cota vem.
                  Um terminal só não paga a coluna: não há empate a desfazer —
                  mesmo critério do painel de Provedores (PROV-03). */}
              {row.options.length > 1 && (
                <div
                  className="general-panel__places"
                  role="radiogroup"
                  aria-label={`Terminal de origem da cota de ${meta.name}`}
                >
                  {row.options.map((option) => (
                    <label key={option.profileId} className="general-panel__place">
                      <input
                        type="radio"
                        name={`quota-source-${row.id}`}
                        value={option.profileId}
                        checked={row.selected === option.profileId}
                        disabled={row.locked}
                        onChange={() => chooseProfile(row.id, option.profileId)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              )}

              <span className="general-panel__switch">
                <input
                  type="checkbox"
                  aria-label={`Mostrar ${meta.name} no popover`}
                  checked={row.enabled}
                  disabled={row.locked}
                  onChange={() => toggleProvider(row.id)}
                />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
