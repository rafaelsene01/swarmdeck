# Kanban de tarefas — Especificação

## Problema

Com vários agentes trabalhando em paralelo, o backlog vira o único lugar onde dá para responder "o que está acontecendo no total?". Os terminais mostram o *agora* de cada agente; o board mostra o *conjunto* — o que está esperando, o que está em teste e o que já saiu. Sem ele, o usuário volta a reconstruir o estado lendo saída de terminal.

## Objetivos

- [ ] Ver o estado de todo o trabalho em curso, entre todos os projetos, em uma tela
- [ ] Refletir mudanças feitas por agentes em menos de 1s, sem refresh manual
- [ ] Impedir que trabalho pule a fase de teste

## Fora de escopo

| Feature | Razão |
|---|---|
| Labels / etiquetas | Feature PRO do original |
| Subtarefas e hierarquia visual | Adiado — nenhum card hierárquico foi observado no board de referência |
| Colunas customizáveis | O original tem 4 colunas fixas ligadas ao ciclo de vida do MCP; mudar isso quebraria o contrato |
| Comentários e múltiplos usuários | Produto é single-user local |

---

## Histórias de usuário

### P1: Board de 4 colunas ⭐ MVP

**História**: Como desenvolvedor, quero ver minhas tarefas distribuídas por fase, para saber o que está parado, andando, esperando teste e pronto.

**Por que P1**: É a feature.

**Critérios de aceite**:
1. QUANDO o board abre ENTÃO o sistema DEVE exibir exatamente 4 colunas na ordem: **Pending**, **In Progress**, **In Testing**, **Completed**
2. QUANDO uma coluna tem tarefas ENTÃO o cabeçalho DEVE mostrar a contagem em um badge
3. QUANDO uma coluna está vazia ENTÃO o sistema DEVE mostrar um estado vazio específico daquela fase (ex.: "Nenhuma tarefa em teste")
4. QUANDO um agente muda o estado de uma tarefa ENTÃO o card DEVE migrar de coluna em até 1s sem ação do usuário
5. QUANDO o usuário clica em ordenar em uma coluna ENTÃO o sistema DEVE alternar a ordenação daquela coluna e lembrar a escolha

**Teste independente**: com o board aberto, um agente cria e inicia uma tarefa — o card aparece e migra sozinho.

---

### P1: Card de tarefa ⭐ MVP

**História**: Como desenvolvedor, quero identificar uma tarefa de relance, para não abrir cada uma para saber do que se trata.

**Critérios de aceite**:
1. QUANDO um card é renderizado ENTÃO ele DEVE mostrar: chip colorido do projeto, número da tarefa, título, descrição truncada, data e ações
2. QUANDO a descrição excede o espaço ENTÃO o sistema DEVE truncar com reticências, preservando o título inteiro
3. QUANDO o usuário clica no card ENTÃO o sistema DEVE abrir o detalhe com plano e implementação completos
4. QUANDO o usuário clica em excluir ENTÃO o sistema DEVE pedir confirmação antes de remover
5. QUANDO o usuário clica em enviar-ao-terminal ENTÃO o sistema DEVE injetar o contexto da tarefa no terminal associado e trazer a janela principal para frente
6. QUANDO a tarefa não tem terminal associado vivo ENTÃO a ação de enviar DEVE ficar desabilitada com explicação

**Teste independente**: criar tarefa via agente, abrir o detalhe e conferir que plano e implementação aparecem íntegros.

---

### P1: Fluxo obrigatório de teste ⭐ MVP

**História**: Como desenvolvedor, quero que nada seja dado como pronto sem passar por mim, para não descobrir depois que o agente se autoaprovou.

**Por que P1**: É a regra de negócio que dá confiança no board. Sem ela, "Completed" não significa nada.

**Critérios de aceite**:
1. QUANDO uma tarefa está em `in_progress` e é concluída ENTÃO o sistema DEVE movê-la para **In Testing**, nunca para Completed
2. QUANDO uma tarefa está em `in_testing` ENTÃO só uma segunda conclusão explícita DEVE levá-la a **Completed**
3. QUANDO um agente tenta ir de `in_progress` direto para `completed` ENTÃO o sistema DEVE recusar e explicar a transição válida
4. QUANDO uma tarefa em `in_testing` é reaberta ENTÃO o sistema DEVE devolvê-la a `in_progress` preservando plano e implementação

**Teste independente**: tentar pular a fase de teste pelo MCP e confirmar a recusa.

---

### P2: Filtro por projeto e busca

**História**: Como desenvolvedor com vários projetos, quero focar em um de cada vez, para o board não virar ruído.

**Critérios de aceite**:
1. QUANDO o usuário escolhe um projeto no seletor ENTÃO o board DEVE mostrar só as tarefas dele e recalcular as contagens
2. QUANDO "Todos os projetos" está selecionado ENTÃO o sistema DEVE mostrar tudo com os chips de projeto visíveis
3. QUANDO o usuário digita na busca ENTÃO o sistema DEVE filtrar por título e descrição em todas as colunas, incrementalmente
4. QUANDO a busca não retorna nada ENTÃO o sistema DEVE mostrar um estado vazio com o termo buscado

---

### P2: Criação manual de tarefa

**História**: Como desenvolvedor, quero adicionar uma tarefa na mão, para registrar algo que ainda não deleguei a um agente.

**Critérios de aceite**:
1. QUANDO o usuário clica em adicionar tarefa ENTÃO o sistema DEVE abrir um formulário com título, descrição e projeto
2. QUANDO o formulário é enviado sem título ENTÃO o sistema DEVE bloquear e sinalizar o campo
3. QUANDO a tarefa é criada manualmente ENTÃO ela DEVE entrar em **Pending** e ficar visível aos agentes pelas ferramentas MCP

---

### P3: Janela dedicada

**História**: Como desenvolvedor com dois monitores, quero o board em janela separada, para deixá-lo aberto enquanto trabalho nos terminais.

**Critérios de aceite**:
1. QUANDO o board é aberto ENTÃO o sistema DEVE abri-lo em janela própria, independente da principal
2. QUANDO a janela principal é fechada ENTÃO o board DEVE fechar junto
3. QUANDO o usuário aciona "voltar aos terminais" ENTÃO o sistema DEVE focar a janela principal

---

## Casos de borda

- QUANDO uma tarefa é excluída enquanto seu detalhe está aberto ENTÃO o sistema DEVE fechar o detalhe e avisar
- QUANDO uma coluna tem mais cards do que cabe ENTÃO ela DEVE rolar de forma independente das outras
- QUANDO o projeto de uma tarefa é excluído ENTÃO a tarefa DEVE permanecer, marcada como sem projeto
- QUANDO dois agentes movem a mesma tarefa ao mesmo tempo ENTÃO a última transição válida vence e a UI converge sem card duplicado
- QUANDO o board abre sem nenhuma tarefa ENTÃO as 4 colunas DEVEM aparecer com seus estados vazios, nunca uma tela em branco
- QUANDO o título é longo demais ENTÃO o card DEVE quebrar em até 3 linhas e truncar

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| KAN-01 | P1: Board 4 colunas | Tasks | Done no gate — `T2, T3, T4` |
| KAN-02 | P1: Atualização em tempo real | Tasks | **Done, corrigido na triagem 008 (11/08/2026)** — `T7` implementado: `emit_task_changed` foi reescrito (commit `676f291`) para receber `&TaskChangeInfo` e emitir `{op, task, taskId, previousStatus}` real; `useTaskStore.ts` consome o payload sem quebrar |
| KAN-03 | P1: Card de tarefa | Tasks | Done no gate — `T4, T6` |
| KAN-04 | P1: Enviar-ao-terminal | Tasks | Done no gate — `T2, T6` |
| KAN-05 | P1: Fluxo obrigatório de teste | Tasks | Done — implementado em `mcp-task-server/T3` (`TaskService`, máquina de estados compartilhada), não numa task própria deste arquivo |
| KAN-06 | P2: Filtro e busca | Tasks | Done no gate — `T5` |
| KAN-07 | P2: Criação manual | Tasks | **Parcial, confirmado ainda válido na triagem 008 (11/08/2026)** — só o critério 3 (tarefa manual entra em `Pending` pelo mesmo `TaskService`) está coberto por `T6`. Critérios 1-2 (formulário) continuam sem `TaskForm.tsx` (`grep -rn "TaskForm\|CreateTask" src/` → vazio). Ver `T8` em `tasks.md`, ainda pendente |
| KAN-08 | P3: Janela dedicada | Tasks | **Done, corrigido na triagem 008 (11/08/2026)** — `T7` implementado: `src/main.tsx` roteia por `getCurrentWebviewWindow().label` (`kanban` → `KanbanBoard`, `settings` → `SettingsShell`, default → `App`); a janela "Kanban" já monta o board real, não uma segunda cópia do grid |

**Cobertura (corrigida na triagem 008, 11/08/2026 — a versão anterior descrevia `KAN-02`/`KAN-08` como quebrados/sem rota, o que `T7` já resolveu entre a triagem 007 e esta):** 8 requisitos, **7 mapeados nesta feature + 1 (`KAN-05`) mapeado em `mcp-task-server/T3`** — cobertura de requisito completa. `T7` (roteamento real + payload real do evento) confirmado por leitura de `src/main.tsx` e `src-tauri/src/ipc/server.rs`: o board é alcançável por um usuário real e atualiza em tempo real. Só `KAN-07` (formulário manual, `T8`) segue com gap real, não uma questão de alcance.

---

## Critérios de sucesso

- [ ] Mudança de estado feita por agente reflete no board em < 1s
- [ ] Nenhuma tarefa chega a Completed sem passar por In Testing
- [ ] Board com 200 tarefas rola e filtra sem travamento perceptível
- [ ] Enviar-ao-terminal leva o agente certo ao contexto certo em 10 de 10 tentativas
