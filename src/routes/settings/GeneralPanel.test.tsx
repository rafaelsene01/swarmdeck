// SPEC: quota-indicator (QUOTA-09, QUOTA-10, QUOTA-26, QUOTA-31)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import GeneralPanel, { type QuotaPrefs } from './GeneralPanel'

const PROVIDERS = [
  { id: 'claude-code', enabled: true },
  { id: 'codex-cli', enabled: true },
  { id: 'opencode', enabled: true },
]

/** Ordem de `agents::catalog::CATALOG`. Os dois últimos não estão na semente
 *  da migração 007 — é o caso que QUOTA-31 cobre. */
const CATALOG_IDS = ['claude-code', 'codex-cli', 'antigravity-cli', 'opencode', 'kimi-code']

function renderPanel(
  prefs: Omit<QuotaPrefs, 'providers'> & { providers?: QuotaPrefs['providers'] },
  agentIds: string[] = [],
) {
  const onChange = vi.fn()
  render(
    <GeneralPanel prefs={{ providers: PROVIDERS, ...prefs }} onChange={onChange} agentIds={agentIds} />,
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

// SPEC: quota-indicator (QUOTA-31) — o catálogo inteiro aparece na lista, e só
// quem tem cota real é controlável, como o passo 2 do wizard já faz.
describe('GeneralPanel — catálogo completo com linhas travadas (QUOTA-31)', () => {
  it('acrescenta os agentes do catálogo que faltam nas prefs, no fim da lista', () => {
    renderPanel({ enabled: true, window: 'both' }, CATALOG_IDS)

    const rows = [...document.querySelectorAll('[data-provider]')].map((row) =>
      row.getAttribute('data-provider'),
    )
    expect(rows).toEqual([
      'claude-code',
      'codex-cli',
      'opencode',
      'antigravity-cli',
      'kimi-code',
    ])
  })

  it('só o provedor com cota real tem switch e setas ativos', () => {
    renderPanel({ enabled: true, window: 'both' }, CATALOG_IDS)

    expect(screen.getByRole('checkbox', { name: 'Mostrar Claude no popover' })).toBeEnabled()

    for (const name of ['Codex', 'Antigravity', 'opencode', 'Kimi']) {
      expect(screen.getByRole('checkbox', { name: `Mostrar ${name} no popover` })).toBeDisabled()
      expect(screen.getByRole('button', { name: `Subir ${name}` })).toBeDisabled()
      expect(screen.getByRole('button', { name: `Descer ${name}` })).toBeDisabled()
    }
  })

  // AD-033: a linha travada mostra `false` mesmo com a preferência gravada
  // dizendo `true` — é o caso real de `codex-cli` e `opencode`, semeados como
  // ligados pela migração 007. Marcado-e-desabilitado lê como "ligado e você
  // não pode desligar", e esses provedores não aparecem mais no popover.
  it('a linha travada mostra false, mesmo gravada como ligada', () => {
    const onChange = renderPanel(
      {
        enabled: true,
        window: 'both',
        providers: [
          { id: 'claude-code', enabled: true },
          { id: 'codex-cli', enabled: true },
          { id: 'opencode', enabled: true },
        ],
      },
      CATALOG_IDS,
    )

    expect(screen.getByRole('checkbox', { name: 'Mostrar Codex no popover' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Mostrar opencode no popover' })).not.toBeChecked()
    // Kimi nunca foi gravado: entra desmarcado pelo caminho de sempre.
    expect(screen.getByRole('checkbox', { name: 'Mostrar Kimi no popover' })).not.toBeChecked()
    // Claude tem cota: segue mostrando o valor gravado.
    expect(screen.getByRole('checkbox', { name: 'Mostrar Claude no popover' })).toBeChecked()
    // AD-033: é só apresentação — nada é gravado por conta desta correção.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('id do catálogo já presente nas prefs não vira linha duplicada', () => {
    renderPanel({ enabled: true, window: 'both' }, CATALOG_IDS)

    expect(document.querySelectorAll('[data-provider="claude-code"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-provider="opencode"]')).toHaveLength(1)
  })

  it('sem catálogo a lista continua sendo só as prefs', () => {
    renderPanel({ enabled: true, window: 'both' })

    expect(document.querySelectorAll('[data-provider]')).toHaveLength(3)
    expect(document.querySelector('[data-provider="kimi-code"]')).toBeNull()
  })
})

// AD-035: o seletor "Perfil de terminal" foi removido (WSLP-01/02/13/19
// revogados). O perfil é derivado do caminho da pasta, então este painel não
// tem mais nada a escolher — o teste abaixo é o que impede a seção de voltar
// por acidente.
describe('GeneralPanel — sem seletor de perfil de terminal (AD-035)', () => {
  it('não renderiza mais o grupo "Perfil de terminal"', () => {
    renderPanel({ enabled: true, window: 'both' }, CATALOG_IDS)

    expect(screen.queryByRole('group', { name: 'Perfil de terminal' })).toBeNull()
    expect(screen.queryByText('Perfil de terminal')).toBeNull()
  })
})
