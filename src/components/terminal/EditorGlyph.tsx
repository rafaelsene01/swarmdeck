// SPEC: editor-launch (EDITOR-02)

/**
 * Marcas dos editores de código, desenhadas inline — mesma decisão de
 * `shell/ProviderIcon.tsx`: são aproximações de traço, não os logos
 * oficiais, porque o app não embarca arquivo de marca de terceiros.
 *
 * Chaveado pelo `id` de `editors::CATALOG` (Rust). Um id sem desenho
 * próprio cai no glifo genérico de código — acrescentar um editor ao
 * catálogo nunca quebra o popover.
 */

interface GlyphMeta {
  /** Cor da marca, legível sobre `#17171a` (fundo do popover). */
  color: string
  /** Qual desenho usar — vários ids compartilham o mesmo (as três variantes
   * de VS Code, os três IDEs JetBrains). */
  shape: 'vscode' | 'cursor' | 'windsurf' | 'trae' | 'zed' | 'sublime' | 'jetbrains' | 'generic'
}

const GLYPHS: Record<string, GlyphMeta> = {
  vscode: { color: '#3ea6f0', shape: 'vscode' },
  'vscode-insiders': { color: '#24bfa5', shape: 'vscode' },
  vscodium: { color: '#4f9e6a', shape: 'vscode' },
  cursor: { color: '#d8d8de', shape: 'cursor' },
  windsurf: { color: '#58c4a1', shape: 'windsurf' },
  trae: { color: '#ff6a3d', shape: 'trae' },
  zed: { color: '#7fa4f5', shape: 'zed' },
  sublime: { color: '#ff9800', shape: 'sublime' },
  intellij: { color: '#fe4a7d', shape: 'jetbrains' },
  webstorm: { color: '#25c8d6', shape: 'jetbrains' },
  pycharm: { color: '#39d47e', shape: 'jetbrains' },
}

export interface EditorGlyphProps {
  id: string
  size?: number
}

export default function EditorGlyph({ id, size = 16 }: EditorGlyphProps) {
  const meta = GLYPHS[id] ?? { color: 'currentColor', shape: 'generic' as const }
  const color = meta.color
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    focusable: false as const,
    'data-editor-glyph': id,
  }

  switch (meta.shape) {
    // Fita do VS Code: a barra vertical à direita e a dobra em "<".
    case 'vscode':
      return (
        <svg {...common}>
          <path
            fill={color}
            fillRule="evenodd"
            d="M17.4 1.9 21.5 3.8c.3.2.5.5.5.8v14.8c0 .3-.2.6-.5.8l-4.1 1.9c-.4.2-.8.1-1.1-.2l-6.4-5.9-4 3-3-2.2c-.3-.3-.3-.7 0-.9L6.1 12 2.9 9.9c-.3-.2-.3-.6 0-.9l3-2.2 4 3 6.4-5.9c.3-.3.7-.4 1.1-.2Zm.2 4.6L12.3 12l5.3 5.5V6.5Z"
          />
        </svg>
      )
    // Cubo isométrico do Cursor.
    case 'cursor':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 2.6 20.6 7.3v9.4L12 21.4 3.4 16.7V7.3Z" />
          <path d="M12 12 20.6 7.3M12 12 3.4 7.3M12 12v9.4" />
        </svg>
      )
    // Rajadas de vento do Windsurf.
    case 'windsurf':
      return (
        <svg
          {...common}
          fill="none"
          stroke={color}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8h10.5a2.8 2.8 0 1 0-2.8-2.8" />
          <path d="M3 12h13.5a2.8 2.8 0 1 1-2.8 2.8" />
          <path d="M3 16h7" />
        </svg>
      )
    // Vela triangular do Trae.
    case 'trae':
      return (
        <svg {...common}>
          <path fill={color} d="M12.9 2.6a1 1 0 0 1 1.8.5v16.6a1 1 0 0 1-1.5.9L4 16.2a1 1 0 0 1-.2-1.6Z" />
          <path fill={color} opacity="0.45" d="M16.6 6.6 21 14.7a1 1 0 0 1-.9 1.5h-3.5Z" />
        </svg>
      )
    // "Z" angular do Zed.
    case 'zed':
      return (
        <svg {...common}>
          <path fill={color} d="M5.6 3.5h12.8v3.4L10.2 17.1h8.2v3.4H5.6v-3.4l8.2-10.2H5.6Z" />
        </svg>
      )
    // Placas inclinadas do Sublime Text.
    case 'sublime':
      return (
        <svg {...common}>
          <path fill={color} d="M5.8 5.6 18.2 2.3v4.6L5.8 10.2Z" />
          <path fill={color} opacity="0.55" d="M18.2 21.7 5.8 18.4v-4.6l12.4 3.3Z" />
        </svg>
      )
    // Moldura quadrada com a barra inferior das marcas JetBrains.
    case 'jetbrains':
      return (
        <svg {...common} fill="none" stroke={color} strokeWidth="1.6">
          <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3" />
          <path d="M6.9 17.3h6.4" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    // Genérico: chaves de código, para qualquer id novo do catálogo.
    default:
      return (
        <svg
          {...common}
          fill="none"
          stroke={color}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 7 4.5 12 9 17M15 7l4.5 5-4.5 5" />
        </svg>
      )
  }
}
