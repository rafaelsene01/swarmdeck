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

describe('SettingsShell — fechar a janela (SET-03/04/05)', () => {
  beforeEach(() => {
    closeMock.mockClear()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'project_list') return Promise.resolve([])
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
      return Promise.resolve(null)
    })
  })

  it('trilho mostra a seção ativa e troca ao navegar, sem alterar a navegação existente', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.getByText('Configurações › Agentes')).toBeInTheDocument()
    const projectsItem = screen.getByRole('button', { name: /Projetos/ })
    expect(projectsItem).not.toHaveAttribute('aria-current')

    fireEvent.click(projectsItem)

    expect(screen.getByText('Configurações › Projetos')).toBeInTheDocument()
    expect(projectsItem).toHaveAttribute('aria-current', 'page')
  })

  it('cada um dos 4 itens da sidebar tem ícone', async () => {
    render(<SettingsShell />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    for (const label of ['Agentes', 'Projetos', 'Status de terminal', 'Atualizações']) {
      const item = screen.getByRole('button', { name: new RegExp(label) })
      expect(item.querySelector('svg')).not.toBeNull()
    }
  })
})

describe('SettingsShell — persistência do toggle de auto-check (SET-09/10)', () => {
  beforeEach(() => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'project_list') return Promise.resolve([])
      if (command === 'update_auto_check_get') return Promise.resolve(false)
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
      if (command === 'update_auto_check_get') return Promise.reject(new Error('boom'))
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
