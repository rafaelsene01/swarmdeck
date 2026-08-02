# Servidor MCP de tarefas — Contrato de ferramentas

**Spec**: `.specs/features/mcp-task-server/spec.md`
**Design**: `.specs/features/mcp-task-server/design.md`
**Status**: Congelado (triagem 001, 28/07/2026 — ver `project/STATE.md`, AD "Contrato de ferramentas MCP congelado")

---

## ⚠️ Aviso obrigatório — este contrato é inferido, não validado

Os nomes de ferramenta, parâmetros e formatos de retorno abaixo foram **inferidos a partir das instruções globais do usuário** (`~/.claude/CLAUDE.md`, seção "CodeAgentSwarm Task Management System"), não de nenhuma documentação oficial de protocolo nem de leitura direta do código-fonte de uma implementação de referência. Este documento **não teve acesso** ao `CLAUDE.md` global em si — recebeu apenas os nomes de ferramenta e assinaturas de alto nível já extraídos dele, na convenção observada em sistemas MCP de gerenciamento de tarefas equivalentes.

**Decisão já tomada (triagem 001, 28/07/2026):** o contrato **congela** esses nomes inferidos. Não há, e não haverá antes da implementação, validação contra uma implementação de referência real. Este é o risco aceito registrado em `STATE.md`.

**Consequência prática:** tudo neste documento — nome de ferramenta, nome de parâmetro, tipo, formato de retorno — é a **melhor inferência disponível em 28/07/2026**, não um fato confirmado. As tarefas `T6` e `T7` de `tasks.md` implementam exatamente o que está aqui, sem desviar.

**Procedimento se um nome se provar errado depois** (ex.: o agente de CLI do usuário chama a ferramenta com outro nome, ou o schema real diverge):

1. **Não corrija em silêncio.** Corrigir só o código sem atualizar este documento faz o documento mentir com autoridade — pior do que não ter documento (regra 3 de `spec-driven-changes.md`).
2. Corrija **os dois lugares** no mesmo commit: este `TOOL-CONTRACT.md` **e** a task de `tasks.md` que implementa a ferramenta (o `Done when` dela cita o nome errado).
3. Registre a divergência como uma nova **AD em `STATE.md`**, com o nome antigo (inferido), o nome novo (confirmado) e a fonte que revelou o erro. Não edite a AD original de 28/07/2026 — ela documenta a decisão de congelar sem validar, que continua correta como registro histórico mesmo que um nome individual mude.
4. Se a divergência for descoberta **depois de T7** (sidecar já implementado), o `rmcp` gera o schema a partir da assinatura Rust — renomear no código é barato. O caro são os prompts que o usuário já tem escritos contra o nome antigo; avise-o explicitamente ao corrigir.

**Este documento não compara** os nomes inferidos contra nenhuma implementação real — essa comparação foi explicitamente descartada pelo usuário na triagem 001. O item correspondente do `Done when` de T0 está marcado como sem objeto por esse motivo.

---

## Arquitetura do handshake (por que não existe uma "ferramenta de ativação" com lógica própria)

Diferente do sistema de origem — onde `check_active` é presumivelmente uma consulta a um estado interno do app — no SwarmDeck o handshake **é o resultado mecânico de uma tentativa de conexão IPC**, não uma lógica de negócio dedicada. Ver `design.md`, seção "`check_active` cai fora de graça", e o diagrama de arquitetura (sidecar `swarmdeck-mcp` ↔ `IpcServer` do app via named pipe/unix socket, usando `SWARMDECK_TERMINAL_ID` injetado no spawn do PTY).

`check_active` **continua existindo como ferramenta MCP explícita** — o agente ainda precisa chamá-la, porque só o app sabe se o socket aceita a conexão, e o agente não tem como inspecionar isso sozinho. O que muda é que:

- o caminho **negativo** (env var ausente, ou socket recusa) **nunca chega ao `TaskService`** — é resolvido inteiramente dentro do sidecar (env var ausente) ou pela recusa do próprio SO na tentativa de conexão (app fechado). Não há código de "detectar inatividade" para escrever ou testar no lado do app.
- o caminho **positivo** é o único que efetivamente fala com o `IpcServer`: a conexão é aceita, o `terminal_id` é validado contra uma sessão viva, e a resposta ecoa esse id.

Isso é o que a tabela de T6 (`tasks.md`) testa: handshake, ativo, env ausente, app fechado — 4 casos, dos quais só 1 (`ativo`) exercita o app de fato.

---

## Convenção de tipos

- `integer` = `i64` no Rust / `number` em JSON, sempre o id numérico de tarefa (`#2` no card).
- `string` = UTF-8, sem limite formal exceto onde indicado (plano/implementação truncam — ver `design.md`, tabela de tratamento de erros).
- `timestamp` = inteiro Unix (segundos), campo `created_at`/`updated_at`/`logged_at` no schema SQL.
- Toda ferramenta que falha por precondição de handshake (agente fora do app, ou `terminal_id` sem sessão viva) devolve **erro MCP descritivo**, nunca um retorno de sucesso vazio. Isso vale para todas as ferramentas abaixo, não é repetido em cada uma.

---

## Catálogo de ferramentas

### 1. `check_active`

**Atende**: MCP-01 (Handshake)

| | |
|---|---|
| Parâmetros | nenhum |
| Retorno | `{ "active": boolean, "terminal_id": string \| null, "message": string \| null }` |

- `active: true` + `terminal_id` preenchido → agente está num terminal do app, socket conectou, `SWARMDECK_TERMINAL_ID` validado contra sessão viva.
- `active: false`, `terminal_id: null`, `message` preenchido com instrução explícita (ex.: `"not running inside SwarmDeck — skip task tools this session"`) → cobre tanto "env var ausente" quanto "socket recusou". O agente não distingue as duas causas, e não precisa: em ambas o protocolo deve ser ignorado (spec.md, AC2 e AC3 de MCP-01).
- O campo `message` não aparece na tabela abreviada de `design.md` (`{active, terminal_id?}`) — foi adicionado aqui porque a spec (AC2) exige explicitamente uma "instrução explícita de ignorar o protocolo", e o retorno precisa carregar essa instrução em algum campo. Isto refina, não contradiz, `design.md`.
- Qualquer outra ferramenta chamada quando o handshake resultaria em `active: false` devolve erro descritivo em vez de gravar dado (spec.md, AC4) — não há necessidade de o agente checar `check_active` antes de cada chamada; a mesma checagem de socket/terminal vivo que fundamenta o handshake é reaplicada pelo `IpcServer` em toda requisição.

---

### 2. `create_task`

**Atende**: MCP-02 (Ciclo de vida), MCP-08 (Resolução de projeto)

| | |
|---|---|
| Parâmetros | `title: string` (obrigatório), `description: string \| null` (opcional) |
| Retorno | `Task` — `{ id: integer, title: string, description: string \| null, plan: string \| null, implementation: string \| null, status: "pending", project_id: string \| null, terminal_id: string, created_at: timestamp, updated_at: timestamp }` |

- `terminal_id` **não é parâmetro** — inferido do `SWARMDECK_TERMINAL_ID` da conexão IPC que originou a chamada.
- `project_id` **não é parâmetro** — resolvido pelo `cwd` do terminal (caminho mais específico vence; fallback para nome da pasta se nenhum projeto casa). Ver ferramenta `create_project` abaixo para o caso "projeto ainda não existe".
- Status inicial sempre `pending`.

---

### 3. `start_task`

**Atende**: MCP-02 (Ciclo de vida)

| | |
|---|---|
| Parâmetros | `task_id: integer` |
| Retorno | `Task` atualizada, com `status: "in_progress"` |

- Move para `in_progress` **a partir de qualquer estado**, inclusive `completed` — retomar trabalho não usa ferramenta diferente (spec.md, AC2).
- `task_id` inexistente → erro descritivo, nenhuma tarefa é criada.

---

### 4. `update_task_plan`

**Atende**: MCP-02 (Ciclo de vida)

| | |
|---|---|
| Parâmetros | `task_id: integer`, `plan: string` |
| Retorno | `Task` atualizada, com `plan` gravado |

- Texto acima do teto de tamanho é truncado, com sinalização no retorno (campo `truncated: boolean`, adicional ao schema mínimo de `Task` — ver `design.md`, tratamento de erros).

---

### 5. `update_task_implementation`

**Atende**: MCP-02 (Ciclo de vida)

| | |
|---|---|
| Parâmetros | `task_id: integer`, `implementation: string` |
| Retorno | `Task` atualizada, com `implementation` gravado |

- Mesma regra de truncamento de `update_task_plan`.

---

### 6. `complete_task`

**Atende**: MCP-02 (Ciclo de vida), MCP-03 (Fluxo obrigatório de teste)

| | |
|---|---|
| Parâmetros | `task_id: integer` |
| Retorno | `Task` atualizada, com o novo `status` |

- Chamado numa tarefa `in_progress` → move para `in_testing`. **Nunca** direto para `completed` — não existe aresta `in_progress → completed` na máquina de estados (`design.md`, T2).
- Chamado numa tarefa `in_testing` → move para `completed`.
- Chamado numa tarefa `pending` ou já `completed` → transição inválida, erro nomeando as transições válidas a partir daquele estado.
- `task_id` inexistente → erro descritivo; a tarefa **não é criada**.

---

### 7. `find_related_active_tasks`

**Atende**: MCP-07 (Similaridade e dedup)

| | |
|---|---|
| Parâmetros | `query: string` |
| Retorno | `Array<{ task: Task, score: number (0.0–1.0), recommendation: "reuse" \| "ask_user" \| "create_new" }>` |

- Compara só tarefas em estado ativo (`pending`, `in_progress`, `in_testing` — não `completed`).
- `score > 0.70` → `recommendation: "reuse"`.
- `0.50 ≤ score ≤ 0.70` → `recommendation: "ask_user"`.
- `score < 0.50` → `recommendation: "create_new"`.
- Algoritmo de score é definido em `T8` (`design.md`, Riscos: trigram/Levenshtein normalizado sobre título+descrição), fora do escopo deste contrato de ferramentas.

---

### 8. `search_tasks`

**Atende**: MCP-07 (Similaridade e dedup)

| | |
|---|---|
| Parâmetros | `query: string`, `limit: integer \| null`, `offset: integer \| null` |
| Retorno | `{ tasks: Task[], total: integer }` |

- Busca textual livre (não pontuada por similaridade — para isso, `find_related_active_tasks`). Paginação com os mesmos parâmetros de `list_tasks`, para não estourar o contexto do agente.

---

### 9. `list_tasks`

**Atende**: MCP-07 (Similaridade e dedup)

| | |
|---|---|
| Parâmetros | `status: string \| null` (um de `pending`, `in_progress`, `in_testing`, `completed`), `limit: integer \| null`, `offset: integer \| null` |
| Retorno | `{ tasks: Task[], total: integer }` |

- Sem `status`, lista todas. `limit`/`offset` sempre aceitos, conforme spec.md AC4 de MCP-07.

---

### 10. `set_terminal_title`

**Atende**: MCP-04 (Título e atividade do terminal), MCP-06 (Rename manual vence o agente)

| | |
|---|---|
| Parâmetros | `title: string` (rótulo curto, aba), `long_title: string \| null` (descrição longa) |
| Retorno | `{ applied: boolean, title_source: "agent" \| "user" }` |

- Se o terminal já tem `title_source = 'user'` (o usuário renomeou manualmente) → o sistema **descarta** o título do agente e devolve `applied: false, title_source: "user"`. Isso é a regra "rename manual vence o agente" (MCP-06) implementada como precondição desta própria ferramenta, não como ferramenta separada.
- Quando há uma tarefa ativa naquele terminal, o título gravado fica associado ao `task_id` dela (spec.md, AC6 de MCP-04) — essa associação é feita pelo `TerminalMetaService` via o `terminal_id` já presente na conexão, **não é um parâmetro** desta ferramenta.
- **Ferramenta deprecated não adotada**: o `CLAUDE.md` global do usuário lista `update_terminal_title` como precedente deprecated desta ferramenta, substituído por `set_terminal_title` + `update_terminal_activity`. Este contrato **não expõe** `update_terminal_title` — apenas o par que a substitui, já que a própria fonte trata o nome antigo como legado.

---

### 11. `update_terminal_activity`

**Atende**: MCP-04 (Título e atividade do terminal)

| | |
|---|---|
| Parâmetros | `activity: string` |
| Retorno | `{ ok: boolean, logged_at: timestamp }` |

- Anexa ao log de atividade do terminal (`terminal_activity`, ver `design.md`, Modelos de dados). **Nunca altera o título da aba** — essa é a distinção central entre esta ferramenta e `set_terminal_title` (spec.md, AC3 de MCP-04).
- Log tem teto de 200 entradas por terminal (`design.md`, `T4`); entradas mais antigas são descartadas silenciosamente na gravação.

---

### 12. `set_terminal_status`

**Atende**: MCP-05 (Status do terminal)

| | |
|---|---|
| Parâmetros | `status: string` (id do catálogo, ex.: `"working"`, `"needs_input"`, `"needs_testing"`, `"done"`, `"clear"`) |
| Retorno | sucesso: `{ applied: true, status: string }` · falha: erro contendo `valid_statuses: string[]` |

- Status desconhecido **ou desativado** é recusado como inválido — a resposta de erro inclui a lista de status válidos (spec.md, AC5 de MCP-05).
- O catálogo validado é o **snapshot capturado no início da sessão** do agente (`design.md`, Decisões técnicas — "Propagação do catálogo de status"); uma mudança de catálogo em runtime só vale para sessões novas.

---

### 13. `get_projects`

**Atende**: MCP-08 (Resolução de projeto)

| | |
|---|---|
| Parâmetros | nenhum |
| Retorno | `Project[]` — `{ id: string, name: string, path: string, color: string, last_used: timestamp \| null }[]` |

---

### 14. `create_project`

**Atende**: MCP-08 (Resolução de projeto)

| | |
|---|---|
| Parâmetros | `name: string`, `path: string` |
| Retorno | `Project` criado, com `color` atribuída automaticamente entre as ainda não usadas (spec.md, AC3 de MCP-08) |

---

### 15. `get_project_tasks`

**Atende**: MCP-08 (Resolução de projeto)

| | |
|---|---|
| Parâmetros | `project_id: string` |
| Retorno | `Task[]` pertencentes àquele projeto |

---

### 16. `update_task_project`

**Atende**: MCP-08 (Resolução de projeto)

| | |
|---|---|
| Parâmetros | `task_id: integer`, `project_id: string` |
| Retorno | `Task` atualizada, com o novo `project_id` |

- Uso esperado: correção manual/pelo agente quando a resolução automática por `cwd` (em `create_task`) errou o projeto.

---

## Ferramentas do `CLAUDE.md` global citadas na fonte e **não adotadas** neste contrato

A convenção observada no `CLAUDE.md` global lista ferramentas adicionais que não têm requisito `MCP-xx` correspondente na spec deste projeto — a spec (`spec.md`, "Fora de escopo") já as exclui explicitamente ou nunca as menciona:

| Ferramenta na fonte | Por que fica de fora |
|---|---|
| `update_terminal_title` | Deprecated na própria fonte, substituída por `set_terminal_title` + `update_terminal_activity` (ver ferramenta 10 acima) |
| `create_subtask`, `suggest_parent_tasks`, `get_task_hierarchy` | Subtarefas e hierarquia pai-filho — `spec.md` marca como "fora de escopo", adiado (ver `STATE.md`) |
| `update_task_terminal` | Reatribuição de tarefa a outro terminal — nenhuma história de usuário da spec cobre esse fluxo; nenhum `MCP-xx` mapeia para ela |
| (ferramentas de permissão, ex. `edit_permissions`) | Feature PRO do sistema de origem, não observável — `spec.md`, "Fora de escopo" |
| (labels de tarefa) | Feature PRO do sistema de origem — `spec.md`, "Fora de escopo" |

Se alguma dessas se mostrar necessária depois (por exemplo, um teste real revelar que o agente de CLI do usuário tenta chamar `update_task_terminal`), o procedimento é o mesmo da seção de aviso no topo: atualizar este contrato, a task correspondente, e registrar AD em `STATE.md` — não adicionar em silêncio.

---

## Cobertura de requisitos

| Requisito | Ferramenta(s) | Status |
|---|---|---|
| MCP-01 — Handshake | `check_active` | ✅ mapeado |
| MCP-02 — Ciclo de vida da tarefa | `create_task`, `start_task`, `update_task_plan`, `update_task_implementation`, `complete_task` | ✅ mapeado |
| MCP-03 — Fluxo obrigatório de teste | `complete_task` (dupla chamada, máquina de estados sem aresta `in_progress→completed`) | ✅ mapeado |
| MCP-04 — Título e atividade do terminal | `set_terminal_title`, `update_terminal_activity` | ✅ mapeado |
| MCP-05 — Status do terminal | `set_terminal_status` | ✅ mapeado |
| MCP-06 — Rename manual vence o agente | `set_terminal_title` (precondição `title_source`) | ✅ mapeado |
| MCP-07 — Similaridade e dedup | `find_related_active_tasks`, `search_tasks`, `list_tasks` | ✅ mapeado |
| MCP-08 — Resolução de projeto | `create_task` (inferência), `get_projects`, `create_project`, `get_project_tasks`, `update_task_project` | ✅ mapeado |

Todos os 8 requisitos `MCP-01`..`MCP-08` têm pelo menos uma ferramenta concreta mapeada, com nome, parâmetros e formato de retorno definidos acima. Nenhum requisito ficou sem ferramenta correspondente.
