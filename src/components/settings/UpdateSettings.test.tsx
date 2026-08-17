// SPEC: silent-update (SILENT-09, SILENT-10, SILENT-11, SILENT-12, SILENT-13, SILENT-25, SILENT-32, SILENT-33, SILENT-34, SILENT-37, SILENT-38, SILENT-40, SILENT-41)

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
    onDownload: vi.fn(),
    onInstall: vi.fn(),
    onRestart: vi.fn(),
    ...overrides,
  }
  render(<UpdateSettings {...props} />)
  return props
}

describe('UpdateSettings', () => {
  it('estado "ready" com versões iguais mostra os dois números e "já na versão mais recente", sem botão de atualizar', () => {
    renderSettings({ status: 'ready', current: '0.3.1', latest: '0.3.1', hasUpdate: false })

    expect(screen.getByText('0.3.1')).toBeInTheDocument()
    expect(screen.getByText('Você já está na versão mais recente.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Baixar' })).not.toBeInTheDocument()
  })

  it('estado "ready" com hasUpdate mostra o número da versão nova e o botão "Baixar"', () => {
    const onDownload = vi.fn()
    renderSettings({ status: 'ready', current: '0.3.1', latest: '0.4.0', hasUpdate: true }, { onDownload })

    expect(screen.getByText(/Nova versão disponível: 0.4.0/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }))
    expect(onDownload).toHaveBeenCalledTimes(1)
  })

  it('estado "unavailable" mostra a versão instalada e a mensagem de falha de consulta, sem número de versão remota', () => {
    renderSettings({ status: 'unavailable', current: '0.3.1' })

    expect(screen.getByText('0.3.1')).toBeInTheDocument()
    expect(screen.getByText(/Não foi possível consultar/)).toBeInTheDocument()
    expect(screen.queryByText('0.4.0')).not.toBeInTheDocument()
  })

  // SILENT-37: a barra de progresso reflete os bytes recebidos.
  it('estado "downloading" mostra a porcentagem e uma barra com o valor recebido', () => {
    renderSettings({
      status: 'downloading',
      current: '0.3.1',
      latest: '0.4.0',
      downloaded: 7_000_000,
      total: 14_000_000,
    })

    expect(screen.getByText(/Baixando a versão 0.4.0… 50%/)).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('value', '7000000')
    expect(bar).toHaveAttribute('max', '14000000')
  })

  // SILENT-37: sem Content-Length a barra fica indeterminada em vez de mentir %.
  it('estado "downloading" sem total mostra os MB baixados e uma barra indeterminada', () => {
    renderSettings({
      status: 'downloading',
      current: '0.3.1',
      latest: '0.4.0',
      downloaded: 2_097_152,
      total: null,
    })

    expect(screen.getByText(/2.0 MB/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
  })

  // SILENT-38: baixar não instala — o segundo passo é um clique separado.
  it('estado "downloaded" mostra o botão "Instalar" e aciona onInstall', () => {
    const onInstall = vi.fn()
    renderSettings({ status: 'downloaded', current: '0.3.1', latest: '0.4.0' }, { onInstall })

    expect(screen.getByText(/baixada e verificada/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Instalar' }))
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it('estado "installing" desabilita o botão de instalar', () => {
    renderSettings({ status: 'installing', current: '0.3.1', latest: '0.4.0' })

    expect(screen.getByRole('button', { name: 'Instalar' })).toBeDisabled()
  })

  // SILENT-40: instalado != reiniciado. O app segue aberto e reabrir é do usuário.
  it('estado "installed" avisa que os terminais seguem abertos e só oferece "Reabrir agora"', () => {
    const onRestart = vi.fn()
    renderSettings({ status: 'installed', version: '0.4.0' }, { onRestart })

    expect(screen.getByText(/Versão 0.4.0 instalada/)).toBeInTheDocument()
    expect(screen.getByText(/terminais continuam abertos/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir agora' }))
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
    renderSettings({ status: 'ready', current: '0.3.1', latest: '0.3.1', hasUpdate: false }, { onCheck })

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
      { status: 'ready', current: '0.3.1', latest: '0.3.1', hasUpdate: false },
      { checking: true },
    )

    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Buscar atualizações' })).not.toBeInTheDocument()
    expect(screen.getByText('0.3.1')).toBeInTheDocument()
  })

  // SILENT-34: durante download/instalação e depois delas, reconsultar não decide mais nada.
  it('não mostra "Buscar atualizações" durante o download, a instalação nem depois dela', () => {
    for (const state of [
      { status: 'downloading', current: '0.3.1', latest: '0.4.0', downloaded: 1, total: 2 },
      { status: 'installing', current: '0.3.1', latest: '0.4.0' },
      { status: 'installed', version: '0.4.0' },
    ] as UpdateState[]) {
      const { unmount } = render(
        <UpdateSettings
          state={state}
          autoCheckEnabled
          checking={false}
          onToggleAutoCheck={vi.fn()}
          onCheck={vi.fn()}
          onDownload={vi.fn()}
          onInstall={vi.fn()}
          onRestart={vi.fn()}
        />,
      )
      expect(screen.queryByRole('button', { name: 'Buscar atualizações' })).not.toBeInTheDocument()
      unmount()
    }
  })

  // SILENT-33: a consulta de rede não pode mais esconder a versão instalada —
  // era isso que deixava a seção presa em "Verificando…" sem mostrar nada.
  it('estado "loading" já mostra a versão instalada e o botão de buscar, desabilitado', () => {
    renderSettings({ status: 'loading', current: '0.3.1' })

    expect(screen.getByText('0.3.1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled()
  })

  // SILENT-41: a linha "Modo" (Instalado/Portátil) saiu da seção.
  it('não mostra mais a linha "Modo"', () => {
    renderSettings({ status: 'ready', current: '0.3.1', latest: '0.3.1', hasUpdate: false })

    expect(screen.queryByText('Modo')).not.toBeInTheDocument()
    expect(screen.queryByText('Instalado')).not.toBeInTheDocument()
    expect(screen.queryByText('Portátil')).not.toBeInTheDocument()
  })

  it('o texto explicativo não menciona mais instalação no fechamento do app', () => {
    renderSettings({ status: 'ready', current: '0.3.1', latest: '0.3.1', hasUpdate: false })

    const explainer = screen.getByText(/verificação automática/i)
    expect(explainer).not.toHaveTextContent(/fechamento/i)
  })
})
