# Projetos — Especificação

## Problema

Um desenvolvedor rodando 4 agentes raramente está em um repositório só. Sem uma noção de projeto, as tarefas de todos os repositórios se misturam em uma lista única e o board perde utilidade. O projeto é a chave de agrupamento que amarra diretório, terminal e tarefa.

## Objetivos

- [ ] Toda tarefa criada por agente cai no projeto correto sem o usuário informar nada
- [ ] Distinguir visualmente a origem de qualquer tarefa ou terminal em menos de 1 segundo

## Fora de escopo

| Feature | Razão |
|---|---|
| Atalhos de projeto (project shortcuts) | Feature paga no original, limitada por tier — sem tiers, mas adiada por não ser núcleo |
| Configuração por projeto (env, comandos) | Não observado na instalação de referência |
| Conectar conta GitHub / criar repositório remoto | Decisão do usuário em 03/08/2026: "Initialize as Git repository" (PROJ-09) fica local-only nesta rodada — conectar GitHub abriria uma feature própria (OAuth, seção nova em `settings-shell`), registrada como ideia adiada em `STATE.md` |
| Recorte/preview do ícone do projeto | Observado só o botão "Add icon" (PROJ-08); nenhum fluxo de upload/recorte foi exercitado nas capturas disponíveis |

---

## Histórias de usuário

### P1: CRUD de projeto ⭐ MVP

**História**: Como desenvolvedor, quero registrar meus repositórios como projetos com nome e cor, para reconhecê-los de relance no board e nos terminais.

**Revisado em 03/08/2026** (triagem desta sessão, observação do modal "Create New Project" real — `.specs/research/screenshots/Captura de tela 2026-08-03 003640.png`): a cor deixa de ser só automática (AC1, AC7) e o diretório informado passa a ser uma **base** onde uma subpasta nova é criada (AC6) — não mais o próprio diretório do projeto. Ver PROJ-08/PROJ-09 para os dois campos novos observados no mesmo modal (ícone opcional, checkbox de git).

**Critérios de aceite**:
1. QUANDO o usuário cria um projeto ENTÃO o sistema DEVE exigir nome e diretório-base, e **sugerir automaticamente** uma cor ainda não usada como padrão pré-selecionado na paleta
2. QUANDO o usuário informa um diretório-base inexistente ENTÃO o sistema DEVE bloquear e sinalizar o campo
3. QUANDO o usuário informa um diretório-base que já resultaria numa subpasta de projeto coincidente com outro projeto existente ENTÃO o sistema DEVE recusar e apontar o projeto existente
4. QUANDO o usuário edita um projeto ENTÃO o sistema DEVE permitir alterar nome, diretório e cor, propagando às tarefas vinculadas
5. QUANDO o usuário exclui um projeto com tarefas ENTÃO o sistema DEVE avisar quantas serão afetadas e manter as tarefas como sem projeto
6. QUANDO o usuário confirma a criação ENTÃO o sistema DEVE criar uma subpasta nova dentro do diretório-base escolhido, nomeada a partir do nome do projeto — essa subpasta, e não o diretório-base em si, é a raiz registrada do projeto (PROJ-01)
7. QUANDO a paleta de cores é exibida no modal de criação ENTÃO o usuário DEVE poder clicar em qualquer cor para sobrescrever a sugestão automática antes de confirmar (PROJ-02)

**Teste independente**: criar dois projetos sem trocar a cor sugerida e verificar que receberam cores distintas; criar um terceiro clicando numa cor diferente da sugerida e verificar que a escolha manual venceu.

---

### P1: Resolução automática de projeto ⭐ MVP

**História**: Como agente, quero que minhas tarefas caiam no projeto certo sozinhas, para não depender do usuário classificar nada.

**Por que P1**: Sem isso a organização vira trabalho manual e ninguém mantém.

**Critérios de aceite**:
1. QUANDO uma tarefa é criada por um terminal ENTÃO o sistema DEVE resolver o projeto pelo diretório de trabalho daquele terminal
2. QUANDO o diretório é subpasta do diretório de um projeto ENTÃO o sistema DEVE resolver para esse projeto
3. QUANDO dois projetos casam com o diretório ENTÃO o sistema DEVE escolher o de caminho mais específico
4. QUANDO nenhum projeto casa ENTÃO o sistema DEVE usar o nome da pasta como projeto de fallback, sem falhar a criação da tarefa
5. QUANDO o diretório do terminal muda no meio da sessão ENTÃO tarefas novas DEVEM usar o projeto do diretório atual

**Teste independente**: abrir terminal numa subpasta de um projeto registrado, criar tarefa via agente e conferir o vínculo.

---

### P2: Listagem e organização

**História**: Como desenvolvedor com muitos projetos, quero encontrar o que quero rapidamente.

**Critérios de aceite**:
1. QUANDO a lista de projetos é exibida ENTÃO cada linha DEVE mostrar bolinha de cor, nome, caminho absoluto e contagem de tarefas
2. QUANDO o usuário ordena por último uso ENTÃO o sistema DEVE ordenar pelo instante da última atividade de terminal ou tarefa
3. QUANDO o usuário busca ENTÃO o sistema DEVE filtrar por nome e por caminho
4. QUANDO não há projeto nenhum ENTÃO o sistema DEVE mostrar um estado vazio que convida a criar o primeiro

---

### P1: Selecionar projeto ao iniciar um terminal ⭐ MVP

**Novo em 03/08/2026** — observado ao vivo em produto de referência, não fazia parte da spec anterior.

**História**: Como desenvolvedor, quero escolher a que projeto um terminal novo pertence a partir de uma lista dos projetos que já abri, para não navegar pelo sistema de arquivos toda vez que reabro um projeto conhecido.

**Por que P1**: É o ponto de entrada real de todo terminal novo — sem ele, um terminal nasceria sem projeto, quebrando a resolução automática (PROJ-03) e a organização do board.

**Observado em**: `.specs/research/screenshots/Captura de tela 2026-08-03 003525.png` (lista de projetos), `003653.png` (avançar para agente com o projeto escolhido)

**Critérios de aceite**:
1. QUANDO um painel de terminal ainda não foi configurado ENTÃO o sistema DEVE mostrar, dentro do próprio painel (não em diálogo flutuante — ver correção em `multi-terminal/spec.md`), um passo a passo "① PROJECT → ② AGENT", começando em PROJECT
2. QUANDO o passo PROJECT é exibido ENTÃO o sistema DEVE listar os projetos já registrados, cada linha com avatar/cor com a inicial do nome, nome, caminho absoluto e o tempo relativo desde a última abertura (ex.: "5 days")
3. QUANDO existe mais de um projeto ENTÃO o campo "Search projects..." DEVE filtrar a lista por nome a cada tecla
4. QUANDO o usuário seleciona um projeto da lista ENTÃO o sistema DEVE avançar para o passo AGENT levando esse projeto como contexto (nome, caminho e avatar exibidos no topo do passo AGENT)
5. QUANDO o usuário está no passo AGENT ENTÃO um botão "BACK" DEVE devolver ao passo PROJECT sem perder a lista
6. QUANDO o usuário clica em "Import Project" ENTÃO o sistema DEVE abrir o seletor nativo de pasta já especificado em `multi-terminal/spec.md` (TERM-10, TERM-11), restrito a diretórios existentes
7. QUANDO o usuário clica em "New Project" ENTÃO o sistema DEVE abrir o modal "Create New Project" (PROJ-01)
8. QUANDO o usuário fecha o passo a passo pelo "X" ENTÃO o painel do terminal DEVE voltar ao estado ocioso ("INITIALIZE AGENT — Select project to deploy agents"), sem criar terminal nenhum

**Não confirmado nesta observação — registrado como pendência, não inventado**:
- Comportamento exato de "Import Project" após a pasta ser escolhida: se registra o projeto direto (nome = nome da pasta, cor sugerida automaticamente) ou abre "Create New Project" pré-preenchido com essa pasta como diretório-base
- Significado exato do contador "N / M projects" no canto superior direito (hipótese não confirmada: quantidade de painéis de terminal ainda por configurar na sessão atual)

**Teste independente**: com dois projetos registrados, iniciar um terminal vazio, buscar por nome, selecionar um projeto e confirmar que o passo AGENT mostra o projeto certo.

---

### P1: Projeto "Sandbox" sem registro (No Project) ⭐ MVP

**Novo em 03/08/2026** — observado ao vivo, não fazia parte da spec anterior.

**História**: Como desenvolvedor, quero abrir um terminal sem vincular a nenhum projeto meu, para testar um agente rapidamente sem sujar minha lista de projetos.

**Observado em**: `.specs/research/screenshots/Captura de tela 2026-08-03 003653.png` — projeto "Sandbox", caminho de configuração local do produto de referência (pasta oculta no perfil do usuário)

**Critérios de aceite**:
1. QUANDO o usuário clica em "No Project" no passo PROJECT ENTÃO o sistema DEVE avançar direto para o passo AGENT com um pseudo-projeto fixo chamado "Sandbox"
2. O diretório do pseudo-projeto "Sandbox" DEVE ser uma pasta fixa dentro do diretório de dados do próprio app (ex.: `<app_data_dir>/sandbox`), criada automaticamente se ainda não existir — **não** "dentro de onde o projeto está instalado", correção sobre a descrição inicial deste pedido
3. O pseudo-projeto "Sandbox" NÃO DEVE aparecer na lista de projetos do passo PROJECT, não conta na contagem de projetos (PROJ-05), e não é editável nem excluível pela UI de gerenciamento de projetos
4. QUANDO dois terminais usam "No Project" ao mesmo tempo ENTÃO ambos DEVEM compartilhar o mesmo diretório sandbox (não isolado por terminal)

**Teste independente**: clicar em "No Project", confirmar que o terminal abre em `<app_data_dir>/sandbox` e que "Sandbox" não aparece na lista de projetos registrados nem na contagem.

---

### P2: Ícone do projeto (opcional)

**Novo em 03/08/2026** — observado ao vivo, não fazia parte da spec anterior.

**História**: Como desenvolvedor com muitos projetos parecidos, quero dar um ícone customizado a um projeto, para diferenciá-lo além da cor.

**Observado em**: `.specs/research/screenshots/Captura de tela 2026-08-03 003640.png` — campo "PROJECT ICON (OPTIONAL)", botão "Add icon"

**Critérios de aceite**:
1. QUANDO o modal "Create New Project" é exibido ENTÃO um campo "Project Icon" opcional DEVE estar disponível, sem bloquear a criação se deixado vazio
2. QUANDO nenhum ícone é definido ENTÃO o sistema DEVE continuar usando a inicial do nome sobre a cor do projeto, como já ocorre hoje (PROJ-05)

**Não confirmado nesta observação**: formato de arquivo aceito, se há recorte/preview, e se o ícone pode ser trocado depois da criação — nenhum desses fluxos foi exercitado na captura disponível.

---

### P1: Inicializar como repositório git ⭐ MVP

**Novo em 03/08/2026** — observado ao vivo, não fazia parte da spec anterior. Decisão do usuário nesta sessão: **git init local apenas**, sem exigir conta remota conectada (ver "Ideias adiadas" em `STATE.md` para o adiamento explícito de "conectar GitHub").

**História**: Como desenvolvedor criando um projeto do zero, quero que o app já rode `git init`, para não abrir um terminal à parte só para isso.

**Observado em**: `.specs/research/screenshots/Captura de tela 2026-08-03 003640.png` — checkbox "INITIALIZE AS GIT REPOSITORY", marcado por padrão

**Critérios de aceite**:
1. QUANDO o modal "Create New Project" é exibido ENTÃO o checkbox "Initialize as Git repository" DEVE vir marcado por padrão
2. QUANDO o projeto é criado com o checkbox marcado ENTÃO o sistema DEVE rodar `git init` na raiz do projeto — **local apenas**; nenhum repositório remoto é criado, configurado ou exigido
3. QUANDO um projeto tem `.git` sem `remote` configurado ENTÃO a UI DEVE sinalizar "sem remote" em algum ponto visível — candidatos: o header do terminal (junto do branch já previsto em `multi-terminal/spec.md` TERM-06) ou a linha do projeto na listagem (PROJ-05); local exato a decidir em Design
4. QUANDO o checkbox é desmarcado ENTÃO o projeto DEVE ser criado sem inicializar git, e nenhuma sinalização de "sem remote" se aplica (não é um repositório git)

**Fora de escopo desta história**: conectar conta GitHub, criar/vincular repositório remoto, push automático — decisão explícita do usuário nesta sessão, registrada em `STATE.md` → "Ideias adiadas".

**Teste independente**: criar projeto com o checkbox marcado, confirmar `.git` na raiz e o indicador de "sem remote" visível; criar outro com o checkbox desmarcado e confirmar que não há `.git` nem indicador.

---

## Casos de borda

- QUANDO o diretório de um projeto é apagado do disco ENTÃO o sistema DEVE marcá-lo como indisponível e manter as tarefas
- QUANDO dois projetos recebem o mesmo nome ENTÃO o sistema DEVE permitir, desde que os diretórios difiram, e desempatar pelo caminho na UI
- QUANDO todas as cores da paleta já foram usadas ENTÃO o sistema DEVE reciclar, priorizando a menos usada
- QUANDO o caminho é longo demais para a linha ENTÃO o sistema DEVE truncar no meio, preservando início e fim

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| PROJ-01 | P1: CRUD | Tasks | **Revisado 03/08/2026** — AC1/AC6/AC7 novos (subpasta dentro de diretório-base, cor com override manual). Implementação anterior (`T1, T3`) cobria a versão antiga; precisa de task nova para os ACs revisados |
| PROJ-02 | P1: Cores únicas | Tasks | **Revisado 03/08/2026** — cor deixa de ser só automática, vira sugestão com override manual (ver PROJ-01 AC7). Implementação anterior (`T1`) cobria só a versão automática |
| PROJ-03 | P1: Resolução por diretório | Tasks | Done — `T2` |
| PROJ-04 | P1: Fallback pelo nome da pasta | Tasks | Done — `T2` |
| PROJ-05 | P2: Listagem e ordenação | Tasks | Done — `T4` |
| PROJ-06 | P1: Selecionar projeto ao iniciar terminal | Tasks | **Novo 03/08/2026** — Pending |
| PROJ-07 | P1: Projeto "Sandbox" (No Project) | Tasks | **Novo 03/08/2026** — Pending |
| PROJ-08 | P2: Ícone do projeto (opcional) | Tasks | **Novo 03/08/2026** — Pending |
| PROJ-09 | P1: Inicializar como repositório git (local) | Tasks | **Novo 03/08/2026** — Pending |

**Cobertura:** 9 requisitos (5 originais + 4 novos desta sessão), **3 mapeados e implementados integralmente** (PROJ-03, PROJ-04, PROJ-05), **2 parcialmente cobertos** (PROJ-01, PROJ-02 — a versão antiga está implementada, os ACs novos não), **4 sem cobertura nenhuma** (PROJ-06, PROJ-07, PROJ-08, PROJ-09) ⚠️

---

## Critérios de sucesso

- [ ] 100% das tarefas criadas por agente caem no projeto certo, sem intervenção
- [ ] Origem de qualquer card identificável em < 1s pelo chip de cor
