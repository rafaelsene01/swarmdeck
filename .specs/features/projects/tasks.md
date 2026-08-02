# Projetos — Tasks

**Spec**: `.specs/features/projects/spec.md` (sem design — feature pequena, design inline)
**Testing**: `.specs/codebase/TESTING.md`
**Status**: Done (T1–T4 implementadas na run `spec-loop` 004, 01/08/2026 — `.specs/runs/004-2026-08-01/JOURNAL.md`)
**Milestone**: M1

---

## Plano de execução

```
mcp-task-server/T1 → T1 → T2 → ┬→ T3 [P]
                               └→ T4 [P]
```

| Tarefa | Status | Testes entregues |
|---|---|---|
| T1 `ProjectService` | ✅ Done | 7 integration (plano: 7) |
| T2 Resolução de projeto por diretório | ✅ Done | 6 unit (plano: 6) |
| T3 Comandos Tauri de projeto | ✅ Done | — (invólucro fino) |
| T4 UI de gerenciamento de projetos | ✅ Done | 5 unit (plano: 4, +1 estado vazio) |

**Bug real encontrado e corrigido durante a run:** `ProjectService::create`/`update` gravavam o `path` canonicalizado com o prefixo verbatim `\\?\` do Windows, quebrando `projects::resolve` para qualquer `cwd` real (não canonicalizado) — isso quebraria a resolução de projeto (PROJ-03) inteiramente em produção no Windows. Corrigido na origem (`require_existing_dir`, `projects/service.rs`); ver `JOURNAL.md` da run 004.

---

## Tarefas

### T1: `ProjectService`

**O quê**: CRUD de projeto com atribuição de cor não usada e validação de diretório.
**Onde**: `src-tauri/src/projects/service.rs`
**Depende de**: `mcp-task-server/T1` (migração cria a tabela `projects`)
**Reusa**: camada de banco
**Requisito**: PROJ-01, PROJ-02

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] `create` exige nome e diretório existente; recusa diretório já usado apontando o projeto dono
- [ ] Cor atribuída da paleta priorizando a menos usada quando esgotada
- [ ] `delete` retorna quantas tarefas serão afetadas e deixa `project_id NULL`
- [ ] Gate passa: `cargo test`
- [ ] Contagem: 7 testes passam (create, diretório inexistente recusado, duplicado recusado, cores distintas, reciclagem de paleta, update propaga, delete conta e desvincula)

**Tests**: integration · **Gate**: full

**Verify**: `cargo test projects::service` → 7 passam.

**Commit**: `feat(projects): project service with color assignment`

---

### T2: Resolução de projeto por diretório

**O quê**: Função que mapeia um `cwd` para um projeto, com regra de caminho mais específico e fallback.
**Onde**: `src-tauri/src/projects/resolve.rs`
**Depende de**: T1
**Reusa**: `ProjectService` (T1)
**Requisito**: PROJ-03, PROJ-04

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Caminho exato resolve para o projeto
- [ ] Subpasta resolve para o projeto ancestral
- [ ] Com dois candidatos, o de caminho **mais específico** vence
- [ ] Sem candidato, devolve fallback com o nome da pasta — **nunca erro**
- [ ] Normaliza separadores para funcionar em Windows e POSIX
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 6 testes passam (exato, subpasta, mais específico vence, fallback, normalização de separador, case-insensitive no Windows)

**Tests**: unit · **Gate**: quick

**Verify**: `cargo test projects::resolve` → 6 passam.

**Commit**: `feat(projects): directory-based project resolution`

---

### T3: Comandos Tauri de projeto [P]

**O quê**: Expor `project_list`, `project_create`, `project_update`, `project_delete` como invólucros finos.
**Onde**: `src-tauri/src/commands/projects.rs`
**Depende de**: T2
**Reusa**: `ProjectService` (T1)
**Requisito**: PROJ-01

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Os 4 comandos registrados, sem lógica além de delegar
- [ ] Gate passa: `cargo build && npm run build`

**Tests**: none *(invólucro fino — a matriz exige `none`)* · **Gate**: build

**Verify**: chamar `project_list` pelo devtools e receber a lista.

**Commit**: `feat(projects): tauri commands`

---

### T4: UI de gerenciamento de projetos [P]

**O quê**: Tela de listagem com bolinha de cor, nome, caminho, contagem de tarefas, busca e ordenação.
**Onde**: `src/routes/settings/ProjectsPanel.tsx`
**Depende de**: T2
**Reusa**: comandos de T3 quando disponíveis; até lá, mock do contrato
**Requisito**: PROJ-05

**Ferramentas**: MCP: NENHUM · Skill: NENHUMA

**Done when**:
- [ ] Linha exibe cor, nome, caminho absoluto e contagem de tarefas
- [ ] Ordenação por último uso funciona
- [ ] Busca filtra por nome **e** por caminho
- [ ] Caminho longo truncado no meio, preservando início e fim
- [ ] Estado vazio convida a criar o primeiro
- [ ] Gate passa: `cargo test --lib && npm run test`
- [ ] Contagem: 4 testes passam (ordenação, busca por nome, busca por caminho, truncamento no meio)

**Tests**: unit · **Gate**: quick

**Verify**: `npm run test ProjectsPanel` → 4 passam.

**Commit**: `feat(ui): projects management panel`

---

## Check 1 — Granularidade

| Tarefa | Escopo | Status |
|---|---|---|
| T1 | 1 serviço | ✅ |
| T2 | 1 função | ✅ |
| T3 | 4 invólucros finos, 1 arquivo | ✅ coeso |
| T4 | 1 componente | ✅ |

## Check 2 — Diagrama × definição

| Tarefa | `Depende de` | Diagrama | Status |
|---|---|---|---|
| T1 | mcp-task-server/T1 | raiz da feature | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 [P] | ✅ |
| T4 | T2 | T2→T4 [P] | ✅ |

T3 e T4 não dependem uma da outra — T4 usa mock do contrato até T3 existir. Paralelismo válido.

## Check 3 — Co-locação de testes

| Tarefa | Camada criada | Matriz exige | Tarefa declara | Status |
|---|---|---|---|---|
| T1 | serviço + banco | integration | integration | ✅ |
| T2 | domínio | unit | unit | ✅ |
| T3 | comandos Tauri (finos) | none | none | ✅ |
| T4 | componente React com lógica | unit | unit | ✅ |

Nenhuma violação.
