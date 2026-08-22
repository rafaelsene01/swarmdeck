# Providers Panel Specification

## Problem Statement

Configurações › Provedores hoje é uma grade de cards que serve a uma decisão que o app não usa mais: escolher o "agente padrão" (AGT-01), revogado na prática por AD-035 — o wizard pré-marca "Terminal", não um agente. Pior, a grade lê `agent_catalog`, que só olha o perfil de terminal padrão: num Windows com WSL, um `claude` instalado dentro da distro aparece como "não encontrado no PATH". E nada da detecção fica salvo: cada processo re-sonda `wsl.exe`, e o usuário não tem como dizer "não me ofereça este provedor".

Esta feature troca a grade por uma lista com a mesma identidade visual de Configurações › Projetos: quem é o provedor, em quais terminais ele foi encontrado, e um switch para habilitar. O que fica habilitado é o que o wizard oferece na hora de abrir um terminal com provedor.

## Goals

- [ ] Uma linha por provedor do catálogo (5 hoje), com ícone, locais de detecção e switch — visual de `ProjectsPanel`.
- [ ] O resultado da varredura fica salvo no banco; abrir a seção não custa `wsl.exe`.
- [ ] Um botão "Atualizar" revarre host + todas as distros WSL e regrava o resultado.
- [ ] O wizard de novo terminal oferece exatamente os provedores encontrados no perfil daquela pasta **e** habilitados.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Detecção por diretório de config (`~/.claude/*`) | A sonda `command -v` sob shell de login (WSLP-22) já acha o CLI instalado; a pasta de config só existe depois da primeira execução, então detectaria menos. Decidido com o usuário. |
| Reordenar provedores na lista | A ordem é a do catálogo Rust, que já é a ordem de exibição em toda a UI. |
| Instalar / atualizar um CLI pelo painel | O app detecta e lança; não gerencia instalação. |
| Escolher um "provedor padrão" | Revogado por AD-035 (o wizard pré-marca "Terminal"). Esta feature remove a última UI que ainda o oferecia. |
| Habilitar um provedor por perfil de terminal | O switch é por provedor, global. Um provedor achado em dois terminais é um switch só. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Rótulo dos locais de detecção | Os `label` de `shells::list::ProfileEntry` — "Windows", "Ubuntu-24.04", "… (WSL1)" | Já é o rótulo que o selo do wizard mostra (BOOT-12); inventar um segundo vocabulário faria a mesma distro ter dois nomes na UI. O host era "Windows (padrão)" e virou "Windows" a pedido do usuário (AD-037) | y |
| Provedor achado em exatamente um local | Coluna do centro vazia | Pedido explícito do usuário: a informação só paga a tela quando há mais de um lugar possível | y |
| Provedor já habilitado que deixa de ser encontrado numa varredura | Vira travado e desligado; a escolha anterior não é preservada | Um switch ligado apontando para um CLI que não existe ofereceria no wizard um provedor que falha ao subir | y |
| Provedor que volta a ser encontrado | Volta ligado | Mesma regra do primeiro encontro; guardar "estava desligado antes" exigiria um terceiro estado que o usuário não pediu | y |
| Varredura da primeira vez | `provider_prefs_get` varre e persiste quando a tabela está vazia | Um caminho só: qualquer leitor (boot, janela de Configurações) herda a regra sem duplicá-la | y |
| Quando o boot varre | A cada abertura do app, não só quando não há nada salvo | Pedido do usuário. Custo zero: o boot já paga uma sonda `wsl.exe` por distro em `agent_catalog_all`; a varredura reusa a mesma sonda e acrescenta a gravação, e roda **antes** para que `agent_catalog_all` leia do cache quente | y |
| Provedores liberados no wizard | Todos os encontrados + habilitados, não só `claude-code` | Escolha do usuário. `agents::launch` já resolve qualquer descritor do catálogo; sessão retomável e modo de permissão continuam só onde o CLI declara as flags | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Ver e governar os provedores ⭐ MVP

**User Story**: Como usuário com Windows + várias distros WSL, quero ver cada provedor com os terminais onde ele foi encontrado e um switch, para controlar o que o app me oferece.

**Why P1**: É a tela pedida; sem ela nada do resto tem superfície.

**Acceptance Criteria**:

1. The system SHALL exibir uma linha por provedor do catálogo Rust, na ordem do catálogo, com o ícone de marca do provedor à esquerda e um switch à direita.
2. WHERE o provedor foi encontrado em mais de um perfil de terminal, the system SHALL listar no centro da linha o rótulo de cada perfil onde ele foi encontrado.
3. WHERE o provedor foi encontrado em exatamente um perfil de terminal, the system SHALL deixar o centro da linha vazio.
4. IF o provedor não foi encontrado em nenhum perfil de terminal, THEN the system SHALL renderizar o switch desligado e desabilitado, e marcar a linha como não encontrada.
5. WHEN o usuário alterna o switch de um provedor encontrado, THEN the system SHALL persistir o novo valor e devolvê-lo na leitura seguinte.

**Independent Test**: abrir Configurações › Provedores num Windows com WSL: as 5 linhas aparecem, `claude-code` mostra os dois rótulos, um provedor ausente aparece travado; ligar/desligar um switch e reabrir a janela mantém o estado.

---

### P1: Varrer e salvar ⭐ MVP

**User Story**: Como usuário, quero um botão que revarra todos os terminais por todos os provedores e guarde o resultado, para a lista refletir o que acabei de instalar sem eu reiniciar o app.

**Why P1**: Sem varredura persistida a lista não tem de onde nascer.

**Acceptance Criteria**:

1. WHEN o usuário aciona "Atualizar", THEN the system SHALL sondar cada perfil de terminal disponível (host mais cada distro WSL registrada) por cada provedor do catálogo e gravar o resultado.
2. WHEN uma varredura é acionada, THEN the system SHALL descartar o cache de sondagem por distro do processo antes de sondar, para o resultado refletir o disco e não a resposta anterior.
3. WHILE a varredura está em curso, the system SHALL manter o botão "Atualizar" desabilitado.
4. WHEN a leitura das preferências encontra a tabela vazia, THEN the system SHALL executar uma varredura completa e persistir o resultado antes de responder.
5. WHEN o app inicia, THEN the system SHALL executar a varredura completa e regravar o resultado.
6. WHEN a seção Provedores é aberta com dados salvos, THEN the system SHALL exibir o salvo sem sondar nenhum perfil.
7. WHEN uma varredura encontra um provedor sem registro anterior, THEN the system SHALL gravá-lo habilitado.
8. IF um provedor registrado como habilitado não é encontrado em nenhum perfil na varredura, THEN the system SHALL gravá-lo desabilitado.

**Independent Test**: instalar um CLI do catálogo dentro de uma distro com o app aberto, clicar "Atualizar" e ver a linha passar de travada para habilitada com o rótulo da distro; reabrir a seção e a linha continua lá sem novo `wsl.exe`.

---

### P1: Só o habilitado é escolhível ⭐ MVP

**User Story**: Como usuário, quero que o wizard de novo terminal ofereça apenas os provedores que estão encontrados e habilitados.

**Why P1**: É o que dá sentido ao switch; sem isso o painel é decorativo.

**Acceptance Criteria**:

1. WHEN a etapa AGENT do wizard monta a grade, THEN the system SHALL habilitar o ladrilho de um provedor apenas se ele estiver habilitado nas preferências **e** encontrado no perfil de terminal daquela pasta.
2. IF um provedor está desabilitado nas preferências, THEN the system SHALL renderizar o ladrilho dele desabilitado, mesmo que o CLI esteja instalado naquele perfil.
3. The system SHALL manter o ladrilho "Terminal" (shell puro) sempre habilitado, independente de qualquer provedor.

**Independent Test**: desligar `claude-code` em Configurações, abrir um painel novo e ver o ladrilho do Claude cinza; religar e ele volta clicável.

---

## Edge Cases

- IF `wsl.exe` não existe, falha, ou o alvo não é Windows, THEN a varredura SHALL considerar apenas o perfil host e concluir sem erro.
- IF a gravação das preferências falha, THEN a leitura seguinte SHALL devolver o último estado gravado com sucesso, sem derrubar o painel.
- IF nenhum provedor é encontrado em nenhum perfil, THEN o painel SHALL listar as 5 linhas todas travadas, e o wizard SHALL continuar oferecendo o ladrilho "Terminal".
- IF a leitura das preferências falha no frontend, THEN o painel SHALL exibir a lista vazia com o erro registrado no console, sem impedir o uso das outras seções.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PROV-01 | P1: Ver e governar | Execute | Implementing |
| PROV-02 | P1: Ver e governar | Execute | Implementing |
| PROV-03 | P1: Ver e governar | Execute | Implementing |
| PROV-04 | P1: Ver e governar | Execute | Implementing |
| PROV-05 | P1: Ver e governar | Execute | Implementing |
| PROV-06 | P1: Varrer e salvar | Execute | Implementing |
| PROV-07 | P1: Varrer e salvar | Execute | Implementing |
| PROV-08 | P1: Varrer e salvar | Execute | Implementing |
| PROV-09 | P1: Varrer e salvar | Execute | Implementing |
| PROV-10 | P1: Varrer e salvar | Execute | Implementing |
| PROV-11 | P1: Varrer e salvar | Execute | Implementing |
| PROV-12 | P1: Varrer e salvar | Execute | Implementing |
| PROV-13 | P1: Varrer e salvar | Execute | Implementing |
| PROV-14 | P1: Só o habilitado é escolhível | Execute | Implementing |
| PROV-15 | P1: Só o habilitado é escolhível | Execute | Implementing |
| PROV-16 | P1: Só o habilitado é escolhível | Execute | Implementing |

Mapa AC → ID: P1-Ver 1..5 = PROV-01..05; P1-Varrer 1..8 = PROV-06..13; P1-Escolhível 1..3 = PROV-14..16.

**Coverage:** 16 total, 16 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] Abrir Configurações › Provedores não dispara nenhum `wsl.exe` quando já existe varredura salva (o boot é quem varre).
- [ ] Um provedor instalado só dentro de uma distro WSL aparece como encontrado, com o rótulo da distro.
- [ ] Desligar um provedor o remove das opções do wizard; religar o devolve.
- [ ] `cargo test` e `npm test` verdes.
