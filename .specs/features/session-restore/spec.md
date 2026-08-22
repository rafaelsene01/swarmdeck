# session-restore — Especificação

## Problem Statement

Desde `terminal-layout-options` o app restaura o workspace salvo **sozinho e em
silêncio**: `terminal_workspace_get` devolve as abas e o `App` monta todos os
`TerminalPane` de uma vez (LAYOUT-23). Quem fechou o app com 3 abas e 8 terminais
reabre com 8 processos de agente subindo ao mesmo tempo, sem chance de dizer
"hoje só quero aquela aba". Pior: cada terminal restaurado arranca uma conversa
**nova** do agente (LAYOUT-29), porque nada no app fixa o id de sessão do CLI —
o contexto da conversa anterior existe no disco do Claude Code, mas o app não
sabe qual é e não tem como pedir de volta.

O `Modal escolhendo o que restaurar no boot` estava explicitamente em "Fora de
escopo" de `terminal-layout-options` ("Adiado pelo usuário em 16/08/2026"). Esta
feature é a retomada daquele adiamento.

## Goals

- [x] Modal de restauração no boot, fiel a `print/restore.png`: as abas salvas
      com seus terminais, tudo marcado por padrão, contador de seleção e dois
      botões — "Restore Selected" e "Start Fresh".
- [x] Switch por terminal entre **restaurar a sessão do agente** (padrão) e
      **nova sessão**.
- [x] Todo terminal nasce com um id de sessão de agente fixado pelo app
      (`claude --session-id <uuid>`), persistido junto do terminal — é isso que
      torna a retomada (`claude --resume <uuid>`) possível no boot seguinte.
- [x] "Reiniciar terminal" (TERM-13) passa a gerar um id de sessão novo, mantendo
      a promessa de contexto limpo.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Fixar/retomar sessão em Codex, Antigravity, opencode e Kimi | O Codex só expõe `codex resume <id>` como **subcomando**, sem flag para fixar o id no primeiro lançamento; os outros três não têm flag de sessão documentada. Suportá-los é preencher duas colunas de dados no catálogo (`session_new_flag` / `session_resume_flag`) quando existir flag — não é código novo. |
| Restaurar o PTY, o processo ou o scrollback | Continua impossível: o PTY morre com o app. O que volta é a **conversa do agente**, reaberta pelo CLI, não o terminal anterior. |
| Lembrar a escolha ("não perguntar de novo") | Nenhum pedido nesse sentido; o modal aparece sempre que houver terminal salvo. |
| Renomear, reordenar ou criar aba dentro do modal | O modal confirma o que já existe; editar workspace é o app. |
| Modal só depois de fechamento anormal | O pedido é "quando o aplicativo abrir se identificado que tinhamos abas e terminais configurados" — todo boot com terminal salvo, sem detectar crash. |
| Listar/escolher sessões antigas do CLI | O app retoma **a** sessão que ele mesmo fixou para aquele painel; navegar no histórico do CLI é feature de produto própria. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Agente sem suporte a sessão nomeada no modal | Switch visível, travado em "nova sessão", com a dica "este agente não guarda sessão" | Escolhido pelo usuário entre três alternativas; esconder o switch faria o usuário procurar uma opção que sumiu sem explicação | y |
| "Start Fresh" e o workspace salvo | Apaga: abre com uma aba vazia e grava esse estado por cima do salvo | Escolhido pelo usuário; é o que o botão promete. A conversa do Claude continua no disco do CLI — o que o app esquece é o ponteiro para ela | y |
| × e Escape no modal | Equivalem a "Start Fresh" | Escolhido pelo usuário, ciente de que um Escape acidental descarta os ponteiros de sessão | y |
| Flags do Claude Code | `--session-id <uuid>` no primeiro lançamento, `--resume <uuid>` nos seguintes | Documentação oficial (`code.claude.com/docs/en/sessions`): `--session-id` só vale na primeira execução daquele id; depois é `--resume` | y |
| Formato do id de sessão | UUID gerado no frontend com `crypto.randomUUID()` | O Claude Code exige UUID válido em `--session-id`; é a mesma fonte que já gera `terminal.id` em `App.tsx` | y |
| Terminal salvo antes desta feature (sem id de sessão) | Tratado como "nova sessão", com o switch travado | Não há id para retomar; oferecer o switch prometeria algo que o CLI recusaria com "No conversation found with session ID" | y |
| Onde mora o id de sessão | Coluna nova `agent_session_id` em `terminal_layout` (migração 009) | O workspace já é a única fonte do que restaurar (LAYOUT-22); um segundo armazenamento sairia de sincronia com o `DELETE`+`INSERT` de `layout::save` | y |
| Aba salva sem nenhum terminal | Aparece no modal, marcada, sem linhas de terminal | LAYOUT-24 já garante que aba vazia é estado legítimo; escondê-la faria a aba sumir sem o usuário ter pedido | y |
| Modal quando o workspace salvo não tem nenhum terminal | Não aparece; as abas vazias são restauradas direto | Não há nada a confirmar; um modal com zero linhas seria ruído | y |
| Sessão que o CLI recusa retomar | O erro do CLI fica visível no terminal; o app não relança nem tenta sessão nova sozinho | O app não tem como distinguir "sessão apagada" de "CLI quebrado", e relançar em silêncio esconderia a causa do usuário | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Confirmar o que volta no boot ⭐ MVP

**User Story**: Como usuário do SwarmDeck, quero escolher quais abas e terminais
reabrem quando o app inicia, para que reabrir o app não signifique subir todos os
agentes que eu tinha ontem.

**Why P1**: É o pedido central e o que `print/restore.png` documenta. Sem ele o
boot continua restaurando tudo em silêncio.

**Acceptance Criteria**:

1. WHEN o app inicia e o workspace salvo tem pelo menos um terminal THEN o sistema SHALL exibir o modal de restauração e SHALL não montar nenhum terminal antes da escolha do usuário.
2. WHEN o app inicia e o workspace salvo não tem nenhum terminal THEN o sistema SHALL restaurar as abas salvas direto, sem exibir o modal.
3. WHILE o modal está aberto o sistema SHALL listar cada aba salva com seu nome e cada terminal dela com o ícone do agente e o `cwd`, todos marcados.
4. WHEN o usuário desmarca ou remarca um terminal THEN o sistema SHALL atualizar o contador para "N/M selecionados", com N igual ao número de terminais marcados.
5. WHEN o usuário desmarca uma aba THEN o sistema SHALL desmarcar todos os terminais dela; WHEN o usuário a remarca THEN o sistema SHALL remarcar todos.
6. WHEN o usuário aciona "Restore Selected" THEN o sistema SHALL abrir somente as abas e os terminais marcados, na ordem salva, e SHALL descartar do workspace salvo os não marcados.
7. WHEN o usuário aciona "Start Fresh" THEN o sistema SHALL abrir com uma única aba vazia e nenhum terminal, e SHALL substituir o workspace salvo por esse estado.
8. WHEN o usuário pressiona Escape ou aciona o × do modal THEN o sistema SHALL aplicar o mesmo efeito de "Start Fresh".
9. WHILE nenhum terminal está marcado o sistema SHALL desabilitar "Restore Selected".

**Independent Test**: fechar o app com 2 abas e 3 terminais, reabrir, desmarcar um
terminal, acionar "Restore Selected" e encontrar 2 terminais montados; fechar e
reabrir de novo e ver que o desmarcado não volta.

---

### P2: Retomar a conversa do agente

**User Story**: Como usuário do SwarmDeck, quero que o terminal restaurado
reabra a conversa que eu tinha com o agente, para que reabrir o app não me
custe o contexto acumulado.

**Why P2**: Sem P1 não há onde escolher; com P1 e sem P2 o modal só decide
**quais** terminais voltam, não **com o quê**.

**Acceptance Criteria**:

1. WHEN um terminal é criado pelo diálogo de novo terminal ou por "clonar" (TERM-12) THEN o sistema SHALL gerar para ele um id de sessão de agente no formato UUID e SHALL persistí-lo junto do terminal.
2. WHERE o agente escolhido declara flag de sessão nova, WHEN o terminal arranca sem retomada THEN o sistema SHALL lançar o CLI com essa flag seguida do id de sessão (`claude --session-id <uuid>`).
3. WHERE o agente escolhido declara flag de retomada, WHEN o terminal arranca em modo "restaurar sessão" THEN o sistema SHALL lançar o CLI com essa flag seguida do id de sessão (`claude --resume <uuid>`), e SHALL não passar a flag de sessão nova.
4. WHERE o agente escolhido não declara flag de sessão o sistema SHALL lançar o CLI sem nenhuma flag de sessão, preservando o comportamento atual.
5. WHILE o modal está aberto o sistema SHALL apresentar, para cada terminal, um switch de dois estados — "restaurar sessão" (padrão) e "nova sessão".
6. WHILE o terminal listado não tem id de sessão salvo, ou seu agente não declara flag de retomada, o sistema SHALL desabilitar o switch desse terminal no estado "nova sessão" e SHALL exibir a dica "este agente não guarda sessão".
7. WHEN o usuário aciona "Restore Selected" com um terminal em "nova sessão" THEN o sistema SHALL abrir esse terminal com um id de sessão novo, descartando o salvo.
8. WHEN o usuário aciona "reiniciar terminal" (TERM-13) THEN o sistema SHALL gerar um id de sessão novo para aquele painel e SHALL arrancar sem retomada, preservando a promessa de contexto limpo.

**Independent Test**: abrir um terminal Claude Code, conversar, fechar o app,
reabrir, deixar o switch em "restaurar sessão" e ver o CLI reabrir com o
histórico; repetir deixando o switch em "nova sessão" e ver o CLI abrir limpo.

---

## Edge Cases

- IF a leitura do workspace salvo falhar THEN o sistema SHALL abrir com uma aba vazia e sem modal, registrando o erro (LAYOUT-26 inalterado).
- IF um terminal salvo não tem `agentSessionId` (workspace gravado antes desta feature) THEN o sistema SHALL abri-lo com um id de sessão novo.
- IF o CLI recusa a retomada (sessão inexistente no disco dele) THEN o sistema SHALL deixar a mensagem do CLI visível no terminal, sem relançar.
- WHEN uma aba salva não tem terminais THEN o sistema SHALL listá-la no modal, marcada, sem linhas de terminal.
- WHEN o usuário desmarca todos os terminais de uma aba THEN o sistema SHALL manter a aba marcada e restaurá-la vazia, com o `EmptyState`.
- IF a restauração deixaria o app sem nenhuma aba THEN o sistema SHALL abrir uma aba vazia, nunca renderizar sem aba (TAB-02).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SESS-01 | P1: Modal | Execute | Verified |
| SESS-02 | P1: Modal | Execute | Verified |
| SESS-03 | P1: Modal | Execute | Verified |
| SESS-04 | P1: Modal | Execute | Verified |
| SESS-05 | P1: Modal | Execute | Verified |
| SESS-06 | P1: Modal | Execute | Verified |
| SESS-07 | P1: Modal | Execute | Verified |
| SESS-08 | P1: Modal | Execute | Verified |
| SESS-09 | P1: Modal | Execute | Verified |
| SESS-10 | P2: Sessão | Execute | Verified |
| SESS-11 | P2: Sessão | Execute | Verified |
| SESS-12 | P2: Sessão | Execute | Verified |
| SESS-13 | P2: Sessão | Execute | Verified |
| SESS-14 | P2: Sessão | Execute | Verified |
| SESS-15 | P2: Sessão | Execute | Verified |
| SESS-16 | P2: Sessão | Execute | Verified |
| SESS-17 | P2: Sessão | Execute | Verified |

Mapa AC → ID (a ordem dos ACs dentro de cada história é a ordem dos IDs):

- P1 Modal: AC1..AC9 → SESS-01..09
- P2 Sessão: AC1..AC8 → SESS-10..17

**Coverage:** 17 total, 17 mapeados a tasks.

---

## Requisitos revistos de `terminal-layout-options`

- **LAYOUT-23** ("WHEN o app inicia e existe estado salvo THEN o sistema SHALL
  recriar as abas na ordem salva...") — **revisto por SESS-01/SESS-06**: a
  recriação continua igual, mas passa a acontecer **depois** da confirmação no
  modal, não no primeiro render. O caminho sem modal (workspace sem terminal,
  SESS-02) preserva LAYOUT-23 literalmente.
- **LAYOUT-29** ("The system SHALL abrir cada terminal restaurado como sessão
  nova — processo e scrollback anteriores não são restaurados") — **parcialmente
  revogado por SESS-12**. A metade do PTY continua valendo: processo novo,
  scrollback zerado. A metade da **conversa do agente** deixa de valer: com o
  switch em "restaurar sessão" o CLI reabre o histórico. Decisão registrada em
  `.specs/STATE.md` (AD-014).
- A linha "Modal escolhendo o que restaurar no boot" da tabela **Fora de escopo**
  de `terminal-layout-options` deixa de valer — é esta feature.

---

## Dimensões implícitas

| Dimensão | Cobertura |
| --- | --- |
| Input validation & bounds | Id de sessão é UUID gerado pelo app, nunca digitado (P2 AC1); teto de 4 terminais por aba (TAB-05) é herdado do que foi salvo, o modal não cria terminal. |
| Failure / partial-failure states | Leitura do workspace que falha abre aba vazia sem modal (Edge Cases); retomada recusada pelo CLI fica visível (Edge Cases). |
| Idempotency / retry / duplicate handling | O modal aparece uma vez por boot; qualquer saída dele (Restore/Fresh/Escape) grava o workspace resultante, então reabrir o app é idempotente sobre a escolha anterior. |
| Auth boundaries & rate limits | N/A — feature local, sem chamada autenticada; a autenticação do agente é do CLI. |
| Concurrency / ordering | Nenhum `TerminalPane` monta antes da escolha (SESS-01), o que elimina a corrida entre "spawn do boot" e "escolha do usuário" que existiria se o modal fosse aplicado depois. |
| Data lifecycle / expiry | Sem TTL: "Start Fresh" e "Restore Selected" gravam o workspace resultante por completo (LAYOUT-27 inalterado); id de sessão morre com o terminal. |
| Observability | Falha de leitura/gravação do workspace continua em `console.error` (LAYOUT-26). |
| External-dependency failure | CLI ausente do PATH continua caindo para shell puro sem flag de sessão (AGT-04 inalterado). |
| State-transition integrity | O terminal tem dois estados de arranque, mutuamente exclusivos: retomada e sessão nova (P2 AC2/AC3); "reiniciar" (SESS-17) sempre leva ao segundo. |

---

## Success Criteria

- [x] Fechar o app com terminais e reabrir mostra o modal antes de qualquer PTY subir.
- [x] Desmarcar um terminal no modal faz ele não voltar — nem naquele boot, nem no seguinte.
- [x] Um terminal Claude Code restaurado com o switch em "restaurar sessão" reabre com o histórico da conversa.
- [x] "Start Fresh" abre uma aba vazia com o `EmptyState` e o banco passa a refletir isso.
