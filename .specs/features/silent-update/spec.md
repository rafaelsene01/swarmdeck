# Silent Update Specification

> ## ⚠️ Revogação da revogação — 16/08/2026, à tarde (SILENT-37..41, AD-009)
>
> **SILENT-36 (AD-008) foi revogado e a troca de executável no lugar voltou
> ao produto.** Motivo: o `install_inner` do `tauri-plugin-updater` termina
> em `std::process::exit(0)` no Windows, e o instalador NSIS mata o app para
> poder substituir o `.exe` — o app fechava e reabria sozinho, derrubando os
> terminais abertos. Ver AD-009 em `.specs/project/STATE.md`.
>
> Voltam a valer: SILENT-05, SILENT-06, SILENT-18, SILENT-19, SILENT-20,
> SILENT-23 e SILENT-24, além da chave de manifesto `windows-x86_64-silent`
> e do `.exe` cru assinado no `release.yml`.
>
> Muda em relação ao texto original: a atualização confirmada agora tem
> **dois passos** — baixar (com barra de progresso) e instalar —, a
> instalação **nunca reinicia o app**, e a seção não mostra mais a linha
> "Modo". Ver "Requisitos novos de 16/08/2026" no fim do documento.

## Problem Statement

Hoje o SwarmDeck baixa atualizações sozinho em segundo plano e, no fechamento da janela principal, chama `Update::install` do `tauri-plugin-updater` — que no Windows executa o instalador NSIS em modo `passive`, abrindo uma janela de instalador que o usuário não pediu e não controla. O usuário quer o inverso: nada é baixado sem confirmação, e a aplicação da atualização é uma troca de arquivo na própria pasta do app, sem instalador nenhum, de modo que a próxima abertura já rode a versão nova. Além disso, a seção de Configurações não mostra qual é a versão mais recente publicada — só a instalada —, então não há como saber se vale atualizar sem clicar em "Verificar agora".

## Goals

- [ ] Nenhum byte de atualização é baixado antes de o usuário confirmar.
- [ ] A atualização confirmada é aplicada trocando o executável na pasta do app, sem executar instalador NSIS ou MSI, e vale na próxima abertura do app.
- [ ] Configurações › Atualizações mostra, lado a lado, a versão instalada e a mais recente publicada — inclusive quando são iguais.
- [ ] O registro de desinstalação do Windows deixa de mentir sobre a versão depois da troca.

## Out of Scope

Explicitamente excluído. Documentado para impedir scope creep.

| Feature | Reason |
| ------- | ------ |
| Extração de zip / payload com mais de um arquivo | A pasta instalada contém apenas `SwarmDeck.exe` e `uninstall.exe`, e `tauri.conf.json` não declara `bundle.resources`. Entra quando o payload deixar de ser um executável único. |
| ~~Barra de progresso do download~~ | **Entrou em 16/08/2026 (SILENT-37)** — pedido explícito do usuário: ele quer ver o download acontecendo. |
| Troca de arquivo no Linux (deb/AppImage) | `deb` é gerenciado por dpkg; sobrescrever arquivo por fora quebra a integridade do pacote e um `apt reinstall` desfaz o update em silêncio. Linux permanece no `tauri-plugin-updater`. |
| Update diferencial / delta | Baixar 14 MB inteiros é aceitável para a cadência de release deste projeto. |
| Rollback automático após uma versão nova ruim | `<nome>.exe.old` só existe entre a troca e o boot seguinte. Reverter é reinstalar. |
| Reescrever a spec `release-distribution` | A pasta `.specs/features/release-distribution/` não existe no disco (`.specs` está no `.gitignore`). A revogação dos requisitos REL fica registrada aqui e em `STATE.md`. |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui — nada fica implícito.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| O flavor instalado (NSIS) também recebe a troca de arquivo, não só o portátil | Sim, os dois flavors | A instalação real do usuário é NSIS em `%LOCALAPPDATA%\SwarmDeck` (verificado no disco), pasta gravável sem admin. Restringir a troca ao portátil deixaria a demanda sem efeito para quem pediu. O conselho de revisão votou 3-0 em "só portátil", pela única objeção concreta de `DisplayVersion` obsoleta no registro — objeção neutralizada por SILENT-18. | n |
| Payload da atualização é o `SwarmDeck.exe` cru, publicado como asset assinado próprio | Asset novo + chave de manifesto `windows-x86_64-silent` | `swap::apply_swap` já recebe `&[u8]` e verifica minisign; a alternativa (reusar o zip portátil) exigiria uma crate de zip nova para um payload de um arquivo só. | n |
| Escrita de `DisplayVersion` no registro | `reg add` via `std::process::Command` | Evita a crate `winreg`; `HKCU` não exige admin. Se `reg.exe` falhar, SILENT-19 mantém a atualização válida. | n |
| Reinício após a troca | Oferecido, nunca forçado | O rename já garante que a próxima abertura roda a versão nova — que é literalmente o que foi pedido. Forçar reinício mataria terminais PTY vivos. | n |
| Checagem em segundo plano continua existindo | Sim, mas sem baixar nada | Preserva a bolinha de aviso (`update://available`) e dá sentido ao toggle "verificar automaticamente" já persistido no banco. | n |
| Comando `update_check` atual | Removido, dobrado em `update_status` | Único chamador é `SettingsShell.tsx`, e `update_status` devolve um superconjunto do que ele devolvia. | n |

**Open questions:** none — tudo resolvido ou registrado acima.

---

## User Stories

### P1: Atualizar sem instalador, mediante confirmação ⭐ MVP

**User Story**: Como usuário do SwarmDeck, quero confirmar a atualização e ver o app se atualizar sozinho trocando os arquivos na pasta, para nunca mais passar por uma janela de instalador.

**Why P1**: É a demanda inteira. Sem isso a feature não existe.

**Acceptance Criteria**:

1. O sistema SHALL ler o manifesto de atualização (`latest.json`) do endpoint configurado em `tauri.conf.json` por um único caminho HTTP, usado tanto pela exibição de versão quanto pela decisão de atualizar.
2. WHEN o usuário confirma "Baixar e atualizar" THEN o sistema SHALL baixar o artefato apontado pela entrada de manifesto correspondente à plataforma atual.
3. WHILE o usuário não confirmou, o sistema SHALL NOT baixar nenhum artefato de atualização.
4. O sistema SHALL verificar a assinatura minisign dos bytes baixados completos contra o `pubkey` de `tauri.conf.json` antes de escrever qualquer arquivo.
5. WHEN a assinatura confere THEN o sistema SHALL renomear o executável em execução para `<nome>.exe.old` e escrever os bytes baixados no caminho original do executável.
6. O sistema SHALL NOT executar instalador NSIS ou MSI em nenhum ponto do fluxo de atualização confirmado no Windows.
7. WHEN o app inicia THEN o sistema SHALL apagar um `<nome>.exe.old` remanescente, se existir.
8. WHERE a plataforma não é Windows, WHEN o usuário confirma a atualização THEN o sistema SHALL aplicá-la via `tauri-plugin-updater` e SHALL NOT executar a troca de arquivo.

**Independent Test**: Publicar a versão N+1, abrir o app na versão N, confirmar a atualização no painel e verificar que `SwarmDeck.exe` mudou de conteúdo, que nenhum instalador abriu, e que a abertura seguinte reporta N+1.

---

### P1: Ver versão instalada e versão mais recente ⭐ MVP

**User Story**: Como usuário, quero ver na janela de Configurações qual versão eu tenho e qual é a mais recente publicada, para decidir se quero atualizar.

**Why P1**: Sem o número da versão remota, "confirmar a atualização" é uma decisão às cegas.

**Acceptance Criteria**:

1. WHEN o usuário abre Configurações › Atualizações THEN o sistema SHALL exibir a versão instalada e a versão mais recente publicada, mesmo quando as duas são iguais.
2. WHILE a versão instalada é maior ou igual à mais recente, o sistema SHALL exibir "Você já está na versão mais recente" e SHALL NOT exibir a ação "Baixar e atualizar".
3. WHEN a versão mais recente é maior que a instalada THEN o sistema SHALL exibir a ação "Baixar e atualizar" junto do número da versão nova.
4. WHEN a troca de arquivo termina com sucesso THEN o sistema SHALL exibir "Atualizado para <versão>. Reinicie para concluir." e uma ação "Reiniciar agora".
5. WHEN o usuário aciona "Reiniciar agora" THEN o sistema SHALL reiniciar o processo do app.

**Independent Test**: Abrir Configurações › Atualizações com o app já na versão mais recente e ver os dois números iguais, sem botão de atualizar.

---

### P2: Aposentar o download automático e a instalação no fechamento

**User Story**: Como usuário, não quero que o app baixe nem instale nada por conta própria, para que atualizar seja sempre uma escolha minha.

**Why P2**: É consequência direta do P1, mas é remoção de comportamento existente e testado — separável e demonstrável sozinha.

**Acceptance Criteria**:

1. O sistema SHALL NOT baixar atualização em segundo plano nem instalar atualização no fechamento da janela principal.
2. WHILE a verificação automática está ligada, o sistema SHALL consultar o manifesto uma vez no boot e a cada 60 minutos, sem baixar artefato.
3. WHEN uma consulta em segundo plano encontra versão maior e não pulada THEN o sistema SHALL emitir `update://available` para acender a bolinha no ícone de Configurações.
4. WHILE a verificação automática está desligada, o sistema SHALL NOT consultar o manifesto em segundo plano, e a exibição de versão em Configurações SHALL continuar funcionando.

**Independent Test**: Deixar o app aberto com uma versão nova publicada e verificar que nenhum arquivo é baixado e que fechar a janela não abre instalador.

---

### P2: Registro de desinstalação coerente com o binário trocado

**User Story**: Como usuário, quero que "Aplicativos e Recursos" do Windows mostre a versão que está realmente instalada depois da troca.

**Why P2**: É a única objeção concreta contra aplicar a troca ao flavor instalado. Sem isso, o Painel de Controle mente para sempre.

**Acceptance Criteria**:

1. WHERE o app roda no flavor instalado no Windows, WHEN a troca de arquivo termina com sucesso THEN o sistema SHALL gravar a nova versão em `DisplayVersion` na chave `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SwarmDeck`.
2. IF a gravação no registro falha THEN o sistema SHALL registrar o erro em log e ainda assim reportar a atualização como aplicada.

**Independent Test**: Depois de uma troca bem-sucedida, `reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SwarmDeck" /v DisplayVersion` devolve a versão nova.

---

### P2: Publicar o artefato que a troca consome

**User Story**: Como mantenedor, quero que cada release publique o executável cru assinado e o registre no manifesto, para que a atualização silenciosa tenha o que baixar.

**Why P2**: Sem o asset, todo o P1 falha em produção — mas é trabalho de pipeline, verificável separadamente do app.

**Acceptance Criteria**:

1. WHEN uma release é publicada THEN o manifesto `latest.json` SHALL conter a entrada `windows-x86_64-silent` apontando para um asset `SwarmDeck.exe` cru daquela release, com a assinatura minisign correspondente.
2. IF o manifesto não tem entrada para a chave de plataforma atual THEN o sistema SHALL informar "atualização não disponível para esta instalação" e SHALL NOT baixar nada.

**Independent Test**: `node --test scripts/patch-latest-json.test.mjs` passa, e o `latest.json` de uma release de teste contém a chave `windows-x86_64-silent`.

---

### P1: Instalar o app, sem perder a atualização silenciosa ⭐ MVP

**User Story**: Como usuário, quero baixar um instalador do Windows na página de releases, para instalar o SwarmDeck em vez de carregar um executável solto — sem abrir mão da atualização por troca de arquivo.

**Why P1**: A v0.1.9 saiu sem MSI e sem NSIS. Os dois jobs da matriz de build rodam em paralelo e o `tauri-action` cria um rascunho quando não encontra nenhum para a tag, então Windows e Linux criaram dois rascunhos concorrentes: o do Windows (com MSI, NSIS e o `latest.json` das chaves Windows) ficou órfão, e o publicado foi o do Linux. Instalar deixou de ser possível por acidente de pipeline, não por decisão.

**Acceptance Criteria**:

1. WHEN uma release é publicada THEN ela SHALL conter os instaladores `.msi` e `-setup.exe` (NSIS) da mesma versão, na mesma release que carrega `latest.json`.
2. O pipeline SHALL criar no máximo um rascunho de release por tag, antes de qualquer job de empacotamento, de modo que todo job da matriz publique seus artefatos na mesma release.
3. A instalação por NSIS SHALL continuar recebendo a atualização por troca de arquivo (SILENT-05), sem executar instalador.

**Independent Test**: Disparar a release e conferir que `gh release list` mostra uma única entrada para a tag e que os assets incluem `.msi`, `-setup.exe`, o `.exe` cru e o zip portátil.

---

### P2: Buscar atualização sob demanda

**User Story**: Como usuário, quero um botão para procurar uma versão nova na hora, para não depender do ciclo automático nem de fechar e reabrir a janela.

**Why P2**: A consulta já roda ao abrir o app e ao abrir a seção; o botão só dá controle explícito sobre ela.

**Acceptance Criteria**:

1. Configurações › Atualizações SHALL exibir uma ação "Buscar atualizações" junto da versão instalada.
2. WHEN o usuário aciona "Buscar atualizações" THEN o sistema SHALL reconsultar o manifesto e atualizar a versão mais recente exibida.
3. WHILE uma consulta acionada pelo botão está em andamento, o sistema SHALL desabilitar a ação e SHALL continuar exibindo a versão instalada.

**Independent Test**: Abrir Configurações › Atualizações, clicar em "Buscar atualizações" e ver a versão mais recente ser reconsultada, com o botão desabilitado durante a consulta.

---

## Edge Cases

- IF a assinatura minisign não confere com os bytes baixados THEN o sistema SHALL abortar com mensagem de erro e SHALL deixar todo arquivo da pasta do app inalterado.
- IF a escrita do novo executável falha THEN o sistema SHALL restaurar `<nome>.exe.old` para o caminho original e reportar a falha.
- IF a pasta do executável não é gravável THEN o sistema SHALL abortar antes de baixar qualquer byte e informar que a pasta não é gravável.
- IF a consulta ao manifesto falha THEN o sistema SHALL exibir a versão instalada e uma mensagem explícita de falha de consulta, e SHALL NOT exibir versão mais recente.
- IF o download é interrompido no meio THEN o sistema SHALL rejeitar os bytes parciais pela verificação de assinatura, sem tocar em nenhum arquivo.
- IF uma consulta em segundo plano falha THEN o sistema SHALL registrar o erro em log e manter a cadência do intervalo.
- IF o usuário aciona "Baixar e atualizar" enquanto uma aplicação já está em andamento THEN o sistema SHALL ignorar o segundo acionamento.
- **SILENT-35** — WHILE o app estiver rodando, o sistema SHALL ter um provedor de cripto do rustls instalado como padrão do processo ANTES de qualquer cliente HTTP ser construído. *(Aberto em 16/08/2026. `reqwest` é compilado com `rustls-no-provider`, e nessa configuração `Client::builder().build()` **panica** em vez de devolver `Err` quando não há provedor. O panic acontecia dentro de `#[tauri::command] async`, matando a task sem nunca resolver a promise do IPC: a seção "Atualizações" ficava presa em "Verificando…" para sempre — sintoma que o timeout de 10s de `FETCH_TIMEOUT` não cobria, porque a falha era antes do primeiro byte. O mesmo panic derrubava `quota_claude`. O comentário do `Cargo.toml` afirmava que `tauri-plugin-updater` instalava o provedor; não instala.)*

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SILENT-01 | P1: Atualizar sem instalador | Tasks | Implementing |
| SILENT-02 | P1: Atualizar sem instalador | Tasks | Implementing |
| SILENT-03 | P1: Atualizar sem instalador | Tasks | Implementing |
| SILENT-04 | P1: Atualizar sem instalador | Tasks | Implementing |
| SILENT-05 | P1: Atualizar sem instalador | Tasks | Implementing |
| SILENT-06 | P1: Atualizar sem instalador | Tasks | Implementing |
| SILENT-07 | P1: Atualizar sem instalador | Tasks | Implementing |
| SILENT-08 | P1: Atualizar sem instalador | Tasks | Implementing |
| SILENT-09 | P1: Ver versões | Tasks | Implementing |
| SILENT-10 | P1: Ver versões | Tasks | Implementing |
| SILENT-11 | P1: Ver versões | Tasks | Implementing |
| SILENT-12 | P1: Ver versões | Tasks | Implementing |
| SILENT-13 | P1: Ver versões | Tasks | Implementing |
| SILENT-14 | P2: Aposentar download automático | Tasks | Implementing |
| SILENT-15 | P2: Aposentar download automático | Tasks | Implementing |
| SILENT-16 | P2: Aposentar download automático | Tasks | Implementing |
| SILENT-17 | P2: Aposentar download automático | Tasks | Implementing |
| SILENT-18 | P2: Registro coerente | Tasks | Implementing |
| SILENT-19 | P2: Registro coerente | Tasks | Implementing |
| SILENT-20 | P2: Publicar artefato | Tasks | Implementing |
| SILENT-21 | P2: Publicar artefato | Tasks | Implementing |
| SILENT-22 | Edge Cases | Tasks | Implementing |
| SILENT-23 | Edge Cases | Tasks | Implementing |
| SILENT-24 | Edge Cases | Tasks | Implementing |
| SILENT-25 | Edge Cases | Tasks | Implementing |
| SILENT-26 | Edge Cases | Tasks | Implementing |
| SILENT-27 | Edge Cases | Tasks | Implementing |
| SILENT-28 | Edge Cases | Tasks | Implementing |
| SILENT-29 | P1: Instalar o app | Execute | Implemented |
| SILENT-30 | P1: Instalar o app | Execute | Implemented |
| SILENT-31 | P1: Instalar o app | Execute | Implemented |
| SILENT-32 | P2: Buscar sob demanda | Execute | Implemented |
| SILENT-33 | P2: Buscar sob demanda | Execute | Implemented |
| SILENT-34 | P2: Buscar sob demanda | Execute | Implemented |
| SILENT-35 | Edge Cases | Execute | Implemented |
| SILENT-36 | Revogação 16/08/2026 | Execute | **Revogado por AD-009** |
| SILENT-37 | P1: Baixar com progresso | Execute | Implemented |
| SILENT-38 | P1: Baixar com progresso | Execute | Implemented |
| SILENT-39 | P1: Baixar com progresso | Execute | Implemented |
| SILENT-40 | P1: Baixar com progresso | Execute | Implemented |
| SILENT-41 | P1: Baixar com progresso | Execute | Implemented |
| SILENT-42 | P1: Ver o que mudou antes de baixar | Execute | Implemented |
| SILENT-43 | P1: Ver o que mudou antes de baixar | Execute | Implemented |
| SILENT-44 | P1: Ver o que mudou antes de baixar | Execute | Implemented |
| SILENT-45 | P1: Ver o que mudou antes de baixar | Execute | Implemented |

**Mapa ID → critério** (a ordem acima segue a ordem de leitura do documento):

- SILENT-01..08 = os oito ACs de "P1: Atualizar sem instalador, mediante confirmação".
- SILENT-09..13 = os cinco ACs de "P1: Ver versão instalada e versão mais recente".
- SILENT-14..17 = os quatro ACs de "P2: Aposentar o download automático e a instalação no fechamento".
- SILENT-18..19 = os dois ACs de "P2: Registro de desinstalação coerente".
- SILENT-20..21 = os dois ACs de "P2: Publicar o artefato que a troca consome".
- SILENT-22..28 = os sete itens de "Edge Cases", na ordem listada.
- SILENT-29..31 = os três ACs de "P1: Instalar o app, sem perder a atualização silenciosa".
- SILENT-32..34 = os três ACs de "P2: Buscar atualização sob demanda".

**Mapa ID → task** (ver `tasks.md`):

- T1 cobre 01 e 21. T2 cobre 09, 10, 11 e 25. T3 cobre 09 e 25.
- T4 cobre 04, 05, 22, 23 e 26. T5 cobre 18 e 19.
- T6 cobre 14, 15, 16, 17 e 27. T7 cobre 02, 03, 06, 08, 21, 24 e 28.
- T8 cobre 13. T9 cobre 07 e 14.
- T10 cobre 09, 10, 11, 12, 13 e 25. T11 cobre 09, 13 e 25. T12 cobre 20.

**ID format:** `SILENT-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 28 total, 28 mapeados a tasks, 0 sem mapeamento. Os SILENT-37..45, posteriores, entraram direto em Execute (ajustes de escopo pequeno, sem tasks.md próprio).

---

## Requisitos revogados por esta spec

A feature `release-distribution` implementou o download automático em segundo plano e a instalação no fechamento da janela. Esta spec revoga esse comportamento (ver AD-005 em `.specs/STATE.md`):

| ID revogado | O que era | Revogado por |
| ----------- | --------- | ------------ |
| REL-37, REL-38 | Checador em segundo plano que baixa a cada ciclo | SILENT-15 (a checagem permanece, o download sai) |
| REL-41, REL-42, REL-43, REL-44 | Download silencioso, guarda de download duplicado, `PendingUpdate` | SILENT-14, SILENT-16 |
| REL-45, REL-46, REL-47 | Instalação no `CloseRequested` da janela `main` | SILENT-06, SILENT-14 |
| REL-22, REL-25 (parcial) | `apply_portable` restrito ao flavor portátil | SILENT-05, SILENT-18 (mesma lógica, agora nos dois flavors) |

Os arquivos `.specs/features/release-distribution/*` não existem no disco (`.specs` está no `.gitignore`), então a revogação não pode ser anotada no documento original — este bloco é o registro dela. Os marcadores `// SPEC: release-distribution (REL-xx)` dos arquivos tocados são substituídos por `// SPEC: silent-update (SILENT-xx)` nas tasks correspondentes.

---

## Requisitos novos de 16/08/2026, à tarde (SILENT-37..41, AD-009)

### P1: Baixar com progresso, instalar num segundo clique ⭐ MVP

**User Story**: Como usuário, quero ver o download acontecendo e decidir
quando instalar, para não ser surpreendido por um app que se fecha sozinho.

**Acceptance Criteria**:

1. **SILENT-37** — WHILE o artefato de atualização está sendo baixado, o sistema SHALL emitir o progresso (bytes recebidos e total, quando conhecido) e a UI SHALL exibi-lo como barra de progresso; sem `Content-Length` a barra SHALL ser indeterminada, sem inventar porcentagem.
2. **SILENT-38** — WHEN o download termina e a assinatura minisign confere THEN o sistema SHALL exibir a ação "Instalar" e SHALL NOT ter escrito nada na pasta do app até esse ponto.
3. **SILENT-39** — WHEN o usuário aciona "Instalar" THEN o sistema SHALL trocar o executável no lugar, em silêncio, com o app rodando, e SHALL NOT executar instalador NSIS/MSI nem encerrar o processo.
4. **SILENT-40** — WHEN a instalação termina THEN o sistema SHALL informar que a versão nova vale ao reabrir o app e SHALL oferecer "Reabrir agora"; o sistema SHALL NOT reiniciar nem fechar o app sem esse acionamento explícito.
5. **SILENT-41** — Configurações › Atualizações SHALL NOT exibir a linha "Modo" (Instalado/Portátil).

**Independent Test**: Com uma versão nova publicada, clicar em "Baixar" e
ver a barra andar; clicar em "Instalar" e ver o `.exe` trocado na pasta com
o app ainda aberto e os terminais vivos; conferir que o app só fecha ao
clicar em "Reabrir agora".

**Edge cases herdados**: SILENT-22, SILENT-23, SILENT-24, SILENT-26 e
SILENT-28 voltam a valer palavra por palavra — a única diferença é que o
`Applying` agora guarda os dois passos (download e instalação).

**Rastreabilidade**: `update/apply.rs` (`download`, `install`),
`update/swap.rs`, `commands/update.rs` (`update_download`,
`update_install`), `components/settings/UpdateSettings.tsx`,
`routes/settings/SettingsShell.tsx`, `.github/workflows/release.yml`.

---

## ~~Requisitos revogados em 16/08/2026 (SILENT-36, AD-008)~~ — revogado por AD-009

> Esta seção inteira deixou de valer na tarde de 16/08/2026. O texto fica
> registrado porque o "por quê" tem valor histórico, mas **nada aqui
> descreve o produto de hoje**: SILENT-05, 06, 18, 19, 20, 23 e 24 estão
> ativos de novo, e SILENT-36 está revogado.

**SILENT-36** (revogado) — WHEN o usuário confirma "Baixar e atualizar" THEN o sistema SHALL delegar o download e a instalação ao `tauri-plugin-updater`, em toda plataforma, usando a chave de manifesto `{os}-{arch}` e o `installMode` de `tauri.conf.json`; e SHALL NOT trocar o executável no lugar.

| ID revogado | O que era | Por quê |
| ----------- | --------- | ------- |
| SILENT-05 | Renomear o `.exe` em execução para `.exe.old` e escrever os bytes baixados no lugar | O instalador do plugin faz a substituição |
| SILENT-06 | "SHALL NOT executar instalador NSIS ou MSI" | Invertido: o instalador **é** o caminho agora |
| SILENT-18, SILENT-19 | Escrever `DisplayVersion` no registro após a troca | O instalador escreve o registro sozinho |
| SILENT-20 (parcial) | Publicar o `.exe` cru assinado sob `windows-x86_64-silent` | Chave e artefato não existem mais; o zip portátil continua publicado, para download manual |
| SILENT-23, SILENT-24 | Restaurar o `.old` após falha de escrita; reprovar pasta não gravável antes de baixar | Não há mais escrita própria em disco |

Mantidos com outro executor: **SILENT-04** (assinatura minisign conferida antes de instalar — agora pelo plugin), **SILENT-08** (o plugin era só o caminho não-Windows; virou o caminho único), **SILENT-22** (bytes adulterados abortam sem tocar em arquivo — garantia do plugin).

**SILENT-07** sobrevive só como limpeza de rastro: `update::cleanup_stale_old` continua apagando um `<nome>.exe.old` deixado por quem atualizou pelo mecanismo antigo. Some quando não houver mais instalação em versão anterior a 0.1.13.

**Código removido:** `src-tauri/src/update/swap.rs` inteiro, o `run`/`run_with` de `cfg(windows)` em `apply.rs`, `check::pubkey`, o sufixo de flavor em `check::target_key`, `paths::is_writable`, e os dois passos do `release.yml` que publicavam o `.exe` cru e injetavam a chave `windows-x86_64-silent` no `latest.json`.

**Custo aceito:** quem usa a versão portátil não é atualizado pelo instalador — ele instalaria uma segunda cópia em `%LOCALAPPDATA%`. Atualizar portátil volta a ser baixar o zip à mão. O usuário optou por isso em 16/08/2026, para alinhar com o `local-mind`.

---

## Requisitos novos de 18/08/2026 (SILENT-42..45)

### P1: Ver o que mudou antes de baixar ⭐ MVP

**User Story**: Como usuário, quero ler na própria tela de Atualizações o que
mudou na versão nova, para decidir se quero baixá-la agora.

**Contexto**: o `notes` do manifesto já vem preenchido com o corpo da release
do GitHub (`releaseBody` em `release.yml`, gerado pelo git-cliff: títulos
`###` e listas `-`). O backend já o devolve em `update_status`; até aqui a UI
o descartava.

**Acceptance Criteria**:

1. **SILENT-42** — WHEN a consulta devolve uma versão mais recente que a instalada THEN Configurações › Atualizações SHALL exibir, abaixo da comparação de versões, uma seção com as notas dessa versão, renderizando os títulos e as listas do Markdown em vez de mostrar o texto cru.
2. **SILENT-43** — WHILE não há versão nova (versões iguais, consulta falhando ou notas vazias), o sistema SHALL NOT exibir a seção de notas.
3. **SILENT-44** — WHILE existe versão nova, a seção de notas SHALL permanecer visível durante o download e a instalação, e a ação primária da seção SHALL ser "Baixar" antes do download e "Instalar" depois dele.
4. **SILENT-45** — Configurações › Atualizações SHALL NOT oferecer a ação "Pular esta versão".

**Independent Test**: Abrir Configurações › Atualizações com uma versão nova
publicada e ver as notas da release renderizadas com títulos e itens, o botão
"Baixar" abaixo delas, e nenhuma ação de pular versão.

**Rastreabilidade**: `components/settings/UpdateSettings.tsx`,
`routes/settings/SettingsShell.tsx`. Backend inalterado — `UpdateStatus.notes`
(`update/check.rs`) já existia e só passou a ser consumido.

---

## Success Criteria

- [ ] Com uma versão nova publicada, o app na versão anterior atualiza por completo sem que nenhuma janela de instalador apareça.
- [ ] Nenhum arquivo de atualização aparece em disco antes do clique de confirmação.
- [ ] Configurações › Atualizações mostra os dois números de versão em toda combinação: iguais, remota maior, consulta falhando.
- [ ] Assinatura adulterada ou bytes truncados deixam a pasta do app byte a byte idêntica.
- [ ] `reg query ... /v DisplayVersion` devolve a versão nova depois da troca no flavor instalado.
- [ ] `cargo test`, `npm run test` e `npm run test:scripts` passam.
