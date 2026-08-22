# Feedback Form Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

Duas regras do repositório se aplicam a cada task deste arquivo:

- `.claude/rules/frontend-ui-ux-pro-max.md` — invocar `ui-ux-pro-max:ui-ux-pro-max` **antes** de editar qualquer arquivo de front, não depois.
- `.claude/rules/spec-driven-changes.md` — todo arquivo criado ou editado leva o marcador `SPEC:` no topo, com os IDs reais.

Nunca commitar (instrução global do usuário): a task termina com o gate verde e o `tasks.md` atualizado; o commit é do usuário.

---

**Spec**: `.specs/features/feedback-form/spec.md`
**Design**: não existe — nenhuma decisão de arquitetura ficou aberta. As três decisões da feature estão em `.specs/STATE.md` (AD-030, AD-031, AD-032).
**Status**: Executed

---

## Test Coverage Matrix

> Gerada do código, das regras do projeto e da spec — confirmar antes do Execute. Guidelines encontradas: `.claude/rules/spec-driven-changes.md`, `.claude/rules/frontend-ui-ux-pro-max.md`, `vite.config.ts` (bloco `test`), `.github/workflows/ci.yml`. Não há `AGENTS.md` no disco (o `CLAUDE.MD` o importa, mas o arquivo não existe) e não há limiar de cobertura configurado — para o que as regras não cobrem, valem os defaults fortes.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Utilitário puro (`src/lib/`) | unit | Todos os ramos; 1:1 com as ACs da spec; todo edge case listado tem teste | `src/lib/*.test.{ts,tsx}` | `npx vitest run src/lib` |
| Componente de UI (`src/routes/`, `src/components/`) | unit (React Testing Library) | Toda AC da story + todo edge case listado; asserção por papel acessível, não por classe CSS | `src/**/*.test.tsx` | `npx vitest run <arquivo>` |
| Config / build (`vite.config.ts`, `package.json`) | none | — (só o gate de build) | — | build gate |

## Gate Check Commands

> Extraídos de `package.json` e `.github/workflows/ci.yml` — confirmar antes do Execute. O repo não tem script de lint; o CI roda build + testes.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Depois de uma task com testes unitários só do arquivo dela | `npx vitest run <arquivo de teste da task>` |
| Full | Depois de uma task que toca código já coberto por outra suíte | `npm run test` |
| Build | Fim de fase e fim da feature | `npm run build && npm run test` |

---

## Execution Plan

Fases ordenadas e sequenciais; tarefas dentro de uma fase rodam em ordem.

### Phase 1: Markdown compartilhado

Tira o renderizador de dentro de `UpdateSettings.tsx` e o prepara para o preview do feedback, sem mudar o que a tela de Atualizações mostra hoje.

```
T1 → T2 → T3
```

### Phase 2: Painel de feedback

Constrói o formulário campo a campo, num arquivo só.

```
T4 → T5 → T6 → T7
```

### Phase 3: Ligação com Configurações

```
T8
```

---

## Task Breakdown

### T1: Extrair o renderizador de Markdown para `src/lib/markdown.tsx`

**What**: Mover `renderNotes` e `inline` de `UpdateSettings.tsx` para um módulo próprio, exportados como `renderMarkdown` e `renderInline`, com o comportamento atual **idêntico** (títulos `#`..`######`, itens `-`/`*`, parágrafos, `**forte**`, `*ênfase*`, `` `código` ``).
**Where**: `src/lib/markdown.tsx`
**Depends on**: None
**Reuses**: `src/components/settings/UpdateSettings.tsx:50-108` (o código movido), `src/lib/relativeTime.ts` (formato de módulo utilitário com teste co-locado)
**Requirement**: FEED-14

**Tools**:

- MCP: `filesystem`
- Skill: NONE (módulo sem UI)

**Done when**:

- [x] `src/lib/markdown.tsx` criado com marcador `// SPEC: feedback-form (FEED-14), silent-update (SILENT-42)`
- [x] `renderMarkdown(md: string): ReactNode[]` e `renderInline(text: string): ReactNode[]` exportados
- [x] Nenhum uso de `dangerouslySetInnerHTML`
- [x] `src/lib/markdown.test.tsx` cobre: título vira heading, item vira `listitem`, linha solta vira parágrafo, `**forte**` vira `strong`, `` `código` `` vira `code`, linha vazia fecha a lista aberta
- [x] Gate: `npx vitest run src/lib/markdown.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(markdown): extrair o renderizador de notas para src/lib`

---

### T2: Fazer `UpdateSettings` consumir o módulo extraído

**What**: Trocar as duas funções locais de `UpdateSettings.tsx` pelo import de `src/lib/markdown.tsx` e apagar as cópias, sem tocar em nenhuma asserção de teste existente.
**Where**: `src/components/settings/UpdateSettings.tsx`
**Depends on**: T1
**Reuses**: `src/lib/markdown.tsx` (T1)
**Requirement**: FEED-14

**Tools**:

- MCP: `filesystem`
- Skill: `ui-ux-pro-max:ui-ux-pro-max` (arquivo de front)

**Done when**:

- [x] `renderNotes` e `inline` não existem mais dentro de `UpdateSettings.tsx`
- [x] O marcador `SPEC:` do arquivo continua listando `silent-update`, sem IDs novos (o comportamento não mudou)
- [x] `UpdateSettings.test.tsx` passa **sem nenhuma edição de asserção** — a prova de que `SILENT-42` continua valendo (spec, seção "Impacto em specs existentes")
- [x] Gate: `npm run test`

**Tests**: unit
**Gate**: full

**Commit**: `refactor(update): usar o renderizador de markdown compartilhado`

---

### T3: Estender o renderizador com listas ordenadas, citações e blocos cercados

**What**: Acrescentar a `src/lib/markdown.tsx` o reconhecimento de `1.` (lista ordenada → `<ol>`), `>` (citação → `<blockquote>`) e ``` (bloco cercado → `<pre><code>`), preservando tudo que já funcionava.
**Where**: `src/lib/markdown.tsx`
**Depends on**: T2
**Reuses**: a própria estrutura de `renderMarkdown` (varredura linha a linha com `flush`)
**Requirement**: FEED-14

**Tools**:

- MCP: `filesystem`
- Skill: NONE

**Done when**:

- [x] `1. item` / `2. item` viram um `<ol>` com dois `listitem`; a lista `-` continua virando `<ul>`
- [x] `> texto` vira `blockquote`
- [x] Bloco entre ``` vira `<pre><code>` com o conteúdo **literal** — sem interpretar `**` nem `#` lá dentro
- [x] Bloco cercado não fechado renderiza até o fim do texto, sem descartar conteúdo (edge case da spec)
- [x] Sintaxe fora do subconjunto (tabela, `- [x]`, `[texto](url)`) sai como texto literal, sem quebrar o render
- [x] Comentário `ponytail:` no arquivo nomeando o teto: tabelas, listas de tarefas e aninhamento pedem `react-markdown`, não mais regex
- [x] Gate: `npx vitest run src/lib/markdown.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(markdown): reconhecer listas ordenadas, citações e blocos cercados`

---

### T4: Criar o `FeedbackPanel` com categoria e título

**What**: Criar o painel apresentacional com cabeçalho, `<select>` de categoria (4 opções, `general` padrão) e campo "Título" obrigatório com `maxLength` 255 e contador `N / 255`.
**Where**: `src/routes/settings/FeedbackPanel.tsx`
**Depends on**: None
**Reuses**: `src/routes/settings/ProjectsPanel.tsx` (formato `PANEL_STYLES` + cabeçalho com ícone e subtítulo), `src/routes/kanban/BoardFilters.tsx:119` (`<select>` nativo), `lucide-react` (ícones)
**Requirement**: FEED-02, FEED-03, FEED-05

**Tools**:

- MCP: `filesystem`
- Skill: `ui-ux-pro-max:ui-ux-pro-max` (arquivo de front)

**Done when**:

- [x] Marcador `// SPEC: feedback-form (FEED-02, FEED-03, FEED-05)` no topo
- [x] Componente sem `invoke` e sem `fetch`; todo o estado é local
- [x] `<select>` com as quatro opções na ordem da spec e `general` selecionada na montagem
- [x] Todo rótulo associado ao seu controle (`<label htmlFor>`), obrigatórios marcados visualmente
- [x] Contador reflete o tamanho do título e o campo trava em 255
- [x] `FeedbackPanel.test.tsx` cobre: as 4 opções, o padrão na montagem, o contador subindo, o teto de 255
- [x] Gate: `npx vitest run src/routes/settings/FeedbackPanel.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(feedback): painel com categoria e título`

---

### T5: Descrição em Markdown com abas Escrever/Visualizar

**What**: Acrescentar ao painel o campo "Descrição" (`<textarea>` obrigatório) sob um `role="tablist"` de duas abas, com o preview renderizado por `renderMarkdown`.
**Where**: `src/routes/settings/FeedbackPanel.tsx`
**Depends on**: T3, T4
**Reuses**: `src/lib/markdown.tsx` (T3), classes de tipografia do bloco de notas de `UpdateSettings.tsx:223-245`
**Requirement**: FEED-04, FEED-13, FEED-15

**Tools**:

- MCP: `filesystem`
- Skill: `ui-ux-pro-max:ui-ux-pro-max` (arquivo de front)

**Done when**:

- [x] Marcador `SPEC:` do arquivo atualizado com FEED-04, FEED-13, FEED-15
- [x] Abas em `role="tablist"` com `role="tab"` + `aria-selected`, e o painel em `role="tabpanel"`; "Escrever" ativa na montagem
- [x] Alternar para "Visualizar" mostra o texto renderizado; voltar para "Escrever" traz o `<textarea>` com o mesmo conteúdo
- [x] Descrição vazia mostra em "Visualizar" o estado vazio "Nada para visualizar ainda."
- [x] Abas navegáveis por teclado, com foco visível
- [x] Teste cobre: aba padrão, ida e volta preservando o texto, `# Título` virando heading no preview, `- item` virando `listitem`, estado vazio
- [x] Gate: `npx vitest run src/routes/settings/FeedbackPanel.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(feedback): descrição em markdown com abas escrever e visualizar`

---

### T6: Anexos de imagem com os tetos de 5 arquivos e 10 MB

**What**: Acrescentar ao painel o `<input type="file" accept="image/*" multiple>` escondido, o botão que o dispara, a grade de miniaturas com nome, tamanho e remover, e as três regras de recusa (excedente, grande demais, não-imagem) numa mensagem `role="alert"`.
**Where**: `src/routes/settings/FeedbackPanel.tsx`
**Depends on**: T5
**Reuses**: `URL.createObjectURL` conforme `src/components/terminal/ScreenshotModal.tsx:28`, `formatMb` de `UpdateSettings.tsx:46`
**Requirement**: FEED-06, FEED-07, FEED-08, FEED-11

**Tools**:

- MCP: `filesystem`
- Skill: `ui-ux-pro-max:ui-ux-pro-max` (arquivo de front)

**Done when**:

- [x] Marcador `SPEC:` do arquivo atualizado com FEED-06, FEED-07, FEED-08, FEED-11
- [x] Uma miniatura por arquivo aceito, com nome, tamanho e botão de remover com nome acessível
- [x] Lote que ultrapassa 5 aceita o que cabe e nomeia cada recusado
- [x] Arquivo acima de 10 MB é recusado pelo nome e os válidos do mesmo lote entram
- [x] Arquivo cujo `type` não começa com `image/` é recusado pelo nome
- [x] Com 5 imagens na lista o botão de seleção fica desabilitado
- [x] Mensagem de recusa em `role="alert"`; escolher um lote válido depois limpa a mensagem
- [x] Remover uma imagem chama `URL.revokeObjectURL` da miniatura dela
- [x] Teste cobre os quatro caminhos de recusa, o teto do botão, o revoke no remover e o lote misto
- [x] Gate: `npx vitest run src/routes/settings/FeedbackPanel.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(feedback): anexos de imagem com limite de 5 arquivos e 10 mb`

---

### T7: Botões "Enviar feedback" e "Limpar"

**What**: Acrescentar ao painel a linha de ações: primário habilitado só com título e descrição preenchidos, cujo clique escreve o aviso de envio não implementado em um `role="status"`; secundário que restaura o estado inicial e revoga os object URLs, desabilitado com o formulário vazio. Revogar também no desmonte.
**Where**: `src/routes/settings/FeedbackPanel.tsx`
**Depends on**: T6
**Reuses**: estilo de botão primário/secundário de `src/routes/settings/ProjectsPanel.tsx`
**Requirement**: FEED-09, FEED-10, FEED-12

**Tools**:

- MCP: `filesystem`
- Skill: `ui-ux-pro-max:ui-ux-pro-max` (arquivo de front)

**Done when**:

- [x] Marcador `SPEC:` do arquivo atualizado com FEED-09, FEED-10, FEED-12
- [x] "Enviar feedback" desabilitado enquanto título **ou** descrição estiverem vazios (só espaço em branco conta como vazio)
- [x] Clique no primário exibe o aviso de não implementado em `role="status"`
- [x] "Limpar" volta categoria, título, descrição, aba ativa, anexos e mensagens ao inicial, e fica desabilitado nesse estado
- [x] `URL.revokeObjectURL` chamado para cada miniatura ao limpar e ao desmontar o painel
- [x] Nenhum `invoke` e nenhum `fetch` em todo o arquivo — o teste asserta com um mock espião de `@tauri-apps/api/core`
- [x] Alvos de clique com no mínimo 44x44 px
- [x] Teste cobre: gating do primário, aviso no clique, reset completo, desabilitado no estado inicial, revoke ao limpar e no desmonte, zero `invoke`
- [x] Gate: `npx vitest run src/routes/settings/FeedbackPanel.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(feedback): ações de enviar e limpar`

---

### T8: Ligar a seção "Feedback" ao `SettingsShell`

**What**: Acrescentar `'feedback'` ao `SectionId`, o item ao `SECTIONS` (último, ícone `MessageSquare`) e o bloco de render do `FeedbackPanel`.
**Where**: `src/routes/settings/SettingsShell.tsx`
**Depends on**: T7
**Reuses**: o próprio `SECTIONS` e o padrão de render por seção do arquivo
**Requirement**: FEED-01

**Tools**:

- MCP: `filesystem`
- Skill: `ui-ux-pro-max:ui-ux-pro-max` (arquivo de front)

**Done when**:

- [x] Marcador `SPEC:` do arquivo ganha `feedback-form (FEED-01)`
- [x] "Feedback" é o quinto e último item da barra lateral; "Geral" continua sendo a seção inicial
- [x] Clicar em "Feedback" mostra "Configurações › Feedback" e monta o formulário
- [x] `SettingsShell.test.tsx` ganha esse teste; **nenhuma asserção existente é alterada** (prova de que as seções antigas seguem valendo)
- [x] O painel não recebe nenhum estado do shell — o shell não passa a chamar `invoke` por causa desta seção
- [x] Gate: `npm run build && npm run test`

**Tests**: unit
**Gate**: build

**Commit**: `feat(settings): seção de feedback na barra lateral`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5 ------→ T6 ------→ T7
          T3 ------→ T5
Phase 3:  T7 ------→ T8
```

A execução é estritamente sequencial. 8 tasks cabem em um único batch (~7 por worker), então o Execute roda inline, sem sub-agentes. O Verifier no fim continua obrigatório.

Setas entre fases apontam sempre para trás: `T3 → T5` (o preview precisa do renderizador estendido) e `T7 → T8` (o shell só monta um painel pronto).

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: extrair o renderizador | 1 módulo novo | ✅ Granular |
| T2: consumir o módulo | 1 arquivo, troca de import | ✅ Granular |
| T3: estender o renderizador | 1 módulo, 3 regras de linha | ✅ Granular |
| T4: painel + categoria + título | 1 componente novo | ✅ Granular |
| T5: descrição + abas | 1 bloco do mesmo componente | ✅ Granular |
| T6: anexos | 1 bloco do mesmo componente | ✅ Granular |
| T7: ações | 1 bloco do mesmo componente | ✅ Granular |
| T8: ligar ao shell | 1 arquivo, 3 pontos | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| ---- | ------------------ | --------------- | ------ |
| T1 | None | — (início da fase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | None | — (início da fase 2) | ✅ Match |
| T5 | T3, T4 | T4 → T5 e T3 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |

T6 e T7 tocam o mesmo arquivo que T5, então a cadeia linear da fase 2 é a
dependência real: cada uma edita o `FeedbackPanel` que a anterior deixou.

Nenhuma dependência aponta para fase posterior.

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Task diz | Status |
| ---- | ------------------------ | ------------ | -------- | ------ |
| T1 | Utilitário puro (`src/lib/`) | unit | unit | ✅ OK |
| T2 | Componente de UI | unit | unit | ✅ OK |
| T3 | Utilitário puro (`src/lib/`) | unit | unit | ✅ OK |
| T4 | Componente de UI | unit | unit | ✅ OK |
| T5 | Componente de UI | unit | unit | ✅ OK |
| T6 | Componente de UI | unit | unit | ✅ OK |
| T7 | Componente de UI | unit | unit | ✅ OK |
| T8 | Componente de UI | unit | unit | ✅ OK |

Nenhuma task carrega `Tests: none`.
