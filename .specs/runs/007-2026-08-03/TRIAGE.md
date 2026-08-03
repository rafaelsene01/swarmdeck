# Triagem 007 — 03/08/2026

**Status:** pronta
**Revisão ao fechar:** `git rev-parse --short HEAD` → `259b96e` (inalterado desde o início desta run — nenhuma mudança de código, só documentação)
**Perguntas em aberto:** 0 — nenhuma das 3 divergências encontradas exigiu decisão do usuário, todas eram correção de bookkeeping

> **Escopo desta run, decidido pelo usuário:** nada mudou no código nem no HEAD desde o fechamento da triagem 006 (`259b96e`, mesmo `git status --short` com as mesmas edições de doc pendentes de commit). Em vez de reauditar o projeto inteiro do zero, esta run é uma **verificação adversarial (fresh eyes) só do que a própria triagem 006 escreveu**: a spec nova `settings-shell`, as 7 tasks novas (`multi-terminal/T16`, `agent-selection/T5`, `task-kanban/T7-T8`, `terminal-statuses/T5`, `settings-shell/T1-T2`), as tabelas de rastreabilidade reescritas (`release-distribution`, `task-kanban`, `terminal-statuses`) e `AGENTS.md`. Autor ≠ verificador: quem escreveu 006 não é quem audita 007.

---

## Perfil do projeto (Fase 0)

Herdado de `.specs/runs/006-2026-08-02/TRIAGE.md` sem mudança — nada no projeto mudou entre o fechamento daquela triagem e o início desta (mesmo HEAD `259b96e`, mesma árvore de trabalho). Ver aquele arquivo para o perfil completo (gates medidos, território compartilhado, `human-only`, convenções). Only diferença desta run: `AGENTS.md` deixou de estar vazio — foi populado pela própria 006, então a seção "Regras do repositório" daquele perfil está desatualizada nesse único ponto (ver Divergências abaixo).

- **Revisão no início desta run:** `git rev-parse --short HEAD` → `259b96e` (igual ao fechamento da 006)
- **Escopo desta auditoria:** não é o projeto inteiro — é a superfície escrita pela 006. Ver lista acima.

---

## Divergências encontradas (Fase 1)

Um subagent somente-leitura, independente de quem escreveu a triagem 006 (author ≠ verifier), auditou toda a superfície nova/reescrita daquela run: `settings-shell/{spec,tasks}.md` inteira, as 7 tasks novas (`multi-terminal/T16`, `agent-selection/T5`, `task-kanban/T7-T8`, `terminal-statuses/T5`, `settings-shell/T1-T2`), as 3 tabelas de rastreabilidade reescritas (`release-distribution`, `task-kanban`, `terminal-statuses`), as ADs novas de `STATE.md`, as linhas novas de `ROADMAP.md` e `AGENTS.md` inteiro.

**Resultado: ~40 afirmações verificáveis conferidas ponto a ponto (assinaturas de função reais, contagens de teste rodadas de novo, linhas exatas de `release.yml`, commits e runs reais do GitHub Actions, a API `getCurrentWebviewWindow()` do `@tauri-apps/api` v2.11.1) — nenhuma divergiu.** Isso inclui os achados de maior risco da 006 (payload vazio de `emit_task_changed` batendo exatamente com o consumo de `useTaskStore.ts`; `pty_spawn`/`TerminalMetaService::set_title` com as assinaturas exatas citadas). 3 divergências reais, nenhuma ALTA:

| # | Afirmação da 006 (verbatim) | Onde | O que a verificação mostra | Evidência | Gravidade | Corrigido? |
|---|---|---|---|---|---|---|
| 1 | "Rust build \| `cargo build` (add `--workspace` to include `crates/swarmdeck-mcp`)" | `AGENTS.md` | Falso: o workspace não define `default-members`, então `cargo build` sem flag já compila os dois membros — `--workspace` é redundante, não necessário | `cargo metadata --format-version 1` → `workspace_default_members` já lista os dois crates; build sem flag compila `swarmdeck-mcp` também | MÉDIA | ✅ `AGENTS.md` reescrito |
| 2 | Bullets "CRUD de projeto / Detecção automática / Contagem de tarefas" ficaram embaixo do parágrafo novo "Janela de Configurações" | `ROADMAP.md:46-49` | A 006 inseriu o parágrafo de `settings-shell` entre o parágrafo de "Projetos" e a lista de bullets dele, sem mover a lista — dava a entender que `settings-shell` entrega CRUD de projeto, o que `settings-shell/spec.md` explicitamente nega ("Fora de escopo: redesenhar qualquer painel") | `grep -n` das linhas confirma a ordem trocada | MÉDIA | ✅ bullets movidos de volta para debaixo de "Projetos"; adicionada frase explícita "não redesenha nenhum dos 4 painéis" no parágrafo de `settings-shell` para não repetir a ambiguidade |
| 3 | "`grep -rln \"AgentPanel\\|ProjectsPanel\" src` só acha os próprios arquivos + menções em comentário" | `STATE.md` (AD "Settings inteiro é inatingível") | Impreciso: `NewTerminalDialog.tsx:4` tem um `import type` real (não comentário) do tipo `AgentDescriptor` — só não monta o componente. A conclusão (painel inatingível) continua correta | `grep -n "AgentPanel" src/components/terminal/NewTerminalDialog.tsx` → linha 4, `import type` | BAIXA | ✅ descrição corrigida em `STATE.md`, mantendo a conclusão |

---

## Inventário (Fase 2)

**Sem mudança em relação à triagem 006.** Esta run não encontrou nenhum item novo `code`/`uat-agent`/`needs-decision`/`human-only`/`moot`/`blocked` — as 3 divergências acima eram erros de redação da própria 006, corrigidos aqui, não itens de trabalho novos. O inventário executável continua sendo o de `.specs/runs/006-2026-08-02/TRIAGE.md` → **12 tasks `code` prontas para a `spec-loop`**, inalteradas por esta verificação.

---

## Decisões do usuário (Fase 3)

Nenhuma pergunta nova — as 3 divergências encontradas eram correção de bookkeeping (comando de gate impreciso, ordem de parágrafo, descrição de `grep` incompleta), sem ambiguidade de produto nem opção que só o usuário pudesse escolher.

---

## Fora da execução

Nada novo além do que a 006 já registrou (`release-distribution/T5, T19` `human-only`; reconciliação `T5-T12,T19` contra o release real fora do orçamento; `EXECUTION.md` não recontado; `STAT-08` sem task ainda; 6 features Draft).

---

## Não verificado

Nada novo. Os itens "não verificado" da 006 (bytes do binário com/sem perfil; execução futura do GitHub Actions; threshold de cor do catálogo de status) continuam sem prova — esta run não tentou fechá-los, só verificou a documentação que a 006 escreveu.
