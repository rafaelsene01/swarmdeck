# STATE

## Decisions

### AD-001

- **Decision**: A leitura da credencial do Claude Code e a chamada HTTP ao endpoint de uso vivem no processo Rust; o token de acesso nunca cruza a fronteira IPC para a webview.
- **Reason**: O frontend só precisa de `{percent, resets_at, plan}`. Manter o token no backend elimina a classe inteira de vazamento por devtools, por log de erro do React e por qualquer XSS numa aba de terminal.
- **Trade-off**: Um comando Tauri a mais e testes de rede em Rust em vez de mocks de `fetch` em Vitest, que seriam mais rápidos de escrever.
- **Scope**: Toda integração futura com provedores de IA que exija credencial local (Codex, opencode, Antigravity, Kimi).
- **Date**: 2026-08-15
- **Status**: active

### AD-002

- **Decision**: Dados de quota são buscados sob demanda (montagem do indicador e abertura do popover) com piso de cache de 5 minutos. Não há polling em segundo plano.
- **Reason**: O app fica aberto por horas sem ninguém olhar o header. Polling de 5 minutos custaria ~96 requisições autenticadas por dia para pintar pixels que ninguém vê, e aproxima o 429 sem entregar nada.
- **Trade-off**: O anel pode estar desatualizado em até 5 minutos quando o usuário volta ao app. Mitigado pelo carimbo "atualizado há N min" no popover, que torna a idade do dado visível em vez de implícita.
- **Scope**: Qualquer indicador futuro alimentado por API externa.
- **Date**: 2026-08-15
- **Status**: active

### AD-003

- **Decision**: `reqwest` entra como dependência direta de `src-tauri`, em vez de rotear a chamada por `tauri-plugin-http` ou pelo `UpdaterExt` existente.
- **Reason**: `reqwest` 0.13.4 com rustls já está no `Cargo.lock` como dependência transitiva de `tauri-plugin-updater`, então promovê-la a dependência direta não adiciona crate nem tempo de compilação. `UpdaterExt` só fala com o endpoint de atualização configurado e não faz GET arbitrário; `tauri-plugin-http` seria um plugin novo para resolver o que uma crate já presente resolve.
- **Trade-off**: O `src-tauri` passa a declarar explicitamente um cliente HTTP, o que amplia a superfície de rede do binário além do updater.
- **Scope**: Todas as chamadas HTTP do backend fora do fluxo de atualização.
- **Date**: 2026-08-15
- **Status**: active

### AD-004

- **Decision**: Ausência de dado nunca é renderizada como zero. Uma medida ausente aparece como estado vazio explícito, visualmente distinto tanto de 0% quanto do estado de carregamento.
- **Reason**: Zero é uma medição — significa "medimos e não houve consumo". Renderizar ausência como zero faz o app afirmar com confiança algo que não sabe, e o usuário toma decisão de uso em cima disso.
- **Trade-off**: Três estados visuais (carregando, sem dado, medido) em vez de um caminho de render só, com o custo de teste correspondente.
- **Scope**: Toda superfície que exibe métrica vinda de fonte externa.
- **Date**: 2026-08-15
- **Status**: active

### AD-005

- **Decision**: A atualização deixa de ser baixada em segundo plano e instalada no fechamento da janela. Passa a ser: consulta silenciosa, aviso, confirmação explícita do usuário, download, e troca do executável na própria pasta do app — sem executar instalador NSIS ou MSI no Windows. Os requisitos REL-37, REL-38, REL-41 a REL-47 estão revogados.
- **Reason**: O `Update::install` do `tauri-plugin-updater` executa o instalador NSIS em modo `passive`, abrindo uma janela que o usuário não pediu. O rename do executável em uso (`SwarmDeck.exe` → `SwarmDeck.exe.old`) é permitido pelo Windows e faz a próxima abertura já rodar a versão nova, que é exatamente o resultado desejado.
- **Trade-off**: Perde-se a atualização "já baixada quando você confirma" — confirmar passa a custar o tempo do download. E o app assume a responsabilidade de trocar arquivo em disco, que antes era do instalador.
- **Scope**: Todo o fluxo de atualização no Windows, nos dois flavors. Linux permanece no `tauri-plugin-updater`.
- **Date**: 2026-08-15
- **Status**: active

### AD-006

- **Decision**: A troca de arquivo vale também para o flavor instalado (NSIS), não só para o portátil; a divergência de versão que isso cria no registro de desinstalação do Windows é corrigida gravando `DisplayVersion` em `HKCU` após a troca.
- **Reason**: O NSIS usa `installMode: "currentUser"`, então a pasta instalada fica em `%LOCALAPPDATA%\SwarmDeck` e é gravável sem admin. Restringir a troca ao portátil deixaria a demanda sem efeito para a instalação real de quem pediu. Um conselho de revisão votou 3-0 em "só portátil" pela objeção do registro obsoleto — a objeção custa um `reg add` e foi fechada, não ignorada.
- **Trade-off**: O app passa a escrever no registro do Windows, coisa que antes só o instalador fazia. Se a gravação falhar, o Painel de Controle fica com a versão antiga — estado aceito de propósito, porque o binário novo já está no lugar.
- **Scope**: Qualquer operação futura que altere o conteúdo da pasta instalada por fora do instalador.
- **Date**: 2026-08-15
- **Status**: active de novo (AD-009 reverteu AD-008; a troca de arquivo voltou, e com ela a gravação de `DisplayVersion`)

### AD-007

- **Decision**: Instalar o provedor de cripto do rustls (`ring`) como padrão do processo, em `lib.rs::run`, antes de qualquer cliente HTTP ser construído.
- **Reason**: `reqwest` é compilado com `rustls-no-provider`; nessa configuração `Client::builder().build()` **panica** em vez de devolver `Err`. Dentro de `#[tauri::command] async`, o panic mata a task e a promise do IPC nunca resolve — "Atualizações" ficava preso em "Verificando…" e o anel de cota nunca saía de "carregando". O comentário do `Cargo.toml` afirmava que `tauri-plugin-updater` instalava o provedor; não instala.
- **Trade-off**: `rustls` vira dependência direta só por uma linha. Sem crate nova: rustls 0.23 e ring 0.17 já estavam no `Cargo.lock`.
- **Scope**: Qualquer cliente HTTP novo no crate.
- **Date**: 2026-08-16
- **Status**: active

### AD-008

- **Decision**: Aposentar o mecanismo próprio de atualização (troca do executável no lugar, `swap.rs`) e passar a atualização de **toda** plataforma para o `tauri-plugin-updater`, com `windows.installMode: "passive"`, exatamente como o projeto irmão `local-mind`.
- **Reason**: Pedido explícito do usuário em 16/08/2026 ("pode deixar igual o local-mind"), depois de ver que o `latest.json` do `local-mind` não tem a chave `windows-x86_64-silent` nem o `.exe` cru. Some ~550 linhas de código próprio (swap, verificação de assinatura, escrita no registro, reprovação de pasta não gravável) em favor do caminho de fábrica.
- **Trade-off**: (1) O instalador volta a aparecer, em modo passivo. (2) **Quem usa a versão portátil deixa de ser atualizado** — o instalador criaria uma segunda cópia em `%LOCALAPPDATA%`; atualizar portátil vira download manual do zip. (3) AD-006 fica sem objeto: o registro passa a ser escrito pelo instalador.
- **Scope**: Todo o fluxo de atualização; a chave de manifesto que `check::target_key` resolve; o `release.yml`.
- **Date**: 2026-08-16
- **Status**: **revogada por AD-009** no mesmo dia

### AD-009

- **Decision**: Reverter AD-008. A troca do executável no lugar (`swap.rs`, chave `windows-x86_64-silent`, `.exe` cru assinado) volta a ser o caminho de atualização no Windows, e o fluxo confirmado passa a ter **dois passos**: `update_download` (com progresso via `update://download-progress`) e `update_install`. A instalação **nunca** reinicia nem fecha o app; "Reabrir agora" é um botão que só o usuário aciona.
- **Reason**: Pedido do usuário depois de usar o fluxo de AD-008 em produção: o app baixou, se fechou, instalou e reabriu sozinho. Não é configuração — `Update::install_inner` do `tauri-plugin-updater` termina em `std::process::exit(0)` no Windows (verificado em `tauri-plugin-updater-2.10.1/src/updater.rs`), e o instalador NSIS precisa matar o processo para substituir o `.exe`. Qualquer caminho via instalador fecha o app; com terminais PTY abertos, isso é perda de trabalho.
- **Trade-off**: Voltam ~550 linhas de código próprio (troca, verificação de assinatura, escrita no registro, reprovação de pasta não gravável) e os dois passos de `release.yml` que publicam o `.exe` cru. Em troca, o app se atualiza com os terminais vivos. O custo de AD-008 — portátil sem atualização automática — deixa de existir: a troca vale para os dois flavors de novo.
- **Scope**: Todo o fluxo de atualização; a chave que `check::target_key` resolve; o `release.yml`; qualquer operação futura que altere a pasta instalada por fora do instalador (AD-006 volta a valer junto).
- **Date**: 2026-08-16
- **Status**: active

### AD-010

- **Decision**: A disposição dos terminais é decidida por uma função pura, `layoutPlan(count, layout)` em `src/state/layout.ts`, que devolve `{columns, rows, spans}`. `GridLayout` só traduz o plano em CSS grid; nenhuma regra de disposição mora no componente.
- **Reason**: Cada regra do modo × contagem × variante de largura vira um caso de tabela testável sem DOM. A alternativa — regra dentro do render — exigiria um teste jsdom por linha da tabela, mais lento e mais frágil, para provar aritmética de grid.
- **Trade-off**: Um módulo a mais e uma prop nova em `GridLayout`. O componente deixa de ser autossuficiente para decidir colunas/linhas.
- **Scope**: Qualquer regra futura de disposição de painéis (novos modos, layouts por contagem).
- **Date**: 2026-08-16
- **Status**: active

### AD-011

- **Decision**: `GridLayout` passa a sincronizar a prop `panes` com o snapshot interno `localPanes` comparando a **sequência de ids**, não a contagem.
- **Reason**: A comparação por contagem (`panes.length === localPanes.length`) é um bug conhecido, já documentado em `App.tsx:232-242`: qualquer mudança que preserve a contagem — trocar `mode`, reordenar — fica presa no snapshot desatualizado. Reordenar por arrastar e soltar preserva a contagem por definição, então a correção deixa de ser opcional.
- **Trade-off**: Uma comparação de string por render em vez de uma de inteiros. Irrelevante para 4 painéis; seria relevante em centenas.
- **Scope**: Todo componente que mantenha snapshot local de uma prop de lista para suavizar arrasto.
- **Date**: 2026-08-16
- **Status**: active

### AD-012

- **Decision**: `terminal::layout::save`/`restore` são reaproveitados para a forma com abas (`TabEntry`), em vez de ganharem funções irmãs. A restauração devolve vetor vazio quando não há nada salvo — `default_entry` sai.
- **Reason**: As duas funções existem desde a T11 da `multi-terminal` e **nunca tiveram chamador** (`grep` em `src-tauri/src` só acha o `pub use` de `mod.rs`) nem teste. Persistir abas é a primeira vez que elas têm uso real. `default_entry` inventava um terminal no primeiro boot, o oposto de EMPTY-03, que exige o `EmptyState` alcançável na abertura.
- **Trade-off**: A assinatura pública de `layout.rs` muda. Como não há chamador, o custo é zero hoje — e seria maior amanhã, com duas APIs de persistência de layout convivendo.
- **Scope**: A persistência do workspace de terminais e qualquer código futuro que leia `terminal_layout`.
- **Date**: 2026-08-16
- **Status**: active

### AD-013

- **Decision**: Nesta base, o contrato "um commit atômico por task" do `tlc-spec-driven` fica suspenso: as tasks são implementadas, passam pelo gate e são marcadas em `tasks.md`, mas **nenhum agente commita**.
- **Reason**: A instrução global do usuário é explícita — "Nunca fazer commit. Nunca rodar `git commit`, mesmo se pedido de forma implícita". Instrução do usuário vence contrato de skill.
- **Trade-off**: Perde-se o histórico granular por task e a capacidade de `git bisect` por task. O usuário commita ao fim, com o escopo que escolher.
- **Scope**: Toda execução de spec neste repositório.
- **Date**: 2026-08-16
- **Status**: active

### AD-014

- **Decision**: O boot deixa de restaurar o workspace em silêncio. Havendo terminal salvo, o app abre um modal (`RestoreSessionDialog`) onde o usuário confirma quais abas e terminais voltam e, por terminal, se a **conversa do agente** é retomada ou recomeça. Todo terminal passa a nascer com um id de sessão UUID fixado pelo app e persistido (`terminal_layout.agent_session_id`, migração 009), lançado como `claude --session-id <uuid>` na primeira vez e `claude --resume <uuid>` na retomada. Nenhum `TerminalPane` monta antes da escolha. "Começar do zero", o × e Escape abrem uma aba vazia **e gravam esse estado por cima do salvo**.
- **Reason**: Pedido do usuário. Reabrir o app subia todos os agentes de ontem sem chance de opinar, e cada terminal restaurado começava uma conversa nova (LAYOUT-29) porque nada no app sabia qual conversa pedir de volta. O modal estava explicitamente adiado em `terminal-layout-options` ("Fora de escopo: Modal escolhendo o que restaurar no boot"); esta decisão retoma o adiamento.
- **Trade-off**: (1) O boot ganha um passo manual — quem quer tudo de volta precisa de um clique a mais. (2) Escape descarta o workspace salvo; foi a escolha explícita do usuário entre as alternativas "Escape = restaurar o marcado" e "Escape não fecha", ciente do risco de um Escape acidental. (3) Só o Claude Code tem flags de sessão: o Codex expõe `codex resume <id>` como subcomando, sem forma de fixar o id no primeiro lançamento, e os outros três não têm flag documentada — o switch fica travado em "nova sessão" para eles. Adicionar um agente é preencher `session_new_flag`/`session_resume_flag` no catálogo, não escrever código.
- **Scope**: O boot do app, o contrato de `pty_spawn`, o schema de `terminal_layout` e qualquer feature futura que precise arrancar um agente com contexto — clonar, reiniciar e o diálogo de novo terminal já passam por aqui.
- **Date**: 2026-08-17
- **Status**: active

### AD-015

- **Decision**: A captura de imagem de um terminal é feita **repintando o buffer do xterm** (`terminal.buffer.active`) num `<canvas>` — não fotografando o DOM (`html-to-image`, `html2canvas`) nem a janela do SO (`xcap`, captura nativa).
- **Reason**: O xterm 5.5 usa o renderer de DOM, então cada célula já está disponível como dado (caractere, cor de frente, cor de fundo, atributos). `html2canvas` não rasteriza `<canvas>` e diverge entre WebView2 e WebKitGTK; `html-to-image` depende de `foreignObject`, com histórico ruim no WebKitGTK; captura nativa de janela devolve frame preto no WebView2 (composto por DirectComposition) e exige portal no Wayland. A repintura é determinística nas duas plataformas, não traz dependência nova de npm nem de crate, e é testável em jsdom com um contexto 2D falso.
- **Trade-off**: A fidelidade passa a ser responsabilidade do nosso código. Cursor, seleção e ligaduras ficam de fora do print; largura dupla é tratada pelo `getWidth()` da célula. Em troca: zero dependência, mesmo resultado nos dois WebViews, e teste sem canvas real.
- **Scope**: Qualquer captura de imagem futura de conteúdo de terminal.
- **Date**: 2026-08-18
- **Status**: active

### AD-016

- **Decision**: Minimizar um terminal passa a tirá-lo por inteiro da área de terminais (a célula sai do plano do grid e recebe `display: none`), em vez de encolhê-lo à barra de 34px dentro do grid. O acesso ao minimizado migra para uma bandeja no header, agregando os minimizados de **todas** as abas. A altura recolhida de TERM-08 está revogada; o resto de TERM-08 (PTY e scrollback vivos) continua valendo.
- **Reason**: A barra de 34px continuava consumindo uma célula do grid, então minimizar 3 dos 4 terminais não devolvia espaço nenhum aos que sobravam — que é justamente o que se quer ao minimizar. A bandeja também resolve o que a barra não resolvia: ver e recuperar um terminal minimizado numa aba que não está na tela.
- **Trade-off**: Um terminal minimizado deixa de ter qualquer presença na aba — se a bandeja falhar, não há segundo caminho de volta. E com todos os terminais da aba minimizados a área fica vazia, sem `EmptyState` (que é reservado à aba sem nenhum terminal). Aceito: a contagem no header torna o estado visível, e `EmptyState` ali mentiria sobre haver terminais.
- **Scope**: Todo estado de painel que "sai de vista" mas continua vivo.
- **Date**: 2026-08-18
- **Status**: active

### AD-017

- **Decision**: Os dois últimos botões inertes do header (`run`, `copy`, HDR-09/HDR-10) foram removidos em vez de ganharem comportamento, e o "new terminal" trocou o `+` por um botão de ícone de terminal.
- **Reason**: O header vinha de um mock com 11 elementos, dos quais os inertes foram saindo à medida que cada um ganhava dono (`split` → menu de layout, `camera` → captura). `run` e `copy` nunca tiveram demanda associada; botão desabilitado permanente é ruído que ocupa espaço e sugere função que não existe. Todo botão do header tem comportamento real agora.
- **Trade-off**: Se "run" voltar como demanda, o lugar dele no header precisa ser redecidido do zero.
- **Scope**: Qualquer elemento remanescente do mock original sem comportamento associado.
- **Date**: 2026-08-18
- **Status**: active

### AD-018

- **Decision**: O botão de câmera saiu do header do app e passou para a barra de título de cada terminal, capturando direto o painel a que pertence. O modo armado inteiro foi revogado: `captureArmed`, o contorno `data-capture-target`, a faixa de dica, o Esc de desarmar e o `onClickCapture` do `.app-pane`. Revoga SHOT-02..SHOT-08 e SHOT-15.
- **Reason**: Pedido do usuário. Dentro do painel o botão já sabe qual terminal capturar, então o passo de seleção — e os quatro estados que o sustentavam — deixaram de existir. Dois cliques viraram um.
- **Trade-off**: A câmera deixa de ter um lugar único e fixo na tela: com 4 painéis há 4 botões, e o header do app perde um ponto de entrada global. Capturar um painel minimizado passa a ser impossível pela UI (antes já era proibido por SHOT-03, agora é estrutural: painel minimizado não mostra a barra de ações). `TerminalHeader` ganhou um oitavo botão na barra de ações.
- **Scope**: `terminal-screenshot`; qualquer ação futura que seja por-painel deve nascer no `TerminalHeader`, não no header do app.
- **Date**: 2026-08-18
- **Status**: active

### AD-019

- **Decision**: O fluxo de novo terminal deixa de ser um diálogo modal e passa a ser um wizard de duas etapas (PROJECT, AGENT) renderizado **dentro** do painel, como componente irmão de `TerminalPane`. O painel nasce em estado de rascunho (`TerminalState.draft`), sem PTY. `NewTerminalDialog.tsx` e seu teste foram apagados. Revoga TERM-10 e TERM-11.
- **Reason**: O `cwd` passa a vir da escolha de projeto, não de um seletor de pasta solto — e a lista de recentes ordenada por `last_used` substitui a memória de "último diretório usado". O painel já existe no grid, então o wizard herda moldura, cabeçalho e posição sem nenhum backdrop novo; um `TerminalPane` "sem PTY" espalharia ramo nulo por screenshot, rename, maximizar, minimizar e `pty_kill`.
- **Trade-off**: O rascunho ocupa uma das 4 vagas da aba antes de existir sessão nenhuma, e o cabeçalho precisa de um modo reduzido (sem capturar, clonar, reiniciar nem minimizar). O seletor nativo de pastas sobrevive só dentro de "Import Project" e "New Project".
- **Scope**: `projects`, `multi-terminal` (TERM-10, TERM-11), `shell-chrome` (o CTA do `EmptyState` e o Ctrl+T passam a criar rascunho).
- **Date**: 2026-08-19
- **Status**: active

### AD-020

- **Decision**: `projects.last_used` é escrito em três momentos: **seleção do projeto no wizard** (`project_touch`), fechamento de terminal (`pty_kill` devolve o `cwd` e o comando toca o projeto) e encerramento do app (`RunEvent::Exit` chama `touch_from_cwds` com os `cwd` das sessões ainda vivas). Os dois gatilhos de fechamento moram no backend, não no `App.tsx`. O gancho de saída escreve `last_used` e mais nada: `TerminalManager::shutdown()` continua desligado.
- **Reason**: `TerminalManager` já é dono do `cwd` nos dois momentos de fechamento; ler esse dado do front exigiria mantê-lo espelhado só para isso. Falha de gravação nunca impede o `pty_kill` nem a saída do app. O toque mora na **seleção**, não na confirmação, porque é o mesmo `project_touch` que valida a existência do caminho (`require_existing_dir`): validar depois da confirmação descobriria a pasta ausente com o painel já virado terminal vivo, e PROJ-13 AC15 pede o contrário — ficar na etapa PROJECT mostrando o caminho que sumiu.
- **Trade-off**: (1) No encerramento, todos os projetos com terminal aberto recebem o mesmo instante e **empatam** entre si — a ordenação da lista não distingue qual foi usado por último naquela sessão. Empate aceito pelo usuário: a alternativa seria carimbar por atividade do PTY, que custaria escrita contínua no banco. (2) Com o toque na seleção, **selecionar um projeto e depois desistir grava `last_used` sem terminal nenhum ter sido aberto**. PROJ-14 AC18 continua valendo ao pé da letra (fechar o rascunho não escreve nada), mas "último uso" passa a significar "último projeto escolhido no wizard". Aceito para não pagar uma segunda ida ao backend só para validar o caminho antes de tocar.
- **Scope**: `projects`; qualquer métrica futura de uso derivada de sessão de terminal.
- **Date**: 2026-08-19
- **Status**: active

### AD-021

- **Decision**: O vínculo terminal↔projeto é **derivado do `cwd`** por `projects::resolve` (casamento exato ou por subpasta). `terminal_layout` não ganha coluna de projeto.
- **Reason**: O `cwd` já é persistido por terminal e já é o que define onde o agente roda. Uma coluna de projeto seria uma segunda fonte de verdade para o mesmo fato, capaz de divergir quando o usuário muda de pasta dentro do terminal.
- **Trade-off**: Um terminal aberto numa subpasta de dois projetos aninhados casa com o mais específico e nada avisa o usuário; e renomear/mover a pasta de um projeto quebra o vínculo dos terminais salvos até o `path` ser atualizado.
- **Scope**: `projects`, `session-restore` (o payload de workspace segue sem projeto).
- **Date**: 2026-08-19
- **Status**: active

### AD-022

- **Decision**: Na etapa "AGENT" do wizard, só `claude-code` fica escolhível. Os outros quatro agentes do `CATALOG` continuam **visíveis** na grade, desabilitados, com a legenda "em breve". O ladrilho do shell puro passa a se chamar **"Terminal"** (era "Terminal limpo") e segue sempre habilitado.
- **Reason**: Pedido do usuário. Só o Claude está integrado de ponta a ponta hoje (é o único com sessão nomeada, `--resume` e cota); deixar os demais clicáveis oferece um caminho que não entrega o que promete.
- **Trade-off**: PROJ-13 AC7 previa os 5 escolhíveis; a lista `SELECTABLE` em `AgentStep.tsx` é agora um segundo portão além do `installedIds`. Quem instalar o Codex e não achar o ladrilho clicável precisa da legenda para entender — daí o "em breve" em vez de silêncio. Reverter é apagar uma linha.
- **Scope**: `src/components/terminal/AgentStep.tsx` — a etapa AGENT do wizard. `AgentPanel` (Configurações › Agentes) segue com os 5 e o gate só de PATH.
- **Date**: 2026-08-19
- **Status**: active

### AD-023

- **Decision**: As marcas dos provedores em `ProviderIcon.tsx` passam a ser as **silhuetas oficiais** de cada marca (Claude, OpenAI, opencode, Kimi de `simple-icons`; Antigravity do SVG publicado pelo Google), como um `path` por marca com `viewBox` próprio, inline no código.
- **Reason**: Pedido do usuário — as aproximações de traço anteriores não passavam por logo nenhum em 24px.
- **Trade-off**: Inverte a nota original do arquivo ("não são os logos oficiais: o app não embarca arquivo de marca de terceiros"). O contorno oficial entra como **dado** no código, não como asset no bundle, e cada marca segue a cor oficial. Marca de terceiro em app próprio é uso nominativo; se algum titular pedir remoção, é trocar o `path`.
- **Scope**: `src/components/shell/ProviderIcon.tsx` — vale para o anel do cabeçalho, o popover e a lista de Configurações, que compartilham o componente.
- **Date**: 2026-08-19
- **Status**: active

### AD-024

- **Decision**: O painel "Projetos" de Configurações passa a mostrar, por linha, um quadrado com a cor e a **inicial** do projeto, o nome, o caminho, a **contagem de terminais abertos** naquele projeto e um botão de **excluir** — com diálogo de confirmação e travado enquanto houver terminal aberto. O botão de **editar** sai da linha, e com ele o modo `edit` do `ProjectFormModal`.
- **Reason**: Pedido do usuário, com a referência visual em `print/project.png`. A coluna de contagem não reabre AD-004: o número contado é de **terminais abertos**, que o front já conhece por `terminal_workspace_get`, não de tarefas — que continuam sem comando que as exponha.
- **Trade-off**: Revoga PROJ-20 (editar nome/cor de projeto registrado) e a metade "SHALL não exibir contagem" de PROJ-19 AC1. Editar um projeto passa a exigir excluir e recriar até que alguém peça a edição de volta. A contagem lê o workspace **persistido** (gravado com 500 ms de debounce por `App.tsx`), então na janela `settings` ela pode estar até meio segundo atrás do estado vivo — aceitável para um painel de administração, e é a única fonte que serve às duas montagens do `SettingsShell` (overlay e janela própria).
- **Scope**: `src/routes/settings/ProjectsPanel.tsx`, `src/routes/settings/SettingsShell.tsx`, `src/components/project/ProjectFormModal.tsx`, `src/components/terminal/PaneWizard.tsx`, `src/styles.css`, `src/App.tsx`.
- **Date**: 2026-08-19
- **Status**: active

### AD-025

- **Decision**: A seção "Status de terminal" sai de Configurações. O trilho fica com quatro itens (Geral, Agentes, Projetos, Atualizações), e `StatusesPanel.tsx` + `StatusesPanel.test.tsx` são apagados.
- **Reason**: Pedido do usuário. O painel nunca chegou a funcionar: nenhum `#[tauri::command]` expõe o CRUD de `status_catalog` (`src-tauri/src/terminal/status_catalog.rs` não tem nada no `invoke_handler!` de `lib.rs`), então a tela rodava inteira em estado local e perdia tudo ao fechar — o desvio já estava anotado no próprio `SettingsShell.tsx`. Tela que promete configurar e não configura é pior que tela ausente.
- **Trade-off**: Revoga a parte de UI de STAT-02 e STAT-03 (catálogo de status editável em Configurações) e o quinto item do trilho de SET-07. O **badge** de status em si continua: `StatusBadge.tsx` (STAT-01), `ActivityLog.tsx` (STAT-05, STAT-06) e o caminho do MCP não são tocados — o agente segue marcando status no terminal, o que muda é não haver mais tela para editar o catálogo. Voltar atrás é reverter este commit e escrever o `commands/statuses.rs` que faltava.
- **Scope**: `src/routes/settings/SettingsShell.tsx`, `src/routes/settings/SettingsShell.test.tsx`, `src/routes/settings/StatusesPanel.tsx` (apagado), `src/routes/settings/StatusesPanel.test.tsx` (apagado). O backend `status_catalog.rs` fica de pé, sem chamador de UI.
- **Nota de rastreabilidade**: `.specs/features/terminal-statuses/` e `.specs/features/settings-shell/` não existem no disco (perdidos no incidente registrado no fim deste arquivo), então STAT-02/STAT-03 e SET-07 não puderam ser marcados na spec de origem — esta AD é o registro.
- **Date**: 2026-08-19
- **Status**: active

### AD-026

- **Decision**: A lista de provedores em Configurações › Geral passa a mostrar o **catálogo inteiro** de agentes (`agents::catalog::CATALOG`), não só os três da semente da migração 007 — Antigravity CLI e Kimi Code entram como linhas novas. Toda linha cujo provedor não tem cota real (`providerMeta(id).hasQuota === false`) fica travada: interruptor e setas desabilitados. Hoje isso deixa só o Claude controlável.
- **Reason**: Pedido do usuário, espelhando o passo 2 do wizard de terminal (`AgentStep.tsx:36`), que já mostra o catálogo inteiro e só deixa escolher quem está integrado de ponta a ponta. As linhas extras vivem só na UI — nenhuma migração nova, porque linha travada não tem estado a guardar.
- **Trade-off**: Emenda QUOTA-26, que dava interruptor e setas a **toda** linha. Codex CLI e opencode tinham switch funcionando de verdade — ele controlava se o provedor era listado no popover do anel (`QuotaIndicator.tsx:377` rende selo e frase para quem não tem cota). Esse controle sai. A linha travada continua exibindo o valor gravado, então a UI não passa a mentir sobre o estado; ela só deixa de deixar mudá-lo. O critério é `hasQuota`, não uma lista fixa: quando o segundo provedor ganhar endpoint de consumo, a linha dele destrava sem mais código.
- **Scope**: `src/routes/settings/GeneralPanel.tsx`, `src/routes/settings/SettingsShell.tsx` (passa `agentIds` do catálogo que já carrega), `src/routes/settings/GeneralPanel.test.tsx`. Backend não tocado.
- **Date**: 2026-08-19
- **Status**: active

### AD-027

- **Decision**: `Ctrl+V` / `Ctrl+Shift+V` no painel de terminal colam pela API do webview (`navigator.clipboard.readText()`) entregue a `terminal.paste()` do xterm, num `attachCustomKeyEventHandler`. Sem plugin de área de transferência do Tauri.
- **Reason**: Pedido do usuário (TERM-14). Sem isso o `Ctrl+V` chega ao shell como `^V` literal — o "quoted-insert" do readline. O webview já é usado para **escrever** na área de transferência em `ScreenshotModal.tsx:61`, então a API está disponível; `terminal.paste()` já resolve normalização de quebra de linha e bracketed paste, que escrever direto no PTY não resolveria.
- **Trade-off**: A **leitura** da área de transferência pede a permissão `clipboard-read`, e o WebView2 pode negá-la mesmo permitindo a escrita — nesse caso o atalho falha em silêncio e o erro só aparece no console. Se acontecer, o conserto é trocar `navigator.clipboard.readText()` por `tauri-plugin-clipboard-manager` (dependência npm + cargo, uma linha em `lib.rs`, uma permissão em `capabilities/default.json`); o resto do handler não muda. Não adicionei o plugin agora porque seria uma dependência nova para o que a plataforma talvez já faça.
- **Scope**: `src/components/terminal/TerminalPane.tsx`, `src/components/terminal/TerminalPane.test.tsx`. Backend não tocado.
- **Date**: 2026-08-19
- **Status**: active

### AD-028

- **Decision**: O passo AGENT do wizard passa a oferecer os **seis** modos de `claude --permission-mode` (`manual`, `plan`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`), com `auto` pré-marcado e uma descrição no hover de cada botão. O modo escolhido vira argumento no arranque do agente, é **persistido no workspace** (migração 010) e aparece como selo no cabeçalho do terminal. Feature nova: `.specs/features/agent-permission-mode/` (PERM-01..PERM-07).
- **Reason**: Pedido do usuário. As duas escolhas de escopo — seis modos em vez dos três citados, e persistir em vez de decidir só na criação — foram do usuário, perguntadas antes de escrever código.
- **Trade-off**: A lista e a validação moram no catálogo Rust (`PERMISSION_MODES`), que é ao mesmo tempo ordem de exibição, payload de `agent_catalog` e fronteira de confiança — modo desconhecido é descartado, nunca repassado ao CLI. O custo é uma migração de banco e um campo novo atravessando cinco camadas (wizard, App, TerminalPane, comando, launch). A alternativa sem persistência era bem mais barata, mas o usuário preferiu que reiniciar o app não jogasse silenciosamente um terminal de `bypassPermissions` para `auto`.
- **Risco aceito**: `bypassPermissions` desliga toda verificação de permissão do agente. O app agora oferece esse modo em dois cliques. As mitigações são a descrição oficial no hover ("Só para contêineres e VMs isolados") e o selo **vermelho** no cabeçalho, para que um terminal sem rede de proteção não passe despercebido entre quatro painéis. O app não impede a escolha — impedir seria decidir pelo usuário o que a própria CLI deixa ele decidir.
- **Fonte dos valores**: `claude --help` da versão instalada (os seis `choices`) e `code.claude.com/docs/en/permission-modes` (as descrições). Nada foi inferido.
- **Scope**: `src-tauri/src/agents/{catalog,launch,mod}.rs`, `src-tauri/src/commands/{agents,terminal}.rs`, `src-tauri/src/terminal/{manager,layout}.rs`, `src-tauri/src/db/{mod.rs,migrations/010_terminal_permission_mode.sql}`, `src/components/terminal/{AgentStep,PaneWizard,TerminalPane,TerminalHeader}.tsx`, `src/routes/settings/AgentPanel.tsx`, `src/App.tsx`.
- **Date**: 2026-08-19
- **Status**: active

### AD-029

- **Decision**: O título no cabeçalho do terminal passa a ser o **nome do projeto** em que o painel roda, e deixa de ser editável. O gesto de rename manual (clique no título → `InlineRename` → `terminal_set_title`) sai do `TerminalHeader`; `TERM-06` fica **parcialmente revogada**: o backend (`terminal_set_title`, `TitleSource::User`, `TerminalMetaService::set_title`) continua existindo e servindo à escrita de título pelo agente via MCP.
- **Reason**: Pedido do usuário: identificar o painel pelo projeto é mais útil, num grid de quatro terminais, do que um nome livre que quase ninguém trocava. Escopo "só o header, mantém backend" escolhido pelo usuário antes da implementação.
- **Trade-off**: Não há mais como dar nome próprio a um terminal pela UI — dois painéis no mesmo projeto ficam com o mesmo rótulo, distinguíveis só pelo agente, pelo selo de modo e pela posição. Em troca, o cabeçalho passa a responder a pergunta que se faz olhando o grid ("qual projeto é este?") sem depender de o usuário ter renomeado nada. O nome vem de `project_list` (nome cadastrado, que pode diferir da pasta) com fallback no último segmento do `cwd` — a sandbox do "Sem projeto" cai nesse fallback.
- **Scope**: `src/components/terminal/TerminalHeader.tsx` (rename removido, `id` deixa de ser prop), `src/App.tsx` (`fetchProjectNames`, `projectNameByPath`, `projectNameFor`; `sessionIdByTerminalId` removido por ter ficado sem leitor), `src/components/terminal/PaneWizard.tsx` (`lastSegment` e `normalizePath` exportados), testes de `TerminalHeader`.
- **Date**: 2026-08-20
- **Status**: active

### AD-030

- **Decision**: O seletor de imagens do formulário de feedback usa `<input type="file" accept="image/*" multiple>` nativo, e não o `@tauri-apps/plugin-dialog` já instalado.
- **Reason**: O plugin devolve apenas o caminho absoluto do arquivo. Validar o teto de 10 MB e desenhar a miniatura a partir de um caminho exigiria ler os bytes — ou seja, o `plugin-fs` (não instalado) ou um comando Rust novo — dentro de uma fase declarada como "somente visual". O input nativo entrega `File.size`, `File.name` e `File.type` sem custo, e `URL.createObjectURL` já é o padrão do repo em `ScreenshotModal.tsx:28`. Conselho de quatro vozes decidiu 3-0 pelo input nativo.
- **Trade-off**: Quando o envio real existir, se ele for um POST feito pelo Rust, os bytes terão de subir do JS (`File.arrayBuffer()` → `invoke`) em vez de o Rust ler o caminho do disco. O contrato de como os bytes chegam ao backend fica em aberto de propósito, para a fase 2 decidir.
- **Scope**: Qualquer seleção de **arquivo** na UI (distinta da seleção de **pasta**, que continua no `plugin-dialog` por não ter equivalente nativo).
- **Date**: 2026-08-22
- **Status**: active

### AD-031

- **Decision**: Na fase visual, "Enviar feedback" é habilitado pela validação dos campos e o clique exibe um aviso explícito de que o envio ainda não foi implementado, em um elemento `role="status"`. Não simula sucesso e não fica permanentemente desabilitado.
- **Reason**: Um sucesso falso mente para o usuário. Um clique que não faz nada lê como tela quebrada e não distingue "ainda não ligado" de "handler morto". Um botão travado impede justamente o que a fase existe para permitir: percorrer a tela. O mesmo elemento recebe depois o texto real de sucesso ou erro, então nada é descartado. Conselho decidiu 2-1; a voz dissidente (Pragmatist) preferia o clique silencioso, por considerar o aviso descartável.
- **Trade-off**: Existe em tela, por um tempo, uma mensagem que só serve para esta fase. Mitigado por ela ser uma linha de texto no painel, e não um componente novo de toast.
- **Scope**: Qualquer superfície entregue em fase visual antes do backend correspondente.
- **Date**: 2026-08-22
- **Status**: active

### AD-032

- **Decision**: O preview em Markdown da descrição do feedback reusa o renderizador que já existe em `UpdateSettings.tsx` (`renderNotes` + `inline`), extraído para `src/lib/markdown.tsx` e estendido com listas ordenadas, citações `>` e blocos cercados por ```. Nenhuma dependência de Markdown entra no projeto.
- **Reason**: O repo tem 7 dependências de runtime e a regra de não somar dependência para o que já existe. O renderizador atual monta nós React — não usa `dangerouslySetInnerHTML` — e já cobre títulos, listas, parágrafos, forte, ênfase e código. Conselho decidiu 3-0 contra a dependência nova. A extração (em vez da cópia defendida por duas das vozes) foi escolhida porque `src/lib/` já é o lugar desse tipo de utilitário no repo e porque o segundo consumidor está sendo escrito agora, não hipoteticamente.
- **Trade-off**: Um renderizador por linha não é CommonMark: tabelas, listas de tarefas e aninhamento ficam de fora, e ficam registrados como o gatilho documentado para trocar por `react-markdown`. E a extração toca um arquivo com rastreabilidade `SILENT-42` — o teste `UpdateSettings.test.tsx:191` passando sem edição é a prova de que o comportamento não mudou.
- **Scope**: Toda renderização de Markdown na UI.
- **Date**: 2026-08-22
- **Status**: active

## Handoff

- **Feature**: feedback-form (`.specs/features/feedback-form/`)
- **Phase / Task**: Execute concluída. T1..T8 (as 3 fases) implementadas, 55/55 itens de `tasks.md` marcados. Verifier independente rodado; relatório em `.specs/features/feedback-form/validation.md`.
- **Completed**: 8 tasks. Fase 1 — `src/lib/markdown.tsx` extraído de `UpdateSettings.tsx` (`renderMarkdown`/`renderInline`) e estendido com lista ordenada (`<ol>`), citação (`<blockquote>`) e bloco cercado (`<pre><code>` literal, fecha no fim do texto quando a cerca não fecha). Fase 2 — `src/routes/settings/FeedbackPanel.tsx`: categoria (4 opções, `general` padrão), título com teto de 255 e contador, descrição em `<textarea>` sob abas `role="tablist"` Escrever/Visualizar com preview e estado vazio, anexos por `<input type="file">` escondido com os tetos de 5 arquivos e 10 MB e recusa por tipo, tamanho e excedente em `role="alert"`, e as ações Enviar (aviso de não implementado em `role="status"`) / Limpar (reset completo + `revokeObjectURL`). Fase 3 — `SettingsShell.tsx` ganhou `'feedback'` no `SectionId`, o quinto item da barra lateral (ícone `MessageSquare`) e o bloco de render.
- **In-progress**: none.
- **Gates**: `npm run build` verde (`tsc --noEmit` + vite), `npm run test` com 524 testes em 37 arquivos, todos passando. Nenhum teste existente teve asserção alterada.
- **Verifier**: duas iterações, relatório em `.specs/features/feedback-form/validation.md`. A iteração 1 aprovou com ressalvas — 12 requisitos PASS e 3 PARTIAL (FEED-06, FEED-09, FEED-12), todos por asserção faltando, nenhum por comportamento. Os buracos apontados eram itens de done-when do `tasks.md` que não estavam de fato provados: o clique do botão "Selecionar imagens" nunca era exercitado (apagar o `onClick` deixaria a suíte verde com o botão morto), FEED-12 cobria `invoke` mas não `fetch`, três asserções de `markdown.test.tsx` eram tautológicas (o renderizador não tem caminho que crie `<table>`, `<a>` ou `<input>`), e o obrigatório era só uma estrela colorida, sem teste. Fix pass fechou os quatro, mais a região viva do `role="status"` (agora montada desde o primeiro render, com só o texto mudando). A iteração 2 **passou**: os cinco itens fechados com evidência, 524 testes em 37 arquivos, build limpo, `UpdateSettings.test.tsx` ainda com diff vazio. As três ressalvas menores da iteração 2 (restore do `fetch` fora de `finally`, estrela sem asserção de `aria-hidden`, região viva sem prova no primeiro render) foram fechadas depois do relatório: `vi.stubGlobal`/`vi.unstubAllGlobals`, asserção de `aria-hidden` nas duas estrelas e `toBeEmptyDOMElement()` antes de qualquer interação. `validate_state.py` sai com 0 erro.
- **SILENT-42 preservado**: `UpdateSettings.test.tsx` não aparece em `git status` depois da extração — a prova pedida pela spec ("passa sem edição de asserção") é o próprio arquivo intocado, com os 22 testes dele verdes.
- **Next step**: teste manual no app real — abrir Configurações › Feedback, digitar Markdown e alternar as abas, escolher 6 imagens e um arquivo de 11 MB. O seletor nativo de arquivos e o render do preview em fonte real não são observáveis no jsdom.
- **Escopo**: **somente a camada visual**, inalterado. Zero `invoke` e zero rede no painel — coberto por um espião no mock de `@tauri-apps/api/core` (FEED-12). O envio real segue como fase 2, com o contrato dos bytes em aberto (AD-030).
- **Blockers**: nenhum.
- **Gaps aceitos**: (1) o campo de e-mail, os links clicáveis, tabelas, listas de tarefas e o colar de screenshot seguem fora por decisão da spec (seção "Out of Scope") — o preview renderiza `- [ ]` e `[texto](url)` como texto literal, com teste que prova isso. (2) A navegação por setas entre as abas não foi implementada: as abas são `<button>` no fluxo natural de Tab, com foco visível, o que atende a AC de "navegáveis por teclado" sem o padrão APG completo de roving tabindex.
- **Dívida deixada de propósito**: `renderMarkdown` continua sendo varredura linha a linha por regex, agora compartilhada por duas telas. O comentário `ponytail:` no topo de `src/lib/markdown.tsx` nomeia o teto: tabela, lista de tarefas e lista aninhada pedem `react-markdown`, não mais regex.
- **Uncommitted files**: `.specs/` inteiro (gitignored) + `src/lib/markdown.tsx`, `src/lib/markdown.test.tsx`, `src/routes/settings/FeedbackPanel.tsx`, `src/routes/settings/FeedbackPanel.test.tsx` (novos) e `src/components/settings/UpdateSettings.tsx`, `src/routes/settings/SettingsShell.tsx`, `src/routes/settings/SettingsShell.test.tsx` (modificados). Nenhum commit feito por agente (AD-013).
- **Branch**: master

### Handoff anterior — feedback-form (Tasks)

- **Feature**: feedback-form (`.specs/features/feedback-form/`)
- **Phase / Task**: Tasks concluída. `spec.md` e `tasks.md` escritos; `validate_spec.py` e `validate_tasks.py` saem com 0 erro e 0 warning. Não há `design.md`: nenhuma decisão de arquitetura ficou aberta — as três estão em AD-030, AD-031 e AD-032 acima. Execute não começou; nenhuma linha de código foi escrita.
- **Completed**: nada de código. 15 requisitos (FEED-01..FEED-15), 8 tasks em 3 fases.
- **In-progress**: none
- **Next step**: `/senior:run-task` (ou Execute do `tlc-spec-driven`) a partir de T1. 8 tasks = um batch só, execução inline, sem sub-agentes; o Verifier no fim continua obrigatório.
- **Escopo**: **somente a camada visual**, por pedido explícito do usuário. Nenhum `invoke`, nenhuma rede, nada persistido. O envio real é fase 2 e o contrato de como os bytes das imagens chegam ao Rust está deliberadamente em aberto (AD-030).
- **Blockers**: nenhum.
- **Ponto de atenção**: T2 mexe em `UpdateSettings.tsx`, que tem rastreabilidade `SILENT-42`. O critério de "não quebrou" é `UpdateSettings.test.tsx:191` passar **sem edição de asserção**. Se esse teste precisar mudar, a extração alterou comportamento e a task não está pronta.
- **Uncommitted files**: `.specs/` inteiro (gitignored) + `.claude/rules/frontend-ui-ux-pro-max.md` já pendente antes desta sessão.
- **Branch**: master

### Handoff anterior — agent-permission-mode

- **Feature**: agent-permission-mode (`.specs/features/agent-permission-mode/`) — antes: projects (`.specs/features/projects/`)
- **Phase / Task**: Execute — T1..T24 concluídas (as 6 fases) + iteração 3 (AD-024): painel de Configurações refeito sobre `print/project.png`, com contagem de terminais e exclusão. Verificação em `validation.md` (Iteração 3), gates verdes.
- **Completed**: 24 tasks. Backend: `last_used` por id e por `cwd`, cor não-exclusiva, limpeza de pasta órfã no `git init`, `kill` devolvendo o `cwd`, comandos `project_touch`, `project_touch_cwds`, `project_create_in`, `project_sandbox_dir` e o gancho de `RunEvent::Exit`. Front: wizard de painel (`PaneWizard`, `ProjectStep`, `AgentStep`, `ProjectFormModal`, `relativeTime`), painel de rascunho no `App.tsx`, `TerminalHeader` em modo rascunho, `NewTerminalDialog` apagado, e criar/editar projeto em Configurações. AD-019, AD-020 e AD-021 registradas acima. Gate final: `npm run build` verde, 375 testes front em 35 arquivos, 277 testes Rust.
- **In-progress**: none.
- **Verifier**: duas iterações, relatório em `.specs/features/projects/validation.md`. Iteração 1 **reprovou** — PROJ-13 AC15 (caminho do projeto sumiu do disco) não tinha implementação, e o teste que dizia cobri-lo exercitava falha de `project_list`. Fix pass fechou AC15 (toque na seleção valida o caminho — ver AD-020), o `defaultAgentId` congelado em estado e as referências mortas ao diálogo antigo. Iteração 2 **passou**: 376 testes front, 297 Rust, build limpo.
- **Next step**: teste manual no app real — o item de T9 (abrir terminal num projeto, fechar o app, reabrir e ver o projeto no topo com idade `agora`) só é observável fora do jsdom.
- **Blockers**: nenhum.
- **Gaps aceitos**: (1) os dois primeiros itens de T3 (`git init` falhando) seguem sem teste próprio — forçar a falha exige trocar o `PATH` do processo, que é global e desestabilizaria os 212 testes paralelos; a guarda que eles pedem é a mesma linha coberta por `falha_depois_de_criar_a_pasta_remove_a_pasta_e_propaga_o_erro`. (2) O gancho de `RunEvent::Exit` (`lib.rs`, AC17/AC19) não tem teste: a matriz de cobertura desta feature classifica `lib.rs` como build gate only, e o núcleo testável (`touch_from_cwds`) é coberto por T1. Trocar o evento deixaria os três gates verdes.
- **Dívida deixada de propósito**: a remoção do `NewTerminalDialog` matou o último chamador de `picker_prefs`. O módulo, os comandos `terminal_picker_last_dir` / `terminal_picker_set_last_dir`, a migração 005 e quatro mocks em `App.test.tsx` viraram **código morto**. Os marcadores `SPEC:` desses arquivos dizem isso ao pé da letra (`TERM-11 — REVOKED by AD-019, no caller left`) em vez de fingir que servem PROJ-17/PROJ-18. Remover é task própria: mexe em migração de banco, fora do escopo das 24 tasks desta feature.
- **Uncommitted files**: `.specs/` inteiro (gitignored) + o código da feature. Nenhum commit feito por agente (AD-013).
- **Branch**: master

### Handoff anterior — terminal-screenshot

- **Feature**: terminal-screenshot (`.specs/features/terminal-screenshot/`) — revisão AD-018
- **Phase / Task**: **Concluída.** Ajuste direto (`/senior:code`), sem as 4 fases do `tlc-spec-driven` — mesmo desvio da regra `.claude/rules/spec-driven-changes.md` item 2 já registrado no handoff de `minimized-tray`.
- **Completed**: câmera movida para o `TerminalHeader`; modo armado removido de `App.tsx` e `Header.tsx`; SHOT-01 e SHOT-23 reescritos, SHOT-02..SHOT-08 e SHOT-15 revogados na spec, no design e nas tasks. Gate: `npx tsc --noEmit` limpo, 308 testes front em 31 arquivos, todos verdes (eram 317: saíram os 7 do modo armado e o de toggle da câmera no header, entrou 1 no `TerminalHeader`). Backend não tocado.
- **In-progress**: none.
- **Next step**: teste manual no app real — clicar na câmera de um painel com xterm montado de verdade e conferir o print, que é o que jsdom não cobre.
- **Blockers**: nenhum.
- **Uncommitted files**: `.specs/` inteiro (gitignored) + `src/App.tsx`, `src/App.test.tsx`, `src/components/shell/Header.tsx`, `src/components/shell/Header.test.tsx`, `src/components/terminal/TerminalHeader.tsx`, `src/components/terminal/TerminalHeader.test.tsx` — mais o que já estava pendente de `minimized-tray`. Nenhum commit feito por agente (AD-013).
- **Branch**: master

### Handoff anterior — minimized-tray

- **Feature**: minimized-tray (`.specs/features/minimized-tray/`)
- **Phase / Task**: **Concluída.** Ajuste direto (`/senior:code`), sem as 4 fases do `tlc-spec-driven` — spec escrita junto com o código, não antes. Registrado aqui de propósito, é desvio da regra `.claude/rules/spec-driven-changes.md` item 2.
- **Completed**: 10 requisitos (MIN-01..10), AD-016 e AD-017. Gate: `npm run build` verde, 317 testes front (31 arquivos). Backend não tocado.
- **In-progress**: none.
- **Next step**: teste manual no app real — minimizar com xterm montado de verdade é o que jsdom não cobre. Se um terminal voltar em branco ao restaurar, a correção é uma chamada de `fit` no `TerminalPane` (mesmo sintoma já previsto para reordenar, em `terminal-layout-options`).
- **Blockers**: nenhum.
- **Uncommitted files**: `.specs/` inteiro (gitignored) + o código da feature. Nenhum commit feito por agente (AD-013).
- **Branch**: master

### Handoff anterior — terminal-screenshot

- **Feature**: terminal-screenshot (`.specs/features/terminal-screenshot/`)
- **Phase / Task**: **Concluída.** As 11 tasks das 4 fases entregues.
- **Completed**: 23 requisitos (SHOT-01..23), 11 tasks, AD-015. Verifier independente: PASS, 23/23 critérios com evidência `file:line`, relatório em `validation.md`. Fix pass posterior fechou 5 dos 8 defeitos apontados (D1, D2, D4, D6, D8). Gate final: `npm run build` verde, 301 testes front, 269 testes Rust.
- **In-progress**: none.
- **Next step**: teste manual no app real — a fidelidade do print (cores, largura dupla, alinhamento da fonte), a digitação com o modo armado e o `navigator.clipboard.write` só são observáveis com xterm montado de verdade; jsdom prova o fio, não a imagem.
- **Gaps aceitos**: nenhum teste vai do clique até um PNG real (`App.test.tsx` mocka `snapshotBlob`, `terminalSnapshot.test.ts` usa contexto 2D falso) — a junção é assumida. `ScreenshotModal` não tem focus trap: com o modal aberto, Tab alcança a câmera atrás do backdrop. Nenhum dos dois é requisito dos 23 critérios; ambos estão em `validation.md`.
- **Blockers**: nenhum.
- **Desvio do design corrigido na execução**: o design mandava `onClickCapture` com `stopPropagation` no painel inteiro e afirmava que SHOT-08 continuaria valendo. Não continuava: o handler de fase de captura mata os `onClick` dos botões do `TerminalHeader`. A implementação ignora cliques originados dentro de `.terminal-header` (`src/App.tsx`), então maximizar, minimizar, clonar e fechar seguem operando com o modo armado.
- **Uncommitted files**: `.specs/` inteiro (gitignored) + o código da feature. Nenhum commit feito por agente (AD-013).
- **Branch**: master

### Handoff anterior — session-restore

- **Feature**: session-restore (`.specs/features/session-restore/`)
- **Phase / Task**: **Concluída.** As 8 tasks das 4 fases entregues. `validate_spec.py` e `validate_tasks.py` (8 warnings esperados: tasks multi-arquivo coesas e 2 `Tests: none`) saem limpos.
- **Completed**: 17 requisitos (SESS-01..17), 8 tasks, AD-014. Gate: `npm run build` verde, 247 testes front (24 arquivos), 254 testes Rust.
- **In-progress**: none.
- **Next step**: teste manual no app real — `claude --resume <uuid>` só é observável com o CLI de verdade; jsdom prova o argumento, não a retomada.
- **Blockers**: nenhum.
- **Uncommitted files**: `.specs/` inteiro (gitignored) + o código da feature. Nenhum commit feito por agente (AD-013).
- **Branch**: master

### Handoff anterior — terminal-layout-options

- **Feature**: terminal-layout-options (`.specs/features/terminal-layout-options/`)
- **Phase / Task**: **Concluída.** As 12 tasks das 6 fases entregues, mais um fix pass pós-Verifier. `validate_spec.py`, `validate_tasks.py` (1 warning esperado: T8 é migração SQL) e `validate_state.py` saem limpos.
- **Completed**: 29 requisitos (LAYOUT-01..29), 12 tasks, AD-010 a AD-013. Verifier iteração 1 reprovou (LAYOUT-25 sem a metade de UI); fix pass fechou os 4 itens; iteração 2 passou — 29/29 ACs com evidência, sensor 5/5 mutações mortas, 223 testes front + 243 Rust. Relatório em `validation.md`.
- **In-progress**: none.
- **Next step**: teste manual no app real — arrastar e soltar com o xterm montado de verdade é o único caminho que jsdom não cobre. Se um terminal ficar em branco após reordenar, a correção é uma chamada de `fit` no `TerminalPane`.
- **Blockers**: nenhum.
- **Uncommitted files**: `.specs/` inteiro (gitignored) + 3 comentários obsoletos corrigidos em `src/App.tsx` depois do commit da feature. A feature em si já está commitada em `7ac042c` + `2b1d04a` — commitados pelo usuário, não por agente (AD-013).
- **Branch**: master

### Gap de precisão aceito conscientemente

LAYOUT-29 ("cada terminal restaurado nasce de sessão nova") é provado
estruturalmente — não existe coluna de sessão nem de saída no schema, e o
round-trip de `layout.rs` afirma a struct inteira — mas a asserção de nível de
App observa o **dublê** do `TerminalPane`, não o componente real, porque jsdom
não monta xterm.js. Registrado em `validation.md` em vez de mascarado.

### Handoff anterior — silent-update

- **Feature**: silent-update (`.specs/features/silent-update/`)
- **Phase / Task**: Tasks concluída — `spec.md`, `design.md` e `tasks.md` escritos; `validate_spec.py` e `validate_tasks.py` saem limpos (2 warnings esperados de `Tests: none` em T9 e T12, confirmados contra a matriz). Execute ainda não começou.
- **Completed**: nada de código. 28 requisitos (SILENT-01..28), 12 tasks em 5 fases, AD-005 e AD-006 registradas acima.
- **In-progress**: none
- **Next step**: `/senior:run-task` (ou Execute do `tlc-spec-driven`) a partir de T1. 12 tasks = 2 batches; a oferta de sub-agentes se aplica.
- **Blockers**: A pasta `.specs/features/release-distribution/` não existe no disco (`.specs` está no `.gitignore`), então os requisitos REL revogados por AD-005 não puderam ser marcados no documento original — o registro está na seção "Requisitos revogados" de `.specs/features/silent-update/spec.md`.
- **Uncommitted files**: `.specs/` inteiro (gitignored) — mais o que já estava pendente da feature anterior no working tree.
- **Branch**: master

### Perda de dados registrada (15/08/2026)

O diretório `.specs/` inteiro desapareceu do disco entre dois turnos de trabalho — `STATE.md` e `features/quota-indicator/` incluídos. Como `.specs` está no `.gitignore`, não há cópia no histórico para restaurar. Este arquivo foi reescrito a partir do contexto da sessão: as decisões AD-001 a AD-006 estão íntegras, mas **`.specs/features/quota-indicator/` (spec, design, tasks, validation) foi perdido** e não pôde ser reconstruído. A feature `quota-indicator` está implementada e verificada (Verifier PASS, 25/25 ACs) — o que se perdeu é a documentação dela, não o código.
