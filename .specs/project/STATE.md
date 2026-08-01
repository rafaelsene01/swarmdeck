# STATE — Memória do projeto

Última atualização: 31/07/2026

---

## Decisões

| Data | Decisão | Razão |
|---|---|---|
| 28/07/2026 | Stack: **Tauri 2 + Rust + React/TS** em vez de Electron | Binário ~10MB vs ~150MB, startup mais rápido, e o usuário já trabalha com Tauri em outro projeto. Custo aceito: PTY e integrações precisam ser reescritos em Rust. |
| 28/07/2026 | v1 cobre **apenas o núcleo gratuito** do original | É o único conjunto de features observável na instalação de referência. Especificar features PRO seria inventar comportamento. |
| 28/07/2026 | **Sem camada de monetização** no clone | O original usa tiers Starter/Pro para gate de features. O clone não tem produto comercial atrás — tudo construído é liberado. |
| 28/07/2026 | Specs derivadas de **observação de UI**, não de código | Nenhum arquivo do CodeAgentSwarm foi lido. Funcionalidade não é protegida por copyright; código e assets são. Manter essa separação limpa. |
| 28/07/2026 | Kanban em **janela separada**, como no original | Comportamento observado e defensável: o board é uma superfície de leitura/gestão distinta do trabalho no terminal. |
| 28/07/2026 | Servidor MCP como **sidecar separado**, não embutido no app | Não é escolha de estilo: o agente de CLI spawna servidores MCP como subprocesso stdio, e um app já rodando não pode ser esse subprocesso. |
| 28/07/2026 | Sidecar fala com o app por **IPC local**, e não escreve no banco direto | O app precisa possuir a escrita para empurrar `task_changed` às janelas. Escrita direta impossibilitaria o requisito de refletir no Kanban em < 1s. |
| 28/07/2026 | Saída do PTY via **`tauri::ipc::Channel`** com agregação de 16ms | Documentação do Tauri recomenda `Channel` para streaming e rate limiting explícito; `emit` por chunk derruba a UI sob saída volumosa. |
| 28/07/2026 | Regra "não pula a fase de teste" aplicada pela **ausência de aresta** na máquina de estados | Uma transição que não existe não pode ser esquecida; uma checagem `if` pode. |
| 28/07/2026 | **Sem arrastar cards** entre colunas no v1 | Não observado no original e conflita com a máquina de estados — arrastar para Completed pularia a fase de teste. |
| 28/07/2026 | Pipeline de CI/release **espelhado no `rafaelsene01/local-mind`**, adaptado | Pedido explícito do usuário. Os dois workflows de lá foram lidos na íntegra e servem de padrão validado em produção (o repositório já publicou releases reais). Adaptações obrigatórias: sai `protoc` (não há `lancedb`), sai `NO_STRIP` (não há binário de terceiro vendorizado), e o escritor de versão passa a editar o `Cargo.toml` **da raiz** — aqui `src-tauri` usa `version.workspace = true`. |
| 28/07/2026 | Release **só** por `workflow_dispatch`; push nunca publica | A garantia é estrutural: o `release.yml` não tem gatilho de `push`, `tag` nem `schedule`. Uma regra que depende de alguém lembrar não é uma regra. |
| 28/07/2026 | Escopo do updater: **pipeline completo** — assinatura, zip portátil e patch do `latest.json` | Escolha do usuário em 28/07/2026, ciente do custo: exige `tauri-plugin-updater` no app, geração do par de chaves e cadastro de secrets antes do primeiro release funcionar. O público-alvo roda em máquina corporativa onde instalador pede administrador; sem o portátil, esse público fica de fora. |
| 28/07/2026 | Versão do app **derivada** de `package.json` pelo `tauri.conf.json`, e `mainBinaryName` fixado em `SwarmDeck` | Uma cópia a menos para sincronizar, e um modo de falha barulhento (caminho inválido quebra o build). O binário hoje sai `swarmdeck.exe` enquanto o `productName` é `SwarmDeck` — divergência que apareceria dentro do zip portátil. |
| 28/07/2026 | **Um único módulo** (`paths.rs`) decide onde os dados moram | O modo portátil grava ao lado do executável e o instalado usa `app_data_dir()`. Com dois pontos de decisão, a diferença vaza. Como nada no código resolve caminho ainda, isso nasce certo em vez de ser reforma. |
| 28/07/2026 | **Contrato de ferramentas MCP congelado a partir do `CLAUDE.md` global**, sem validação prévia contra a implementação de referência | Escolha do usuário na triagem 001, ciente do trade-off apresentado: destrava `T0` e as 22 tarefas de M2 imediatamente, contra o risco de um nome divergir e quebrar em silêncio os prompts que ele já usa. O custo do erro é contido: o `rmcp` gera o schema a partir das assinaturas Rust, então renomear no código é barato — o caro é o prompt espalhado. Se um nome se provar errado depois, o conserto é rename + nota nesta tabela, não redesenho. |
| 28/07/2026 | **`Status: Draft` num `tasks.md` bloqueia execução automatizada** | Escolha do usuário na triagem 001. A `spec-loop` só executa feature cujo `tasks.md` esteja `In Progress` — hoje, só `multi-terminal`. Draft passa a significar "ainda não revisado pelo mantenedor", não "rascunho de forma". Consequência medida: a fila da run 001 cai de 24 para 7 tarefas. Para liberar uma feature, o mantenedor troca o `**Status**` dela e uma triagem nova reabre a fila. |
| 28/07/2026 | `cargo fmt --check` entra no CI agora; `clippy -D warnings` fica em P3 | `fmt` foi **medido** nesta sessão e passava (exit 0). Clippy não foi medido — ligar sem medir transformaria "introduzir CI" numa refatoração de escopo desconhecido. **⚠️ Remedido na triagem 001 (28/07/2026): `cargo fmt --check` agora sai com exit 1.** ~~7 arquivos com diff~~ — **corrigido na triagem 002: são 7 _hunks_ em apenas 3 arquivos** (`src-tauri/src/db/mod.rs`, `src-tauri/src/terminal/throttle.rs`, `src-tauri/tests/session.rs`). A triagem 001 contou linhas `Diff in` e as chamou de arquivos; o `rustfmt` emite uma por trecho, não por arquivo. Remedido por `cargo fmt --check | grep '^Diff in' | sed 's/:[0-9]*:$//' | sort -u | wc -l` → 3. A decisão continua válida; o que envelheceu foi o número. Formatar é pré-requisito de `release-distribution/T1`, senão o primeiro CI nasce vermelho. |
| 28/07/2026 | **Tarefa cujo `Verify` exige o app rodando é `uat-agent`: o agente dirige o app** — e **nenhuma dupla `uat-agent` roda em paralelo**, mesmo marcada `[P]` | Escolha do usuário na triagem 002. Atinge `multi-terminal/T6, T7, T9, T10, T11`. O `[P]` da spec vale contra colisão de **arquivo**; ele não sabe que duas tarefas disputam a mesma **janela do app** — duas instâncias brigando pelo mesmo banco e pelo mesmo PTY dão falha que não se reproduz. Trade-off aceito: a fila executável sobe de 4 para 9 itens, contra o risco de a instabilidade de clique já registrada em § Lições produzir um "verificado" que ninguém viu. Contido por duas regras escritas em `multi-terminal/tasks.md`: **reler o screenshot** para confirmar que a ação aconteceu (nunca assumir que o clique pegou), e **verificação não confirmada não fecha a task** — "não consegui confirmar" é resultado válido, ✅ inventado não é. |
| 31/07/2026 | **`release-distribution` liberado para execução (`Draft` → `In Progress`); `agent-selection` permanece `Draft`** | Escolha do usuário na run 003. A AD de 28/07/2026 faz de `Draft` um bloqueio de execução automatizada; o usuário revisou e liberou **apenas** o `release-distribution`. Consequência medida: a fila desta run cobre `release-distribution` (Fases A/B + `T13`) e `multi-terminal/T5–T11`, e **exclui `agent-selection` inteira** — que era o segundo bloco pedido. Para liberá-la depois, basta trocar o `**Status**` do `tasks.md` dela. |
| 31/07/2026 | **Nenhum push nesta run: tarefa com gate `pipeline` para antes da execução no Actions** | Escolha do usuário na run 003. Atinge `rd/T2`, `T21`, `T6`, `T9–T12`, `T19`. O artefato (o YAML) é escrito e commitado localmente, mas a tarefa **não fecha** — `TESTING.md` é explícito: "não está pronta quando o YAML parseia; está pronta quando o run apareceu na aba Actions". Trade-off aceito: o repositório ganha o `ci.yml` sem que ninguém tenha provado que ele passa. Fechar exige um push humano. |
| 31/07/2026 | **O `Verify` de `uat-agent` não é executável neste ambiente e sai como NÃO CONFIRMADO** | O ambiente desta run não oferece screenshot nem clique na janela do app, então a AD de 28/07/2026 ("quem executa a tarefa também executa esse `Verify`, dirigindo o app") não tem como ser cumprida. Escolha do usuário: implementar, rodar o gate automatizado, commitar, e registrar o UAT como pendente humano — em vez de inventar um ✅. É a regra 3 de `TESTING.md` aplicada ao pé da letra. Atinge `multi-terminal/T6, T7, T9, T10, T11`. |
| 31/07/2026 | **`plugins.updater.endpoints` corrigido para `swarmdeck`; `pubkey` permanece a chave do `local-mind`** | O `tauri.conf.json` vinha do commit `94b9fcc` com `endpoints` **e** `pubkey` apontando para `rafaelsene01/local-mind` — o Verifier da run 003 mostrou que, quando `T15` ligasse o updater, o SwarmDeck buscaria o manifesto alheio e confiaria na assinatura de outro produto. O usuário aprovou zerar o `pubkey` nesta run, mas reverteu essa parte manualmente na árvore de trabalho logo em seguida, mantendo a chave do `local-mind` — só o `endpoint` ficou como `swarmdeck`. Estado real, não o aprovado originalmente: **`pubkey` continua sendo a chave errada**, agora sem o `endpoint` que a acompanhava. `T5` (`tauri signer generate`) precisa substituir esse campo antes de qualquer release — sem isso, uma assinatura válida do `local-mind` continuaria sendo aceita para atualizar o SwarmDeck. `plugins.updater.windows.installMode: "passive"` continua no arquivo e não está previsto no `design.md` — pendência de `T5`. |
| 31/07/2026 | **`Done when` de `release-distribution/T1` corrigido: o comando que ele prescrevia era impossível** | A spec exigia a string literal `"node --test scripts/"` no `package.json` **e** que `npm run test:scripts` passasse. No Node 24 o argumento posicional de `node --test` é glob, casa a própria pasta `scripts` e falha com `MODULE_NOT_FOUND` — não é quirk de Windows, reproduz em `ubuntu-latest`, que é o runner fixado no `ci.yml`. O Implementer alegou bug de plataforma; o Verifier desmentiu rodando `node --test` sem posicional (10 testes passam). Adotada a forma glob `node --test "scripts/**/*.test.mjs"`, restrita a `scripts/`, e o `Done when` foi corrigido junto com o código — corrigir só o `package.json` deixaria spec e código divergindo, que é o que a regra 4 de `spec-driven-changes.md` proíbe. |
| 31/07/2026 | **Commit atômico por tarefa não vale neste repositório; o mantenedor commita à mão** | `.claude/settings.json` tem `git commit` e `git push` no `deny`, então o delta de auto-commit da `spec-driven-execution` está estruturalmente desligado aqui. Consequência medida na run 003: os três commits que existem (`86bd32f`, `c3181df`, `e023808`) vieram de fora do pipeline, não usam as mensagens que o `tasks.md` prescreve, e o `c3181df` empacota cinco tarefas. Pior: **`HEAD` não passa em `cargo fmt --check`** — o conserto ficou nos arquivos não commitados. Escolha do usuário: recommitar à mão a partir do mapa arquivo→tarefa→mensagem, em vez de liberar `git commit` para o agente. |
| 31/07/2026 | **Exceção escrita na regra do marcador `SPEC:`: arquivo compartilhado leva marcador localizado** | O Verifier apontou `Cargo.toml:19` e `src-tauri/src/lib.rs:19` como desvio real do §3 de `.claude/rules/spec-driven-changes.md` ("no topo do arquivo"). O usuário aceitou o argumento — um marcador no topo de um manifesto de workspace mentiria sobre o resto do arquivo, e `lib.rs` ainda vai ser tocado por `multi-terminal/T6` — e mandou **escrever a exceção na regra**, com duas condições obrigatórias (bloco delimitável, e o `grep` continua achando). O que não se aceitou foi deixar a regra dizendo uma coisa e o código fazendo outra: aí o próximo executor faz diferente e ninguém sabe qual está certo. |

---

## Bloqueios

| Item | Impacto | Estado |
|---|---|---|
| Features PRO atrás de paywall (Git, History, Permissions, Shortcuts, Labels, Turbo) | UI real não observável — não dá para especificar fielmente | **Aceito.** Fora do v1. Só a matriz de features e as descrições curtas do paywall foram registradas em UI-INVENTORY.md. |
| Protocolo MCP do original é um contrato com agentes externos | Se as ferramentas do clone não baterem com os nomes esperados, prompts existentes quebram | **Resolvido em 28/07/2026 (triagem 001), por decisão do usuário.** Os nomes inferidos do `CLAUDE.md` global viram o contrato — sem validação prévia contra a implementação de referência. Ver a AD abaixo e `mcp-task-server/T0`. |

---

## Lições

- A automação de clique na janela do app é **instável**: alguns cliques registram só como hover e a seção não troca. Sempre reler o screenshot para confirmar que a navegação aconteceu, em vez de assumir. Retry com espera maior resolve.
- O **paywall é a melhor fonte de inventário de features** de um produto freemium — expõe a lista completa de capacidades de uma vez, incluindo as que não dá para ver na UI.
- **Ler o código do crate desmentiu a pesquisa.** A busca dizia que precisávamos setar três flags de ConPTY; o fonte do `portable-pty` 0.9.0 mostra que dois já vêm hardcoded e o terceiro não é configurável. Pesquisa serve para saber onde olhar — o fonte é que decide.
- **Um `wait` sem prazo transforma bug em silêncio.** A suíte ficou 20 minutos travada sem emitir uma linha. Com prazo, o mesmo defeito virou uma falha em 25s **com a mensagem que continha a causa** (`\u{1b}[6n`). Em código que espera por processo externo, prazo não é robustez — é observabilidade.
- **Regra documentada não é regra aplicada.** `TESTING.md` já dizia que teste de PTY não é paralelizável, mas o harness do Rust paraleliza por padrão. Só passou a valer quando virou um guard de mutex dentro do próprio arquivo de teste.

---

## Todos

- [x] ~~Confirmar os nomes exatos das ferramentas MCP contra a implementação real, antes de codificar o servidor~~ — **revogado por decisão do usuário na triagem 001 (28/07/2026)**: o contrato congela os nomes inferidos, sem validação prévia. `T0` deixa de ser "confirmar contra a referência" e passa a ser "escrever o `TOOL-CONTRACT.md` a partir do `CLAUDE.md` global". O risco aceito está na AD.
- [ ] Capturar as superfícies pendentes listadas no fim de `UI-INVENTORY.md`
- [x] ~~Decidir formato de persistência do layout do grid (JSON em disco vs tabela SQLite)~~ — **sem objeto desde `multi-terminal/T2`**: a migração `001_terminal_layout.sql` criou a tabela `terminal_layout` e o código já a consome. Ficou SQLite. Riscado na triagem 001 (28/07/2026); a decisão foi tomada no código, não aqui.
- [x] ~~Verificar se `portable-pty` cobre resize e sinais no Windows~~ — confirmado: `MasterPty::resize(PtySize)` cobre, e ConPTY é suportado. **Novo item:** confirmar em qual versão do crate o flag `PSEUDOCONSOLE_PASSTHROUGH_MODE` é exposto (exige Win11 22H2+, precisa de fallback)
- [ ] Definir o algoritmo de similaridade de tarefas — a spec fixa limiares de 70%/50% mas não o método. Começar com trigram/Levenshtein normalizado e calibrar
- [x] ~~`D:\ide` **não é um repositório git** — inicializar antes do primeiro commit~~ — feito: branch `master`, remote `git@github.com:rafaelsene01/swarmdeck.git`, **3 commits** (remedido na triagem 001; eram 1 quando isto foi escrito), **zero tags**
- [ ] 🔑 **Bloqueante do release**: rodar `tauri signer generate` e cadastrar `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` como secrets do repositório (`release-distribution/T5`) — passo humano, nenhuma tarefa automatizada substitui
- [ ] Reconfirmar as versões correntes de `tauri-plugin-updater` e `minisign-verify` antes de fixá-las — os fatos usados no design vêm da pesquisa do `local-mind` (julho/2026), não de consulta própria
- [ ] Desempatar o número da migração de `settings`: `mcp-task-server/T1` e `release-distribution/T14` reivindicam a `002`. Quem executar depois pega a seguinte e registra em `EXECUTION.md`
- [ ] Quando `crates/swarmdeck-mcp` existir: declará-lo como `externalBin` no bundle, levá-lo dentro do zip portátil e reavaliar se o AppImage passa a precisar de `NO_STRIP`
- [x] ~~Medir o tamanho do binário com e sem `strip`/LTO e comparar à meta de **< 20MB** do `PROJECT.md`~~ — medido em `release-distribution/T20` (31/07/2026), `swarmdeck.exe` release, `CARGO_TARGET_DIR` separado para cada build: **sem** o perfil enxuto, 9.849.344 bytes (≈9,39 MiB); **com** `strip = true` + `lto = "thin"` + `codegen-units = 1`, 7.805.440 bytes (≈7,44 MiB). Redução de 2.043.904 bytes (≈1,95 MiB, ~20,8%). **Meta de < 20MB atingida nos dois casos** — já estava dentro da meta mesmo sem o perfil; o perfil reduz mais ainda.
- [x] ~~Medir quantos warnings o `cargo clippy -D warnings` acusa hoje, antes de ligá-lo no CI~~ — medido em `release-distribution/T21` (31/07/2026): `cargo clippy --all-targets -- -D warnings` sai com **exit 0, zero warnings**, sem limpeza nenhuma necessária antes de ligar o job no CI.

---

## Ideias adiadas

- Modo **Tabs** de layout (o original tem Grid + Tabs; v1 entrega só Grid)
- Subtarefas e hierarquia pai-filho no Kanban — existe nas ferramentas MCP do original, mas nenhum card com hierarquia foi observado no board
- Atalhos de teclado por projeto e por terminal
- Labels/etiquetas em tarefas
- Marketplace próprio (MCP e Skills) — v1 lista e gerencia o que está instalado localmente
- **Code signing** (Authenticode / notarização) — depende de comprar certificado; sem ele o SmartScreen avisa na 1ª execução, aceitável no v1
- **macOS no pipeline** — o `PROJECT.md` já registra macOS como alvo não validado no v1, e o pedido foi Linux + Windows
- **Canal beta / pré-releases** — modelo de branch é `master` puro
- **Delta updates** — complexidade desproporcional ao tamanho do projeto
- **Zip portátil de Linux** — o `.AppImage` já roda sem instalar e já é suportado pelo updater oficial; um binário nu dependeria do `webkit2gtk` do sistema

---

## Preferências

- Usuário escreve em **português**; specs e documentação seguem o mesmo idioma. Identificadores de requisito e nomes de arquivo em inglês.
