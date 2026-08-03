// SPEC: task-kanban (KAN-08), settings-shell (SET-02)

/**
 * Ponto de entrada do bundle único do front — as três janelas fixas do app
 * (`main`, `kanban` em `src-tauri/src/windows/kanban.rs`, e `settings` em
 * `src-tauri/src/windows/settings.rs`) carregam o mesmo `index.html`, então a
 * escolha de qual árvore React montar é feita aqui, pelo label da janela
 * atual (`getCurrentWebviewWindow().label`), em vez de um roteador: só
 * existem janelas fixas e conhecidas, nunca rotas arbitrárias, então
 * `react-router` (ou equivalente) seria uma dependência sem uso real
 * (`design.md` → Decisões técnicas, `tasks.md` T7 de `task-kanban`; mesma
 * decisão estendida para `settings` por `settings-shell/spec.md` →
 * "Decisão de arquitetura").
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import App from './App'
import KanbanBoard from './routes/kanban/KanbanBoard'
import SettingsShell from './routes/settings/SettingsShell'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('elemento #root não encontrado')

const windowLabel = getCurrentWebviewWindow().label

function renderForLabel(label: string) {
  if (label === 'kanban') return <KanbanBoard />
  if (label === 'settings') return <SettingsShell />
  return <App />
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>{renderForLabel(windowLabel)}</React.StrictMode>,
)
