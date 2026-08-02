---
name: spec-loop
description: Executa o que a triagem já marcou como pronto em qualquer projeto — despacha subagents em paralelo, em modo validado (cada execução seguida de uma validação adversarial por um agente diferente, com correção em loop) ou em modo direto (só implementação, seguindo até o fim da fila). Pergunta o modo uma única vez, antes da primeira onda, e nunca mais interrompe: item que exige decisão humana é estacionado, marcado na spec e devolvido para a skill spec-triage. Mantém um journal que permite retomar numa sessão nova. Use quando o pedido for "execute o que falta", "continue de onde parou", "valide o que foi implementado" ou variações.
---

# spec-loop — execução e validação orquestradas

Esta skill é **orquestradora e não-bloqueante**. Ela executa; ela não decide o que é o trabalho e não interroga o usuário.

| Skill | Faz | Não faz |
| --- | --- | --- |
| **spec-triage** | descobre o projeto, reconcilia a documentação com o código, inventaria, classifica, pergunta ao usuário e grava a resposta na spec | não implementa |
| **spec-loop** (esta) | executa os itens que a triagem marcou como prontos, com validação adversarial em loop | **não reconcilia, não classifica, não pergunta** |

**A regra que define esta skill:** ela só toca item que já é executável sem intervenção humana. Se durante a execução ou a validação aparecer uma decisão que só o usuário pode tomar, o item é **estacionado e a spec dele é atualizada** com a pergunta — nunca executado no chute, nunca perguntado no meio da onda. A Fase 3 diz como.

**A única pergunta que esta skill faz** é a da Fase 0.5: em que modo a run vai rodar. Ela acontece **antes da primeira onda**, uma vez, e não se repete. Depois disso a run é não-bloqueante do começo ao fim da fila — é o que separa uma escolha de estratégia (barata antes de começar) de uma interrupção no meio da execução (cara, porque para trabalho já em voo).

Quem executa esta skill **não edita código, não roda gate, não dirige o produto**: planeja ondas, despacha subagents, lê o que eles devolvem e decide o próximo passo. Toda mudança de arquivo passa por um subagent.

A razão não é estética. O contexto do orquestrador precisa durar a run inteira — se ele gastar o contexto lendo diffs e saída de teste, ele perde a única coisa que só ele tem: a visão de quais tasks colidem, o que já foi validado e o que ficou pendente. Um agente que implementa perde essa visão em três tasks.

**As exceções, e elas têm fronteira exata.** O orquestrador escreve:
- a documentação de **nível projeto** (estado, roadmap, retrato do código, regras do repositório) e o journal — é bookkeeping, é o produto do próprio raciocínio dele, e delegar isso significaria delegar a memória da run;
- a **nota de estacionamento** de um item devolvido à triagem (Fase 3) — também é bookkeeping: registra o que a run encontrou, não planeja a feature.

A documentação de **nível feature** (requisitos, desenho, tasks) é escrita pelo **agente que planeja aquela feature**. Ela é o produto do planejamento, não bookkeeping — e centralizá-la faria o orquestrador virar gargalo de digitação enquanto dois agentes esperam.

**Esta skill não conhece o seu projeto.** Onde ficam as specs, quais são os gates, o que é território compartilhado, o que exige o usuário: tudo isso vem do `TRIAGE.md` que a `spec-triage` produziu. Nomes de arquivo citados aqui são exemplo, não fato.

---

## As três coisas que esta skill existe para impedir

**"Compila" não é "verificado".** Um agente que reporta "implementado, os testes passaram" não provou nada sobre o produto. Em bases reais, sessões de teste manual acharam defeitos que passavam por **todos** os gates automatizados: uma dependência podada do pacote final, um dado gravado que nunca era lido de volta, um resultado plausível construído sobre a entrada errada. Por isso a validação desta skill é adversarial, e por isso `uat-agent` existe como classe separada.

**Um relatório otimista não falha nenhum gate.** Já aconteceu de um agente cortado por limite de sessão marcar duas tasks como concluídas cujos arquivos não existiam, com a rastreabilidade dando os requisitos como verificados — e nada quebrar, porque a suíte passava com os testes que de fato existiam. A única coisa errada era a prosa, que é justamente o que nenhum gate pega. É o item 0 do checklist do validador.

**Executar sobre documentação não reconciliada é executar trabalho que não existe.** Esta skill **não faz** essa reconciliação: ela exige que já tenha sido feita, e verifica isso na Fase 0.

---

## O contexto do orquestrador fica baixo — de propósito, e por construção

Não é preferência de estilo. Numa run com muitas specs, o orquestrador é a única coisa que atravessa a fila inteira — se o contexto dele lotar de diff, log de teste e relatório de subagent, ele perde a única coisa que só ele tem: a visão de quais tasks colidem, o que já foi validado, o que falta. Um orquestrador com contexto sobrando também é o que ainda tem margem para reagir à Fase 3 no meio da fila, em vez de travar por falta de espaço na hora que mais importa.

Duas regras de disciplina, as duas obrigatórias:

**1. Toda spec/task executada roda inteira em subagent — nunca no agente principal.** Implementador, validador, corretor, UAT: cada papel é um subagent despachado (Fase 2), sempre. O agente principal não abre um arquivo de produto para editar, não roda o gate ele mesmo (a única exceção é a checagem de existência de arquivo do item 0 do validador em modo `direto`, que é dele por desenho — Fase 2), não escreve teste, não corrige defeito. Isso já valia antes desta seção — releia "As exceções, e elas têm fronteira exata" logo acima, ela continua sendo a lista completa do que o orquestrador escreve com a própria mão. O que esta seção acrescenta é o motivo explícito: cada byte que o orquestrador gasta implementando é um byte que ele não tem sobrando para orquestrar a fila inteira. Vale para toda task, inclusive a que parece pequena demais para valer um subagent — "é só uma linha, eu mesmo ajusto" é o mesmo atalho que a Fase 0 já proíbe para triagem, aplicado aqui à execução.

**2. Do que o subagent devolve, o orquestrador extrai só o que o journal precisa — e descarta o resto.** Um relatório de implementador ou validador chega com diff, número de teste, prosa de justificativa. O orquestrador lê isso, tira Status / arquivos / gate medido / desvio / veredito, escreve a linha do journal (Fase 4), e **não carrega o relatório inteiro adiante na conversa**. Depois que a linha está no disco, o relatório já cumpriu sua função — reler o diff de uma task três tasks depois é o mesmo desperdício que implementar direto.

### Em runs com fila grande: resuma, não acumule

Numa fila de 5 tasks isso mal aparece. Numa fila de 30, ou numa que atravessa várias specs, acumular o histórico completo de cada onda no contexto é o jeito mais rápido de o orquestrador perder a run antes de chegar ao fim dela. A regra:

- **Spec/task já journalizada e sem `Status: Bloqueado` sai do contexto ativo.** O que fica é o resumo: quantas tasks daquela spec passaram, quantas ficaram, se alguma foi estacionada. O detalhe (quem implementou o quê, o defeito exato que o validador achou) mora só no `JOURNAL.md` — que é exatamente o motivo dele ser escrito task a task e não só no fim (Fase 4). A razão agora é dupla: sobrevive a uma sessão cortada, **e** mantém o contexto do orquestrador do tamanho da onda atual, não do tamanho da run inteira.
- **Ao fechar uma onda, comprima o que ela produziu num contador, não numa lista.** "Onda 3: 4/4 aprovadas" substitui os quatro parágrafos de relatório que geraram esse número. Se o relatório final precisar de detalhe por task, ele **relê o journal do disco** na hora de escrever — não recupera de memória de conversa.
- **Ao passar para a próxima spec/feature dentro da mesma run, trate a anterior como fechada.** Não carregue "para dar contexto" o que já foi resolvido nela — se o subagent da spec nova precisar de algo daquela, isso é regra de repositório ou território compartilhado, e já está no Perfil do projeto (Fase 0), não na memória de conversa do orquestrador.
- **Se o contexto crescer mesmo assim** (muitas ondas, muitos ciclos de correção), pare no limite de onda — nunca no meio de uma task em voo — e retome como a Fase 4 já descreve para sessão nova: releia o journal, releia o `TRIAGE.md`, confirme o checkpoint, siga da primeira task sem `Status: concluída`. Uma retomada deliberada por estouro de contexto usa o mesmo procedimento de uma retomada por sessão cortada — o journal já foi desenhado para os dois casos.

---

## Fase 0 — Carregar a triagem (pré-condição, não trabalho)

Esta skill não descobre o que fazer. Ela lê o que a `spec-triage` já decidiu.

1. Ache o `TRIAGE.md` mais recente em `<specs>/runs/<NNN>-<YYYY-MM-DD>/`.
2. **Ele precisa estar com `Status: pronta`.** `em andamento` ou `bloqueada` significa que ainda há pergunta aberta com o usuário.
3. **Ele precisa estar fresco.** Rode o **comando de revisão do perfil** (`git rev-parse --short HEAD`, `hg id -i`, `svnversion` — o que o projeto usar) e compare com a `Revisão ao fechar` registrada. Se avançou, o código mudou depois da triagem e a classificação pode ter envelhecido.

   **Se o perfil disser "SEM VCS — frescor não verificável", a regra é mais dura:** a triagem só vale na sessão em que foi feita. Numa sessão nova, você não tem como saber o que mudou no disco desde então — peça a triagem de novo. Aceitar calado um `TRIAGE.md` sem revisão é executar classificação velha achando que está fresca, e nada no caminho vai reclamar.

**Se qualquer uma das três falhar: pare e peça a triagem.** Não improvise um inventário, não "dá para ver rapidinho o que falta", não classifique por conta própria. Uma frase basta: *"não há triagem pronta (ou ela está velha) — rode a skill `spec-triage` primeiro."* Este é o modo de falha mais provável desta skill, porque o atalho parece produtivo.

**Se não existir `TRIAGE.md` nenhum**, o mesmo vale: a triagem é sempre a primeira execução do par.

Com a triagem carregada, leia dela o **Perfil do projeto** — é o que substitui todo conhecimento específico que esta skill deliberadamente não tem:

| Do perfil | Usado em |
| --- | --- |
| caminho do conjunto de specs e dos documentos de projeto | todas as fases |
| onde as tasks moram e onde a decisão fica gravada | nota de estacionamento (Fase 3) |
| controle de versão e seus comandos | frescor (acima), checkpoint e retomada (Fase 4) |
| regras do repositório (incluindo marcador de rastreabilidade e idioma) | brief de todo subagent |
| **gates por escopo** + o baseline medido na triagem | brief do implementador e do validador — cole o gate do **escopo daquela task**, não o da raiz |
| território compartilhado, e se a task declara seus arquivos | montagem das ondas (Fase 1) |

**O idioma dos artefatos é o do perfil, não o desta skill.** Journal, notas de estacionamento e relatório saem no idioma de documentação do projeto. Só os rótulos de classificação (`code`, `uat-agent`, `needs-decision`…), os nomes de arquivo e o marcador `⛔ NEEDS-DECISION` ficam como estão: são contrato com a `spec-triage`.

E monte a fila, que é exatamente esta e nada além dela:

| Rótulo no inventário | Entra na fila? |
| --- | --- |
| `code` com **Pronto p/ execução = sim** | sim |
| `uat-agent` com **Pronto p/ execução = sim** | sim, sempre sozinho |
| `needs-decision` | **não** — é da triagem |
| `human-only`, `blocked`, `moot` | **não** — só aparecem no relatório final |

**Se a fila der zero: pare e relate.** Não invente refatoração, não "melhore" o que ninguém pediu, não converta `blocked` em tentativa. "Não há o que executar, e eis por quê" é um resultado correto.

---

## Fase 0.5 — O modo da run (a única pergunta desta skill)

Com a fila montada e **antes de despachar qualquer subagent**, pergunte ao usuário em que modo a run vai correr. Use a ferramenta de pergunta estruturada (`AskUserQuestion`) com estas duas opções — e o número de itens da fila na pergunta, porque é o que dá escala à escolha:

| Modo | O ciclo por task | Quando faz sentido |
| --- | --- | --- |
| **`validado`** (padrão) | implementador → **validador adversarial** (agente diferente) → corretor → revalidar | o resultado vai para a base e ninguém vai reler task por task. É o modo que as três coisas da seção acima existem para sustentar |
| **`direto`** | só implementador, com os gates do escopo. Sem validador, sem ciclo de correção | você vai revisar o diff inteiro depois, ou quer varrer a fila toda rápido para ver onde ela quebra |

**Os dois modos vão até o fim da fila.** "Finalizar" aqui significa **esgotar todos os itens prontos para execução de todas as specs**, onda após onda, sem parar entre elas para pedir confirmação — é isto que esta skill orquestra. O que a escolha muda é só o ciclo *dentro* de cada task, nunca até onde a run vai. Uma run em modo `direto` que para no meio da fila para relatar não cumpriu o que foi pedido.

**Não pergunte se o usuário já disse.** "roda direto", "sem validar", "só implementa" → `direto`. "valida cada uma", "com validação", "rodada adversarial" → `validado`. Perguntar o que já foi respondido gasta uma interação e irrita.

**Se a resposta não vier** (usuário ausente, invocação automatizada, `/loop`): assuma **`validado`**. O padrão precisa ser o modo caro, porque o barato produz um resultado que *parece* igual — o mesmo diff, os mesmos gates verdes — e a diferença só aparece depois, quando o defeito chega na base. Um padrão inseguro que se parece com o seguro é a pior escolha de padrão possível.

**O modo escolhido é fato registrado, não detalhe de conversa.** Grave-o no journal (Fase 4) e no relatório final. Numa sessão de retomada, o modo vem do journal — não pergunte de novo.

### O que o modo `direto` NÃO desliga

O modo direto tira o validador. Ele não tira nada mais, e confundir isso é o jeito de transformar uma run rápida numa run inútil:

- **Os gates do escopo continuam obrigatórios.** O implementador roda e relata número medido. `direto` é "sem segundo agente", não "sem verificação".
- **A Fase 3 continua valendo.** Implementador que devolve `Bloqueado` com uma pergunta é estacionado do mesmo jeito, e a spec dele é atualizada do mesmo jeito. Não existe modo que autorize chutar decisão do usuário.
- **Os itens `uat-agent` da fila continuam rodando**, sozinhos, como sempre. Eles são trabalho enfileirado, não a etapa de validação que o modo desligou.
- **As regras de território compartilhado e de onda continuam valendo** (Fase 1). Elas protegem contra dano silencioso entre agentes paralelos, e isso não tem relação com validar.

### O preço, e como ele aparece no relatório

Em modo `direto`, **nada na run foi verificado por um agente independente**. Toda evidência tem uma única origem: o agente que escreveu o código, relatando sobre o próprio trabalho. As duas primeiras coisas da seção "As três coisas que esta skill existe para impedir" ficam **descobertas** — inclusive o relatório otimista, que nenhum gate pega.

Isso vai no relatório final **com todas as letras**, na frase que descreve o que foi feito — não numa nota de rodapé:

> *Run em modo `direto`: 9 tasks implementadas, gates do escopo medidos pelo próprio implementador. **Nenhuma passou por validação independente** — o que está escrito aqui sobre cada task é o autorrelato de quem a escreveu.*

Um relatório de run `direto` que não diz isso está afirmando mais confiança do que a run produziu, que é exatamente o defeito que esta skill existe para não cometer.

---

## Fase 1 — Ondas de paralelismo

Paralelizar é o objetivo, mas colisão custa mais do que a economia. Uma task entra na onda com outra **só se todas as condições valerem**:

1. **Conjuntos de arquivos disjuntos.** Leia o campo de arquivos da task. Interseção não vazia → ondas diferentes.

   **Task com `Declara arquivos = não` no inventário vai sozinha.** Sem essa lista você não tem como provar disjunção, e supor que duas tasks não se cruzam é exatamente o erro que a onda existe para evitar. Serialize — e **escreva no journal que serializou por falta de arquivos declarados**, senão a run parece lenta sem motivo e ninguém conserta a causa, que é a spec.
2. **Sem dependência declarada ainda aberta.**
3. **Nenhuma é `uat-agent`.** Dirigir o produto é sempre sozinho: o processo costuma ser instância única, a porta de desenvolvimento é única, e o teste manual toca estado real.
4. **Nenhuma toca o território compartilhado listado no `TRIAGE.md`** — o padrão típico é migração numerada, arquivos de tradução espelhados, arquivo gerado, registro central, lockfile. O motivo de cada um está no perfil; se dois agentes escreverem lá, o dano costuma ser **silencioso**, não um build quebrado.

**Teto de 3 subagents de execução simultâneos.** Não é limite técnico: acima disso o orquestrador não consegue validar com cuidado o que volta, e validação superficial é o modo de falha que esta skill existe para evitar.

Despache as tasks de uma onda em **uma única mensagem** com múltiplas chamadas do Agent — é o que as faz rodar de fato em paralelo.

---

## Fase 2 — O loop de execução e validação

O ciclo abaixo é o do **modo `validado`**. Em modo `direto`, ele para na primeira caixa: implementador → journal → próxima task, onda após onda, até a fila acabar. Pule direto para a subseção "Modo `direto`" no fim desta fase.

Para cada task da onda:

```
        ┌──────────────┐
        │ IMPLEMENTADOR│  subagent novo, contexto mínimo
        └──────┬───────┘
               ↓ devolve: arquivos, gates, desvios
        ┌──────────────┐
        │  VALIDADOR   │  subagent DIFERENTE, missão adversarial
        └──────┬───────┘
         aprovado? ──sim──→ journal + próxima
               │ não
               ↓
        ┌──────────────┐
        │  CORRETOR    │  recebe só a lista de defeitos
        └──────┬───────┘
               ↓
          revalidar (validador novo)  ── até 3 ciclos ──→ estaciona (Fase 3)
```

**O validador nunca é o implementador, e nunca recebe o contexto dele.** Um agente que acabou de escrever o código conhece a intenção e lê o próprio trabalho com ela na cabeça; ele valida o que quis fazer, não o que fez. O validador recebe o requisito e o diff, e a missão de **falsificar**.

**Teto de 3 ciclos por task.** Se um defeito sobrevive a três correções, o problema é de spec ou de desenho, não de código — e isso é decisão do usuário. Estacione pela Fase 3.

Os briefs de cada papel estão em [references/agent-briefs.md](references/agent-briefs.md). Não improvise, e **preencha os placeholders com o Perfil do projeto**: o que o subagent recebe é o que decide a qualidade do que volta.

### Modo `direto` — a fila inteira, sem o segundo agente

```
IMPLEMENTADOR → journal → próxima task → próxima onda → ... → fila vazia
```

O ciclo por task acaba quando o implementador devolve. Sem validador, sem corretor, sem teto de ciclos — não há ciclo.

O que muda na condução da run:

- **Não pare entre ondas.** Monte a próxima onda pela Fase 1 e despache. A run só termina quando a fila esvazia (ou quando o que sobrou está todo estacionado). Relatório parcial no meio da fila não é o produto desta skill.
- **Leia o que o implementador devolve, mesmo sem validar.** `Status: Bloqueado` → Fase 3. `Status: Parcial` → journal com o que ficou faltando, e siga. `DESVIO` declarado → registre no journal; ele é a única pista que sobrou de que algo saiu do plano.
- **Arquivo citado que não existe ainda te obriga a parar aquela task.** É o item 0 do checklist do validador, e é a única verificação dele que você faz sozinho, porque custa uma listagem e pega o modo de falha mais caro que já aconteceu: task marcada como concluída cujo artefato não está no disco. Não vale delegar essa checagem ao mesmo agente que escreveu o relatório.
- **O journal marca `Validação: — (modo direto)`**, nunca campo em branco. Branco depois se lê como "não anotei"; `— (modo direto)` se lê como "não houve, e foi de propósito".

---

## Fase 3 — Quando aparece uma decisão humana: estacionar, não perguntar

Acontece: um validador devolve `NEEDS-DECISION` em vez de defeito; um implementador para dizendo que a task admite duas leituras; três ciclos de correção provam que o problema é de desenho. Defeitos que só aparecem com o produto rodando são o caso mais comum.

Esta skill **não pergunta** — perguntar bloquearia a onda inteira por causa de uma task, e a pergunta feita no meio da execução é justamente a que custa retrabalho do código já escrito. O procedimento:

1. **Pare aquela task.** As outras da onda seguem até o fim. Uma task parada é barata; uma onda parada por uma pergunta de uma task, não.
2. **Reverta ou isole o que ficou pela metade.** Não deixe no working tree meio-código que ninguém validou. Se o trabalho parcial tem valor, ele fica — mas a nota diz exatamente o que está incompleto.
3. **Atualize a spec da task** — é a parte que não pode ser pulada. Este conteúdo, no idioma de documentação do projeto:

   ```markdown
   ### T7: <título>  ⛔ NEEDS-DECISION

   **Estacionada na run <NNN> (<data>).** Não executar até haver decisão do usuário.

   **Pergunta:** <a pergunta, com as opções reais e o trade-off de cada uma>
   **Por que só o usuário responde:** <o que no repositório não responde isto>
   **Medições que sustentam a escolha:** <número medido, com o comando>
   **Estado do código:** <o que ficou no disco, ou "nada — revertido">
   ```

   **Onde isso vai depende do perfil:**

   | Tasks moram em | Onde escrever |
   | --- | --- |
   | markdown no repositório | no header da task, no arquivo de tasks da feature |
   | rastreador externo | **no arquivo do repositório que o perfil aponta como fonte** (o `context.md` da feature ou equivalente), e só então espelhe no ticket com o rótulo `⛔ NEEDS-DECISION` |

   Nunca só no ticket. O subagent que pegar essa task na próxima run costuma não ter credencial do rastreador — ele vai ler a spec, não achar o impedimento, e implementar no chute exatamente o que você estacionou para não chutar.

   Se a dúvida for de desenho e não da task, abra também a pergunta no documento de desenho da feature. O critério é o mesmo da triagem: o próximo agente lê a spec, não esta conversa.
4. **Registre no journal**, na seção "Devolvido para triagem".
5. **Siga a run** com o resto da fila.

No relatório final, diga quantos itens voltaram e que a `spec-triage` precisa rodar para desbloqueá-los.

---

## Fase 4 — Journal, e retomar numa sessão nova

O journal é o que torna a run interrompível. **Escreva depois de cada task, não no fim** — uma run que morre no meio precisa que o disco já saiba o que aconteceu.

Local: `<specs>/runs/<NNN>-<YYYY-MM-DD>/JOURNAL.md` — a **mesma pasta** do `TRIAGE.md` que autorizou esta execução.

O template abaixo está em português porque esta skill está; **o journal sai no idioma de documentação do projeto**.

```markdown
# Run NNN — <data>

**Status:** em andamento | pausada | concluída
**Modo:** validado | direto — <escolhido pelo usuário em <hora> | padrão, sem resposta>
**Triagem que autorizou:** TRIAGE.md desta pasta, revisão <valor>
**Orquestrador:** sessão iniciada em <hora>

## Fila de execução (da triagem)
| Item | Feature | Escopo/gate | Classificação | Onda | (se sozinha) por quê |

## Execução
| Task | Onda | Implementador | Gates | Validação | Ciclos | Status |
(em modo direto, "Validação" é sempre `— (modo direto)` e "Ciclos" é `0`)

## Devolvido para triagem
| Task | Pergunta | Onde ficou gravada | Estado do código |

## Gates medidos nesta run
| escopo | comando | resultado medido | quando |
(número medido nesta run — nunca copiado do TRIAGE.md nem de outro documento)

## Estado da árvore no último checkpoint
<saída do comando de estado do perfil — ou, sem VCS, a listagem de arquivos
tocados com mtime>

## Não verificado
<o que ficou sem prova de execução — obrigatório, mesmo que vazio explique>
```

**Retomar:** ler o journal mais recente com `Status: em andamento` ou `pausada`, rodar o comando de estado do perfil, comparar com o checkpoint registrado. Divergência significa que algo mudou fora da skill — reconcilie antes de continuar. Confira também que o `TRIAGE.md` da pasta continua valendo (Fase 0). Depois siga da primeira task sem `Status: concluída`.

**O modo vem do journal, não de uma pergunta nova.** Numa retomada, leia o campo `Modo` e continue nele — perguntar de novo produziria uma run com metade das tasks validadas e metade não, e um relatório que não consegue dizer honestamente o que foi verificado. Se o usuário quiser trocar de modo, ele diz; então registre a troca no journal com a task a partir da qual ela vale, porque o relatório vai precisar separar as duas metades.

**Se o journal não tiver o campo `Modo`** (journal antigo, ou escrito antes desta regra), trate as tasks já concluídas como **não validadas** e registre isso em "Não verificado". Presumir que houve validação porque o journal não diz o contrário é inventar evidência.

**Sem VCS, a retomada é frágil e você precisa dizer isso:** sem diff, você não consegue distinguir o que esta run escreveu do que alguém escreveu entre as sessões. Retome mesmo assim, mas trate cada task já marcada como concluída como **não reverificada** e registre isso na seção "Não verificado".

**Sem commits**, a menos que o usuário peça — e a menos que as regras do repositório digam outra coisa. A retomada se apoia no journal + o estado da árvore, não no histórico. Ao fim da run, **sugira** a mensagem de commit; não execute.

---

## Nunca faça (vale para todo subagent despachado)

- **Não pergunte ao usuário no meio da execução.** Estacione pela Fase 3. As únicas perguntas legítimas desta skill são a do começo — o modo da run, Fase 0.5 — e a do fim: "posso commitar?". Entre uma e outra, a run não interrompe o usuário por nada.
- **Não pare a run antes de esvaziar a fila.** Nenhum modo autoriza entregar metade das specs e perguntar se continua. Item que não dá para executar é estacionado (Fase 3) e a fila segue.
- **Não execute item `needs-decision`, `human-only` ou `blocked`.** Se ele está fora da fila, ele está fora.
- **Não toque em dados reais do usuário.** Se o projeto tem estado local (banco, workspace, cache, credenciais), **copie** para um diretório temporário, trabalhe na cópia, apague. O original nunca é aberto para escrita por um teste.
- **Não commite, não force-push, não reescreva a branch principal** sem o usuário pedir. Desfazer é um commit de reversão, nunca reescrita de histórico.
- **Não publique nada para fora**: release, deploy, registro de pacotes. É `human-only` por definição.
- **Não deixe arquivo de diagnóstico temporário no repositório.** Órfãos com caminhos absolutos da máquina de alguém sobrevivem meses à investigação que os criou.
- **Não invente ID de requisito.** Criar requisito é trabalho da triagem, não desta skill.
- **As regras do repositório vencem** qualquer coisa escrita aqui. Se houver contradição, siga o repositório e registre a contradição no relatório.
- **Não acumule no contexto o relatório completo de task já journalizada.** Extraia o que a linha do journal precisa, grave, e siga — o disco é a fonte de verdade a partir daí, não a conversa.

---

## Relatório final

Relate o que foi **executado**, não o que deveria funcionar, e diga a origem de cada evidência:

- **em que modo a run rodou**, na primeira linha. Se foi `direto`, a frase da Fase 0.5 vai junto: nenhuma task passou por validação independente, e o que está escrito sobre cada uma é autorrelato de quem a escreveu;
- **o que rodou**, com número medido (contagem de teste, tempo, bytes) — nunca adjetivo;
- **quem provou o quê**: gate automatizado, validador adversarial, ou uso real do produto. As três têm forças diferentes e o leitor precisa saber qual foi;
- **quais specs foram atualizadas** e o que ficou pendente nelas;
- **quais marcadores de rastreabilidade** foram adicionados ou mexidos, se o projeto os exige;
- **o que voltou para a triagem**, com a pergunta de cada item;
- **o que NÃO foi verificado** — obrigatório, na mesma frase que descreve o que foi feito;
- **o que depende do usuário**, nomeando por que nenhum agente resolve.
