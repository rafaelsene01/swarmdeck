# Status e atividade de terminal — Especificação

## Problema

Olhar para 4 terminais e descobrir qual precisa de você exige ler a saída de cada um. O produto resolve isso com três sinais distintos por terminal — **título geral** (o que este terminal é), **atividade atual** (o passo de agora) e **status** (a fase de trabalho) — e o mais valioso é o status: um badge colorido que responde "este agente está trabalhando ou esperando por mim?" sem nenhuma leitura.

## Objetivos

- [ ] Identificar em menos de 2 segundos, sem clicar, qual terminal está bloqueado esperando o usuário
- [ ] Permitir que o usuário defina o próprio vocabulário de fases, incluindo a instrução que ensina o agente quando usar cada uma
- [ ] Manter o título da aba estável mesmo com o agente reportando dezenas de passos

## Fora de escopo

| Feature | Razão |
|---|---|
| Ordenar abas por status | O original menciona; depende do modo Tabs, que está fora do v1 |
| Notificação automática por mudança de status | Coberto em `.specs/features/notifications/` |

---

## Histórias de usuário

### P1: Badge de status no terminal ⭐ MVP

**História**: Como desenvolvedor, quero um badge colorido em cada terminal indicando a fase do trabalho, para achar de relance o que precisa de mim.

**Por que P1**: É o sinal de maior densidade de informação do produto inteiro.

**Critérios de aceite**:
1. QUANDO um agente define um status ENTÃO o terminal DEVE exibir o badge com o rótulo e a cor daquele status
2. QUANDO nenhum status está definido ENTÃO o terminal DEVE ficar sem badge, e não com um status inventado
3. QUANDO o status é limpo ENTÃO o badge DEVE sumir imediatamente
4. QUANDO o usuário define um status manualmente pela UI ENTÃO o sistema DEVE aplicá-lo, e o agente DEVE poder sobrescrevê-lo depois
5. QUANDO um terminal está minimizado ENTÃO o badge DEVE continuar visível na barra compacta

**Teste independente**: fazer o agente percorrer os 4 status e conferir que cor e rótulo acompanham.

---

### P1: Catálogo editável de status ⭐ MVP

**História**: Como desenvolvedor, quero editar os status e a instrução que dizem ao agente quando usá-los, para adaptar o vocabulário ao meu fluxo.

**Por que P1**: A instrução é o que faz o agente usar o status corretamente — sem editá-la, o catálogo é decorativo.

**Critérios de aceite**:
1. QUANDO o app é instalado ENTÃO o sistema DEVE trazer 4 status padrão: **Needs input**, **Needs testing**, **Working**, **Done**
2. QUANDO o usuário edita um status ENTÃO o sistema DEVE permitir alterar rótulo, cor e o texto de instrução ao agente
3. QUANDO o usuário cria um status ENTÃO o sistema DEVE exigir rótulo e instrução, e atribuir uma cor não usada
4. QUANDO o usuário desativa um status ENTÃO o sistema DEVE removê-lo do catálogo enviado aos agentes, preservando terminais que já o exibem
5. QUANDO o usuário arrasta as linhas ENTÃO o sistema DEVE persistir a nova ordem, que define a prioridade do status
6. QUANDO o usuário aciona restaurar padrões ENTÃO o sistema DEVE pedir confirmação e repor os 4 originais
7. QUANDO o catálogo muda ENTÃO a mudança DEVE chegar aos agentes **na próxima sessão**, não no meio de uma em curso

**Teste independente**: criar um status "Bloqueado", iniciar uma sessão nova e confirmar que o agente o conhece e o aplica.

---

### P1: Título geral vs atividade ⭐ MVP

**História**: Como desenvolvedor, quero que a aba do terminal mantenha um rótulo estável enquanto o detalhe do passo atual fica a um hover de distância, para acompanhar o trabalho sem que a aba fique piscando.

**Por que P1**: É a separação que impede o painel de virar ruído.

**Critérios de aceite**:
1. QUANDO o agente define o título geral ENTÃO o sistema DEVE gravar um rótulo curto para a aba e uma descrição longa do objetivo
2. QUANDO o agente reporta uma atividade ENTÃO o sistema DEVE anexá-la ao log com horário e **não** alterar o título da aba
3. QUANDO o usuário passa o mouse sobre o terminal ENTÃO o sistema DEVE mostrar a atividade mais recente
4. QUANDO o usuário abre o log ENTÃO o sistema DEVE listar as atividades em ordem cronológica inversa, com horário
5. ~~QUANDO o usuário renomeia o terminal manualmente ENTÃO o nome do usuário DEVE vencer e títulos posteriores do agente DEVEM ser descartados~~ — **revogado na triagem 006 (03/08/2026)**: era `STAT-07`, duplicava `multi-terminal/TERM-06`. Requisito e implementação agora vivem só em `multi-terminal/spec.md`
6. QUANDO o log passa de 200 entradas ENTÃO o sistema DEVE descartar as mais antigas

**Teste independente**: mandar 10 atividades seguidas e confirmar que o título da aba não mudou nenhuma vez.

---

### P2: Status como filtro

**História**: Como desenvolvedor com 4 terminais, quero destacar os que estão esperando por mim, para atacar primeiro o que está bloqueado.

**Critérios de aceite**:
1. QUANDO o usuário filtra por um status ENTÃO o sistema DEVE realçar os terminais correspondentes e atenuar os demais
2. QUANDO nenhum terminal tem aquele status ENTÃO o sistema DEVE informar em vez de mostrar tudo atenuado

---

## Casos de borda

- QUANDO o agente envia um status que não existe ou está desativado ENTÃO o sistema DEVE recusar e devolver os valores válidos
- QUANDO o usuário exclui um status em uso ENTÃO o sistema DEVE limpar o badge dos terminais afetados e avisar quantos foram
- QUANDO duas cores de status ficam visualmente indistinguíveis ENTÃO o sistema DEVE alertar na criação
- QUANDO um rótulo é longo demais para o badge ENTÃO o sistema DEVE truncar e mostrar o texto completo no hover
- QUANDO o terminal é fechado ENTÃO o status DEVE ser descartado junto

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| STAT-01 | P1: Badge de status | Tasks | Done no gate — `T4`. **Corrigido na triagem 008 (11/08/2026)**: o componente já está integrado a `TerminalHeader.tsx` (import/render confirmados), mas continua invisível na prática — falta comando/evento real que leve o status do backend até `App.tsx`. Ver `T5` e `a reabertura de `T5` em `tasks.md` (decisão do usuário, triagem 008) |
| STAT-02 | P1: Catálogo — CRUD | Tasks | Done — `T1, T3` |
| STAT-03 | P1: Catálogo — ordem e prioridade | Tasks | Done — `T1, T3` |
| STAT-04 | P1: Propagação na próxima sessão | Tasks | Done — `T2` |
| STAT-05 | P1: Título geral estável | Tasks | Done no gate — `T4` |
| STAT-06 | P1: Log de atividade | Tasks | Done no gate — `T4`, mesma ressalva de STAT-01 (componente integrado, dado real ainda ausente) |
| STAT-07 | ~~P1: Rename manual vence~~ **REVOGADO** | — | **Revogado na triagem 006 (03/08/2026, decisão do usuário).** Duplicava `multi-terminal/TERM-06` (mesma regra: "rename manual do terminal vence o agente"). `TERM-06` fica como dono único do requisito — já é mais amplo (também cobre exibição de branch/git no header) e mora na feature que já possui `TerminalHeader`. A implementação (task nova) entra em `multi-terminal/tasks.md`, não aqui. |
| STAT-08 | P2: Status como filtro | Tasks | **Não coberto** — **corrigido em 08/08/2026** (ver AD em `project/STATE.md`): esta linha dizia antes que o requisito "pertence à UI do Kanban (`task-kanban/BoardFilters.tsx`)", mas a história associada (acima, "P2: Status como filtro") sempre foi sobre **realçar/atenuar terminais no próprio grid** pelo badge de status — vocabulário de status diferente do Kanban (Needs input/Needs testing/Working/Done vs. Pending/In Progress/In Testing/Completed, que são fases de tarefa, não de terminal). A menção ao Kanban era um engano de triagem anterior; `KAN-06` nunca teve relação com este requisito. Task nova: `T6` em `tasks.md` |

**Cobertura (corrigida na triagem 006, 02/08/2026 — a tabela dizia "0 mapeados" com `tasks.md` já tendo T1-T4 implementadas e testadas):** 8 requisitos, **6 mapeados no gate** (`STAT-01..06`), **2 sem cobertura nenhuma** (`STAT-07`, `STAT-08`) ⚠️. **Atualização 08/08/2026:** `STAT-07` segue revogado (sem task); `STAT-08` ganhou task (`T6`), ainda não implementado. **Atualização na triagem 008 (11/08/2026):** `STAT-01`/`STAT-06` (badge e log) JÁ estão importados em `TerminalHeader.tsx` (`grep -n "StatusBadge\|ActivityLog" src/components/terminal/TerminalHeader.tsx` → 4 ocorrências, não vazio como a versão anterior desta linha afirmava) — mas continuam invisíveis na prática porque nenhum comando/evento leva status/atividade real do backend até `App.tsx`. `⛔ NEEDS-DECISION` estacionada em `tasks.md::T5`.

---

## Critérios de sucesso

- [ ] Usuário aponta o terminal bloqueado em menos de 2s, sem clicar
- [ ] Título da aba muda no máximo 1 vez por sessão de trabalho, enquanto o log acumula dezenas de entradas
- [ ] Status customizado criado pelo usuário é usado corretamente pelo agente na sessão seguinte
