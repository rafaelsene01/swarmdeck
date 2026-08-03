// SPEC: terminal-statuses (STAT-01)

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('exibe o rótulo e aplica a cor do status quando um status está definido', () => {
    render(<StatusBadge label="Needs input" color="#ff6600" />)

    const badge = screen.getByText('Needs input')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveStyle({ backgroundColor: '#ff6600' })
  })

  it('sem status definido, não renderiza nenhum badge', () => {
    const { container } = render(<StatusBadge label={null} color={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('trunca rótulo longo mantendo o texto completo disponível no hover via title', () => {
    const longLabel = 'Aguardando revisão manual do usuário antes de continuar'
    render(<StatusBadge label={longLabel} color="#00aa00" />)

    const badge = screen.getByTitle(longLabel)
    expect(badge.textContent).not.toBe(longLabel)
    expect(badge.textContent!.length).toBeLessThan(longLabel.length)
    expect(badge.getAttribute('title')).toBe(longLabel)
  })

  it('permanece visível montado na barra compacta de um terminal minimizado, sem depender de contexto externo', () => {
    // Simula o contêiner minimizado sem nenhuma classe/estilo que o badge
    // precise para funcionar — prova que o componente é presentacional puro
    // (não lê contexto, não depende de estar dentro do header expandido).
    render(
      <div className="terminal-pane terminal-pane--minimized">
        <StatusBadge label="Working" color="#3366ff" />
      </div>,
    )

    expect(screen.getByText('Working')).toBeVisible()
  })
})
