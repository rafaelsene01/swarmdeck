# Gerenciador de Skills — Especificação

## Problema

Skills são pastas com um `SKILL.md` que estendem o agente com capacidades reutilizáveis. Hoje instalar uma skill é copiar diretório na mão para o lugar certo de cada agente, e não há como saber o que está instalado sem listar o sistema de arquivos. O app deve tornar isso visível e gerenciável.

## Objetivos

- [ ] Ver todas as skills instaladas e para quais agentes valem, em uma tela
- [ ] Instalar ou remover uma skill sem tocar no explorador de arquivos

## Fora de escopo

| Feature | Razão |
|---|---|
| Editar o conteúdo da skill no app | O usuário edita no seu editor; o app abre a pasta |
| Criar skills do zero | Existem ferramentas dedicadas para isso |

---

## Histórias de usuário

### P1: Listar skills instaladas ⭐ MVP

**História**: Como desenvolvedor, quero ver o que já está instalado e para quem vale, para não instalar duplicado nem no agente errado.

**Critérios de aceite**:
1. QUANDO a tela abre ENTÃO o sistema DEVE listar as skills encontradas no diretório de skills, com contagem total
2. QUANDO uma skill é exibida ENTÃO o card DEVE mostrar nome, tipo de acionamento, descrição e os ícones dos agentes compatíveis
3. QUANDO uma skill não declara descrição ENTÃO o sistema DEVE indicar isso explicitamente, em vez de deixar o campo vazio
4. QUANDO o usuário filtra por agente ENTÃO o sistema DEVE mostrar só as compatíveis e exibir a contagem por agente
5. QUANDO o usuário busca por texto ENTÃO o sistema DEVE filtrar por nome e descrição
6. QUANDO o usuário aciona atualizar ENTÃO o sistema DEVE reler o diretório e refletir o que mudou por fora

**Teste independente**: adicionar uma pasta de skill por fora, acionar atualizar e vê-la aparecer.

---

### P2: Gerenciar skills

**História**: Como desenvolvedor, quero abrir, exportar e remover skills pelo app.

**Critérios de aceite**:
1. QUANDO o usuário aciona abrir pasta ENTÃO o sistema DEVE abrir o diretório da skill no explorador do SO
2. QUANDO o usuário remove uma skill ENTÃO o sistema DEVE pedir confirmação nomeando a skill antes de apagar
3. QUANDO o usuário exporta uma skill para um agente ENTÃO o sistema DEVE copiá-la para o diretório de configuração daquele agente e confirmar o destino
4. QUANDO o destino da exportação já tem uma skill de mesmo nome ENTÃO o sistema DEVE pedir confirmação para sobrescrever

---

### P3: Marketplace de skills

**História**: Como desenvolvedor, quero descobrir e instalar skills prontas.

**Critérios de aceite**:
1. QUANDO o marketplace é aberto ENTÃO o sistema DEVE listar skills disponíveis com nome, descrição e origem
2. QUANDO o usuário instala ENTÃO o sistema DEVE baixar para o diretório de skills e a skill DEVE aparecer em Instaladas
3. QUANDO o marketplace está inacessível ENTÃO o sistema DEVE avisar sem afetar a aba de instaladas

---

## Casos de borda

- QUANDO uma pasta de skill não tem `SKILL.md` válido ENTÃO o sistema DEVE listá-la marcada como inválida, com o motivo
- QUANDO o diretório de skills não existe ENTÃO o sistema DEVE oferecer criá-lo
- QUANDO duas skills têm o mesmo nome em diretórios diferentes ENTÃO o sistema DEVE mostrar as duas com o caminho de origem
- QUANDO a remoção falha por permissão ENTÃO o sistema DEVE mostrar o erro do SO, sem sumir com a skill da lista
- QUANDO não há skill instalada ENTÃO o sistema DEVE mostrar estado vazio que explica o que são skills

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| SKL-01 | P1: Listagem e leitura do disco | Design | Pending |
| SKL-02 | P1: Filtro por agente e busca | Design | Pending |
| SKL-03 | P2: Abrir, remover, exportar | — | Pending |
| SKL-04 | P3: Marketplace | — | Pending |

**Cobertura:** 4 requisitos, 0 mapeados para tarefas ⚠️

---

## Critérios de sucesso

- [ ] Skills do disco aparecem na lista sem configuração manual
- [ ] Skill exportada para um agente é reconhecida por ele na sessão seguinte
