# Feedback Form — Validation Report

**Verifier**: agente independente (não escreveu o código). Regra: evidência ou zero.
**Data**: 2026-08-22
**Escopo verificado**: `.specs/features/feedback-form/spec.md` (FEED-01..FEED-15), Edge Cases, Success Criteria, gates e regras do repositório.

---

## Summary

**VEREDITO: APROVADO COM RESSALVAS.** Os 15 requisitos estão implementados e o
comportamento observável bate com a spec; os gates rodam verdes de verdade
(`npm run build` OK; `npm run test` = **521 testes / 37 arquivos, 0 falhas**);
`SILENT-42` está preservado (`git diff -- src/components/settings/UpdateSettings.test.tsx`
sai **vazio**); nenhum `invoke`, `fetch`, `XMLHttpRequest` ou `WebSocket` existe em
`FeedbackPanel.tsx`; nenhum `dangerouslySetInnerHTML` em `markdown.tsx` (nem em
todo o `src/`). As ressalvas são **de cobertura de teste, não de comportamento**:
uma AC (FEED-06 AC1) não tem nenhuma asserção que a exercite, o guard de rede de
FEED-12 só cobre `invoke` e não `fetch`, e três asserções são tautológicas.

---

## Per-Requirement Table

| ID | Verdict | Evidência (`file:line`) | Nota |
| --- | --- | --- | --- |
| FEED-01 | PASS | `src/routes/settings/SettingsShell.tsx:19,43,573,654`; teste `src/routes/settings/SettingsShell.test.tsx:749-772` | `'feedback'` no `SectionId`, quinto e último item do `SECTIONS`, trilho `Configurações › Feedback` e render do painel. Teste asserta a ordem exata dos 5 itens e que "Geral" segue inicial (`SettingsShell.tsx:91`). Ambas as montagens (`src/App.tsx:1513`, `src/main.tsx:31`) usam o mesmo componente — só a montagem de janela é testada. |
| FEED-02 | PASS | `src/routes/settings/FeedbackPanel.tsx:9-14,433-444`; teste `FeedbackPanel.test.tsx:12-34` | 4 opções, rótulos pt-BR e ids `general/bug/feature/improvement` na ordem da spec; teste asserta rótulos **e** values, e `general` na montagem. |
| FEED-03 | PASS | `FeedbackPanel.tsx:19,452-465`; teste `FeedbackPanel.test.tsx:44-59` | Contador `N / 255` reativo, `maxLength={255}`, `required`. O teste do teto asserta o atributo `maxLength`, não a digitação — limitação real do jsdom, e o atributo **é** o mecanismo nativo. |
| FEED-04 | PASS | `FeedbackPanel.tsx:501-509`; teste `FeedbackPanel.test.tsx:80-86` | `<textarea rows={8} required>`, conteúdo renderizado por `renderMarkdown` no preview (`:513`). |
| FEED-05 | PASS | `FeedbackPanel.tsx:430,448,469` (`htmlFor`), `:523,536` (`aria-labelledby` dos anexos), `:450,471` (marcador `*`); teste `FeedbackPanel.test.tsx:61-66,58,84` | Toda associação rótulo↔controle existe. **Ressalva**: nenhum teste asserta o marcador visual de obrigatório (`*`); e o comentário de CSS em `FeedbackPanel.tsx:103-104` diz "marcado por texto, não só por cor", mas o código entrega apenas um asterisco colorido — o comentário descreve algo que o código não faz. |
| FEED-06 | PARTIAL | Impl: `FeedbackPanel.tsx:530-547` (input escondido `accept="image/*" multiple`, botão com `onClick={() => fileInputRef.current?.click()}`), `:556-576` (miniatura, nome, tamanho, remover). Teste: `FeedbackPanel.test.tsx:142-150` | AC2 (miniatura+nome+tamanho+remover) coberta. **AC1 não é testada**: nenhum teste clica em "Selecionar imagens" nem asserta `accept`/`multiple`. Todos os testes disparam `fireEvent.change` direto no input (`FeedbackPanel.test.tsx:137-140`), então **apagar o `onClick` do botão ou o `accept`/`multiple` do input não quebraria nenhum teste**. |
| FEED-07 | PASS | `FeedbackPanel.tsx:35,73-76` (teto no `partitionFiles`), `:542` (botão desabilitado em 5); teste `FeedbackPanel.test.tsx:152-159,180-186,235-241` | Lote de 6 → 5 miniaturas + alerta nomeando `img6.png`; o teste unitário de `partitionFiles(4, [...])` prova que as já anexadas contam. |
| FEED-08 | PASS | `FeedbackPanel.tsx:36,69-72`; teste `FeedbackPanel.test.tsx:161-169` | 11 MB recusado pelo nome, 9 MB do mesmo lote entra — asserção nos dois sentidos. |
| FEED-09 | PARTIAL | Impl: `:551` (`role="alert"`), `:360,583` (gating), `:584,601-605` (`role="status"`). Teste: `FeedbackPanel.test.tsx:262-285`, alerta em `:158,168,177,192` | Comportamento 100% correto: desabilitado com título **ou** descrição em branco (whitespace conta como vazio, `:360`), aviso `NOT_IMPLEMENTED` (`:31-32`) num `role="status"`. **Ressalva a11y**: o `role="status"` só é montado no clique (`:601`); região viva inserida junto com o conteúdo não é anunciada de forma confiável por leitor de tela. A spec pede literalmente "exibir em um elemento `role="status"`", então é PASS literal. |
| FEED-10 | PASS | `FeedbackPanel.tsx:350-356` (revoke com `try/catch`), `:361-379` (`isPristine` + `resetForm`), `:383-385` (revoke no desmonte), `:406-412` (revoke no remover), `:592`; teste `FeedbackPanel.test.tsx:198-206,287-338` | Reset cobre categoria, título, descrição, aba, anexos, `rejected` e `notice`. Revoke testado nos três caminhos (remover / limpar / desmontar). **Nota de código**: `attachmentsRef.current = attachments` é mutação de ref durante o render (`:384`) — funciona e está testado, mas é anti-padrão sob React concorrente. |
| FEED-11 | PASS | `FeedbackPanel.tsx:65-68`; teste `FeedbackPanel.test.tsx:171-178` | `type` que não começa com `image/` é recusado nomeando o arquivo, e nenhuma miniatura entra. |
| FEED-12 | PARTIAL | Impl **PASS**: `grep -n "invoke\|fetch\|XMLHttpRequest\|WebSocket\|axios" src/routes/settings/FeedbackPanel.tsx` só acha o comentário em `:334`. Teste: `FeedbackPanel.test.tsx:8-9,353-361` | O espião de `@tauri-apps/api/core` pegaria um `invoke` importado direto, mas **`fetch` não é espiado por teste nenhum** — o painel poderia passar a chamar `fetch` sem quebrar a suíte. O `tasks.md:274` exigia "nenhum `invoke` e nenhum `fetch`... o teste asserta". Metade da asserção falta. O guard do shell (`SettingsShell.test.tsx:774-781`) é mais forte, porque lá o `invokeMock` é realmente usado. |
| FEED-13 | PASS | `FeedbackPanel.tsx:22-25,477-499`; teste `FeedbackPanel.test.tsx:70-119` | `role="tablist"`/`role="tab"`/`aria-selected`/`role="tabpanel"`, "Escrever" ativa na montagem, ida-e-volta preserva o texto (asserção do valor completo em `:102`) e o tabpanel muda de nome acessível. **Ressalva**: sem navegação por setas / roving `tabindex` (APG); as abas são `<button>` no fluxo de Tab com `:focus-visible` (`FeedbackPanel.tsx:157`). Gap já registrado em `STATE.md`. |
| FEED-14 | PASS | `src/lib/markdown.tsx:6-16,31-117`; teste `src/lib/markdown.test.tsx:11-103` | Todo o subconjunto da spec tem teste: heading, `-`/`*`, `1.`, `>`, cerca literal, `**`, `*`, `` ` ``; e sintaxe fora do subconjunto sai literal (`:84-98`). **Nota**: títulos viram `h4`/`h5`, não `h1..h6` correspondentes ao nível (`markdown.tsx:87`) — comportamento herdado de propósito de `SILENT-42` (T1 exigia "idêntico"), com o papel `heading` preservado. |
| FEED-15 | PASS | `FeedbackPanel.tsx:512-516`; teste `FeedbackPanel.test.tsx:105-111` | Descrição vazia (ou só espaços, por causa do `.trim()`) mostra "Nada para visualizar ainda.". |

---

## Edge Cases

| Edge case | Verdict | Evidência | Nota |
| --- | --- | --- | --- |
| Cancelar o diálogo na 2ª vez mantém a lista | PASS | `FeedbackPanel.tsx:391`; teste `FeedbackPanel.test.tsx:218-225` | `picked.length === 0` retorna antes de mexer em `attachments` **e** em `rejected`. |
| Mesmo arquivo duas vezes = duas entradas | PASS | `FeedbackPanel.tsx:44-48,397` (`nextKey`); teste `FeedbackPanel.test.tsx:208-216` | Chave numérica incremental, não nome+tamanho; teste asserta 2 textos e 2 `listitem`. |
| 255 caracteres impede o 256º em vez de truncar | PASS | `FeedbackPanel.tsx:461`; teste `FeedbackPanel.test.tsx:53-59` | `maxLength` nativo. O teste asserta o atributo (jsdom não aplica `maxLength` em `fireEvent.change`) — é a asserção mais forte disponível nessa camada. |
| Lote misto: aceita os válidos e lista todos os recusados numa mensagem | PASS | `FeedbackPanel.tsx:552` (`rejected.join('; ')` num único `<p role="alert">`); teste `FeedbackPanel.test.tsx:161-169` | Uma mensagem só, com todos os nomes. |
| Cerca ``` não fechada renderiza até o fim | PASS | `src/lib/markdown.tsx:64-77`; teste `src/lib/markdown.test.tsx:78-82` | Laço interno chega ao fim do array sem descartar linhas. |
| `URL.revokeObjectURL` ausente não quebra a remoção | PASS | `FeedbackPanel.tsx:350-356`; teste `FeedbackPanel.test.tsx:340-351` | O teste realmente apaga a API (`URL.revokeObjectURL = undefined`) e verifica que a miniatura some — não é tautológico. |

---

## Success Criteria

| Critério | Verdict | Evidência |
| --- | --- | --- |
| Configurações → "Feedback" mostra o formulário do print, sem campo de e-mail | PASS (visual não verificável) | `SettingsShell.test.tsx:763-772`; nenhum campo de e-mail em `FeedbackPanel.tsx` (grep sem ocorrência de `email`). Fidelidade pixel-a-pixel com `print/feadback.png` não é verificável por teste automatizado — fica para o teste manual. |
| `# Título` + "Visualizar" mostra heading; voltar preserva o texto | PASS | `FeedbackPanel.test.tsx:88-103` |
| 6 imagens → 5 na lista + a recusada nomeada | PASS | `FeedbackPanel.test.tsx:152-159` |
| 11 MB recusado pelo nome, 9 MB do mesmo lote entra | PASS | `FeedbackPanel.test.tsx:161-169` |
| "Enviar" só com título e descrição, e o clique diz que não existe envio | PASS | `FeedbackPanel.test.tsx:262-285` |
| `npm run build` e `npm run test` passam, com `SettingsShell` e `UpdateSettings` intactas | PASS | build: `tsc --noEmit` + `vite build` → `✓ built in 3.66s`; testes: **521 passed / 37 files**; `git diff -- src/components/settings/UpdateSettings.test.tsx` vazio; `git diff -- src/routes/settings/SettingsShell.test.tsx` é **puramente aditivo** (+47 linhas, 0 remoções fora do cabeçalho `SPEC:`). |

---

## Gate Results (executados por este Verifier)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Full | `npm run test` | ✅ **37 arquivos, 521 testes, 0 falhas** (18.34s) |
| Feature | `npx vitest run src/lib/markdown.test.tsx src/routes/settings/FeedbackPanel.test.tsx` | ✅ 2 arquivos, **43 testes**, 0 falhas |
| Regressão | `npx vitest run … SettingsShell.test.tsx UpdateSettings.test.tsx` (+ os 2 acima) | ✅ 4 arquivos, **98 testes**, 0 falhas |
| Build | `npm run build` | ✅ `tsc --noEmit` limpo + `vite build` OK (aviso pré-existente de chunk > 500 kB) |
| SILENT-42 | `git diff -- src/components/settings/UpdateSettings.test.tsx` | ✅ **vazio** — nenhuma asserção editada |
| FEED-12 (estático) | `grep -n "invoke\|fetch\|XMLHttpRequest\|WebSocket\|axios" src/routes/settings/FeedbackPanel.tsx` | ✅ só o comentário em `:334` |
| XSS | `grep -rn "dangerouslySetInnerHTML" src/` | ✅ só o comentário em `src/lib/markdown.tsx:24` — nenhum uso em todo o `src/` |

### Marcadores `SPEC:` (`.claude/rules/spec-driven-changes.md`)

| Arquivo | Linha | Verdict |
| --- | --- | --- |
| `src/lib/markdown.tsx` | `:1` — `feedback-form (FEED-14), silent-update (SILENT-42)` | ✅ |
| `src/lib/markdown.test.tsx` | `:1` — idem | ✅ |
| `src/routes/settings/FeedbackPanel.tsx` | `:1` — `feedback-form (FEED-02..FEED-15)` | ✅ |
| `src/routes/settings/FeedbackPanel.test.tsx` | `:1` — idem | ✅ |
| `src/routes/settings/SettingsShell.tsx` | `:2` — `feedback-form (FEED-01)` acrescentado | ✅ |
| `src/routes/settings/SettingsShell.test.tsx` | `:2` — `feedback-form (FEED-01)` acrescentado | ✅ |
| `src/components/settings/UpdateSettings.tsx` | `:1` — só `silent-update`/`update-toast`, sem IDs novos | ✅ conforme `tasks.md:120` (o comportamento não mudou) |

---

## Gaps encontrados

Nenhum bloqueia a entrega; todos são de **cobertura**, não de comportamento.

1. **FEED-06 AC1 sem teste (o gap mais concreto).** Nenhuma asserção cobre o
   clique em "Selecionar imagens" → `input.click()`, nem `accept="image/*"`, nem
   `multiple`. Os testes atacam o input diretamente (`FeedbackPanel.test.tsx:137-140`).
   Remover o `onClick` de `FeedbackPanel.tsx:543` ou o `accept`/`multiple` de
   `:534-535` deixaria a suíte inteira verde com o recurso quebrado.
2. **FEED-12 cobre `invoke` mas não `fetch`.** `tasks.md:274` pedia os dois. Hoje
   só há espião de `@tauri-apps/api/core` (`FeedbackPanel.test.tsx:8-9`); e como o
   painel nem importa esse módulo, a asserção de `:360` é fraca por construção —
   um `fetch` futuro passaria despercebido.
3. **Três asserções tautológicas** (nunca falhariam, seja qual for a
   implementação, porque o renderizador não cria esses elementos em nenhum
   caminho): `src/lib/markdown.test.tsx:87` (`querySelector('table')` nulo),
   `:88` (`querySelector('a')` nulo) e `:96` (`querySelector('input')` nulo). As
   asserções úteis das mesmas provas são as de `textContent` em `:89-90,97`.
4. **Marcador visual de obrigatório não testado, e comentário divergente.**
   `FeedbackPanel.tsx:103-104` afirma "marcado por texto, não só por cor", mas o
   código entrega só um `*` colorido (`:450,471`). Nenhum teste asserta o `*`.
5. **Ressalva de a11y no `role="status"`.** O elemento só nasce no clique
   (`FeedbackPanel.tsx:601`); uma região viva montada junto com o texto tende a não
   ser anunciada. Atende a letra da AC; se o anúncio importar, o conserto é montar
   o `<p role="status">` sempre e alternar só o texto.
6. **Abas sem navegação por setas (APG).** Já registrado como gap aceito em
   `.specs/STATE.md` e não é AC da spec — apenas confirmado aqui como real.
7. **Somente a montagem de janela do shell é testada com Feedback.** A AC fala nas
   duas montagens; `App.tsx:1513` monta o mesmo `SettingsShell`, então o risco é
   baixo, mas não há prova direta pelo overlay.
8. **Nota de código (não é gap de spec).** `FeedbackPanel.tsx:383-384` muta uma ref
   durante o render para o cleanup do desmonte. Funciona e está testado
   (`FeedbackPanel.test.tsx:331-338`), mas é frágil sob render concorrente.

---

# Iteração 2 — Re-verificação dos gaps

**Verifier**: mesmo agente independente, sem ter escrito nenhuma das correções.
**Data**: 2026-08-22
**Escopo**: apenas os 5 gaps corrigidos. O relatório da Iteração 1 acima fica intacto como histórico.

## Veredito

**APROVADO COM RESSALVAS.** Os 5 gaps foram fechados de verdade — nenhuma das
correções é cosmética, e cada teste novo **discrimina** (falharia se a
implementação regredisse). As ressalvas que restam são pequenas e nenhuma
bloqueia: duas propriedades continuam provadas por leitura de código e não por
asserção (a estrela ser `aria-hidden`, o `sr-only` esconder de fato), e o
`restore` do `fetch` não é à prova de exceção.

## Gates re-executados por este Verifier

| Gate | Comando | Resultado observado |
| --- | --- | --- |
| Full | `npm run test` | ✅ **37 arquivos, 524 testes, 0 falhas** (16.52s) — bate exatamente com o número relatado pelo coordenador |
| Build | `npm run build` | ✅ `tsc --noEmit` limpo + `vite build` → `✓ built in 3.56s` (só o aviso pré-existente de chunk > 500 kB) |
| SILENT-42 | `git diff -- src/components/settings/UpdateSettings.test.tsx | wc -l` | ✅ **0 linhas** — o arquivo segue intocado |

Delta de testes coerente com as mudanças: 521 → 524 (+1 FEED-06 AC1, +1
obrigatório, +1 líquido no `markdown.test.tsx`, que trocou 2 provas por 3).

## Item a item

### 1. FEED-06 AC1 sem teste — ✅ FECHADO

Teste: `src/routes/settings/FeedbackPanel.test.tsx:151-167`. Impl: `src/routes/settings/FeedbackPanel.tsx:542-559`.

**O teste falharia se `onClick={() => fileInputRef.current?.click()}` (`FeedbackPanel.tsx:555`) fosse apagado.**
Prova por estrutura do DOM: o `<input>` (`:542-551`) e o `<button>` (`:552-559`) são
**irmãos** dentro do mesmo `<div className="feedback-panel__field">`. Evento de
clique só percorre a cadeia de **ancestrais** do alvo (captura desce, bolha
sobe) — um irmão nunca está nesse caminho. Não há `<label>` envolvendo o botão
nem associado ao input (o input usa `aria-labelledby` apontando para um `<span>`,
`:549`, e ARIA nunca encaminha ativação). Logo o listener registrado em `:162` só
pode disparar via a chamada explícita de `.click()`; o jsdom implementa
`HTMLElement.prototype.click()` despachando o evento (não abre seletor de
arquivos, mas despacha). Sem o `onClick`, `opened` receberia 0 chamadas e
`toHaveBeenCalledTimes(1)` (`:166`) quebraria.

As asserções de atributo (`:155-157`) lêem as propriedades IDL: apagar `accept`
devolveria `''`, apagar `multiple` devolveria `false`. Também discriminam.

### 2. FEED-12 cobria `invoke`, não `fetch` — ✅ FECHADO, com 1 ressalva

`FeedbackPanel.test.tsx:379-393` — spy em `:380-382`, asserção em `:391`, restore em `:392`.

O spy é instalado **antes** do `render` (`:384`), então cobre efeito de montagem,
clique em Enviar e clique em Limpar. A asserção discrimina: um `fetch` futuro no
painel quebraria a suíte.

**Ressalva**: `globalThis.fetch = originalFetch` (`:392`) está no corpo do teste,
**não** em `finally` nem em `afterEach` — se `expect(invokeMock)…` (`:391`) ou
qualquer asserção anterior lançar, o restore não roda e o spy vaza. O impacto
hoje é nulo, porque este é o **último teste do arquivo** (394 linhas ao todo) e o
vitest isola o ambiente por arquivo (`vite.config.ts`: `environment: 'jsdom'`,
isolamento padrão). Vira problema no dia em que alguém acrescentar um teste
depois dele. `vi.stubGlobal` + `unstubAllGlobals` seria a forma à prova de exceção.

### 3. Três asserções tautológicas no markdown — ✅ FECHADO

`src/lib/markdown.test.tsx:86-105`. Os únicos `toBeNull()` que sobraram são `:74-75`.

As três provas novas são **estritamente mais fortes** que as removidas, não
apenas diferentes:

- **Tabela** (`:86-92`): asserta `toHaveLength(2)` parágrafos + os pipes no texto.
  Se o renderizador passasse a montar `<table>`, `querySelectorAll('p')` daria 0 e
  a prova falharia.
- **Link** (`:94-98`): **igualdade exata** de `textContent`. Uma `<a>` real deixaria
  o texto como `veja texto aqui`, quebrando o `toBe`. O `?.` não abre
  falso-positivo: `undefined.toBe(string)` falha.
- **Lista de tarefas** (`:100-105`): compara o array exato `['[ ] pendente', '[x] feito']`.
  Um `<input type=checkbox>` injetado não contribui para `textContent`, então o
  array viraria `['pendente','feito']` e falharia.

Nenhuma das três pode passar por vacuidade. Os `toBeNull()` remanescentes
(`:74-75`, dentro da prova da cerca) continuam sendo os **significativos**:
falhariam se o conteúdo da cerca fosse interpretado como Markdown.

### 4. Obrigatório só por `*` colorido, sem teste — ✅ FECHADO, com 2 ressalvas

Impl: `FeedbackPanel.tsx:462` (Título) e `:483` (Descrição); CSS `:107-117`.
Teste: `FeedbackPanel.test.tsx:61-67`.

**CSS confere**: `.feedback-panel__sr-only` usa o padrão clip-rect canônico —
`position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; margin:-1px`
(`:107-117`). Não usa `display:none` nem `visibility:hidden`, então some da tela
**e permanece na árvore de acessibilidade**. Correto.

**Marcador nos campos certos**: `grep` por `obrigatório` no `.tsx` acha exatamente
duas ocorrências de marcação — `:462` (Título) e `:483` (Descrição). "Categoria"
(`:442`) e "Anexos" (`:534`) **não** têm o marcador, coerente com serem
opcionais. Ambos os campos marcados também carregam o atributo `required`, e o
teste (`:66-67`) encadeia `toBeRequired()` na busca por nome acessível, ligando
as duas coisas.

**Ressalva (a)**: o teste passaria mesmo sem o `aria-hidden="true"` na estrela — o
nome acessível viraria `Título * (obrigatório) …` e o regex
`/Título.*\(obrigatório\)/` continuaria casando. O `aria-hidden` está lá
(`:462,483`), mas quem prova isso é a leitura, não a suíte.

**Ressalva (b)**: o jsdom não aplica o CSS do `<style>` ao computar
`getByLabelText`, então a suíte passaria mesmo se o `sr-only` virasse
`display:none`. O esconder-visual-sem-sumir-da-a11y foi verificado por mim lendo
o CSS, não por asserção.

### 5. `role="status"` só montado no clique — ✅ FECHADO

Impl: `FeedbackPanel.tsx:611-617` — o `<p role="status">` está **fora de qualquer
condicional**, com `{notice}` como único filho. Teste: `FeedbackPanel.test.tsx:329`.

A região viva existe **desde o primeiro render**: não há mais
`{notice !== null && …}` em volta dela (comparar com a Iteração 1, onde a
condicional ficava em `:601`). Com `notice === null` (`:356`), React não emite nó
nenhum e o elemento fica vazio — daí `toBeEmptyDOMElement()` (`:329`) passar.

A asserção **discrimina**: na implementação antiga, depois de "Limpar" o elemento
seria desmontado e `screen.getByRole('status')` lançaria antes de chegar à
asserção. `FeedbackPanel.test.tsx:310` segue provando que o texto certo aparece
no clique.

**Ressalva mínima**: nenhum teste asserta a presença do `role="status"` no
primeiro render *antes* de qualquer interação; a prova vem do estado
pós-"Limpar", que é equivalente em termos de discriminação.

### 6. Setas/roving tabindex nas abas; só a montagem de janela do shell — ⏭️ GAP ACEITO

`FeedbackPanel.tsx:488-502`; registrado em `.specs/STATE.md`; `src/App.tsx:1513`
monta o mesmo `SettingsShell`. Carregado adiante como gap aceito, sem
re-litígio. Não é AC da spec.

## Ressalvas remanescentes (nenhuma bloqueia)

1. `FeedbackPanel.test.tsx:392` — restore do `fetch` fora de `finally`/`afterEach`.
   Inofensivo hoje (último teste do arquivo, isolamento por arquivo do vitest);
   vira vazamento se alguém acrescentar um teste depois dele.
2. `aria-hidden="true"` na estrela (`FeedbackPanel.tsx:462,483`) não é coberto por
   asserção — verificado por leitura.
3. O esconder-visual do `.feedback-panel__sr-only` não é (nem pode ser, no jsdom)
   coberto por asserção — verificado por leitura do CSS em `FeedbackPanel.tsx:107-117`.
4. Nenhuma asserção do `role="status"` no primeiro render antes de interação; a
   prova pós-"Limpar" cobre o mesmo risco.
5. Gap 6 segue aceito, inalterado.

## Veredito final

**APROVADO COM RESSALVAS** — os 15 requisitos FEED-01..FEED-15 estão
implementados e cobertos por testes que discriminam; `SILENT-42` preservado
(diff vazio); build e suíte completa verdes (37 arquivos / 524 testes). As 5
ressalvas acima são de robustez de teste e de documentação, não de comportamento
do produto.
