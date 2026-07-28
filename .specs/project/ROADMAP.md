# Roadmap — SwarmDeck

**Milestone atual:** M1 — Núcleo do terminal
**Status:** Planning

Inventário derivado da varredura de UI de 28/07/2026. Ver `.specs/research/UI-INVENTORY.md` para as evidências (screenshots) de cada item.

---

## Transversal — Entrega e distribuição

**Não é um milestone**: é a faixa que atravessa todos eles. Está aqui porque uma parte entra **agora**, antes do M1 fechar, e o resto depende de existir um app que valha a pena instalar.

**Release e distribuição** — PLANNED → `.specs/features/release-distribution/`

| Bloco | O que entrega | Entra quando |
|---|---|---|
| **A — Validação** | `ci.yml`: build, testes, `fmt --check` e Conventional Commits em todo push e PR | **Agora.** Não depende de nenhuma feature |
| **B — Empacotamento** | Versão derivada, alvos de bundle, NSIS `currentUser`, chave de assinatura | Agora (a chave é passo humano) |
| **C — Release** | `release.yml` com disparo manual `major/minor/patch`: versão, CHANGELOG, tag, `.msi`/`-setup.exe`/`.deb`/`.AppImage`/zip portátil, e reversão automática de run interrompido | Depois de A e B |
| **D — Update no app** | Aviso de versão nova, download com progresso, atualização nos modos instalado e portátil | Depende do M1 estar utilizável |

---

## M1 — Núcleo do terminal

**Meta:** Abrir o app e ter dois agentes reais rodando lado a lado, cada um no seu diretório. Sem isso, nada mais do produto faz sentido.
**Pronto quando:** dois PTYs simultâneos sobrevivem a 30min de uso, redimensionamento e reinício do app.

### Features

**Multi-terminal em grid** — PLANNED → `.specs/features/multi-terminal/`
- Grid de até 4 terminais com divisórias arrastáveis
- PTY real por terminal (shell nativo do SO)
- Header por terminal: título, número, badge de status, ações
- Fechar / maximizar / minimizar terminal
- Persistência de layout entre reinícios

**Seleção de agente** — PLANNED → `.specs/features/agent-selection/`
- Catálogo de agentes: Claude Code, Codex CLI, Antigravity CLI, opencode, Kimi Code
- Agente padrão configurável, sobrescrevível por sessão
- Indicador do agente ativo no header do terminal

**Projetos** — PLANNED → `.specs/features/projects/`
- CRUD de projeto: nome, diretório, cor
- Detecção automática do projeto pelo diretório do terminal
- Contagem de tarefas por projeto, ordenação por último uso

---

## M2 — O laço agente↔app

**Meta:** O agente para de ser uma caixa-preta. Ele declara o que está fazendo e o app mostra.
**Pronto quando:** um agente rodando cria uma tarefa, muda o status do terminal e aparece no Kanban sem intervenção humana.

### Features

**Servidor MCP de tarefas** — PLANNED → `.specs/features/mcp-task-server/`
- Ferramentas de tarefa (criar, iniciar, planejar, implementar, concluir, buscar)
- Ferramentas de terminal (título geral, atividade, status)
- Auto-detecção de terminal e projeto a partir do ambiente da sessão
- Handshake `check_active` — agentes fora do app ignoram o protocolo

**Kanban de tarefas** — PLANNED → `.specs/features/task-kanban/`
- Janela dedicada, 4 colunas: Pending / In Progress / In Testing / Completed
- Card: chip de projeto, número, título, descrição, data, excluir, enviar-ao-terminal
- Filtro por projeto, busca textual, ordenação por coluna
- Fluxo obrigatório de teste: In Progress → In Testing → Completed

**Status e atividade de terminal** — PLANNED → `.specs/features/terminal-statuses/`
- Catálogo editável de status (label, cor, instrução para o agente, ordem)
- Badge colorido no terminal
- Título geral fixo + log de atividade cronológico
- 4 status padrão: Needs input, Needs testing, Working, Done

---

## M3 — Extensibilidade

**Meta:** O usuário conecta suas próprias ferramentas e capacidades aos agentes.

### Features

**Gerenciador de MCP** — PLANNED → `.specs/features/mcp-management/`
- Listar / adicionar / editar / remover servidores MCP
- Ver comando e argumentos de cada servidor
- Marketplace de servidores

**Gerenciador de Skills** — PLANNED → `.specs/features/skills-manager/`
- Listar skills instaladas com descrição e agentes compatíveis
- Filtro por agente, busca
- Abrir pasta, remover, exportar para agente
- Marketplace de skills

---

## M4 — Higiene e ambiente

**Meta:** O app cuida do disco, do isolamento entre agentes e avisa o usuário.

### Features

**Git Worktrees** — PLANNED → `.specs/features/worktrees/`
- Worktree isolado por conversa, opcional ou sempre
- Listagem com estado (Safe / Review / Kept), tamanho, último uso
- Medição de espaço reclamável
- Suporte a `.worktreeinclude` para arquivos git-ignored

**Limpeza de conversas** — PLANNED → `.specs/features/conversation-cleanup/`
- Uso de disco por agente (tamanho, nº de conversas, nº de projetos)
- Regras de limpeza por idade, com preview antes de excluir
- Proteção de conversas abertas / marcadas / com atalho

**Notificações de desktop** — PLANNED → `.specs/features/notifications/`
- Disparo quando o agente pede confirmação, conclui tarefa ou muda de status
- Notificação identifica qual terminal originou
- Atalho para as configurações de notificação do SO

---

## M5 — Acabamento

**Meta:** O app se explica sozinho.

### Features

**Onboarding Agent** — PLANNED → `.specs/features/onboarding-agent/`
- Chat assistente in-app sobre o próprio produto
- Modo Inspect: clicar em qualquer elemento da UI e perguntar sobre ele
- Perguntas sugeridas, janela flutuante minimizável

**Busca global** — PLANNED
- Busca unificada sobre terminais, tarefas e projetos

**Snapshot / captura de tela** — PLANNED
- Botão de captura na toolbar (função exata ainda não confirmada — ver STATE.md)

---

## Considerações futuras

- Modo Tabs além do Grid (o original oferece os dois; v1 entrega só Grid)
- Atalhos de teclado configuráveis por projeto e por terminal
- Labels/etiquetas em tarefas
- Subtarefas e hierarquia pai-filho no Kanban
- Integração Git com commits gerados por IA
- Histórico de conversas com busca e restauração
