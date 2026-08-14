#!/usr/bin/env bash
# ~/.claude/scripts/smart-grep-hook.sh
# Adaptive graph-first grep interceptor — CRG (SQLite FTS5) + graphify (JSON)
# Decision ladder (first match wins):
#   1. Not a search command              → pass silently
#   2. --graph-tried override            → pass silently
#   3. Non-code target (.md/.json/…)    → pass silently
#   4. Cross-repo abs path:
#      a. Target has CRG or graphify     → query both, show context, allow grep
#      b. No graph in target             → pass silently
#   5. No local graph of either type:
#      a. CRG registered repo match     → show context, allow grep
#      b. Global merged graphify match  → show context, allow grep
#      c. No match                      → pass silently
#   6. Local graph(s) present — session-aware gating:
#      a. First grep + hit              → show result, allow (one-shot lesson)
#      b. First grep + miss             → allow, suggest tool for next time
#      c. Subsequent + hit              → answering deny (result inline, no retry)
#      d. Subsequent + miss             → pass silently
set -uo pipefail

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',d).get('command',''))" \
  2>/dev/null || echo "")

# ── Tier 1-3: fast exits ──────────────────────────────────────────────────────
case "$CMD" in *grep*|*" rg "*|*"   rg "*|*ripgrep*|*" fd "*|*" ack "*|*" ag "*) ;;
  *find\ *) ;; *) exit 0 ;; esac
case "$CMD" in *--graph-tried*|*"# graph-checked"*|*"GRAPH_TRIED=1"*) exit 0 ;; esac
case "$CMD" in
  *.md*|*.json*|*.yml*|*.yaml*|*.log*|*.jsonl*|*.txt*|*.csv*|\
  *node_modules*|*"/.git/"*|*/dist/*|*/build/*|*/.next/*|*/__pycache__/*) exit 0 ;; esac

json_esc() { python3 -c "import json,sys; print(json.dumps(sys.stdin.read())[1:-1])"; }

# ── CRG: SQLite FTS5 query (sub-ms) ──────────────────────────────────────────
query_crg() {
  local db="$1" pat="$2"
  python3 - "$pat" "$db" <<'PYEOF' 2>/dev/null
import sqlite3, sys, os
pat, db = sys.argv[1], sys.argv[2]
if not os.path.exists(db): sys.exit(0)
try:
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=3)
    rows = c.execute(
        "SELECT n.kind, n.name, n.file_path, n.line_start "
        "FROM nodes_fts f JOIN nodes n ON n.id=f.rowid WHERE nodes_fts MATCH ? LIMIT 5",
        (pat,)).fetchall()
    if not rows:
        rows = c.execute(
            "SELECT kind, name, file_path, line_start FROM nodes WHERE name LIKE ? LIMIT 5",
            (f'%{pat}%',)).fetchall()
    c.close()
    for kind, name, path, line in rows:
        print(f'[crg] {kind}  {name}  →  {path}:{line}')
except: pass
PYEOF
}

# ── graphify: JSON in-memory search (~5ms for 4k nodes) ──────────────────────
query_graphify() {
  local json="$1" pat="$2"
  python3 - "$pat" "$json" <<'PYEOF' 2>/dev/null
import json, sys, os
pat_low, gfile = sys.argv[1].lower(), sys.argv[2]
if not os.path.exists(gfile): sys.exit(0)
try:
    g = json.load(open(gfile))
    results = []
    for n in g.get('nodes', []):
        label = n.get('label', '')
        if pat_low in label.lower() or pat_low in n.get('id', '').lower():
            src = n.get('source_file', '')
            loc = n.get('source_location', '') or n.get('line', '')
            kind = n.get('file_type', 'node')
            community = n.get('community', '')
            results.append(f'[graphify] {kind}  {label}  →  {src}:{loc}  (community {community})')
    for r in results[:5]: print(r)
except: pass
PYEOF
}

# ── Query both graphs at a given root ─────────────────────────────────────────
query_at_root() {
  local root="$1" pat="$2"
  local out=""
  local crg_db="${root}/.code-review-graph/graph.db"
  local gfy_json="${root}/graphify-out/graph.json"
  [ -f "$crg_db" ]   && out+=$(query_crg "$crg_db" "$pat")$'\n'
  [ -f "$gfy_json" ] && out+=$(query_graphify "$gfy_json" "$pat")$'\n'
  printf '%s' "$out" | sed '/^[[:space:]]*$/d'
}

# ── Walk up to nearest repo with any graph ────────────────────────────────────
find_graph_root() {
  local d="$1"; [ ! -d "$d" ] && d=$(dirname "$d")
  while [ "$d" != "/" ] && [ "$d" != "$HOME" ]; do
    { [ -f "$d/.code-review-graph/graph.db" ] || [ -f "$d/graphify-out/graph.json" ]; } \
      && echo "$d" && return
    d=$(dirname "$d")
  done
}

# ── Extract search pattern ────────────────────────────────────────────────────
PATTERN=$(printf '%s' "$CMD" | python3 -c "
import sys, shlex
cmd = sys.stdin.read().strip()
try: parts = shlex.split(cmd)
except: parts = cmd.split()
bases = {'grep','rg','ripgrep','egrep','fgrep','ag','ack','fd'}
idx = next((i for i,p in enumerate(parts) if p.rsplit('/',1)[-1] in bases), -1)
if idx < 0: sys.exit(0)
for p in parts[idx+1:]:
    if not p.startswith('-') and '/' not in p and len(p) > 2: print(p[:60]); break
" 2>/dev/null || echo "")

# ── Tier 4: cross-repo detection ──────────────────────────────────────────────
TARGET=$(printf '%s' "$CMD" | python3 -c "
import sys, shlex, os
try: parts = shlex.split(sys.stdin.read())
except: parts = sys.stdin.read().split()
cwd = os.getcwd()
for p in parts:
    if p.startswith('/') and not p.startswith('-') and not p.startswith(cwd): print(p); break
" 2>/dev/null || echo "")

if [ -n "$TARGET" ]; then
  ROOT=$(find_graph_root "$TARGET")
  if [ -n "$ROOT" ] && [ -n "$PATTERN" ]; then
    RESULT=$(query_at_root "$ROOT" "$PATTERN")
    if [ -n "$RESULT" ]; then
      MSG="Cross-repo graph hit (${ROOT##*/}) for '${PATTERN}':\n${RESULT}\n\nGrep proceeding — result shown as context. Open a session in that repo for deeper analysis."
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"%s"}}' \
        "$(printf '%s' "$MSG" | json_esc)"
    fi
  fi
  exit 0  # always allow cross-repo grep
fi

# ── Local graph detection ─────────────────────────────────────────────────────
HAVE_CRG=0; HAVE_GFY=0
[ -f .code-review-graph/graph.db ]   && HAVE_CRG=1
[ -f graphify-out/graph.json ]       && HAVE_GFY=1

# ── Tier 5: no local graph → registry + global merged graph ───────────────────
if [ "$HAVE_CRG" = "0" ] && [ "$HAVE_GFY" = "0" ]; then
  EXTRA_RESULT=""

  # 5a: CRG multi-repo registry
  if command -v code-review-graph >/dev/null 2>&1 && [ -n "$PATTERN" ] && [ "${#PATTERN}" -gt 2 ]; then
    REG=$(code-review-graph repos 2>/dev/null | python3 - "$PATTERN" <<'PYEOF' 2>/dev/null
import sys, os, sqlite3
pat = sys.argv[1]; results = []
for line in sys.stdin.read().strip().splitlines():
    for token in line.split():
        if not token.startswith('/'): continue
        db = f"{token}/.code-review-graph/graph.db"
        if not os.path.exists(db): continue
        try:
            c = sqlite3.connect(f'file:{db}?mode=ro', uri=True, timeout=2)
            rows = c.execute(
                'SELECT n.kind, n.name, n.file_path, n.line_start '
                'FROM nodes_fts f JOIN nodes n ON n.id=f.rowid WHERE nodes_fts MATCH ? LIMIT 3',
                (pat,)).fetchall()
            c.close()
            for kind, name, fp, ln in rows:
                results.append(f'[crg:{token}] {kind}  {name}  →  {fp}:{ln}')
        except: pass
for r in results[:5]: print(r)
PYEOF
    )
    [ -n "$REG" ] && EXTRA_RESULT+="$REG"$'\n'
  fi

  # 5b: global merged graphify (~/obsidian-vault/merged-graph.json)
  GLOBAL_GFY="${HOME}/obsidian-vault/merged-graph.json"
  if [ -f "$GLOBAL_GFY" ] && [ -n "$PATTERN" ] && [ "${#PATTERN}" -gt 2 ]; then
    GRESULT=$(query_graphify "$GLOBAL_GFY" "$PATTERN")
    [ -n "$GRESULT" ] && EXTRA_RESULT+="$GRESULT"$'\n'
  fi

  if [ -n "$EXTRA_RESULT" ]; then
    CLEAN=$(printf '%s' "$EXTRA_RESULT" | sed '/^[[:space:]]*$/d')
    MSG="No local graph. Sibling/global graph hit for '${PATTERN}':\n${CLEAN}\n\nGrep proceeding. Open a session in the repo shown above for deeper analysis."
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"%s"}}' \
      "$(printf '%s' "$MSG" | json_esc)"
  fi
  exit 0
fi

# ── Tier 6: local graph(s) — session-aware gating ────────────────────────────
KEY=$(printf '%s' "${PWD}" | md5 2>/dev/null || printf '%s' "${PWD}" | md5sum 2>/dev/null | cut -c1-8)
DIR="${HOME}/.cache/claude-graph-hook"; mkdir -p "$DIR"
SLOT="${DIR}/first-grep-${KEY}-$(date +%Y%m%d_%H)"

RESULT=""
[ -n "$PATTERN" ] && [ "${#PATTERN}" -gt 2 ] && \
  RESULT=$(query_at_root "." "$PATTERN")

# Adaptive tool hint — shows MCP tool (CRG) or graphify CLI or both
TOOL_HINT=""
[ "$HAVE_CRG" = "1" ] && TOOL_HINT="semantic_search_nodes_tool(query='${PATTERN}')"
[ "$HAVE_GFY" = "1" ] && {
  GFY_HINT="graphify query '${PATTERN}' --graph graphify-out/graph.json"
  TOOL_HINT="${TOOL_HINT:+${TOOL_HINT} or }${GFY_HINT}"
}

if [ ! -f "$SLOT" ]; then
  touch "$SLOT"
  if [ -n "$RESULT" ]; then
    MSG="Graph pre-answer for '${PATTERN}':\n${RESULT}\n\nIf enough — skip the grep. Running this time (one-shot). Future code-path greps denied when graph answers. Override: --graph-tried."
  else
    MSG="No graph hit for '${PATTERN}' — grep proceeding (one-shot). Next time try: ${TOOL_HINT}. Append --graph-tried to bypass permanently."
  fi
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"%s"}}' \
    "$(printf '%s' "$MSG" | json_esc)"
  exit 0
fi

# Subsequent greps: answering deny if graph hits, else pass
if [ -n "$RESULT" ]; then
  MSG="Graph has this — no retry needed:\n\n${RESULT}\n\nUse: ${TOOL_HINT}. Append --graph-tried to override."
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"block","permissionDecisionReason":"%s"}}' \
    "$(printf '%s' "$MSG" | json_esc)"
  exit 0
fi

printf '[graph-hook] no result for "%s"\n' "$PATTERN" >> "${DIR}/bypass.log"
exit 0