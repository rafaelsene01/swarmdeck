# github-integration

**Prefix**: `CFG` · **Status**: draft · **Opened**: 2026-08-22

## Problem Statement

O repositório `rafaelsene01/swarmdeck` vai virar privado. Hoje o app consulta o
manifesto de atualização com um GET anônimo em
`https://github.com/rafaelsene01/swarmdeck/releases/latest/download/latest.json`
(`src-tauri/src/update/manifest.rs:84`) e baixa o artefato com `reqwest::get`
sem header nenhum (`src-tauri/src/update/apply.rs:223`) — as duas chamadas
passam a devolver 404 no minuto em que o repo fechar. Ao mesmo tempo, o
formulário de feedback está pronto na tela mas o botão só escreve um aviso de
"não implementado" em estado do React (`FeedbackPanel.tsx:592`, AD-031), porque
a fase 1 deixou o destino do envio em aberto.

As duas pontas precisam da mesma coisa: uma credencial do GitHub disponível ao
processo Rust. Esta feature põe essa credencial na configuração do projeto e a
usa nos dois caminhos — autenticar a busca/download de release e criar a issue
de feedback.

## Goals

- [ ] Consulta de versão e download de artefato continuam funcionando com o repositório privado.
- [ ] "Enviar feedback" cria uma issue real, com a categoria como tag no título e as imagens anexadas renderizando no corpo.
- [ ] O PAT nunca entra no git nem cruza a fronteira IPC para o webview.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Atualização automática em Linux e macOS | O ramo `#[cfg(not(windows))]` delega ao `tauri-plugin-updater`, que exige uma URL servindo o manifesto — repositório privado não tem uma. Portar a troca de arquivo para AppImage é feature nova. Coberto por CFG-14. |
| Reescrever `latest.json` na CI | A resolução de asset por nome (CFG-09) dispensa o passo. `patch-latest-json.mjs` continua como está. |
| Dois tokens separados por menor privilégio | O usuário pediu um PAT para os dois usos. Registrado como assunção. |
| Renovação ou rotação automática do PAT | PAT fine-grained expira em no máximo 1 ano; o app só reporta (CFG-12), não renova. |
| Compressão, corte ou redimensionamento de imagem | Fora de escopo desde a fase 1 do `feedback-form`. |
| Campo de e-mail ou identificação do autor no feedback | Fora de escopo desde a fase 1 do `feedback-form`. |
| Escolher label, milestone ou assignee da issue | A tag no título já resolve a triagem pedida. |
| Persistir rascunho do feedback entre sessões | Fora de escopo desde a fase 1 do `feedback-form`. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde o PAT mora | `.env` na raiz, lido por `src-tauri/build.rs`, exposto como `env!("SWARMDECK_GITHUB_PAT")` | `.claude/rules/rust/security.md:9` proíbe hardcode de token em fonte. Build-time atende "na config do projeto" sem pôr o valor no git. | n |
| Quem faz o POST da issue | Rust, comando `feedback_submit` | AD-001 já decidiu que credencial não cruza a fronteira IPC; não há `tauri-plugin-http` instalado, e PAT em bundle JS é legível no devtools. | n |
| Como os bytes da imagem chegam ao Rust | `File.arrayBuffer()` → `Uint8Array` → `invoke` | AD-030 previu esse contrato; `ScreenshotModal.tsx:48` já é o precedente no repo. | n |
| Como as imagens aparecem na issue | `POST uploads.github.com/user-attachments/assets` e `![nome](url)` no corpo | Único mecanismo verificado que renderiza inline em repo privado. Testado em 22/08/2026 com o PAT fine-grained: HTTP 201, e a URL devolvida dá 404 sem auth. Endpoint é não documentado — CFG-18 é o fallback. | n |
| Tag da categoria no título | `id.toUpperCase()`: `GENERAL`, `BUG`, `FEATURE`, `IMPROVEMENT` | Os ids já são inglês estável por design (`FeedbackPanel.tsx:7`). Dispensa tabela de mapeamento nova. | n |
| Forma do preview do título | Prefixo como adorno estático dentro da moldura do campo | Um elemento só, sem segundo nó para dessincronizar do input. | n |
| Teto do contador de título | `255 - prefixo.length`, contador contra o teto ajustado | Título de issue no GitHub trava em 256 caracteres; sem o ajuste a API rejeita. | n |
| Auto-update em Linux/macOS | Regressa: check e notas seguem, "Baixar" devolve erro nomeado | Todo o trabalho de update silencioso é Windows (SILENT-05/06/07/18/20/31/39); o ramo não-Windows sempre foi fallback. | n |
| Rodapé de diagnóstico na issue | Acrescenta versão do app e SO ao fim do corpo | Não foi pedido, mas relato de bug sem versão é inútil e não há como perguntar ao autor depois — não há identificação. | n |
| Um token para os dois usos | Um PAT fine-grained com `Metadata: Read`, `Contents: Read`, `Issues: Read and write` | Pedido do usuário. Escopo mínimo é a mitigação; o token é extraível do binário com `strings`. | n |
| Numeração das ADs novas | A partir de AD-046 em `.specs/project/STATE.md` | Há dois `STATE.md` com numeração colidindo; o de `project/` é o mais avançado (chega a AD-045). Consertar a colisão não entra neste escopo. | n |

**Open questions:** none — tudo resolvido ou registrado na tabela acima.

---

## User Stories

### P1: PAT na configuração do projeto ⭐ MVP

**User Story**: Como mantenedor, quero o PAT do GitHub na configuração do projeto, para que o app autentique nas duas pontas sem eu colar credencial em código versionado.

**Why P1**: Sem isso nada mais desta spec funciona.

**Acceptance Criteria**:
1. The system SHALL ler o PAT da variável `SWARMDECK_GITHUB_PAT`, injetada em tempo de compilação por `src-tauri/build.rs` a partir do `.env` da raiz ou do ambiente do processo de build.
2. The system SHALL manter `.env` e `.env.*` fora do versionamento, exceto `.env.example`.
3. IF `SWARMDECK_GITHUB_PAT` está ausente na compilação THEN o build SHALL concluir sem erro e o binário SHALL tratar toda operação dependente do PAT como não configurada, sem panic.
4. The system SHALL NOT devolver o PAT em nenhum comando Tauri, e o tipo que o carrega SHALL NOT implementar `Serialize`.
5. The system SHALL redigir o PAT em toda saída de `Debug` e em toda mensagem de erro.
6. WHEN o `.env` da raiz muda THEN o cargo SHALL recompilar `src-tauri`.

**Independent Test**: compilar com e sem `.env`; nos dois casos o binário sobe. `cargo test` prova que `Debug` do token não contém o valor.

---

### P1: Consulta e download de release autenticados ⭐ MVP

**User Story**: Como usuário do app, quero que a verificação de nova versão continue funcionando depois que o repositório virar privado, para não ficar preso numa versão antiga sem saber.

**Why P1**: É a regressão que a privatização causa; sem isso o updater morre em silêncio.

**Acceptance Criteria**:
1. The system SHALL consultar a release mais recente em `https://api.github.com/repos/{owner}/{repo}/releases/latest`, com `Authorization: Bearer <PAT>` e `User-Agent: swarmdeck/<versão>`.
2. WHEN a resposta da release chega THEN o sistema SHALL localizar o asset chamado `latest.json` e SHALL baixá-lo pela URL de API daquele asset, com `Accept: application/octet-stream`.
3. The system SHALL trocar a URL de cada entrada de plataforma do manifesto pela URL de API do asset cujo nome é igual ao último segmento da URL original.
4. IF o manifesto aponta para um arquivo que não está entre os assets da release THEN o sistema SHALL tratar aquela entrada de plataforma como ausente.
5. WHEN o artefato é baixado THEN o sistema SHALL enviar `Authorization` e `Accept: application/octet-stream`, e SHALL NOT reenviar `Authorization` no redirecionamento para outro host.
6. IF a API responde 401 ou 403 THEN o sistema SHALL reportar um erro de autenticação distinto de falha de rede, nomeando o token de acesso.
7. WHERE a plataforma não é Windows, WHEN o usuário aciona "Baixar e atualizar" THEN o sistema SHALL informar que a atualização automática não está disponível nesta plataforma e SHALL NOT baixar nada.
8. The system SHALL manter a verificação de assinatura minisign contra `plugins.updater.pubkey` inalterada, antes de qualquer escrita em disco.

**Independent Test**: privar o repo, abrir Configurações › Atualizações, ver versão instalada e mais recente; invalidar o PAT e ver a mensagem de token, não "falha de rede".

---

### P1: Feedback vira issue no GitHub ⭐ MVP

**User Story**: Como usuário, quero que "Enviar feedback" crie a issue de verdade, para que meu relato chegue ao mantenedor com o texto e as imagens que anexei.

**Why P1**: É o pedido central; hoje o botão não faz nada (AD-031).

**Acceptance Criteria**:
1. WHEN o usuário aciona "Enviar feedback" com título e descrição preenchidos THEN o sistema SHALL criar uma issue via `POST /repos/{owner}/{repo}/issues`.
2. The system SHALL compor o título como `[<CATEGORIA>] - <título digitado>`, onde `<CATEGORIA>` é o id da categoria em maiúsculas.
3. The system SHALL compor o corpo como a descrição digitada, seguida das imagens anexadas, nessa ordem.
4. WHEN há ao menos uma imagem anexada THEN o sistema SHALL subir cada uma para `https://uploads.github.com/user-attachments/assets` com `name`, `content_type` e `repository_id` na query e os bytes no corpo, e SHALL embutir a URL devolvida como `![<nome>](<url>)` no fim do corpo.
5. The system SHALL preservar a ordem em que o usuário anexou as imagens.
6. IF o upload de uma imagem falha THEN o sistema SHALL criar a issue mesmo assim e SHALL escrever no corpo uma linha nomeando o arquivo que não subiu.
7. IF a criação da issue falha THEN o sistema SHALL exibir o erro, SHALL preservar o texto digitado e os anexos, e SHALL NOT limpar o formulário.
8. WHEN a issue é criada THEN o sistema SHALL exibir confirmação com o link da issue e SHALL limpar o formulário.
9. WHILE um envio está em andamento o sistema SHALL desabilitar "Enviar feedback" e "Limpar", e SHALL NOT iniciar um segundo envio.
10. The system SHALL enviar ao Rust apenas categoria, título, descrição e, por imagem, nome, tipo MIME e bytes.

**Independent Test**: preencher o formulário com duas imagens, enviar, abrir o link devolvido e ver título com a tag e corpo com texto seguido das duas imagens renderizadas.

---

### P1: Preview do título final no campo ⭐ MVP

**User Story**: Como usuário, quero ver o título final enquanto digito, para saber exatamente como o relato vai aparecer na lista de issues.

**Why P1**: Foi pedido junto com a categoria; sem o preview a tag é invisível até a issue existir.

**Acceptance Criteria**:
1. WHILE o formulário está montado o sistema SHALL exibir, à esquerda do campo de título e dentro da mesma moldura, o prefixo `[<CATEGORIA>] - ` da categoria selecionada.
2. WHEN o usuário troca a categoria THEN o sistema SHALL atualizar o prefixo exibido sem alterar o texto já digitado.
3. The system SHALL limitar o texto digitado a `255` menos o comprimento do prefixo, e SHALL exibir o contador contra esse teto.
4. The system SHALL NOT permitir que o usuário edite ou apague o prefixo.

**Independent Test**: trocar a categoria com o campo preenchido e ver o prefixo mudar, o texto permanecer e o teto do contador acompanhar.

---

### P2: Rodapé de diagnóstico na issue

**User Story**: Como mantenedor, quero saber a versão do app e o SO de quem relatou, para reproduzir o problema sem poder perguntar ao autor.

**Why P2**: Não foi pedido, mas o relato é anônimo — a informação não pode ser obtida depois.

**Acceptance Criteria**:
1. The system SHALL acrescentar ao fim do corpo, depois das imagens, uma linha com a versão do app e o sistema operacional.

**Independent Test**: abrir a issue criada e ler a última linha do corpo.

---

## Edge Cases

- IF o PAT não foi injetado na compilação THEN o sistema SHALL desabilitar "Enviar feedback" e SHALL exibir que o envio não está configurado nesta build.
- IF a API responde 429, ou 403 com cabeçalho de limite de taxa esgotado, THEN o sistema SHALL exibir mensagem de limite atingido, distinta de falha de rede.
- IF o corpo montado passa de 65536 caracteres THEN o sistema SHALL truncar a descrição, SHALL preservar todas as imagens e SHALL marcar o ponto do corte.
- IF a consulta ao manifesto falha por rede THEN o sistema SHALL manter o comportamento de SILENT-25, exibindo a versão instalada e a falha de consulta.
- WHEN o usuário envia feedback sem nenhuma imagem THEN o sistema SHALL criar a issue com o corpo terminando na descrição, sem seção de anexos vazia.

---

## Requirement Traceability

| Requirement ID | Story | Critério de origem | Phase | Status |
| --- | --- | --- | --- | --- |
| CFG-01 | P1: PAT na configuração | P1 PAT, AC 1 | Tasks | Pending |
| CFG-02 | P1: PAT na configuração | P1 PAT, AC 2 | Tasks | Pending |
| CFG-03 | P1: PAT na configuração | P1 PAT, AC 3 | Tasks | Pending |
| CFG-04 | P1: PAT na configuração | P1 PAT, AC 4 | Tasks | Pending |
| CFG-05 | P1: PAT na configuração | P1 PAT, AC 5 | Tasks | Pending |
| CFG-06 | P1: PAT na configuração | P1 PAT, AC 6 | Tasks | Pending |
| CFG-07 | P1: Release autenticada | P1 Release autenticada, AC 1 | Tasks | Pending |
| CFG-08 | P1: Release autenticada | P1 Release autenticada, AC 2 | Tasks | Pending |
| CFG-09 | P1: Release autenticada | P1 Release autenticada, AC 3 | Tasks | Pending |
| CFG-10 | P1: Release autenticada | P1 Release autenticada, AC 4 | Tasks | Pending |
| CFG-11 | P1: Release autenticada | P1 Release autenticada, AC 5 | Tasks | Pending |
| CFG-12 | P1: Release autenticada | P1 Release autenticada, AC 6 | Tasks | Pending |
| CFG-13 | P1: Release autenticada | P1 Release autenticada, AC 7 | Tasks | Pending |
| CFG-14 | P1: Release autenticada | P1 Release autenticada, AC 8 | Tasks | Pending |
| CFG-15 | P1: Feedback vira issue | P1 Feedback vira issue, AC 1 | Tasks | Pending |
| CFG-16 | P1: Feedback vira issue | P1 Feedback vira issue, AC 2 | Tasks | Pending |
| CFG-17 | P1: Feedback vira issue | P1 Feedback vira issue, AC 3 | Tasks | Pending |
| CFG-18 | P1: Feedback vira issue | P1 Feedback vira issue, AC 4 | Tasks | Pending |
| CFG-19 | P1: Feedback vira issue | P1 Feedback vira issue, AC 5 | Tasks | Pending |
| CFG-20 | P1: Feedback vira issue | P1 Feedback vira issue, AC 6 | Tasks | Pending |
| CFG-21 | P1: Feedback vira issue | P1 Feedback vira issue, AC 7 | Tasks | Pending |
| CFG-22 | P1: Feedback vira issue | P1 Feedback vira issue, AC 8 | Tasks | Pending |
| CFG-23 | P1: Feedback vira issue | P1 Feedback vira issue, AC 9 | Tasks | Pending |
| CFG-24 | P1: Feedback vira issue | P1 Feedback vira issue, AC 10 | Tasks | Pending |
| CFG-25 | P1: Preview do título | P1 Preview do título, AC 1 | Tasks | Pending |
| CFG-26 | P1: Preview do título | P1 Preview do título, AC 2 | Tasks | Pending |
| CFG-27 | P1: Preview do título | P1 Preview do título, AC 3 | Tasks | Pending |
| CFG-28 | P1: Preview do título | P1 Preview do título, AC 4 | Tasks | Pending |
| CFG-29 | P2: Rodapé de diagnóstico | P2 Rodapé, AC 1 | Tasks | Pending |
| CFG-30 | Edge cases | Edge case 1 | Tasks | Pending |
| CFG-31 | Edge cases | Edge case 2 | Tasks | Pending |
| CFG-32 | Edge cases | Edge case 3 | Tasks | Pending |
| CFG-33 | Edge cases | Edge case 4 | Tasks | Pending |
| CFG-34 | Edge cases | Edge case 5 | Tasks | Pending |

**Coverage:** 34 total, 34 mapeados para tasks, 0 sem mapeamento.

## Specs afetadas

**`feedback-form` — FEED-12 revogado.** FEED-12 diz "The system SHALL não emitir
nenhuma chamada `invoke` nem nenhuma requisição de rede a partir desta tela"
(`feedback-form/spec.md:156`). CFG-15 é exatamente essa chamada. A revogação é
registrada em AD-047; AD-031 ("o envio mostra que não foi implementado") fica
superada pela mesma AD. O teste `FeedbackPanel.test.tsx:387-400`, que assere
`invokeMock` e `fetchSpy` nunca chamados, inverte de sentido.

**`silent-update` — continua valendo, com uma exceção.** SILENT-01 (um único
caminho HTTP para o manifesto) e SILENT-04 (assinatura verificada antes de
escrever) seguem intactos: CFG-07/08 trocam o transporte, não a estrutura. A
exceção é o ramo não-Windows de SILENT-08 ("SHALL aplicá-la via
`tauri-plugin-updater`"), que CFG-14 restringe a repositório público. Prova de
que o resto segue valendo: os testes de `update/` continuam verdes, e o teste
de reescrita de URL (CFG-09) é novo.

---

## Success Criteria

- [ ] Com o repositório privado, Configurações › Atualizações mostra versão instalada e mais recente.
- [ ] Uma issue criada pelo formulário abre no GitHub com título `[BUG] - ...` e o corpo com o texto seguido das imagens renderizadas.
- [ ] `grep -r "github_pat_" .` não acha nada em arquivo versionado.
- [ ] `npm test` e `cargo test` verdes, sem teste removido.
