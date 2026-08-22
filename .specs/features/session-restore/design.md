# session-restore — Design

## 1. Onde a feature entra

Dois cortes, um em cada ponta do app:

```
BOOT                                    ARRANQUE DE UM TERMINAL
────                                    ───────────────────────
terminal_workspace_get                  TerminalPane (mount)
      │                                       │  pty_spawn { cwd, agent,
      ├─ nenhum terminal salvo ──► setTabs    │              sessionId, resume }
      │                                       ▼
      └─ ≥1 terminal salvo                 SessionConfig
              │                                │
              ▼                                ▼
       RestoreSessionDialog             resolve_launch_command(agent, session)
        (SESS-01..09)                          │
              │                                ▼
      ┌───────┴────────┐                CommandBuilder::new("claude")
      ▼                ▼                  .arg("--session-id"|"--resume")
 Restore Selected   Start Fresh           .arg(<uuid>)
      │                │
      └──► setTabs ────┘  hydrated = true ──► efeito de gravação (LAYOUT-21)
```

O ponto crítico de SESS-01 é **não montar nada antes da escolha**. Isso sai de
graça do estado atual: `App` já nasce com `[createTab('Aba 1')]` (aba vazia,
`EmptyState`) e só troca por `setTabs` quando a leitura resolve. A mudança é
segurar o resultado da leitura em `pendingRestore` em vez de aplicá-lo, e manter
`hydrated.current = false` até a escolha — o que também impede o efeito de
gravação de apagar o workspace enquanto o modal está aberto.

## 2. Modelo de dados

### Frontend (`src/state/terminals.ts`)

```ts
interface TerminalState {
  // ... campos atuais
  /** Id de sessão do agente que ESTE painel fixa no CLI. Persistido. */
  agentSessionId?: string | null
  /** Arrancar retomando (`--resume`) em vez de fixar sessão nova
   *  (`--session-id`). Só vale para o mount atual — não é persistido. */
  resumeSession?: boolean
}
```

`LayoutEntry` (a forma persistida) ganha só `agentSessionId`. `resumeSession`
fica fora de propósito: é decisão de arranque, e persistí-la faria o segundo
boot herdar a escolha do primeiro sem o usuário ter dito nada.

### Banco (migração `009_terminal_session.sql`)

```sql
ALTER TABLE terminal_layout ADD COLUMN agent_session_id TEXT;
```

Anulável, como `tab_id` na migração 008 — linha antiga fica com `NULL`, que é
exatamente o caso "terminal salvo antes desta feature" (switch travado).

### Catálogo (`src-tauri/src/agents/catalog.rs`)

```rust
pub struct AgentDescriptor {
    // ...
    /// Flag que fixa o id da sessão no PRIMEIRO lançamento.
    pub session_new_flag: Option<&'static str>,
    /// Flag que retoma uma sessão já fixada.
    pub session_resume_flag: Option<&'static str>,
}
```

Só `claude-code` preenche (`--session-id` / `--resume`). Os outros quatro ficam
`None`: o Codex expõe `codex resume <id>` como subcomando (não dá para fixar o
id no primeiro lançamento) e os demais não têm flag documentada. Suportar um
agente novo é preencher duas colunas — nenhum `match` por id em lugar nenhum.

## 3. Resolução do comando (`agents/launch.rs`)

`LaunchResolution` ganha `args: Vec<String>` e `resolve_launch_command` ganha um
segundo parâmetro:

```rust
pub struct SessionLaunch<'a> { pub id: &'a str, pub resume: bool }

pub fn resolve_launch_command(
    agent_id: Option<&str>,
    session: Option<SessionLaunch<'_>>,
) -> LaunchResolution
```

Regra, em uma frase: **a flag só entra quando o agente a declara**. `resume:
true` sem `session_resume_flag` cai em `args: vec![]` — nunca em `--session-id`,
que retomaria nada e criaria uma sessão diferente da que o usuário pediu.

A decisão mora aqui e não em `manager.rs` porque `manager` já delega a *escolha
do programa* para este módulo; deixar a escolha dos *argumentos* noutro lugar
partiria a mesma regra em dois arquivos.

## 4. Componente `RestoreSessionDialog`

`src/components/shell/RestoreSessionDialog.tsx`, apresentacional (mesmo padrão de
`NewTerminalDialog`/`LayoutMenu`): recebe o workspace lido e devolve a escolha.

```ts
interface RestoreSelection {
  tabs: WorkspaceTab[]        // só as marcadas, só com terminais marcados
  resumeByTerminalId: Record<string, boolean>
}

interface RestoreSessionDialogProps {
  tabs: WorkspaceTab[]
  /** Ids de agente que declaram flag de retomada (vem de `agent_catalog`). */
  resumableAgentIds: Set<string>
  onRestore: (selection: RestoreSelection) => void
  onStartFresh: () => void
}
```

Estado interno: `checkedTabs`, `checkedTerminals`, `resume` — três `Record`
inicializados com tudo marcado / tudo em "restaurar".

Marcação em cascata (SESS-05): desmarcar a aba desmarca seus terminais;
remarcá-la remarca todos. O caminho inverso (desmarcar o último terminal
desmarca a aba) **não** existe — SESS-06 e o Edge Case pedem o oposto: aba
marcada com zero terminais restaura vazia, com `EmptyState`.

Acessibilidade (guia `ux`, severidade High): `role="dialog"` + `aria-modal`,
foco inicial no botão primário, `outline` visível em todo controle,
`aria-label` por linha (`restaurar sessão de <cwd>`), Escape no `keydown` da
janela. Sem biblioteca de focus-trap: o modal cobre a tela e é a única coisa
interativa enquanto está aberto.

## 5. Contrato de `pty_spawn`

```
pty_spawn { cwd, shell, agent, sessionId?, resume?, channel } -> TerminalId
```

`TerminalPane` recebe `sessionId` e `resume` como props e as lê **no mount**,
sem entrar nas dependências do efeito. Motivo: `resetNonceByTerminalId` já
remonta o painel na hora certa (TERM-13); colocar `sessionId` nas dependências
criaria um segundo caminho de remonte disparando junto com o primeiro.

## 6. Ciclo do id de sessão

| Evento | `agentSessionId` | `resumeSession` |
| --- | --- | --- |
| Novo terminal (diálogo) | novo UUID | `false` |
| Clonar (TERM-12) | **novo** UUID | `false` |
| Reiniciar (TERM-13) | **novo** UUID | `false` |
| Restaurado, switch "restaurar" | o salvo | `true` |
| Restaurado, switch "nova sessão" | novo UUID | `false` |
| Restaurado sem id salvo | novo UUID | `false` |

Clonar gera id novo de propósito: dois painéis com o mesmo `--session-id`
apontariam para a mesma conversa do CLI, e o segundo receberia
"session already in use" ou sobrescreveria o primeiro. TERM-12 pede mesmo `cwd`
e mesmo provedor — nunca a mesma conversa.

## 7. Tratamento de erros

| Falha | Comportamento |
| --- | --- |
| `terminal_workspace_get` rejeita | `console.error`, aba vazia, **sem modal** (LAYOUT-26 inalterado) |
| `terminal_workspace_set` rejeita depois da escolha | `console.error`; a escolha continua valendo na sessão atual |
| CLI recusa `--resume` | Mensagem do CLI no terminal; o app não relança |
| Agente pedido não instalado | Shell puro sem flag de sessão (AGT-04 inalterado) |

## 8. Testes

| Camada | Onde | O que prova |
| --- | --- | --- |
| Rust puro | `agents/launch.rs` | flags certas por (agente, resume); agente sem flag não recebe argumento |
| Rust + SQLite | `terminal/layout.rs` | `agent_session_id` sobrevive ao round-trip e volta `None` na linha antiga |
| jsdom | `RestoreSessionDialog.test.tsx` | marcação em cascata, contador, switch travado, botões |
| jsdom | `App.test.tsx` | modal aparece/não aparece; nenhum `pty_spawn` antes da escolha; `pty_spawn` com `sessionId`/`resume` corretos |
