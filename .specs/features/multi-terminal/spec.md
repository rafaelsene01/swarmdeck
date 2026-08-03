# Multi-terminal em grid — Especificação

## Problema

Quem roda vários agentes de codificação hoje abre várias janelas de terminal soltas. Não dá para ver o conjunto de uma vez, cada janela perde o contexto de qual projeto pertence, e alternar entre elas custa atenção. O terminal é a superfície onde o trabalho realmente acontece — se ele não for de primeira classe, o resto do produto não tem onde se apoiar.

## Objetivos

- [ ] Rodar 4 terminais simultâneos com PTY real, sem degradação perceptível de input (< 50ms do teclado à tela)
- [ ] Identificar o que cada terminal está fazendo sem clicar nele
- [ ] Restaurar o layout e os diretórios de trabalho após reiniciar o app

## Fora de escopo

| Feature | Razão |
|---|---|
| Modo **Tabs** de layout | O original oferece Grid + Tabs; v1 entrega só Grid para fechar o núcleo antes. Ver ROADMAP → Considerações futuras. |
| Mais de 4 terminais | O tier gratuito do original limita a 4. Sem razão técnica para copiar o limite, mas 4 é o alvo validado do v1. |
| Atalhos de teclado configuráveis | Feature PRO do original, não observável. |
| Restaurar o *conteúdo* do scrollback após reiniciar | Só o layout e o diretório são persistidos. Reanexar a um PTY morto não é possível. |
| Digitar o diretório manualmente no diálogo de novo terminal | Decisão do usuário (triagem desta demanda, 02/08/2026): o campo vira só-leitura, preenchido exclusivamente pelo seletor nativo de pasta — elimina caminho inválido por digitação. |
| Lista de pastas recentes (mais que a última usada) **no seletor nativo de pasta (TERM-11)** | Só o **último** diretório escolhido é lembrado pelo seletor nativo do SO, como ponto de partida. **Não confundir com o picker de projetos** (`projects/spec.md`, PROJ-06), que lista projetos registrados com nome/caminho/última abertura — observado em 03/08/2026, é uma tela diferente que já existia na referência e passou a ser especificada agora; essa AD de 02/08/2026 segue valendo só para o seletor nativo de sistema operacional em si. |
| Criar pasta nova a partir do diálogo | O seletor nativo do SO já oferece essa ação por conta própria (ex.: botão "Nova pasta" do diálogo do Windows/macOS/Linux) — nada a construir aqui. |

---

## Histórias de usuário

### P1: Abrir e usar um terminal real ⭐ MVP

**História**: Como desenvolvedor, quero abrir um terminal dentro do app e rodar meu agente de CLI nele, para não precisar de uma janela externa.

**Por que P1**: Sem PTY funcionando, não existe produto.

**Critérios de aceite**:
1. QUANDO o usuário clica em "novo terminal" ENTÃO o sistema DEVE spawnar o shell padrão do SO em um PTY e renderizá-lo em até 500ms
2. QUANDO o usuário digita ENTÃO o sistema DEVE encaminhar as teclas ao PTY e refletir a saída sem perda de caracteres
3. QUANDO um programa interativo desenha na tela (prompts, cores ANSI, redesenho de linha) ENTÃO o sistema DEVE renderizar idêntico a um terminal nativo
4. QUANDO o painel do terminal muda de tamanho ENTÃO o sistema DEVE reenviar as dimensões (linhas/colunas) ao PTY
5. QUANDO o processo do PTY termina ENTÃO o sistema DEVE marcar o terminal como encerrado e oferecer reabrir, sem derrubar o app

**Teste independente**: abrir um terminal, rodar `vim` ou um agente interativo, redimensionar a janela e confirmar que o redesenho acompanha.

---

### P1: Grid de terminais ⭐ MVP

**História**: Como desenvolvedor, quero ver até 4 terminais lado a lado, para acompanhar vários agentes de uma vez.

**Por que P1**: A proposta central do produto é a visão simultânea.

**Critérios de aceite**:
1. QUANDO existem 2 terminais ENTÃO o sistema DEVE dispô-los em 2 colunas de largura igual
2. QUANDO existem 3 ou 4 terminais ENTÃO o sistema DEVE dispô-los em grid 2×2
3. QUANDO o usuário arrasta uma divisória ENTÃO o sistema DEVE redimensionar os painéis vizinhos e reenviar as dimensões aos PTYs afetados
4. QUANDO o usuário maximiza um terminal ENTÃO o sistema DEVE ocupar toda a área de terminais e manter os demais vivos em segundo plano
5. QUANDO o usuário fecha um terminal ENTÃO o sistema DEVE encerrar o PTY e reorganizar o grid com os restantes
6. QUANDO já existem 4 terminais ENTÃO o sistema DEVE desabilitar a criação de um quinto e explicar o limite

**Teste independente**: abrir 4 terminais, arrastar divisórias, maximizar um e fechá-lo — os outros 3 continuam responsivos.

---

### P1: Header de terminal ⭐ MVP

**História**: Como desenvolvedor, quero que cada terminal se identifique no topo, para saber de qual trabalho ele trata sem ler a saída.

**Por que P1**: É o que transforma 4 terminais em um painel de controle, e não em 4 caixas pretas.

**Critérios de aceite**:
1. QUANDO um terminal existe ENTÃO o header DEVE mostrar: número sequencial, título geral, ícone do agente ativo e badge de status quando houver
2. QUANDO o agente define o título via MCP ENTÃO o header DEVE atualizar sem recarregar o terminal
3. QUANDO o usuário renomeia o terminal manualmente ENTÃO o sistema DEVE preservar esse nome e ignorar títulos vindos do agente
4. QUANDO o usuário passa o mouse sobre o header ENTÃO o sistema DEVE mostrar a atividade atual do agente
5. QUANDO o terminal aponta para um repositório git ENTÃO o header DEVE mostrar o branch atual e a contagem de arquivos modificados
6. QUANDO o usuário clica em fechar ENTÃO o sistema DEVE pedir confirmação se houver processo ativo

**Teste independente**: definir título por MCP, renomear manualmente e confirmar que o rename manual vence.

---

### P1: Seletor de pasta ao criar terminal ⭐ MVP

**Correção em 03/08/2026** (observação ao vivo do CodeAgentSwarm de referência — `.specs/research/screenshots/Captura de tela 2026-08-03 003525.png`): o texto abaixo falava em "diálogo de novo terminal" como se fosse uma janela/modal flutuante. Não é — é um painel renderizado **dentro do próprio slot de terminal** vazio (o painel mostra "① PROJECT → ② AGENT" no lugar do terminal ainda não iniciado). Os critérios de aceite abaixo continuam válidos como estavam; só o container mudou de nome conceitual. Além disso, este seletor agora é alcançado por dentro do passo PROJECT (botão "Import Project"), não como primeira tela — a primeira tela é o picker de projetos, especificado em `.specs/features/projects/spec.md` (PROJ-06). O único fluxo que continua sendo um modal flutuante de verdade é "Create New Project" (PROJ-01).

**História**: Como desenvolvedor, quero escolher o diretório do novo terminal navegando pelas pastas do sistema, para não errar um caminho digitado e abrir o terminal exatamente como se tivesse aberto um terminal a partir daquela pasta.

**Por que P1**: É a forma como o usuário efetivamente define onde o terminal nasce — sem ela, o campo de diretório do painel de inicialização do terminal (antes descrito como `NewTerminalDialog`) fica sem uma maneira confiável de ser preenchido.

**Critérios de aceite**:
1. QUANDO o usuário clica em "Import Project" no passo PROJECT (`projects/spec.md`, PROJ-06) ENTÃO o sistema DEVE abrir o seletor nativo de pastas do sistema operacional (não um `<input type="file">` de HTML puro), restrito à seleção de diretórios
2. QUANDO o usuário seleciona uma pasta no seletor ENTÃO o sistema DEVE preencher o campo "Diretório" com o caminho absoluto escolhido
3. QUANDO o campo "Diretório" é exibido ENTÃO ele DEVE ser somente leitura — a única forma de alterá-lo é reabrir o seletor (ver Fora de escopo)
4. QUANDO o usuário cancela o seletor (Esc ou "Cancelar" no diálogo nativo) ENTÃO o sistema DEVE limpar o campo "Diretório", exigindo nova seleção
5. QUANDO o campo "Diretório" está vazio ENTÃO o botão "criar" DEVE ficar desabilitado — não é possível confirmar a criação do terminal sem uma pasta escolhida
6. QUANDO o usuário confirma a criação com uma pasta selecionada ENTÃO o terminal DEVE nascer com esse caminho como `cwd`, do mesmo jeito que um terminal aberto a partir daquela pasta no SO

**Independente do agente escolhido no mesmo diálogo** — este critério não interfere na seleção de agente (`AGT-01`, `AGT-03`).

**Teste independente**: abrir o diálogo de novo terminal, clicar em "buscar pasta", selecionar um diretório existente e confirmar — o terminal criado inicia nesse diretório. Repetir cancelando o seletor e confirmar que "criar" fica desabilitado.

---

### P1: Lembrar o último diretório escolhido

**História**: Como desenvolvedor que abre vários terminais na mesma sessão de trabalho, quero que o seletor já comece perto de onde estive da última vez, para não navegar do zero a cada terminal novo.

**Por que P1**: Decisão do usuário na triagem desta demanda — sem isso, todo terminal novo forçaria uma navegação completa a partir do diretório home, mesmo trabalhando repetidamente na mesma árvore de pastas.

**Critérios de aceite**:
1. QUANDO o usuário seleciona uma pasta com sucesso ENTÃO o sistema DEVE persistir esse caminho como "último diretório usado", sobrevivendo a reinícios do app
2. QUANDO o usuário abre o seletor de pasta e existe um "último diretório usado" persistido ENTÃO o seletor nativo DEVE abrir posicionado nesse diretório
3. QUANDO não existe "último diretório usado" persistido (primeiro uso) ENTÃO o seletor DEVE abrir no diretório home do usuário
4. QUANDO o "último diretório usado" persistido não existe mais no disco ENTÃO o seletor DEVE cair para o diretório home, sem erro

**Teste independente**: selecionar uma pasta, fechar e reabrir o app, abrir o diálogo de novo terminal de novo e clicar em "buscar pasta" — o seletor abre no diretório escolhido anteriormente.

---

### P2: Persistência de sessão

**História**: Como desenvolvedor, quero reabrir o app e reencontrar meu arranjo de trabalho, para não remontar tudo toda manhã.

**Por que P2**: Melhora muito o uso diário, mas o produto funciona sem.

**Critérios de aceite**:
1. QUANDO o app fecha ENTÃO o sistema DEVE persistir número de terminais, proporções do grid, diretório e agente de cada um
2. QUANDO o app abre ENTÃO o sistema DEVE recriar os terminais com os mesmos diretórios e proporções
3. QUANDO um diretório persistido não existe mais ENTÃO o sistema DEVE abrir o terminal no diretório home e avisar

**Teste independente**: montar um layout 2×2, fechar o app, reabrir e conferir a restauração.

---

### P2: Minimizar terminal

**História**: Como desenvolvedor, quero recolher um terminal sem matá-lo, para liberar espaço mantendo o agente rodando.

**Critérios de aceite**:
1. QUANDO o usuário minimiza um terminal ENTÃO o sistema DEVE recolhê-lo a uma barra compacta e redistribuir o espaço
2. QUANDO um terminal está minimizado ENTÃO o PTY DEVE continuar rodando e acumulando saída
3. QUANDO o usuário restaura o terminal ENTÃO o sistema DEVE reexibir o scrollback completo do período minimizado
4. QUANDO um terminal minimizado muda de status ENTÃO a barra compacta DEVE refletir o novo badge

**Teste independente**: minimizar um terminal com um build rodando, restaurar e confirmar que a saída do período não se perdeu.

---

### P1: Restaurar sessão após fechamento inesperado ⭐ MVP

**Novo em 03/08/2026** — observado ao vivo no CodeAgentSwarm de referência, não fazia parte da spec anterior. Estende `P2: Persistência de sessão` (TERM-07) para o caso de o app **não** ter fechado de forma limpa.

**História**: Como desenvolvedor que teve o app fechado por uma queda (crash, energia, fechar sem querer), quero escolher quais terminais retomar — inclusive a sessão do agente que estava rodando neles — em vez de perder tudo ou ter tudo recriado sem eu confirmar.

**Por que P1**: Sem isso, um fechamento inesperado deixa o usuário sem saber o que vai voltar, e `TERM-07` (restauração silenciosa) só cobre o caminho feliz do fechamento limpo.

**Observado em**: `.specs/research/screenshots/Captura de tela 2026-08-03 004512.png` — modal "Restore Previous Session"

**Critérios de aceite**:
1. QUANDO o app é reaberto depois de **não** ter passado pelo desligamento limpo da sessão anterior (ver Design para o mecanismo de detecção) ENTÃO o sistema DEVE mostrar um modal "Restore Previous Session" com o texto "The app closed unexpectedly. Select conversations to restore:"
2. QUANDO o modal é exibido ENTÃO cada terminal restaurável DEVE aparecer como uma linha com checkbox (marcado por padrão), ícone do agente, avatar/nome do projeto e o título da conversa
3. QUANDO o usuário desmarca ou marca linhas ENTÃO o contador "N/M selected · K terminal slots available" DEVE atualizar, respeitando o limite de 4 terminais (TERM-03 AC6)
4. QUANDO o usuário clica em "Restore Selected" ENTÃO o sistema DEVE recriar somente os terminais marcados, cada um retomando a sessão do agente correspondente (mesmo mecanismo de "Resume Session" de `agent-selection/spec.md`, AGT-06)
5. QUANDO o usuário clica em "Start Fresh" ENTÃO o sistema DEVE descartar a sessão anterior inteira e abrir o app com nenhum terminal configurado (o estado ocioso "INITIALIZE AGENT")
6. QUANDO o app fecha de forma limpa (não é o caso desta história) ENTÃO o comportamento continua sendo o de TERM-07 — restauração silenciosa, sem este modal

**Não confirmado nesta observação**: o mecanismo exato de detecção "fechou de forma inesperada" (hipótese a validar em Design: uma flag de shutdown limpo gravada no banco e checada no próximo boot — se ausente, foi inesperado).

**Teste independente**: matar o processo do app à força com 2 terminais abertos, reabrir, desmarcar um dos dois, clicar "Restore Selected" e confirmar que só o marcado volta, com a sessão do agente retomada.

---

### P3: Log de atividade por terminal

**História**: Como desenvolvedor, quero ver o histórico do que o agente reportou naquele terminal, para reconstruir o caminho que ele seguiu.

**Critérios de aceite**:
1. QUANDO o agente reporta uma atividade ENTÃO o sistema DEVE anexá-la ao log daquele terminal com horário
2. QUANDO o usuário abre o log ENTÃO o sistema DEVE listar as atividades em ordem cronológica inversa

---

## Casos de borda

- QUANDO o shell não existe ou falha ao spawnar ENTÃO o sistema DEVE mostrar o erro no painel do terminal, não em um alerta modal
- QUANDO o PTY emite mais rápido do que a renderização ENTÃO o sistema DEVE agrupar as atualizações e nunca travar a UI
- QUANDO o scrollback ultrapassa o limite configurado ENTÃO o sistema DEVE descartar as linhas mais antigas
- QUANDO o painel fica menor que a largura mínima legível ENTÃO o sistema DEVE parar de encolher e manter um piso
- QUANDO o app é fechado com processos ativos ENTÃO o sistema DEVE encerrar todos os PTYs antes de sair, sem deixar órfãos
- QUANDO o usuário cola texto multilinha ENTÃO o sistema DEVE usar bracketed paste e não executar linha a linha
- QUANDO o seletor nativo de pasta falha ao abrir (erro do SO) ENTÃO o sistema DEVE manter o campo "Diretório" como estava antes da tentativa, sem travar o diálogo de novo terminal
- QUANDO o usuário seleciona uma pasta sem permissão de leitura ENTÃO o comportamento é o mesmo de "shell não existe ou falha ao spawnar" já coberto acima — o erro aparece no painel do terminal, não no diálogo de seleção

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| TERM-01 | P1: Terminal real | Tasks | Done — `T4, T5, T6, T7` |
| TERM-02 | P1: Terminal real (resize/ANSI) | Tasks | Done — `T3, T4, T6, T7` |
| TERM-03 | P1: Grid | Tasks | Done — `T5, T8` |
| TERM-04 | P1: Grid (divisórias, maximizar) | Tasks | Done — `T8, T10` |
| TERM-05 | P1: Header | Tasks | Done — `T9` |
| TERM-06 | P1: Header (git, rename manual) | Tasks | **Parcial** — nenhuma task cobria este ID; `T9` (header) só cobre TERM-05. A parte de **rename manual** ganha task nova (`T16`, triagem 006) — ver abaixo, inclusive absorve `terminal-statuses/STAT-07` (revogada, duplicava esta regra). A parte de **branch/git no header** continua sem task, não agendada nesta triagem |
| TERM-07 | P2: Persistência | Tasks | Done — `T2, T11` |
| TERM-08 | P2: Minimizar | Tasks | Done — `T10` |
| TERM-09 | P3: Log de atividade | Tasks | **Não coberto** — nenhuma task cita este ID. Não está em `ROADMAP.md` → "Considerações futuras" nem em `STATE.md` → "Ideias adiadas"; gap não documentado antes desta triagem |
| TERM-10 | P1: Seletor de pasta ao criar terminal | Tasks | Pending — `T14, T15`. **Contexto corrigido 03/08/2026**: alcançado via "Import Project" no picker de projetos (`projects/spec.md`, PROJ-06), não como primeira tela |
| TERM-11 | P1: Lembrar o último diretório escolhido | Tasks | Pending — `T13, T14, T15` |
| TERM-12 | P1: Restaurar sessão após fechamento inesperado | Tasks | **Novo 03/08/2026** — Pending |

**Cobertura (corrigida na triagem 005 — a tabela dizia "0 mapeados" com a feature 100% `✅ Done` em `tasks.md`):** 10 requisitos, **7 mapeados e implementados**, 3 sem cobertura nenhuma (`TERM-06`, `TERM-09`, `TERM-12`) ⚠️. Note também que `T7, T9, T10, T11` — que cobrem `TERM-01, 02, 04, 05, 07, 08` — têm `Verify` visual não confirmável enquanto o NEEDS-DECISION de integração de `App.tsx` (ver `tasks.md`) não for resolvido: "Done" aqui significa gate automatizado verde, não confirmado no app real.

**Adicionado na triagem de 02/08/2026 (seletor nativo de pasta ao criar terminal):** `TERM-10`, `TERM-11`, mapeados para `T13, T14, T15` em `tasks.md` — ainda não implementados.

**Adicionado nesta sessão (03/08/2026, observação ao vivo do app de referência):** `TERM-12` (restaurar sessão após fechamento inesperado) — ainda sem task.

---

## Critérios de sucesso

- [ ] 4 agentes reais rodando em paralelo por 30 minutos sem vazamento de memória nem PTY órfão
- [ ] Latência de digitação abaixo de 50ms com os 4 terminais ativos
- [ ] Layout restaurado corretamente em 10 de 10 reinícios
- [ ] `vim`, `htop` e um agente de CLI interativo renderizam sem artefato visual
