# terminal-glyph-metrics Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/terminal-glyph-metrics/spec.md`
**Design**: none — no architectural decision. One function in one component, called from two points that already exist.
**Status**: Approved

> **Commits (AD-013)**: nesta base nenhum agente commita. Cada task termina em
> gate verde + `tasks.md` marcado; o campo `Commit` de cada task é a mensagem
> **sugerida** para o usuário, não uma instrução de executar `git commit`.

---

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Componente React do painel (`src/components/terminal/TerminalPane.tsx`) | unit (RTL + mock do xterm) | Os dois pontos de invalidação (fonte carregada, todo `fit()` aplicado), a recusa que não invalida, e a forma da invalidação (valor diferente antes de voltar) | `src/components/terminal/TerminalPane.test.tsx` | `npm test` |
| Artefatos de spec (`.specs/**`) | none | — (gate é `validate_spec.py`) | — | `python3 <skill-dir>/scripts/validate_spec.py` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tasks só com testes de unidade em TS | `npm test` |
| Full | Task que fecha a feature | `npm test && npm run build` |
| Build | Verificação no app real | `npm run tauri dev` |

---

## Execution Plan

### Phase 1: Invalidação da métrica

```
T1
```

### Phase 2: Registro e verificação

```
T1 → T2
T2 → T3
```

---

## Task Breakdown

### T1: Forçar remedida da métrica antes de cada resize aplicado

**What**: Adicionar `refreshMetrics(terminal)` em `TerminalPane.tsx`: atribui a
`terminal.options.fontFamily` um valor **diferente** do canônico (o próprio
`TERMINAL_FONT_FAMILY` com uma família extra concatenada serve) e em seguida
restaura `TERMINAL_FONT_FAMILY`. Chamar em dois pontos: (a) no `then` de
`document.fonts.ready` depois de `terminal.open()`, guardado por `disposed`;
(b) dentro de `syncSize`, **incondicionalmente**, depois da guarda de caixa zero
e do piso de colunas e **antes** de `fitAddon.fit()` — sem flag de transição,
porque o gatilho confirmado pelo usuário é o resize/arraste e não a volta de um
painel oculto. `document.fonts` pode não existir (jsdom), então o acesso é
opcional.

**Where**: `src/components/terminal/TerminalPane.tsx`, `src/components/terminal/TerminalPane.test.tsx`
**Depends on**: None
**Reuses**: `syncSize` e suas duas guardas já existentes (caixa zero e piso de colunas, `TerminalPane.tsx:198-206`); a constante `TERMINAL_FONT_FAMILY` (`:19-20`); o `ResizeObserver` com debounce de 100 ms já montado (`:296-300`), que é quem entrega cada resize assentado
**Requirement**: TGLY-01, TGLY-02, TGLY-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Fonte resolvida depois do `open()` dispara a invalidação uma vez (TGLY-01)
- [ ] Todo `fit()` aplicado é precedido da invalidação, inclusive num resize entre dois tamanhos legítimos (TGLY-02)
- [ ] Resize recusado pela guarda (caixa zero, ou proposta abaixo de `MIN_COLS`) **não** invalida nada — a invalidação vive depois das guardas (TGLY-02)
- [ ] A sequência de escritas em `options.fontFamily` tem um valor diferente do canônico antes de voltar ao canônico — o teste falha se alguém "simplificar" para uma atribuição só (TGLY-03)
- [ ] Painel desmontado antes do `fonts.ready` resolver não toca no terminal descartado
- [ ] Mock do xterm no teste ganha `options` que registra as escritas; mock do `ResizeObserver` ganha captura do callback, sem quebrar os testes existentes do arquivo
- [ ] Marcador `SPEC:` de `TerminalPane.tsx` e de `TerminalPane.test.tsx` atualizado com `terminal-glyph-metrics (TGLY-01, TGLY-02, TGLY-03)`
- [ ] Gate check passa: `npm test`
- [ ] Test count: 4 testes novos em `TerminalPane.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `fix(terminal): invalidar métrica de glifo antes de cada resize aplicado`

---

### T2: Registrar AD-046 e o limite do AD-045

**What**: Escrever AD-046 em `.specs/project/STATE.md`: a decisão de invalidar
pela troca real de `fontFamily` (em vez de mexer em `_core`), a falsificação da
hipótese de que o piso de colunas estava disparando em painel oculto (`syncSize`
retorna antes do `fit()`; `proposeDimensions()` devolve `undefined` com célula
zero), a escolha de invalidar em todo resize em vez de detectar a transição
(menos código, cobertura maior), e o trade-off aceito (uma remedida por resize
assentado, em cima de um full refresh que o `fit()` já fazia). Em
`.specs/features/terminal-resize-floor/spec.md`, acrescentar uma linha no
Non-goal de reparo apontando que a parte **não-reparada** virou
`terminal-glyph-metrics` — sem revogar nenhum `TRSZ-xx`, que continuam válidos.

**Where**: `.specs/project/STATE.md`, `.specs/features/terminal-resize-floor/spec.md`
**Depends on**: T1
**Reuses**: o formato de AD já usado em `STATE.md` (AD-040, AD-045)
**Requirement**: TGLY-01, TGLY-02, TGLY-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `grep -n "AD-046" .specs/project/STATE.md` acha a decisão com contexto, escolha, alternativa rejeitada e trade-off
- [ ] `terminal-resize-floor/spec.md` aponta para esta feature e nenhum `TRSZ-xx` foi alterado (`git diff` mostra só linha adicionada)
- [ ] `validate_spec.py` em `terminal-resize-floor/spec.md` continua no mesmo veredito de antes da edição
- [ ] Gate check passa: `npm test`
- [ ] Test count: 0 testes novos (task de registro)

**Tests**: none
**Gate**: quick

---

### T3: Verificar no app real e decidir o passo seguinte

**What**: Rodar `npm run tauri dev`, abrir o provider `claude` numa aba única,
rodar comandos até ter histórico e então **arrastar/redimensionar o painel** —
o repro que o usuário executou e que fez o bug aparecer. Comparar com
`print/bug_terminal.png`.
Se sobrar artefato, capturar no devtools
`terminal.buffer.active.getLine(y).translateToString(true)` da row suja: texto
sujo no buffer = resíduo do AD-045 (reiniciar aquele painel, previsto no
Non-goal); buffer limpo com pixel sujo = compositor, e aí abre spec nova para
`WEBKIT_DISABLE_DMABUF_RENDERER=1`. Registrar o veredito em `validation.md`.

**Where**: `.specs/features/terminal-glyph-metrics/validation.md`
**Depends on**: T2
**Reuses**: as evidências já em `print/`; o botão de screenshot por painel (`terminal-screenshot`) para capturar o depois
**Requirement**: TGLY-01, TGLY-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Screenshot depois de arrastar/redimensionar o painel, com o provider rodando, sem tira de caracteres à esquerda nem corte no meio da palavra
- [ ] `validation.md` cita `file:line` da implementação e o veredito por AC
- [ ] Se sobrou artefato: a captura do buffer está no `validation.md` e o desfecho (resíduo AD-045 vs compositor) está nomeado
- [ ] `cargo clean` rodado se algum build de release foi feito (regra `tauri-build-cleanup.md`)
- [ ] Gate check passa: `npm test && npm run build`
- [ ] Test count: 0 testes novos (verificação manual, exigida pelo próprio handoff do AD-045: "not observable from this WSL2 environment")

**Tests**: manual
**Gate**: full
