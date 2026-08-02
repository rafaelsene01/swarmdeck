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

---

## Histórias de usuário

### P1: CRUD de projeto ⭐ MVP

**História**: Como desenvolvedor, quero registrar meus repositórios como projetos com nome e cor, para reconhecê-los de relance no board e nos terminais.

**Critérios de aceite**:
1. QUANDO o usuário cria um projeto ENTÃO o sistema DEVE exigir nome e diretório, e atribuir automaticamente uma cor ainda não usada
2. QUANDO o usuário informa um diretório inexistente ENTÃO o sistema DEVE bloquear e sinalizar o campo
3. QUANDO o usuário informa um diretório já associado a outro projeto ENTÃO o sistema DEVE recusar e apontar o projeto existente
4. QUANDO o usuário edita um projeto ENTÃO o sistema DEVE permitir alterar nome, diretório e cor, propagando às tarefas vinculadas
5. QUANDO o usuário exclui um projeto com tarefas ENTÃO o sistema DEVE avisar quantas serão afetadas e manter as tarefas como sem projeto

**Teste independente**: criar dois projetos e verificar que receberam cores distintas.

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

## Casos de borda

- QUANDO o diretório de um projeto é apagado do disco ENTÃO o sistema DEVE marcá-lo como indisponível e manter as tarefas
- QUANDO dois projetos recebem o mesmo nome ENTÃO o sistema DEVE permitir, desde que os diretórios difiram, e desempatar pelo caminho na UI
- QUANDO todas as cores da paleta já foram usadas ENTÃO o sistema DEVE reciclar, priorizando a menos usada
- QUANDO o caminho é longo demais para a linha ENTÃO o sistema DEVE truncar no meio, preservando início e fim

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| PROJ-01 | P1: CRUD | Tasks | Done — `T1, T3` |
| PROJ-02 | P1: Cores únicas | Tasks | Done — `T1` |
| PROJ-03 | P1: Resolução por diretório | Tasks | Done — `T2` |
| PROJ-04 | P1: Fallback pelo nome da pasta | Tasks | Done — `T2` |
| PROJ-05 | P2: Listagem e ordenação | Tasks | Done — `T4` |

**Cobertura (corrigida na triagem 005 — a tabela dizia "0 mapeados" com a feature 100% `✅ Done` em `tasks.md`):** 5 requisitos, **5 mapeados e implementados** — cobertura completa

---

## Critérios de sucesso

- [ ] 100% das tarefas criadas por agente caem no projeto certo, sem intervenção
- [ ] Origem de qualquer card identificável em < 1s pelo chip de cor
