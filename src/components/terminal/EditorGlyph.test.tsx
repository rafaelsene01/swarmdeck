// SPEC: editor-launch (EDITOR-02)

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import EditorGlyph from './EditorGlyph'

/** Ids de `editors::CATALOG` (`src-tauri/src/editors.rs`) — se um editor
 * entrar lá sem marca aqui, este teste é quem avisa. */
const CATALOG_IDS = [
  'vscode',
  'vscode-insiders',
  'cursor',
  'windsurf',
  'trae',
  'vscodium',
  'zed',
  'sublime',
  'intellij',
  'webstorm',
  'pycharm',
]

describe('EditorGlyph — marca oficial de cada editor (EDITOR-02)', () => {
  it('todo id do catálogo tem marca própria, nenhum cai no glifo genérico', () => {
    for (const id of CATALOG_IDS) {
      const { container } = render(<EditorGlyph id={id} />)
      const path = container.querySelector('path')
      expect(path?.getAttribute('fill'), id).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('id fora do catálogo cai no glifo genérico em vez de sumir', () => {
    const { container } = render(<EditorGlyph id="editor-que-nao-existe" />)

    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelector('path')?.getAttribute('fill')).toBeNull()
  })
})
