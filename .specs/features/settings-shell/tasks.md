# Janela de Configurações — Tasks

**Spec**: `.specs/features/settings-shell/spec.md` (sem design — feature pequena, design inline)
**Testing**: `.specs/codebase/TESTING.md`
**Status**: In Progress (criada na triagem 006, 03/08/2026 — decisão do usuário: Settings vira feature própria, não entra dentro de `agent-selection`)
**Milestone**: M1 (desbloqueia `agent-selection`/`projects`, ambas M1; `terminal-statuses`/`release-distribution` também dependem, M2/Transversal)

---

## Plano de execução

```
T1 → T2
```

---

## Tarefas

### T1: Janela secundária de Configurações

**O quê**: Criar, focar e encerrar a janela de Configurações — mesmo padrão de `task-kanban/T1` (`windows/kanban.rs`).
**Onde**: `src-tauri/src/windows/settings.rs` (novo, mesma estrutura de `windows/kanban.rs`: `open`, `register_cascade_close`, comandos `settings_open`/`settings_focus_main`), `src-tauri/src/commands/mod.rs` (declara o módulo, mesmo mecanismo de `#[path]` usado para `kanban.rs` — ver comentário em `windows/kanban.rs` sobre por que não entra como módulo de topo em `lib.rs`), `src-tauri/src/lib.rs` (registra os 2 comandos novos no `invoke_handler!`), `src/App.tsx` (botão "Configurações" na toolbar, ao lado de "+ novo terminal")
**Depende de**: nenhuma
**Reusa**: `WebviewWindowBuilder`, `WindowEvent::Destroyed` para cascata (copiar o padrão de `windows/kanban.rs` quase literalmente — só troca o label e o título da janela)
**Requisito**: SET-01

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [x] `open()` cria a janela; se já existe, foca em vez de criar outra
- [x] Fechar a janela principal fecha Configurações junto
- [x] Botão "Configurações" na toolbar chama `settings_open`
- [x] Gate passa: `cargo build && npm run build`

**Tests**: none *(invólucro sobre a API de janelas do Tauri, mesmo padrão de `task-kanban/T1`)* · **Gate**: build

**Verify**: abrir Configurações duas vezes → uma janela só. Fechar a principal → Configurações fecha. *(Pendente — é `uat-agent`, não rodado nesta execução em modo direto.)*

**Commit**: `feat(settings): secondary window with focus-or-create`

---

### T2: Navegação entre as 4 seções e montagem real dos painéis

**O quê**: `src/main.tsx` passa a decidir entre `<App/>` (terminais), `<KanbanBoard/>` (se `task-kanban/T7` já tiver resolvido essa parte) e `<SettingsShell/>` pelo `label` da janela atual (`getCurrentWebviewWindow().label`, sem `react-router` — mesma decisão de `task-kanban/T7`). `SettingsShell` é a navegação (abas ou lista lateral) entre `AgentPanel`, `ProjectsPanel`, `StatusesPanel`, `UpdateSettings`, todos já existentes.
**Onde**: `src/main.tsx` (modifica — branch por label), `src/routes/settings/SettingsShell.tsx` (novo — navegação + monta o painel ativo)
**Depende de**: T1
**Reusa**: `AgentPanel.tsx`, `ProjectsPanel.tsx`, `StatusesPanel.tsx`, `UpdateSettings.tsx` (todos já existem e testados — esta task não toca a lógica interna de nenhum)
**Requisito**: SET-02

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [x] Navegação lista as 4 seções: Agentes, Projetos, Status de terminal, Atualizações
- [x] Clicar numa seção renderiza o painel certo sem remontar a janela
- [x] Primeira abertura mostra Agentes por padrão
- [x] Gate passa: `cargo build && npm run build`

**Tests**: none *(fiação — a lógica de cada painel já é testada isoladamente, mesmo padrão de `multi-terminal/T12`)* · **Gate**: build

**Verify**: `uat-agent` — abrir Configurações pela UI real, clicar nas 4 seções, confirmar que cada painel aparece (catálogo de agentes, lista de projetos, catálogo de status, seção de atualizações). Isto também é o que destrava o `Verify` real de `agent-selection/T4`, `projects/T4`, `terminal-statuses/T3`, `release-distribution/T17` — nenhum desses tinha como ser confirmado num app real antes desta task. **Pendente** — execução em modo direto, `uat-agent` não rodado.

**Commit**: `feat(settings): mount real settings shell with the four existing panels`

**Status real pós-implementação (run 007-2026-08-03):** Done no gate (`cargo build && npm run build` — 0 erros), mas com uma lacuna estrutural que o próximo trabalho nesta feature precisa fechar:

- `AgentPanel` e `ProjectsPanel` recebem dado **real**, via `invoke('agent_catalog')` / `invoke('agent_default')` / `invoke('project_list')` — todos já registrados em `lib.rs`. `onSelectDefault` só atualiza estado local da sessão: não existe `#[tauri::command]` que exponha `agents::prefs::set_default_agent` (a função já existe, sem invólucro) — persistir a escolha não estava na lista fechada de arquivos desta task (tocaria `commands/agents.rs` + `lib.rs`, território proibido aqui).
- `StatusesPanel` roda **inteiramente em estado local** (começa vazio) — nenhum `#[tauri::command]` expõe o CRUD de `status_catalog` (`create`/`update`/`disable`/`delete`/`reorder`/`restore_defaults`, todos implementados e testados em `src-tauri/src/terminal/status_catalog.rs`, mas sem invólucro nenhum registrado no `invoke_handler!`).
- `UpdateSettings` reusa `update_check` de verdade (já registrado); `installedVersion` vem de `package.json` (import direto, sem comando novo); `mode` fica fixo em `'installed'` (nenhum detector exposto ao frontend); `autoCheckEnabled` só reflete o padrão documentado (`db::auto_check`/`set_auto_check` existem em `src-tauri/src/db/settings.rs`, sem invólucro `#[tauri::command]`) — o toggle aqui também é só local à sessão.
- **Consequência prática**: os 4 painéis ficam alcançáveis e clicáveis (o que SET-02 pede), mas 3 das 4 seções não persistem nada ainda. Uma task futura (`SET-03`? — a criar/discutir com o usuário, já que não existe ID para isso hoje) precisaria adicionar os invólucros `#[tauri::command]` que faltam (`agents.rs`, um `statuses.rs` novo, `update.rs`) e registrá-los em `lib.rs` — fora do alcance desta task por desenho (`TERRITÓRIO COMPARTILHADO`).
- A janela `settings` (assim como `kanban`) também não está listada em `src-tauri/capabilities/default.json` (`"windows": ["main"]`) nem em `tauri.conf.json` (`app.windows`) — sob o ACL do Tauri 2, uma janela fora dessa lista não deveria ter permissão para nenhum `invoke()`. Isto não é uma regressão introduzida por esta task: `KanbanBoard.tsx` (janela `kanban`, já em produção) já chama `invoke('task_delete')`/`invoke('task_send')` sob a mesma configuração, então o mesmo risco já existia antes desta task. Não verificado em runtime real (ver `uat-agent` pendente acima) — se confirmado, é um bug transversal a `kanban` e `settings`, não específico de `SET-02`.
