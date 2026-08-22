# Feedback Form Specification

## Problem Statement

Não há nenhum caminho dentro do app para o usuário relatar um bug, pedir um
recurso ou mandar uma opinião. Hoje isso acontece fora do produto — ou não
acontece. `SettingsShell.tsx` já é o lugar onde as quatro seções de
configuração vivem (`Geral`, `Provedores`, `Projetos`, `Atualizações`), e é
onde `print/feadback.png` coloca a tela de feedback.

Esta spec cobre **apenas a camada visual**: o formulário existe, valida e
responde ao usuário, mas nada sai da máquina. O envio real (endpoint,
autenticação, anexo dos bytes) é uma fase posterior e está fora daqui.

## Goals

- [ ] Uma quinta seção "Feedback" em Configurações, alcançável pela barra lateral nas duas montagens do shell (overlay em `App.tsx` e janela `settings`).
- [ ] Formulário com categoria, título, descrição em Markdown e anexos de imagem, limitado a 5 imagens de até 10 MB cada.
- [ ] A descrição tem abas "Escrever" e "Visualizar", para o usuário ver o Markdown renderizado enquanto escreve.
- [ ] Nenhuma afirmação falsa em tela: o botão "Enviar" diz que o envio ainda não existe em vez de simular sucesso.
- [ ] Zero chamada de rede e zero `invoke` a partir desta tela.

## Out of Scope

Explicitamente excluído. Documentado para impedir crescimento de escopo.

| Feature | Reason |
| ------- | ------ |
| Campo de e-mail (`print/feadback.png`) | Está no print de referência, não no pedido. Sem envio real, não há para onde uma resposta voltar. |
| Envio de verdade (endpoint, `invoke`, upload dos bytes) | O pedido é "somente a parte visual por enquanto". Como os bytes chegam ao Rust é decisão da fase 2 (AD-030). |
| Tabelas, listas de tarefas (`- [ ]`) e listas aninhadas no Markdown | O renderizador do repo é um subconjunto por linha (AD-032). Estes três exigem um parser de verdade — é o gatilho documentado para trocar por `react-markdown`, não para remendar regex. |
| Links clicáveis no preview (`[texto](url)`) | O app não tem nenhuma forma de abrir URL externa: nenhum `plugin-opener`, nenhum `<a href>` em todo o `src/`. Link que não abre é pior que texto cru. Entra quando existir um abridor de URL. |
| Barra de ferramentas de formatação (negrito, lista) sobre a descrição | Não foi pedida. As abas já resolvem "ver como está ficando". |
| Colar screenshot da área de transferência ("You can also paste a screenshot" no print) | Não foi pedido. O seletor de arquivos cobre o caso de uso. |
| Persistir rascunho entre sessões ou entre trocas de seção | Nada é gravado nesta fase; o painel desmonta ao trocar de seção e o rascunho é perdido (assunção abaixo). |
| Rodapé "Close" próprio do print | O `SettingsShell` já tem o seu (SET-04/SET-05); duplicar seria um segundo botão de fechar na mesma janela. |
| Compressão, corte ou redimensionamento das imagens anexadas | Sem envio, não há banda a economizar. |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui — nada fica implícito.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Mecanismo do seletor de imagens | `<input type="file" accept="image/*" multiple>` nativo, escondido, disparado por botão estilizado | `File.size`/`.name` dão a regra dos 10 MB sem custo; `URL.createObjectURL` já é padrão do repo (`ScreenshotModal.tsx:28`). `plugin-dialog` devolve só o caminho e exigiria comando Rust novo numa fase sem backend. Registrado como AD-030. | n |
| O que "Enviar" faz nesta fase | Habilitado pela validação; o clique exibe um aviso `role="status"` de que o envio ainda não foi implementado | Silêncio no clique lê como tela quebrada; sucesso falso mente. O mesmo elemento recebe depois o texto real de sucesso/erro. Registrado como AD-031. | n |
| Renderizador do Markdown | Extrair `renderNotes`/`inline` de `UpdateSettings.tsx` para `src/lib/markdown.tsx` e estender com listas ordenadas, blocos cercados e citações | O repo já tem o renderizador e a regra de não somar dependência para o que já existe. Ele monta nós React, sem `dangerouslySetInnerHTML`. Registrado como AD-032. | n |
| Cobertura do Markdown | Títulos, parágrafos, listas `-`/`*`, listas ordenadas, `> citação`, ``` cercado, `**forte**`, `*ênfase*`, `` `código` `` | É o que uma descrição de feedback usa de fato. Tabelas, listas de tarefas e aninhamento ficam fora (ver Out of Scope) com gatilho explícito de troca por parser. | n |
| Aba padrão da descrição | "Escrever" | Quem abre a seção vai digitar, não ler. | n |
| Posição na barra lateral | Último item, depois de "Atualizações" | Feedback não é configuração de uso diário; as quatro seções existentes mantêm ordem e índices que os testes de `SettingsShell` já assertam. | n |
| Rascunho ao trocar de seção | Perdido — o painel guarda o próprio estado e desmonta | Nada persiste nesta fase; subir o estado para o shell é trabalho especulativo. Se incomodar, o conserto é mover o estado para `SettingsShell`. | n |
| "Limpar" pede confirmação? | Não — reseta na hora | É o comportamento do print de referência. O custo de errar é redigitar um rascunho que ainda não podia ser enviado. | n |
| Limite do título | 255 caracteres, com contador `N / 255` visível | Veio do print (`0 / 255`); o texto do pedido não deu limite. | n |
| Mesma imagem escolhida duas vezes | Entra duas vezes na lista | Deduplicar por nome exigiria decidir o que é "a mesma imagem"; a miniatura e o botão de remover já deixam a repetição visível e reversível. | n |
| Arquivo não-imagem escolhido | Recusado com mensagem nomeando o arquivo | `accept` é dica, não garantia: o diálogo do SO permite trocar o filtro para "todos os arquivos". | n |
| Idioma dos rótulos | pt-BR, com ids de categoria estáveis em inglês | Toda a UI do app é pt-BR; o id é o que a fase 2 mandará ao backend. | n |

**Open questions:** none — nenhuma pendente: tudo resolvido ou registrado acima.

Dimensões implícitas relevantes a este escopo: **validação e limites de entrada**
(FEED-03, FEED-07, FEED-08, FEED-11) e **ciclo de vida do dado** (FEED-10 —
`revokeObjectURL`). As demais dimensões (falha parcial, idempotência, auth,
concorrência, observabilidade, dependência externa, transição de estado) são
N/A: esta fase não faz I/O, não persiste e não fala com ninguém.

---

## User Stories

### P1: Alcançar a tela de feedback ⭐ MVP

**User Story**: Como usuário do app, quero uma seção "Feedback" em Configurações para registrar um bug ou uma ideia sem sair do produto.

**Why P1**: Sem a seção na navegação, o formulário não existe para o usuário.

**Acceptance Criteria**:

1. WHILE a janela de Configurações está aberta o sistema SHALL exibir "Feedback" como quinto e último item da barra lateral, depois de "Atualizações". <!-- FEED-01 -->
2. WHEN o usuário aciona o item "Feedback" THEN o sistema SHALL exibir o trilho "Configurações › Feedback" e montar o formulário de feedback. <!-- FEED-01 -->
3. The system SHALL manter "Geral" como seção inicial da abertura, inalterada por esta spec. <!-- FEED-01 -->

**Independent Test**: clicar em "Feedback" na barra lateral e ver o trilho e o formulário.

---

### P1: Preencher categoria, título e descrição ⭐ MVP

**User Story**: Como usuário, quero classificar e descrever meu feedback para que ele chegue com contexto.

**Why P1**: São os campos que o pedido nomeia; sem eles não há formulário.

**Acceptance Criteria**:

1. The system SHALL oferecer a categoria como um `<select>` com exatamente quatro opções: "Feedback geral" (`general`), "Relatar bug" (`bug`), "Pedido de recurso" (`feature`) e "Sugestão de melhoria" (`improvement`). <!-- FEED-02 -->
2. WHEN o formulário é montado THEN o sistema SHALL deixar "Feedback geral" selecionada. <!-- FEED-02 -->
3. The system SHALL exibir o campo "Título" como obrigatório, com contador `N / 255` e entrada limitada a 255 caracteres. <!-- FEED-03 -->
4. The system SHALL exibir o campo "Descrição" como obrigatório, em `<textarea>` de múltiplas linhas que aceita Markdown. <!-- FEED-04 -->
5. The system SHALL associar cada rótulo ao seu controle e marcar visualmente os campos obrigatórios. <!-- FEED-05 -->

**Independent Test**: abrir a seção, ler as quatro opções do select, digitar título e ver o contador subir.

---

### P1: Ver o Markdown renderizado enquanto escreve ⭐ MVP

**User Story**: Como usuário, quero alternar entre escrever e visualizar a descrição para ver como o texto está ficando, do jeito que o GitHub faz.

**Why P1**: Foi pedido explicitamente e é o que dá sentido à descrição ser Markdown.

**Acceptance Criteria**:

1. The system SHALL exibir, acima da descrição, duas abas — "Escrever" e "Visualizar" — em um `role="tablist"`, com "Escrever" ativa na montagem. <!-- FEED-13 -->
2. WHEN o usuário aciona a aba "Visualizar" THEN o sistema SHALL substituir o `<textarea>` pelo texto atual renderizado, sem perder o conteúdo digitado. <!-- FEED-13 -->
3. WHEN o usuário volta para a aba "Escrever" THEN o sistema SHALL reexibir o `<textarea>` com o mesmo conteúdo. <!-- FEED-13 -->
4. WHILE a aba "Visualizar" está ativa o sistema SHALL renderizar títulos `#`, parágrafos, listas `-`/`*`, listas ordenadas `1.`, citações `>`, blocos cercados por ```, `**forte**`, `*ênfase*` e `` `código` `` como elementos HTML correspondentes. <!-- FEED-14 -->
5. WHILE a aba "Visualizar" está ativa o sistema SHALL renderizar como texto literal qualquer sintaxe fora desse subconjunto, sem quebrar o preview. <!-- FEED-14 -->
6. IF a descrição está vazia THEN o sistema SHALL exibir na aba "Visualizar" o estado vazio "Nada para visualizar ainda." <!-- FEED-15 -->

**Independent Test**: digitar `# Título` e `- item`, clicar em "Visualizar" e ver um heading e um list item.

---

### P1: Anexar imagens dentro dos limites ⭐ MVP

**User Story**: Como usuário, quero anexar até 5 prints de até 10 MB para mostrar o problema em vez de descrevê-lo.

**Why P1**: É o único campo do pedido com regra própria; sem os limites o formulário aceita qualquer coisa.

**Acceptance Criteria**:

1. WHEN o usuário aciona "Selecionar imagens" THEN o sistema SHALL abrir o seletor de arquivos do SO em modo múltiplo, filtrado por imagens. <!-- FEED-06 -->
2. WHEN arquivos válidos são escolhidos THEN o sistema SHALL exibir uma miniatura por arquivo, com o nome, o tamanho e um botão de remover aquele arquivo. <!-- FEED-06 -->
3. IF a seleção faria a lista passar de 5 imagens THEN o sistema SHALL aceitar as imagens que couberem, recusar as excedentes e exibir uma mensagem nomeando cada arquivo recusado. <!-- FEED-07 -->
4. IF um arquivo escolhido tem mais de 10 MB THEN o sistema SHALL recusá-lo, aceitar os demais do mesmo lote e exibir uma mensagem nomeando o arquivo recusado. <!-- FEED-08 -->
5. IF um arquivo escolhido não é uma imagem THEN o sistema SHALL recusá-lo e exibir uma mensagem nomeando o arquivo. <!-- FEED-11 -->
6. WHILE a lista tem 5 imagens o sistema SHALL desabilitar o botão "Selecionar imagens". <!-- FEED-07 -->
7. The system SHALL exibir toda mensagem de recusa em um elemento `role="alert"` junto ao bloco de anexos. <!-- FEED-09 -->

**Independent Test**: escolher 6 arquivos e ver 5 miniaturas mais a mensagem nomeando o sexto.

---

### P1: Enviar e limpar sem mentir ⭐ MVP

**User Story**: Como usuário, quero saber o que acontece quando clico "Enviar" — inclusive que ainda não acontece nada.

**Why P1**: É o par de botões do pedido, e a honestidade do estado é a regra do projeto (AD-031).

**Acceptance Criteria**:

1. WHILE título ou descrição estão vazios o sistema SHALL manter o botão "Enviar feedback" desabilitado. <!-- FEED-09 -->
2. WHEN título e descrição estão preenchidos THEN o sistema SHALL habilitar o botão "Enviar feedback". <!-- FEED-09 -->
3. WHEN o usuário aciona "Enviar feedback" THEN o sistema SHALL exibir, em um elemento `role="status"`, o aviso de que o envio ainda não foi implementado. <!-- FEED-09 -->
4. The system SHALL não emitir nenhuma chamada `invoke` nem nenhuma requisição de rede a partir desta tela. <!-- FEED-12 -->
5. WHEN o usuário aciona "Limpar" THEN o sistema SHALL restaurar categoria, título, descrição, aba ativa, anexos e mensagens ao estado inicial. <!-- FEED-10 -->
6. WHILE o formulário está no estado inicial o sistema SHALL manter o botão "Limpar" desabilitado. <!-- FEED-10 -->
7. WHEN uma imagem é removida, o formulário é limpo, ou o painel é desmontado THEN o sistema SHALL revogar os object URLs das miniaturas correspondentes. <!-- FEED-10 -->

**Independent Test**: preencher, clicar "Enviar" e ler o aviso; clicar "Limpar" e ver o formulário vazio.

---

## Edge Cases

- IF o usuário escolhe arquivos e cancela o diálogo na segunda vez THEN o sistema SHALL manter a lista atual intacta.
- IF o mesmo arquivo é escolhido duas vezes THEN o sistema SHALL aceitá-lo como duas entradas distintas, cada uma com seu botão de remover.
- WHEN o título chega a 255 caracteres o sistema SHALL impedir a digitação do 256º em vez de truncar em silêncio depois.
- IF um lote misto (válidos + recusados) é escolhido THEN o sistema SHALL aceitar os válidos e listar todos os recusados numa única mensagem.
- IF um bloco cercado por ``` não é fechado THEN o sistema SHALL renderizar até o fim do texto como bloco de código, sem descartar conteúdo.
- IF `URL.revokeObjectURL` não existe no ambiente THEN o sistema SHALL seguir removendo a miniatura sem quebrar.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FEED-01 | P1: Alcançar a tela de feedback | Execute | Implemented |
| FEED-02 | P1: Preencher categoria, título e descrição | Execute | Implemented |
| FEED-03 | P1: Preencher categoria, título e descrição | Execute | Implemented |
| FEED-04 | P1: Preencher categoria, título e descrição | Execute | Implemented |
| FEED-05 | P1: Preencher categoria, título e descrição | Execute | Implemented |
| FEED-06 | P1: Anexar imagens dentro dos limites | Execute | Implemented |
| FEED-07 | P1: Anexar imagens dentro dos limites | Execute | Implemented |
| FEED-08 | P1: Anexar imagens dentro dos limites | Execute | Implemented |
| FEED-09 | P1: Enviar e limpar sem mentir | Execute | Implemented |
| FEED-10 | P1: Enviar e limpar sem mentir | Execute | Implemented |
| FEED-11 | P1: Anexar imagens dentro dos limites | Execute | Implemented |
| FEED-12 | P1: Enviar e limpar sem mentir | Execute | Implemented |
| FEED-13 | P1: Ver o Markdown renderizado enquanto escreve | Execute | Implemented |
| FEED-14 | P1: Ver o Markdown renderizado enquanto escreve | Execute | Implemented |
| FEED-15 | P1: Ver o Markdown renderizado enquanto escreve | Execute | Implemented |

**Coverage:** 15 requisitos, 15 mapeados para tarefas, 0 sem mapeamento.

---

## Impacto em specs existentes

`SettingsShell.tsx` implementa requisitos `SET-xx` (seções, trilho, fechar) que
**não têm pasta em `.specs/features/`** — os IDs estão órfãos desde antes desta
spec. Esta spec **acrescenta** uma seção sem alterar nenhuma existente: nenhum
requisito `SET-xx`, `QUOTA-xx`, `PROV-xx`, `PROJ-xx` ou `SILENT-xx` é revogado.

Um requisito existente é **tocado sem ser alterado**: `SILENT-42` (notas da
release renderizadas como títulos e itens). O renderizador sai de
`UpdateSettings.tsx` para `src/lib/markdown.tsx` (AD-032) e o comportamento
precisa ficar idêntico. A prova é o teste que já existe —
`UpdateSettings.test.tsx:191` — passando **sem edição de asserção** depois da
extração (T2). Se ele precisar mudar, a extração quebrou `SILENT-42` e a
tarefa não está pronta.

---

## Success Criteria

- [ ] Abrir Configurações → "Feedback" mostra o formulário do `print/feadback.png` sem o campo de e-mail.
- [ ] Digitar `# Título` na descrição e clicar em "Visualizar" mostra um heading renderizado; voltar para "Escrever" preserva o texto.
- [ ] Escolher 6 imagens deixa 5 na lista e nomeia a recusada.
- [ ] Um arquivo de 11 MB é recusado pelo nome, e um de 9 MB do mesmo lote entra.
- [ ] "Enviar" só habilita com título e descrição, e o clique diz que o envio não existe ainda.
- [ ] `npm run build` e `npm run test` passam, com as suítes de `SettingsShell` e `UpdateSettings` intactas.
