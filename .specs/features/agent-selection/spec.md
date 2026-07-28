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
| **Turbo Mode** | Feature PRO do original, não observável |

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

## Casos de borda

- QUANDO o CLI do agente existe mas falha ao iniciar ENTÃO o sistema DEVE mostrar o erro no painel do terminal e manter a sessão utilizável
- QUANDO o agente padrão é removido do sistema ENTÃO o sistema DEVE cair para o primeiro agente disponível e avisar
- QUANDO nenhum agente do catálogo está instalado ENTÃO o app DEVE continuar funcional como multiplexador de terminais
- QUANDO o usuário troca o agente padrão ENTÃO sessões já abertas NÃO DEVEM ser afetadas

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| AGT-01 | P1: Catálogo e padrão | Design | Pending |
| AGT-02 | P1: Detecção de CLI ausente | Design | Pending |
| AGT-03 | P1: Sobrescrita por sessão | Design | Pending |
| AGT-04 | P2: Identificação visual | — | Pending |
| AGT-05 | P2: Escopo por agente | — | Pending |

**Cobertura:** 5 requisitos, 0 mapeados para tarefas ⚠️

---

## Critérios de sucesso

- [ ] Dois agentes diferentes rodando em paralelo, ambos reportando pelo MCP corretamente
- [ ] Agente ausente do PATH nunca deixa o terminal inutilizável
