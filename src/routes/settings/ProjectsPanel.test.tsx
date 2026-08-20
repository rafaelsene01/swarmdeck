// SPEC: projects (PROJ-05, PROJ-19, PROJ-22, PROJ-23, PROJ-24)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ProjectsPanel, {
  countTerminalsByProject,
  projectInitial,
  truncatePath,
  type ProjectRow,
} from './ProjectsPanel'

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

// SPEC: projects (PROJ-19, PROJ-22, PROJ-23, PROJ-24) — a linha trocou o botão
// de editar (PROJ-20, revogado por AD-024) pelo de excluir, e ganhou a inicial
// dentro do quadrado de cor e a contagem de terminais abertos.
describe('ProjectsPanel — linha, contagem e exclusão', () => {
  it('cada linha mostra cor com inicial, nome, caminho truncado e contagem (PROJ-19, PROJ-22)', () => {
    render(<ProjectsPanel projects={PROJECTS} terminalCountByProject={{ p3: 2 }} />)

    const row = screen.getAllByRole('listitem')[0]!
    expect(row).toHaveTextContent('API Gateway')
    expect(row.querySelector('.projects-panel__path')?.getAttribute('title')).toBe(
      PROJECTS[2]!.path,
    )
    expect(row.querySelector('.projects-panel__color')?.textContent).toBe('A')
    expect(row).toHaveTextContent('2 terminais')
  })

  it('projeto sem terminal aberto exibe zero, no singular certo (PROJ-23)', () => {
    render(<ProjectsPanel projects={PROJECTS} terminalCountByProject={{ p1: 1 }} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('0 terminais')
    expect(rows[1]).toHaveTextContent('1 terminal')
  })

  it('inicial cai em "?" quando o nome só tem espaços (PROJ-22)', () => {
    expect(projectInitial('swarmdeck')).toBe('S')
    expect(projectInitial('   ')).toBe('?')
  })

  it('excluir pede confirmação antes de chamar onDelete (PROJ-24)', () => {
    const onDelete = vi.fn()
    render(<ProjectsPanel projects={PROJECTS} onDelete={onDelete} />)

    fireEvent.click(screen.getByLabelText('excluir SwarmDeck'))
    expect(onDelete).not.toHaveBeenCalled()

    expect(screen.getByRole('dialog', { name: 'excluir projeto SwarmDeck' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'excluir' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete.mock.calls[0]?.[0]).toMatchObject({ id: 'p1' })
  })

  it('cancelar o diálogo não exclui nada (PROJ-24)', () => {
    const onDelete = vi.fn()
    render(<ProjectsPanel projects={PROJECTS} onDelete={onDelete} />)

    fireEvent.click(screen.getByLabelText('excluir SwarmDeck'))
    fireEvent.click(screen.getByRole('button', { name: 'cancelar' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('projeto com terminal aberto tem o botão de excluir desabilitado (PROJ-24)', () => {
    const onDelete = vi.fn()
    render(
      <ProjectsPanel projects={PROJECTS} terminalCountByProject={{ p1: 1 }} onDelete={onDelete} />,
    )

    const button = screen.getByLabelText('excluir SwarmDeck')
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('erro de exclusão aparece na tela (PROJ-24)', () => {
    render(<ProjectsPanel projects={PROJECTS} deleteError="banco travado" />)

    expect(screen.getByRole('alert')).toHaveTextContent('banco travado')
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

// SPEC: projects (PROJ-23) — a contagem é a porta em TypeScript da regra de
// `projects::resolve`: prefixo por componente, mais específico vence.
describe('countTerminalsByProject (PROJ-23)', () => {
  const NESTED: ProjectRow[] = [
    { id: 'outer', name: 'outer', path: 'D:\\ide', color: '#fff', lastUsed: null },
    { id: 'inner', name: 'inner', path: 'D:\\ide\\packages\\web', color: '#fff', lastUsed: null },
  ]

  it('conta o cwd exato e o subdiretório do projeto', () => {
    expect(countTerminalsByProject(NESTED, ['D:\\ide', 'D:\\ide\\src'])).toEqual({ outer: 2 })
  })

  it('o projeto mais específico vence quando dois casam', () => {
    expect(countTerminalsByProject(NESTED, ['D:\\ide\\packages\\web\\src'])).toEqual({ inner: 1 })
  })

  it('compara por componente, sem confundir prefixo de string', () => {
    expect(countTerminalsByProject(NESTED, ['D:\\ide-old\\src'])).toEqual({})
  })

  it('aceita as duas barras e ignora caixa', () => {
    expect(countTerminalsByProject(NESTED, ['d:/IDE/src'])).toEqual({ outer: 1 })
  })

  it('cwd que não casa com projeto nenhum não conta para ninguém', () => {
    expect(countTerminalsByProject(NESTED, ['C:\\outro'])).toEqual({})
  })
})
