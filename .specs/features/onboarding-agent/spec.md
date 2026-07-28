# Onboarding Agent — Especificação

## Problema

O app tem conceitos que não são autoexplicativos — status de terminal, worktree por conversa, a diferença entre título geral e atividade, o fluxo obrigatório de teste. Documentação externa não resolve: o usuário está dentro do app, olhando para o elemento que não entendeu. O assistente in-app responde ali, sobre aquilo.

## Objetivos

- [ ] Usuário obtém explicação de qualquer elemento da UI sem sair do app
- [ ] Reduzir a dependência de documentação externa para os conceitos próprios do produto

## Fora de escopo

| Feature | Razão |
|---|---|
| Executar ações no app pelo chat | v1 é explicativo, não agente de automação da UI |
| Acessar o histórico de conversas do usuário | Fora do escopo; o assistente fala do produto, não do trabalho |

---

## Histórias de usuário

### P1: Chat assistente in-app ⭐ MVP

**História**: Como usuário novo, quero perguntar como o app funciona sem sair dele, para não travar no primeiro conceito estranho.

**Critérios de aceite**:
1. QUANDO o usuário abre o assistente ENTÃO o sistema DEVE exibir um painel flutuante com mensagem de boas-vindas e perguntas sugeridas
2. QUANDO o usuário envia uma pergunta ENTÃO o sistema DEVE responder sobre o funcionamento do app, com indicação de progresso enquanto pensa
3. QUANDO o usuário clica em uma pergunta sugerida ENTÃO o sistema DEVE tratá-la como pergunta enviada
4. QUANDO o usuário minimiza o painel ENTÃO o sistema DEVE recolhê-lo preservando a conversa
5. QUANDO o usuário fecha o painel ENTÃO o sistema DEVE descartar a conversa e voltar ao estado inicial na próxima abertura
6. QUANDO o assistente não sabe responder ENTÃO ele DEVE dizer que não sabe, em vez de inventar comportamento do produto

**Teste independente**: perguntar "para que serve o status de terminal?" e receber resposta correta ao produto.

---

### P1: Modo Inspect ⭐ MVP

**História**: Como usuário, quero clicar em um elemento da interface e perguntar sobre ele, para não precisar descrever o que estou vendo.

**Por que P1**: É o que diferencia isso de um chat de ajuda genérico.

**Critérios de aceite**:
1. QUANDO o usuário ativa o modo Inspect ENTÃO o sistema DEVE realçar os elementos inspecionáveis ao passar o mouse
2. QUANDO o usuário clica em um elemento no modo Inspect ENTÃO o sistema DEVE anexar a identidade daquele elemento ao contexto da próxima pergunta
3. QUANDO um elemento é selecionado ENTÃO o sistema DEVE indicar visualmente qual é, no painel
4. QUANDO o usuário desativa o modo Inspect ENTÃO a interface DEVE voltar ao comportamento normal de clique
5. QUANDO o modo Inspect está ativo ENTÃO cliques NÃO DEVEM disparar a ação normal do elemento

**Teste independente**: ativar Inspect, clicar no badge de status de um terminal e perguntar "o que é isso?" — a resposta deve ser sobre status, não genérica.

---

### P2: Escala e posicionamento

**História**: Como usuário, quero ajustar o tamanho do assistente, para ler respostas longas sem apertar.

**Critérios de aceite**:
1. QUANDO o usuário expande o painel ENTÃO o sistema DEVE ampliá-lo mantendo o app utilizável atrás
2. QUANDO o painel está aberto ENTÃO ele NÃO DEVE cobrir o header dos terminais
3. QUANDO a janela é redimensionada ENTÃO o painel DEVE se reposicionar para continuar inteiramente visível

---

## Casos de borda

- QUANDO não há conexão com o provedor de IA ENTÃO o assistente DEVE explicar que está offline e sugerir a documentação local
- QUANDO a resposta demora demais ENTÃO o sistema DEVE permitir cancelar sem travar o painel
- QUANDO o usuário pergunta algo fora do escopo do produto ENTÃO o assistente DEVE redirecionar em vez de responder qualquer coisa
- QUANDO o modo Inspect é ativado e o usuário aperta Esc ENTÃO o modo DEVE ser cancelado
- QUANDO a conversa fica longa ENTÃO o painel DEVE rolar e manter o campo de input sempre visível

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| ONB-01 | P1: Painel de chat | Design | Pending |
| ONB-02 | P1: Perguntas sugeridas | Design | Pending |
| ONB-03 | P1: Recusa honesta ao não saber | Design | Pending |
| ONB-04 | P1: Modo Inspect — seleção | Design | Pending |
| ONB-05 | P1: Modo Inspect — contexto na pergunta | Design | Pending |
| ONB-06 | P2: Escala e posicionamento | — | Pending |

**Cobertura:** 6 requisitos, 0 mapeados para tarefas ⚠️

---

## Critérios de sucesso

- [ ] Usuário novo entende o que é status de terminal sem consultar nada fora do app
- [ ] Modo Inspect identifica corretamente o elemento clicado em 9 de 10 tentativas
- [ ] Assistente nunca afirma comportamento que o produto não tem
