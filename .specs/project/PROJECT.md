# SwarmDeck

> Nome provisório. Clone funcional do CodeAgentSwarm, especificado por engenharia reversa da UI.

**Visão:** Um orquestrador desktop de múltiplos agentes de IA de linha de comando, onde cada agente roda no seu próprio terminal, dentro do seu próprio projeto, e reporta o que está fazendo através de um quadro Kanban compartilhado.

**Para:** Desenvolvedores que rodam vários agentes de codificação (Claude Code, Codex CLI, etc.) em paralelo e perdem o controle de qual agente está fazendo o quê.

**Resolve:** Rodar N agentes em N janelas de terminal soltas é cego — você não sabe qual terminou, qual travou esperando resposta, e qual está trabalhando em qual tarefa. O SwarmDeck dá um painel único com estado visível por terminal e um backlog compartilhado que os próprios agentes atualizam via MCP.

## Objetivos

- Rodar **≥4 agentes simultâneos** em grid, cada um com projeto e diretório próprios, sem interferência entre eles
- Reduzir a **checagem manual de status para zero**: o estado de cada terminal (trabalhando / precisa de input / pronto) é visível sem clicar
- Fazer o agente ser **fonte de verdade do backlog**: 100% das tarefas criadas/atualizadas pelo próprio agente via MCP, sem digitação manual
- Startup do app **< 2s** e binário **< 20MB** (vantagem direta sobre o original em Electron)

## Stack

**Core:**
- Shell desktop: **Tauri 2** (Rust)
- Frontend: **React 19 + TypeScript + Vite**
- Backend/IPC: **Rust** (comandos Tauri + eventos)
- Banco: **SQLite via rusqlite** (tarefas, projetos, terminais, configurações)

**Dependências-chave:**
- `portable-pty` — spawn e I/O dos processos de terminal (equivalente Rust do node-pty)
- `xterm.js` + `@xterm/addon-fit` — renderização do terminal no front
- `rmcp` (Rust MCP SDK) ou servidor MCP stdio próprio — expõe as ferramentas de tarefa aos agentes
- `tauri-plugin-notification` — notificações nativas de desktop
- `notify` — watcher de arquivos para detectar mudanças de repo/worktree

## Escopo

**v1 inclui** (o núcleo gratuito observado na instalação de referência):
- Multi-terminal em grid, redimensionável, com PTY real
- Seleção de agente por sessão (Claude Code, Codex CLI, Antigravity, opencode, Kimi)
- Kanban de tarefas em janela própria (Pending / In Progress / In Testing / Completed)
- Projetos com diretório, cor e contagem de tarefas
- Servidor MCP de tarefas — a interface que os agentes usam para criar/atualizar tarefas e reportar estado
- Status de terminal customizáveis (badge de fase de trabalho)
- Título geral + log de atividade por terminal
- Configuração de servidores MCP (adicionar / editar / remover / marketplace)
- Gerenciador de Skills (listar, instalar, abrir pasta, remover)
- Git Worktrees — isolamento de conversas em checkouts separados
- Limpeza de histórico de conversas com uso de disco por agente
- Notificações de desktop por terminal
- Onboarding Agent (assistente in-app com modo Inspect)

**Explicitamente fora de escopo no v1:**
- **Camada de monetização** (planos Starter/Pro, paywall, billing) — o clone não tem tiers; tudo que for construído é liberado
- **Git Integration & AI Commits** — feature PRO do original, não observável na instalação de referência
- **Conversation History** (busca/restauração de conversas) — feature PRO, não observável
- **Tool Permissions / MCP Permissions** — features PRO, não observáveis
- **Keyboard Shortcuts configuráveis, Task Labels, Turbo Mode** — features PRO, não observáveis
- Sincronização em nuvem, contas, colaboração multi-usuário
- Suporte mobile

## Restrições

- **Técnica:** as features PRO do original estão atrás de paywall na instalação de referência. Não há como observar sua UI real — ficam fora do v1 em vez de serem especuladas.
- **Técnica:** o protocolo MCP é o contrato com agentes de terceiros. As ferramentas expostas precisam bater com o que os agentes já esperam, senão os prompts existentes quebram.
- **Legal:** especificação derivada de comportamento observável da UI. Nenhum código, asset gráfico, nome ou marca do original é copiado.
- **Plataforma:** desenvolvimento em Windows 11. macOS e Linux são alvo, mas não validados no v1.
