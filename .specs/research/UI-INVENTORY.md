# Inventário de UI — produto de referência

**Data da varredura:** 28/07/2026
**Versão observada:** instalação local em Windows 11, conta no plano **FREE**
**Método:** captura de tela da janela + navegação por clique automatizado. Nenhum código-fonte do original foi lido.
**Evidências:** `screenshots/` — cada seção abaixo referencia o arquivo correspondente.

> **Limitação importante:** a conta de referência está no plano FREE. Todas as features PRO batem em paywall e sua UI real **não foi observada**. Elas estão listadas no fim como "não observáveis" e ficam fora do v1.

---

## 1. Janela principal — grid de terminais
`screenshots/01-main-grid.png`

Janela única, tema escuro, acento amarelo/âmbar.

**Toolbar esquerda** (`13-toolbar-left.png`): logo com badge de notificação · alternar layout · novo terminal · histórico de conversas · busca · git · captura.

**Toolbar direita** (`14-toolbar-right.png`): campo de busca · duplicar/organizar terminais · botão **RUN** · avatar do agente ativo · conta · configurações.

**Área de terminais:** grid de 2 colunas. Cada terminal tem um header próprio com:
- Indicador de cor / ícone do agente / inicial
- Título geral (ex.: `SPECS LOCALMIND`, `APPIMAGE LINUX`) — rótulo estável da aba
- Número do terminal (`#2`)
- Ícones de ação: branch git, relógio (log de atividade), bookmark, worktree, badge de contagem de mudanças (`41`)
- Ações à direita: menu `···`, maximizar, minimizar, fechar

O conteúdo do terminal é um emulador real (diff colorido, prompts interativos do agente renderizados corretamente).

---

## 2. Configurações
Modal com rail lateral de 12 seções. O rail começa colapsado (só ícones) e expande no hover.

| Seção | Estado | Evidência |
|---|---|---|
| General | livre | `02-settings-general.png` |
| Shortcuts | **PRO** | badge UPGRADE no rail |
| Skills | livre | `03-settings-skills.png` |
| MCP | livre | `06-settings-mcp.png` |
| Terminal Statuses | livre | `04-settings-terminal-statuses.png` |
| Permissions | **PRO** | `05-paywall-feature-matrix.png` |
| Privacy | não capturado | — |
| Projects | livre | `07-settings-projects.png` |
| Worktrees | livre | `08-settings-worktrees.png` |
| Performance | livre | `09-settings-performance.png` |
| Updates | não capturado | — |
| Feedback | não capturado | — |

### 2.1 General
- **Notifications**: explica os 3 gatilhos — agente pede confirmação, agente termina tarefa, eventos específicos do terminal. Botão abre as configurações de notificação do SO.
- **Default AI Agent**: 5 cards selecionáveis — Claude Code (Anthropic), Codex CLI (OpenAI), Antigravity CLI (Google), opencode (SST), Kimi Code (Moonshot AI, badge BETA). O padrão é pré-selecionado ao abrir sessão nova e pode ser sobrescrito.

### 2.2 Skills
- Instala pastas `SKILL.md` em `~/.claude/skills/`
- Abas **Installed** (com contador) e **Browse Marketplace**
- Busca + filtro por agente com contadores (All 5, Claude 5, Codex 0, Antigravity 0, opencode 0, Kimi 0)
- Card de skill: nome, badge de trigger (`MANUAL`), descrição, ícones dos agentes compatíveis, botões abrir-pasta e excluir
- Ações no topo: **Export to agent…**, **Refresh**, **Open Folder**

### 2.3 MCP
- Lista de servidores MCP com indicador de estado (bolinha), nome e linha de comando completa
- Por servidor: visualizar (olho), editar, excluir
- Ações no topo: **Tips & Help**, **Edit Permissions** (PRO), **Marketplace**, **+ Add MCP Server**

### 2.4 Terminal Statuses
Núcleo do laço agente↔app. Texto da própria UI:
> "The work-phase badges agents set on each terminal. Edit the label, color and the instruction that tells agents WHEN to use each status, or create your own. Drag the rows to set their order — that order is the priority used when you sort terminal tabs by status. Changes reach agents on their next session."

4 status padrão, cada um com label, badge `DEFAULT`, cor, instrução em texto livre, toggle de ativação, editar e excluir:
1. **Needs input** — parar porque precisa de resposta/decisão do usuário
2. **Needs testing** — implementação pronta, pendente teste manual do usuário
3. **Working** — começou a trabalhar / está implementando, investigando ou corrigindo
4. **Done** — trabalho completamente terminado, validado e commitado

Ações: **+ Add status**, **Restore defaults**. Linhas reordenáveis por arrastar.

### 2.5 Projects
- Lista com bolinha de cor, nome, caminho absoluto, contagem de tarefas, botão editar
- Ordenação (**Sort by: Last Used**), busca, **+ Create Project**

### 2.6 Worktrees
- Toggle **"Always use a worktree for conversations"** (padrão desligado)
- Aviso: worktree é checkout limpo, então arquivos git-ignored como `.env` não vêm junto — use `.worktreeinclude` na raiz do repo para copiá-los automaticamente
- Métricas: total de worktrees, espaço reclamável, botão **Measure sizes** (estado inicial "never measured")
- Filtros por estado: All / **Safe** / **Review** / **Kept**, seletor de projeto, filtro textual
- Tabela: WORKTREE · STATE · LAST USED · SIZE

### 2.7 Performance — Conversation Cleanup
- Libera disco e acelera `--resume` limpando histórico antigo
- Garantias declaradas: nada é excluído sem preview; conversas abertas, marcadas ou com atalho são sempre protegidas
- **Storage by agent**: card por agente com tamanho, nº de conversas, nº de projetos (observado: Claude 108 MB / 186 conversas / 27 projetos; opencode 328 KB / 1 / 1; demais zerados)
- **Cleanup rules**: checkboxes APPLY TO por agente + toggle "Never auto-delete conversations"

---

## 3. Kanban — janela separada
`screenshots/12-kanban-board.png`

Abre em uma **janela própria**, não como painel dentro da principal.

**Header:** logo KANBAN · busca de tarefas · seletor **Project: All Projects** · **Create Project** · botão de ícone · **+ Add Task** · **Refresh** · **← Back to Terminals**

**4 colunas**, cada uma com ícone, nome, badge de contagem e botão de ordenação:
1. **Pending** — estado vazio "No tasks pending"
2. **In Progress** — badge roxo com contagem + um botão verde adicional
3. **In Testing** — "No tasks in testing"
4. **Completed** — "No tasks completed"

**Card de tarefa:** chip colorido do projeto (ex.: `localmind`, `chat-ia-local`), número da tarefa (`#2`), título em negrito, descrição truncada em ~3 linhas, rodapé com data e dois ícones (excluir, enviar-ao-terminal). Alguns cards têm um ícone extra de fixar/prioridade.

---

## 4. Onboarding Agent
`screenshots/11-onboarding-agent.png`

Aberto pelo logo do app. Painel flutuante no canto inferior direito:
- Cabeçalho "Onboarding Agent / Your AI Assistant" com botões: **Inspect** (destacado), expandir, minimizar, fechar
- Mensagem de boas-vindas + dica: "Use the Inspect button above to click on any element in the app and ask me about it!"
- Chips de perguntas sugeridas
- Campo de input ("Pregúntame algo…") e botão enviar

---

## 5. Git
`screenshots/10-git-projects-picker.png`

O ícone de git abre **Git Projects**: lista os projetos dos terminais ativos com nome, branch atual, contagem de mudanças e botão **Open**; rodapé com **Use Current Directory** e **Refresh**.
Clicar em **Open** dispara o paywall — a UI de git real não foi observada.

---

## 6. Features não observáveis (paywall)
`screenshots/05-paywall-feature-matrix.png`

O paywall expõe a matriz completa de planos, que serve como inventário oficial de features do original:

| Feature | Starter (€2,99/mês) | Pro (€6,99/mês) |
|---|---|---|
| Terminais | 4 | 25 |
| Projetos | 4 | ilimitados |
| Live Notifications | ✓ | ✓ |
| Real-time Terminal Changes | ✓ | ✓ |
| Modos de layout | Grid | Grid + Tabs |
| Project Shortcuts | 1 | 6 |
| Terminal Shortcuts | 1 | ilimitados |
| Resizable Terminals | ✓ | ✓ |
| MCP Configuration | ✓ | ✓ |
| MCP Marketplace | ✓ | ✓ |
| Git Integration & AI Commits | ✗ | ✓ |
| Task Labels | ✗ | ✓ |
| Keyboard Shortcuts | ✗ | ✓ |
| Manage MCP Permissions | ✗ | ✓ |
| Manage Claude Code Permissions | ✗ | ✓ |
| Turbo Mode | ✗ | ✓ |
| Conversation History | ✗ | ✓ |

Descrições coletadas dos próprios modais de paywall:
- **Tool Permissions** — "Manage tool permissions and access controls for Claude"
- **Conversation History** — "Search and restore previous conversations"
- **Git Integration** — "Full git management with AI-powered commits, push, pull, and history"

---

## Pendências de observação

- [ ] Settings → Privacy
- [ ] Settings → Updates
- [ ] Settings → Feedback
- [ ] Fluxo de criação de terminal (botão `+`)
- [ ] Menu `···` do header do terminal
- [ ] Log de atividade (botão relógio no header do terminal)
- [ ] Botão **RUN** da toolbar
- [ ] Botão de captura/câmera da toolbar
- [ ] Modal de conta (ícone de pessoa)
- [ ] Modal **+ Add Task** do Kanban
- [ ] Marketplace de MCP e de Skills
