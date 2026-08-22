# terminal-layout-options — Design

**Spec**: `.specs/features/terminal-layout-options/spec.md`

## Panorama

Três camadas, nesta ordem de dependência:

```
src/state/layout.ts        (puro)   layoutPlan(count, layout) → {columns, rows, spans}
src/state/terminals.ts     (puro)   moveTerminal(terminals, fromId, toId)
        ↓
src/components/grid/GridLayout.tsx  aplica o plano ao CSS grid, divisórias só onde cabem
src/components/shell/LayoutMenu.tsx botão + popover (print/layout.png)
src/components/terminal/TerminalHeader.tsx  alça vira fonte de arrasto
        ↓
src/App.tsx                          estado por aba, drop target, boot/save
        ↓
src-tauri  layout.rs (TabEntry) → commands/terminal.rs → lib.rs → migração 008
```

O núcleo de decisão é **puro e testável sem DOM**: `layoutPlan` responde
LAYOUT-07..14 com funções, não com render. Os componentes só traduzem o plano
em CSS.

---

## 1. Modelo de layout (`src/state/layout.ts`, novo)

```ts
export type LayoutMode = 'horizontal' | 'vertical'
export type LayoutSpan = 'first' | 'last'
export interface TabLayout { mode: LayoutMode; span: LayoutSpan }

export const DEFAULT_LAYOUT: TabLayout = { mode: 'horizontal', span: 'first' }

export interface LayoutPlan {
  columns: number
  rows: number
  /** Quantas colunas cada painel ocupa, na ordem da aba. */
  spans: number[]
}

export function layoutPlan(count: number, layout: TabLayout): LayoutPlan
```

Tabela de verdade (é literalmente a tabela de testes):

| modo | count | span | columns | rows | spans | Requisito |
| --- | --- | --- | --- | --- | --- | --- |
| horizontal | 1 | — | 1 | 1 | `[1]` | LAYOUT-12 |
| horizontal | 2 | — | 2 | 1 | `[1,1]` | LAYOUT-07 |
| horizontal | 3 | first | 2 | 2 | `[2,1,1]` | LAYOUT-09 |
| horizontal | 3 | last | 2 | 2 | `[1,1,2]` | LAYOUT-10 |
| horizontal | 4 | — | 2 | 2 | `[1,1,1,1]` | LAYOUT-08 |
| vertical | N | — | 1 | N | `[1×N]` | LAYOUT-11 |
| vertical | 1 | — | 1 | 1 | `[1]` | LAYOUT-12 |

`gridTemplate(count)` de `GridLayout.tsx` continua existindo e é **reusada**
pelo ramo horizontal — TERM-03 não muda, só ganha as variantes de span por
cima. Nenhum teste existente de `gridTemplate` é alterado.

`span` é guardado sempre, inclusive quando a aba não tem 3 terminais
(LAYOUT-15): é um campo do `TabLayout`, não um estado derivado da contagem.

## 2. Reordenação (`src/state/terminals.ts`, acréscimo)

```ts
export function moveTerminal(
  terminals: TerminalState[], fromId: string, toId: string,
): TerminalState[]
```

Remove `fromId` da lista e o reinsere no índice que `toId` ocupa na lista
**original** (`arrayMove` padrão). `fromId === toId`, id inexistente ou lista
de 1 devolve a lista original (LAYOUT-19, edge case "arrastar sobre si mesmo").

*(Corrigido na execução de T2. A primeira redação dizia "na lista já sem o
arrastado", o que torna arrastar sobre o vizinho imediato da direita um no-op
— `[a,b,c]`, `a→b` devolveria `[a,b,c]` — contradizendo LAYOUT-16. O worker
seguiu o AC, que é a fonte de verdade, e marcou `SPEC_DEVIATION` no código.)*
Mesmo formato das vizinhas (`maximize`, `minimize`, `close`): puras, recebem e
devolvem `TerminalState[]`.

**Frações depois do move**: `moveTerminal` não mexe em `fracW`. As frações
seguem o terminal — quem estava com 0.7 continua com 0.7 na nova posição.
`evenWidths` só roda em criar/fechar, como hoje.

## 3. `GridLayout.tsx`

Três mudanças, nenhuma reescrita:

**a) Prop nova `layout: TabLayout`** (default `DEFAULT_LAYOUT`, para não quebrar
os testes existentes que montam `GridLayout` sem ela). `columns`/`rows` passam a
vir de `layoutPlan`; cada célula recebe `gridColumn: span N` conforme
`plan.spans[index]`.

**b) Correção da sincronia de `panes`.** Hoje:

```ts
const effectivePanes = panes.length === localPanes.length ? localPanes : panes
```

A comparação por **contagem** é o bug já documentado em `App.tsx:232-242`:
mudar `mode` ou reordenar mantém a contagem, então o snapshot local
(desatualizado) vence. Passa a comparar a **sequência de ids**:

```ts
const paneKey = panes.map((p) => p.id).join('|')
const localKey = localPanes.map((p) => p.id).join('|')
const effectivePanes = paneKey === localKey ? localPanes : panes
```

Isso é o que faz a reordenação chegar ao grid (LAYOUT-16) sem remontar nada.
Não resolve troca de `mode` com mesma ordem — esse caminho continua tratado
pelo estilo inline de `App.tsx`, como está hoje; fora do escopo desta feature.

**c) Divisória só entre vizinhos da mesma linha.** Hoje a divisória nasce entre
`pane[i]` e `pane[i+1]` sempre. Com spans e com o modo vertical isso produziria
uma alça que redimensiona painéis de linhas diferentes. Regra nova, derivada do
plano: renderiza a divisória entre `i` e `i+1` somente quando
`plan.columns > 1`, ambos têm `span === 1` e ambos caem na mesma linha
(`rowOf(i) === rowOf(i+1)`, com `rowOf` acumulando os spans). No modo vertical
`columns === 1`, então nenhuma divisória aparece — coerente com "alturas iguais,
sem redimensionar" (Out of Scope).

## 4. `LayoutMenu.tsx` (novo, `src/components/shell/`)

```tsx
interface LayoutMenuProps {
  count: number
  layout: TabLayout
  onChange: (layout: TabLayout) => void
}
```

- Botão `Columns2` (o mesmo glifo que hoje está inerte no header), `aria-label="layout options"`, `title="Opções de layout"`, desabilitado quando `count === 0` (LAYOUT-06).
- Popover em `position: absolute` sob o botão, **reusando a linguagem visual do popover de cota** (`#17171a`, borda `#2b2b31`, raio 10px, sombra `0 12px 32px rgba(0,0,0,.45)`) — é o padrão do projeto e é o que o print mostra.
- Cabeçalho: `${count} ${count === 1 ? 'TERMINAL' : 'TERMINAIS'}` em maiúsculas, `letter-spacing: .08em`, cor `var(--muted)` (LAYOUT-01).
- Itens: `Columns2` "Horizontal", `Rows2` "Vertical". Ativo recebe borda `var(--accent)` e texto na cor de acento (LAYOUT-03), como no print.
- Sub-itens indentados sob Horizontal, **só quando `count === 3` e `mode === 'horizontal'`** (LAYOUT-13, LAYOUT-14): "Largura toda em cima" (`span: 'first'`) e "Largura toda embaixo" (`span: 'last'`).
- Fecha em Escape e em clique fora (LAYOUT-05) — `useEffect` com listener em `document`, mesmo mecanismo já usado para o Ctrl+T de `App.tsx`. Nenhuma dependência nova.

Ao trocar de modo, `onChange` recebe o `TabLayout` inteiro (mode + span
preservado) e o popover fecha (LAYOUT-04).

**Header**: `LayoutMenu` substitui o `<button disabled aria-label="split">`
(`Header.tsx:116-118`), mantendo a posição imediatamente à esquerda do
`QuotaIndicator` (LAYOUT-02). O botão `LayoutGrid` do grupo da esquerda
continua inerte — não é este.

## 5. Arrastar e soltar

Nativo HTML5, sem biblioteca:

- **Origem** — `TerminalHeader`: a alça `GripVertical` (hoje decorativa,
  `TerminalHeader.tsx:137`) vira `<span draggable onDragStart>` com
  `effectAllowed = 'move'`. Prop nova `onDragStartReorder?: (event) => void`;
  sem ela a alça segue decorativa e os testes atuais não mudam. Quem escreve o
  id no `dataTransfer` é o **`App.tsx`**, dentro do callback — o `id` que
  `TerminalHeader` recebe por prop é o id de *sessão do backend*, e
  `moveTerminal` chaveia pelo id de *painel*. *(Corrigido na execução de T6; a
  primeira redação punha o `setData` dentro do `TerminalHeader`.)*
- **Alvo** — o `div.app-pane` de `App.tsx`: `onDragOver` (com `preventDefault`,
  senão o drop nunca dispara) marca `data-drop-target="true"` (LAYOUT-17,
  destaque via CSS: borda `var(--accent)`); `onDragLeave` limpa; `onDrop`
  chama `moveTerminal`.
- Soltar fora de qualquer painel não dispara `onDrop` nenhum → ordem intacta
  (LAYOUT-19), sem código para isso.
- **Nada desmonta** (LAYOUT-18): a `key` de cada painel continua sendo
  `pane.id` e a do `TerminalPane` continua `${id}:${resetNonce}`. React
  reordena os nós existentes com `insertBefore`; mover um nó no DOM preserva
  seus filhos, e o `<canvas>` do xterm mantém o bitmap. O `FitAddon` já
  reage a resize; a reordenação não muda o tamanho da célula em `vertical`
  nem em `horizontal` sem span.

**Risco conhecido**: mover o nó do xterm no DOM em navegadores WebKit/WebView2
pode exigir um `fit()` extra. Se o teste manual mostrar terminal em branco
após reordenar, a correção é uma chamada de `fit` no `TerminalPane` — não uma
mudança de arquitetura.

## 6. Persistência

### 6.1 Migração `008_terminal_workspace.sql`

```sql
CREATE TABLE terminal_tabs (
  id           TEXT PRIMARY KEY,
  slot         INTEGER NOT NULL,
  name         TEXT    NOT NULL,
  layout_mode  TEXT    NOT NULL DEFAULT 'horizontal',
  layout_span  TEXT    NOT NULL DEFAULT 'first',
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_terminal_tabs_slot ON terminal_tabs (slot);

ALTER TABLE terminal_layout ADD COLUMN tab_id TEXT;
CREATE INDEX idx_terminal_layout_tab ON terminal_layout (tab_id, slot);
```

Sem `CHECK` em `layout_mode`/`layout_span`: LAYOUT-28 exige que valor
desconhecido **caia no default** em vez de falhar, e é o Rust que faz esse
mapeamento — mesmo tratamento que `quota_prefs::get` dá a JSON ilegível.
`tab_id` entra como coluna anulável para não quebrar linhas de bancos
existentes; linhas com `tab_id` nulo ou apontando para aba inexistente são
descartadas na restauração (LAYOUT-25).

### 6.2 `layout.rs`

`save`/`restore` hoje **não têm chamador nenhum** (`grep` em `src-tauri/src`
só acha o `pub use` de `mod.rs`) e não têm testes. São reaproveitados para a
forma com abas em vez de duplicados:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabEntry {
    pub id: String,
    pub slot: i64,
    pub name: String,
    pub layout_mode: String,   // "horizontal" | "vertical"
    pub layout_span: String,   // "first" | "last"
    pub terminals: Vec<LayoutEntry>,
}

pub fn save(db: &Db, tabs: &[TabEntry]) -> Result<(), DbError>
pub fn restore(db: &Db, home: &Path) -> Result<Vec<TabEntry>, DbError>
```

- `save`: uma **transação** — `DELETE FROM terminal_tabs`, `DELETE FROM
  terminal_layout`, depois os inserts (LAYOUT-27). Falha no meio faz rollback:
  nunca sobra aba de uma gravação com terminal de outra.
- `restore`: lê abas por `slot`, lê os terminais de cada aba por `slot`,
  normaliza `layout_mode`/`layout_span` desconhecidos para o default
  (LAYOUT-28), aplica o fallback de `cwd` inexistente que já existe hoje
  (LAYOUT-25 do spec / TERM-07) e **devolve vetor vazio** quando não há aba
  salva. `default_entry` sai: LAYOUT-24 diz que primeira execução abre aba
  vazia, o oposto de inventar um terminal.
- `LayoutEntry` ganha `Serialize`/`Deserialize` com `rename_all = "camelCase"`,
  para casar com o tipo TS que já existe em `state/terminals.ts`.

### 6.3 Comandos

`commands/terminal.rs`, no padrão `quota_prefs_get`/`quota_prefs_set`:

```rust
#[tauri::command] pub fn terminal_workspace_get(db: State<'_, Mutex<Db>>) -> Result<Vec<TabEntry>, String>
#[tauri::command] pub fn terminal_workspace_set(db: State<'_, Mutex<Db>>, tabs: Vec<TabEntry>) -> Result<(), String>
```

Registrados em `lib.rs::invoke_handler`. `home` para o fallback de `cwd` vem de
`dirs::home_dir()`, a mesma fonte que `commands/quota.rs:199` usa.

*(Corrigido na execução de T10. A primeira redação dizia `paths.rs`; esse
módulo resolve o diretório de **dados** do app, não o home do usuário.)*

### 6.4 `App.tsx`

- **Boot**: `useEffect` de montagem chama `terminal_workspace_get`. Vetor não
  vazio → `setTabs` com as abas restauradas e `setAgentByTerminalId` remontado
  a partir de `agentId` de cada terminal (LAYOUT-23). Vetor vazio ou erro →
  mantém a aba vazia inicial e, no erro, `console.error` (LAYOUT-24, LAYOUT-26).
- **Guarda contra apagar o que acabou de ler**: um `useRef` `hydrated` só vira
  `true` depois que a leitura resolve; o efeito de gravação não faz nada
  enquanto for `false`. Sem isso, o primeiro render (aba vazia) gravaria por
  cima do estado salvo antes da leitura chegar.
- **Gravação**: `useEffect` sobre `[tabs]` com `setTimeout` de 500 ms, limpo na
  próxima mudança (LAYOUT-21). Serializa `tabs` → `TabEntry[]` reusando
  `toLayoutEntries` de `state/terminals.ts`, acrescentando `agentId` de
  `agentByTerminalId`. O `agentByTerminalId` entra nas dependências do efeito
  porque muda junto (LAYOUT-22).
- **Estado do layout**: `TerminalTab` ganha o campo `layout: TabLayout`.
  `createTab` nasce com `DEFAULT_LAYOUT`.

Fluxo:

```
boot → terminal_workspace_get → tabs (ou aba vazia) → hydrated = true
                                        ↓
    qualquer mudança em tabs/agentes → debounce 500ms → terminal_workspace_set
```

---

## Requisitos × implementação

| Requisito | Onde |
| --- | --- |
| LAYOUT-01..06 | `src/components/shell/LayoutMenu.tsx`, `src/components/shell/Header.tsx` |
| LAYOUT-07..12 | `src/state/layout.ts` (`layoutPlan`), `src/components/grid/GridLayout.tsx` |
| LAYOUT-13, 14 | `src/components/shell/LayoutMenu.tsx` |
| LAYOUT-15 | `src/state/layout.ts` (span é campo, não derivado), `src/App.tsx` |
| LAYOUT-16, 19 | `src/state/terminals.ts` (`moveTerminal`), `src/App.tsx` |
| LAYOUT-17 | `src/App.tsx` (`data-drop-target`), `src/components/terminal/TerminalHeader.tsx` |
| LAYOUT-18 | `src/App.tsx` (keys estáveis), `src/components/grid/GridLayout.tsx` (sincronia por id) |
| LAYOUT-20 | `src/components/grid/GridLayout.tsx` (plano reaplicado à nova ordem) |
| LAYOUT-21, 22 | `src/App.tsx` (debounce + serialização) |
| LAYOUT-23 | `src/App.tsx` (boot), `src-tauri/src/terminal/layout.rs` (`restore`) |
| LAYOUT-24 | `src-tauri/src/terminal/layout.rs` (vetor vazio), `src/App.tsx` |
| LAYOUT-25 | `src-tauri/src/terminal/layout.rs` (fallback de `cwd`, descarte de órfão) |
| LAYOUT-26 | `src/App.tsx` (catch), `src-tauri/src/commands/terminal.rs` |
| LAYOUT-27 | `src-tauri/src/terminal/layout.rs` (`save` em transação) |
| LAYOUT-28 | `src-tauri/src/terminal/layout.rs` (normalização) |
| LAYOUT-29 | Consequência do modelo: `TerminalPane` sempre chama `pty_spawn` no mount |

## Decisões de arquitetura candidatas a AD

1. **O plano de layout é função pura, não CSS espalhado.** `layoutPlan` decide
   colunas/linhas/spans; `GridLayout` só traduz. Sem isso, cada regra de
   disposição vira um teste de render com jsdom — mais lento, mais frágil e
   pior de ler.
2. **A sincronia de `panes` em `GridLayout` passa a ser por sequência de ids.**
   A comparação por contagem é um bug conhecido e documentado; a reordenação
   torna a correção obrigatória em vez de opcional.
3. **`layout::save`/`restore` são reaproveitados, não duplicados.** Eram código
   morto desde que foram escritos; ganhar abas é a primeira vez que têm
   chamador.
