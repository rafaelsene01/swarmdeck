# Git Worktrees — Especificação

## Problema

Quatro agentes trabalhando no mesmo repositório ao mesmo tempo editam os mesmos arquivos e se atropelam: um sobrescreve o que o outro acabou de escrever, e o diff final é impossível de revisar. Git worktree resolve isso na raiz — cada conversa ganha um checkout próprio da mesma base, então o paralelismo deixa de ser destrutivo.

## Objetivos

- [ ] Rodar 4 agentes no mesmo repositório sem nenhum conflito de escrita
- [ ] Recuperar espaço em disco de worktrees abandonados sem risco de perder trabalho não commitado
- [ ] Levar arquivos git-ignored necessários (`.env`) para cada worktree novo, automaticamente

## Fora de escopo

| Feature | Razão |
|---|---|
| Merge / integração dos worktrees de volta | O usuário faz pelo git normal; o app só isola |
| Resolução de conflitos na UI | Depende da integração git completa, que é feature PRO não observável |

---

## Histórias de usuário

### P1: Worktree por conversa ⭐ MVP

**História**: Como desenvolvedor, quero que cada conversa rode no seu próprio checkout, para agentes paralelos nunca editarem o mesmo arquivo.

**Por que P1**: É a única garantia real de isolamento em paralelismo.

**Critérios de aceite**:
1. QUANDO o usuário abre uma conversa com worktree marcado ENTÃO o sistema DEVE criar um worktree git a partir do branch atual e usá-lo como diretório de trabalho
2. QUANDO o diretório não é um repositório git ENTÃO o sistema DEVE desabilitar a opção e explicar por quê
3. QUANDO o worktree é criado ENTÃO o sistema DEVE associá-lo à conversa e mostrar o vínculo no header do terminal
4. QUANDO a criação do worktree falha ENTÃO o sistema DEVE abrir a conversa no diretório original e avisar, em vez de bloquear o trabalho

**Teste independente**: abrir duas conversas com worktree no mesmo repo, editar o mesmo arquivo nas duas e confirmar que não há interferência.

---

### P1: Modo sempre-worktree ⭐ MVP

**História**: Como desenvolvedor, quero ligar o isolamento de uma vez, para não marcar a caixinha em toda conversa.

**Critérios de aceite**:
1. QUANDO o modo sempre-worktree está ligado ENTÃO toda conversa aberta dentro de um repositório git DEVE receber worktree automaticamente
2. QUANDO o modo está ligado ENTÃO o usuário DEVE continuar podendo desligá-lo em uma conversa específica
3. QUANDO o modo está desligado (padrão) ENTÃO o worktree só DEVE ser criado sob pedido explícito

---

### P1: Cópia de arquivos git-ignored ⭐ MVP

**História**: Como desenvolvedor, quero que meu `.env` esteja presente no worktree, para o agente não travar em configuração faltando.

**Por que P1**: Sem isso o worktree nasce quebrado na maioria dos projetos reais, e o usuário desliga a feature.

**Critérios de aceite**:
1. QUANDO existe um `.worktreeinclude` na raiz do repositório ENTÃO o sistema DEVE copiar para cada worktree novo os caminhos listados nele
2. QUANDO um caminho listado não existe ENTÃO o sistema DEVE pular e registrar, sem falhar a criação
3. QUANDO não existe `.worktreeinclude` ENTÃO o worktree DEVE ser criado limpo, e a UI DEVE explicar que arquivos ignorados não vêm junto

**Teste independente**: listar `.env` no `.worktreeinclude`, criar worktree e confirmar que o arquivo chegou.

---

### P2: Inventário e limpeza

**História**: Como desenvolvedor, quero ver meus worktrees e apagar os que não uso, para recuperar disco sem medo.

**Critérios de aceite**:
1. QUANDO a lista é exibida ENTÃO cada linha DEVE mostrar nome, estado, último uso e tamanho
2. QUANDO o usuário aciona medir tamanhos ENTÃO o sistema DEVE calcular o uso em disco e o total reclamável, sem travar a UI
3. QUANDO um worktree não tem alteração não commitada ENTÃO o sistema DEVE classificá-lo como **Safe**
4. QUANDO um worktree tem alteração não commitada ENTÃO o sistema DEVE classificá-lo como **Review** e exigir confirmação extra para excluir
5. QUANDO o usuário marca um worktree como **Kept** ENTÃO o sistema DEVE excluí-lo de qualquer limpeza automática
6. QUANDO o usuário filtra por estado ou projeto ENTÃO a lista e o total reclamável DEVEM recalcular
7. QUANDO um worktree é excluído ENTÃO o sistema DEVE removê-lo também do registro do git, sem deixar referência órfã

**Teste independente**: criar worktree, editar um arquivo sem commitar, confirmar classificação Review e a confirmação extra na exclusão.

---

## Casos de borda

- QUANDO um worktree é apagado do disco por fora ENTÃO o sistema DEVE detectar na próxima listagem e oferecer limpar a referência
- QUANDO o worktree ainda tem um agente rodando ENTÃO a exclusão DEVE ser bloqueada com explicação
- QUANDO o repositório tem submódulos ENTÃO o sistema DEVE avisar que não são inicializados automaticamente
- QUANDO o disco enche durante a criação ENTÃO o sistema DEVE reverter o worktree parcial
- QUANDO o branch de origem é apagado ENTÃO o worktree DEVE continuar funcionando, marcado como órfão

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| WT-01 | P1: Worktree por conversa | Design | Pending |
| WT-02 | P1: Fallback em falha | Design | Pending |
| WT-03 | P1: Modo sempre-worktree | Design | Pending |
| WT-04 | P1: `.worktreeinclude` | Design | Pending |
| WT-05 | P2: Inventário e tamanhos | — | Pending |
| WT-06 | P2: Estados Safe/Review/Kept | — | Pending |
| WT-07 | P2: Exclusão segura | — | Pending |

**Cobertura:** 7 requisitos, 0 mapeados para tarefas ⚠️

---

## Critérios de sucesso

- [ ] 4 agentes no mesmo repositório, zero colisão de escrita
- [ ] Nenhum worktree com trabalho não commitado é excluído sem confirmação explícita
- [ ] Medição de tamanho de 20 worktrees conclui sem travar a UI
