# session-restore — Relatório de validação

**Verdict: PASS**
**Data:** 17/08/2026
**Diff range:** working tree contra `093544d` (23 arquivos: 20 modificados, 3 novos)

## Limitação declarada — autor == verificador

O contrato do `tlc-spec-driven` pede um Verifier em sub-agente novo
(author ≠ verifier). Este ambiente proíbe despachar sub-agente sem pedido
explícito do usuário, então rodou o **fallback standalone** previsto pela
própria skill: passe independente após a última task, com sensor de
discriminação. O que isso custa está registrado aqui em vez de mascarado: a
cobertura foi re-derivada pelo mesmo autor, então um ponto cego de
interpretação da spec sobreviveria a este passe. O sensor mitiga em parte —
mutação que os testes não matam é fato observável, não opinião.

## Evidência por requisito

| ID | Evidência (implementação) | Evidência (teste) |
| --- | --- | --- |
| SESS-01 | `src/App.tsx:274` (`pendingRestore`), `src/App.tsx:322-329` (segura em vez de aplicar), `src/App.tsx:959` (modal montado) | `src/App.test.tsx` — "workspace com terminal salvo abre o modal e não sobe nenhum PTY antes da escolha" (assevera `spawns()` vazio) |
| SESS-02 | `src/App.tsx:327` (`applyWorkspace(saved, {})` no caminho sem terminal) | `src/App.test.tsx` — "workspace só com abas vazias restaura direto, sem modal" |
| SESS-03 | `src/components/shell/RestoreSessionDialog.tsx:78-89` (estado inicial), `:262-330` (render) | `RestoreSessionDialog.test.tsx` — "nasce com todas as abas e todos os terminais marcados" |
| SESS-04 | `RestoreSessionDialog.tsx:107` (`selectedCount`), `:352` (contador) | `RestoreSessionDialog.test.tsx` — "o contador acompanha os terminais marcados" |
| SESS-05 | `RestoreSessionDialog.tsx:110-118` (`toggleTab`) | `RestoreSessionDialog.test.tsx` — "desmarcar e remarcar a aba propaga para os terminais dela" |
| SESS-06 | `src/App.tsx:342-357` (`handleRestoreSelection` filtra abas e terminais) | `src/App.test.tsx` — "terminal desmarcado não é montado nem regravado" (checa tela **e** payload de `terminal_workspace_set`) |
| SESS-07 | `src/App.tsx:362-368` (`handleStartFresh`, `hydrated.current = true`) | `src/App.test.tsx` — `"Começar do zero" abre uma aba vazia e grava esse estado por cima do salvo` |
| SESS-08 | `RestoreSessionDialog.tsx:95-105` (Escape), `:253` (×); ambos chamam `onStartFresh` | `RestoreSessionDialog.test.tsx` — `"Começar do zero", o × e Escape acionam onStartFresh`; `src/App.test.tsx` — "Escape no modal equivale a Começar do zero" |
| SESS-09 | `RestoreSessionDialog.tsx:379` (`disabled={selectedCount === 0}`) | `RestoreSessionDialog.test.tsx` — "desabilita Restaurar selecionados quando nenhum terminal está marcado" |
| SESS-10 | `src-tauri/src/db/migrations/009_terminal_session.sql`, `src-tauri/src/terminal/layout.rs:44-49` + `save`/`restore`; `src/state/terminals.ts` (`agentSessionId` nos dois conversores) | `layout.rs` — "save_seguido_de_restore_devolve_o_agent_session_id", "restore_devolve_none_para_terminal_gravado_sem_id_de_sessao"; `terminals.test.ts` — 4 asserções de ida e volta |
| SESS-11 | `src/App.tsx:106` (`createAgentSessionId`), `:124` (`defaultTerminal`), `:404` (clone reusa `defaultTerminal`) | `src/App.test.tsx` — "terminal novo arranca fixando uma sessão nova", "clonar dá ao clone uma sessão própria" |
| SESS-12 | `src-tauri/src/agents/launch.rs:69-84` (`session_args`), `catalog.rs:47-49` (`--session-id`), `manager.rs` (`build_command`) | `launch.rs` — "sessao_nova_passa_a_flag_de_fixar_id"; `manager.rs` — "build_command_aplica_os_argumentos_da_resolucao_na_ordem" |
| SESS-13 | `launch.rs:74-78` (ramo `resume`) | `launch.rs` — "sessao_retomada_passa_a_flag_de_retomada_e_nao_a_de_fixar"; `src/App.test.tsx` — "Restaurar selecionados monta os marcados retomando a sessão salva" (assevera `sessionId` salvo + `resume: true`) |
| SESS-14 | `launch.rs:80-83` (`None` ⇒ `args` vazio) | `launch.rs` — "agente_sem_flag_de_sessao_nao_recebe_argumento_nenhum", "fallback_para_shell_nao_leva_argumento_de_sessao"; `catalog.rs` — "so_claude_code_declara_flags_de_sessao" |
| SESS-15 | `commands/agents.rs` (`supportsSessionResume`), `src/App.tsx:166` + `:216-219`, `RestoreSessionDialog.tsx:71-74` (`canResume`) | `RestoreSessionDialog.test.tsx` — "trava o switch em nova quando o agente não retoma ou não há sessão salva" (cobre os dois motivos) |
| SESS-16 | `src/App.tsx:286-292` (id novo quando `resume` é falso) | `src/App.test.tsx` — "terminal marcado como nova sessão arranca com id novo e sem retomada" |
| SESS-17 | `src/App.tsx:518-525` (`handleResetTerminal` troca o id e zera `resumeSession`) | `src/App.test.tsx` — "reiniciar o terminal troca o id de sessão e não retoma" |

## Conferência ancorada na spec

Cada teste acima assevera o **valor definido pela spec**, não o que o código
produz. Dois pontos onde isso importou:

- SESS-13 é asseverado nos dois níveis: o argumento exato em Rust
  (`["--resume", "<id>"]`) e o par `(sessionId, resume)` que chega ao
  `pty_spawn` no nível de App. Só o segundo passaria se `session_args`
  trocasse as flags — foi exatamente a mutação M1.
- SESS-07 exige **duas** consequências ("abre limpo" e "grava por cima do
  salvo"). O teste assevera as duas; asseverar só a tela deixaria passar a
  mutação M3.

### Gap de precisão aceito conscientemente

SESS-13 é provado até o argumento passado ao `CommandBuilder`
(`manager.rs::build_command`). Que o Claude Code **de fato** reabra a conversa
com `--resume <uuid>` é comportamento do CLI de terceiro, não observável em
jsdom nem em teste Rust sem lançar o CLI real. Registrado aqui em vez de
mascarado: o teste manual no app real é o passo que fecha isso.

## Sensor de discriminação

Mutações aplicadas em cópia de segurança fora da árvore
(`scratchpad/*.bak`), nunca via `git stash`; árvore restaurada e conferida com
`git status --porcelain` depois de cada uma.

| # | Mutação | Resultado |
| --- | --- | --- |
| M1 | `launch.rs::session_args` — ramo `resume` passa a devolver `session_new_flag` | **morta** por `sessao_retomada_passa_a_flag_de_retomada_e_nao_a_de_fixar` |
| M2 | `App.tsx` — condição do modal vira `false` (boot sempre restaura direto, como antes da feature) | **morta** por 9 testes, entre eles "workspace com terminal salvo abre o modal e não sobe nenhum PTY antes da escolha" |
| M3 | `App.tsx::handleStartFresh` — não marca `hydrated`, então nada é gravado | **morta** por `"Começar do zero" abre uma aba vazia e grava esse estado por cima do salvo` |

**3/3 mutantes mortos.** Nenhum sobreviveu.

## Gate final

| Comando | Resultado |
| --- | --- |
| `npm run build` | ✅ built in 3.66s |
| `npm test` | ✅ 247 testes, 24 arquivos |
| `cargo test --manifest-path src-tauri/Cargo.toml` | ✅ 254 testes (185 lib + 69 integração) |

## Specs vizinhas

- `terminal-layout-options/spec.md`: LAYOUT-23 marcado como **revisto**,
  LAYOUT-29 como **parcialmente revogado**, linha de Fora de Escopo marcada
  como não mais aplicável. A prova de que LAYOUT-23 continua valendo é o
  próprio teste dele, que agora confirma o modal antes de asseverar o mesmo
  resultado de antes.
- `.specs/STATE.md`: AD-014 registrada, com os três trade-offs (passo manual
  no boot, Escape destrutivo, suporte só para Claude Code).
