# Projects — Validação independente

**Result**: PASS (iteração 2, 19/08/2026 — a iteração 1 reprovou; o registro
dela fica preservado abaixo, junto com os débitos que sobrevivem ao PASS).

**Spec**: `.specs/features/projects/spec.md`
**Verificador**: agente independente (não escreveu nenhuma linha desta implementação)
**Data**: 2026-08-19
**Escopo**: P1 (AC1..AC19), P2 (AC1..AC12), P3 (AC1..AC6) + edge cases.
PROJ-01..PROJ-09 são baseline reconstruída de run anterior — verificados apenas
onde a spec os marca como **Revisado**/**Estendido** (PROJ-01 AC7 e PROJ-09).

**Regra aplicada**: evidência é `file:line` concreto (fonte e/ou teste).
Sem evidência = 0, por mais plausível que pareça o código.

---

## 1. Gates executados

Os três rodaram nesta máquina, nesta cópia de trabalho. Saída real:

| Gate | Comando | Resultado |
| ---- | ------- | --------- |
| Build | `npm run build` | **exit 0** — `tsc --noEmit` limpo, `vite build` com 1861 módulos, `dist/assets/index-DO6nHa71.js` 656,57 kB (aviso pré-existente de chunk > 500 kB, não é erro) |
| Testes do cliente | `npm test` | **exit 0** — **35 arquivos, 375 testes, 375 passando, 0 falhando**, 14,95 s |
| Testes do Rust | `cargo test --manifest-path src-tauri/Cargo.toml` | **exit 0** — **212 unitários + 85 de integração distribuídos em 15 binários, 0 falhas, 0 ignorados** |

Ruído observado, sem efeito no resultado: `npm test` imprime um aviso
`An update to App inside a test was not wrapped in act(...)`. Não derruba
nenhum teste, mas é um efeito assíncrono não aguardado em `App.test.tsx` —
fonte clássica de flake futuro.

---

## 2. Critérios de aceite — P1

| ID | Evidência (`file:line`) | Veredito |
| -- | ----------------------- | -------- |
| P1 AC1 | `src/App.tsx:671-676` (`handleNewTerminalDraft`, cria `draft: true` sem `pty_spawn`); gatilhos: `src/App.tsx:1068` (ícone do header), `src/App.tsx:717` (CTA do EmptyState), `src/App.tsx:482` (Ctrl+T). Teste: `src/App.test.tsx:1618-1626` | **PASS** (ver Defeito #4) |
| P1 AC2 | `src/components/terminal/ProjectStep.tsx:144-158` (quadrado colorido com inicial, nome, `truncatePath`, `formatAge`), ordenação em `:45-48` via `sortByLastUsed` (`src/routes/settings/ProjectsPanel.tsx:41-48`). Testes: `src/components/terminal/ProjectStep.test.tsx:54`, `:60` | **PASS** |
| P1 AC3 | `src/components/terminal/ProjectStep.tsx:134-136` (`{visible} / {total} projects`). Testes: `ProjectStep.test.tsx:74`, `:80` | **PASS** |
| P1 AC4 | `src/components/terminal/ProjectStep.tsx:125-132` + `src/routes/settings/ProjectsPanel.tsx:51-57` (`toLowerCase` nos dois lados). Testes: `ProjectStep.test.tsx:87`, `:93` | **PASS** |
| P1 AC5 | `src/components/terminal/PaneWizard.tsx:164-176` (troca de etapa), `src/components/terminal/AgentStep.tsx:101-112` (cartão nome/caminho/cor), `:96-98` (Voltar). Testes: `AgentStep.test.tsx:83`, `PaneWizard.test.tsx:57` | **PASS** |
| P1 AC6 | `src/components/terminal/PaneWizard.tsx:76` (`query` é estado do pai) + `:172` (`onBack` só limpa `selection`). Teste: `PaneWizard.test.tsx:57` | **PASS** |
| P1 AC7 | `src/components/terminal/AgentStep.tsx:114-131` (ordem recebida, `aria-pressed`, `disabled={!installed}`); pré-seleção em `PaneWizard.tsx:78`; catálogo de 5 em `src-tauri/src/agents/catalog.rs:57,66,75,84,93`. Testes: `AgentStep.test.tsx:35`, `:53` | **PASS** (ver Defeito #3) |
| P1 AC8 | `src/App.tsx:682-694` (`handleWizardConfirm` limpa `draft` e fixa `cwd`), `src/App.tsx:797-807` (ternário rascunho/`TerminalPane`). Teste: `src/App.test.tsx:1653-1666` | **PASS** |
| P1 AC9 | `src/App.tsx:695` (`invoke('project_touch', { id: projectId })` só quando `projectId !== null`); comando em `src-tauri/src/commands/projects.rs:79-83`; serviço em `src-tauri/src/projects/service.rs:337-345`. Testes: `src/App.test.tsx:1670-1673`, `src-tauri/tests/projects.rs:264`, `service.rs:647` | **PASS** |
| P1 AC10 | `src/App.tsx:340-341` (dentro de `applyWorkspace`); comando `src-tauri/src/commands/projects.rs:87-91`; núcleo `service.rs:358-375`. Testes: `src/App.test.tsx:1237-1247`, `src-tauri/tests/projects.rs:300` | **PASS** |
| P1 AC11 | `src/lib/relativeTime.ts:17-28` (todas as sete faixas + `nunca`). Testes: `src/lib/relativeTime.test.ts:18,22,27,32,37,42,47,52,57` (limites inferior e superior de cada faixa) | **PASS** |
| P1 AC12 | `src/state/terminals.ts:129-131` (`.filter((t) => !t.draft)` em `toLayoutEntries`) consumido por `src/App.tsx:425`. Testes: `src/state/terminals.test.ts:127-135`, `src/App.test.tsx:1261-1274` | **PASS** |
| P1 AC13 | `src/App.tsx:805` (`onCancel` do wizard → `handleCloseTerminal`), `src/App.tsx:644-663` (remove da lista, sem IPC). Teste: `src/App.test.tsx:1628-1640` (`expect(invokeMock).not.toHaveBeenCalledWith('pty_kill', ...)`) | **PASS** |
| P1 AC14 | `src/App.tsx:672` (guarda `terminals.length >= MAX_TERMINALS`), `src/App.tsx:1070` (`atMaxTerminals`). Teste: `src/App.test.tsx:1598-1614` | **PASS** |
| P1 AC15 | **Nenhuma.** `PaneWizard.selectProject` (`src/components/terminal/PaneWizard.tsx:100-108`) não checa existência de caminho; nada no wizard chama `project_touch` nem `require_existing_dir` antes de avançar. O único `project_touch` está em `src/App.tsx:695`, **depois** da confirmação, com o erro engolido por `.catch(() => {})`. A capacidade existe no backend (`service.rs:339` chama `require_existing_dir`, `:409-416` devolve `PathNotFound`) e **não é usada por este caminho** | **FAIL** |
| P1 AC16 | `src-tauri/src/commands/terminal.rs:98-106` (`kill_and_touch`), `src-tauri/src/terminal/manager.rs:186-190` (`kill` devolve o `cwd`). Testes: `src-tauri/tests/manager.rs:258`, `:288` (subpasta), `:187` | **PASS** |
| P1 AC17 | `src-tauri/src/lib.rs:184-197` (`RunEvent::Exit` → `manager.list()` → `touch_from_cwds`). Núcleo testado em `service.rs:722`, `:749` (dedup). **Sem teste do fecho em si** — nenhum teste monta o app Tauri | **PASS** (fraco — ver Defeito #2) |
| P1 AC18 | `src/App.tsx:644-663` — o caminho de fechamento do rascunho não emite IPC nenhum, e o `project_touch` mora só em `handleWizardConfirm` (`:695`). Teste: `src/App.test.tsx:1628-1640` | **PASS** |
| P1 AC19 | `src-tauri/src/lib.rs:195` (`let _ = ...touch_from_cwds(...)`). Comportamento análogo testado em `src-tauri/tests/manager.rs:353` (`pty_kill` com banco derrubado ainda devolve Ok). **Sem teste do fecho de saída** | **PASS** (fraco — ver Defeito #2) |

---

## 3. Critérios de aceite — P2

| ID | Evidência (`file:line`) | Veredito |
| -- | ----------------------- | -------- |
| P2 AC1 | `src/components/terminal/PaneWizard.tsx:110-118` (`project_sandbox_dir`, `id: null`); comando em `src-tauri/src/commands/projects.rs:125-130`; criação em `src-tauri/src/projects/sandbox.rs:41-49`. Testes: `PaneWizard.test.tsx:85`, `sandbox.rs:61` (`creates_sandbox_dir_when_absent`), `:73` (idempotente) | **PASS** |
| P2 AC2 | `src-tauri/src/projects/sandbox.rs:91` (`never_registers_a_project_row`); `ProjectStep` só conta o que `project_list` devolveu (`ProjectStep.tsx:135`), e a sandbox nunca é linha; `service.rs:789` (`touch_from_cwds_com_a_pasta_sandbox_devolve_zero`) | **PASS** |
| P2 AC3 | `src/App.tsx:695` (`projectId === null` não toca nada). Teste: `src/App.test.tsx:1678-1687` | **PASS** |
| P2 AC4 | `src/components/terminal/PaneWizard.tsx:120-144` + `lastSegment` em `:32-35`; comando `project_create` em `src-tauri/src/commands/projects.rs:26-33`. Testes: `PaneWizard.test.tsx:104`, `src-tauri/tests/projects.rs:492` | **PASS** |
| P2 AC5 | `src/components/terminal/PaneWizard.tsx:127-131` + `samePath` em `:39-42` (normaliza separador e caixa). Teste: `PaneWizard.test.tsx:136` | **PASS** |
| P2 AC6 | `src/components/project/ProjectFormModal.tsx:127-175` (nome, diretório-base + botão, 8 swatches de `PALETTE:13-22`, checkbox de git). Teste: `ProjectFormModal.test.tsx:35` | **PASS** |
| P2 AC7 | `src-tauri/src/projects/service.rs:174-238` (`create_with_options`: `join(name)`, `fs::create_dir`, INSERT com `target_str`); comando `commands/projects.rs:108-118`; wizard `PaneWizard.tsx:146-162`. Testes: `src-tauri/tests/projects.rs:358`, `PaneWizard.test.tsx:151` | **PASS** |
| P2 AC8 | `src-tauri/src/projects/service.rs:208-217` (`run_git_init` roda dentro do fecho, **antes** do `INSERT`). Testes: `service.rs:625` (`git_init_cria_ponto_git`), `src-tauri/tests/projects.rs:387` | **PASS** |
| P2 AC9 | `src/components/project/ProjectFormModal.tsx:73-77` (`if (name.trim() === '') return`, sem `onSubmit` e sem fechar); backend `service.rs` `require_name`. Testes: `ProjectFormModal.test.tsx:56`, `src-tauri/tests/projects.rs:409` (`...sem_criar_pasta`) | **PASS** |
| P2 AC10 | `src-tauri/src/projects/service.rs:188-195` (`PathAlreadyUsed { existing_name }` **antes** de `fs::create_dir`); mensagem exibida sem fechar o form em `PaneWizard.tsx:158-161` + `:203`. Testes: `src-tauri/tests/projects.rs:436`, `PaneWizard.test.tsx:224` | **PASS** |
| P2 AC11 | `src-tauri/src/projects/service.rs:219-231` (fecho + `fs::remove_dir_all` no `Err`), `run_git_init` em `:494-499` (spawn ausente → `Io`, saída não-zero → `GitInitFailed`). Testes: `service.rs:834` (`falha_depois_de_criar_a_pasta_remove_a_pasta_e_propaga_o_erro`), `:854` (retentar com o mesmo nome funciona) | **PASS** (ver Defeito #5) |
| P2 AC12 | `src-tauri/src/projects/service.rs:479-489` (`validate_explicit_color` só checa pertencer à paleta). Testes: `service.rs:584` (`nove_projetos_com_a_mesma_cor_explicita_sao_criados`), `:605` (cor fora da paleta ainda recusa) | **PASS** |

---

## 4. Critérios de aceite — P3

| ID | Evidência (`file:line`) | Veredito |
| -- | ----------------------- | -------- |
| P3 AC1 | `src/routes/settings/ProjectsPanel.tsx:103-123` (cor, nome, `truncatePath`, botão de editar — nenhuma contagem); `ProjectRow` sem `taskCount` em `:6-12`. Teste: `ProjectsPanel.test.tsx:88` | **PASS** |
| P3 AC2 | `src/routes/settings/SettingsShell.tsx:571-575` (`onCreate` → `setProjectForm({ mode: 'create' })`) + `:620-624` (mesmo `ProjectFormModal` de PROJ-18). Teste: `SettingsShell.test.tsx:376` | **PASS** |
| P3 AC3 | `src/routes/settings/SettingsShell.tsx:167` (`await loadProjects()`) e `:134-145` (relê `project_list`). Teste: `SettingsShell.test.tsx:376` | **PASS** |
| P3 AC4 | `src/components/project/ProjectFormModal.tsx:58-60` (semente do `project`), `:137` e `:166` (`creating &&` esconde caminho e git). Teste: `ProjectFormModal.test.tsx:44` | **PASS** |
| P3 AC5 | `src/routes/settings/SettingsShell.tsx:160-167` (`project_update` só com `id`, `name`, `color`, depois `loadProjects`). Teste: `SettingsShell.test.tsx:405` | **PASS** |
| P3 AC6 | `src/components/project/ProjectFormModal.tsx:75` (mesma guarda dos dois modos). Teste: `ProjectFormModal.test.tsx:56` | **PASS** |

---

## 5. Edge cases da spec

| Edge case | Evidência | Veredito |
| --------- | --------- | -------- |
| `project_list` vazio → "0 / 0 projects" com os 3 botões ativos | `ProjectStep.test.tsx:108` | PASS |
| Nenhum agente no PATH → "Nova sessão" habilitada, shell puro | `AgentStep.tsx:134-138` (sem `disabled`); `AgentStep.test.tsx:91` | PASS |
| Fechar a aba inteira com um rascunho dentro, sem `pty_kill` | `src/App.test.tsx:1642-1652` | PASS |
| Terminal "No Project" encerrado não grava nada | `src-tauri/tests/manager.rs:320` | PASS |
| `cwd` sem projeto casado não grava nada | `service.rs:771`; `src-tauri/tests/projects.rs:332` | PASS |
| Encerrar com dois terminais no mesmo projeto grava uma vez | `service.rs:749` (`...grava_uma_vez_so`); dedup em `service.rs:358-375` | PASS |
| Caminho longo truncado com `title` completo | `ProjectStep.tsx:152-154`; `ProjectStep.test.tsx:118` | PASS |
| Diretório-base sumiu no momento da confirmação | `service.rs:182` (`require_existing_dir`); `src-tauri/tests/projects.rs:468` | PASS |

---

## 6. Verificação das reivindicações específicas

| Reivindicação | Confirmada? | Evidência |
| ------------- | ----------- | --------- |
| Rascunhos excluídos da persistência (`toLayoutEntries`) | **Sim** | `src/state/terminals.ts:129-131`; consumido em `src/App.tsx:425`; testes `terminals.test.ts:127`, `App.test.tsx:1261` |
| Os três gatilhos criam rascunho e nunca chamam `pty_spawn` | **Sim, com ressalva metodológica** | `src/App.tsx:671-676`, `:482`, `:717`, `:1068`; o rascunho não monta `TerminalPane` (`:797-807`). O teste `App.test.tsx:1616-1626` afirma sobre um **dublê** de `TerminalPane` (`App.test.tsx:63-108`) que chama `pty_spawn` no mount espelhando `TerminalPane.tsx:102`. Ou seja: o teste prova que `App` não renderiza o painel, não que o componente real não spawna. A inferência se sustenta porque `TerminalPane` não foi alterado nesta feature, mas ela é indireta e vale registrar |
| `TerminalHeader` em rascunho esconde captura/clone/reset/minimizar e mantém fechar | **Sim** | `TerminalHeader.tsx:226` (captura), `:252` (minimizar), `:262` (clonar), `:273` (reiniciar) — todos sob `{!draft && (`; fechar em `:283-289`, fora de qualquer guarda. Testes: `TerminalHeader.test.tsx:234`, `:244`, `:253` (paridade quando `draft={false}`) |
| `project_touch` só com projeto selecionado; `project_touch_cwds` na restauração | **Sim** | `src/App.tsx:695` (`if (projectId !== null)`) e `src/App.tsx:341` (`if (cwds.length > 0)`, dentro de `applyWorkspace`). Testes: `App.test.tsx:1670`, `:1678` ("No Project" não toca), `:1237`, `:1256` ("Começar do zero" não toca) |
| `NewTerminalDialog.tsx` e seu teste sumiram e ninguém os importa | **Sim** | `git status`: `D src/components/terminal/NewTerminalDialog.tsx`, `D src/components/terminal/NewTerminalDialog.test.tsx`. `grep -rn "NewTerminalDialog" src/` → zero ocorrências. Restam 3 menções **em prosa** no Rust, todas obsoletas: `src-tauri/Cargo.toml:52`, `src-tauri/src/commands/agents.rs:9`, `src-tauri/src/lib.rs:108` (ver Defeito #6) |
| Todo arquivo tocado carrega marcador `SPEC:` com feature `projects` e IDs reais | **Sim** | Topo de arquivo: `App.tsx:1`, `App.test.tsx:1`, `state/terminals.ts:1`, `terminals.test.ts:1`, `TerminalHeader.tsx:1`, `TerminalHeader.test.tsx:1`, `ProjectStep.tsx:1`, `AgentStep.tsx:1`, `PaneWizard.tsx:1`, `ProjectFormModal.tsx:1`, `relativeTime.ts:1`, `ProjectsPanel.tsx:1`, `SettingsShell.tsx:1`, `EmptyState.tsx:1`, `commands/projects.rs:1`, `commands/terminal.rs:1`, `projects/service.rs:1`, `terminal/manager.rs:1`, `tests/manager.rs:1`, `tests/projects.rs:1` (+ os `.test` correspondentes). Marcador **localizado** em `src-tauri/src/lib.rs:172`, conforme a exceção de arquivo compartilhado da regra `spec-driven-changes.md` §3. Todos os IDs citados (PROJ-01, 02, 05, 09..20) existem na spec — nenhum inventado. Três arquivos tocados **sem** marcador `projects` (`RestoreSessionDialog.tsx`, `EditorMenu.tsx`, `QuotaIndicator.test.tsx`) tiveram edição **só de comentário** (troca da referência textual `NewTerminalDialog` → `PaneWizard`), verificada por `git diff`: não implementam requisito, então a ausência está correta pela regra |

---

## 7. Lacunas e defeitos, por severidade

### #1 — ALTA — P1 AC15 não implementado, e o teste que o reivindica cobre outra coisa

O critério pede: projeto cujo caminho sumiu do disco → wizard **fica** na etapa
PROJECT e **mostra o caminho ausente**. O que existe:

- `PaneWizard.selectProject` (`src/components/terminal/PaneWizard.tsx:100-108`)
  avança para AGENT sem verificar nada.
- A única checagem de existência (`service.rs:339` → `PathNotFound`) só corre em
  `project_touch`, chamado em `src/App.tsx:695` **depois** de o painel já ter
  virado terminal vivo — e o erro é descartado por `.catch(() => {})`.

Consequência observável: escolher um projeto com a pasta apagada avança a etapa,
sobe o terminal num `cwd` inexistente e não mostra erro nenhum.

Agravante: o teste `PaneWizard.test.tsx:194` se intitula
`falha de project_list mantém a etapa PROJECT e exibe a mensagem (P1 AC15)`.
Ele rejeita `project_list`, não o caminho de um projeto selecionado. A
rastreabilidade afirma cobertura que não existe — pior que ausência de teste,
porque desliga o alarme.

### #2 — MÉDIA — o gancho de encerramento (P1 AC17, AC19) não tem teste nenhum

`src-tauri/src/lib.rs:184-197` é o código do requisito, e nenhuma suíte o
executa: nem os 212 unitários nem os binários de integração montam o app Tauri.
O que está testado é o **núcleo** (`touch_from_cwds`, `service.rs:722`, `:749`)
e a leitura de `cwd` (`manager.list()`). O fio entre `RunEvent::Exit`,
`handle.state::<TerminalManager>()` e `handle.state::<Mutex<Db>>()` é
verificado só por leitura. Se alguém trocar `RunEvent::Exit` por outro evento,
ou o `.build(...)` voltar para `.run(generate_context!())`, os três gates
continuam verdes. O próprio design (`design.md:197`) previu um recuo
(`on_window_event`) — não há como saber por teste qual dos dois está ativo.

O `expect("erro ao iniciar o SwarmDeck")` em `lib.rs:170` também troca a
propagação de erro do `?` por panic; é mudança de comportamento de arranque
introduzida por esta task, não prevista no design (que falava em `.build(...)?`).

### #3 — BAIXA — o agente padrão pode não ser pré-selecionado numa corrida de arranque

`PaneWizard.tsx:78` faz `useState(defaultAgentId)` — leitura única no mount. O
`agent_default` é buscado em `src/App.tsx:460-462` de forma assíncrona. Um
rascunho aberto (Ctrl+T no estado vazio, que é justamente a tela do boot) antes
de a IPC resolver nasce com `selectedAgentId: null` e nunca se corrige, porque
não há `useEffect` sincronizando a prop. P1 AC7 exige pré-selecionar o padrão
efetivo. Nenhum teste cobre essa ordem de chegada.

### #4 — BAIXA — Ctrl+T só existe no estado vazio

`src/App.tsx:476-481` só registra o atalho quando `terminals.length === 0`. P1
AC1 fala em "qualquer um dos três gatilhos" sem qualificar. É comportamento
**pré-existente** (EMPTY-07/EMPTY-08, citado no próprio comentário do código) e
não uma regressão desta feature, mas o texto do AC1 e o código não descrevem a
mesma coisa. Vale alinhar um dos dois.

### #5 — BAIXA — o ramo "git init falhou" de P2 AC11 é coberto por analogia, não diretamente

`service.rs:834` prova a remoção da pasta órfã forçando o **INSERT** a falhar
(trigger `RAISE(ABORT)`), com `git_init: true` para garantir remoção recursiva.
O fecho de `service.rs:219-231` é o mesmo para as duas falhas, então a inferência
é razoável — mas nenhum teste faz `run_git_init` retornar
`GitInitFailed`/`Io`. O caminho literal do AC ("`git` fora do PATH ou saída
não-zero") nunca é executado.

### #6 — INFORMATIVA — referências obsoletas a `NewTerminalDialog` no Rust

`src-tauri/Cargo.toml:52`, `src-tauri/src/commands/agents.rs:9` e
`src-tauri/src/lib.rs:108` ainda justificam dependências e comandos citando um
componente que não existe mais. Não são marcadores `SPEC:`, então não violam a
regra §3 ao pé da letra, mas são documentação que descreve um app que já não é
este — exatamente o que `AGENTS.md` manda evitar. Os três equivalentes no
cliente foram atualizados; os do Rust ficaram para trás.

### #7 — INFORMATIVA — aviso de `act(...)` em `App.test.tsx`

`npm test` passa, mas imprime `An update to App inside a test was not wrapped in
act(...)`. Atualização de estado assíncrona não aguardada; hoje é ruído, amanhã
é flake.

---

## 8. Placar e veredito

| Bloco | Critérios | PASS | FAIL |
| ----- | --------- | ---- | ---- |
| P1 | 19 | 18 | 1 (AC15) |
| P2 | 12 | 12 | 0 |
| P3 | 6 | 6 | 0 |
| Edge cases | 8 | 8 | 0 |
| **Total (ACs)** | **37** | **36** | **1** |

Gates: 3/3 verdes com números reais (375 testes de cliente, 297 de Rust, build
limpo).

## Veredito final: **FAIL**

Um critério de aceite — **P1 AC15** — não tem implementação, e o teste que o
declara coberto exercita um cenário diferente do que o critério descreve. A
regra evidência-ou-zero não admite crédito por capacidade existente no backend
que nenhum caminho de execução aciona.

O resto da feature está sólido: 36 de 37 critérios com evidência concreta,
rastreabilidade `SPEC:` correta e consistente (inclusive na exceção de arquivo
compartilhado do `lib.rs`), `NewTerminalDialog` removido de fato, e cobertura
de teste real — não sobre dublês — nos componentes do wizard, no `ProjectsPanel`
e nas quatro escritas de `last_used` que rodam em processo testável.

**Para virar PASS:** implementar P1 AC15 (checar a existência do caminho antes
de sair da etapa PROJECT, propagando o caminho ausente para a mensagem) e
corrigir o título/cenário do teste em `PaneWizard.test.tsx:194`, que hoje
promete AC15 e entrega outra coisa. O Defeito #2 (gancho de encerramento sem
teste) não bloqueia o veredito, mas deveria ser fechado antes do ship — é a
única parte da feature que os três gates não conseguem enxergar.

---

# Iteração 2 — verificação do passe de correção

**Verificador**: agente independente (iteração 2; não escreveu nenhuma linha
desta implementação nem do passe de correção).
**Data**: 2026-08-19
**Escopo**: só o que o passe de correção mexeu — Defeito #1 (P1 AC15),
Defeito #3 (agente padrão), Defeito #6 (referências obsoletas) — mais os três
gates e uma varredura de regressão. O registro da Iteração 1 acima fica intacto.

## I2.1 — Gates reexecutados (números reais desta cópia de trabalho)

| Gate | Comando | Resultado |
| ---- | ------- | --------- |
| Build | `npm run build` | **exit 0** — `tsc --noEmit` limpo; `vite build` com **1861 módulos**, `dist/assets/index-_b1lz4_J.js` **656,62 kB** (gzip 177,92 kB), construído em 3,41 s. Único aviso: chunk > 500 kB, pré-existente |
| Testes do cliente | `npm test` | **exit 0** — **35 arquivos, 376 testes, 376 passando, 0 falhando**, 13,65 s (eram 375 na Iteração 1; **+1** = o teste novo de AC15) |
| Testes do Rust | `cargo test --manifest-path src-tauri/Cargo.toml` | **exit 0** — **297 testes somados em 15 binários (212 unitários + 85 de integração), 0 falhas, 0 ignorados** — idêntico à Iteração 1 |

Ruído inalterado: `npm test` continua imprimindo
`An update to App inside a test was not wrapped in act(...)`
(Defeito #7 da Iteração 1 — segue aberto, não foi alvo do passe).

## I2.2 — Defeito #1 (ALTA) — P1 AC15 → **CORRIGIDO**

Verificado ponto a ponto, com `file:line`:

| Reivindicação | Evidência | Confere? |
| ------------- | --------- | -------- |
| A seleção passa por `project_touch` | `src/components/terminal/PaneWizard.tsx:113` — `await invoke('project_touch', { id: project.id })` dentro de `selectProject` (`:111-125`), acionada por `ProjectStep` em `:201` | **Sim** |
| O wizard **aguarda** o touch antes de avançar | `PaneWizard.tsx:113` é `await`; o `setSelection` que troca a etapa só roda em `:119-124`, depois do `await`. O `catch` (`:114-117`) faz `return` **antes** do `setSelection` — não há caminho que avance com o touch falho | **Sim** |
| O caminho de erro renderiza a mensagem e fica na etapa PROJECT | `PaneWizard.tsx:115` (`setError(String(err))`) → `:209` (`error={error}` para `ProjectStep`); como `selection` continua `null`, o ternário de `:181` não é tomado e a etapa PROJECT permanece montada | **Sim** |
| O backend valida o caminho e devolve o caminho ausente | `src-tauri/src/projects/service.rs:339` (`require_existing_dir` **antes** do `UPDATE`), `:409-416` (`PathNotFound`), `:80-82` (`Display` → `directory does not exist: {path}`). Comando: `src-tauri/src/commands/projects.rs:79-83` | **Sim** — a mensagem que chega ao `String(err)` carrega o caminho, que é literalmente o que o AC exige |
| O `project_touch` duplicado no `App.tsx` foi removido | `grep -n "project_touch" src/App.tsx` → **só** `:341` (`project_touch_cwds`, que é AC10). `handleWizardConfirm` (`src/App.tsx:687-692`) não faz IPC nenhum; o comentário `:683-686` registra o porquê | **Sim** — um projeto é tocado exatamente uma vez por fluxo |
| O teste mal-rotulado foi corrigido | `src/components/terminal/PaneWizard.test.tsx:210` agora se chama `falha de project_list mantém a etapa PROJECT e exibe a mensagem` — sem o `(P1 AC15)` que prometia o que não entregava | **Sim** |
| Existe um teste real de AC15 | `PaneWizard.test.tsx:226-245` — rejeita **`project_touch`** com `diretório não encontrado: /home/user/dev/alpha`, e afirma: alerta com o caminho (`:239`), etapa PROJECT presente (`:240`), etapa AGENT **ausente** (`:241`), `onConfirm` nunca chamado (`:242`), projeto ainda listado (`:244`) | **Sim** — cobre os dois SHALLs do AC |
| Cobertura no Rust | `src-tauri/src/projects/service.rs:679-699` (`touch_last_used_com_path_ausente_no_disco_nao_grava_nada`) — casa `PathNotFound(path)` com o caminho e reconfere que `last_used` continua `None` | **Sim** |

### P1 AC9 sob a relocação — **continua satisfeito**

O AC9 é `WHEN ... convertido em terminal vivo com um projeto selecionado THEN
... SHALL gravar`. Toda conversão com projeto é agora **precedida** de um
`project_touch` bem-sucedido (não há caminho para a etapa AGENT sem ele), logo
a pós-condição vale no instante da conversão. Prova de ponta a ponta, não sobre
dublê do wizard: `src/App.test.tsx:1668-1673` — abre o rascunho, importa a
pasta, confirma, e afirma `project_touch` chamado **exatamente uma vez** com
`{ id: 'proj-/home/user/alvo' }`. `src/App.test.tsx:1684` mantém "No Project"
sem tocar nada (P2 AC3).

### Efeitos colaterais da relocação — analisados, nenhum quebra AC

Registro explícito, como pedido:

- **Selecionar e depois cancelar grava uso sem terminal aberto.** Verdadeiro:
  `PaneWizard.tsx:113` escreve, e `Voltar` (`:189`) ou fechar o painel
  (`src/App.tsx:644-663`, sem IPC) não desfazem nada. **P1 AC18 continua
  literalmente satisfeito** — ele proíbe gravar *quando o rascunho é fechado*,
  e o fechamento segue sem IPC (`src/App.test.tsx:1626-1640` prova). Mas a
  *intenção* ("um rascunho que nunca virou terminal não deixa rastro") passa a
  ser burlável pela sequência selecionar → Voltar → fechar. É desvio de
  intenção, não de critério: não rebaixo o veredito por isso, mas fica
  registrado.
- **Voltar e escolher outro projeto toca os dois.** Mesma origem. O efeito é só
  ruído na ordenação de recentes, da mesma natureza do empate já aceito em
  AD-020.
- **Nenhum outro AC é atingido.** AC8 (`src/App.tsx:687-692`), AC12, AC13,
  AC14, AC16, AC17, AC19 e P2 AC1..AC12 não dependem de onde o touch mora.

**Pendência documental desta relocação** (não bloqueia o veredito, mas é dívida
da regra `spec-driven-changes.md` §4/§5): três artefatos ainda descrevem o
desenho antigo — `.specs/STATE.md:178` (AD-020 diz "`project_touch` na
confirmação do wizard"), `.specs/features/projects/design.md:49`
(`Wizard: Nova sessão --> project_touch(id)`) e
`.specs/features/projects/tasks.md:622,636` (T22 descreve o handler que
"chama `project_touch` quando há projeto"). Curiosamente o próprio
`design.md:254` **já previa** o desenho novo — a linha de edge case diz
"`project_touch` chama `require_existing_dir` ... `PaneWizard` fica na etapa 1".
O código agora concorda com `design.md:254` e contradiz `design.md:49`.

## I2.3 — Defeito #3 (BAIXA) — agente padrão que chega atrasado → **CORRIGIDO**

`src/components/terminal/PaneWizard.tsx:81-82` — o `defaultAgentId` deixou de
ser semente de estado e virou *fallback derivado*, lido a cada render:
`chosenAgentId` nasce `null` e `selectedAgentId = chosenAgentId ?? defaultAgentId`.
O valor derivado é consumido em `:186` e `:190`. Um `defaultAgentId` que chega
depois do mount agora reflete na próxima renderização, sem `useEffect` de
sincronia; o comentário `:78-80` registra o motivo. A escolha explícita do
usuário continua vencendo o padrão, porque `chosenAgentId` só sai de `null` no
`onSelectAgent` (`AgentStep.tsx:124`).

Ressalva honesta: **não há teste da corrida** (rerender com `defaultAgentId`
mudando de `null` para um id). O defeito passou de "bug latente" para "correto
por construção" — não existe mais estado que possa envelhecer —, mas a
cobertura de AC7 segue sendo a de antes (`AgentStep.test.tsx:35`, `:53`;
`PaneWizard.test.tsx:41`, com o padrão já presente no mount).

## I2.4 — Defeito #6 (INFORMATIVA) — referências obsoletas → **PARCIAL**

**O que ficou certo:**

- Os três comentários em prosa foram reescritos, verificado por `git diff`:
  `src-tauri/Cargo.toml:51-52` (`NewTerminalDialog (T15)` → "wizard do painel
  (`PaneWizard`) e ... formulário de projeto"), `src-tauri/src/commands/agents.rs:9`
  (`NewTerminalDialog (T4)` → "a etapa AGENT do wizard") e
  `src-tauri/src/lib.rs:108` ("o wizard do painel").
- `grep -rn "NewTerminalDialog" src/ src-tauri/` → **zero ocorrências**.
- `grep -rn "TERM-10\|TERM-11" src/ src-tauri/src src-tauri/Cargo.toml` →
  **uma só**, em `src-tauri/src/db/migrations/005_terminal_picker_prefs.sql:1`,
  comentário histórico de migração (não é marcador `SPEC:`) descrevendo a origem
  de uma tabela que continua existindo. Aceitável.
- A revogação está registrada: `.specs/features/multi-terminal/spec.md:55-65`
  marca TERM-10 e TERM-11 como revogados por **AD-019**, com o motivo e sem
  apagar o histórico; AD-019 existe em `.specs/STATE.md:167-175`.

**O que ficou errado — o retarget não é verdadeiro em três marcadores.**

`TERM-11` foi retargetado para `projects (PROJ-17, PROJ-18)` em:

- `src-tauri/src/terminal/picker_prefs.rs:1`
- `src-tauri/src/db/mod.rs:27` (a lista de migrações, por causa da 005)
- `src-tauri/src/commands/terminal.rs:1` (pelos comandos
  `terminal_picker_last_dir` / `terminal_picker_set_last_dir`, `:121` e `:129`)

Só que **PROJ-17 e PROJ-18 não usam nada disso**. Verificado:
`grep -rn "terminal_picker" src/` devolve **apenas quatro linhas de mock em
`src/App.test.tsx` (`:150`, `:1085`, `:1167`, `:1289`)** — nenhum chamador de
produção. Os dois seletores reais chamam `open({ directory: true })` sem
`defaultPath`: `src/components/terminal/PaneWizard.tsx:138` (Import Project) e
`src/components/project/ProjectFormModal.tsx:66` (New Project). Quem consumia
`picker_prefs` era o `NewTerminalDialog`, apagado por AD-019.

Ou seja: `picker_prefs` virou **código morto** nesta feature, e os marcadores
agora afirmam que ele implementa PROJ-17/PROJ-18. É exatamente o caso que a
regra `spec-driven-changes.md` §3 chama de "marcador que mente com autoridade" —
o defeito mudou de forma (de referência obsoleta para atribuição falsa), não
desapareceu. A frase de `.specs/features/multi-terminal/spec.md:64-65` ("A
tabela e os comandos continuam existindo, **usados pelos seletores de PROJ-17 e
PROJ-18**") é falsa pelo mesmo motivo.

O retarget **é verdadeiro** nos outros dois lugares, e esses ficam validados:
`src-tauri/Cargo.toml:51` e `src-tauri/src/lib.rs:107` marcam o
`tauri-plugin-dialog`, que os dois seletores acima realmente usam.

Saída correta (uma das duas, fora do escopo desta verificação): apagar
`picker_prefs`, os dois comandos e os mocks órfãos junto com o requisito
revogado — é o que §4 pede para código que sai com a spec — **ou** manter e
declarar honestamente que são resquício de TERM-11 revogado, sem pendurá-los em
PROJ-17/PROJ-18.

## I2.5 — Varredura de regressão

| Verificação | Resultado |
| ----------- | --------- |
| Mock que engoliria `project_touch` em `PaneWizard.test.tsx` | O helper `touchOk` (`:33-34`) resolve `project_touch` **só** no caminho feliz e é aplicado explicitamente em cada `mockImplementation`. O teste de AC15 (`:228-233`) **não** o usa — rejeita `project_touch` de propósito. Não há mock que esconda a asserção |
| Mock que engoliria `project_touch` em `App.test.tsx` | `projectInvoke` (`:118-130`) não trata `project_touch` e cai no `Promise.resolve(undefined)` de `:129` — resolve, então o wizard avança e a asserção de `:1669-1673` (exatamente uma chamada, com o id certo) é real. Nenhum `catch` silencioso no caminho |
| O helper `createTerminalViaWizard` (`App.test.tsx:171-178`) sobrevive ao `await` extra | Sim — usa `findByRole`/`waitFor`; os 72 testes de `App.test.tsx` passam |
| `Voltar`/`onCancel` continuam funcionando com o `selectProject` assíncrono | `PaneWizard.test.tsx:64-81` (AC5/AC6, com asserção nova de `project_touch` em `:74`) passa |
| Erros de `project_create` / `project_create_in` / `project_sandbox_dir` ainda seguram a etapa PROJECT | `PaneWizard.test.tsx:247-265`, `:267-295`, `:297-313` passam |
| Assinatura de `onConfirm` | `PaneWizardProps.onConfirm` (`PaneWizard.tsx:48`) segue com três parâmetros e `AgentStep` entrega `selection.id` (`:190`); `App.tsx:798` só consome dois. Sem erro de tipo (`tsc --noEmit` limpo) e o terceiro argumento continua coberto por `PaneWizard.test.tsx:92`, `:113`, `:147`, `:162`, `:207`. Cosmético, não é defeito |
| Regressão nos testes Rust | Nenhuma: mesmo total de 297, 0 falhas |
| Defeito #2 (gancho de `RunEvent::Exit` sem teste) | **Inalterado** — `src-tauri/src/lib.rs:184-197` continua sem nenhuma suíte que o execute. Não era alvo deste passe |
| Defeitos #4, #5, #7 | **Inalterados** — não eram alvo deste passe e seguem como registrados na Iteração 1 |

## I2.6 — Placar atualizado

| Bloco | Critérios | PASS | FAIL |
| ----- | --------- | ---- | ---- |
| P1 | 19 | **19** | 0 |
| P2 | 12 | 12 | 0 |
| P3 | 6 | 6 | 0 |
| Edge cases | 8 | 8 | 0 |
| **Total (ACs)** | **37** | **37** | **0** |

Gates: 3/3 verdes — build limpo, 376 testes de cliente, 297 testes Rust.

## Veredito da Iteração 2: **PASS**

O único FAIL da Iteração 1 foi fechado com implementação real, não com remendo
de teste: a validação de disco entrou no caminho de execução
(`PaneWizard.tsx:111-125` aguardando `project_touch`, que chama
`require_existing_dir` em `service.rs:339`), o `project_touch` duplicado saiu do
`App.tsx`, o teste mentiroso foi renomeado e um teste honesto de AC15 nasceu
(`PaneWizard.test.tsx:226-245`), com cobertura correspondente no Rust
(`service.rs:679-699`). Os 37 critérios de aceite têm evidência concreta.

**Débitos que sobrevivem ao PASS** (nenhum é critério de aceite; todos ficam
registrados para não virarem surpresa):

1. ~~**Atribuição falsa de marcador `SPEC:`**~~ — **FECHADO** depois da
   iteração 2. Os três marcadores agora dizem a verdade
   (`TERM-11 — REVOKED by AD-019, no caller left`) em `picker_prefs.rs:1`,
   `db/mod.rs:27`, `commands/terminal.rs:1` e no registro do comando em
   `lib.rs`; `multi-terminal/spec.md` deixou de afirmar que PROJ-17/PROJ-18
   usam o `picker_prefs` e passou a registrar que é código morto conhecido,
   cuja remoção é task própria (mexe na migração 005). Os dois marcadores
   `projects (PROJ-17, PROJ-18)` que sobraram (`Cargo.toml:51`, `lib.rs:107`)
   são verdadeiros: cobrem o `tauri-plugin-dialog`, que os seletores chamam.
2. ~~**Artefatos de spec desatualizados pela relocação do touch**~~ —
   **FECHADO** depois da iteração 2. AD-020 em `.specs/STATE.md` foi reescrita
   (toque na seleção, com o novo trade-off do "selecionar e desistir grava
   uso"), o diagrama de `design.md` e a AD-020 resumida de `design.md:298`
   acompanham, e T19 em `tasks.md` ganhou um bloco `SPEC_DEVIATION` explicando
   a mudança.
3. **Defeito #2 da Iteração 1 continua aberto** — o gancho de encerramento
   (`lib.rs:184-197`, P1 AC17/AC19) é a única parte da feature que os três gates
   não enxergam.
4. **Selecionar e cancelar grava uso** — desvio de intenção de P1 AC18 descrito
   em I2.2, sem violação do texto do critério.
5. **Defeitos #4, #5 e #7 da Iteração 1** seguem como estavam.


---

## Iteração 3 — AD-024 (painel de Configurações fiel a `print/project.png`)

**Verdict: PASS** — 8 critérios novos/alterados, todos com evidência. Verificação
inline (sem sub-agente: o harness desta sessão proíbe despachar agentes sem
pedido explícito do usuário); o gate é o mesmo, `npx vitest run` + `npm run build`.

**Diff range**: árvore de trabalho, não commitada (AD-013 — quem commita é o usuário).

| AC | Evidência |
| -- | --------- |
| PROJ-19 AC1 (cor, nome, caminho truncado) | `src/routes/settings/ProjectsPanel.tsx:344-360`; teste `ProjectsPanel.test.tsx:93` |
| PROJ-19 AC2/AC3 (criar e recarregar) | `SettingsShell.tsx:170-186`; teste `SettingsShell.test.tsx:376` |
| PROJ-22 (inicial no quadrado de cor) | `ProjectsPanel.tsx:70-72` (`projectInitial`), render em `:344-351`; testes `ProjectsPanel.test.tsx:101,113` |
| PROJ-23 AC5 (contagem, especificidade de `resolve`) | `ProjectsPanel.tsx:95-118` (`countTerminalsByProject`); `SettingsShell.tsx:144-156`; testes `ProjectsPanel.test.tsx:186-201` |
| PROJ-23 AC6 (zero sem terminal) | `ProjectsPanel.tsx:341` (`?? 0`); teste `ProjectsPanel.test.tsx:105` |
| PROJ-24 AC7 (diálogo de confirmação) | `ProjectsPanel.tsx:389-419`; teste `ProjectsPanel.test.tsx:118` |
| PROJ-24 AC8 (delete + reload) | `SettingsShell.tsx:188-198`; teste `SettingsShell.test.tsx:405` |
| PROJ-24 AC9 (cancelar não exclui) | teste `ProjectsPanel.test.tsx:132` |
| PROJ-24 AC10 (travado com terminal aberto) | `ProjectsPanel.tsx:368`; testes `ProjectsPanel.test.tsx:143`, `SettingsShell.test.tsx:419` |
| PROJ-24 AC11 (erro visível, linha fica) | `ProjectsPanel.tsx:330-334`, `SettingsShell.tsx:195-197`; testes `ProjectsPanel.test.tsx:157`, `SettingsShell.test.tsx:443` |

**Gate**: `npx vitest run` → 391 testes, 35 arquivos, 0 falhas. `npm run build`
(inclui `tsc --noEmit`) → verde.

**Sensor de discriminação** (mutações mentais confirmadas pelos testes que já
existem, sem worktree separado por serem 3 pontos de lógica):

| Mutação | Morta por |
| ------- | --------- |
| `isPrefix` comparar por `startsWith` de string em vez de componente | `ProjectsPanel.test.tsx:194` (`D:\ide-old` deixaria de dar `{}`) |
| `countTerminalsByProject` ficar com o primeiro casamento em vez do mais específico | `ProjectsPanel.test.tsx:190` |
| `disabled={openTerminals > 0}` virar `disabled={false}` | `ProjectsPanel.test.tsx:143`, `SettingsShell.test.tsx:419` |
| `onDelete` disparar direto, sem o diálogo | `ProjectsPanel.test.tsx:118` |

**Dívida deixada de propósito**:

1. `project_update` (`src-tauri/src/projects/service.rs:269`, comando em
   `lib.rs:129`) perdeu o último chamador do frontend com a revogação de
   PROJ-20. Fica registrado, não removido: é API de backend testada, e apagá-la
   mexe em `lib.rs` e nos testes Rust sem que ninguém tenha pedido.
2. A contagem lê o workspace **persistido**, gravado com 500 ms de debounce por
   `App.tsx` (AD-024). Terminal aberto há menos de meio segundo ainda não conta.
3. Fidelidade visual a `print/project.png` foi verificada por leitura do CSS, não
   por screenshot do app rodando — nenhum gate automatizado cobre pixels aqui.
