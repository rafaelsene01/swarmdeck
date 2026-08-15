// SPEC: quota-indicator (QUOTA-09, QUOTA-10)

export interface QuotaPrefs {
  enabled: boolean
  window: 'five_hour' | 'weekly' | 'both'
}

export interface GeneralPanelProps {
  prefs: QuotaPrefs
  /** Quem persiste é o `SettingsShell` (T14) — aqui só noticia a intenção,
   * mesmo contrato que `UpdateSettings` já segue. */
  onChange: (next: QuotaPrefs) => void
}

const WINDOW_OPTIONS: ReadonlyArray<{ value: QuotaPrefs['window']; label: string }> = [
  { value: 'five_hour', label: '5 horas' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'both', label: 'Ambos' },
]

/**
 * Seção "Geral" das configurações: switch mestre e janela rastreada do
 * indicador de cota (QUOTA-09, QUOTA-10). Puramente apresentacional, mesmo
 * molde de `UpdateSettings.tsx` — não chama `invoke` diretamente.
 */
export default function GeneralPanel({ prefs, onChange }: GeneralPanelProps) {
  return (
    <div className="general-panel">
      <h2 className="general-panel__title">Geral</h2>

      <label className="general-panel__toggle">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={() => onChange({ ...prefs, enabled: !prefs.enabled })}
        />
        Mostrar o indicador de cota do Claude no cabeçalho
      </label>

      <fieldset className="general-panel__windows">
        <legend>Janela rastreada</legend>
        {WINDOW_OPTIONS.map((option) => (
          <label key={option.value} className="general-panel__window-option">
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
      </fieldset>
    </div>
  )
}
