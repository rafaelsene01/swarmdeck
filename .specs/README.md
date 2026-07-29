# Specs — SwarmDeck

Clone funcional do CodeAgentSwarm, especificado por **engenharia reversa da UI** (nenhum código-fonte do original foi lido). Metodologia: `tlc-spec-driven`.

## Por onde começar

1. `project/PROJECT.md` — visão, stack, escopo do v1
2. `project/ROADMAP.md` — os 5 milestones e o que entra em cada um
3. `research/UI-INVENTORY.md` — o que foi observado no original, com screenshots
4. `project/STATE.md` — decisões, bloqueios e riscos abertos

## Features especificadas

| Feature | Milestone | Requisitos | Spec |
|---|---|---|---|
| Multi-terminal em grid | M1 | 9 | [multi-terminal](features/multi-terminal/spec.md) |
| Seleção de agente | M1 | 5 | [agent-selection](features/agent-selection/spec.md) |
| Projetos | M1 | 5 | [projects](features/projects/spec.md) |
| Servidor MCP de tarefas | M2 | 8 | [mcp-task-server](features/mcp-task-server/spec.md) |
| Kanban de tarefas | M2 | 8 | [task-kanban](features/task-kanban/spec.md) |
| Status e atividade de terminal | M2 | 8 | [terminal-statuses](features/terminal-statuses/spec.md) |
| Gerenciamento de MCP | M3 | 5 | [mcp-management](features/mcp-management/spec.md) |
| Gerenciador de Skills | M3 | 4 | [skills-manager](features/skills-manager/spec.md) |
| Git Worktrees | M4 | 7 | [worktrees](features/worktrees/spec.md) |
| Limpeza de conversas | M4 | 5 | [conversation-cleanup](features/conversation-cleanup/spec.md) |
| Notificações de desktop | M4 | 6 | [notifications](features/notifications/spec.md) |
| Onboarding Agent | M5 | 6 | [onboarding-agent](features/onboarding-agent/spec.md) |
| Release e distribuição | Transversal | 36 | [release-distribution](features/release-distribution/spec.md) |

**Total: 13 features, 112 requisitos rastreáveis.**

## Estado do pipeline

```
SPECIFY ✅ →  DESIGN 🟡 →  TASKS 🟡 →  EXECUTE 🟡
```

*(`EXECUTE` corrigido de ⬜ para 🟡 na triagem 002 — 28/07/2026. O marcador dizia "não começou" enquanto `multi-terminal/T1–T4` já estavam entregues, com 15 testes passando. É a mesma divergência que a triagem 001 corrigiu no `ROADMAP.md`; este segundo lugar passou.)*

**Tasks concluídas para M1 + M2 e para a faixa transversal de entrega** — 59 tarefas atômicas. *(Corrigido na triagem 001: dizia 58, mas a tabela logo abaixo sempre somou 59, e a contagem de headers confirma 59.)*

- **Ordem de execução global**: [project/EXECUTION.md](project/EXECUTION.md) — o único lugar com as dependências *entre* features
- **Estratégia de teste**: [codebase/TESTING.md](codebase/TESTING.md) — matriz de cobertura e avaliação de paralelismo

| Feature | Tarefas | Arquivo |
|---|---|---|
| multi-terminal | 11 | [tasks.md](features/multi-terminal/tasks.md) |
| agent-selection | 4 | [tasks.md](features/agent-selection/tasks.md) |
| projects | 4 | [tasks.md](features/projects/tasks.md) |
| mcp-task-server | 9 | [tasks.md](features/mcp-task-server/tasks.md) |
| terminal-statuses | 4 | [tasks.md](features/terminal-statuses/tasks.md) |
| task-kanban | 6 | [tasks.md](features/task-kanban/tasks.md) |
| release-distribution | 21 | [tasks.md](features/release-distribution/tasks.md) |

🚧 **`mcp-task-server/T0` é gate de bloqueio** — **escrever** o `TOOL-CONTRACT.md` antes de qualquer tarefa do M2. *(Corrigido na triagem 002: dizia "confirmar o contrato", verbo que sobreviveu à decisão do usuário na triagem 001. Não há confirmação contra a implementação de referência — os nomes inferidos do `CLAUDE.md` global **são** o contrato. Ver a AD de 28/07/2026 no `STATE.md`.)*
🔑 **`release-distribution/T5` é gate de bloqueio** — sem a chave de assinatura e os secrets no repositório, nenhum build de release passa.

**Design concluído** para as quatro features Large — as que têm decisão arquitetural real:

| Feature | Design | Decisão central |
|---|---|---|
| multi-terminal | [design.md](features/multi-terminal/design.md) | Saída do PTY por `tauri::ipc::Channel` com throttle de 16ms |
| mcp-task-server | [design.md](features/mcp-task-server/design.md) | Sidecar stdio + IPC local; o app é a única autoridade de escrita |
| task-kanban | [design.md](features/task-kanban/design.md) | Janela Tauri secundária sincronizada por evento com delta |
| release-distribution | [design.md](features/release-distribution/design.md) | Validar e publicar em arquivos separados; `paths.rs` é a única autoridade sobre onde os dados moram |

As 9 features restantes são pequenas o bastante para pular Design e ir direto a Tasks.

## Nota sobre origem

As especificações descrevem **comportamento funcional observável**. Nenhum código, asset gráfico, ícone, texto de marca ou nome do produto original foi copiado. O nome "SwarmDeck" é provisório e não tem relação com o original.
