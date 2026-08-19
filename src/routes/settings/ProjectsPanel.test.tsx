// SPEC: projects (PROJ-05, PROJ-19, PROJ-20)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ProjectsPanel, { truncatePath, type ProjectRow } from './ProjectsPanel'

const PROJECTS: ProjectRow[] = [
  {
    id: 'p1',
    name: 'SwarmDeck',
    path: 'C:\\Users\\rafael\\dev\\swarmdeck',
    color: '#ff0000',
    lastUsed: 1_700_000_000,
  },
  {
    id: 'p2',
    name: 'Website',
    path: 'C:\\Users\\rafael\\dev\\website',
    color: '#00ff00',
    lastUsed: null,
  },
  {
    id: 'p3',
    name: 'API Gateway',
    path: 'D:\\projects\\api-gateway',
    color: '#0000ff',
    lastUsed: 1_800_000_000,
  },
]

describe('ProjectsPanel', () => {
  it('ordena por último uso mais recente primeiro, com nunca usados no fim', () => {
    render(<ProjectsPanel projects={PROJECTS} />)

    const rows = screen.getAllByRole('listitem').map((row) => row.textContent)

    // p3 (1_800_000_000) antes de p1 (1_700_000_000) antes de p2 (null).
    expect(rows[0]).toContain('API Gateway')
    expect(rows[1]).toContain('SwarmDeck')
    expect(rows[2]).toContain('Website')
  })

  it('busca filtra por nome (case-insensitive, substring)', () => {
    render(<ProjectsPanel projects={PROJECTS} />)

    const search = screen.getByLabelText('Buscar projetos')
    fireEvent.change(search, { target: { value: 'website' } })

    expect(screen.getByText('Website')).toBeInTheDocument()
    expect(screen.queryByText('SwarmDeck')).not.toBeInTheDocument()
    expect(screen.queryByText('API Gateway')).not.toBeInTheDocument()
  })

  it('busca filtra por caminho (case-insensitive, substring)', () => {
    render(<ProjectsPanel projects={PROJECTS} />)

    const search = screen.getByLabelText('Buscar projetos')
    fireEvent.change(search, { target: { value: 'api-gateway' } })

    expect(screen.getByText('API Gateway')).toBeInTheDocument()
    expect(screen.queryByText('SwarmDeck')).not.toBeInTheDocument()
    expect(screen.queryByText('Website')).not.toBeInTheDocument()
  })

  it('trunca caminho longo no meio, preservando início e fim', () => {
    const longPath = 'C:\\Users\\rafael\\dev\\muito\\aninhado\\projeto\\de\\verdade\\meu-projeto'

    const result = truncatePath(longPath, 10)

    expect(result).toBe(`${longPath.slice(0, 10)}...${longPath.slice(-10)}`)
    expect(result.startsWith(longPath.slice(0, 10))).toBe(true)
    expect(result.endsWith(longPath.slice(-10))).toBe(true)
    expect(result.length).toBeLessThan(longPath.length)
  })

  it('estado vazio convida a criar o primeiro projeto', () => {
    render(<ProjectsPanel projects={[]} />)

    expect(screen.getByText('Nenhum projeto ainda')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar projeto' })).toBeInTheDocument()
  })
})

// SPEC: projects (PROJ-19, PROJ-20) — o painel deixou de mostrar contagem de
// tarefas (AD-004: número que ninguém alimenta é afirmação falsa) e passou a
// oferecer criar e editar.
describe('ProjectsPanel — criar e editar (PROJ-19, PROJ-20)', () => {
  it('cada linha mostra cor, nome e caminho truncado, sem contagem de tarefas', () => {
    const { container } = render(<ProjectsPanel projects={PROJECTS} />)

    const row = screen.getAllByRole('listitem')[0]!
    expect(row).toHaveTextContent('API Gateway')
    expect(row.querySelector('.projects-panel__path')?.getAttribute('title')).toBe(
      PROJECTS[2]!.path,
    )
    expect(row.textContent).not.toMatch(/tarefas/)
    expect(container.querySelector('.projects-panel__color')).toBeInTheDocument()
  })

  it('o botão de edição da linha chama onEdit com aquele projeto', () => {
    const onEdit = vi.fn()
    render(<ProjectsPanel projects={PROJECTS} onEdit={onEdit} />)

    fireEvent.click(screen.getByLabelText('editar SwarmDeck'))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0]?.[0]).toMatchObject({ id: 'p1', name: 'SwarmDeck' })
  })

  it('"Criar projeto" chama onCreate na lista e no estado vazio', () => {
    const onCreate = vi.fn()
    const { unmount } = render(<ProjectsPanel projects={PROJECTS} onCreate={onCreate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))
    expect(onCreate).toHaveBeenCalledTimes(1)

    unmount()
    render(<ProjectsPanel projects={[]} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Criar projeto' }))

    expect(onCreate).toHaveBeenCalledTimes(2)
  })
})
