# terminal-glyph-metrics — validation

**Result**: PARTIAL (só T3 pendente) · **Date**: 2026-08-22 · **Diff**: working tree (uncommitted)
`src/components/terminal/TerminalPane.tsx`, `src/components/terminal/TerminalPane.test.tsx`,
`.specs/project/STATE.md`, `.specs/features/terminal-resize-floor/spec.md`

Verificação independente: quem escreveu este arquivo não escreveu o código.
Todo PASS abaixo cita `file:line`.

## Per-requirement evidence

| ID | Evidence | Verdict |
| --- | --- | --- |
| TGLY-01 | `src/components/terminal/TerminalPane.tsx:200-203` — `void document.fonts?.ready.then(...)` depois do `terminal.open()` (`:174`), com `if (disposed) return` (`:201`) antes de `refreshMetrics(terminal)` (`:202`). O `?.` cobre `document.fonts` ausente (jsdom), e `disposed` é declarado antes, em `:178`, e virado `true` no cleanup (`:347`). Testes: `TerminalPane.test.tsx:521` "remedia a métrica quando a fonte termina de carregar" — que desde a correção do achado 2 também afirma a **forma** da sequência neste caminho (`:542-545`) — e `:551` "painel desmontado antes da fonte resolver não toca no terminal descartado". | PASS |
| TGLY-02 | `src/components/terminal/TerminalPane.tsx:237-247` — ordem verificada linha a linha: guarda de caixa zero em `:239`, consulta ao addon + piso `MIN_COLS` em `:240-241`, `refreshMetrics(terminal)` em `:246`, `fitAddon.fit()` em `:247`. A invalidação está **depois das duas guardas** e **antes do fit**, incondicional. Todo caminho de geometria passa por `syncSize`: fit inicial (`:256`), `then` do `pty_spawn` (`:324`) e `ResizeObserver` com debounce de 100 ms (`:340-344`). Testes: `TerminalPane.test.tsx:566` (invariante `everyFitPrecededByRefresh`, `:515-516`, mais um resize assentado entre 120 e 100 colunas via callback capturado do observer) e `:601` "resize recusado pela guarda não invalida nada", que cobre os dois desvios — proposta de 2 colunas e caixa zero. | PASS |
| TGLY-03 | `src/components/terminal/TerminalPane.tsx:113-116` — duas escritas: `:114` grava `` `${TERMINAL_FONT_FAMILY}, monospace` ``, que difere do canônico definido em `:20-21`; `:115` restaura `TERMINAL_FONT_FAMILY`. A **última** escrita é a canônica. Teste: `TerminalPane.test.tsx:639`, que afirma `metricLog[fitAt - 1] === font:canonical` e `metricLog[fitAt - 2] !== font:canonical` com `/^font:/` — o mock registra a sequência via `Proxy` no `options` (`:57-63`). | PASS |

## Checks de regra do repositório

| Check | Evidence | Verdict |
| --- | --- | --- |
| Marcador `SPEC:` na implementação | `src/components/terminal/TerminalPane.tsx:5` — `// SPEC: terminal-glyph-metrics (TGLY-01, TGLY-02, TGLY-03)` | PASS |
| Marcador `SPEC:` no teste | `src/components/terminal/TerminalPane.test.tsx:2` — mesma linha | PASS |
| AD-046 registrada | `.specs/project/STATE.md:198-206` — Decision, Reason (com a hipótese falsificada do piso de colunas), Trade-off (com as duas alternativas rejeitadas: `terminal._core` e a flag de transição) e Scope | PASS |
| Handoff atualizado | `.specs/project/STATE.md:207-215` — feature, T1/T2 feitos, T3 pendente, arquivos não commitados, AD-013 | PASS |
| Spec antiga não revogada | `.specs/features/terminal-resize-floor/spec.md:48-53` — o Non-goal de reparo aponta para `terminal-glyph-metrics` (AD-046) e afirma explicitamente que nenhum `TRSZ-xx` é revogado. `git diff` do arquivo: 5 adições, 1 remoção, todas dentro daquele bullet; nenhum requisito, nenhuma linha da tabela de Traceability tocada | PASS |

## Spec-anchored outcome check

Os testes afirmam desfecho, não forma, nos dois pontos que importam: a
invariante de TGLY-02 é "nenhum `fit` no log sem a escrita canônica
imediatamente antes", não "a função `refreshMetrics` foi chamada"; e a recusa é
afirmada como *log vazio*, o que falha se a invalidação subir acima das guardas.

Achado 2 da primeira passagem — **resolvido**. O teste de TGLY-01 verificava só
que duas escritas em `fontFamily` aconteciam, sem afirmar a forma da sequência no
caminho da fonte; agora `TerminalPane.test.tsx:542-545` lê o canônico de
`termOptions.at(-1)?.fontFamily` (com `termOptions.length = 0` antes do render,
`:526`) e afirma `metricLog[0]` casando `/^font:/` e **diferente** do canônico,
`metricLog[1]` **igual** ao canônico. A forma de TGLY-03 passou a ser verificada
nos dois pontos de chamada, não só no do resize.

Sensor de discriminação, rodado por esta verificação no próprio tree (cópia de
backup, mutação, restauração; `md5sum` de `TerminalPane.tsx` volta a
`2aa5b5048aa25af596e7c2532c42d272` e `git diff --stat` volta a 44 inserções):

| # | Mutação no call site de `document.fonts.ready` (`:202`) | Resultado |
| --- | --- | --- |
| A | `refreshMetrics(terminal)` → uma escrita canônica só | KILLED — 1 failed / 24 passed (morre no `length toBe(2)`, que já existia antes) |
| B | `refreshMetrics(terminal)` → **duas** escritas canônicas | KILLED — 1 failed / 24 passed, em `expected 'font:ui-monospace…' not to be 'font:ui-monospace…'` (`:544`) |

A mutação B é a que prova a lacuna fechada: ela satisfazia as duas afirmações
antigas (`length toBe(2)` e `every(startsWith('font:'))`) e por isso sobrevivia
antes; só a nova afirmação de `:544` a mata. Confirmado o que o coordenador
reportou — com a ressalva de que a mutação de *uma* escrita canônica (A) já era
morta antes, pela contagem; era a de duas escritas que passava.

## Gates executados

- `npx vitest run src/components/terminal/TerminalPane.test.tsx` — 25 passed, exit 0.
- Nenhum build rodado (proibido nesta verificação), logo nenhum `cargo clean` devido.
- Ruído pré-existente, sem falha: 20 avisos `An update to TerminalPane inside a
  test was not wrapped in act(...)`, distribuídos por **19 testes distintos** do
  arquivo — incluindo os anteriores a esta feature (TERM-14, WSLP-12, TFONT-01,
  PERM-01, TRSZ). Vem do `setStarted` do painel, que resolve dentro de uma
  promise que nenhum teste envolve em `act`. Não foi introduzido aqui e não é
  lacuna desta feature.

## T3 — verificação manual

**Pendente. Não verificável aqui**: este ambiente é Linux/WSL2, sem o app real
rodando, sem provider e sem como arrastar/redimensionar um painel. Nada em T3
foi marcado PASS ou FAIL.

O que o usuário precisa fazer, na máquina Windows:

1. `npm run tauri dev`; abrir o provider `claude` numa aba única.
2. Rodar comandos até ter histórico na tela.
3. **Arrastar e redimensionar o painel** — o repro que fez o bug aparecer.
4. Comparar com `print/bug_terminal.png`: sem tira de caracteres na borda
   esquerda, sem letras em offsets irregulares, sem corte no meio da palavra na
   borda direita.
5. Se sobrar artefato, capturar no devtools
   `terminal.buffer.active.getLine(y).translateToString(true)` da row suja:
   texto sujo no buffer = resíduo do AD-045 (reiniciar aquele painel, previsto
   no Non-goal); buffer limpo com pixel sujo = compositor, e aí abre spec nova
   para `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
6. `npm test && npm run build` (gate `full` de T3) e, se sair build de release,
   `cargo clean` (regra `tauri-build-cleanup.md`).

## Verdict

**PARTIAL** — TGLY-01, TGLY-02 e TGLY-03 estão implementados e cobertos por
teste, com a ordem (guardas → invalidação → `fit`) e a forma da invalidação
(valor diferente antes do canônico) verificadas diretamente no código, não pelo
comentário. Nada a corrigir no código.

Lacunas:

1. T3 não executado — verificação no app real, na máquina Windows, é o que falta
   para o veredito virar PASS.
2. ~~O teste de TGLY-01 é mais fraco que o critério.~~ **Resolvido** em
   `TerminalPane.test.tsx:542-545`, confirmado por mutação (tabela acima).
3. Ruído de `act(...)` em 19 dos 25 testes do arquivo — padrão pré-existente,
   originado no `setStarted` do painel. Fora do escopo desta feature; se
   incomodar, é spec própria.
