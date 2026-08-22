# terminal-layout-options — Especificação

## Problem Statement

O botão à esquerda do indicador de cota é um `Columns2` inerte (`Header.tsx:116`),
e a disposição dos terminais é fixa: `gridTemplate` decide sozinho (1 → 1 coluna,
2 → 2 colunas, 3 ou 4 → grid 2×2) sem que o usuário possa opinar. Com 3 terminais
o grid 2×2 deixa uma célula vazia e nenhum painel ganha a largura toda, que é
justamente o que se quer quando um dos terminais é o principal. Não há como
reordenar os painéis: a ordem é a de criação, para sempre. E nada disso sobrevive
ao fechamento do app — nem o layout, nem as abas, nem os terminais: `layout::save`
e `layout::restore` existem em `src-tauri/src/terminal/layout.rs` mas **não têm
nenhum chamador** e nenhum comando Tauri os expõe ao frontend.

## Goals

- [ ] Botão "Layout Options" no header abre um popover fiel a `print/layout.png`,
      com os modos disponíveis para a aba ativa e o modo atual marcado.
- [ ] Modo **Horizontal** (atual) e modo **Vertical** (empilhado), por aba; com 3
      terminais o Horizontal ganha as variantes "largura toda em cima" e "largura
      toda embaixo".
- [ ] Reordenar terminais dentro da aba arrastando e soltando, sem matar PTY nem
      perder scrollback.
- [ ] Abas, terminais (ordem, `cwd`, agente, frações) e modo de layout por aba
      sobrevivem ao fechamento do app.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Redimensionar alturas no modo Vertical | O pedido é empilhar; hoje nem o grid 2×2 permite arrastar linhas. Alturas iguais é o comportamento honesto, e adicionar uma segunda divisória é feature própria. |
| Arrastar terminal de uma aba para outra | O pedido é reordenar "eles" dentro do layout mostrado no popover, que é o da aba ativa. Mover entre abas envolve transferir `agentByTerminalId`/`sessionIdByTerminalId` e é feature própria. |
| Restaurar o processo em execução do terminal | Impossível: PTY morre com o app. A sessão restaurada é nova, com o mesmo `cwd` e o mesmo agente. |
| Restaurar o scrollback anterior | Nada no banco guarda a saída dos terminais; gravá-la é feature de histórico, não de layout. |
| Modo de layout global (fora da aba) | Decisão do usuário: escopo por aba. |
| Ordenar abas por arrastar e soltar | O pedido nomeia terminais, não abas. |
| ~~Modal escolhendo o que restaurar no boot~~ | **Deixou de estar fora de escopo em 17/08/2026**: a feature `session-restore` retomou o adiamento e implementou o modal (SESS-01..09). Ver `.specs/features/session-restore/spec.md` e AD-014. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde vive a escolha entre "topo cheio" e "base cheia" com 3 terminais | Sub-opção aninhada sob "Horizontal" no mesmo popover, visível só quando a aba tem exatamente 3 terminais | Escolhido pelo usuário entre três alternativas apresentadas; mantém um único controle e é fiel ao print | y |
| Escopo do modo de layout | Por aba | Escolhido pelo usuário; terminais já moram dentro da aba (TAB-01) e o popover diz "N TERMINAIS" da aba ativa | y |
| Persistência | Persistir abas + terminais de verdade, incluindo a ponte Tauri que hoje não existe para `layout::save`/`restore` | Escolhido pelo usuário depois de ver que "por aba + persistir" não fechava com ids de aba efêmeros | y |
| Boot com estado salvo passa a abrir terminais sozinho | Sim — é a consequência direta de persistir terminais; PTYs sobem no mount de cada `TerminalPane`, como hoje | Sem isso, "persistir terminais" não entrega nada observável | n |
| Primeira execução (banco sem layout) | Uma aba vazia, `EmptyState` visível | Preserva EMPTY-03, que hoje garante o `EmptyState` alcançável no boot | n |
| Frequência de gravação | Debounce de 500 ms sobre qualquer mudança de abas/terminais/layout | `handleResize` dispara a cada `pointermove` do arrasto de divisória; gravar em SQLite por evento de mouse é desperdício | n |
| Gesto de reordenação | Arrastar a alça `GripVertical` do cabeçalho do terminal, com HTML5 drag-and-drop nativo | A alça já existe e é decorativa (`TerminalHeader.tsx:137`); usar o corpo do painel roubaria a seleção de texto do xterm | n |
| Modo salvo ilegível ou desconhecido | Cai em `horizontal` / span `first` | Mesmo padrão de `quota_prefs::default_providers`, que trata JSON ilegível caindo no default em vez de falhar | n |
| Vertical com 4 terminais | 4 linhas de altura igual | É a leitura literal de "um embaixo do outro"; nenhuma regra especial por contagem no modo vertical | n |
| Nome da aba | Persistido junto com a aba | Renomear aba (TAB-06) já existe; persistir a aba sem o nome devolveria "Aba 1" a cada boot e pareceria bug | n |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Escolher o layout dos terminais da aba ⭐ MVP

**User Story**: Como usuário do SwarmDeck, quero escolher entre layout horizontal
e vertical para a aba atual, para que a disposição dos terminais acompanhe o que
eu estou fazendo em vez de ser imposta pela contagem.

**Why P1**: É o pedido central e o que o print documenta. Sem ele não há feature.

**Acceptance Criteria**:

1. WHEN o usuário aciona o botão "Layout Options" no header THEN o sistema SHALL abrir um popover cujo cabeçalho mostra a contagem de terminais da aba ativa no formato "N TERMINAIS".
2. The system SHALL posicionar o botão "Layout Options" imediatamente à esquerda do indicador de cota, no lugar hoje ocupado pelo botão inerte `Columns2`, com `aria-label` "layout options".
3. WHILE o popover está aberto o sistema SHALL marcar a entrada do modo ativo da aba ativa com a cor de acento (`var(--accent)`), e nenhuma outra.
4. WHEN o usuário escolhe um modo no popover THEN o sistema SHALL aplicar esse modo somente à aba ativa e fechar o popover.
5. WHEN o usuário pressiona Escape ou clica fora do popover THEN o sistema SHALL fechar o popover sem alterar o modo da aba.
6. WHILE a aba ativa tem 0 terminais o sistema SHALL desabilitar o botão "Layout Options".

**Independent Test**: abrir o app com 2 terminais, clicar no botão, ver "2 TERMINAIS",
"Horizontal" marcado e "Vertical" disponível; escolher Vertical e ver os painéis
empilharem.

---

### P1: Dispor os terminais conforme o modo escolhido ⭐ MVP

**User Story**: Como usuário, quero que cada modo produza uma disposição
previsível, para que escolher o layout tenha efeito visível e estável.

**Why P1**: Sem as regras de disposição o popover é decorativo.

**Acceptance Criteria**:

1. WHILE o modo da aba é `horizontal` e a aba tem exatamente 2 terminais o sistema SHALL dispô-los em 2 colunas e 1 linha.
2. WHILE o modo da aba é `horizontal` e a aba tem exatamente 4 terminais o sistema SHALL dispô-los em 2 colunas e 2 linhas.
3. WHILE o modo da aba é `horizontal` com variante `first` e a aba tem exatamente 3 terminais o sistema SHALL dar ao terminal da posição 1 a largura inteira da linha de cima e dividir a linha de baixo entre os das posições 2 e 3.
4. WHILE o modo da aba é `horizontal` com variante `last` e a aba tem exatamente 3 terminais o sistema SHALL dividir a linha de cima entre os terminais das posições 1 e 2 e dar ao da posição 3 a largura inteira da linha de baixo.
5. WHILE o modo da aba é `vertical` o sistema SHALL dispor todos os terminais da aba em 1 coluna e N linhas de altura igual, na ordem da aba.
6. WHILE a aba tem exatamente 1 terminal o sistema SHALL fazê-lo ocupar a área inteira, em qualquer modo.
7. WHILE a aba tem exatamente 3 terminais e o modo é `horizontal` o popover SHALL exibir as duas variantes aninhadas sob "Horizontal", com a ativa marcada.
8. WHERE a aba não tem exatamente 3 terminais o popover SHALL omitir as variantes de largura.
9. WHEN a contagem de terminais da aba deixa de ser 3 THEN o sistema SHALL manter a variante escolhida gravada e voltar a aplicá-la se a contagem retornar a 3.

**Independent Test**: com 3 terminais, alternar entre as duas variantes e ver o
painel de largura total trocar de linha; fechar um terminal e ver a disposição
cair para 2 colunas sem erro.

---

### P1: Reordenar terminais arrastando e soltando ⭐ MVP

**User Story**: Como usuário, quero arrastar um terminal para outra posição da
aba, para escolher qual painel ocupa qual célula sem fechar e reabrir sessões.

**Why P1**: Pedido explícito e é o que dá sentido às variantes de largura — a
posição 1 e a posição 3 passam a ser escolhas, não acidentes de criação.

**Acceptance Criteria**:

1. WHEN o usuário arrasta a alça do cabeçalho de um terminal e solta sobre outro painel da mesma aba THEN o sistema SHALL mover o terminal arrastado para a posição do alvo, preservando a ordem relativa dos demais.
2. WHILE um arrasto de reordenação está em curso o sistema SHALL destacar o painel sob o cursor como alvo.
3. The system SHALL preservar a sessão PTY e o scrollback de todos os terminais durante e depois da reordenação — nenhum `TerminalPane` é desmontado.
4. IF o usuário solta fora de um alvo válido THEN o sistema SHALL manter a ordem inalterada.
5. WHEN a reordenação termina THEN o sistema SHALL reaplicar o layout do modo atual à nova ordem.

**Independent Test**: com 3 terminais e variante `first`, arrastar o terceiro para
a primeira posição e ver que ele passa a ocupar a linha de cima inteira, com a
saída dele intacta.

---

### P1: Restaurar abas, terminais e layout ao abrir o app ⭐ MVP

**User Story**: Como usuário, quero reabrir o SwarmDeck e encontrar minhas abas,
meus terminais e meu layout como deixei, para não remontar o ambiente todo dia.

**Why P1**: Decisão explícita do usuário; sem ela o modo por aba se perde a cada
boot e a feature parece quebrada.

**Acceptance Criteria**:

1. WHEN as abas, a ordem/composição dos terminais ou o modo de layout de qualquer aba mudam THEN o sistema SHALL gravar o estado completo no banco em no máximo 500 ms.
2. The system SHALL gravar, por aba: id, posição, nome, modo de layout e variante de largura; e por terminal: aba dona, posição, `cwd`, agente, `frac_w`, `frac_h` e minimizado.
3. WHEN o app inicia e existe estado salvo THEN o sistema SHALL recriar as abas na ordem salva, cada uma com seus terminais na ordem salva, mesmo `cwd`, mesmo agente e mesmo modo de layout.
4. WHILE não existe estado salvo o sistema SHALL abrir uma única aba vazia com o `EmptyState` visível, preservando EMPTY-03.
5. IF o `cwd` salvo de um terminal não existe mais THEN o sistema SHALL abrir esse terminal em `home` e informar qual diretório sumiu, como TERM-07 já define.
6. IF a leitura do estado salvo falhar THEN o sistema SHALL abrir uma única aba vazia e registrar o erro, nunca impedir a abertura do app.
7. The system SHALL substituir o estado salvo por completo a cada gravação, dentro de uma transação — nunca deixar o banco com abas de uma gravação e terminais de outra.
8. IF o modo de layout salvo não é reconhecido THEN o sistema SHALL usar `horizontal` com variante `first`.
9. The system SHALL abrir cada terminal restaurado como sessão nova — processo e scrollback anteriores não são restaurados.

**Independent Test**: abrir 2 abas com terminais e layouts diferentes, fechar o
app, reabrir, e encontrar as duas abas com os mesmos terminais, ordem e layout.

---

## Edge Cases

- IF o modo salvo é `vertical` e a aba restaurada tem 1 terminal THEN o sistema SHALL renderizá-lo ocupando a área inteira, sem tratamento especial.
- IF a aba tem um terminal em `maximized` THEN o sistema SHALL manter o comportamento de TERM-04 (ocupa tudo, os outros seguem montados e fora de vista) em qualquer modo de layout.
- IF um terminal minimizado participa da ordem THEN o sistema SHALL mantê-lo na ordem para efeito de restauração, mas **fora do plano do grid** — a altura recolhida de 34px foi revogada por MIN-01 (`.specs/features/minimized-tray/spec.md`, AD-016): minimizado sai da tela por inteiro e os visíveis se redistribuem sem ele.
- WHEN o usuário arrasta um terminal para cima dele mesmo THEN o sistema SHALL manter a ordem inalterada.
- IF o banco tem terminais órfãos, apontando para uma aba que não existe mais, THEN o sistema SHALL descartá-los na restauração.
- WHEN todas as abas salvas estão sem terminais THEN o sistema SHALL restaurar as abas assim mesmo e exibir o `EmptyState` na aba ativa.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| LAYOUT-01 | P1: Popover | Execute | Done |
| LAYOUT-02 | P1: Popover | Execute | Done |
| LAYOUT-03 | P1: Popover | Execute | Done |
| LAYOUT-04 | P1: Popover | Execute | Done |
| LAYOUT-05 | P1: Popover | Execute | Done |
| LAYOUT-06 | P1: Popover | Execute | Done |
| LAYOUT-07 | P1: Disposição | Execute | Done |
| LAYOUT-08 | P1: Disposição | Execute | Done |
| LAYOUT-09 | P1: Disposição | Execute | Done |
| LAYOUT-10 | P1: Disposição | Execute | Done |
| LAYOUT-11 | P1: Disposição | Execute | Done |
| LAYOUT-12 | P1: Disposição | Execute | Done |
| LAYOUT-13 | P1: Disposição | Execute | Done |
| LAYOUT-14 | P1: Disposição | Execute | Done |
| LAYOUT-15 | P1: Disposição | Execute | Done |
| LAYOUT-16 | P1: Reordenar | Execute | Done |
| LAYOUT-17 | P1: Reordenar | Execute | Done |
| LAYOUT-18 | P1: Reordenar | Execute | Done |
| LAYOUT-19 | P1: Reordenar | Execute | Done |
| LAYOUT-20 | P1: Reordenar | Execute | Done |
| LAYOUT-21 | P1: Persistência | Execute | Done |
| LAYOUT-22 | P1: Persistência | Execute | Done |
| LAYOUT-23 | P1: Persistência | Execute | Done |
| LAYOUT-24 | P1: Persistência | Execute | Done |
| LAYOUT-25 | P1: Persistência | Execute | Done |
| LAYOUT-26 | P1: Persistência | Execute | Done |
| LAYOUT-27 | P1: Persistência | Execute | Done |
| LAYOUT-28 | P1: Persistência | Execute | Done |
| LAYOUT-29 | P1: Persistência | Execute | Done |

Mapa AC → ID (a ordem dos ACs dentro de cada história é a ordem dos IDs):

- P1 Popover: AC1..AC6 → LAYOUT-01..06
- P1 Disposição: AC1..AC9 → LAYOUT-07..15
- P1 Reordenar: AC1..AC5 → LAYOUT-16..20
- P1 Persistência: AC1..AC9 → LAYOUT-21..29

**ID format:** `LAYOUT-[NUMBER]`

**Coverage:** 29 total, todos implementados e cobertos por teste. LAYOUT-01..20
nas fases 1-4 (T1..T7); LAYOUT-21..29 (persistência) nas fases 5-6 (T8..T12).

O passe de correção pós-Verifier (16/08/2026) fechou as duas lacunas do
relatório de validação:

- **LAYOUT-25**: a metade visível ("informar qual diretório sumiu") passou a
  existir. `fromLayoutEntries` carrega `cwdFallbackFrom`
  (`src/state/terminals.ts`) e `App.tsx` mostra um aviso dispensável, uma linha
  por terminal afetado. Testes: `src/state/terminals.test.ts` (passagem do
  campo) e `src/App.test.tsx` (aviso nomeia o diretório, some ao ser fechado,
  não aparece sem fallback). A metade de backend já era testada em
  `src-tauri/src/terminal/layout.rs`.
- **LAYOUT-29**: ganhou assertiva própria em `src/App.test.tsx` — restaurar 5
  terminais dispara 5 `pty_spawn`, um por painel, e cada chamada leva só `cwd`
  e agente. Nenhum id de sessão e nenhuma saída anterior trafega, porque não
  existe campo para isso. O dublê de `TerminalPane` espelha o `pty_spawn` de
  mount do componente real.

Os dois edge cases de `maximized`/`minimized` combinados com um modo de layout
que não é o default passaram a ter teste em
`src/components/grid/GridLayout.test.tsx`.

## Requisitos revistos por `session-restore` (17/08/2026, AD-014)

- **LAYOUT-23** — *revisto, não revogado.* A recriação das abas na ordem salva,
  com `cwd`, agente e modo de layout, continua exatamente igual; o que mudou é
  **quando** ela acontece: depois da confirmação no modal de restauração
  (SESS-01, SESS-06), não no primeiro render. O caminho sem modal — workspace
  salvo só com abas vazias (SESS-02) — preserva LAYOUT-23 ao pé da letra. O
  teste do boot em `src/App.test.tsx` passou a confirmar o modal antes de
  asseverar o mesmo resultado de sempre.
- **LAYOUT-29** — *parcialmente revogado por SESS-12/SESS-13.* A metade do
  **PTY** continua valendo e continua testada: cada terminal restaurado nasce
  de um `pty_spawn` próprio, com processo novo e scrollback zerado. A metade da
  **conversa do agente** deixou de valer: com o switch em "sessão salva" o app
  passa `--resume <uuid>` ao CLI e o histórico volta. O teste correspondente
  foi renomeado para `cada terminal restaurado nasce de um pty_spawn próprio
  (LAYOUT-29)` e agora aceita `sessionId`/`resume` no payload do spawn.
- **Fora de escopo** — a linha "Modal escolhendo o que restaurar no boot" foi
  marcada como não mais aplicável na tabela acima.

---

## Dimensões implícitas (sweep de escopo Large)

| Dimensão | Resolução |
| --- | --- |
| Input validation & bounds | LAYOUT-28 (modo desconhecido cai no default); contagem de terminais já limitada a 4 por aba (TAB-05). |
| Failure / partial-failure | LAYOUT-26 (leitura falha → aba vazia, app abre); LAYOUT-27 (gravação em transação, nunca parcial). |
| Idempotency / retry | LAYOUT-27: a gravação substitui o estado inteiro, então repetir a mesma gravação é no-op observável. |
| Auth boundaries & rate limits | N/A — estado local, sem rede e sem multiusuário. |
| Concurrency / ordering | Gravação com debounce de 500 ms; a última vence. A ordem de exibição é a coluna de posição, não a ordem de inserção. |
| Data lifecycle / expiry | Sem TTL: fechar aba ou terminal os remove na gravação seguinte (LAYOUT-27 substitui tudo). LAYOUT-25 descarta terminal órfão. |
| Observability | LAYOUT-26 registra o erro de leitura; o resto é estado local sem métrica. |
| External-dependency failure | N/A — nenhuma chamada externa nesta feature. |
| State-transition integrity | LAYOUT-15 (variante sobrevive à contagem sair de 3 e voltar); LAYOUT-12/LAYOUT-13 (modo × contagem); edge cases de `maximized`/`minimized`. |

---

## Success Criteria

- [ ] Com 3 terminais, alternar entre as duas variantes de Horizontal troca qual painel ocupa a linha inteira, e a escolha sobrevive a fechar/reabrir o app.
- [ ] Arrastar um terminal para outra posição reordena os painéis sem que a saída acumulada de nenhum deles se perca.
- [ ] Fechar e reabrir o app devolve as mesmas abas, com os mesmos terminais, na mesma ordem e no mesmo modo de layout.
- [ ] Primeira execução (banco novo) continua abrindo em uma aba vazia com o `EmptyState`.
