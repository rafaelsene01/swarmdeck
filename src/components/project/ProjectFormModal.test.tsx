// SPEC: projects (PROJ-18, PROJ-19)

// @ts-expect-error — o projeto não instala `@types/node` e `tsconfig.json`
// restringe `types`; o módulo existe em tempo de execução, no runner Node do
// Vitest, que é onde este teste lê a PALETTE do lado Rust.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProjectFormModal, { PALETTE } from './ProjectFormModal'

const { openMock } = vi.hoisted(() => ({ openMock: vi.fn() }))

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }))

function renderForm(props: Partial<Parameters<typeof ProjectFormModal>[0]> = {}) {
  return render(
    <ProjectFormModal onSubmit={vi.fn()} onCancel={vi.fn()} error={null} {...props} />,
  )
}

describe('ProjectFormModal', () => {
  beforeEach(() => {
    openMock.mockReset()
  })

  it('renderiza nome, diretório-base, as 8 cores e a opção de git (P2 AC6)', () => {
    renderForm()

    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText('Diretório base')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^cor #/ })).toHaveLength(8)
    expect(screen.getByLabelText('Inicializar como repositório git')).toBeInTheDocument()
  })

  it('confirmar com nome em branco não dispara onSubmit e o formulário continua aberto (P2 AC9, P3 AC6)', () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'criar' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'novo projeto' })).toBeInTheDocument()
  })

  it('o erro recebido aparece na tela e o formulário continua aberto', () => {
    renderForm({ error: 'diretório não encontrado: C:/nada' })

    expect(screen.getByRole('alert')).toHaveTextContent('diretório não encontrado: C:/nada')
    expect(screen.getByRole('dialog', { name: 'novo projeto' })).toBeInTheDocument()
  })

  it('cancelar o seletor de diretório deixa o campo como estava', async () => {
    renderForm()

    openMock.mockResolvedValueOnce('C:\\dev')
    fireEvent.click(screen.getByRole('button', { name: 'escolher pasta' }))
    await waitFor(() => expect(screen.getByLabelText('Diretório base')).toHaveValue('C:\\dev'))

    openMock.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole('button', { name: 'escolher pasta' }))

    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Diretório base')).toHaveValue('C:\\dev')
  })

  it('a paleta do cliente é idêntica à PALETTE de src-tauri/src/projects/service.rs', () => {
    // Vitest roda com o cwd na raiz do repositório (`vite.config.ts`).
    const source: string = readFileSync('src-tauri/src/projects/service.rs', 'utf8')
    const block = source.match(/const PALETTE: &\[&str\] = &\[([\s\S]*?)\];/)

    expect(block).not.toBeNull()
    const rustPalette = [...(block?.[1] ?? '').matchAll(/"(#[0-9a-fA-F]{6})"/g)].map((m) => m[1])

    expect(rustPalette).toHaveLength(8)
    expect([...PALETTE]).toEqual(rustPalette)
  })
})
