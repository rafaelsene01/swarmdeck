# agent-permission-mode — escolher o modo de permissão do agente (PERM-01..PERM-07)

Feature nova, criada em 19/08/2026 a pedido do usuário. Registra a escolha do
modo de permissão (`claude --permission-mode <modo>`) no passo AGENT do wizard
de terminal, sua persistência no workspace, e a exibição do modo ativo no
cabeçalho do terminal.

Decisão de projeto correspondente: **AD-028** em `.specs/STATE.md`.

## Problem Statement

O passo AGENT do wizard lança `claude` sempre no modo de permissão padrão da
CLI. Quem quer rodar uma sessão longa sem aprovar cada ação, ou o contrário —
revisar tudo à mão num repositório sensível — precisa sair do app, abrir a
sessão na mão e passar a flag. O app decide *qual* agente sobe e *em qual
projeto*, mas não sob qual regime de permissão, que é a decisão de risco.

## Fonte dos valores

Os modos e as descrições **não são inventados**. Os valores vieram do
`claude --help` da versão instalada nesta máquina:

```
--permission-mode <mode>   Permission mode to use for the session
                           (choices: "acceptEdits", "auto",
                            "bypassPermissions", "manual", "dontAsk", "plan")
```

As descrições exibidas ao usuário vieram da documentação oficial
(`code.claude.com/docs/en/permission-modes`, tabela "Available modes"): a
coluna "What runs without asking" vira a primeira frase e "Best for" a segunda.
`manual` é o apelido de `default`, e é o nome que a própria CLI usa.

## User Stories

**US-1: Escolher o regime antes de abrir a sessão.** Como usuário do
SwarmDeck, quero escolher o modo de permissão no mesmo passo em que escolho o
agente, para que a sessão já suba sob o regime que aquele trabalho pede — sem
sair do app.

**US-2: Saber o que cada modo faz.** Como usuário, quero ler o que cada modo
permite antes de escolher, para que `bypassPermissions` seja uma decisão
informada e não um botão bonito.

**US-3: Reconhecer o regime de cada terminal.** Como usuário com quatro
terminais abertos, quero ver no cabeçalho sob qual modo cada agente está
rodando, para nunca confundir o painel sem verificação com os outros.

## Assumptions & Open Questions

- **Assumido**: os seis valores de `--permission-mode` são estáveis o bastante
  para virar catálogo estático. Se a CLI acrescentar um, ele só aparece depois
  de entrar em `PERMISSION_MODES`; se remover um, o CLI recusa e o terminal
  falha no arranque com a mensagem dele. Aceito: a lista é uma linha só, e a
  alternativa (perguntar à CLI em runtime) custaria um processo por abertura de
  wizard.
- **Assumido**: `auto` como pré-marcado espelha o padrão da própria CLI nos
  planos Pro/Max/Team, documentado em "Which mode a session starts in".
- **Decidido pelo usuário (19/08/2026)**: seis modos em vez dos três citados no
  pedido original; e persistir a escolha no workspace em vez de tratá-la como
  decisão de arranque.
Open questions: se algum dia outro CLI do catálogo ganhar uma flag equivalente
  com **outros** valores, `PERMISSION_MODES` deixa de servir para todos e vira
um campo por descritor. Nenhum agente do catálogo exige isso hoje.

## Requisitos (EARS)

**PERM-01** — Quando o usuário confirma "Nova sessão" no passo AGENT com um
agente que declara a flag de modo, o sistema deve lançar o CLI daquele agente
com `--permission-mode <modo escolhido>`, depois dos argumentos de sessão. Sem
modo escolhido, ou com agente que não declara a flag, nenhum argumento de modo
é passado e o CLI aplica o padrão dele.

**PERM-02** — O modo chega ao backend como string vinda do frontend. O sistema
deve descartar qualquer valor fora do catálogo de modos conhecidos, sem
repassá-lo à linha de comando e sem falhar o arranque do terminal.

**PERM-03** — Enquanto `agent_catalog` responde, o sistema deve informar, por
agente, a lista de modos que o CLI dele aceita, vazia para quem não declara a
flag. O frontend decide mostrar o seletor por essa lista, nunca por um teste de
id.

**PERM-04** — Quando o workspace é gravado, o sistema deve persistir o modo de
permissão de cada terminal; ao restaurar, o terminal deve subir com o mesmo
modo. Clonar e reiniciar um terminal preservam o modo. Terminal gravado antes
desta feature restaura sem modo, e o CLI aplica o padrão dele.

**PERM-05** — Enquanto o passo AGENT está aberto com um agente que declara
modos, o sistema deve exibir um botão por modo, na ordem do catálogo, com
`auto` pré-marcado, e deve permitir trocar a escolha antes de confirmar. Agente
sem modos declarados — e o terminal limpo — não exibem o seletor. Passar o
mouse sobre outro agente não altera a lista exibida.

**PERM-06** — Cada botão de modo deve descrever, ao passar o mouse, o que
aquele modo permite rodar sem perguntar e para que ele serve.

**PERM-07** — Enquanto um terminal está aberto, o cabeçalho dele deve exibir o
modo de permissão com que o agente foi lançado, com a mesma descrição no hover.
Terminal sem modo (shell puro, ou agente sem a flag) não exibe selo. Um modo
que o app ainda não traduz é exibido pelo próprio id, nunca omitido.

## Decisões técnicas

- **O catálogo Rust é a fonte única da lista.** `PERMISSION_MODES`
  (`agents/catalog.rs`) é ao mesmo tempo a ordem de exibição, a lista que
  `agent_catalog` publica ao frontend (PERM-03) e a **fronteira de confiança**
  que valida o que vira argumento (PERM-02). O mapa de rótulos e descrições no
  frontend (`AgentStep.tsx`) só traduz: um modo novo aparece na tela mesmo sem
  entrada lá, com o próprio id como rótulo.
- **`permission_mode_flag` no descritor, não um `match` por id.** Segue o
  mesmo padrão de `session_new_flag` / `session_resume_flag`: suportar outro
  agente é preencher uma coluna do catálogo.
- **O modo é lido no mount do `TerminalPane`**, como `sessionId` e `resume`.
  Trocar o modo de uma sessão viva não é o que esta feature promete; trocar
  exige reiniciar o terminal, que já remonta o painel (TERM-13).
- **Persistência espelha `agentId`**: coluna em `terminal_layout` (migração
  010, anulável, sem backfill) no backend, e um `Record<id, modo>` à parte no
  `App.tsx` — não um campo do `LayoutEntry` do front.

## Out of Scope

- Trocar o modo de um terminal já aberto sem reiniciá-lo.
- Um modo padrão configurável em Configurações. `auto` é o pré-marcado, e o
  usuário troca por sessão.
- Modo de permissão para agentes que não sejam o Claude Code — nenhum outro CLI
  do catálogo declara a flag hoje.

## Requirement Traceability

| Requisito | Implementação | Teste |
| --- | --- | --- |
| PERM-01 | `src-tauri/src/agents/launch.rs` (`permission_args`), `src-tauri/src/terminal/manager.rs`, `src-tauri/src/commands/terminal.rs`, `src/components/terminal/TerminalPane.tsx` | `src-tauri/src/agents/launch.rs` (`permission_mode_tests`), `src/components/terminal/TerminalPane.test.tsx` |
| PERM-02 | `src-tauri/src/agents/catalog.rs` (`PERMISSION_MODES`, `is_valid_permission_mode`), `launch.rs` | `launch.rs::permission_mode_tests::modo_desconhecido_nao_vira_argumento` |
| PERM-03 | `src-tauri/src/commands/agents.rs`, `src/routes/settings/AgentPanel.tsx` (`AgentDescriptor`) | `launch.rs::permission_mode_tests::so_o_claude_code_declara_a_flag_de_modo` |
| PERM-04 | `src-tauri/src/db/migrations/010_terminal_permission_mode.sql`, `src-tauri/src/terminal/layout.rs`, `src/App.tsx` (`permissionModeByTerminalId`) | `src/App.test.tsx` (payload do workspace) |
| PERM-05 | `src/components/terminal/AgentStep.tsx`, `src/components/terminal/PaneWizard.tsx` | `src/components/terminal/AgentStep.test.tsx`, `src/components/terminal/PaneWizard.test.tsx` |
| PERM-06 | `src/components/terminal/AgentStep.tsx` (`PERMISSION_MODE_INFO`) | `src/components/terminal/AgentStep.test.tsx` |
| PERM-07 | `src/components/terminal/TerminalHeader.tsx`, `src/App.tsx` (CSS do selo) | `src/components/terminal/TerminalHeader.test.tsx` |

**Coverage:** 7 requisitos, 7 com teste, 0 sem cobertura.
