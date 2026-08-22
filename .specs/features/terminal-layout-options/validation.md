# Validação — terminal-layout-options (iteração 2)

**Veredito: PASS ✅** — com 1 gap de precisão do spec registrado abaixo, não corrigido de propósito.

| | |
| --- | --- |
| **Checagem ancorada no spec** | 29/29 ACs com evidência localizada; 1 gap de precisão (LAYOUT-29) |
| **Gate** | frontend 223 passed / Rust 243 passed / 0 failed / 0 skipped |
| **Sensor de discriminação** | 5 mutações injetadas, 5 mortas, 0 sobreviventes |
| **Superfície do diff** | commits `7ac042c` + `2b1d04a` na `master` (working tree limpo) |
| **Working tree** | `git status --porcelain` vazio antes e depois do sensor; cada arquivo mutado restaurado byte-idêntico (md5 conferido) |

## O que mudou desde a iteração 1

A iteração 1 reprovou: 27/29 ACs, 1 gap duro (LAYOUT-25 sem a metade de UI), 1 gap de
precisão (LAYOUT-29 sem asserção), 2 edge cases sem teste e um comentário com ID errado.
Um fix pass fechou os quatro. Esta iteração re-derivou a cobertura do zero contra o
`spec.md` — não confiou no relatório anterior nem nas alegações do fix pass.

Diferença de contexto relevante: na iteração 1 a feature estava toda no working tree, sem
commit. Agora está commitada (`7ac042c`, 21 arquivos, +2198/−153; `2b1d04a`, ajuste do
`normalize_span`). O sensor rodou por cópia de arquivo mesmo assim — nenhum comando git de
escrita foi executado em nenhum momento.

---

## Cobertura por requisito (evidência ou zero)

### Popover (LAYOUT-01..06)

| AC | Evidência | Resultado esperado pelo spec | Coberto |
| --- | --- | --- | --- |
| LAYOUT-01 | `src/components/shell/LayoutMenu.test.tsx:23` e `:30` | cabeçalho "1 TERMINAL" / "N TERMINAIS" da aba ativa | ✅ |
| LAYOUT-02 | `src/components/shell/Header.test.tsx:166` e `:176` | irmão imediatamente anterior ao indicador de cota, `aria-label="layout options"`, sem botão `split` | ✅ |
| LAYOUT-03 | `src/components/shell/LayoutMenu.test.tsx:39` | só a entrada do modo ativo com `var(--accent)` | ✅ |
| LAYOUT-04 | `src/components/shell/LayoutMenu.test.tsx:56`; `src/App.test.tsx:464` | aplica só à aba ativa e fecha o popover | ✅ |
| LAYOUT-05 | `src/components/shell/LayoutMenu.test.tsx:69` e `:80` | Escape e clique fora fecham sem chamar `onChange` | ✅ |
| LAYOUT-06 | `src/components/shell/LayoutMenu.test.tsx:92` | botão desabilitado e popover não abre com 0 terminais | ✅ |

### Disposição (LAYOUT-07..15)

| AC | Evidência | Resultado esperado pelo spec | Coberto |
| --- | --- | --- | --- |
| LAYOUT-07 | `src/state/layout.test.ts:16`; `src/components/grid/GridLayout.test.tsx:59` | 2 colunas, 1 linha, cada célula span 1 | ✅ |
| LAYOUT-08 | `src/state/layout.test.ts:31` | 2 colunas, 2 linhas | ✅ |
| LAYOUT-09 | `src/state/layout.test.ts:21`; `GridLayout.test.tsx:69` | spans `[2,1,1]` — posição 1 na linha de cima inteira | ✅ |
| LAYOUT-10 | `src/state/layout.test.ts:26`; `GridLayout.test.tsx:79` | spans `[1,1,2]` — posição 3 na linha de baixo inteira | ✅ |
| LAYOUT-11 | `src/state/layout.test.ts:38`; `GridLayout.test.tsx:86` | 1 coluna, N linhas, todas span 1, na ordem da aba | ✅ |
| LAYOUT-12 | `src/state/layout.test.ts:11` e `:44` | 1 painel ocupa a área inteira em qualquer modo | ✅ |
| LAYOUT-13 | `src/components/shell/LayoutMenu.test.tsx:104` | variantes aninhadas sob Horizontal com 3 terminais, ativa marcada | ✅ |
| LAYOUT-14 | `src/components/shell/LayoutMenu.test.tsx:123` | variantes omitidas quando a contagem não é 3 | ✅ |
| LAYOUT-15 | `src/state/layout.test.ts:50` | variante gravada sobrevive à contagem sair de 3 e volta a valer ao retornar | ✅ |

### Reordenação (LAYOUT-16..20)

| AC | Evidência | Resultado esperado pelo spec | Coberto |
| --- | --- | --- | --- |
| LAYOUT-16 | `src/App.test.tsx:485`; `src/state/terminals.test.ts:69` e `:78` | arrastado assume a posição do alvo, demais na ordem relativa | ✅ |
| LAYOUT-17 | `src/App.test.tsx:548` | painel sob o cursor destacado como alvo, destaque limpo ao sair | ✅ |
| LAYOUT-18 | `src/App.test.tsx:522` | nenhum `TerminalPane` desmontado — mesmos nós, só reordenados | ✅ |
| LAYOUT-19 | `src/App.test.tsx:508`; `src/state/terminals.test.ts` (casos de identidade) | soltar sobre si mesmo / alvo inválido mantém a ordem | ✅ |
| LAYOUT-20 | `src/App.test.tsx:485` | layout do modo atual reaplicado à nova ordem | ✅ |

### Persistência (LAYOUT-21..29)

| AC | Evidência | Resultado esperado pelo spec | Coberto |
| --- | --- | --- | --- |
| LAYOUT-21 | `src/App.test.tsx:836` e `:858` | nada aos 499 ms, uma chamada aos 500 ms; rajada vira 1 chamada | ✅ |
| LAYOUT-22 | `src/App.test.tsx:903` | payload por igualdade estrutural: `agentId` por terminal, `layoutMode`/`layoutSpan` por aba | ✅ |
| LAYOUT-23 | `src/App.test.tsx:627` e `:645`; `layout.rs:260` | abas na ordem do slot, nome, terminais, `cwd`, agente, modo e variante | ✅ |
| LAYOUT-24 | `src/App.test.tsx:664`; `layout.rs:287`; `tests/layout.rs:142` | vetor vazio, uma aba vazia, `EmptyState` visível (EMPTY-03 preservado) | ✅ |
| LAYOUT-25 | `layout.rs:418`; `src/state/terminals.test.ts:114` e `:121`; `src/App.test.tsx:697`, `:725`, `:768` | abre em `home` **e** nomeia o diretório sumido na UI, aviso dispensável | ✅ |
| LAYOUT-26 | `src/App.test.tsx:777` | leitura rejeitada registra o erro e mantém a aba vazia, render intacto | ✅ |
| LAYOUT-27 | `layout.rs:298` e `:323` | substituição integral; falha no meio faz rollback e preserva a gravação anterior | ✅ |
| LAYOUT-28 | `layout.rs:346` | `layout_mode`/`layout_span` desconhecidos voltam como `horizontal`/`first` | ✅ |
| LAYOUT-29 | `src/App.test.tsx:678` | cada terminal restaurado nasce de um `pty_spawn` próprio | ⚠️ ver abaixo |

### Edge cases listados no spec

| Edge case | Evidência | Coberto |
| --- | --- | --- |
| Vertical com 1 terminal | `src/state/layout.test.ts:44` | ✅ |
| Painel maximizado sob layout não-padrão | `src/components/grid/GridLayout.test.tsx:121` | ✅ |
| Painel minimizado na ordem, altura recolhida | `src/components/grid/GridLayout.test.tsx:139` | ✅ |
| Arrastar sobre si mesmo | `src/App.test.tsx:508` | ✅ |
| Terminal órfão descartado | `layout.rs:365` e `:391` | ✅ |
| Abas salvas sem nenhum terminal | `layout.rs:435` (backend) | ⚠️ parcial — a metade de UI não tem teste próprio |

---

## Gap de precisão do spec: LAYOUT-29

**O AC**: *"The system SHALL abrir cada terminal restaurado como sessão nova — processo e
scrollback anteriores não são restaurados."*

**O que o teste faz**: `src/App.test.tsx:678` restaura 5 terminais e afirma exatamente 5
chamadas de `pty_spawn`, com `cwd` `['/a','/b','/c','/d','/e']` e chaves de argumento
exatamente `['agent','cwd']`.

**Por que não é cobertura plena**: a asserção observa o **dublê** do `TerminalPane`, não o
componente real — `src/App.test.tsx:57-63` chama `invokeMock('pty_spawn', { cwd, agent })`
num `useEffect`. Comparado ao componente real (`src/components/terminal/TerminalPane.tsx:101`,
`invoke('pty_spawn', { cwd, shell, agent, channel })` num `useEffect` de montagem), o dublê é
fiel no contrato essencial — um spawn por montagem, sem id de sessão e sem token de retomada —
mas o teste, em rigor, prova que o dublê se comporta como o dublê. jsdom não monta o
`TerminalPane` real (xterm.js), então essa é a fronteira do que o nível de App consegue afirmar.

**Por que ainda assim PASS**: a exigência substantiva do AC é provada estruturalmente, não pelo
dublê. Não existe coluna de sessão nem de saída em `terminal_tabs` ou `terminal_layout`
(migração `008_terminal_workspace.sql`), e o round-trip de `layout.rs:260` afirma a struct
`TabEntry`/`LayoutEntry` inteira por igualdade — não há o que retomar. O `channel` do
componente real é construído novo a cada montagem, o que reforça a mesma conclusão.

**O que fecharia de vez**: um teste de integração que monte o `TerminalPane` real contra um
backend falso. Fora do escopo desta feature; registrado aqui em vez de mascarado.

---

## Sensor de discriminação

Cada mutação: cópia do arquivo para fora, mutação no original, suíte alvo, restauração da
cópia, md5 conferido. Nenhum comando git de escrita.

| # | Alvo | Mutação | Suíte | Resultado |
| --- | --- | --- | --- | --- |
| M1 | `src/state/terminals.ts` | `cwdFallbackFrom: e.cwdFallbackFrom ?? null` → `null` (mata o passthrough de LAYOUT-25) | `src/App.test.tsx` | **morta** |
| M2 | `src/App.tsx` | handler de dispensar o aviso vira no-op | `src/App.test.tsx` | **morta** |
| M3 | `src/state/layout.ts` | variante `last` passa a devolver `[2,1,1]` como a `first` | `src/state/layout.test.ts` | **morta** |
| M4 | `src/components/grid/GridLayout.tsx` | sincronia por sequência de ids revertida para comparação por contagem (regressão de AD-011) | `GridLayout.test.tsx` | **morta** |
| M5 | `src-tauri/src/terminal/layout.rs` | `normalize_mode` cai em `"vertical"` em vez de `DEFAULT_MODE` | `cargo test --lib` | **morta** (1 falha) |

5 injetadas, 5 mortas, 0 sobreviventes. M4 é a sonda de regressão: confirma que a correção da
iteração anterior continua sendo detectável pela suíte, não só presente no código.

## Regra de payload/conjunção

Aprovada. `src/App.test.tsx:903` afirma o payload de `terminal_workspace_set` por igualdade
estrutural — cada campo por valor, `agentId`, `layoutMode` e `layoutSpan` incluídos — e
`layout.rs:260` faz o round-trip da struct inteira. Nenhuma asserção do tipo "a chamada
aconteceu" no lugar do estado resultante. Ponto fino: `minimized` só é exercitado como `false`.

## Nits de marcador (não são gaps de cobertura)

1. `src/App.test.tsx:464` rotula o teste como `LAYOUT-15`, mas "trocar o modo altera só a aba
   ativa" é **LAYOUT-04** pelo mapa AC→ID do `spec.md`. LAYOUT-15 (variante sobrevive à
   contagem) está coberto em `src/state/layout.test.ts:50`. Só o ID no título está errado;
   os dois comportamentos têm teste.
2. `src/components/grid/GridLayout.tsx` lista `TERM-03, TERM-04` no marcador mas também
   implementa a altura recolhida de TERM-08. Pré-existente, fora do escopo desta feature.

## Comentários obsoletos deixados no código

Não são gaps de verificação, mas mentem com autoridade e valem uma passada:

1. `src/App.tsx` — o comentário de `defaultTerminal` ainda afirma que não existe comando Tauri
   expondo `layout::restore`. T10 entregou `terminal_workspace_get`/`_set`.
2. `src/App.tsx` — o bloco que descreve o bug de sincronia por contagem do `GridLayout`
   descreve um bug que T3 corrigiu (AD-011).
