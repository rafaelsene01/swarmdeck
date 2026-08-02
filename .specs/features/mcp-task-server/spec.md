# Servidor MCP de tarefas — Especificação

## Problema

Um agente de codificação rodando num terminal é uma caixa-preta: o usuário só descobre o que ele fez lendo a saída. O produto inteiro depende de inverter isso — o agente precisa **declarar** o que está fazendo, em que fase está e o que já entregou. O protocolo MCP é o canal para isso, e ele é o contrato mais importante do sistema: se quebrar, o app volta a ser só um multiplexador de terminais.

## Objetivos

- [ ] 100% das tarefas do board criadas e movidas pelo próprio agente, sem digitação manual
- [ ] Um agente rodando **fora** do app detecta isso e ignora o protocolo silenciosamente, sem erro
- [ ] Latência de propagação agente → UI abaixo de 1s

## Fora de escopo

| Feature | Razão |
|---|---|
| Ferramentas de permissão (`edit_permissions`) | Feature PRO do original, não observável |
| Labels de tarefa | Feature PRO do original |
| Subtarefas e hierarquia pai-filho | Existem no original, mas nenhum card hierárquico foi observado no board. Adiado — ver STATE.md |
| Transporte HTTP/SSE | v1 usa stdio, o transporte que os agentes de CLI já usam |

---

## Histórias de usuário

### P1: Handshake de ativação ⭐ MVP

**História**: Como agente, quero saber se estou rodando dentro do app antes de tentar qualquer coisa, para não poluir sessões avulsas com chamadas que vão falhar.

**Por que P1**: Sem isso, todo agente do usuário — inclusive os que rodam em terminais externos — tenta gerenciar tarefas e erra. É a primeira chamada de todo fluxo.

**Critérios de aceite**:
1. QUANDO o agente chama `check_active` de dentro de um terminal do app ENTÃO o sistema DEVE responder `active: true` junto do identificador do terminal
2. QUANDO o agente chama `check_active` de fora do app ENTÃO o sistema DEVE responder `active: false` com instrução explícita de ignorar o protocolo
3. QUANDO o servidor MCP está inacessível ENTÃO o agente DEVE tratar como "fora do app" — falha nunca bloqueia o trabalho
4. QUANDO `check_active` retorna `false` ENTÃO qualquer outra ferramenta chamada DEVE responder erro descritivo em vez de gravar dados

**Teste independente**: rodar o mesmo agente dentro e fora do app; confirmar respostas opostas e que a de fora não cria nada no banco.

---

### P1: Ciclo de vida da tarefa ⭐ MVP

**História**: Como agente, quero criar uma tarefa e movê-la pelas fases conforme trabalho, para que o usuário veja o progresso sem me perguntar.

**Por que P1**: É o dado que alimenta o Kanban inteiro.

**Ferramentas**: `create_task`, `start_task`, `update_task_plan`, `update_task_implementation`, `complete_task`

**Critérios de aceite**:
1. QUANDO o agente chama `create_task` ENTÃO o sistema DEVE inferir o terminal e o projeto do ambiente da sessão, sem exigir esses parâmetros
2. QUANDO o agente chama `start_task` ENTÃO o sistema DEVE mover a tarefa para `in_progress` **a partir de qualquer estado**, inclusive `completed` — retomar trabalho não exige ferramenta diferente
3. QUANDO o agente chama `complete_task` em uma tarefa `in_progress` ENTÃO o sistema DEVE movê-la para `in_testing`, nunca direto para `completed`
4. QUANDO o agente chama `complete_task` em uma tarefa `in_testing` ENTÃO o sistema DEVE movê-la para `completed`
5. QUANDO o estado de uma tarefa muda ENTÃO o Kanban aberto DEVE refletir a mudança em até 1s, sem refresh manual
6. QUANDO o agente grava plano ou implementação ENTÃO o sistema DEVE persistir o texto e exibi-lo no detalhe do card

**Teste independente**: um agente percorre criar → iniciar → planejar → implementar → concluir → concluir, e o card atravessa as 4 colunas na ordem correta.

---

### P1: Estado do terminal ⭐ MVP

**História**: Como agente, quero declarar o título do meu terminal, o passo atual e a fase de trabalho, para o usuário saber o que estou fazendo de relance.

**Por que P1**: É o que faz o grid virar um painel de status.

**Ferramentas**: `set_terminal_title`, `update_terminal_activity`, `set_terminal_status`

**Critérios de aceite**:
1. QUANDO o agente chama `set_terminal_title` ENTÃO o sistema DEVE gravar um rótulo curto (título de aba) e uma descrição longa
2. QUANDO o usuário já renomeou o terminal manualmente ENTÃO o sistema DEVE **preservar o nome do usuário** e descartar o título do agente
3. QUANDO o agente chama `update_terminal_activity` ENTÃO o sistema DEVE anexar a atividade ao log com horário e exibi-la no hover, **sem alterar o título da aba**
4. QUANDO o agente chama `set_terminal_status` com um status do catálogo ativo ENTÃO o sistema DEVE aplicar o badge correspondente
5. QUANDO o agente envia um status desconhecido ou desativado ENTÃO o sistema DEVE recusar e devolver a lista de status válidos
6. QUANDO uma tarefa está ativa no terminal ENTÃO o título gravado DEVE ficar associado ao id daquela tarefa

**Teste independente**: definir título, mandar 3 atividades e 2 status; conferir que a aba não oscilou e o log tem 3 entradas.

---

### P2: Busca e deduplicação de tarefas

**História**: Como agente, quero descobrir se já existe tarefa para o que me pediram, para não fragmentar o board em duplicatas.

**Ferramentas**: `find_related_active_tasks`, `search_tasks`, `list_tasks`

**Critérios de aceite**:
1. QUANDO o agente chama `find_related_active_tasks` ENTÃO o sistema DEVE devolver tarefas ativas com pontuação de similaridade
2. QUANDO a similaridade passa de 70% ENTÃO a resposta DEVE recomendar reutilizar a tarefa existente
3. QUANDO a similaridade fica entre 50% e 70% ENTÃO a resposta DEVE recomendar perguntar ao usuário
4. QUANDO `list_tasks` é chamado ENTÃO o sistema DEVE aceitar `limit`/`offset` e filtro por status, para não estourar o contexto do agente

**Teste independente**: criar "Adicionar paginação", depois pedir tarefa relacionada para "Implementar paginação na lista" e verificar similaridade alta.

---

### P2: Ferramentas de projeto

**História**: Como agente, quero que minhas tarefas caiam no projeto certo automaticamente, para o board ficar organizado sem eu gerenciar isso.

**Ferramentas**: `get_projects`, `create_project`, `get_project_tasks`, `update_task_project`

**Critérios de aceite**:
1. QUANDO uma tarefa é criada ENTÃO o sistema DEVE resolver o projeto pelo diretório de trabalho do terminal
2. QUANDO nenhum projeto casa com o diretório ENTÃO o sistema DEVE usar o nome da pasta como fallback
3. QUANDO um projeto é criado ENTÃO o sistema DEVE atribuir uma cor ainda não usada

---

## Casos de borda

- QUANDO duas sessões de agente escrevem na mesma tarefa ao mesmo tempo ENTÃO o sistema DEVE serializar as escritas e a última gravação vence, sem corromper o registro
- QUANDO o agente chama `complete_task` em uma tarefa que não existe ENTÃO o sistema DEVE devolver erro descritivo, não criar a tarefa
- QUANDO o terminal que originou a tarefa é fechado ENTÃO a tarefa DEVE sobreviver e permanecer no board
- QUANDO o processo do servidor MCP morre ENTÃO o app DEVE reiniciá-lo e o agente DEVE reconectar na próxima chamada
- QUANDO o catálogo de status muda enquanto uma sessão roda ENTÃO a sessão em curso DEVE continuar com o catálogo antigo e o novo valer a partir da próxima
- QUANDO o texto de plano ou implementação passa do limite de tamanho ENTÃO o sistema DEVE truncar e sinalizar o truncamento

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| MCP-01 | P1: Handshake | Tasks | Done (gate) — `T5, T6` — ⚠️ ver nota abaixo: `IpcServer` não roda no app real |
| MCP-02 | P1: Ciclo de vida da tarefa | Tasks | Done — `T1, T3, T7` |
| MCP-03 | P1: Fluxo obrigatório de teste | Tasks | Done — `T2, T3, T7` |
| MCP-04 | P1: Título e atividade do terminal | Tasks | Done — `T4, T7` |
| MCP-05 | P1: Status do terminal | Tasks | Done — `T4, T7` |
| MCP-06 | P1: Rename manual vence o agente | Tasks | Done — `T4` |
| MCP-07 | P2: Similaridade e dedup | Tasks | Done — `T8` |
| MCP-08 | P2: Resolução de projeto | Tasks | Done — `T1, T3` |

**Cobertura (corrigida na triagem 005 — a tabela dizia "0 mapeados" com a feature 100% `✅ Done` em `tasks.md`):** 8 requisitos, **8 mapeados no gate automatizado** — mas ver a ressalva ⚠️ em `MCP-01`: `IpcServer::for_app(...).serve()` (T5) nunca é chamado em `src-tauri/src/lib.rs` — o app real não abre o socket/pipe que o sidecar precisa para conectar. Achado do auditor na triagem 005 (`grep -rn "IpcServer" src-tauri/src/lib.rs` → nenhum resultado). Todo o handshake e os testes de round-trip (T5, T6, T7) passam porque rodam contra um `IpcServer` instanciado dentro do próprio teste — nunca contra o app de verdade. Estacionado como `⛔ NEEDS-DECISION` em `tasks.md` (T5), mesma natureza do gap de `App.tsx` em `multi-terminal`.

---

## Critérios de sucesso

- [ ] Um agente completa o ciclo inteiro sem que o usuário toque no board
- [ ] Agente fora do app não gera nenhum registro no banco
- [ ] Mudança feita pelo agente aparece no Kanban em menos de 1s
- [ ] 4 agentes escrevendo em paralelo não produzem tarefa corrompida nem cruzam terminais

---

## ⚠️ Risco aberto

Os nomes de ferramentas acima foram **inferidos das instruções globais do usuário**, não de documentação oficial do protocolo. Antes de implementar, confirmar a assinatura real de cada ferramenta — errar aqui quebra a compatibilidade com os prompts que o usuário já tem. Registrado em STATE.md → Bloqueios.
