// SPEC: shell-chrome (HDR-01, HDR-08, EMPTY-01..EMPTY-09), release-distribution (REL-52)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'

// Same `vi.hoisted` pattern as `NewTerminalDialog.test.tsx` — the `vi.mock`
// factories below are hoisted above these imports by Vitest's transform.
const { invokeMock, openMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {},
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
}))

/** Mesmo padrão de `useTaskStore.test.ts` — acha o handler registrado via
 * `listen('update://available', ...)` para disparar o evento manualmente. */
function getUpdateAvailableHandler() {
  const call = listenMock.mock.calls.find(([name]) => name === 'update://available')
  if (!call) throw new Error('listen("update://available", ...) não foi chamado')
  return call[1] as (event: { payload: { version: string } }) => void
}

/** Mesmo padrão de `getUpdateAvailableHandler`, para `quota://prefs-changed` (QUOTA-11). */
function getQuotaPrefsChangedHandler() {
  const call = listenMock.mock.calls.find(([name]) => name === 'quota://prefs-changed')
  if (!call) throw new Error('listen("quota://prefs-changed", ...) não foi chamado')
  return call[1] as (event: { payload: { enabled: boolean; window: string } }) => void
}

// `TerminalPane` drives real xterm.js against a PTY backend — out of scope
// for App-level wiring tests (HDR-01/HDR-08) and not viable in jsdom; a stub
// is enough since these tests never assert on terminal content.
vi.mock('./components/terminal/TerminalPane', () => ({
  default: () => <div data-testid="terminal-pane-stub" />,
}))

beforeEach(() => {
  invokeMock.mockReset()
  openMock.mockReset()
  listenMock.mockReset()
  listenMock.mockResolvedValue(() => {})
  // `TerminalHeader.handleClose` confirms before closing a terminal with an
  // active process (App always passes `hasActiveProcess`) - jsdom has no
  // native `window.confirm`.
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  invokeMock.mockImplementation((command: string) => {
    if (command === 'agent_catalog') return Promise.resolve([])
    if (command === 'agent_default') return Promise.resolve(null)
    if (command === 'terminal_picker_last_dir') return Promise.resolve(null)
    if (command === 'settings_open') return Promise.resolve(undefined)
    if (command === 'quota_prefs_get') return Promise.resolve({ enabled: false, window: 'both' })
    if (command === 'quota_claude') {
      return Promise.resolve({
        state: 'disabled',
        windows: [],
        planLabel: null,
        fetchedAt: null,
        retryAt: null,
      })
    }
    return Promise.resolve(undefined)
  })
})

/** Drives the real create-terminal flow (open dialog -> pick folder -> confirm),
 * same steps `NewTerminalDialog.test.tsx` uses - needed by EMPTY-04/EMPTY-09
 * which require an actual terminal to exist first. */
async function createTerminalViaDialog() {
  openMock.mockResolvedValueOnce('/home/user/projeto')
  fireEvent.click(screen.getByRole('button', { name: 'buscar pasta' }))
  await waitFor(() => expect(screen.getByLabelText('Diretório')).toHaveValue('/home/user/projeto'))
  fireEvent.click(screen.getByRole('button', { name: 'criar' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'criar' })).not.toBeInTheDocument())
}

describe('App - shell-chrome wiring', () => {
  it('mounts Header in place of the old .app-toolbar (HDR-01)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.getByLabelText('new terminal')).toBeInTheDocument()
    expect(screen.getByLabelText('settings')).toBeInTheDocument()
    expect(container.querySelector('.app-toolbar')).not.toBeInTheDocument()
  })

  it('Header\'s "new terminal" icon opens NewTerminalDialog, same as the old button (HDR-08)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByLabelText('new terminal'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
  })

  it('Header\'s "settings" icon calls settings_open, same as the old button (HDR-08)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByLabelText('settings'))

    expect(invokeMock).toHaveBeenCalledWith('settings_open')
  })
})

describe('App - release-distribution update badge (REL-52)', () => {
  it('receiving update://available shows the badge on the settings icon, and it stays visible for the rest of the session', async () => {
    render(<App />)
    await waitFor(() => expect(listenMock).toHaveBeenCalledWith('update://available', expect.any(Function)))

    expect(screen.queryByLabelText('update available')).not.toBeInTheDocument()

    const handler = getUpdateAvailableHandler()
    act(() => {
      handler({ payload: { version: '1.2.3' } })
    })

    expect(screen.getByLabelText('update available')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('settings'))
    expect(screen.getByLabelText('update available')).toBeInTheDocument()
  })

  it('repeated update://available events do not flicker or duplicate the badge (Edge Case)', async () => {
    render(<App />)
    await waitFor(() => expect(listenMock).toHaveBeenCalledWith('update://available', expect.any(Function)))

    const handler = getUpdateAvailableHandler()
    act(() => {
      handler({ payload: { version: '1.2.3' } })
      handler({ payload: { version: '1.2.4' } })
    })

    expect(screen.getAllByLabelText('update available')).toHaveLength(1)
  })

  it('with no event received, Header keeps hasUpdateAvailable=false', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.queryByLabelText('update available')).not.toBeInTheDocument()
  })
})

describe('App - shell-chrome empty state', () => {
  it('boots with zero terminals and shows EmptyState instead of GridLayout (EMPTY-01, EMPTY-02, EMPTY-03)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
    expect(screen.queryByLabelText('fechar terminal')).not.toBeInTheDocument()
  })

  it('creating a terminal swaps EmptyState for GridLayout, and closing the last terminal swaps back (EMPTY-01, EMPTY-02, EMPTY-04)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()

    expect(screen.queryByText('No Terminals Active')).not.toBeInTheDocument()
    expect(screen.getByLabelText('fechar terminal')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('fechar terminal'))

    expect(screen.getByText('No Terminals Active')).toBeInTheDocument()
  })

  it('"+ Create Terminal" opens NewTerminalDialog (EMPTY-06)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
  })

  it('Ctrl+T opens NewTerminalDialog while empty and dialog closed, and prevents the default (EMPTY-07)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    const notPrevented = fireEvent.keyDown(window, { key: 't', ctrlKey: true })

    expect(notPrevented).toBe(false)
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
  })

  it('Ctrl+T while the dialog is already open does not open a second instance (EMPTY-08)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 't', ctrlKey: true })

    expect(screen.getAllByRole('button', { name: 'criar' })).toHaveLength(1)
  })

  it('T without Ctrl does not open the dialog (Edge Case)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.keyDown(window, { key: 't', ctrlKey: false })

    expect(screen.queryByRole('button', { name: 'criar' })).not.toBeInTheDocument()
  })

  it('Ctrl+T has no effect once a terminal is open (EMPTY-09)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()

    fireEvent.keyDown(window, { key: 't', ctrlKey: true })

    expect(screen.queryByRole('button', { name: 'criar' })).not.toBeInTheDocument()
  })
})

describe('App - terminal-tabs (TAB-01..TAB-05)', () => {
  it('"nova aba" cria uma aba vazia e a torna ativa; a aba anterior guarda seus terminais (TAB-01, TAB-03)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()
    const paneOfTab1 = screen.getByTestId('terminal-pane-stub')

    fireEvent.click(screen.getByLabelText('nova aba'))

    // A aba 2 (vazia) é a visível; a aba 1 continua montada — MESMO nó de
    // painel, nunca desmontado — só fora de vista. É isso que preserva o PTY.
    expect(screen.getByText('No Terminals Active')).toBeVisible()
    expect(screen.getByTestId('terminal-pane-stub')).toBe(paneOfTab1)
    expect(paneOfTab1).not.toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: /Aba 1/ }))
    expect(screen.getByText('No Terminals Active')).not.toBeVisible()
    expect(screen.getByTestId('terminal-pane-stub')).toBeVisible()
  })

  it('fechar a aba ativa ativa a vizinha e desmonta os painéis dela (TAB-02, TAB-04)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    fireEvent.click(screen.getByLabelText('nova aba'))
    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()
    expect(screen.getByTestId('terminal-pane-stub')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('fechar Aba 2'))

    expect(screen.queryByTestId('terminal-pane-stub')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Aba 1/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('a última aba não pode ser fechada (TAB-04)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    expect(screen.queryByLabelText('fechar Aba 1')).not.toBeInTheDocument()
  })

  it('o teto de 4 terminais vale por aba: a aba nova nasce com "new terminal" liberado (TAB-05)', async () => {
    render(<App />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('agent_catalog'))

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByLabelText('new terminal'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
      await createTerminalViaDialog()
    }
    expect(screen.getByLabelText('new terminal')).toBeDisabled()

    fireEvent.click(screen.getByLabelText('nova aba'))

    expect(screen.getByLabelText('new terminal')).toBeEnabled()
  })
})

describe('App - quota-indicator prefs wiring (QUOTA-11)', () => {
  it('busca quota_prefs_get uma vez na montagem e o resultado desce para o Header', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'quota_claude') {
        return Promise.resolve({
          state: 'disabled',
          windows: [],
          planLabel: null,
          fetchedAt: null,
          retryAt: null,
        })
      }
      return Promise.resolve(undefined)
    })

    render(<App />)

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('quota_prefs_get'))
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'quota_prefs_get')).toHaveLength(1)
    await waitFor(() => expect(screen.getByLabelText('quota')).toBeInTheDocument())
  })

  it('quota://prefs-changed com enabled:false remove o indicador sem remontar os painéis', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'agent_catalog') return Promise.resolve([])
      if (command === 'agent_default') return Promise.resolve(null)
      if (command === 'terminal_picker_last_dir') return Promise.resolve(null)
      if (command === 'quota_prefs_get') return Promise.resolve({ enabled: true, window: 'both' })
      if (command === 'quota_claude') {
        return Promise.resolve({
          state: 'disabled',
          windows: [],
          planLabel: null,
          fetchedAt: null,
          retryAt: null,
        })
      }
      return Promise.resolve(undefined)
    })

    render(<App />)
    await waitFor(() => expect(screen.getByLabelText('quota')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '+ Create Terminal' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'criar' })).toBeInTheDocument())
    await createTerminalViaDialog()

    const paneBefore = screen.getByTestId('terminal-pane-stub')

    act(() => {
      getQuotaPrefsChangedHandler()({ payload: { enabled: false, window: 'both' } })
    })

    expect(screen.queryByLabelText('quota')).not.toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane-stub')).toBe(paneBefore)
  })
})
