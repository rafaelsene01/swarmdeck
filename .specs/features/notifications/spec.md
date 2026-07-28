# Notificações de desktop — Especificação

## Problema

O ganho de rodar agentes em paralelo evapora se o usuário precisa ficar olhando para o app. O caso real é o oposto: você delega, vai fazer outra coisa, e um agente para esperando uma confirmação — parado, invisível, desperdiçando o tempo que a delegação deveria ter economizado. A notificação é o que fecha esse laço.

## Objetivos

- [ ] Usuário fica sabendo em segundos que um agente parou esperando por ele, mesmo com o app minimizado
- [ ] A notificação identifica qual terminal originou, sem ambiguidade

## Fora de escopo

| Feature | Razão |
|---|---|
| Notificações remotas / push para celular | Produto é desktop local |
| Sons customizados por evento | Adiado |

---

## Histórias de usuário

### P1: Notificar quando o agente precisa do usuário ⭐ MVP

**História**: Como desenvolvedor, quero ser avisado quando um agente para esperando minha resposta, para ele não ficar parado sem eu saber.

**Por que P1**: É o evento de maior custo se perdido — o agente fica bloqueado indefinidamente.

**Critérios de aceite**:
1. QUANDO um agente pede confirmação ou entra em status de espera ENTÃO o sistema DEVE emitir uma notificação nativa do SO
2. QUANDO a notificação é emitida ENTÃO ela DEVE nomear o terminal de origem e o motivo
3. QUANDO o usuário clica na notificação ENTÃO o sistema DEVE focar a janela e o terminal correspondente
4. QUANDO o app está em foco e o terminal já está visível ENTÃO o sistema DEVE suprimir a notificação

**Teste independente**: minimizar o app, fazer um agente pedir confirmação, e confirmar que a notificação chega e leva ao terminal certo.

---

### P1: Notificar conclusão de tarefa ⭐ MVP

**História**: Como desenvolvedor, quero saber quando um agente termina, para engatar a próxima coisa.

**Critérios de aceite**:
1. QUANDO um agente conclui uma tarefa ENTÃO o sistema DEVE notificar com o título da tarefa e o terminal de origem
2. QUANDO uma tarefa vai para teste ENTÃO a notificação DEVE deixar claro que aguarda validação do usuário
3. QUANDO vários agentes terminam quase ao mesmo tempo ENTÃO o sistema DEVE agrupar em uma notificação resumida, em vez de disparar várias

---

### P2: Controle do usuário

**História**: Como desenvolvedor, quero escolher o que me notifica, para o app não virar spam.

**Critérios de aceite**:
1. QUANDO as configurações são abertas ENTÃO o sistema DEVE listar os tipos de evento notificáveis com toggle individual
2. QUANDO o usuário desliga um tipo ENTÃO nenhuma notificação daquele tipo DEVE ser emitida
3. QUANDO o usuário aciona o atalho de configurações do SO ENTÃO o sistema DEVE abrir o painel de notificações do sistema operacional
4. QUANDO a permissão de notificação está negada no SO ENTÃO o app DEVE detectar e explicar como habilitar

---

## Casos de borda

- QUANDO o SO não suporta notificações ENTÃO o app DEVE degradar para um indicador visual interno, sem erro
- QUANDO o mesmo evento dispara repetidamente ENTÃO o sistema DEVE aplicar limite de frequência por terminal
- QUANDO o terminal de origem foi fechado antes do clique ENTÃO o sistema DEVE focar a janela e informar que o terminal não existe mais
- QUANDO o app inicia com eventos pendentes de uma sessão anterior ENTÃO ele NÃO DEVE notificar retroativamente

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| NOT-01 | P1: Notificar espera do usuário | Design | Pending |
| NOT-02 | P1: Clique foca o terminal | Design | Pending |
| NOT-03 | P1: Notificar conclusão | Design | Pending |
| NOT-04 | P1: Agrupamento | Design | Pending |
| NOT-05 | P2: Toggles por evento | — | Pending |
| NOT-06 | P2: Permissão do SO | — | Pending |

**Cobertura:** 6 requisitos, 0 mapeados para tarefas ⚠️

---

## Critérios de sucesso

- [ ] Nenhum agente fica bloqueado mais de 30s sem o usuário ser avisado
- [ ] Clicar na notificação leva ao terminal certo em 10 de 10 tentativas
- [ ] Zero notificação redundante quando o terminal já está visível e em foco
