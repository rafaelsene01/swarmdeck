// SPEC: projects (PROJ-10, PROJ-16, PROJ-17, PROJ-18)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ProjectStep from './ProjectStep'
import { truncatePath, type ProjectRow } from '../../routes/settings/ProjectsPanel'

const NOW = Date.now()
const MINUTE = 60_000

const ALPHA: ProjectRow = {
  id: 'a',
  name: 'alpha',
  path: '/home/user/dev/alpha',
  color: '#ef4444',
  lastUsed: NOW - 5 * MINUTE,
}
const BETA: ProjectRow = {
  id: 'b',
  name: 'beta',
  path: '/home/user/dev/beta',
  color: '#22c55e',
  lastUsed: NOW - 120 * MINUTE,
}
const GAMMA: ProjectRow = {
  id: 'g',
  name: 'gamma',
  path: '/srv/gamma',
  color: '#3b82f6',
  lastUsed: null,
}

function renderStep(props: Partial<Parameters<typeof ProjectStep>[0]> = {}) {
  return render(
    <ProjectStep
      projects={[GAMMA, BETA, ALPHA]}
      query=""
      onQueryChange={vi.fn()}
      onSelect={vi.fn()}
      onNewProject={vi.fn()}
      onImportProject={vi.fn()}
      onNoProject={vi.fn()}
      onCancel={vi.fn()}
      error={null}
      {...props}
    />,
  )
}

const rowNames = () =>
  screen.getAllByRole('listitem').map((li) => li.querySelector('.project-step__name')?.textContent)

describe('ProjectStep', () => {
  it('lista do uso mais recente para o mais antigo, com os nunca abertos por último (P1 AC2)', () => {
    renderStep()

    expect(rowNames()).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('cada linha traz inicial na cor do projeto, nome, caminho truncado e idade do último uso (P1 AC2)', () => {
    renderStep()

    const rows = screen.getAllByRole('listitem')
    const first = rows[0]!
    const initial = first.querySelector('.project-step__initial') as HTMLElement

    expect(initial).toHaveTextContent('A')
    expect(initial.style.backgroundColor).toBe('rgb(239, 68, 68)')
    expect(first.querySelector('.project-step__path')).toHaveTextContent('/home/user/dev/alpha')
    expect(first.querySelector('.project-step__age')).toHaveTextContent('5min')
    expect(rows[2]!.querySelector('.project-step__age')).toHaveTextContent('nunca')
  })

  it('sem busca o contador mostra o total nos dois lados (P1 AC3)', () => {
    renderStep()

    expect(screen.getByText('3 / 3 projects')).toBeInTheDocument()
  })

  it('com busca o contador mostra N pós-filtro sobre M total (P1 AC3)', () => {
    renderStep({ query: 'gamma' })

    expect(screen.getByText('1 / 3 projects')).toBeInTheDocument()
    expect(rowNames()).toEqual(['gamma'])
  })

  it('a busca filtra por nome, sem diferenciar caixa (P1 AC4)', () => {
    renderStep({ query: 'BET' })

    expect(rowNames()).toEqual(['beta'])
  })

  it('a busca filtra por caminho, sem diferenciar caixa (P1 AC4)', () => {
    renderStep({ query: '/SRV/' })

    expect(rowNames()).toEqual(['gamma'])
  })

  it('digitar na busca chama onQueryChange com o texto', () => {
    const onQueryChange = vi.fn()
    renderStep({ onQueryChange })

    fireEvent.change(screen.getByLabelText('Buscar projetos'), { target: { value: 'alp' } })

    expect(onQueryChange).toHaveBeenCalledWith('alp')
  })

  it('lista vazia mostra "0 / 0 projects" com os três botões de rodapé ativos (edge case)', () => {
    renderStep({ projects: [] })

    expect(screen.getByText('0 / 0 projects')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'New Project' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Import Project' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'No Project' })).toBeEnabled()
  })

  it('caminho longo aparece truncado com o caminho completo em title (edge case)', () => {
    const longPath = '/home/user/workspaces/clientes/acme/servicos/backend-principal'
    renderStep({ projects: [{ ...ALPHA, path: longPath }] })

    const path = screen
      .getAllByRole('listitem')[0]!
      .querySelector('.project-step__path') as HTMLElement

    expect(path).toHaveAttribute('title', longPath)
    expect(path.textContent).toBe(truncatePath(longPath))
    expect(path.textContent).not.toBe(longPath)
  })

  it('clicar numa linha chama onSelect com aquele projeto', () => {
    const onSelect = vi.fn()
    renderStep({ onSelect })

    fireEvent.click(screen.getByRole('button', { name: /beta/ }))

    expect(onSelect).toHaveBeenCalledWith(BETA)
  })

  it('cada botão do rodapé e o fechar chamam o próprio callback', () => {
    const onNewProject = vi.fn()
    const onImportProject = vi.fn()
    const onNoProject = vi.fn()
    const onCancel = vi.fn()
    renderStep({ onNewProject, onImportProject, onNoProject, onCancel })

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import Project' }))
    fireEvent.click(screen.getByRole('button', { name: 'No Project' }))
    fireEvent.click(screen.getByRole('button', { name: 'fechar' }))

    expect(onNewProject).toHaveBeenCalledTimes(1)
    expect(onImportProject).toHaveBeenCalledTimes(1)
    expect(onNoProject).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('a prop error aparece acima da lista', () => {
    renderStep({ error: 'caminho não encontrado: /home/user/dev/alpha' })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('caminho não encontrado: /home/user/dev/alpha')
    expect(
      alert.compareDocumentPosition(screen.getByRole('list')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
