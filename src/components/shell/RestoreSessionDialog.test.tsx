// SPEC: session-restore (SESS-03, SESS-04, SESS-05, SESS-08, SESS-09, SESS-14, SESS-15)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RestoreSessionDialog, { type RestorableTab } from './RestoreSessionDialog'

function tabs(): RestorableTab[] {
  return [
    {
      id: 'tab-a',
      name: 'Aba 1',
      terminals: [
        { id: 't-0', cwd: '/home/user/projeto', agentId: 'claude-code', agentSessionId: 's-0' },
        { id: 't-1', cwd: '/home/user/api', agentId: 'codex-cli', agentSessionId: 's-1' },
      ],
    },
    {
      id: 'tab-b',
      name: 'Deploy',
      terminals: [
        { id: 't-2', cwd: '/home/user/infra', agentId: 'claude-code', agentSessionId: null },
      ],
    },
  ]
}

const RESUMABLE = new Set(['claude-code'])

function renderDialog(overrides: Partial<React.ComponentProps<typeof RestoreSessionDialog>> = {}) {
  const onRestore = vi.fn()
  const onStartFresh = vi.fn()

  render(
    <RestoreSessionDialog
      tabs={tabs()}
      resumableAgentIds={RESUMABLE}
      onRestore={onRestore}
      onStartFresh={onStartFresh}
      {...overrides}
    />,
  )

  return { onRestore, onStartFresh }
}

describe('RestoreSessionDialog', () => {
  // SESS-03: tudo marcado por padrão, e as duas abas visíveis com seus
  // terminais.
  it('nasce com todas as abas e todos os terminais marcados', () => {
    renderDialog()

    for (const label of [
      'restaurar aba Aba 1',
      'restaurar aba Deploy',
      'restaurar terminal user/projeto',
      'restaurar terminal user/api',
      'restaurar terminal user/infra',
    ]) {
      expect(screen.getByLabelText(label)).toBeChecked()
    }
  })

  // SESS-14: o padrão é retomar a sessão salva, para quem pode.
  it('terminal com sessão salva e agente que retoma nasce em "sessão salva"', () => {
    renderDialog()

    expect(screen.getByLabelText('restaurar sessão de user/projeto')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  // SESS-15: sem id salvo OU com agente que não retoma, o switch trava em
  // "nova sessão" — prometer retomada aqui daria "No conversation found".
  it('trava o switch em "nova" quando o agente não retoma ou não há sessão salva', () => {
    renderDialog()

    // Codex: tem id salvo, mas o CLI não aceita retomada.
    expect(screen.getByLabelText('nova sessão para user/api')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('restaurar sessão de user/api')).toBeDisabled()

    // Claude Code sem id salvo (workspace anterior à feature).
    expect(screen.getByLabelText('nova sessão para user/infra')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('restaurar sessão de user/infra')).toBeDisabled()
  })

  // SESS-05: a aba propaga a marcação para os terminais dela.
  it('desmarcar e remarcar a aba propaga para os terminais dela', () => {
    renderDialog()

    fireEvent.click(screen.getByLabelText('restaurar aba Aba 1'))

    expect(screen.getByLabelText('restaurar terminal user/projeto')).not.toBeChecked()
    expect(screen.getByLabelText('restaurar terminal user/api')).not.toBeChecked()
    // A outra aba não é afetada.
    expect(screen.getByLabelText('restaurar terminal user/infra')).toBeChecked()

    fireEvent.click(screen.getByLabelText('restaurar aba Aba 1'))

    expect(screen.getByLabelText('restaurar terminal user/projeto')).toBeChecked()
    expect(screen.getByLabelText('restaurar terminal user/api')).toBeChecked()
  })

  // SESS-04
  it('o contador acompanha os terminais marcados', () => {
    renderDialog()

    expect(screen.getByRole('status')).toHaveTextContent('3/3 terminais selecionados')

    fireEvent.click(screen.getByLabelText('restaurar terminal user/api'))

    expect(screen.getByRole('status')).toHaveTextContent('2/3 terminais selecionados')
  })

  // SESS-09
  it('desabilita "Restaurar selecionados" quando nenhum terminal está marcado', () => {
    renderDialog()

    const primary = screen.getByRole('button', { name: 'Restaurar selecionados' })
    expect(primary).toBeEnabled()

    fireEvent.click(screen.getByLabelText('restaurar aba Aba 1'))
    fireEvent.click(screen.getByLabelText('restaurar aba Deploy'))

    expect(primary).toBeDisabled()
  })

  // SESS-06 / SESS-16: a escolha sai completa — abas, terminais e o modo de
  // arranque de cada um.
  it('devolve só o marcado, com o modo de arranque de cada terminal', () => {
    const { onRestore } = renderDialog()

    fireEvent.click(screen.getByLabelText('restaurar terminal user/api'))
    fireEvent.click(screen.getByLabelText('nova sessão para user/projeto'))
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }))

    expect(onRestore).toHaveBeenCalledTimes(1)
    const selection = onRestore.mock.calls[0]![0]
    expect(selection.tabIds).toEqual(['tab-a', 'tab-b'])
    expect(selection.terminalIds).toEqual(['t-0', 't-2'])
    expect(selection.resumeByTerminalId['t-0']).toBe(false)
    expect(selection.resumeByTerminalId['t-2']).toBe(false)
  })

  // SESS-08: os três gestos de saída sem restaurar caem no mesmo lugar.
  it('"Começar do zero", o × e Escape acionam onStartFresh', () => {
    const { onStartFresh } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }))
    fireEvent.click(screen.getByLabelText('fechar sem restaurar'))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onStartFresh).toHaveBeenCalledTimes(3)
  })

  // Edge case: aba salva sem terminais aparece marcada, e restaurá-la é uma
  // escolha legítima (volta vazia, com o EmptyState).
  it('lista aba sem terminais e a mantém marcada', () => {
    const { onRestore } = renderDialog({
      tabs: [
        { id: 'tab-vazia', name: 'Notas', terminals: [] },
        {
          id: 'tab-a',
          name: 'Aba 1',
          terminals: [
            { id: 't-0', cwd: '/home/user/projeto', agentId: 'claude-code', agentSessionId: 's-0' },
          ],
        },
      ],
    })

    expect(screen.getByText('Aba sem terminais.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar selecionados' }))

    expect(onRestore.mock.calls[0]![0].tabIds).toEqual(['tab-vazia', 'tab-a'])
  })
})
