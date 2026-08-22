// SPEC: providers-panel (PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PROV-08)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AgentPanel, { type ProviderRow } from './AgentPanel'

/** Ordem do catálogo Rust (`agents::catalog::CATALOG`), como o backend envia. */
const PROVIDERS: ProviderRow[] = [
  { id: 'claude-code', enabled: true, foundIn: ['Windows', 'Ubuntu-24.04'] },
  { id: 'codex-cli', enabled: true, foundIn: ['Windows'] },
  { id: 'antigravity-cli', enabled: false, foundIn: [] },
  { id: 'opencode', enabled: false, foundIn: ['Ubuntu-24.04'] },
  { id: 'kimi-code', enabled: false, foundIn: [] },
]

function row(id: string): HTMLElement {
  const element = document.querySelector(`[data-provider="${id}"]`)
  if (element === null) throw new Error(`linha do provedor ${id} não renderizou`)
  return element as HTMLElement
}

describe('AgentPanel', () => {
  // PROV-01: uma linha por provedor, na ordem recebida, com ícone e switch.
  it('renderiza uma linha por provedor, na ordem recebida, com ícone e switch', () => {
    render(<AgentPanel providers={PROVIDERS} />)

    const rendered = Array.from(document.querySelectorAll('[data-provider]')).map((element) =>
      element.getAttribute('data-provider'),
    )
    expect(rendered).toEqual(PROVIDERS.map((provider) => provider.id))

    for (const provider of PROVIDERS) {
      expect(row(provider.id).querySelector(`[data-provider-icon="${provider.id}"]`)).not.toBeNull()
      expect(row(provider.id).querySelector('input[type="checkbox"]')).not.toBeNull()
    }
  })

  // PROV-02: achado em mais de um terminal, os rótulos aparecem no centro.
  it('lista todos os terminais quando o provedor foi achado em mais de um', () => {
    render(<AgentPanel providers={PROVIDERS} />)

    const places = Array.from(
      row('claude-code').querySelectorAll('.providers-panel__place'),
    ).map((element) => element.textContent)
    expect(places).toEqual(['Windows', 'Ubuntu-24.04'])
  })

  // PROV-03: um lugar só não mostra nada no centro.
  it('não mostra o local quando o provedor foi achado em um terminal só', () => {
    render(<AgentPanel providers={PROVIDERS} />)

    expect(row('codex-cli').querySelectorAll('.providers-panel__place')).toHaveLength(0)
    expect(screen.queryByText('Windows')).not.toBeNull() // vem do claude-code
    expect(row('opencode').querySelectorAll('.providers-panel__place')).toHaveLength(0)
  })

  // PROV-04: não achado em nenhum terminal = switch desligado e travado.
  it('trava o switch desligado do provedor não encontrado em nenhum terminal', () => {
    render(<AgentPanel providers={PROVIDERS} />)

    const missing = row('antigravity-cli').querySelector('input') as HTMLInputElement
    expect(missing.checked).toBe(false)
    expect(missing.disabled).toBe(true)
    expect(row('antigravity-cli')).toHaveAttribute('data-found', 'false')
    expect(row('antigravity-cli')).toHaveTextContent('Não encontrado em nenhum terminal')

    const found = row('claude-code').querySelector('input') as HTMLInputElement
    expect(found.disabled).toBe(false)
    expect(found.checked).toBe(true)
    expect(row('claude-code')).not.toHaveTextContent('Não encontrado em nenhum terminal')
  })

  // PROV-04: um `enabled: true` gravado antes de o CLI desaparecer não pode
  // reaparecer ligado — a linha sem lugar nenhum é sempre desligada.
  it('mostra desligado um provedor gravado como habilitado que não foi achado', () => {
    render(<AgentPanel providers={[{ id: 'kimi-code', enabled: true, foundIn: [] }]} />)

    const input = row('kimi-code').querySelector('input') as HTMLInputElement
    expect(input.checked).toBe(false)
    expect(input.disabled).toBe(true)
  })

  // PROV-05: alternar devolve id e novo valor a quem persiste.
  it('avisa o novo valor do switch com o id do provedor', () => {
    const onToggle = vi.fn()
    render(<AgentPanel providers={PROVIDERS} onToggle={onToggle} />)

    fireEvent.click(row('claude-code').querySelector('input') as HTMLInputElement)
    expect(onToggle).toHaveBeenCalledWith('claude-code', false)

    fireEvent.click(row('opencode').querySelector('input') as HTMLInputElement)
    expect(onToggle).toHaveBeenCalledWith('opencode', true)
  })

  // PROV-06: o botão pede a varredura; quem varre é quem monta o painel.
  it('aciona a varredura pelo botão Atualizar', () => {
    const onRefresh = vi.fn()
    render(<AgentPanel providers={PROVIDERS} onRefresh={onRefresh} />)

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  // PROV-08: durante a varredura o botão não aceita um segundo clique.
  it('desabilita o botão enquanto a varredura está em curso', () => {
    const onRefresh = vi.fn()
    render(<AgentPanel providers={PROVIDERS} refreshing onRefresh={onRefresh} />)

    const button = screen.getByRole('button', { name: 'Buscando...' })
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  // Caso de borda da spec: leitura que falhou deixa a lista vazia, e o painel
  // continua utilizável (o botão de varrer é a saída).
  it('sem provedores, explica o estado e mantém o botão de varredura', () => {
    render(<AgentPanel providers={[]} />)

    expect(screen.getByText('Nenhum provedor varrido ainda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled()
  })
})
