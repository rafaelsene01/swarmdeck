// SPEC: terminal-screenshot (SHOT-14, SHOT-16, SHOT-17, SHOT-18, SHOT-19, SHOT-20, SHOT-21)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { invokeMock, saveMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  saveMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: saveMock }))

import ScreenshotModal from './ScreenshotModal'

const FILE_NAME = 'swarmdeck-terminal-1-20260818-101500.png'

// jsdom não implementa nem `ClipboardItem` nem `Blob.arrayBuffer`.
class FakeClipboardItem {
  constructor(public items: Record<string, Blob>) {}
}
globalThis.ClipboardItem = FakeClipboardItem as unknown as typeof ClipboardItem

const clipboardWrite = vi.fn()
Object.defineProperty(navigator, 'clipboard', {
  value: { write: clipboardWrite },
  configurable: true,
})

function renderModal(onClose = vi.fn()) {
  const blob = new Blob(['png'], { type: 'image/png' })
  blob.arrayBuffer = () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer)
  render(<ScreenshotModal blob={blob} fileName={FILE_NAME} onClose={onClose} />)
  return { onClose }
}

describe('ScreenshotModal', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    saveMock.mockReset()
    clipboardWrite.mockReset()
    invokeMock.mockResolvedValue(undefined)
    clipboardWrite.mockResolvedValue(undefined)
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

  // SHOT-14: a imagem capturada aparece no modal.
  it('mostra a imagem e o nome sugerido do arquivo', () => {
    renderModal()

    expect(screen.getByAltText('Captura do terminal')).toHaveAttribute('src', 'blob:preview')
    expect(screen.getByText(FILE_NAME)).toBeInTheDocument()
  })

  // SHOT-16: seletor nativo com o nome sugerido, e escrita pelo comando Rust.
  it('salva pelo seletor nativo e fecha', async () => {
    saveMock.mockResolvedValue('D:/prints/print.png')
    const { onClose } = renderModal()

    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(saveMock).toHaveBeenCalledWith({ defaultPath: FILE_NAME })
    const [command, args] = invokeMock.mock.calls[0]!
    expect(command).toBe('screenshot_save')
    expect((args as { path: string }).path).toBe('D:/prints/print.png')
    expect((args as { bytes: Uint8Array }).bytes).toBeInstanceOf(Uint8Array)
  })

  // SHOT-19: cancelar o seletor não grava nada e mantém o modal aberto.
  it('mantém o modal aberto quando o seletor é cancelado', async () => {
    saveMock.mockResolvedValue(null)
    const { onClose } = renderModal()

    fireEvent.click(screen.getByText('Salvar'))

    await waitFor(() => expect(saveMock).toHaveBeenCalled())
    expect(invokeMock).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  // SHOT-20: falha de escrita aparece inline e o print não se perde.
  it('mostra a falha de gravação sem fechar', async () => {
    saveMock.mockResolvedValue('D:/prints/print.png')
    invokeMock.mockRejectedValue('acesso negado')
    const { onClose } = renderModal()

    fireEvent.click(screen.getByText('Salvar'))

    expect(await screen.findByRole('alert')).toHaveTextContent('acesso negado')
    expect(onClose).not.toHaveBeenCalled()
  })

  // SHOT-17: cópia como image/png na área de transferência.
  it('copia o PNG para a área de transferência e fecha', async () => {
    const { onClose } = renderModal()

    fireEvent.click(screen.getByText('Copiar'))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const item = clipboardWrite.mock.calls[0]![0][0] as FakeClipboardItem
    expect(item.items['image/png']!.type).toBe('image/png')
  })

  // SHOT-21: falha de área de transferência aparece inline e o modal fica.
  it('mostra a falha de cópia sem fechar', async () => {
    clipboardWrite.mockRejectedValue('clipboard indisponível')
    const { onClose } = renderModal()

    fireEvent.click(screen.getByText('Copiar'))

    expect(await screen.findByRole('alert')).toHaveTextContent('clipboard indisponível')
    expect(onClose).not.toHaveBeenCalled()
  })

  // SHOT-18: fechar pelo botão não salva nem copia.
  it('fecha pelo botão de fechar sem salvar nem copiar', () => {
    const { onClose } = renderModal()

    fireEvent.click(screen.getByLabelText('fechar'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(saveMock).not.toHaveBeenCalled()
    expect(clipboardWrite).not.toHaveBeenCalled()
  })

  // SHOT-18: Escape fecha o modal.
  it('fecha com Escape', () => {
    const { onClose } = renderModal()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // O object URL do preview é liberado no unmount.
  it('revoga o object URL ao desmontar', () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    const { unmount } = render(
      <ScreenshotModal blob={blob} fileName={FILE_NAME} onClose={vi.fn()} />,
    )

    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })
})
