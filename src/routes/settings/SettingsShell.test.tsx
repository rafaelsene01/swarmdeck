// SPEC: settings-shell (SET-03, SET-04, SET-05, SET-06, SET-07, SET-08, SET-09, SET-10)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SettingsShell from './SettingsShell'

// Same `vi.hoisted` pattern as `App.test.tsx` — the `vi.mock` factories
// below are hoisted above these imports by Vitest's transform.
const { invokeMock, closeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  closeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: closeMock }),
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => Promise.resolve('0.1.9'),
}))

describe('SettingsShell — fechar a janela (SET-03/04/05)', () => {
  beforeEach(() => {
    closeMock.mockClear()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      return Promise.resolve(null)
    })
  })

  it('clique no X chama close() da janela atual', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Configurações' }))
    expect(closeMock).toHaveBeenCalledTimes(1)
  })

  it('clique em "Fechar" chama close() da janela atual', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})

describe('SettingsShell — sidebar com ícones e trilho (SET-06/07/08)', () => {
  beforeEach(() => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      return Promise.resolve(null)
    })
  })

  it('trilho mostra a seção ativa e troca ao navegar, sem alterar a navegação existente', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    // QUOTA-08: "Geral" passou a ser a seção padrão da janela.
    expect(screen.getByText('Configurações › Geral')).toBeInTheDocument()
    const projectsItem = screen.getByRole('button', { name: /Projetos/ })
    expect(projectsItem).not.toHaveAttribute('aria-current')

    fireEvent.click(projectsItem)

    expect(screen.getByText('Configurações › Projetos')).toBeInTheDocument()
    expect(projectsItem).toHaveAttribute('aria-current', 'page')
  })

  it('cada um dos 5 itens da sidebar tem ícone', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    for (const label of ['Geral', 'Agentes', 'Projetos', 'Status de terminal', 'Atualizações']) {
      const item = screen.getByRole('button', { name: new RegExp(label) })
      expect(item.querySelector('svg')).not.toBeNull()
    }
  })
})

const READY_STATUS = {
  current: '0.1.0',
  latest: '0.1.0',
  notes: '',
  has_update: false,
  mode: 'installed' as const,
  platform_key: 'windows-x86_64-silent',
}

describe('SettingsShell — persistência do toggle de auto-check (SET-09/10)', () => {
  beforeEach(() => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'update_auto_check_get') return Promise.resolve(false)
      if (command === 'update_status') return Promise.resolve(READY_STATUS)
      return Promise.resolve(null)
    })
  })

  it('mount da seção Atualizações chama update_auto_check_get e usa o valor retornado', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_auto_check_get'))
    const toggle = await screen.findByRole('checkbox', { name: 'Verificar atualizações automaticamente' })
    await waitFor(() => expect(toggle).not.toBeChecked())
  })

  it('alternar o toggle chama update_auto_check_set com o novo valor', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))
    const toggle = await screen.findByRole('checkbox', { name: 'Verificar atualizações automaticamente' })
    await waitFor(() => expect(toggle).not.toBeChecked())

    fireEvent.click(toggle)

    expect(invokeMock).toHaveBeenCalledWith('update_auto_check_set', { enabled: true })
  })

  it('se update_auto_check_get falhar, o toggle mantém o valor padrão (true) sem travar a seção', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'update_auto_check_get') return Promise.reject(new Error('boom'))
      if (command === 'update_status') return Promise.resolve(READY_STATUS)
      return Promise.resolve(null)
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_auto_check_get'))
    const toggle = await screen.findByRole('checkbox', { name: 'Verificar atualizações automaticamente' })
    expect(toggle).toBeChecked()
  })
})

describe('SettingsShell — seção Geral do indicador de cota (QUOTA-08/09/10)', () => {
  beforeEach(() => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'quota_prefs_set') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })
  })

  it('"Geral" é o primeiro item do menu e a seção selecionada na abertura', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.getByText('Configurações › Geral')).toBeInTheDocument()
    const navButtons = screen.getAllByRole('button', {
      name: /Geral|Agentes|Projetos|Status de terminal|Atualizações/,
    })
    expect(navButtons[0]).toHaveAccessibleName(/Geral/)
    expect(navButtons[0]).toHaveAttribute('aria-current', 'page')
  })

  it('alternar o switch chama invoke("quota_prefs_set", ...) com enabled: false', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('quota_prefs_get'))

    const toggle = await screen.findByRole('checkbox')
    await waitFor(() => expect(toggle).toBeChecked())

    fireEvent.click(toggle)

    expect(invokeMock).toHaveBeenCalledWith('quota_prefs_set', {
      prefs: { enabled: false, window: 'both' },
    })
  })

  it('escolher "Ambos" persiste window: "both"', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'five_hour' })
      if (command === 'quota_prefs_set') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('quota_prefs_get'))

    const bothOption = await screen.findByRole('radio', { name: 'Ambos' })
    fireEvent.click(bothOption)

    expect(invokeMock).toHaveBeenCalledWith('quota_prefs_set', {
      prefs: { enabled: true, window: 'both' },
    })
  })
})

describe('SettingsShell — seção Atualizações ligada ao fluxo confirmado (SILENT-09/13/25)', () => {
  function baseMock(overrides: Record<string, () => Promise<unknown>> = {}) {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'update_auto_check_get') return Promise.resolve(true)
      const override = overrides[command]
      if (override) return override()
      return Promise.resolve(null)
    })
  }

  it('abrir a seção chama update_status e monta o estado ready com os campos devolvidos', async () => {
    baseMock({
      update_status: () =>
        Promise.resolve({
          current: '0.1.0',
          latest: '0.2.0',
          notes: '',
          has_update: true,
          mode: 'installed',
          platform_key: 'windows-x86_64-silent',
        }),
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_status'))
    expect(await screen.findByText('0.1.0')).toBeInTheDocument()
    expect(await screen.findByText(/Nova versão disponível: 0.2.0/)).toBeInTheDocument()
  })

  it('falha de update_status monta o estado unavailable com a versão instalada preservada', async () => {
    baseMock({
      update_status: () => Promise.reject(new Error('boom')),
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_status'))
    expect(await screen.findByText(/Não foi possível consultar/)).toBeInTheDocument()
  })

  it('confirmação chama update_apply e transiciona applying para applied', async () => {
    baseMock({
      update_status: () =>
        Promise.resolve({
          current: '0.1.0',
          latest: '0.2.0',
          notes: '',
          has_update: true,
          mode: 'installed',
          platform_key: 'windows-x86_64-silent',
        }),
      update_apply: () => Promise.resolve('0.2.0'),
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_status'))

    fireEvent.click(await screen.findByRole('button', { name: 'Baixar e atualizar' }))

    expect(invokeMock).toHaveBeenCalledWith('update_apply')
    expect(
      await screen.findByText('Atualizado para 0.2.0. Reinicie para concluir.'),
    ).toBeInTheDocument()
  })

  it('"Reiniciar agora" chama update_restart', async () => {
    baseMock({
      update_status: () =>
        Promise.resolve({
          current: '0.1.0',
          latest: '0.2.0',
          notes: '',
          has_update: true,
          mode: 'installed',
          platform_key: 'windows-x86_64-silent',
        }),
      update_apply: () => Promise.resolve('0.2.0'),
    })

    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))
    fireEvent.click(screen.getByRole('button', { name: /Atualizações/ }))
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_status'))

    fireEvent.click(await screen.findByRole('button', { name: 'Baixar e atualizar' }))
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('update_apply'))

    fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar agora' }))
    expect(invokeMock).toHaveBeenCalledWith('update_restart')
  })
})
