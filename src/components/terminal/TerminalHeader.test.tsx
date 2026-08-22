// SPEC: terminal-chrome (CHROME-02, CHROME-04), minimized-tray (MIN-13), multi-terminal (TERM-05, TERM-12, TERM-13), terminal-layout-options (LAYOUT-17), editor-launch (EDITOR-01), terminal-screenshot (SHOT-01), projects (PROJ-11, PROJ-12), terminal-header-accent (HACC-01, HACC-03)

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TerminalHeader from './TerminalHeader'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('TerminalHeader — barra de título da janela (CHROME-02)', () => {
  // SPEC: terminal-header-accent (HACC-01) — quatro terminais, quatro cores:
  // a borda do cabeçalho é o que os diferencia sem ler o título.
  it('pinta a borda do header com a cor do projeto', () => {
    const { container } = render(<TerminalHeader index={1} title="alpha" accentColor="#ef4444" />)

    const header = container.querySelector('.terminal-header') as HTMLElement
    expect(header.style.borderColor).toBe('rgb(239, 68, 68)')
  })

  // SPEC: terminal-header-accent (HACC-03) — pasta fora do cadastro não vira
  // contorno transparente: o inline sai e a regra do CSS vale.
  it('sem cor de projeto mantém a borda padrão', () => {
    const { container } = render(<TerminalHeader index={1} title={null} accentColor={null} />)

    const header = container.querySelector('.terminal-header') as HTMLElement
    expect(header.style.borderColor).toBe('')
  })

  it('sem título vindo do backend, identifica o terminal pelo número em vez de "sem título"', () => {
    render(<TerminalHeader index={2} title={null} />)

    expect(screen.getByText('Terminal 2')).toBeInTheDocument()
  })

  it('expõe abrir-no-editor, capturar, maximizar, minimizar, clonar, reiniciar e fechar como botões rotulados, nessa ordem', () => {
    const { container } = render(<TerminalHeader index={1} title={null} />)

    // Escopado à barra de ações — o título não é botão (AD-020).
    const labels = [...container.querySelectorAll('.terminal-header__actions button')].map(
      (button) => button.getAttribute('aria-label'),
    )

    expect(labels).toEqual([
      // EDITOR-01: o botão do editor abre a barra de ações.
      'abrir pasta no editor',
      // SHOT-01: a câmera saiu do header do app e passou a ser deste painel.
      'capturar terminal',
      'maximizar terminal',
      'minimizar terminal',
      'clonar terminal',
      'reiniciar terminal',
      'fechar terminal',
    ])
  })

  // SPEC: terminal-chrome (CHROME-04) — maximizado, o botão vira "restaurar".
  it('troca maximizar por restaurar enquanto o terminal está maximizado', () => {
    const onMaximize = vi.fn()
    const { container, rerender } = render(
      <TerminalHeader index={1} title={null} onMaximize={onMaximize} />,
    )

    expect(screen.getByLabelText('maximizar terminal')).toBeInTheDocument()
    expect(container.querySelector('.lucide-maximize-2')).toBeInTheDocument()

    rerender(<TerminalHeader index={1} title={null} isMaximized onMaximize={onMaximize} />)

    expect(screen.queryByLabelText('maximizar terminal')).not.toBeInTheDocument()
    const restore = screen.getByLabelText('restaurar terminal')
    expect(container.querySelector('.lucide-minimize-2')).toBeInTheDocument()

    fireEvent.click(restore)
    expect(onMaximize).toHaveBeenCalledTimes(1)
  })

  // SPEC: minimized-tray (MIN-13) — esconder o terminal é uma lua, não um traço.
  it('usa a lua no botão de minimizar', () => {
    const { container } = render(<TerminalHeader index={1} title={null} />)

    expect(screen.getByLabelText('minimizar terminal')).toContainElement(
      container.querySelector('.lucide-moon'),
    )
  })

  // SPEC: terminal-screenshot (SHOT-01, SHOT-23) — captura direta, e o
  // próprio botão vai junto para que o modal saiba a quem devolver o foco.
  it('capturar dispara onScreenshot com o próprio botão', () => {
    const onScreenshot = vi.fn()
    render(<TerminalHeader index={1} title={null} onScreenshot={onScreenshot} />)

    const button = screen.getByLabelText('capturar terminal')
    fireEvent.click(button)

    expect(onScreenshot).toHaveBeenCalledWith(button)
  })

  it('clonar dispara onClone e fica desabilitado quando canClone é false', () => {
    const onClone = vi.fn()
    const { rerender } = render(<TerminalHeader index={1} title={null} onClone={onClone} />)

    fireEvent.click(screen.getByLabelText('clonar terminal'))
    expect(onClone).toHaveBeenCalledTimes(1)

    rerender(<TerminalHeader index={1} title={null} onClone={onClone} canClone={false} />)
    const button = screen.getByLabelText('clonar terminal')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClone).toHaveBeenCalledTimes(1)
  })

  it('reiniciar pede confirmação quando há processo ativo e respeita a recusa', () => {
    const onReset = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TerminalHeader index={1} title={null} hasActiveProcess onReset={onReset} />)

    fireEvent.click(screen.getByLabelText('reiniciar terminal'))
    expect(confirmSpy).toHaveBeenCalled()
    expect(onReset).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByLabelText('reiniciar terminal'))
    expect(onReset).toHaveBeenCalledTimes(1)

    confirmSpy.mockRestore()
  })

  it('sem processo ativo, reiniciar não pede confirmação', () => {
    const onReset = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<TerminalHeader index={1} title={null} hasActiveProcess={false} onReset={onReset} />)

    fireEvent.click(screen.getByLabelText('reiniciar terminal'))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onReset).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })

  it('os três controles disparam os callbacks correspondentes', () => {
    const onMaximize = vi.fn()
    const onMinimize = vi.fn()
    const onClose = vi.fn()
    render(
      <TerminalHeader
        index={1}
        title="build"
        onMaximize={onMaximize}
        onMinimize={onMinimize}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByLabelText('maximizar terminal'))
    fireEvent.click(screen.getByLabelText('minimizar terminal'))
    fireEvent.click(screen.getByLabelText('fechar terminal'))

    expect(onMaximize).toHaveBeenCalledTimes(1)
    expect(onMinimize).toHaveBeenCalledTimes(1)
    // Sem `hasActiveProcess` não há confirmação no caminho.
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // AD-020: o título é o nome do projeto e não é mais editável — clicar nele
  // não abre campo nenhum.
  it('mostra o nome do projeto e não abre campo de edição ao clicar', () => {
    render(<TerminalHeader index={1} title="swarmdeck" />)

    const titulo = screen.getByText('swarmdeck')
    fireEvent.click(titulo)

    expect(screen.queryByLabelText('renomear terminal')).not.toBeInTheDocument()
    expect(titulo).not.toHaveAttribute('role', 'button')
  })
})

describe('TerminalHeader — alça como origem do arrasto (LAYOUT-17)', () => {
  const grip = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.terminal-header__grip-handle')!

  it('sem onDragStartReorder a alça segue decorativa: aria-hidden e não arrastável', () => {
    const { container } = render(<TerminalHeader index={1} title="build" />)

    expect(grip(container)).toHaveAttribute('aria-hidden', 'true')
    expect(grip(container)).toHaveAttribute('draggable', 'false')
    expect(screen.queryByLabelText('reordenar terminal')).not.toBeInTheDocument()
  })

  it('com a prop a alça fica arrastável e o dragstart dispara o callback', () => {
    const onDragStartReorder = vi.fn()
    const { container } = render(
      <TerminalHeader index={1} title="build" onDragStartReorder={onDragStartReorder} />,
    )

    expect(grip(container)).toHaveAttribute('draggable', 'true')
    expect(grip(container)).not.toHaveAttribute('aria-hidden')

    fireEvent.dragStart(grip(container))

    expect(onDragStartReorder).toHaveBeenCalledTimes(1)
  })
})

// SPEC: projects (PROJ-11, PROJ-12) — painel de rascunho não tem PTY atrás:
// capturar, minimizar (AD-016), clonar e reiniciar não têm o que operar.
describe('TerminalHeader — modo rascunho (PROJ-11, PROJ-12)', () => {
  const actionLabels = (container: HTMLElement) =>
    [...container.querySelectorAll('.terminal-header__actions button')].map((button) =>
      button.getAttribute('aria-label'),
    )

  it('em rascunho não renderiza capturar, minimizar, clonar nem reiniciar', () => {
    const { container } = render(<TerminalHeader index={1} title={null} draft />)

    const labels = actionLabels(container)
    expect(labels).not.toContain('capturar terminal')
    expect(labels).not.toContain('minimizar terminal')
    expect(labels).not.toContain('clonar terminal')
    expect(labels).not.toContain('reiniciar terminal')
  })

  it('em rascunho o botão de fechar continua e chama onClose', () => {
    const onClose = vi.fn()
    render(<TerminalHeader index={1} title={null} draft onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('fechar terminal'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fora do rascunho a barra de ações fica idêntica à de hoje', () => {
    const { container: withoutProp } = render(<TerminalHeader index={1} title={null} />)
    const { container: explicitFalse } = render(
      <TerminalHeader index={1} title={null} draft={false} />,
    )

    expect(actionLabels(explicitFalse)).toEqual(actionLabels(withoutProp))
    expect(actionLabels(withoutProp)).toContain('capturar terminal')
  })
})

// SPEC: agent-permission-mode (PERM-07) — o cabeçalho diz sob qual regime de
// permissão o agente daquele terminal está rodando.
describe('TerminalHeader — modo de permissão (PERM-07)', () => {
  it('mostra o rótulo do modo ativo, com a descrição no hover', () => {
    const { container } = render(
      <TerminalHeader index={1} title={null} permissionMode="bypassPermissions" />,
    )

    const badge = container.querySelector('.terminal-header__permission-mode')
    expect(badge).toHaveTextContent('Sem verificação')
    expect(badge?.getAttribute('title')).toContain('contêineres e VMs isolados')
    expect(badge?.getAttribute('data-mode')).toBe('bypassPermissions')
  })

  it('sem modo (shell puro ou agente sem a flag) não renderiza selo', () => {
    const { container } = render(<TerminalHeader index={1} title={null} />)

    expect(container.querySelector('.terminal-header__permission-mode')).toBeNull()
  })

  it('modo desconhecido cai no próprio id em vez de sumir', () => {
    const { container } = render(
      <TerminalHeader index={1} title={null} permissionMode="modoNovoDoCli" />,
    )

    expect(container.querySelector('.terminal-header__permission-mode')).toHaveTextContent(
      'modoNovoDoCli',
    )
  })
})
