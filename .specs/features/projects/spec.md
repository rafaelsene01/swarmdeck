# Projects Specification

## Problem Statement

Abrir um terminal hoje significa navegar num seletor de pastas do SO toda vez
(`NewTerminalDialog.tsx:56`), sem memória nenhuma de onde o usuário já trabalhou.
A tabela `projects` existe desde a migração `003_tasks.sql` e o módulo
`src-tauri/src/projects/` já implementa criação com cor e `git init`, resolução
de `cwd` para projeto e uma pasta-sandbox para "sem projeto" — mas **nada disso
está ligado à UI**, e a coluna `projects.last_used` nunca foi escrita por
ninguém. O resultado é um app que guarda projetos e não os usa.

Esta spec liga o que já existe: abrir terminal passa a ser um fluxo de duas
etapas — escolher o projeto, escolher o agente — com os projetos ordenados pelo
uso mais recente, e Configurações ganha criação e edição de projeto.

## Goals

- [ ] Abrir um terminal em um projeto já usado sem passar pelo seletor de pastas do SO.
- [ ] `projects.last_used` passa a ser escrito e vira a ordenação da lista de recentes.
- [ ] Criar um projeto novo (pasta + `git init` opcional) sem sair do app.
- [ ] Editar nome e cor de um projeto em Configurações.

## Out of Scope

Explicitamente excluído. Documentado para impedir crescimento de escopo.

| Feature | Reason |
| ------- | ------ |
| Chips "Turbo" e "Git Worktree" (`print/project_final.png`) | "Turbo" não existe em lugar nenhum do repositório e não tem comportamento definido; a spec de worktree foi removida do projeto (`CHANGELOG.md:332`). Nenhum dos dois foi pedido no texto da demanda. |
| Ícone do projeto (`print/new_project.png`) | Sem coluna, sem armazenamento e sem lugar de render. A cor já cumpre a função de distinguir projetos, que é o que a demanda pediu. |
| Contagem de **tarefas** por projeto ("N tasks") | Continua fora: não existe comando que a exponha; exige um `GROUP BY` novo. PROJ-23 conta **terminais abertos**, não tarefas — dado que o front já tem. |
| Dropdown "Sort by" em Configurações | Tem uma única opção ("Last Used"), que já é o comportamento fixo de `sortByLastUsed`. Controle sem efeito. |
| ~~Excluir projeto em Configurações~~ | **Entrou** por PROJ-24 (AD-024): pedido do usuário, com diálogo de confirmação e lixeira travada enquanto houver terminal aberto no projeto. |
| Editar o `path` de um projeto existente | Terminais só se identificam por `cwd`; trocar o `path` do projeto não move terminal nenhum e dessincroniza a resolução. Edição fica em nome + cor. |
| Encerrar os PTYs no fechamento do app (`TerminalManager::shutdown`) | O gancho de encerramento criado por PROJ-14 AC17 escreve `last_used` e nada mais. Ligar `shutdown()` — hoje código morto — mudaria o comportamento de saída do app e não foi pedido. |
| Coluna `project_id` em `terminal_layout` | Cópia de uma verdade que `cwd` + `projects::resolve` já produzem, e que envelhece quando o `path` é editado ou o projeto é apagado. |
| Persistir o agente padrão; persistir o catálogo de status de terminal | Lacunas pré-existentes do `SettingsShell` (`set_default_agent` sem comando; painel de status sem persistência). Não foram introduzidas aqui e não são consertadas aqui. |

---

## Baseline reconstruída (PROJ-01..PROJ-09)

O diretório `.specs/` inteiro sumiu do disco uma vez (registrado em
`.specs/STATE.md:245`; `.specs` está no `.gitignore`) e levou junto a spec
original desta feature. Os requisitos abaixo foram **reconstruídos a partir do
código sobrevivente**, não recuperados — o texto original está perdido. Cada um
cita a evidência que o sustenta. Nenhum requisito foi inventado para preencher
lacuna: PROJ-06 e PROJ-08 não têm referência em nenhum arquivo do repositório e
ficam registrados como irrecuperáveis.

| ID | Comportamento reconstruído | Evidência | Situação |
| -- | -------------------------- | --------- | -------- |
| PROJ-01 | Criar projeto com nome não-vazio e diretório existente; cor atribuída automaticamente pela menos usada da paleta; listagem ordenada por nome. AC6/AC7 (subpasta a partir de um diretório-base; cor explícita) referidos por `create_with_options`. | `projects/service.rs:131`, `:165-167`, `:228` | **Revisado** por PROJ-18 (cor deixa de ser exclusiva). |
| PROJ-02 | Cor do projeto como campo de primeira classe, escolhível na criação. | `projects/service.rs:1`, `:165-167` | **Revisado** por PROJ-18. |
| PROJ-03 | O `cwd` de um terminal resolve para o projeto mais específico que o contém. | `projects/resolve.rs:1`, `:6`, `service.rs:341` | Mantido; reusado por PROJ-14. |
| PROJ-04 | Sem projeto correspondente, a resolução cai no nome da última pasta do `cwd`, sem falhar; tarefas leem os campos do projeto pelo join. | `projects/resolve.rs:17`, `service.rs:254` | Mantido. |
| PROJ-05 | Painel de projetos em Configurações, com busca e ordenação locais. | `routes/settings/ProjectsPanel.tsx:1`, `:58` | **Estendido** por PROJ-19 e PROJ-20. |
| PROJ-06 | — | nenhuma referência no repositório | **Irrecuperável.** |
| PROJ-07 | "Sem projeto" usa uma pasta-sandbox fixa dentro do diretório de dados do app; nunca vira linha em `projects`, não aparece na listagem nem conta no total, e é compartilhada por todos os terminais que a escolherem. | `projects/sandbox.rs:1`, `:7-11`, `:40`, `:48` | Mantido; **ligado à UI** por PROJ-16. |
| PROJ-08 | — | nenhuma referência no repositório | **Irrecuperável.** |
| PROJ-09 | `git init` roda na pasta nova quando pedido; falha de spawn e saída não-zero são erros distintos. | `projects/service.rs:1`, `:435` | Mantido; **estendido** por PROJ-18 AC5. |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| `last_used` ao fechar terminal e ao fechar o app | Escrever nos três momentos: abrir, fechar terminal, fechar app | Decisão do usuário, tomada depois de ver o custo e a objeção. A objeção continua valendo e fica registrada como trade-off aceito: no encerramento, todos os projetos com terminal aberto recebem o mesmo instante, então **entre eles** a ordenação vira empate resolvido arbitrariamente. Em troca, um projeto usado o dia inteiro deixa de aparecer com a idade da abertura. | **y** |
| Onde os dois gatilhos novos moram | Backend, sem tocar no `App.tsx` | `manager.kill` já tem o `cwd` da `Entry` que remove (`manager.rs:183`) e todo fechamento passa por `pty_kill`; `manager.list()` já expõe o `cwd` de toda sessão viva (`manager.rs:196`). Pôr isso no frontend duplicaria em três handlers o que o backend resolve num ponto. | y |
| `TerminalManager::shutdown()` no gancho de encerramento | Não chamar | Hoje é código morto (só um teste o chama) e os PTYs morrem por teardown do SO. Ligá-lo mudaria o comportamento de saída do app; o gancho desta feature escreve `last_used` e sai. | y |
| "Reiniciar terminal" também escreve `last_used` | Aceito | `handleResetTerminal` desmonta e remonta o painel, o que passa por `pty_kill`. Reabrir um terminal no projeto é uso do projeto, então o write está certo; evitar isso exigiria um caminho de kill separado só para o reset. | y |
| Como o terminal sabe seu projeto | Derivar de `cwd` via `projects::resolve` | Coluna `project_id` seria segunda fonte de verdade, invalidada por edição de `path` e por exclusão de projeto, e exigiria migração + backfill. `resolve` é puro, já é o taggeador de tarefas e já devolve o caso "sem projeto". | n |
| Onde o wizard é renderizado | Dentro do painel, como componente irmão de `TerminalPane` | `print/term_project.png` e `print/project_final.png` desenham a moldura do painel ao redor do wizard. `TerminalHeader` já é irmão de `TerminalPane` dentro de `.app-pane__body` (`App.tsx:738-776`), então a troca é um ternário — e um componente irmão não herda nenhum ramo nulo do ciclo de vida do PTY. | n |
| Tamanho da paleta de cores | Manter as 8 de `service.rs:29` (o mockup mostra 10) | Trocar a paleta mudaria a cor já atribuída aos projetos existentes. Oito cores distintas cobrem o propósito declarado ("só para diferenciar o projeto dos demais"). | n |
| Exclusividade de cor entre projetos | Remover a rejeição | `validate_explicit_color:414` recusa uma cor já usada por outro projeto; com 8 cores isso trava a criação do 9º projeto. `create_with_options` nunca rodou em produção, então nada regride. | n |
| Nome do projeto no "Import Project" | Nome da última pasta do caminho, sem perguntar | O mockup não tem campo de nome nesse botão. `create(name, path)` de 3 argumentos já faz exatamente isso. | n |
| Fonte da lista de recentes | `project_list` + `sortByLastUsed` no cliente | `sortByLastUsed` já existe e já trata `last_used` nulo. Um `project_list_recent` no backend (citado em `sandbox.rs:8`) seria um comando novo para uma ordenação de duas dezenas de linhas. | n |
| Rótulo de idade de projeto nunca aberto | `nunca` | Nenhuma linha existente tem `last_used` — todas são `NULL`. Sem rótulo próprio, o primeiro boot depois do ship mostraria "56a" em todas. | n |
| "Nova sessão" no passo 2 | É o botão de confirmar do wizard | Um terminal novo não tem sessão de agente a retomar; `--resume` continua sendo assunto exclusivo de `session-restore` (SESS-12/13). | n |
| Rascunho e o teto de 4 terminais | O rascunho ocupa um slot | Ele já ocupa uma célula do grid; não contá-lo permitiria abrir um 5º painel. | n |
| Pasta órfã quando `git init` falha | Apagar a pasta recém-criada antes de propagar o erro | `create_with_options` faz `fs::create_dir` e só depois `run_git_init`; sem isso a pasta fica no disco sem linha no banco, e a segunda tentativa com o mesmo nome falha em `AlreadyExists` — o usuário fica travado sem entender por quê. | n |
| Idioma da UI nova | pt-BR, como o resto dos componentes | O app não tem camada de i18n; todos os textos são literais em português. | n |

**Open questions:** none — todas resolvidas ou registradas acima.

**Dimensões implícitas (varredura Large, obrigatória):**

| Dimensão | Resolução |
| -------- | --------- |
| Validação de entrada e limites | P2 AC9 (nome não-vazio), P2 AC12 (cor da paleta), P1 AC14 (teto de 4 painéis). |
| Falha e falha parcial | P2 AC11 (`git init` falha → pasta removida), P1 AC15 (pasta do projeto sumiu do disco), P1 AC19 (falha de gravação no encerramento não trava a saída). |
| Idempotência / repetição / duplicata | P2 AC10 (caminho já registrado), P2 AC5 (importar pasta já registrada seleciona a existente), edge case do encerramento com dois terminais no mesmo projeto (grava uma vez). |
| Fronteiras de auth e rate limit | N/A — app desktop local, sessão única, sem multiusuário e sem chamada remota nesta feature. |
| Concorrência / ordenação | Dois rascunhos abertos são independentes; cada write de `last_used` é um único `UPDATE`. Trade-off aceito e registrado acima: no encerramento os projetos abertos empatam no mesmo instante. |
| Ciclo de vida / expiração de dados | N/A — `last_used` não expira e nada é arquivado ou purgado nesta feature. |
| Observabilidade | N/A — o app não tem camada de log estruturado hoje; introduzir uma está fora do escopo desta feature. |
| Falha de dependência externa | P2 AC11 (`git` ausente do PATH → erro exibido, projeto não criado). |
| Integridade de transição de estado | P1 AC12 e AC13 (rascunho nunca é persistido; a transição rascunho → vivo é de mão única); P1 AC18 (fechar rascunho não grava nada). |

---

## User Stories

### P1: Escolher projeto e agente ao abrir um terminal ⭐ MVP

**User Story**: Como usuário do SwarmDeck, quero abrir um terminal escolhendo
entre os projetos que já usei, para que começar a trabalhar não custe uma
navegação no seletor de pastas do SO toda vez.

**Why P1**: É o centro da demanda e o que `print/term_project.png` e
`print/project_final.png` documentam. Sem isso `last_used` continua sem escritor
e a tabela `projects` continua sem uso.

**Acceptance Criteria**:

1. WHEN o usuário aciona qualquer um dos três gatilhos de novo terminal (o ícone de terminal no header, o CTA do estado vazio, Ctrl+T) THEN o sistema SHALL inserir na aba ativa um painel em estado de rascunho exibindo a etapa "PROJECT" do wizard, e SHALL não chamar `pty_spawn`. <!-- PROJ-11 -->
2. WHILE a etapa "PROJECT" está visível o sistema SHALL listar cada projeto de `project_list` com um quadrado na cor do projeto contendo a inicial do nome, o nome, o caminho truncado e a idade do último uso, ordenados do mais recente para o mais antigo e com os nunca abertos por último. <!-- PROJ-10 -->
3. WHILE a etapa "PROJECT" está visível o sistema SHALL exibir o contador no formato "N / M projects", com N igual ao número de projetos listados após o filtro de busca e M igual ao total de projetos. <!-- PROJ-10 -->
4. WHEN o usuário digita na busca THEN o sistema SHALL manter na lista apenas os projetos cujo nome ou caminho contenham o texto, sem diferenciar maiúsculas de minúsculas. <!-- PROJ-10 -->
5. WHEN o usuário seleciona um projeto na etapa "PROJECT" THEN o sistema SHALL avançar para a etapa "AGENT" exibindo o cartão do projeto escolhido com nome, caminho e cor, e um botão "Voltar". <!-- PROJ-13 -->
6. WHEN o usuário aciona "Voltar" na etapa "AGENT" THEN o sistema SHALL retornar à etapa "PROJECT" preservando o texto digitado na busca. <!-- PROJ-13 -->
7. WHILE a etapa "AGENT" está visível o sistema SHALL exibir os 5 agentes de `CATALOG` na ordem do catálogo, SHALL pré-selecionar o agente padrão efetivo e SHALL desabilitar todo agente cujo comando não resolveu no PATH **e todo agente fora da lista de escolhíveis (hoje só `claude-code`, por AD-022)**. <!-- PROJ-13 -->
8. WHEN o usuário aciona "Nova sessão" THEN o sistema SHALL converter o painel de rascunho em terminal vivo com `cwd` igual ao caminho do projeto e o agente selecionado, montando `TerminalPane`. <!-- PROJ-13 -->
9. WHEN um painel de rascunho é convertido em terminal vivo com um projeto selecionado THEN o sistema SHALL gravar o instante atual em `projects.last_used` daquele projeto. <!-- PROJ-14 -->
10. WHEN o usuário restaura terminais pelo modal de restauração de sessão THEN o sistema SHALL gravar o instante atual em `projects.last_used` de cada projeto que `projects::resolve` casar com o `cwd` de um terminal restaurado. <!-- PROJ-14 -->
11. The system SHALL renderizar a idade do último uso como `agora` abaixo de 1 minuto, `Nmin` abaixo de 1 hora, `Nh` abaixo de 24 horas, `Nd` abaixo de 7 dias, `Nsem` abaixo de 30 dias, `Nmes` abaixo de 365 dias, `Na` acima disso, e `nunca` quando `last_used` for nulo. <!-- PROJ-15 -->
12. The system SHALL nunca incluir um painel em estado de rascunho no payload enviado a `terminal_workspace_set`. <!-- PROJ-12 -->
13. WHEN o usuário fecha um painel em estado de rascunho THEN o sistema SHALL removê-lo da aba sem chamar `pty_kill`. <!-- PROJ-12 -->
14. WHILE existir ao menos um painel de rascunho aberto o sistema SHALL contá-lo no total de painéis que trava o gatilho de novo terminal em 4. <!-- PROJ-11 -->
15. IF o caminho do projeto selecionado não existe mais no disco THEN o sistema SHALL manter o wizard na etapa "PROJECT" e SHALL exibir o caminho ausente na mensagem de erro. <!-- PROJ-13 -->
16. WHEN um terminal vivo é encerrado THEN o sistema SHALL gravar o instante atual em `projects.last_used` do projeto que `projects::resolve` casar com o `cwd` daquele terminal. <!-- PROJ-14 -->
17. WHEN o app encerra THEN o sistema SHALL gravar o instante atual em `projects.last_used` de cada projeto que `projects::resolve` casar com o `cwd` de alguma sessão ainda viva. <!-- PROJ-14 -->
18. WHEN um painel em estado de rascunho é fechado THEN o sistema SHALL não gravar `last_used` em nenhuma linha de `projects`. <!-- PROJ-14, PROJ-12 -->
19. IF a gravação de `last_used` falha durante o encerramento do app THEN o sistema SHALL prosseguir com o encerramento sem exibir erro nem travar a saída. <!-- PROJ-14 -->
20. WHEN o usuário aciona "Terminal" (rotulado "Terminal limpo" até AD-022) na etapa "AGENT" THEN o sistema SHALL desmarcar todo agente e SHALL abrir o terminal como shell puro no caminho escolhido, sem iniciar agente nenhum; essa opção SHALL estar sempre habilitada, independentemente do que resolveu no PATH. <!-- PROJ-21 -->

**Independent Test**: com dois projetos registrados, acionar Ctrl+T numa aba
vazia, ver a lista ordenada com as idades, escolher um projeto, escolher Claude
Code, acionar "Nova sessão" e ver o terminal subir naquele diretório; reabrir o
wizard e ver que o projeto usado subiu para o topo com idade `agora`. Depois
abrir um terminal no projeto B, esperar um minuto, fechar o terminal de B e ver
que B passou à frente de A na lista.

---

### P2: Entrar sem projeto, importar pasta existente ou criar projeto novo

**User Story**: Como usuário do SwarmDeck, quero poder abrir um terminal numa
pasta que ainda não é projeto, registrar uma pasta existente como projeto, ou
criar um projeto do zero, para que a lista de recentes não seja a única porta de
entrada.

**Why P2**: Sem P1 não há onde esses três botões morarem. Com P1 e sem P2 o
usuário fica preso aos projetos que já existem e não tem como criar o primeiro.

**Acceptance Criteria**:

1. WHEN o usuário aciona "No Project" na etapa "PROJECT" THEN o sistema SHALL avançar para a etapa "AGENT" com o `cwd` apontando para a pasta-sandbox do diretório de dados do app, criando-a se ainda não existir. <!-- PROJ-16 -->
2. The system SHALL nunca inserir a pasta-sandbox na tabela `projects`, nunca listá-la na etapa "PROJECT" e nunca contá-la no "N / M projects". <!-- PROJ-16 -->
3. WHEN um terminal é aberto com "No Project" THEN o sistema SHALL não gravar `last_used` em nenhuma linha de `projects`. <!-- PROJ-16 -->
4. WHEN o usuário aciona "Import Project" e escolhe uma pasta no seletor do SO THEN o sistema SHALL registrar essa pasta como projeto usando o nome da última pasta do caminho, e SHALL selecioná-la avançando para a etapa "AGENT". <!-- PROJ-17 -->
5. IF a pasta escolhida em "Import Project" já pertence a um projeto registrado THEN o sistema SHALL selecionar o projeto existente em vez de criar outro, e SHALL avançar para a etapa "AGENT". <!-- PROJ-17 -->
6. WHEN o usuário aciona "New Project" THEN o sistema SHALL exibir um formulário com nome, seletor de diretório-base, as 8 cores da paleta e uma opção "inicializar como repositório git". <!-- PROJ-18 -->
7. WHEN o usuário confirma a criação THEN o sistema SHALL criar uma subpasta com o nome do projeto dentro do diretório-base, registrar essa subpasta como o `path` do projeto, e SHALL selecioná-la avançando para a etapa "AGENT". <!-- PROJ-18 -->
8. WHERE a opção "inicializar como repositório git" está marcada o sistema SHALL executar `git init` na subpasta criada antes de registrar o projeto. <!-- PROJ-18 -->
9. IF o nome do projeto está vazio ou só com espaços THEN o sistema SHALL manter o formulário aberto e SHALL não criar pasta nenhuma. <!-- PROJ-18 -->
10. IF a subpasta a criar já pertence a outro projeto registrado THEN o sistema SHALL exibir o nome do projeto que já ocupa aquele caminho e SHALL não criar nada. <!-- PROJ-18 -->
11. IF `git init` falha por ausência do executável ou por saída não-zero THEN o sistema SHALL remover a subpasta recém-criada, SHALL não registrar o projeto e SHALL exibir a mensagem do erro. <!-- PROJ-18 -->
12. The system SHALL aceitar qualquer cor da paleta na criação, mesmo que outro projeto já a use. <!-- PROJ-18 -->

**Independent Test**: acionar "New Project", nomear `teste-git`, escolher um
diretório-base, marcar a opção de git, confirmar, e encontrar
`<base>/teste-git/.git` no disco e o projeto no topo da lista; repetir com o
mesmo nome e ver o erro apontando o projeto existente.

---

### P3: Gerenciar projetos em Configurações

**User Story**: Como usuário do SwarmDeck, quero listar, buscar, criar e excluir
projetos na tela de Configurações, para que administrar a carteira de projetos
não dependa de estar abrindo um terminal.

**Why P3**: O wizard já cobre criar no fluxo de trabalho. Configurações é a
porta secundária — útil, não bloqueante.

**Acceptance Criteria**:

1. WHILE o painel "Projetos" de Configurações está aberto o sistema SHALL listar cada projeto com sua cor, nome e caminho truncado. <!-- PROJ-19 -->
2. WHEN o usuário aciona "Criar projeto" no painel de Configurações THEN o sistema SHALL exibir o mesmo formulário de criação de PROJ-18. <!-- PROJ-19 -->
3. WHEN a criação em Configurações conclui THEN o sistema SHALL recarregar a lista exibida a partir de `project_list`. <!-- PROJ-19 -->
4. WHEN o painel desenha a linha de um projeto THEN o sistema SHALL exibir a cor do projeto como um quadrado com a primeira letra do nome, em maiúscula, dentro dele. <!-- PROJ-22 -->
5. WHILE o painel está aberto o sistema SHALL exibir, em cada linha, quantos terminais abertos têm `cwd` igual a — ou dentro de — o `path` daquele projeto, aplicando a mesma regra de especificidade de `projects::resolve` (o projeto de caminho mais longo vence). <!-- PROJ-23 -->
6. IF nenhum terminal aberto casa com o `path` do projeto THEN o sistema SHALL exibir a contagem como zero. <!-- PROJ-23 -->
7. WHEN o usuário aciona o botão de excluir de uma linha THEN o sistema SHALL exibir um diálogo de confirmação com o nome do projeto e o aviso de que as tarefas dele ficam sem projeto. <!-- PROJ-24 -->
8. WHEN o usuário confirma a exclusão THEN o sistema SHALL chamar `project_delete` e SHALL recarregar a lista exibida a partir de `project_list`. <!-- PROJ-24 -->
9. WHEN o usuário cancela o diálogo THEN o sistema SHALL fechar o diálogo e SHALL não excluir nada. <!-- PROJ-24 -->
10. IF o projeto tem ao menos um terminal aberto THEN o sistema SHALL manter o botão de excluir daquela linha desabilitado e SHALL não abrir o diálogo. <!-- PROJ-24 -->
11. IF `project_delete` falha THEN o sistema SHALL exibir a mensagem do erro e SHALL manter a linha na lista. <!-- PROJ-24 -->

**Independent Test**: abrir Configurações › Projetos com um terminal aberto no
projeto A e nenhum no projeto B; a linha de A mostra 1 terminal e a lixeira
desabilitada, a de B mostra 0 e exclui após confirmar.

---

## Edge Cases

- IF `project_list` devolve zero projetos THEN o sistema SHALL exibir a etapa "PROJECT" com "0 / 0 projects" e os três botões de rodapé ativos.
- IF nenhum agente do catálogo resolveu no PATH THEN o sistema SHALL manter "Nova sessão" habilitado e SHALL abrir o terminal sem agente, no shell puro.
- IF o usuário fecha a aba inteira com um rascunho dentro THEN o sistema SHALL descartar o rascunho sem chamar `pty_kill`.
- IF um terminal aberto com "No Project" é encerrado THEN o sistema SHALL não gravar `last_used` em nenhuma linha, porque a pasta-sandbox não é projeto.
- IF o `cwd` de um terminal encerrado não casa com nenhum projeto THEN o sistema SHALL encerrar o terminal normalmente sem gravar nada.
- WHEN o app encerra com dois terminais no mesmo projeto THEN o sistema SHALL gravar `last_used` daquele projeto uma única vez.
- WHEN um projeto tem caminho mais longo que o limite de truncamento THEN o sistema SHALL exibir início e fim separados por reticências, com o caminho completo no atributo de título.
- IF o diretório-base escolhido em "New Project" não existe mais no momento da confirmação THEN o sistema SHALL exibir o caminho ausente e SHALL não criar nada.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PROJ-10 | P1: Escolher projeto e agente | Tasks | Implementing |
| PROJ-11 | P1: Escolher projeto e agente | Tasks | Implementing |
| PROJ-12 | P1: Escolher projeto e agente | Tasks | Implementing |
| PROJ-13 | P1: Escolher projeto e agente | Tasks | Implementing |
| PROJ-14 | P1: Escolher projeto e agente | Tasks | Implementing |
| PROJ-15 | P1: Escolher projeto e agente | Tasks | Implementing |
| PROJ-16 | P2: Sem projeto / importar / criar | Tasks | Implementing |
| PROJ-17 | P2: Sem projeto / importar / criar | Tasks | Implementing |
| PROJ-18 | P2: Sem projeto / importar / criar | Tasks | Implementing |
| PROJ-19 | P3: Gerenciar projetos | Tasks | Implementing |
| PROJ-20 | P3: Gerenciar projetos | — | **Revogado por AD-024** |
| PROJ-21 | P1: Escolher projeto e agente | Execute | Implemented |
| PROJ-22 | P3: Gerenciar projetos | Execute | Implementing |
| PROJ-23 | P3: Gerenciar projetos | Execute | Implementing |
| PROJ-24 | P3: Gerenciar projetos | Execute | Implementing |

**Coverage:** 14 requisitos vivos, 14 mapeados, 0 sem mapeamento. PROJ-20 saiu (AD-024).

---

## Requisitos revogados por esta spec

| Requisito | O que sai | Revogado por |
| --------- | --------- | ------------ |
| TERM-10 | O seletor nativo de pastas como única forma de definir o `cwd` de um terminal novo, com "criar" travado enquanto o campo estiver vazio. | PROJ-10 / PROJ-13 — o `cwd` passa a vir da escolha de projeto; o seletor sobrevive só dentro de "Import Project" e "New Project". |
| TERM-11 | A memória do "último diretório usado" (`terminal_picker_prefs`) como ponto de partida do seletor do terminal novo. | PROJ-10 — a lista de recentes ordenada por `last_used` substitui essa memória. A tabela e os comandos permanecem, usados pelos seletores de PROJ-17 e PROJ-18. |
| PROJ-01 AC7 (parcial) | A exclusividade de cor entre projetos. | PROJ-18 AC12. |
| PROJ-19 AC1 (parcial) | A proibição de exibir contagem na linha do projeto ("SHALL não exibir contagem de tarefas", motivada por AD-004: nenhum comando expunha o número). | PROJ-23 / AD-024 — a coluna passa a contar **terminais abertos**, que o front já conhece por `terminal_workspace_get`; não é mais número sem fonte. |
| PROJ-20 (inteiro) | O botão de edição por linha e o modo `edit` do `ProjectFormModal` (alterar nome e cor de projeto já registrado). | AD-024 — a linha passa a ter só excluir; o modo `edit` do formulário saiu junto com o código. |

---

## Success Criteria

- [ ] Abrir um terminal num projeto já usado leva 3 interações (gatilho, clique no projeto, "Nova sessão") e zero navegação no seletor do SO.
- [ ] Depois de abrir um terminal em um projeto, reabrir o wizard mostra aquele projeto em primeiro lugar com idade `agora`.
- [ ] Fechar um terminal e reabrir o wizard mostra aquele projeto no topo com idade `agora`.
- [ ] Fechar o app com um terminal aberto e reabrir mostra aquele projeto no topo, não com a idade de quando ele foi aberto.
- [ ] Fechar o app com um wizard aberto e reabrir não produz nenhum terminal fantasma no modal de restauração.
- [ ] Criar um projeto com `git init` marcado deixa `<base>/<nome>/.git` no disco e o projeto listado.
- [ ] `npm run build`, `npm test` e `cargo test` passam.
