// SPEC: silent-update (SILENT-09, SILENT-10, SILENT-11, SILENT-12, SILENT-13, SILENT-25, SILENT-32, SILENT-33, SILENT-34)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import UpdateSettings, { type UpdateState } from './UpdateSettings'

function renderSettings(state: UpdateState, overrides: Partial<Parameters<typeof UpdateSettings>[0]> = {}) {
  const props = {
    state,
    autoCheckEnabled: true,
    checking: false,
    onToggleAutoCheck: vi.fn(),
    onCheck: vi.fn(),
    onApply: vi.fn(),
    onRestart: vi.fn(),
    ...overrides,
  }
  render(<UpdateSettings {...props} />)
  return props
}

describe('UpdateSettings', () => {
  it('estado "ready" com versões iguais mostra os dois números e "já na versão mais recente", sem botão de atualizar', () => {
    renderSettings({ status: 'ready', current: '0.3.1', latest: '0.3.1', hasUpdate: false, mode: 'installed' })

    expect(screen.getByText('0.3.1')).toBeInTheDocument()
    expect(screen.getByText('Você já está na versão mais recente.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Baixar e atualizar' })).not.toBeInTheDocument()
  })

  it('estado "ready" com hasUpdate mostra o número da versão nova e o botão "Baixar e atualizar"', () => {
    const onApply = vi.fn()
    renderSettings(
      { status: 'ready', current: '0.3.1', latest: '0.4.0', hasUpdate: true, mode: 'installed' },
      { onApply },
    )

    expect(screen.getByText(/Nova versão disponível: 0.4.0/)).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Baixar e atualizar' })
    fireEvent.click(button)
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('estado "unavailable" mostra a versão instalada e a mensagem de falha de consulta, sem número de versão remota', () => {
    renderSettings({ status: 'unavailable', current: '0.3.1' })

    expect(screen.getByText('0.3.1')).toBeInTheDocument()
    expect(screen.getByText(/Não foi possível consultar/)).toBeInTheDocument()
    expect(screen.queryByText('0.4.0')).not.toBeInTheDocument()
  })

  it('estado "applying" desabilita o botão de atualizar', () => {
    renderSettings({ status: 'applying', current: '0.3.1', latest: '0.4.0' })

    expect(screen.getByRole('button', { name: 'Baixar e atualizar' })).toBeDisabled()
  })

  it('estado "applied" mostra "Atualizado para X. Reinicie para concluir." e o botão "Reiniciar agora"', () => {
    const onRestart = vi.fn()
    renderSettings({ status: 'applied', version: '0.4.0' }, { onRestart })

    expect(screen.getByText('Atualizado para 0.4.0. Reinicie para concluir.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar agora' }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  it('estado "error" mostra a mensagem com role="alert"', () => {
    renderSettings({ status: 'error', current: '0.3.1', message: 'disco cheio' })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('disco cheio')
  })

  // SILENT-32/33: o botão fica ao lado da versão instalada e reconsulta sob demanda.
  it('mostra "Buscar atualizações" junto da versão instalada e aciona onCheck', () => {
    const onCheck = vi.fn()
    renderSettings(
      { status: 'ready', current: '0.3.1', latest: '0.3.1', hasUpdate: false, mode: 'installed' },
      { onCheck },
    )

    expect(screen.getByText('0.3.1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar atualizações' }))
    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  // SILENT-32: falha de consulta é justamente quando o usuário quer tentar de novo.
  it('mostra "Buscar atualizações" também quando a consulta falhou', () => {
    renderSettings({ status: 'unavailable', current: '0.3.1' })

    expect(screen.getByRole('button', { name: 'Buscar atualizações' })).toBeEnabled()
  })

  // SILENT-34: durante a consulta o botão desabilita e a versão instalada continua em tela.
  it('com checking o botão vira "Verificando…" desabilitado, sem esconder a versão instalada', () => {
    renderSettings(
      { status: 'ready', current: '0.3.1', latest: '0.3.1', hasUpdate: false, mode: 'installed' },
      { checking: true },
    )

    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Buscar atualizações' })).not.toBeInTheDocument()
    expect(screen.getByText('0.3.1')).toBeInTheDocument()
  })

  // SILENT-34: depois da troca aplicada, reconsultar não decide mais nada.
  it('não mostra "Buscar atualizações" durante a aplicação nem depois dela', () => {
    renderSettings({ status: 'applying', current: '0.3.1', latest: '0.4.0' })
    expect(screen.queryByRole('button', { name: 'Buscar atualizações' })).not.toBeInTheDocument()
  })

  // SILENT-33: a consulta de rede não pode mais esconder a versão instalada —
  // era isso que deixava a seção presa em "Verificando…" sem mostrar nada.
  it('estado "loading" já mostra a versão instalada e o botão de buscar, desabilitado', () => {
    renderSettings({ status: 'loading', current: '0.3.1' })

    expect(screen.getByText('0.3.1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled()
  })

  it('o texto explicativo não menciona mais instalação no fechamento do app', () => {
    renderSettings({ status: 'ready', current: '0.3.1', latest: '0.3.1', hasUpdate: false, mode: 'installed' })

    const explainer = screen.getByText(/verificação automática/i)
    expect(explainer).not.toHaveTextContent(/fechamento/i)
  })
})
