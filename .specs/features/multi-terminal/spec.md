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

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| TERM-01 | P1: Terminal real | Tasks | Done — `T4, T5, T6, T7` |
| TERM-02 | P1: Terminal real (resize/ANSI) | Tasks | Done — `T3, T4, T6, T7` |
| TERM-03 | P1: Grid | Tasks | Done — `T5, T8` |
| TERM-04 | P1: Grid (divisórias, maximizar) | Tasks | Done — `T8, T10` |
| TERM-05 | P1: Header | Tasks | Done — `T9` |
| TERM-06 | P1: Header (git, rename manual) | Tasks | **Não coberto** — nenhuma task de `tasks.md` cita este ID; `T9` (header) só cobre TERM-05. Branch git e persistência de rename manual não foram implementados no v1 |
| TERM-07 | P2: Persistência | Tasks | Done — `T2, T11` |
| TERM-08 | P2: Minimizar | Tasks | Done — `T10` |
| TERM-09 | P3: Log de atividade | Tasks | **Não coberto** — nenhuma task cita este ID. Não está em `ROADMAP.md` → "Considerações futuras" nem em `STATE.md` → "Ideias adiadas"; gap não documentado antes desta triagem |

**Cobertura (corrigida na triagem 005 — a tabela dizia "0 mapeados" com a feature 100% `✅ Done` em `tasks.md`):** 9 requisitos, **7 mapeados e implementados**, 2 sem cobertura nenhuma (`TERM-06`, `TERM-09`) ⚠️. Note também que `T7, T9, T10, T11` — que cobrem `TERM-01, 02, 04, 05, 07, 08` — têm `Verify` visual não confirmável enquanto o NEEDS-DECISION de integração de `App.tsx` (ver `tasks.md`) não for resolvido: "Done" aqui significa gate automatizado verde, não confirmado no app real.

---

## Critérios de sucesso

- [ ] 4 agentes reais rodando em paralelo por 30 minutos sem vazamento de memória nem PTY órfão
- [ ] Latência de digitação abaixo de 50ms com os 4 terminais ativos
- [ ] Layout restaurado corretamente em 10 de 10 reinícios
- [ ] `vim`, `htop` e um agente de CLI interativo renderizam sem artefato visual
