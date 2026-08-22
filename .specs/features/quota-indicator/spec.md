# quota-indicator — delta de requisitos (QUOTA-26..QUOTA-30)

Os requisitos QUOTA-01..QUOTA-25 foram escritos na run original da feature; o
diretório `.specs/` é gitignored e foi apagado no commit `e6ff82b`, então só
os marcadores `SPEC:` no código sobreviveram. Este arquivo registra **apenas
os requisitos novos**, criados em 16/08/2026 a partir dos mockups
`screenshots/configuração_geral.png` e `screenshots/tooltip.png`.

## Requisitos (EARS)

**QUOTA-26** — Enquanto a janela de Configurações estiver na seção "Geral", o
sistema deve exibir a lista ordenada de provedores do popover, cada linha com
o ícone do provedor, o nome, um interruptor de exibição e controles de subir/
descer; a ordem do vetor persistido é a ordem de exibição no popover do
cabeçalho. Ids fora de `agents::catalog::CATALOG` e ids repetidos são
rejeitados sem gravar.

**QUOTA-27** — O centro do anel do cabeçalho deve mostrar o glifo do provedor
padrão (o primeiro provedor marcado da lista; Claude na configuração de
fábrica), não um ícone genérico de agente.

**QUOTA-28** — Enquanto o indicador estiver montado, o sistema deve refazer a
busca de cota a cada 5 minutos, ignorando o piso de cache do backend
(`force: true`) para que o intervalo real seja de 5 minutos.

**QUOTA-29** — A cor do arco deve variar continuamente com a fração
consumida, do verde em 0% ao vermelho em 100%. Frações fora de `0..1` são
grampeadas na cor, nunca produzem matiz inválida.

**QUOTA-30** — Quando o usuário clicar no anel do cabeçalho, o sistema deve
abrir a janela de Configurações na seção "Geral".

## Casos de borda

- Provedor sem endpoint de cota (todos exceto o Claude hoje) rende selo
  ("sem cota"/"sem sessão") e a frase do motivo — nunca uma barra em 0%.
- Lista de provedores vazia ou ausente no payload: o anel continua sendo
  desenhado com o glifo do Claude e o popover não lista ninguém.
- JSON ilegível na coluna `providers`: `db::quota_prefs::get` cai no
  `default_providers()` em vez de propagar erro.

## Fora de escopo

- O segmented control "Qual agente" (Auto/Claude/Codex) que aparece no mockup
  de Configurações. Só o Claude tem endpoint de consumo hoje, então o
  controle não teria efeito observável — mesma razão que já levou o conselho
  a cortá-lo na run original. Entra junto com o segundo provedor com cota
  real. **QUOTA-31 estende esse mesmo argumento** ao interruptor e às setas:
  eles ficam travados em toda linha sem cota real, e destravam sozinhos quando
  `hasQuota` daquele provedor virar `true`.
- O botão de "ocultar valores" (ícone de olho) do mockup do popover: nenhum
  comportamento definido para ele.

**QUOTA-31** — Enquanto a seção "Geral" estiver aberta, a lista de provedores
deve exibir **todo** o catálogo de `agents::catalog::CATALOG`, inclusive os ids
ausentes das preferências persistidas, e as linhas cujo provedor não tem
endpoint de cota real (`hasQuota: false`) devem aparecer com o interruptor e as
setas de ordenação desabilitados. Uma linha ausente das preferências entra
desmarcada; uma linha presente mostra o valor gravado, mesmo travada. Nenhum id
fora das preferências é gravado ao alterar a lista.

## Rastreabilidade

| ID | Arquivos |
| --- | --- |
| QUOTA-26 | `src-tauri/src/db/migrations/007_quota_providers.sql`, `src-tauri/src/db/quota_prefs.rs`, `src-tauri/src/commands/quota.rs`, `src/routes/settings/GeneralPanel.tsx`, `src/components/shell/QuotaIndicator.tsx` |
| QUOTA-27 | `src/components/shell/ProviderIcon.tsx`, `src/components/shell/QuotaIndicator.tsx` |
| QUOTA-28 | `src/components/shell/QuotaIndicator.tsx` |
| QUOTA-29 | `src/components/shell/QuotaIndicator.tsx` (`ringColor`) |
| QUOTA-30 | `src/components/shell/Header.tsx`, `src/components/shell/QuotaIndicator.tsx` |
| QUOTA-31 | `src/routes/settings/GeneralPanel.tsx`, `src/routes/settings/SettingsShell.tsx` |
