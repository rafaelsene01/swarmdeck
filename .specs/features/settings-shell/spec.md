# Janela de Configurações (Settings Shell) — Especificação

**Sem design — feature pequena, design inline** (mesmo padrão de `agent-selection`/`projects`).

## Problema

Quatro painéis de configuração já existem, testados isoladamente e nunca alcançáveis por um usuário real: `AgentPanel.tsx` (agent-selection), `ProjectsPanel.tsx` (projects), `StatusesPanel.tsx` (terminal-statuses) e `UpdateSettings.tsx` (release-distribution). Nenhum é montado em janela ou rota nenhuma — achado da `spec-triage` run 006 (03/08/2026), registrado em `.specs/project/STATE.md`. Sem um container que os hospede, nenhum dos quatro é usável, apesar de cada um passar seu próprio gate de teste.

## Objetivos

- [ ] Dar aos 4 painéis já construídos um lugar real na UI, sem redesenhá-los
- [ ] Permitir trocar entre eles sem fechar e reabrir uma janela
- [ ] Não bloquear o uso dos terminais enquanto Configurações está aberta

## Fora de escopo

| Feature | Razão |
|---|---|
| Redesenhar qualquer um dos 4 painéis | Já existem, testados, funcionais isoladamente — este é só o container |
| Busca global dentro de Configurações | Não pedido; 4 seções não justificam busca ainda |
| Configurações por projeto | Fora do escopo observado na instalação de referência (ver `projects/spec.md`) |
| Atalho de teclado dedicado para abrir Configurações | Não especificado; segue o padrão simples de clique no botão da toolbar, igual ao Kanban |

---

## Decisão de arquitetura (registrada na triagem 006, não é gray-area em aberto)

Mesma arquitetura já usada por `task-kanban` (`windows/kanban.rs` + `WebviewWindowBuilder`): uma **segunda janela**, não um modal sobre a janela principal. Motivo: os 4 painéis já foram construídos como telas cheias, não como conteúdo de modal, e o precedente do Kanban já resolveu o problema de "qual mecanismo de rota usar" (branch por `label` da janela atual em `main.tsx`, sem `react-router` — só rótulos fixos, já que o número de janelas é pequeno e conhecido). Configurações estende esse mesmo branch para um terceiro caso (`main` / `kanban` / `settings`), em vez de inventar um mecanismo novo.

---

## Histórias de usuário

### P1: Abrir Configurações em janela própria ⭐ MVP

**História**: Como desenvolvedor, quero abrir uma janela de Configurações a partir da toolbar principal, para acessar agentes, projetos, status e atualizações sem atrapalhar meus terminais abertos.

**Por que P1**: Sem isso, os 4 painéis continuam inatingíveis — é o requisito que desbloqueia `AGT-01`, `AGT-04`, `PROJ-01/02/05`, `STAT-02/03`, `REL-32/33/34`.

**Critérios de aceite**:
1. QUANDO o usuário clica em "Configurações" na toolbar principal ENTÃO o sistema DEVE abrir uma janela dedicada
2. QUANDO a janela de Configurações já está aberta e o usuário clica em "Configurações" de novo ENTÃO o sistema DEVE **focar** a janela existente, nunca criar uma segunda
3. QUANDO a janela principal é fechada ENTÃO a janela de Configurações DEVE fechar junto (mesma regra de cascata do Kanban, `KAN-08` critério 2)
4. QUANDO a janela de Configurações está aberta ENTÃO os terminais na janela principal DEVEM continuar rodando e responsivos

**Independente do agente escolhido no mesmo diálogo** — não aplica aqui.

**Teste independente**: abrir Configurações duas vezes seguidas — uma janela só, focada na segunda tentativa.

---

### P1: Navegar entre as 4 seções ⭐ MVP

**História**: Como desenvolvedor, quero trocar entre Agentes, Projetos, Status e Atualizações sem sair da janela de Configurações, para ajustar mais de uma coisa na mesma visita.

**Critérios de aceite**:
1. QUANDO a janela de Configurações abre ENTÃO o sistema DEVE mostrar uma navegação (abas ou lista lateral) com as 4 seções: Agentes, Projetos, Status de terminal, Atualizações
2. QUANDO o usuário clica numa seção ENTÃO o sistema DEVE renderizar o painel correspondente (`AgentPanel`, `ProjectsPanel`, `StatusesPanel`, `UpdateSettings`) sem remontar a janela inteira
3. QUANDO a janela abre pela primeira vez numa sessão ENTÃO o sistema DEVE mostrar a primeira seção (Agentes) por padrão
4. QUANDO o usuário fecha e reabre a janela na mesma sessão do app ENTÃO a seção ativa PODE reiniciar em Agentes — persistir a última seção vista é opcional, não é critério de aceite desta versão

**Teste independente**: abrir Configurações, clicar em cada uma das 4 seções e confirmar que o painel certo aparece.

---

## Casos de borda

- QUANDO nenhum agente está instalado ENTÃO a seção Agentes DEVE mostrar o estado vazio que `AgentPanel` já implementa, sem erro do container
- QUANDO a janela de Configurações é redimensionada muito pequena ENTÃO a navegação DEVE continuar utilizável (não sumir, não sobrepor o conteúdo)
- QUANDO o usuário fecha a janela de Configurações pelo X ENTÃO o sistema DEVE simplesmente fechá-la — não há confirmação, diferente do fechar terminal com processo ativo (`TERM-05.6`), porque não há trabalho em andamento para perder

---

## Rastreabilidade

| ID | História | Fase | Status |
|---|---|---|---|
| SET-01 | P1: Abrir em janela própria | Tasks | Done no gate — `T1`, mas a janela aponta para o mesmo `index.html` da principal (sem navegação/rota interna real) — ver `T2`. `Verify` real (`uat-agent`) ainda pendente |
| SET-02 | P1: Navegar entre as 4 seções | Tasks | Done no gate — `T2` (`cargo build && npm run build` sem erros). Navegação lista as 4 seções e monta o painel certo por clique, padrão inicial "Agentes". Ressalva: `AgentPanel`/`ProjectsPanel` recebem dado real via `invoke()`; `StatusesPanel` e a maior parte de `UpdateSettings` (`mode`, persistência do toggle de auto-check, persistência da escolha de agente padrão) rodam em estado local da sessão porque os `#[tauri::command]` que exporiam o resto do backend já implementado (`status_catalog`, `agents::prefs::set_default_agent`, `db::set_auto_check`) não existem ainda — fora do alcance desta task por desenho (ver detalhe em `tasks.md` → T2). `Verify` real (`uat-agent`) ainda pendente |

**Cobertura:** 2 requisitos, 2 mapeados para tarefas em `tasks.md` (ver arquivo).

**Nasce desbloqueando, sem duplicar requisito:** `AGT-01/02/03/04`, `PROJ-01/02/05`, `STAT-02/03`, `REL-32/33/34` continuam sendo requisitos das suas próprias features — esta feature só entrega o container. Nenhum ID novo é criado para "mostrar o painel X"; isso já está coberto nas specs de origem.

---

## Critérios de sucesso

- [ ] Os 4 painéis (`AgentPanel`, `ProjectsPanel`, `StatusesPanel`, `UpdateSettings`) ficam alcançáveis por clique real, sem console do devtools
- [ ] Abrir/focar/fechar em cascata funciona igual ao padrão já provado do Kanban
