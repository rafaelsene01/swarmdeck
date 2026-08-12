# Roadmap — SwarmDeck

**Milestone atual:** M1 — Núcleo do terminal
**Status:** In Progress — corrigido na triagem 001 (28/07/2026). Dizia "Planning" enquanto `multi-terminal/T1–T4` já estavam entregues, com 15 testes passando e código em `src-tauri/src/{db,terminal}/`.

Inventário derivado da varredura de UI de 28/07/2026. Ver `.specs/research/UI-INVENTORY.md` para as evidências (screenshots) de cada item.

---

## Transversal — Entrega e distribuição

**Não é um milestone**: é a faixa que atravessa todos eles. Está aqui porque uma parte entra **agora**, antes do M1 fechar, e o resto depende de existir um app que valha a pena instalar.

**Release e distribuição** — IN PROGRESS. **Corrigido na triagem 008 (11/08/2026): duas releases reais já saíram — `v0.1.1` e `v0.1.2`** (`gh release view v0.1.2 --json assets` confirma os 5 artefatos assinados + `latest.json`). A cadeia `T2, T5, T6, T9, T10, T11, T12, T21` que `tasks.md` descrevia como bloqueada está resolvida — ver `project/STATE.md` (AD 11/08/2026). Restam genuinamente pendentes: `T3` (git-cliff não instalado localmente, prova só indireta via CI), `T8` (cenário de FALHA do `cleanup`, nenhuma release real falhou de propósito para testar), `T19` (aplicação real do update numa máquina, ainda `human-only`), e `REL-34` (toggle de auto-check não persiste — falta comando Tauri). **Corrigido na triagem 006 (02/08/2026): o release realmente saiu.** `origin/master` está em `5c81ed2` (`chore(release): v0.1.1`, tag `v0.1.1`), 1 commit à frente do HEAD auditado nesta triagem (`259b96e`) — publicado fora desta skill entre a triagem 005 e esta. `gh run list` confirma `CI` verde em `259b96e` (`30778057309`) e `Release` verde via `workflow_dispatch` (`30778409874`, 03/08/2026 02:05 UTC). Isso resolve, na prática, o bloqueio que `T2/T21` registravam ("CI real rodou duas vezes, as duas falharam") — **não re-auditado tarefa a tarefa nesta triagem** (`T5`, a cadeia `T6-T12`, `T19` continuam com o texto antigo em `tasks.md`, pendente de uma passada dedicada para reconciliar cada uma contra o release real). 10 de 21 tarefas `✅ Done` no gate antes desta descoberta (`T1, T3, T4, T13-T18, T20`) — **ressalva**: `T3` (`git-cliff`) segue com 2 de 4 itens `[ ]` e nota "git-cliff não instalado" ainda válida (`git cliff --version` falha), então "Done" ali é otimista; `UpdateSettings.tsx` (T17) segue sem janela real até `settings-shell` entregar o container. Ver `project/STATE.md`. → `.specs/features/release-distribution/`

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

**Multi-terminal em grid** — 12 de 15 tarefas `✅ Done no gate`; `T12` (montagem real de `App.tsx`) **já executada e confirmada** (`multi-terminal/tasks.md` tem a seção "Verify (executado)" da run 005, 02/08/2026, com achados reais registrados: divisória não redimensiona visualmente, scrollback perdido ao minimizar/restaurar, persistência de layout não integrada) — **corrigido na triagem 006 (02/08/2026)**: esta linha ainda dizia `App.tsx` "hoje ainda o placeholder do scaffolding", o que já era falso desde a run 005; `App.tsx` monta a árvore real (`GridLayout`/`TerminalPane`/`TerminalHeader`/`NewTerminalDialog`) → `.specs/features/multi-terminal/`. **T13, T14, T15 implementadas — corrigido na triagem 008 (11/08/2026)**, `TERM-10`/`TERM-11` (seletor nativo de pasta) fechadas. `T16` (rename manual) codada mas com `⛔ NEEDS-DECISION` (não persiste — `App.tsx` não passa `id`).
- Grid de até 4 terminais com divisórias arrastáveis
- PTY real por terminal (shell nativo do SO)
- Header por terminal: título, número, badge de status, ações
- Fechar / maximizar / minimizar terminal
- Persistência de layout entre reinícios

**Seleção de agente** — 4 de 4 tarefas `✅ Done no gate` (run `spec-loop` 004, 01/08/2026), **+1 tarefa nova (T5)** para usar de verdade o agente escolhido no `pty_spawn` (achado: `App.tsx::handleCreate` descartava `agentId`). O card de padrão global (`AgentPanel.tsx`) segue sem janela até `settings-shell` (nova feature, ver abaixo) entregar o container — **achado na triagem 006 (02/08/2026)**, ver `project/STATE.md` → `.specs/features/agent-selection/`
- Catálogo de agentes: Claude Code, Codex CLI, Antigravity CLI, opencode, Kimi Code
- Agente padrão configurável, sobrescrevível por sessão
- Indicador do agente ativo no header do terminal

**Projetos** — 4 de 4 tarefas `✅ Done no gate` (run `spec-loop` 004, 01/08/2026), mas o CRUD de projeto por UI (`ProjectsPanel.tsx`) tem o mesmo gap de `agent-selection`: nunca é importado fora do próprio teste. A resolução automática por diretório (`PROJ-03/04`) roda no backend e não depende dessa UI. **Achado na triagem 006 (02/08/2026), desbloqueado por `settings-shell` (nova feature, ver abaixo)** → `.specs/features/projects/`
- CRUD de projeto: nome, diretório, cor
- Detecção automática do projeto pelo diretório do terminal
- Contagem de tarefas por projeto, ordenação por último uso

**Janela de Configurações (settings-shell)** — NOVA (triagem 006, 03/08/2026, decisão do usuário). Container que faltava para `AgentPanel`, `ProjectsPanel`, `StatusesPanel` e `UpdateSettings` — todos já existiam prontos e testados, nenhum alcançável. **Não redesenha nenhum dos 4 painéis** (ver `settings-shell/spec.md` → "Fora de escopo") — só entrega a janela, a navegação entre eles, e monta os componentes que já existem. 0 de 2 tarefas → `.specs/features/settings-shell/`

---

## M2 — O laço agente↔app

**Meta:** O agente para de ser uma caixa-preta. Ele declara o que está fazendo e o app mostra.
**Pronto quando:** um agente rodando cria uma tarefa, muda o status do terminal e aparece no Kanban sem intervenção humana.

### Features

**Servidor MCP de tarefas** — 9 de 10 tarefas `✅ Done` no gate (T0–T8, run `spec-loop` 004, 01/08/2026); ⚠️ **T5 com `Verify` real pendente de `T9` (nova, triagem 005, 02/08/2026)** — `IpcServer` nunca é iniciado pelo app (`src-tauri/src/lib.rs`), então o sidecar não consegue conectar em uso real, mesma natureza do gap de `App.tsx` em `multi-terminal` → `.specs/features/mcp-task-server/`
- Ferramentas de tarefa (criar, iniciar, planejar, implementar, concluir, buscar)
- Ferramentas de terminal (título geral, atividade, status)
- Auto-detecção de terminal e projeto a partir do ambiente da sessão
- Handshake `check_active` — agentes fora do app ignoram o protocolo

**Kanban de tarefas** — IN PROGRESS — 7 de 8 tarefas `✅ Done` (`T1-T7`). **Corrigido na triagem 008 (11/08/2026): `T7` já foi implementada** — a janela "Kanban" monta o board real (`src/main.tsx` roteia por label) e `task_changed` carrega payload real. Só `T8` (formulário de criação manual) segue pendente → `.specs/features/task-kanban/`
- Janela dedicada, 4 colunas: Pending / In Progress / In Testing / Completed
- Card: chip de projeto, número, título, descrição, data, excluir, enviar-ao-terminal
- Filtro por projeto, busca textual, ordenação por coluna
- Fluxo obrigatório de teste: In Progress → In Testing → Completed

**Status e atividade de terminal** — IN PROGRESS — 4 de 5 tarefas `✅ Done no gate` (`T1-T4`), mas o badge/log (`T4`) não está integrado ao `TerminalHeader` real — existe só como componente isolado testado. `+1 tarefa nova (T5)`, adicionada na triagem 006 (02/08/2026), para montar o badge/log no header real. O CRUD do catálogo (`StatusesPanel.tsx`, T3) segue sem janela até `settings-shell` entregar o container. `STAT-07` foi **revogado** (duplicava `multi-terminal/TERM-06`) → `.specs/features/terminal-statuses/`
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
