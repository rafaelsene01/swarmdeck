// SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-26; QUOTA-31 — REVOKED by
// AD-044), quota-provider-source (QSRC-01, QSRC-02, QSRC-03, QSRC-04, QSRC-07,
// QSRC-09)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import GeneralPanel, { type QuotaPrefs } from './GeneralPanel'

const PROVIDERS = [
  { id: 'claude-code', enabled: true },
  { id: 'codex-cli', enabled: true },
  { id: 'opencode', enabled: true },
]

/** SPEC: quota-provider-source (QSRC-01) — a lista agora nasce da varredura.
 * O default cobre os testes que só olham switch mestre/janela: os três
 * provedores da semente, todos achados no host. */
function foundRows(ids: string[] = PROVIDERS.map((p) => p.id), places = ['Windows']) {
  return ids.map((id) => ({ id, enabled: true, foundIn: places }))
}

const PROFILES = [
  { profileId: 'host', label: 'Windows', wsl1: false, agents: [] },
  { profileId: 'wsl:Ubuntu-24.04', label: 'Ubuntu-24.04', wsl1: false, agents: [] },
]

function renderPanel(
  prefs: Omit<QuotaPrefs, 'providers'> & { providers?: QuotaPrefs['providers'] },
  providers: { id: string; enabled: boolean; foundIn: string[] }[] = foundRows(),
  options: { profiles?: typeof PROFILES; defaultProfileId?: string } = {},
) {
  const onChange = vi.fn()
  render(
    <GeneralPanel
      prefs={{ providers: PROVIDERS, ...prefs }}
      onChange={onChange}
      providers={providers}
      profiles={options.profiles ?? PROFILES}
      defaultProfileId={options.defaultProfileId}
    />,
  )
  return onChange
}

describe('GeneralPanel', () => {
  it('alternar o switch mestre chama onChange com enabled invertido', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar o indicador de cota' }))

    expect(onChange).toHaveBeenCalledWith({
      enabled: false,
      window: 'both',
      providers: PROVIDERS,
    })
  })

  it('selecionar "5 horas" chama onChange com window: five_hour', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('radio', { name: '5 horas' }))

    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      window: 'five_hour',
      providers: PROVIDERS,
    })
  })

  it('selecionar "Semanal" e "Ambos" chamam onChange com o valor certo cada', () => {
    const onChange = renderPanel({ enabled: true, window: 'five_hour' })

    fireEvent.click(screen.getByRole('radio', { name: 'Semanal' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ window: 'weekly' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Ambos' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ window: 'both' }))
  })

  // QUOTA-26: a lista do popover é ordenável e cada linha liga/desliga.
  it('lista um provedor por linha, na ordem das prefs', () => {
    renderPanel({ enabled: true, window: 'both' })

    const rows = document.querySelectorAll('[data-provider]')
    expect([...rows].map((row) => row.getAttribute('data-provider'))).toEqual([
      'claude-code',
      'codex-cli',
      'opencode',
    ])
  })

  it('"descer" troca o provedor com o seguinte', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('button', { name: 'Descer Claude' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: [
          { id: 'codex-cli', enabled: true },
          { id: 'claude-code', enabled: true },
          { id: 'opencode', enabled: true },
        ],
      }),
    )
  })

  it('"subir" está desabilitado no primeiro e "descer" no último', () => {
    renderPanel({ enabled: true, window: 'both' })

    expect(screen.getByRole('button', { name: 'Subir Claude' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descer opencode' })).toBeDisabled()
  })

  it('desligar o provedor com cota preserva a posição dele na lista', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar Claude no popover' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: [
          { id: 'claude-code', enabled: false },
          { id: 'codex-cli', enabled: true },
          { id: 'opencode', enabled: true },
        ],
      }),
    )
  })
})

// SPEC: quota-provider-source (QSRC-01, QSRC-02, QSRC-03, QSRC-04, QSRC-07,
// QSRC-09) — AD-044 revoga QUOTA-31: a lista deixou de mostrar o catálogo
// inteiro e passou a mostrar o que a varredura achou.
describe('GeneralPanel — só os provedores encontrados (QSRC-01)', () => {
  it('lista só os provedores encontrados na varredura', () => {
    renderPanel({ enabled: true, window: 'both' }, [
      { id: 'claude-code', enabled: true, foundIn: ['Windows'] },
      { id: 'codex-cli', enabled: true, foundIn: [] },
      { id: 'opencode', enabled: true, foundIn: ['Ubuntu-24.04'] },
    ])

    const rows = [...document.querySelectorAll('[data-provider]')].map((row) =>
      row.getAttribute('data-provider'),
    )
    expect(rows).toEqual(['claude-code', 'opencode'])
  })

  it('provedor achado que não está nas prefs entra no fim da lista', () => {
    renderPanel(
      { enabled: true, window: 'both', providers: [{ id: 'claude-code', enabled: true }] },
      [
        { id: 'claude-code', enabled: true, foundIn: ['Windows'] },
        { id: 'kimi-code', enabled: true, foundIn: ['Windows'] },
      ],
    )

    const rows = [...document.querySelectorAll('[data-provider]')].map((row) =>
      row.getAttribute('data-provider'),
    )
    expect(rows).toEqual(['claude-code', 'kimi-code'])
  })

  it('varredura vazia não renderiza linha nenhuma', () => {
    renderPanel({ enabled: true, window: 'both' }, [])

    expect(document.querySelectorAll('[data-provider]')).toHaveLength(0)
  })

  // QSRC-02: AD-033 continua valendo — achado, mas sem endpoint de consumo.
  it('provedor achado sem cota segue travado e desmarcado', () => {
    const onChange = renderPanel({ enabled: true, window: 'both' }, [
      { id: 'claude-code', enabled: true, foundIn: ['Windows'] },
      { id: 'codex-cli', enabled: true, foundIn: ['Windows'] },
    ])

    const codex = screen.getByRole('checkbox', { name: 'Mostrar Codex no popover' })
    expect(codex).toBeDisabled()
    expect(codex).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Mostrar Claude no popover' })).toBeEnabled()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('GeneralPanel — terminal de origem da cota (QSRC-03, QSRC-04, QSRC-07)', () => {
  const doisTerminais = [
    { id: 'claude-code', enabled: true, foundIn: ['Windows', 'Ubuntu-24.04'] },
  ]

  it('achado em dois terminais mostra o seletor, com o padrão marcado', () => {
    renderPanel({ enabled: true, window: 'both' }, doisTerminais, {
      defaultProfileId: 'wsl:Ubuntu-24.04',
    })

    const group = screen.getByRole('radiogroup', { name: 'Terminal de origem da cota de Claude' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Ubuntu-24.04' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Windows' })).not.toBeChecked()
  })

  it('achado em um terminal só não mostra seletor', () => {
    renderPanel({ enabled: true, window: 'both' }, [
      { id: 'claude-code', enabled: true, foundIn: ['Windows'] },
    ])

    expect(screen.queryByRole('radiogroup', { name: /Terminal de origem/ })).toBeNull()
  })

  it('marcar um terminal persiste a escolha no provedor certo', () => {
    const onChange = renderPanel(
      { enabled: true, window: 'both', providers: [{ id: 'claude-code', enabled: true }] },
      doisTerminais,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Ubuntu-24.04' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: [{ id: 'claude-code', enabled: true, profileId: 'wsl:Ubuntu-24.04' }],
      }),
    )
  })

  it('a escolha gravada é a que aparece marcada, não o padrão', () => {
    renderPanel(
      {
        enabled: true,
        window: 'both',
        providers: [{ id: 'claude-code', enabled: true, profileId: 'wsl:Ubuntu-24.04' }],
      },
      doisTerminais,
      { defaultProfileId: 'host' },
    )

    expect(screen.getByRole('radio', { name: 'Ubuntu-24.04' })).toBeChecked()
  })

  // QSRC-09: o switch mexe em `enabled` e não encosta na escolha gravada.
  it('alternar o switch preserva o terminal marcado', () => {
    const onChange = renderPanel(
      {
        enabled: true,
        window: 'both',
        providers: [{ id: 'claude-code', enabled: true, profileId: 'wsl:Ubuntu-24.04' }],
      },
      doisTerminais,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar Claude no popover' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: [{ id: 'claude-code', enabled: false, profileId: 'wsl:Ubuntu-24.04' }],
      }),
    )
  })

  // QSRC-07: rótulo que não casa com perfil nenhum não vira opção — e com
  // uma opção sobrando não há seletor a mostrar.
  it('rótulo sem perfil correspondente não vira opção', () => {
    renderPanel(
      { enabled: true, window: 'both' },
      [{ id: 'claude-code', enabled: true, foundIn: ['Windows', 'Distro-Que-Sumiu'] }],
    )

    expect(screen.queryByRole('radio', { name: 'Distro-Que-Sumiu' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: /Terminal de origem/ })).toBeNull()
  })

  // QSRC-04: provedor achado que nunca foi gravado recebe a escolha via
  // acréscimo, em vez de a interação virar no-op.
  it('provedor fora das prefs recebe a escolha como entrada nova', () => {
    const onChange = renderPanel(
      { enabled: true, window: 'both', providers: [] },
      doisTerminais,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Ubuntu-24.04' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: [{ id: 'claude-code', enabled: true, profileId: 'wsl:Ubuntu-24.04' }],
      }),
    )
  })
})

// AD-035: o seletor "Perfil de terminal" foi removido (WSLP-01/02/13/19
// revogados). O perfil é derivado do caminho da pasta, então este painel não
// tem mais nada a escolher — o teste abaixo é o que impede a seção de voltar
// por acidente.
describe('GeneralPanel — sem seletor de perfil de terminal (AD-035)', () => {
  it('não renderiza mais o grupo "Perfil de terminal"', () => {
    renderPanel({ enabled: true, window: 'both' })

    expect(screen.queryByRole('group', { name: 'Perfil de terminal' })).toBeNull()
    expect(screen.queryByText('Perfil de terminal')).toBeNull()
  })
})
