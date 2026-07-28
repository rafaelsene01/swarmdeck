# Gerenciamento de servidores MCP — Especificação

## Problema

Servidores MCP são o que dá ferramentas extras aos agentes, mas hoje configurá-los significa editar JSON à mão em arquivos espalhados, com sintaxe fácil de errar e sem feedback quando um servidor não sobe. O app já é o lugar onde os agentes rodam — deve ser também onde eles ganham capacidades.

## Objetivos

- [ ] Adicionar um servidor MCP sem abrir editor de texto
- [ ] Ver em um relance quais servidores estão ativos e quais falharam ao iniciar

## Fora de escopo

| Feature | Razão |
|---|---|
| **Manage MCP Permissions** | Feature PRO do original, não observável |
| Hospedar servidores MCP | O app só configura e lança processos existentes |

---

## Histórias de usuário

### P1: CRUD de servidor MCP ⭐ MVP

**História**: Como desenvolvedor, quero adicionar, editar e remover servidores MCP pela interface, para não editar JSON na mão.

**Critérios de aceite**:
1. QUANDO a lista é exibida ENTÃO cada servidor DEVE mostrar indicador de estado, nome e a linha de comando completa
2. QUANDO o usuário adiciona um servidor ENTÃO o sistema DEVE pedir nome, comando, argumentos e variáveis de ambiente
3. QUANDO o nome informado já existe ENTÃO o sistema DEVE recusar e apontar o conflito
4. QUANDO o usuário edita um servidor ENTÃO o sistema DEVE persistir e informar que a mudança vale a partir da próxima sessão de agente
5. QUANDO o usuário remove um servidor ENTÃO o sistema DEVE pedir confirmação nomeando o servidor
6. QUANDO o usuário aciona visualizar ENTÃO o sistema DEVE mostrar a configuração completa em formato legível

**Teste independente**: adicionar um servidor, iniciar sessão nova e confirmar que o agente enxerga suas ferramentas.

---

### P2: Estado do servidor

**História**: Como desenvolvedor, quero saber se um servidor está funcionando, para não descobrir pelo agente falhando.

**Critérios de aceite**:
1. QUANDO um servidor inicia com sucesso ENTÃO o indicador DEVE ficar ativo
2. QUANDO um servidor falha ao iniciar ENTÃO o indicador DEVE ficar em erro e expor a mensagem de falha
3. QUANDO o usuário passa o mouse sobre o indicador ENTÃO o sistema DEVE mostrar o estado e o horário da última tentativa

---

### P3: Marketplace

**História**: Como desenvolvedor, quero descobrir servidores MCP prontos, para não pesquisar fora do app.

**Critérios de aceite**:
1. QUANDO o marketplace é aberto ENTÃO o sistema DEVE listar servidores disponíveis com nome, descrição e origem
2. QUANDO o usuário instala do marketplace ENTÃO o sistema DEVE pré-preencher a configuração e pedir confirmação antes de gravar
3. QUANDO o marketplace está inacessível ENTÃO o sistema DEVE avisar sem quebrar o restante das configurações

---

## Casos de borda

- QUANDO o comando do servidor não existe no PATH ENTÃO o sistema DEVE sinalizar no momento de salvar, não só ao iniciar
- QUANDO um servidor trava durante o início ENTÃO o sistema DEVE aplicar timeout e marcá-lo como falho
- QUANDO a configuração em disco é editada por fora ENTÃO o sistema DEVE recarregar e refletir na lista
- QUANDO a configuração contém segredos ENTÃO a UI DEVE mascará-los por padrão, revelando sob ação explícita
- QUANDO nenhum servidor está configurado ENTÃO o sistema DEVE mostrar estado vazio que explica o que é MCP

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| MCPM-01 | P1: CRUD | Design | Pending |
| MCPM-02 | P1: Validação e conflito de nome | Design | Pending |
| MCPM-03 | P2: Indicador de estado | — | Pending |
| MCPM-04 | P2: Mascarar segredos | — | Pending |
| MCPM-05 | P3: Marketplace | — | Pending |

**Cobertura:** 5 requisitos, 0 mapeados para tarefas ⚠️

---

## Critérios de sucesso

- [ ] Servidor MCP configurado pela UI fica disponível ao agente na sessão seguinte
- [ ] Servidor quebrado é identificável pela UI, sem ler log
