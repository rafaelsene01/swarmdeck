// SPEC: editor-launch (EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04)

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import EditorMenu from './EditorMenu'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const invokeMock = vi.mocked(invoke)

/** `editor_catalog` devolve `entries`; `editor_open` resolve vazio. */
function mockCatalog(entries: Array<{ id: string; name: string }>) {
  invokeMock.mockImplementation((command: string) =>
    command === 'editor_catalog' ? Promise.resolve(entries) : Promise.resolve(undefined),
  )
}

describe('EditorMenu — abrir a pasta do terminal num editor', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  // EDITOR-01: sem pasta não há o que abrir.
  it('desabilita o botão quando o terminal não tem cwd', () => {
    mockCatalog([])
    render(<EditorMenu />)

    expect(screen.getByLabelText('abrir pasta no editor')).toBeDisabled()
  })

  // EDITOR-02: a lista vem do backend, e só na abertura.
  it('só busca o catálogo ao abrir, e lista os editores devolvidos', async () => {
    mockCatalog([
      { id: 'vscode', name: 'VS Code' },
      { id: 'cursor', name: 'Cursor' },
    ])
    render(<EditorMenu cwd="/home/user/proj" />)

    expect(invokeMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('abrir pasta no editor'))

    expect(invokeMock).toHaveBeenCalledWith('editor_catalog')
    expect(await screen.findByRole('menuitem', { name: /VS Code/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Cursor/ })).toBeInTheDocument()
  })

  // EDITOR-03: nada instalado é uma resposta explícita, não um popover vazio.
  it('sem nenhum editor instalado, explica que não achou nada no PATH', async () => {
    mockCatalog([])
    render(<EditorMenu cwd="/home/user/proj" />)

    fireEvent.click(screen.getByLabelText('abrir pasta no editor'))

    expect(await screen.findByText(/Nenhum editor encontrado no PATH/)).toBeInTheDocument()
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
  })

  it('trata falha da busca como lista vazia em vez de ficar em "procurando"', async () => {
    invokeMock.mockRejectedValue(new Error('IPC caiu'))
    render(<EditorMenu cwd="/home/user/proj" />)

    fireEvent.click(screen.getByLabelText('abrir pasta no editor'))

    expect(await screen.findByText(/Nenhum editor encontrado no PATH/)).toBeInTheDocument()
  })

  // EDITOR-04: a escolha lança o editor com o cwd daquele terminal e fecha.
  it('escolher um editor manda id e cwd para editor_open e fecha o popover', async () => {
    mockCatalog([{ id: 'cursor', name: 'Cursor' }])
    render(<EditorMenu cwd="/home/user/proj" />)

    fireEvent.click(screen.getByLabelText('abrir pasta no editor'))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Cursor/ }))

    expect(invokeMock).toHaveBeenCalledWith('editor_open', {
      id: 'cursor',
      cwd: '/home/user/proj',
    })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('Escape fecha o popover sem abrir editor nenhum', async () => {
    mockCatalog([{ id: 'vscode', name: 'VS Code' }])
    render(<EditorMenu cwd="/home/user/proj" />)

    fireEvent.click(screen.getByLabelText('abrir pasta no editor'))
    await screen.findByRole('menuitem', { name: /VS Code/ })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(invokeMock).not.toHaveBeenCalledWith('editor_open', expect.anything())
  })
})
