// SPEC: feedback-form (FEED-02, FEED-03, FEED-04, FEED-05, FEED-06, FEED-07, FEED-08, FEED-09, FEED-10, FEED-11, FEED-12, FEED-13, FEED-14, FEED-15)

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import FeedbackPanel, { partitionFiles } from './FeedbackPanel'

// FEED-12: espião no IPC — o painel não pode chamar `invoke` nesta fase.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

describe('FeedbackPanel — categoria e título (FEED-02, FEED-03, FEED-05)', () => {
  it('oferece exatamente as quatro categorias, na ordem da spec', () => {
    render(<FeedbackPanel />)

    const options = screen.getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Feedback geral',
      'Relatar bug',
      'Pedido de recurso',
      'Sugestão de melhoria',
    ])
    expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual([
      'general',
      'bug',
      'feature',
      'improvement',
    ])
  })

  it('deixa "Feedback geral" selecionada na montagem', () => {
    render(<FeedbackPanel />)

    expect(screen.getByLabelText('Categoria')).toHaveValue('general')
  })

  it('trocar a categoria mantém a escolha do usuário', () => {
    render(<FeedbackPanel />)

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'bug' } })

    expect(screen.getByLabelText('Categoria')).toHaveValue('bug')
  })

  it('o contador do título acompanha o que foi digitado', () => {
    render(<FeedbackPanel />)

    expect(screen.getByText('0 / 255')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'travou ao abrir' } })

    expect(screen.getByText('15 / 255')).toBeInTheDocument()
  })

  it('o campo de título trava em 255 caracteres e é obrigatório', () => {
    render(<FeedbackPanel />)

    const input = screen.getByLabelText(/Título/) as HTMLInputElement
    expect(input.maxLength).toBe(255)
    expect(input).toBeRequired()
  })

  it('os campos obrigatórios são marcados por texto, não só por cor', () => {
    const { container } = render(<FeedbackPanel />)

    // A estrela é decorativa (`aria-hidden`); quem carrega o significado é o
    // texto fora da tela, que entra no nome acessível do campo.
    expect(container.querySelectorAll('.feedback-panel__required')).toHaveLength(2)
    container
      .querySelectorAll('.feedback-panel__required')
      .forEach((star) => expect(star).toHaveAttribute('aria-hidden', 'true'))
    expect(screen.getByLabelText(/Título.*\(obrigatório\)/)).toBeRequired()
    expect(screen.getByLabelText(/Descrição.*\(obrigatório\)/)).toBeRequired()
  })

  it('cada rótulo está associado ao seu controle', () => {
    render(<FeedbackPanel />)

    expect(screen.getByLabelText('Categoria').tagName).toBe('SELECT')
    expect(screen.getByLabelText(/Título/).tagName).toBe('INPUT')
  })
})

describe('FeedbackPanel — descrição em Markdown com abas (FEED-04, FEED-13, FEED-15)', () => {
  it('mostra as duas abas num tablist, com "Escrever" ativa na montagem', () => {
    render(<FeedbackPanel />)

    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Escrever', 'Visualizar'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByLabelText(/Descrição/).tagName).toBe('TEXTAREA')
  })

  it('a descrição é obrigatória e aceita várias linhas', () => {
    render(<FeedbackPanel />)

    const textarea = screen.getByLabelText(/Descrição/) as HTMLTextAreaElement
    expect(textarea).toBeRequired()
    expect(textarea.rows).toBeGreaterThan(1)
  })

  it('"Visualizar" renderiza o Markdown e voltar para "Escrever" preserva o texto', () => {
    render(<FeedbackPanel />)

    fireEvent.change(screen.getByLabelText(/Descrição/), {
      target: { value: '# Título\n\n- item\n\n1. numerado\n\n> citação' },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Visualizar' }))

    expect(screen.getByRole('heading', { name: 'Título' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByLabelText(/Descrição/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Escrever' }))

    expect(screen.getByLabelText(/Descrição/)).toHaveValue('# Título\n\n- item\n\n1. numerado\n\n> citação')
  })

  it('descrição vazia mostra o estado vazio na aba "Visualizar"', () => {
    render(<FeedbackPanel />)

    fireEvent.click(screen.getByRole('tab', { name: 'Visualizar' }))

    expect(screen.getByText('Nada para visualizar ainda.')).toBeInTheDocument()
  })

  it('o tabpanel é anunciado pela aba ativa', () => {
    render(<FeedbackPanel />)

    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Escrever')
    fireEvent.click(screen.getByRole('tab', { name: 'Visualizar' }))
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Visualizar')
  })
})

describe('FeedbackPanel — anexos de imagem (FEED-06, FEED-07, FEED-08, FEED-11)', () => {
  // jsdom não implementa a API de object URL; mesmo stub de
  // `ScreenshotModal.test.tsx`.
  beforeEach(() => {
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:anexo-${(n += 1)}`)
    URL.revokeObjectURL = vi.fn()
  })

  function imageFile(name: string, sizeMb: number, type = 'image/png') {
    const file = new File(['x'], name, { type })
    Object.defineProperty(file, 'size', { value: Math.round(sizeMb * 1024 * 1024) })
    return file
  }

  function pick(files: File[]) {
    const input = screen.getByLabelText('Anexos') as HTMLInputElement
    fireEvent.change(input, { target: { files } })
  }

  it('o botão abre o seletor do SO, em modo múltiplo e filtrado por imagens (FEED-06 AC1)', () => {
    render(<FeedbackPanel />)

    const input = screen.getByLabelText('Anexos') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/*')
    expect(input.multiple).toBe(true)

    // O input nativo fica escondido; o alvo visível é o botão, então o clique
    // dele precisa chegar ao input — sem isso o botão fica morto.
    const opened = vi.fn()
    input.addEventListener('click', opened)
    fireEvent.click(screen.getByRole('button', { name: /Selecionar imagens/ }))

    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('exibe uma miniatura por arquivo aceito, com nome, tamanho e remover', () => {
    render(<FeedbackPanel />)

    pick([imageFile('erro.png', 1.5)])

    expect(screen.getByText('erro.png')).toBeInTheDocument()
    expect(screen.getByText('1.5 MB')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover erro.png' })).toBeInTheDocument()
  })

  it('lote acima de 5 aceita o que cabe e nomeia cada recusado', () => {
    render(<FeedbackPanel />)

    pick([1, 2, 3, 4, 5, 6].map((n) => imageFile(`img${n}.png`, 0.2)))

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('alert')).toHaveTextContent('img6.png')
  })

  it('arquivo acima de 10 MB é recusado pelo nome e os válidos do lote entram', () => {
    render(<FeedbackPanel />)

    pick([imageFile('grande.png', 11), imageFile('ok.png', 9)])

    expect(screen.getByText('ok.png')).toBeInTheDocument()
    expect(screen.queryByText('grande.png')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('grande.png')
  })

  it('arquivo que não é imagem é recusado pelo nome', () => {
    render(<FeedbackPanel />)

    pick([imageFile('notas.txt', 0.1, 'text/plain')])

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('notas.txt')
  })

  it('com 5 imagens na lista o botão de seleção fica desabilitado', () => {
    render(<FeedbackPanel />)

    pick([1, 2, 3, 4, 5].map((n) => imageFile(`img${n}.png`, 0.2)))

    expect(screen.getByRole('button', { name: /Selecionar imagens/ })).toBeDisabled()
  })

  it('um lote válido depois de uma recusa limpa a mensagem', () => {
    render(<FeedbackPanel />)

    pick([imageFile('grande.png', 11)])
    expect(screen.getByRole('alert')).toBeInTheDocument()

    pick([imageFile('ok.png', 1)])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('remover uma imagem revoga o object URL dela', () => {
    render(<FeedbackPanel />)

    pick([imageFile('erro.png', 1)])
    fireEvent.click(screen.getByRole('button', { name: 'Remover erro.png' }))

    expect(screen.queryByText('erro.png')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:anexo-1')
  })

  it('o mesmo arquivo escolhido duas vezes entra como duas entradas', () => {
    render(<FeedbackPanel />)

    pick([imageFile('erro.png', 1)])
    pick([imageFile('erro.png', 1)])

    expect(screen.getAllByText('erro.png')).toHaveLength(2)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('um lote vazio (diálogo cancelado) mantém a lista intacta', () => {
    render(<FeedbackPanel />)

    pick([imageFile('erro.png', 1)])
    pick([])

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('partitionFiles (FEED-07, FEED-08, FEED-11)', () => {
  function file(name: string, size: number, type = 'image/png') {
    const f = new File(['x'], name, { type })
    Object.defineProperty(f, 'size', { value: size })
    return f
  }

  it('conta as já anexadas ao aplicar o teto de 5', () => {
    const result = partitionFiles(4, [file('a.png', 10), file('b.png', 10)])

    expect(result.accepted.map((f) => f.name)).toEqual(['a.png'])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0]).toContain('b.png')
  })
})

describe('FeedbackPanel — enviar e limpar (FEED-09, FEED-10, FEED-12)', () => {
  beforeEach(() => {
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:anexo-${(n += 1)}`)
    URL.revokeObjectURL = vi.fn()
  })

  function imageFile(name: string) {
    const file = new File(['x'], name, { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 1024 })
    return file
  }

  function fill() {
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'travou' } })
    fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: 'ao abrir' } })
  }

  it('o primário fica desabilitado enquanto título ou descrição estão vazios', () => {
    render(<FeedbackPanel />)
    const submit = screen.getByRole('button', { name: /Enviar feedback/ })

    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'travou' } })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: '   ' } })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: 'ao abrir' } })
    expect(submit).toBeEnabled()
  })

  it('o clique no primário avisa que o envio ainda não existe, num role="status"', () => {
    render(<FeedbackPanel />)

    // A região viva existe desde o primeiro render — só o texto dela muda.
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    fill()

    fireEvent.click(screen.getByRole('button', { name: /Enviar feedback/ }))

    expect(screen.getByRole('status')).toHaveTextContent(/ainda não foi implementado/)
  })

  it('"Limpar" restaura categoria, título, descrição, aba, anexos e mensagens', () => {
    render(<FeedbackPanel />)

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'bug' } })
    fill()
    fireEvent.change(screen.getByLabelText('Anexos'), { target: { files: [imageFile('erro.png')] } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar feedback/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Visualizar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))

    expect(screen.getByLabelText('Categoria')).toHaveValue('general')
    expect(screen.getByLabelText(/Título/)).toHaveValue('')
    expect(screen.getByLabelText(/Descrição/)).toHaveValue('')
    expect(screen.getByRole('tab', { name: 'Escrever' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('erro.png')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('"Limpar" fica desabilitado no estado inicial e volta a ficar depois de limpar', () => {
    render(<FeedbackPanel />)
    const reset = screen.getByRole('button', { name: 'Limpar' })

    expect(reset).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'x' } })
    expect(reset).toBeEnabled()

    fireEvent.click(reset)
    expect(reset).toBeDisabled()
  })

  it('"Limpar" revoga o object URL de cada miniatura', () => {
    render(<FeedbackPanel />)

    fireEvent.change(screen.getByLabelText('Anexos'), {
      target: { files: [imageFile('a.png'), imageFile('b.png')] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:anexo-1')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:anexo-2')
  })

  it('desmontar o painel revoga os object URLs pendentes', () => {
    const { unmount } = render(<FeedbackPanel />)

    fireEvent.change(screen.getByLabelText('Anexos'), { target: { files: [imageFile('a.png')] } })
    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:anexo-1')
  })

  it('remover a miniatura segue funcionando sem URL.revokeObjectURL no ambiente', () => {
    const original = URL.revokeObjectURL
    // @ts-expect-error — o edge case da spec é justamente a API ausente
    URL.revokeObjectURL = undefined
    render(<FeedbackPanel />)

    fireEvent.change(screen.getByLabelText('Anexos'), { target: { files: [imageFile('a.png')] } })
    fireEvent.click(screen.getByRole('button', { name: 'Remover a.png' }))

    expect(screen.queryByText('a.png')).not.toBeInTheDocument()
    URL.revokeObjectURL = original
  })

  it('nenhum invoke e nenhuma requisição de rede saem desta tela (FEED-12)', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(<FeedbackPanel />)
    fill()
    fireEvent.change(screen.getByLabelText('Anexos'), { target: { files: [imageFile('a.png')] } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar feedback/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))

    expect(invokeMock).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
