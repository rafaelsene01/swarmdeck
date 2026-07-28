# Limpeza de conversas — Especificação

## Problema

Histórico de agente cresce sem limite. Na instalação de referência, um único agente acumulou 108 MB em 186 conversas ao longo de 27 projetos — e esse volume não só ocupa disco como deixa o `--resume` lento, porque o agente precisa varrer o histórico para retomar. Apagar na mão é arriscado: é fácil eliminar a conversa que você ainda vai precisar.

## Objetivos

- [ ] Mostrar quanto disco cada agente consome, sem o usuário procurar diretórios
- [ ] Recuperar espaço sem nunca apagar conversa em uso
- [ ] Nada é excluído sem o usuário ver antes o que será excluído

## Fora de escopo

| Feature | Razão |
|---|---|
| Buscar e restaurar conversas antigas | É a feature PRO **Conversation History** do original, não observável |
| Compactar/arquivar em vez de excluir | Adiado; v1 exclui ou preserva |

---

## Histórias de usuário

### P1: Uso de disco por agente ⭐ MVP

**História**: Como desenvolvedor, quero ver quanto espaço cada agente usa, para saber se vale limpar.

**Critérios de aceite**:
1. QUANDO a tela abre ENTÃO o sistema DEVE mostrar um card por agente com tamanho total, número de conversas e número de projetos
2. QUANDO um agente não tem histórico ENTÃO o card DEVE aparecer zerado, e não sumir da lista
3. QUANDO o usuário aciona recalcular ENTÃO o sistema DEVE remedir e atualizar os cards sem travar a UI
4. QUANDO a medição está em curso ENTÃO o sistema DEVE indicar progresso

**Teste independente**: comparar o total exibido com o tamanho real do diretório do agente no disco.

---

### P1: Exclusão com preview ⭐ MVP

**História**: Como desenvolvedor, quero ver exatamente o que será apagado antes de confirmar, para nunca perder algo por engano.

**Por que P1**: É a garantia que torna a feature utilizável. Sem preview, ninguém aciona o botão.

**Critérios de aceite**:
1. QUANDO o usuário aciona a limpeza ENTÃO o sistema DEVE mostrar a lista do que será excluído — conversas, datas e espaço a recuperar — **antes** de qualquer exclusão
2. QUANDO o usuário confirma ENTÃO o sistema DEVE excluir apenas os itens do preview
3. QUANDO o usuário cancela ENTÃO nada DEVE ser excluído
4. QUANDO a exclusão termina ENTÃO o sistema DEVE relatar quantas conversas foram removidas e quanto espaço foi liberado

---

### P1: Proteções ⭐ MVP

**História**: Como desenvolvedor, quero que conversas que ainda uso sejam intocáveis, para poder limpar sem pensar duas vezes.

**Critérios de aceite**:
1. QUANDO uma conversa está aberta em um terminal ENTÃO o sistema DEVE excluí-la de qualquer limpeza
2. QUANDO uma conversa está marcada ou tem atalho ENTÃO o sistema DEVE protegê-la igualmente
3. QUANDO um item protegido cai nos critérios de limpeza ENTÃO o sistema DEVE mostrá-lo no preview como protegido, com o motivo
4. QUANDO o toggle "nunca excluir automaticamente" está ligado ENTÃO nenhuma limpeza automática DEVE rodar, só a manual

**Teste independente**: abrir uma conversa antiga em um terminal, rodar a limpeza e confirmar que ela aparece como protegida.

---

### P2: Regras de limpeza

**História**: Como desenvolvedor, quero definir o que conta como "antigo" e a quais agentes aplicar.

**Critérios de aceite**:
1. QUANDO as regras são exibidas ENTÃO o usuário DEVE poder escolher a quais agentes elas se aplicam, por checkbox
2. QUANDO o usuário define um critério de idade ENTÃO o sistema DEVE selecionar as conversas mais antigas que isso
3. QUANDO nenhum agente está marcado ENTÃO o sistema DEVE desabilitar a limpeza e explicar

---

## Casos de borda

- QUANDO o diretório de um agente não existe ENTÃO o card DEVE aparecer zerado, sem erro
- QUANDO a exclusão falha por permissão ENTÃO o sistema DEVE relatar quais itens falharam e manter os demais excluídos
- QUANDO o histórico é enorme ENTÃO a medição DEVE ser incremental, sem congelar a interface
- QUANDO uma conversa é aberta durante a limpeza ENTÃO ela DEVE ser pulada
- QUANDO não há nada a excluir ENTÃO o preview DEVE informar isso em vez de abrir um diálogo vazio

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| CLN-01 | P1: Uso de disco por agente | Design | Pending |
| CLN-02 | P1: Medição não bloqueante | Design | Pending |
| CLN-03 | P1: Preview obrigatório | Design | Pending |
| CLN-04 | P1: Proteção de conversas em uso | Design | Pending |
| CLN-05 | P2: Regras de limpeza | — | Pending |

**Cobertura:** 5 requisitos, 0 mapeados para tarefas ⚠️

---

## Critérios de sucesso

- [ ] Zero conversa protegida excluída em 100 execuções de limpeza
- [ ] Tamanhos exibidos batem com o disco real dentro de 5%
- [ ] Medição de 200 conversas não bloqueia a UI
