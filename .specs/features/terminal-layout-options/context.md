# terminal-layout-options — Contexto e decisões do usuário

Decisões tomadas em conversa durante a fase de Specify, e o que ficou para depois.

## Decisões confirmadas

| Questão | Decisão | Quando |
| --- | --- | --- |
| Onde vive a escolha de qual painel ocupa a largura toda com 3 terminais | Sub-opção aninhada sob "Horizontal", no mesmo popover, visível só quando a aba tem exatamente 3 terminais | 16/08/2026 |
| Escopo do modo de layout | Por aba | 16/08/2026 |
| Persistência | Persistir abas e terminais de verdade, construindo a ponte Tauri que não existia para `layout::save`/`restore` | 16/08/2026 |
| Comportamento do boot com estado salvo | **Restaura direto, sem perguntar** — o app reabre como o usuário deixou. Confirmado depois de ver o resultado da execução, quando a alternativa (perguntar antes) foi explicitamente adiada | 16/08/2026 |

## Ideias adiadas (Deferred Ideas)

### Modal de seleção do que restaurar

Ao abrir o app com estado salvo, mostrar um modal que deixa o usuário:

- marcar quais **abas** e quais **terminais** devem ser restaurados; ou
- escolher abrir direto em `home`, sem restaurar aba nem terminal.

**Status**: adiada de propósito pelo usuário em 16/08/2026, com o comportamento
atual (restaurar tudo, sem perguntar) mantido como padrão até lá.

**Por que não entrou agora**: é uma feature de produto própria — tem UI,
estados de seleção e um caminho de "descartar o estado salvo" que precisa
decidir se apaga o banco ou só ignora a leitura desta vez. Enfiá-la no escopo
do layout misturaria duas decisões independentes.

**O que já existe a favor dela**: `terminal_workspace_get` devolve o
`TabEntry[]` completo antes de qualquer terminal ser montado, então o modal
teria o dado que precisa sem comando novo. O ponto de enxerto é o `useEffect`
de boot em `App.tsx` (T11), entre a leitura resolver e o `setTabs`.
