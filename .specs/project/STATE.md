# STATE — Memória do projeto

Última atualização: 28/07/2026

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
| 28/07/2026 | `cargo fmt --check` entra no CI agora; `clippy -D warnings` fica em P3 | `fmt` foi **medido** nesta sessão e passava (exit 0). Clippy não foi medido — ligar sem medir transformaria "introduzir CI" numa refatoração de escopo desconhecido. **⚠️ Remedido na triagem 001 (28/07/2026): `cargo fmt --check` agora sai com exit 1, 7 arquivos com diff** — o código de `terminal/session.rs` entrou depois da medição original. A decisão continua válida; o que envelheceu foi o número. Formatar é pré-requisito de `release-distribution/T1`, senão o primeiro CI nasce vermelho. |

---

## Bloqueios

| Item | Impacto | Estado |
|---|---|---|
| Features PRO atrás de paywall (Git, History, Permissions, Shortcuts, Labels, Turbo) | UI real não observável — não dá para especificar fielmente | **Aceito.** Fora do v1. Só a matriz de features e as descrições curtas do paywall foram registradas em UI-INVENTORY.md. |
| Protocolo MCP do original é um contrato com agentes externos | Se as ferramentas do clone não baterem com os nomes esperados, prompts existentes quebram | **Aberto.** Os nomes de ferramentas foram inferidos das instruções globais do usuário (`CLAUDE.md`), não de documentação oficial. Validar antes de implementar. |

---

## Lições

- A automação de clique na janela do app é **instável**: alguns cliques registram só como hover e a seção não troca. Sempre reler o screenshot para confirmar que a navegação aconteceu, em vez de assumir. Retry com espera maior resolve.
- O **paywall é a melhor fonte de inventário de features** de um produto freemium — expõe a lista completa de capacidades de uma vez, incluindo as que não dá para ver na UI.
- **Ler o código do crate desmentiu a pesquisa.** A busca dizia que precisávamos setar três flags de ConPTY; o fonte do `portable-pty` 0.9.0 mostra que dois já vêm hardcoded e o terceiro não é configurável. Pesquisa serve para saber onde olhar — o fonte é que decide.
- **Um `wait` sem prazo transforma bug em silêncio.** A suíte ficou 20 minutos travada sem emitir uma linha. Com prazo, o mesmo defeito virou uma falha em 25s **com a mensagem que continha a causa** (`\u{1b}[6n`). Em código que espera por processo externo, prazo não é robustez — é observabilidade.
- **Regra documentada não é regra aplicada.** `TESTING.md` já dizia que teste de PTY não é paralelizável, mas o harness do Rust paraleliza por padrão. Só passou a valer quando virou um guard de mutex dentro do próprio arquivo de teste.

---

## Todos

- [ ] Confirmar os nomes exatos das ferramentas MCP contra a implementação real, antes de codificar o servidor
- [ ] Capturar as superfícies pendentes listadas no fim de `UI-INVENTORY.md`
- [x] ~~Decidir formato de persistência do layout do grid (JSON em disco vs tabela SQLite)~~ — **sem objeto desde `multi-terminal/T2`**: a migração `001_terminal_layout.sql` criou a tabela `terminal_layout` e o código já a consome. Ficou SQLite. Riscado na triagem 001 (28/07/2026); a decisão foi tomada no código, não aqui.
- [x] ~~Verificar se `portable-pty` cobre resize e sinais no Windows~~ — confirmado: `MasterPty::resize(PtySize)` cobre, e ConPTY é suportado. **Novo item:** confirmar em qual versão do crate o flag `PSEUDOCONSOLE_PASSTHROUGH_MODE` é exposto (exige Win11 22H2+, precisa de fallback)
- [ ] Definir o algoritmo de similaridade de tarefas — a spec fixa limiares de 70%/50% mas não o método. Começar com trigram/Levenshtein normalizado e calibrar
- [x] ~~`D:\ide` **não é um repositório git** — inicializar antes do primeiro commit~~ — feito: branch `master`, remote `git@github.com:rafaelsene01/swarmdeck.git`, **3 commits** (remedido na triagem 001; eram 1 quando isto foi escrito), **zero tags**
- [ ] 🔑 **Bloqueante do release**: rodar `tauri signer generate` e cadastrar `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` como secrets do repositório (`release-distribution/T5`) — passo humano, nenhuma tarefa automatizada substitui
- [ ] Reconfirmar as versões correntes de `tauri-plugin-updater` e `minisign-verify` antes de fixá-las — os fatos usados no design vêm da pesquisa do `local-mind` (julho/2026), não de consulta própria
- [ ] Desempatar o número da migração de `settings`: `mcp-task-server/T1` e `release-distribution/T14` reivindicam a `002`. Quem executar depois pega a seguinte e registra em `EXECUTION.md`
- [ ] Quando `crates/swarmdeck-mcp` existir: declará-lo como `externalBin` no bundle, levá-lo dentro do zip portátil e reavaliar se o AppImage passa a precisar de `NO_STRIP`
- [ ] Medir o tamanho do binário com e sem `strip`/LTO e comparar à meta de **< 20MB** do `PROJECT.md` — a promessa está escrita e nunca foi verificada
- [ ] Medir quantos warnings o `cargo clippy -D warnings` acusa hoje, antes de ligá-lo no CI

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
