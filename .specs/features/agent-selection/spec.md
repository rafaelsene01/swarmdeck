# Seleção de agente — Especificação

## Problema

O produto não é um cliente de um agente só. O usuário quer rodar Claude Code em um terminal e Codex CLI em outro, ou testar um agente novo sem reconfigurar tudo. O app precisa tratar "qual agente roda aqui" como uma escolha de primeira classe — com padrão sensato e sobrescrita por sessão.

## Objetivos

- [ ] Abrir um terminal com o agente preferido em um clique, sem digitar comando
- [ ] Trocar de agente em uma sessão nova sem alterar configuração global
- [ ] Identificar qual agente roda em cada terminal olhando o header

## Fora de escopo

| Feature | Razão |
|---|---|
| Instalar os CLIs dos agentes | O app usa o que já estiver no PATH; instalar é responsabilidade do usuário |
| Gerenciar credenciais/API keys dos agentes | Cada CLI cuida da própria autenticação |
| **Turbo Mode** | Feature PRO do original. **Confirmado em 03/08/2026**: o toggle "Turbo" agora *foi* observado na tela de agente (`Captura de tela 2026-08-03 003653.png`, linha "OPTIONS", ao lado de "Git Worktree"), mas o usuário decidiu manter fora de escopo — a matriz de paywall (`UI-INVENTORY.md`) confirma Turbo Mode como PRO (✗ no Starter), e a linha desta tabela não é revogada, só deixa de ser "não observável" para virar "observado e propositalmente excluído" |

---

## Agentes do catálogo

Observados na instalação de referência:

| Agente | Fornecedor | Observação |
|---|---|---|
| Claude Code | Anthropic | padrão selecionado na referência |
| Codex CLI | OpenAI | |
| Antigravity CLI | Google | |
| opencode | SST | |
| Kimi Code | Moonshot AI | marcado BETA |

---

## Histórias de usuário

### P1: Agente padrão ⭐ MVP

**História**: Como desenvolvedor, quero definir qual agente abre por padrão, para não escolher toda vez.

**Critérios de aceite**:
1. QUANDO as configurações são abertas ENTÃO o sistema DEVE listar os agentes do catálogo como cards selecionáveis, com nome e fornecedor
2. QUANDO o usuário escolhe um agente padrão ENTÃO o sistema DEVE persistir a escolha e pré-selecioná-la em toda sessão nova
3. QUANDO um agente está em beta ENTÃO o card DEVE exibir o selo correspondente
4. QUANDO o CLI de um agente não está instalado ENTÃO o sistema DEVE indicar isso no card e explicar como resolver

**Teste independente**: definir Codex como padrão, abrir terminal novo e confirmar a pré-seleção.

---

### P1: Sobrescrita por sessão ⭐ MVP

**História**: Como desenvolvedor, quero escolher outro agente ao abrir um terminal específico, para comparar comportamentos lado a lado.

**Por que P1**: É a razão de existir de um catálogo multi-agente.

**Critérios de aceite**:
1. QUANDO o usuário abre um terminal novo ENTÃO o sistema DEVE oferecer a escolha do agente, com o padrão pré-selecionado
2. QUANDO o usuário escolhe um agente diferente ENTÃO o sistema DEVE usá-lo só naquela sessão, sem alterar o padrão global
3. QUANDO a sessão inicia ENTÃO o sistema DEVE lançar o CLI correspondente no diretório de trabalho escolhido
4. QUANDO o CLI escolhido não é encontrado no PATH ENTÃO o sistema DEVE abrir o terminal mesmo assim, com o shell puro, e explicar o que faltou

**Teste independente**: abrir dois terminais com agentes diferentes ao mesmo tempo e confirmar que ambos funcionam.

**Nota de integração (03/08/2026)**: a mesma tela de agente mostra uma linha "OPTIONS" com um toggle "Git Worktree" (`Captura de tela 2026-08-03 003653.png`). Isso não é um requisito novo desta feature — é o ponto de acionamento de `worktrees/spec.md` (WT-01: "QUANDO o usuário abre uma conversa com worktree marcado ENTÃO o sistema DEVE criar um worktree git..."). Nenhum ID novo é criado aqui; fica registrado só para a Design saber onde esse toggle mora na UI.

---

### P2: Identificação visual do agente

**História**: Como desenvolvedor, quero ver de qual agente é cada terminal, para não confundir quem respondeu o quê.

**Critérios de aceite**:
1. QUANDO um terminal tem agente ativo ENTÃO o header DEVE exibir o ícone daquele agente
2. QUANDO o usuário passa o mouse sobre o ícone ENTÃO o sistema DEVE mostrar nome e fornecedor
3. QUANDO a barra principal é exibida ENTÃO ela DEVE indicar o agente do terminal em foco

---

### P2: Escopo por agente nas features de extensão

**História**: Como desenvolvedor, quero ver quais skills e servidores MCP valem para cada agente, para não instalar coisa no lugar errado.

**Critérios de aceite**:
1. QUANDO skills são listadas ENTÃO o sistema DEVE oferecer filtro por agente com contagem por agente
2. QUANDO uma skill é compatível com vários agentes ENTÃO o card DEVE mostrar os ícones de todos
3. QUANDO o usuário exporta uma skill para um agente ENTÃO o sistema DEVE copiá-la para o diretório de configuração daquele agente

---

### P1: Retomar ou iniciar nova sessão do agente ⭐ MVP

**Novo em 03/08/2026** — observado ao vivo no CodeAgentSwarm de referência, não fazia parte da spec anterior. Decisão do usuário nesta sessão: entra no núcleo v1 (o clone libera tudo que constrói, mesmo que no original isso se aproxime da feature PRO "Conversation History" — ver nota abaixo).

**História**: Como desenvolvedor que já trabalhou num projeto antes, quero retomar a conversa de onde parei com aquele agente, em vez de começar do zero toda vez que abro um terminal novo para o mesmo projeto.

**Por que P1**: É a razão de existir do botão "Resume Session" observado na tela de agente — sem isso, o passo AGENT sempre inicia sessão nova, perdendo o contexto acumulado.

**Observado em**: `.specs/research/screenshots/Captura de tela 2026-08-03 003653.png` — botões "Resume Session / PICK UP WHERE YOU LEFT OFF" e "New Session / START FRESH"

**Critérios de aceite**:
1. QUANDO o passo AGENT é exibido para um projeto com uma sessão anterior daquele agente ENTÃO o sistema DEVE oferecer "Resume Session" (com o subtítulo "PICK UP WHERE YOU LEFT OFF") como opção pré-destacada, ao lado de "New Session" ("START FRESH")
2. QUANDO não existe sessão anterior daquele agente para aquele projeto ENTÃO "Resume Session" NÃO DEVE aparecer como opção habilitada — só "New Session" é possível
3. QUANDO o usuário clica em "Resume Session" ENTÃO o sistema DEVE lançar o CLI do agente com a flag/mecanismo de retomada equivalente ao `--resume` (o exato depende do CLI escolhido — ver Design), no `cwd` do projeto selecionado
4. QUANDO o usuário clica em "New Session" ENTÃO o sistema DEVE lançar o CLI normalmente (comportamento já coberto por AGT-03), e essa nova sessão passa a ser a candidata de "Resume Session" da próxima vez
5. QUANDO o agente escolhido não suporta retomada de sessão (nem todo CLI do catálogo tem esse recurso) ENTÃO "Resume Session" DEVE ficar oculto ou desabilitado para esse agente, mostrando só "New Session"

**Nota sobre paywall**: a matriz de features do original (`UI-INVENTORY.md`) lista "Conversation History" (busca e restauração de conversas antigas) como PRO. "Resume Session" aqui é mais restrito — só a **última** sessão daquele projeto+agente, não um histórico buscável — e o usuário decidiu tratá-la como núcleo v1 mesmo assim, já que o clone não tem paywall.

**Teste independente**: abrir um projeto pela primeira vez (só "New Session" disponível), rodar uma sessão, fechar o terminal, abrir de novo o mesmo projeto+agente e confirmar que "Resume Session" aparece e retoma o contexto.

---

## Casos de borda

- QUANDO o CLI do agente existe mas falha ao iniciar ENTÃO o sistema DEVE mostrar o erro no painel do terminal e manter a sessão utilizável
- QUANDO o agente padrão é removido do sistema ENTÃO o sistema DEVE cair para o primeiro agente disponível e avisar
- QUANDO nenhum agente do catálogo está instalado ENTÃO o app DEVE continuar funcional como multiplexador de terminais
- QUANDO o usuário troca o agente padrão ENTÃO sessões já abertas NÃO DEVEM ser afetadas
- QUANDO o usuário clica "Resume Session" (AGT-06) e a retomada falha (ex.: histórico corrompido, CLI mudou de formato) ENTÃO o sistema DEVE cair para "New Session" automaticamente e avisar, em vez de travar o passo AGENT

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| AGT-01 | P1: Catálogo e padrão | Tasks | Done — `T1, T3, T4` |
| AGT-02 | P1: Detecção de CLI ausente | Tasks | Done — `T1` |
| AGT-03 | P1: Sobrescrita por sessão | Tasks | Done — `T2, T4` |
| AGT-04 | P2: Identificação visual | Tasks | Done — `T2, T4` |
| AGT-05 | P2: Escopo por agente | Tasks | **Não coberto** — nenhuma task de `tasks.md` cita este ID. "Escopo por agente nas features de extensão" depende de features de M3 (MCP/Skills) que ainda não existem — plausivelmente adiado por dependência, mas isso nunca foi registrado em `ROADMAP.md` nem `STATE.md` |
| AGT-06 | P1: Retomar ou nova sessão | Tasks | **Novo 03/08/2026** — Pending |

**Cobertura:** 6 requisitos, **4 mapeados e implementados** (AGT-01 a 04), **2 sem cobertura** (`AGT-05` — adiado por dependência de M3; `AGT-06` — novo, ainda sem task) ⚠️

---

## Critérios de sucesso

- [ ] Dois agentes diferentes rodando em paralelo, ambos reportando pelo MCP corretamente
- [ ] Agente ausente do PATH nunca deixa o terminal inutilizável
