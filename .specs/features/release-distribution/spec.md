# Release e distribuição — Especificação

**Origem**: pedido do usuário em 28/07/2026 — "olhe a configuração de CI do `rafaelsene01/local-mind` e crie as specs para termos o mesmo CI, com build para Linux e Windows e o gatilho de versão manual".
**Referência externa**: `rafaelsene01/local-mind` → `.github/workflows/{ci.yml,release.yml}`, `scripts/*.mjs`, `.specs/features/release-distribution/`. Os dois workflows foram lidos na íntegra nesta sessão; o que está aqui é a **adaptação** ao SwarmDeck, não uma cópia.

## Problema

O SwarmDeck não tem entrega nenhuma. `.github/` não existe, o repositório tem **um commit**, **zero tags**, e a versão `0.1.0` repetida em quatro lugares que podem divergir a qualquer momento (`package.json`, `package-lock.json`, `Cargo.toml` da raiz, `src-tauri/tauri.conf.json`). Nunca foi gerado um instalador — não há como alguém que não seja o autor rodar o app. E mesmo que houvesse, não haveria caminho para entregar uma correção a quem já instalou.

Some-se a isso que o público do produto é quem roda vários agentes de CLI em máquina de trabalho, muitas vezes corporativa, onde **instalador pede credencial de administrador que o usuário não tem**.

Esta feature fecha os três buracos de uma vez: um pipeline que valida cada push, uma release versionada por disparo manual que produz instaladores **e** um bundle portátil, e um auto-update que funciona nos dois modos sem nunca pedir elevação.

## Objetivos

- [ ] Publicar uma release é **um clique**: "Run workflow" + escolher `major`/`minor`/`patch` — versão, CHANGELOG, tag, artefatos e release saem juntos, sem editar arquivo à mão
- [ ] Push em `master` **nunca** publica nada; a única porta de release é o disparo manual
- [ ] Toda release traz `.msi`, `-setup.exe`, `.deb`, `.AppImage` e um `.zip` portátil de Windows, todos assinados
- [ ] Um usuário sem direito de administrador consegue **rodar e atualizar** o app do começo ao fim
- [ ] Todo push e PR compila e roda os testes antes de qualquer release existir

## Fora de escopo

| Item | Razão |
|---|---|
| **Code signing** (Authenticode / notarização) | Depende de comprar certificado. Sem ele o SmartScreen avisa na 1ª execução — aceitável no v1. Vai para Ideias adiadas no STATE. |
| **macOS** | `PROJECT.md` já registra: "macOS e Linux são alvo, mas não validados no v1", e o pedido do usuário foi explicitamente Linux + Windows. Nenhum runner `macos-*` no pipeline. |
| **Canal beta / pré-release** | Modelo de branch é `master` puro, como no repositório de referência. |
| **Bundle portátil no Linux** | O `.AppImage` **já é** portátil (roda sem instalar) e **já é** suportado pelo updater oficial do Tauri. Um zip de Linux seria pior: o binário nu depende do `webkit2gtk` do sistema, que o AppImage embute. Portátil = Windows. |
| **Delta updates** | Complexidade desproporcional ao tamanho do projeto. |
| **Empacotar o sidecar MCP** | `crates/swarmdeck-mcp` **não existe ainda** — o `Cargo.toml` da raiz registra que `crates/*` só entra em `mcp-task-server/T6`. Quando entrar, o bundle precisará declará-lo como `externalBin` e o portátil precisará carregá-lo junto. Fica como Todo no STATE, não como requisito de algo que não dá para verificar hoje. |
| **Rollback de versão pela UI** | Fora do pedido. A cópia `.old` da troca portátil dá um caminho manual de emergência. |
| **Assinatura de commits, branch protection, CODEOWNERS** | Configuração de repositório, não de pipeline. |

---

## Fatos verificados nesta sessão

Levantados por inspeção direta, não deduzidos — cada um muda uma decisão do design:

| Fato | Consequência |
|---|---|
| `.github/` não existe; remote é `git@github.com:rafaelsene01/swarmdeck.git`; branch única `master`; **`git tag` retorna vazio** | O primeiro release cai no caminho "sem tag anterior" (REL-04); ele precisa funcionar de primeira |
| O único commit é `Initialize SwarmDeck project…` — **não** é Conventional Commit | O gate de commits precisa olhar só os commits do PR (`origin/base..HEAD`), senão trava no histórico existente |
| `src-tauri/Cargo.toml` usa `version.workspace = true`; a versão real mora no `Cargo.toml` **da raiz**, em `[workspace.package]` | **Diferença central em relação ao local-mind**, onde o escritor de versão edita `src-tauri/Cargo.toml`. Aqui ele edita a raiz — copiar o script sem adaptar produziria uma versão que não muda |
| `src-tauri/tauri.conf.json` tem `"version": "0.1.0"` literal | Passa a `"../package.json"`, para o Tauri derivar e sobrar um arquivo a menos para sincronizar |
| `src-tauri/capabilities/` **não existe** e `tauri.conf.json` não referencia nenhuma capability | O plugin de updater exige permissão declarada; a pasta precisa ser criada, não editada |
| `tauri.conf.json` não tem `plugins.updater`, nem `bundle.createUpdaterArtifacts`, nem config de NSIS, nem `mainBinaryName`. `bundle.targets` é `"all"` | O binário compilado hoje se chama `swarmdeck.exe` (nome do pacote Cargo) enquanto o `productName` é `SwarmDeck` — isso decide o nome do executável dentro do zip portátil |
| **Nenhum código resolve diretório de dados.** `Db::open(path)` recebe o caminho pronto e ninguém o chama ainda | O modo portátil aqui é *greenfield*: dá para nascer certo, em vez de reformar caminho existente. O Todo do STATE "decidir formato de persistência do layout" é resolvido por esta spec no que toca **onde** o arquivo mora |
| Não há `scripts/`, `cliff.toml`, `CHANGELOG.md`, nem script `test:scripts` no `package.json` | Tudo isso é criação, não edição |
| `cargo fmt --all -- --check` **passa hoje** (rodado nesta sessão, exit 0) | `fmt --check` pode entrar no CI já; `clippy -D warnings` não foi medido e por isso é P3, atrás de uma limpeza |
| O projeto **não usa `lancedb`** | Ao contrário do local-mind, **`protoc` não é necessário** em runner nenhum. Mas `rusqlite` com feature `bundled` compila SQLite a partir do C — o toolchain C é obrigatório no Linux (`build-essential`) |
| Toolchain local: Node 24.12.0, npm 11.6.2, tauri-cli 2.11.4 | O CI fixa Node 24 para bater com o ambiente de desenvolvimento |

---

## Histórias de usuário

### P1: Publicar uma release com um clique ⭐ MVP

**História**: Como mantenedor, quero disparar a release manualmente escolhendo só o tipo de incremento, para que versão, CHANGELOG, tag, artefatos e release saiam prontos e consistentes sem eu editar arquivo nenhum.

**Por que P1**: É o pedido central. Sem isso não existe release, e todo o resto depende de haver uma.

**Critérios de aceite**:
1. QUANDO o mantenedor abre o workflow de release no GitHub ENTÃO o sistema DEVE oferecer **apenas** disparo manual (`workflow_dispatch`), com um select `bump` de três valores: `major`, `minor`, `patch`
2. QUANDO acontece qualquer push, merge, tag ou agendamento ENTÃO o sistema DEVE **não** publicar release alguma — a ausência de outros gatilhos no arquivo é o mecanismo, não uma convenção a lembrar
3. QUANDO o workflow roda ENTÃO o sistema DEVE calcular a nova versão a partir da última tag `v*` aplicando o incremento escolhido, e DEVE gravá-la em `package.json`, `package-lock.json`, `Cargo.toml` da raiz (`[workspace.package] version`) e `Cargo.lock` — o `src-tauri/tauri.conf.json` DEVE derivar a sua de `"../package.json"` e não ser reescrito
4. QUANDO não existe nenhuma tag `v*` ENTÃO o sistema DEVE tratar a versão do `package.json` como "última publicada" e aplicar o incremento sobre ela
5. QUANDO a versão é calculada ENTÃO o sistema DEVE gerar/atualizar `CHANGELOG.md` a partir dos Conventional Commits desde a última tag, agrupados por tipo
6. QUANDO os arquivos são atualizados ENTÃO o sistema DEVE criar o commit `chore(release): vX.Y.Z` em `master`, a tag `vX.Y.Z`, e publicar uma GitHub Release cujo corpo são as notas daquela versão
7. QUANDO o workflow é disparado de uma ref diferente de `master`, ou quando a tag calculada já existe (local ou remota), ENTÃO o sistema DEVE falhar **antes** de escrever qualquer coisa
8. QUANDO um build da matriz falha, ou o run é cancelado antes da release ser publicada, ENTÃO o sistema DEVE apagar a tag e o rascunho da release e reverter o commit de versão, de modo que a próxima tentativa reuse o mesmo número

**Teste independente**: disparar com `patch` neste repositório sem tags e confirmar: tag `v0.1.1` criada, `CHANGELOG.md` commitado, release `v0.1.1` publicada, e os quatro arquivos de versão em `0.1.1` — com o `tauri.conf.json` ainda contendo `"../package.json"` e o instalador saindo como `0.1.1`.

---

### P1: Toda release carrega os instaladores ⭐ MVP

**História**: Como usuário, quero baixar da página de releases o instalador do meu sistema, para instalar o app sem compilar nada.

**Por que P1**: É metade literal do pedido ("build para linux e windows").

**Critérios de aceite**:
1. QUANDO uma release é publicada ENTÃO o sistema DEVE anexar `.msi` e `-setup.exe` (Windows x86_64) e `.deb` e `.AppImage` (Linux x86_64)
2. QUANDO o instalador NSIS é gerado ENTÃO ele DEVE estar em modo `currentUser` — instalar em `%LOCALAPPDATA%` **sem** pedir credencial de administrador
3. QUANDO os bundles são gerados ENTÃO o sistema DEVE produzir também os artefatos de update assinados (`.sig`) e um `latest.json` com uma entrada por formato
4. QUANDO um job da matriz falha ENTÃO o outro DEVE continuar (`fail-fast: false`) e a release DEVE permanecer em rascunho — nunca publicada pela metade
5. QUANDO o build de Linux roda ENTÃO ele DEVE usar `ubuntu-22.04` como base, para não elevar o glibc mínimo exigido e quebrar o `.deb`/`.AppImage` em máquinas mais antigas

**Teste independente**: após uma release, baixar o `-setup.exe` numa conta Windows sem privilégio de administrador e instalar até o fim sem nenhum prompt de UAC.

---

### P1: Bundle portátil que roda sem instalar ⭐ MVP

**História**: Como usuário numa máquina que bloqueia instaladores, quero baixar um zip, descompactar numa pasta minha e rodar o app, para usá-lo sem administrador.

**Por que P1**: É o cenário de trabalho do público-alvo — quem roda agentes de codificação costuma estar em máquina corporativa gerenciada. Sem isso, esse público não entra.

**Critérios de aceite**:
1. QUANDO uma release é publicada ENTÃO o sistema DEVE anexar um `.zip` portátil de Windows x86_64 contendo o executável, os recursos do app e um arquivo marcador que identifica o modo portátil
2. QUANDO o `.zip` portátil é gerado ENTÃO ele DEVE ser assinado com **a mesma chave** dos instaladores, e o `.sig` DEVE ser anexado à release
3. QUANDO o app roda a partir de um bundle portátil ENTÃO ele DEVE gravar banco e configuração em um diretório **ao lado do executável**, nunca em `%APPDATA%`/`%LOCALAPPDATA%`
4. QUANDO o app roda a partir de uma instalação normal ENTÃO ele DEVE usar o diretório de dados do SO (`app_data_dir`), e essa DEVE ser a resposta de um único módulo — nenhum outro ponto do código monta caminho de dados por conta própria
5. QUANDO o app é iniciado a partir do zip descompactado em qualquer pasta gravável pelo usuário ENTÃO ele DEVE abrir e criar o banco sem nenhum prompt de elevação

**Teste independente**: descompactar o zip em `C:\Users\<user>\Desktop\SwarmDeck`, rodar, abrir um terminal, fechar e confirmar que o `.sqlite` nasceu dentro dessa mesma pasta e que nada foi escrito em `%APPDATA%`.

---

### P1: O app avisa que existe versão nova e se atualiza ⭐ MVP

**História**: Como usuário, quero que o app me avise quando sair versão nova e se atualize sozinho se eu aceitar, para não precisar acompanhar o repositório.

**Por que P1**: É o que dá sentido a ter pipeline de release. Sem update, cada correção depende do usuário descobrir sozinho que ela existe.

**Critérios de aceite**:
1. QUANDO o app abre e a verificação automática está ligada ENTÃO o sistema DEVE consultar o manifesto de update em segundo plano, **sem bloquear a interface**
2. QUANDO a versão publicada é maior que a instalada ENTÃO o sistema DEVE exibir um aviso não bloqueante com o número da versão, as notas da release e três ações: **Atualizar**, **Depois** e **Pular esta versão**
3. QUANDO a versão publicada é igual ou menor que a instalada ENTÃO o sistema DEVE não exibir nada
4. QUANDO o usuário escolhe **Atualizar** ENTÃO o sistema DEVE baixar o artefato correspondente ao seu modo de instalação com **progresso visível**, verificar a assinatura, aplicar e reiniciar o app na versão nova
5. QUANDO o usuário escolhe **Depois** ENTÃO o aviso DEVE sumir nesta sessão e reaparecer na verificação seguinte
6. QUANDO o usuário escolhe **Pular esta versão** ENTÃO o sistema DEVE não voltar a avisar sobre **aquela** versão, mas DEVE avisar sobre as posteriores
7. QUANDO o app está instalado (`.msi`/NSIS/`.AppImage`) ENTÃO a atualização DEVE usar o `tauri-plugin-updater` oficial; QUANDO está em modo portátil ENTÃO ela DEVE baixar o `.zip`, validar a assinatura contra a chave pública embutida, trocar os arquivos no lugar e relançar — **sem** prompt de administrador
8. QUANDO a assinatura do artefato baixado não confere ENTÃO o sistema DEVE abortar, manter a versão atual intacta e mostrar erro
9. QUANDO há PTY ativo no momento em que o usuário aceita atualizar ENTÃO o sistema DEVE avisar que os terminais serão encerrados e pedir confirmação antes de prosseguir

**Teste independente**: com a v0.1.1 instalada e a v0.1.2 publicada, abrir o app, ver o aviso, clicar Atualizar, ver o progresso e o app reabrir reportando 0.1.2 — repetido nos dois modos.

---

### P2: CI de validação em push e PR

**História**: Como mantenedor, quero que todo push e PR compile e rode os testes, para nunca disparar uma release em cima de código quebrado.

**Por que P2**: A release já roda o build — se não compilar, não sai artefato. Mas descobrir a quebra na hora de publicar é o pior momento possível. Além disso, é a parte que pode entrar **hoje**, antes de existir qualquer release.

**Critérios de aceite**:
1. QUANDO há push em `master` ou abertura/atualização de PR ENTÃO o sistema DEVE rodar `npm run build` (tsc + Vite), `npm run test` (Vitest) e `cargo test`
2. QUANDO qualquer desses passos falha ENTÃO o check DEVE ficar vermelho no commit/PR
3. QUANDO o job Rust roda ENTÃO ele DEVE instalar as dependências de sistema do Tauri (webkit2gtk 4.1, GTK 3, appindicator, librsvg, patchelf, libxdo, libssl, `build-essential`) antes de compilar — **sem `protoc`**, que este projeto não usa
4. QUANDO um PR é aberto ENTÃO o sistema DEVE validar que os commits **do PR** seguem Conventional Commits, já que o CHANGELOG depende disso — o histórico anterior ao PR não é avaliado
5. QUANDO o CI roda ENTÃO ele DEVE checar formatação com `cargo fmt --all -- --check` e rodar os testes unitários dos scripts de release
6. QUANDO um novo push chega na mesma ref ENTÃO a execução anterior do CI DEVE ser cancelada, para não gastar runner com commit já superado
7. QUANDO o CI roda ENTÃO ele DEVE **não** criar tag, release ou artefato — validação e publicação vivem em arquivos separados

**Teste independente**: abrir um PR com um erro de tipo em TypeScript e confirmar que o check falha; corrigir e confirmar que fica verde.

---

### P2: Controle da atualização em Configurações

**História**: Como usuário, quero ver minha versão, verificar atualizações na hora e poder desligar a verificação automática, para manter o app sem tráfego de rede se eu quiser.

**Por que P2**: O MVP funciona sem, mas o SwarmDeck é uma ferramenta local — verificar update sozinho é a única chamada de rede que ele faz, e isso precisa ser uma escolha visível, não um efeito colateral.

**Critérios de aceite**:
1. QUANDO o usuário abre as configurações ENTÃO o sistema DEVE exibir uma seção "Atualizações" com a versão instalada e o modo (instalado ou portátil)
2. QUANDO o usuário clica "Verificar agora" ENTÃO o sistema DEVE consultar o manifesto na hora e informar o resultado, **inclusive quando já está atualizado** — o boot é silencioso, este não
3. QUANDO o usuário desliga a verificação automática ENTÃO o sistema DEVE persistir a escolha e não fazer nenhuma consulta de rede no boot das execuções seguintes
4. QUANDO a verificação automática está desligada ENTÃO "Verificar agora" DEVE continuar funcionando — a escolha é sobre o automático, não sobre o manual
5. QUANDO o app é instalado pela primeira vez ENTÃO a verificação automática DEVE vir ligada

**Teste independente**: desligar o toggle, reabrir o app com a rede monitorada e confirmar que nenhuma requisição sai; clicar "Verificar agora" e ver a consulta acontecer.

---

### P3: Artefato menor e lint no CI

**História**: Como mantenedor, quero binário menor e lint automático, para que atualizar custe menos banda e o código não acumule warning.

**Por que P3**: Nada disso impede o produto de funcionar. Mas o `PROJECT.md` promete **binário < 20MB** como vantagem sobre o original em Electron — uma promessa que hoje ninguém mediu.

**Critérios de aceite**:
1. QUANDO o build de release roda ENTÃO o perfil `release` DEVE usar `strip` e LTO
2. QUANDO o tamanho do binário é medido antes e depois ENTÃO a redução DEVE ser registrada no `STATE.md` como número real, e comparada à meta de 20MB do `PROJECT.md`
3. QUANDO o CI roda ENTÃO ele DEVE executar `cargo clippy --all-targets -- -D warnings`, **depois** de uma limpeza que zere os warnings existentes — hoje ninguém mediu quantos são

---

## Casos de borda

- QUANDO não há nenhum commit novo desde a última tag ENTÃO o CHANGELOG DEVE sair vazio, mas a release DEVE ser criada mesmo assim — o disparo foi manual e explícito
- QUANDO existe em `master` um commit `chore(release):` sem tag correspondente ENTÃO o cálculo DEVE prosseguir normalmente: a **tag** é a fonte de verdade, não o commit
- QUANDO o job do Windows passa e o do Linux falha ENTÃO a release DEVE ficar em rascunho com os artefatos do Windows anexados, e o job de limpeza DEVE desfazer tag e commit de versão
- QUANDO o revert do commit de versão não aplica limpo (houve outro push em `master` no meio) ENTÃO o sistema DEVE falhar com mensagem explícita pedindo reversão manual — nunca `push --force` em `master`
- QUANDO o app é iniciado **sem rede** e a verificação automática está ligada ENTÃO a falha DEVE ser silenciosa, só log
- QUANDO o usuário clica "Verificar agora" **sem rede** ENTÃO o erro DEVE ser visível e explícito
- QUANDO o app portátil está numa pasta somente-leitura (pendrive protegido, `C:\Program Files`) ENTÃO o sistema DEVE detectar isso **antes** de baixar o zip e explicar que a atualização não é possível dali
- QUANDO a troca de arquivos do update portátil falha no meio ENTÃO o sistema DEVE restaurar o executável anterior e manter o app utilizável na versão antiga
- QUANDO sobrou um `.old` de uma atualização portátil anterior ENTÃO o app DEVE apagá-lo no boot seguinte, em silêncio
- QUANDO o download é interrompido ENTÃO o sistema DEVE descartar o parcial e permitir tentar de novo, sem deixar o app meio-atualizado
- QUANDO o `latest.json` não tem entrada para a plataforma/modo do usuário ENTÃO o sistema DEVE tratar como "sem atualização disponível", não como erro
- QUANDO a release mais recente é rascunho ou pré-release ENTÃO o sistema DEVE ignorá-la
- QUANDO o secret de assinatura não está configurado ENTÃO o job de build DEVE falhar com mensagem clara, e não publicar artefato sem `.sig`
- QUANDO um PR contém commit de merge ENTÃO o validador de Conventional Commits DEVE ignorá-lo

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| REL-01 | P1: Release só por `workflow_dispatch` com select de incremento | Design | Pending |
| REL-02 | P1: Push/tag/agendamento nunca publicam | Design | Pending |
| REL-03 | P1: Versão da última tag + incremento, gravada nos 4 arquivos que a duplicam | Execute | Implemented (T1, `npm run test:scripts` 11/11) |
| REL-04 | P1: Sem tag anterior, base é o `package.json` | Execute | Implemented (T1, `npm run test:scripts` 11/11) |
| REL-05 | P1: CHANGELOG dos Conventional Commits desde a última tag | Execute | Implemented — parcial: `cliff.toml` criado e os 9 tipos mapeados (T3); a geração real depende de `git-cliff` rodar em `T6`, ainda pendente |
| REL-06 | P1: Commit `chore(release)`, tag e GitHub Release no mesmo run | Design | Pending |
| REL-07 | P1: Guarda de branch e de tag existente, antes de escrever | Design | Pending |
| REL-08 | P1: Run interrompido desfaz tag, rascunho e commit de versão | Design | Pending |
| REL-09 | P1: `.msi` + `-setup.exe` + `.deb` + `.AppImage` em toda release | Design | Pending |
| REL-10 | P1: NSIS em `currentUser`, sem UAC | Design | Pending |
| REL-11 | P1: Artefatos de update assinados + `latest.json` | Design | Pending |
| REL-12 | P1: `fail-fast: false` e release em rascunho enquanto a matriz não fecha | Design | Pending |
| REL-13 | P1: Build de Linux em `ubuntu-22.04` | Design | Pending |
| REL-14 | P1: `.zip` portátil de Windows com marcador | Design | Pending |
| REL-15 | P1: Portátil assinado com a mesma chave, `.sig` anexado | Design | Pending |
| REL-16 | P1: Modo portátil grava dados ao lado do executável | Execute | Implemented (T13, `cargo test --lib` 11/11) |
| REL-17 | P1: Modo instalado usa `app_data_dir`; resolução centralizada num módulo só | Execute | Implemented (T13, `cargo test --lib` 11/11) |
| REL-18 | P1: Rodar do zip em pasta gravável, sem elevação | Execute | Implemented — parcial: detecção de pasta somente-leitura (`is_writable`) coberta por `T13`; a montagem real do zip é `T7`, ainda pendente |
| REL-19 | P1: Verificação silenciosa no boot, sem bloquear a UI | Design | Pending |
| REL-20 | P1: Aviso não bloqueante com versão, notas e 3 ações | Design | Pending |
| REL-21 | P1: Nada é exibido quando não há versão nova | Design | Pending |
| REL-22 | P1: Download com progresso, assinatura verificada, aplica e reinicia | Design | Pending |
| REL-23 | P1: "Pular esta versão" vale só para aquela versão | Design | Pending |
| REL-24 | P1: Instalado usa o plugin oficial; portátil troca arquivos sem elevação | Design | Pending |
| REL-25 | P1: Assinatura inválida aborta e preserva a versão atual | Design | Pending |
| REL-26 | P1: Aviso de encerramento dos PTYs antes de reiniciar | Design | Pending |
| REL-27 | P2: CI roda `npm run build`, `npm run test` e `cargo test` em push e PR | Design | Pending |
| REL-28 | P2: Job Linux instala as dependências de sistema do Tauri (sem `protoc`) | Design | Pending |
| REL-29 | P2: Conventional Commits validado nos commits do PR | Design | Pending |
| REL-30 | P2: `cargo fmt --check` e testes dos scripts de release no CI | Design | Pending |
| REL-31 | P2: Concorrência cancela execução superada; CI não publica nada | Design | Pending |
| REL-32 | P2: Seção "Atualizações" com versão e modo | Design | Pending |
| REL-33 | P2: "Verificar agora" informa o resultado nos dois casos | Design | Pending |
| REL-34 | P2: Toggle persistido; desligado = zero rede no boot; ligado por padrão | Design | Pending |
| REL-35 | P3: `strip` + LTO com redução medida e comparada à meta de 20MB | Execute | Implemented (T20, medição registrada em `STATE.md`, meta de <20MB atingida) |
| REL-36 | P3: `clippy -D warnings` no CI após limpeza | — | Pending |

**Cobertura:** 36 requisitos, 36 mapeados para tarefas em `tasks.md` (ver "Cobertura de requisitos" nesse arquivo). Desta correção, 6 ficaram `Implemented` com evidência de gate verde (REL-03, REL-04, REL-16, REL-17, REL-18, REL-35) e 1 `Implemented` parcial (REL-05, aguardando `T6`); os demais 29 permanecem `Pending` — código ainda não escrito ou gate `pipeline` bloqueado por push humano (`T2`, `T21`).

---

## Critérios de sucesso

- [ ] Uma release completa (5 artefatos + `latest.json` + CHANGELOG + tag) sai de um único "Run workflow" com um select preenchido
- [ ] Nenhum push em `master` publicou release alguma — verificado no histórico de execuções, não só no arquivo
- [ ] Numa conta Windows **sem** direito de administrador: instalar pelo `-setup.exe` **e** rodar pelo zip portátil funcionam, ambos sem um único prompt de UAC
- [ ] Publicar uma versão nova faz o app avisar sozinho no próximo boot, nos dois modos
- [ ] Aceitar a atualização leva o app de vX para vY sem intervenção manual e sem elevação — exercitado de verdade, não só compilando
- [ ] Um PR que quebra o build fica vermelho antes do merge
