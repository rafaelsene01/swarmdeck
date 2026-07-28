# STATE — Memória do projeto

Última atualização: 28/07/2026

---

## Decisões

| Data | Decisão | Razão |
|---|---|---|
| 28/07/2026 | Stack: **Tauri 2 + Rust + React/TS** em vez de Electron | Binário ~10MB vs ~150MB, startup mais rápido, e o usuário já trabalha com Tauri em outro projeto. Custo aceito: PTY e integrações precisam ser reescritos em Rust. |
| 28/07/2026 | v1 cobre **apenas o núcleo gratuito** do original | É o único conjunto de features observável na instalação de referência. Especificar features PRO seria inventar comportamento. |
| 28/07/2026 | **Sem camada de monetização** no clone | O original usa tiers Starter/Pro para gate de features. O clone não tem produto comercial atrás — tudo construído é liberado. |
| 28/07/2026 | Specs derivadas de **observação de UI**, não de código | Nenhum arquivo do CodeAgentSwarm foi lido. Funcionalidade não é protegida por copyright; código e assets são. Manter essa separação limpa. |
| 28/07/2026 | Kanban em **janela separada**, como no original | Comportamento observado e defensável: o board é uma superfície de leitura/gestão distinta do trabalho no terminal. |
| 28/07/2026 | Servidor MCP como **sidecar separado**, não embutido no app | Não é escolha de estilo: o agente de CLI spawna servidores MCP como subprocesso stdio, e um app já rodando não pode ser esse subprocesso. |
| 28/07/2026 | Sidecar fala com o app por **IPC local**, e não escreve no banco direto | O app precisa possuir a escrita para empurrar `task_changed` às janelas. Escrita direta impossibilitaria o requisito de refletir no Kanban em < 1s. |
| 28/07/2026 | Saída do PTY via **`tauri::ipc::Channel`** com agregação de 16ms | Documentação do Tauri recomenda `Channel` para streaming e rate limiting explícito; `emit` por chunk derruba a UI sob saída volumosa. |
| 28/07/2026 | Regra "não pula a fase de teste" aplicada pela **ausência de aresta** na máquina de estados | Uma transição que não existe não pode ser esquecida; uma checagem `if` pode. |
| 28/07/2026 | **Sem arrastar cards** entre colunas no v1 | Não observado no original e conflita com a máquina de estados — arrastar para Completed pularia a fase de teste. |

---

## Bloqueios

| Item | Impacto | Estado |
|---|---|---|
| Features PRO atrás de paywall (Git, History, Permissions, Shortcuts, Labels, Turbo) | UI real não observável — não dá para especificar fielmente | **Aceito.** Fora do v1. Só a matriz de features e as descrições curtas do paywall foram registradas em UI-INVENTORY.md. |
| Protocolo MCP do original é um contrato com agentes externos | Se as ferramentas do clone não baterem com os nomes esperados, prompts existentes quebram | **Aberto.** Os nomes de ferramentas foram inferidos das instruções globais do usuário (`CLAUDE.md`), não de documentação oficial. Validar antes de implementar. |

---

## Lições

- A automação de clique na janela do app é **instável**: alguns cliques registram só como hover e a seção não troca. Sempre reler o screenshot para confirmar que a navegação aconteceu, em vez de assumir. Retry com espera maior resolve.
- O **paywall é a melhor fonte de inventário de features** de um produto freemium — expõe a lista completa de capacidades de uma vez, incluindo as que não dá para ver na UI.

---

## Todos

- [ ] Confirmar os nomes exatos das ferramentas MCP contra a implementação real, antes de codificar o servidor
- [ ] Capturar as superfícies pendentes listadas no fim de `UI-INVENTORY.md`
- [ ] Decidir formato de persistência do layout do grid (JSON em disco vs tabela SQLite)
- [x] ~~Verificar se `portable-pty` cobre resize e sinais no Windows~~ — confirmado: `MasterPty::resize(PtySize)` cobre, e ConPTY é suportado. **Novo item:** confirmar em qual versão do crate o flag `PSEUDOCONSOLE_PASSTHROUGH_MODE` é exposto (exige Win11 22H2+, precisa de fallback)
- [ ] Definir o algoritmo de similaridade de tarefas — a spec fixa limiares de 70%/50% mas não o método. Começar com trigram/Levenshtein normalizado e calibrar
- [ ] `D:\ide` **não é um repositório git** — inicializar antes do primeiro commit

---

## Ideias adiadas

- Modo **Tabs** de layout (o original tem Grid + Tabs; v1 entrega só Grid)
- Subtarefas e hierarquia pai-filho no Kanban — existe nas ferramentas MCP do original, mas nenhum card com hierarquia foi observado no board
- Atalhos de teclado por projeto e por terminal
- Labels/etiquetas em tarefas
- Marketplace próprio (MCP e Skills) — v1 lista e gerencia o que está instalado localmente

---

## Preferências

- Usuário escreve em **português**; specs e documentação seguem o mesmo idioma. Identificadores de requisito e nomes de arquivo em inglês.
