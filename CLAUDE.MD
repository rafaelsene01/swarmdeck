@AGENTS.md

## Arquivos proibidos de leitura

Nunca leia, mostre ou referencie os seguintes arquivos:
- .env* (variáveis de ambiente)
- *credentials*, *.pem, *.key
- ~/.npmrc (tokens npm)
- ~/.ssh/* (chaves SSH)
- ~/.aws/*, ~/.gcp/*, ~/.azure/*

Se o usuário pedir explicitamente para ler, avise antes.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.

## Knowledge Graph

**Read `docs/agent/knowledge-graph.md` whenever you:**
- Answer any architecture, cross-module, or "how does X work" question
- Plan to grep, find, or glob through the codebase
- Need to understand an unfamiliar module or trace a call chain
- Are about to refactor or change something with unclear blast radius

The doc covers graphify (community detection, path tracing, GRAPH_REPORT.md), code-review-graph (MCP tools, impact analysis), when to use each, and the full auto-update pipeline.