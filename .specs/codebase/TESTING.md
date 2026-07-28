# Estratégia de teste — SwarmDeck

**Definido em:** 28/07/2026 (projeto greenfield — esta é a definição, não uma observação)
**Decisão:** Rust + Vitest, sem e2e. E2E de app desktop é lento e frágil; entra depois se a dor aparecer.

---

## Comandos de gate

| Gate | Comando | Quando |
|---|---|---|
| **quick** | `cargo test --lib && npm run test` | Tarefa que toca uma camada com teste unitário |
| **full** | `cargo test && npm run test` | Tarefa que toca IPC, banco ou integra componentes |
| **build** | `cargo build && npm run build` | Tarefa de scaffolding ou config que não produz lógica testável |

`cargo test --lib` roda só os testes unitários in-crate (rápido). `cargo test` inclui `tests/` — os de integração, que tocam disco e socket.

---

## Matriz de cobertura

| Camada de código | Local | Teste exigido | Razão |
|---|---|---|---|
| Sessão / gerência de PTY | `src-tauri/src/terminal/{session,manager}.rs` | **integration** | Spawna processo real. Mock de PTY não prova nada — o valor está em confirmar que ConPTY/openpty se comportam. |
| Throttle de saída | `src-tauri/src/terminal/throttle.rs` | **unit** | Lógica pura de buffer e janela de tempo. Testável sem I/O. |
| Serviços de domínio | `src-tauri/src/tasks/service.rs`, `terminal/meta.rs` | **unit** | Máquina de estados e regras de negócio. Onde os bugs caros moram. |
| Migrações / camada de banco | `src-tauri/src/db/` | **integration** | Precisa de SQLite real; migração que não roda contra o banco não está testada. |
| Servidor IPC | `src-tauri/src/ipc/server.rs` | **integration** | Socket real, incluindo o caminho de recusa por terminal inválido. |
| Sidecar MCP | `crates/swarmdeck-mcp/` | **integration** | O que importa é o round-trip stdio→IPC, não as funções isoladas. |
| Comandos Tauri (`#[tauri::command]`) | `src-tauri/src/commands/` | **none** | Só se forem invólucros finos delegando ao serviço. Se um comando ganhar lógica, ele vira serviço e passa a exigir unit. |
| Componentes React com estado/lógica | `KanbanBoard`, `GridLayout`, hooks | **unit** | Derivação de colunas, aplicação de delta, cálculo de frações. |
| Componentes React de apresentação | `TaskCard`, `TerminalHeader` | **none** | Renderizam props. Teste aqui só testaria o React. |
| Ponte xterm.js ↔ Channel | `TerminalPane.tsx` | **none** | Fronteira com biblioteca externa e DOM real; unit test daria falso conforto. Coberto na prática pelo teste de integração do PTY. |

**Regra de precedência:** tarefa que cria múltiplas camadas usa o **tipo mais alto** exigido por qualquer uma delas.

---

## Avaliação de paralelismo

| Tipo de teste | Parallel-safe | Por quê |
|---|---|---|
| Rust **unit** (`cargo test --lib`) | ✅ Sim | Lógica pura, sem recurso compartilhado |
| Rust **integration** — banco | ❌ **Não** | Compartilham arquivo SQLite. Rodar em paralelo gera lock contention e falha intermitente. |
| Rust **integration** — IPC | ❌ **Não** | Named pipe / socket tem nome fixo. Duas suítes disputam o mesmo endpoint. |
| Rust **integration** — PTY | ❌ **Não** | Spawna processos reais; concorrência torna os testes não determinísticos |
| Vitest (React) | ✅ Sim | Isolado por arquivo, sem estado global |

**Consequência para as tarefas:** qualquer tarefa cujo `Tests: integration` **não pode receber `[P]`**, mesmo que seu código não tenha dependência. O gargalo é a execução do teste, não o código.

---

## Contagem de testes

Toda tarefa declara a contagem esperada no `Done when`. Isso existe para impedir remoção silenciosa de teste — se a contagem cair sem justificativa, o gate falhou mesmo com tudo verde.

---

## Fora de escopo

- **E2E / `tauri-driver` + WebdriverIO** — decisão explícita do usuário. Reavaliar se aparecer regressão de integração que os testes atuais não pegam.
- **Testes de performance** — os critérios de sucesso das specs (latência < 50ms, 200 tarefas sem travar) são validados manualmente por ora.
- **Snapshot testing de UI** — quebra a cada ajuste de estilo e não pega bug real.
