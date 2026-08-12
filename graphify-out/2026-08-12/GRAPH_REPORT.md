# Graph Report - ide  (2026-08-11)

## Corpus Check
- 186 files · ~357,542 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2097 nodes · 3960 edges · 279 communities (90 shown, 189 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 109 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `99354f2c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.rs
- catalog.rs
- TerminalManager
- PtySession
- String
- tasks/service.rs
- Task
- status_catalog.rs
- check.rs
- db.rs
- projects/service.rs
- ipc_server.rs
- Settings Sidebar Navigation
- client.rs
- tauri.conf.json
- Skills Settings Page
- terminal.rs
- meta.rs
- AGENTS.md
- send.rs
- spec-driven-eval skill
- Git Worktrees feature
- deny
- portable.rs
- lessons.py
- SettingsShell.tsx
- swarmdeck-mcp/src/main.rs
- restore
- App.tsx
- spec-loop skill
- Execute (implement) doc
- devDependencies
- Task Kanban feature (Kanban de tarefas)
- Db
- compilerOptions
- SwarmDeck Main Grid Screenshot
- Pro Plan (€6.99/month, Best Value)
- TerminalHeader.tsx
- similarity.rs
- T1: CRUD do catálogo de status
- skip_version
- AgentDescriptor
- tlc-spec-driven skill
- make-portable.mjs
- .try_transition
- Triagem 008 — 11/08/2026
- SwarmDeck Specs Index (README.md)
- Settings Shell feature (Janela de Configurações)
- Settings - Terminal Statuses screenshot
- SwarmDeck Screenshot: Terminal Initialization and Agent Selection
- Run 005 spec-loop execution (02/08/2026)
- picker_prefs.rs
- Validate & Verify doc
- bump-version.mjs
- Ordem de execução — M1 + M2
- ProjectsPanel.tsx
- Run 008 — 11/08/2026 (spec-loop)
- T4: Badge, hover de atividade e log
- Create New Project Modal
- project_list
- default.json
- Testing Strategy (TESTING.md)
- KanbanBoard (React)
- Git Projects Modal
- Kanban Board Screenshot (CodeAgentSwarm)
- Left Toolbar Screenshot
- update_skip_version
- patch-latest-json.mjs
- Onboarding Agent chat widget
- GridLayout.tsx
- kanban.rs
- windows/settings.rs
- Discuss Gray Areas doc
- spec-driven-execution skill
- SwarmDeck Screenshot - Agent Initialization & Project Selection
- Session Restoration Dialog
- StatusesPanel
- Todo ajuste passa pela spec (rule)
- Coding Principles doc
- T6: Realçar terminais por filtro de status
- UpdateBanner.tsx
- Code Analysis Tools doc
- CLN-01: Disk usage per agent
- CLN-02: Non-blocking measurement
- CLN-03: Mandatory deletion preview
- CLN-04: Protection of in-use conversations
- CLN-05: Cleanup rules by age/agent
- MCPM-01: CRUD of MCP server
- MCPM-02: Name conflict validation
- MCPM-03: Server state indicator
- MCPM-04: Mask secrets in config
- MCPM-05: MCP server marketplace
- check_active as connection-attempt outcome, not dedicated logic
- IpcServer (Rust)
- rmcp (official Rust MCP SDK)
- Task state machine omits in_progress→completed edge by construction
- swarmdeck-mcp sidecar binary
- TaskService (Rust)
- TerminalMetaService (Rust)
- MCP-01: Activation handshake
- MCP-02: Task lifecycle
- MCP-03: Mandatory testing flow
- MCP-04: Terminal title and activity
- MCP-05: Terminal status
- MCP-06: Manual rename wins over agent
- MCP-07: Similarity and dedup
- MCP-08: Project resolution
- IpcServer::for_app never called in lib.rs (production wiring gap)
- T0: Freeze MCP tool contract (gate)
- T1: Migration 003 — tasks/projects/status/activity
- T2: Task state machine
- T3: TaskService
- T4: TerminalMetaService
- T5: IpcServer
- T6: swarmdeck-mcp sidecar skeleton + check_active
- T7: Task/terminal MCP tools
- T8: Task similarity scoring
- T9: Start IpcServer in the real app (NEEDS-DECISION)
- MCP Task Server Tool Contract
- Tool: check_active
- Tool: complete_task
- Tool: create_project
- Tool: create_task
- Tool: find_related_active_tasks
- Tool: get_projects
- Tool: list_tasks
- Tool: search_tasks
- Tool: set_terminal_status
- Tool: set_terminal_title
- Tool: start_task
- Tool: update_task_implementation
- Tool: update_task_plan
- Tool: update_task_project
- Tool: update_terminal_activity
- PTY output via tauri::ipc::Channel with 16ms throttle (not emit)
- ConPTY DSR handshake — frontend must answer before first byte
- GridLayout (React)
- NewTerminalDialog (React)
- OutputThrottle (Rust)
- terminal::picker_prefs (Rust)
- PtySession (Rust)
- RestoreSessionModal (React)
- terminal::shutdown (Rust)
- Single-row preference table pattern (agent_prefs / picker_prefs / shutdown_state)
- TerminalHeader (React)
- TerminalManager (Rust)
- TerminalPane (React)
- TERM-01: Real terminal
- TERM-02: Resize/ANSI rendering
- TERM-03: Terminal grid
- TERM-04: Grid dividers/maximize
- TERM-05: Terminal header
- TERM-07: Session persistence
- TERM-08: Minimize terminal
- TERM-09: Per-terminal activity log
- TERM-10: Native folder picker on terminal create
- TERM-11: Remember last picker directory
- TERM-12: Restore session after unclean shutdown
- App.tsx placeholder never wired real components (integration gap)
- T1: Scaffolding
- T10: Maximize/minimize/close
- T11: Layout persistence
- T13: Last picker-directory persistence
- T14: Native dialog plugin + commands
- T15: NewTerminalDialog folder picker
- T16: Manual terminal rename
- T17: Mount inline Project→Agent picker
- T18: terminal::shutdown — detect unclean shutdown
- T19: RestoreSessionModal
- T2: DB layer + migration runner
- T20: “No remote” flag in terminal header
- T3: OutputThrottle
- T4: PtySession
- T5: TerminalManager
- T6: Tauri commands + output Channel
- T7: TerminalPane (React)
- T8: GridLayout (React)
- T9: TerminalHeader (React)
- NOT-01: Notify when agent waits for user
- NOT-02: Click focuses terminal
- NOT-03: Notify task completion
- NOT-04: Grouping simultaneous notifications
- NOT-05: Per-event toggles
- NOT-06: OS permission handling
- ONB-01: In-app chat panel
- ONB-02: Suggested questions
- ONB-03: Honest refusal when unsure
- ONB-04: Inspect mode — selection
- ONB-05: Inspect mode — context on question
- ONB-06: Scale and positioning
- PROJ-01: Project CRUD (base-dir subfolder, color override)
- PROJ-02: Unique colors with manual override
- PROJ-03: Directory-based resolution
- PROJ-04: Folder-name fallback
- PROJ-05: Listing and ordering
- PROJ-06: Select project when starting terminal
- PROJ-07: Sandbox pseudo-project (No Project)
- PROJ-08: Optional project icon
- PROJ-09: Initialize as local git repo
- T2: Directory-based project resolution
- T3: Tauri project commands
- T4: Project management UI
- T5: create() revised — base-dir, color override, git init
- T6: Track last-opened timestamp per project
- T7: “Create New Project” UI
- T8: ProjectPicker — PROJECT step
- T9: Sandbox pseudo-project (No Project)
- scripts/bump-version.mjs
- cliff.toml (git-cliff config)
- scripts/make-portable.mjs
- scripts/patch-latest-json.mjs
- src-tauri/src/paths.rs
- src/components/UpdateBanner.tsx
- src-tauri/src/update/ (check.rs, portable.rs)
- REL-01: Release only via workflow_dispatch + bump select
- REL-02: Push/tag/schedule never publish
- REL-03: Version from last tag + bump, written to 4 files
- REL-04: No prior tag → base is package.json
- REL-05: CHANGELOG from Conventional Commits since last tag
- REL-06: chore(release) commit, tag, GitHub Release same run
- REL-07: Branch/tag guards before any write
- REL-08: Interrupted run undoes tag/draft/version commit
- REL-09: msi + setup.exe + deb + AppImage per release
- REL-10: NSIS currentUser mode, no admin prompt
- REL-11: Signed update artifacts + latest.json
- REL-12: fail-fast:false and draft-until-complete
- REL-13: Linux build on ubuntu-22.04
- REL-14: Windows portable zip with marker
- REL-15: Portable signed with same key
- REL-16: Portable mode writes data beside executable
- REL-17: Installed mode uses app_data_dir, single resolver module
- REL-18: Run from zip in writable folder, no elevation
- REL-19: Silent boot-time update check
- REL-20: Non-blocking banner with 3 actions
- REL-21: Nothing shown when no newer version
- REL-22: Download+progress, verify signature, apply, restart
- REL-23: “Skip this version” applies only to that version
- REL-24: Installed uses official plugin; portable swaps files
- REL-25: Invalid signature aborts, preserves current version
- REL-26: Warn about PTY shutdown before restart
- REL-27: CI runs build/test/cargo test on push and PR
- REL-28: Rust job installs Tauri system deps, no protoc
- REL-29: Conventional Commits validated on PR commits
- REL-30: fmt --check + scripts unit tests in CI
- REL-31: Concurrency cancels superseded runs; CI publishes nothing
- REL-32: “Updates” settings section with version and mode
- REL-33: “Check now” reports result in both cases
- REL-34: Auto-check toggle persisted, on by default
- REL-35: strip + LTO release profile, measured size
- REL-36: clippy -D warnings in CI after cleanup
- T10: release.yml finalize job
- T11: release.yml cleanup job
- T12: First real release (v0.1.1) verification
- T13: Path resolution and portable mode
- T14: Update preference persistence
- T15: Update check
- T16: Portable-mode update apply
- T17: New-version banner
- T18: “Updates” settings section
- T19: End-to-end update verification (human)
- T2: CI workflow
- T20: Lean release profile (strip+LTO)
- T21: Clippy in CI
- T3: git-cliff configuration
- T4: Tauri bundle configuration
- T5: Signing key and secrets (human step)
- T6: release.yml prepare job
- T7: Portable bundle builder script
- T8: Update manifest patcher script
- T9: release.yml build job (matrix)
- M5 — Polish milestone

## God Nodes (most connected - your core abstractions)
1. `Db` - 46 edges
2. `IpcServer` - 37 edges
3. `TerminalManager` - 33 edges
4. `DbError` - 29 edges
5. `TaskError` - 24 edges
6. `err_response()` - 23 edges
7. `RouteResult` - 22 edges
8. `PtySession` - 22 edges
9. `spec-driven-eval skill` - 22 edges
10. `ProjectError` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Test coverage matrix` --semantically_similar_to--> `T-outcome (persistence/async outcome checks)`  [INFERRED] [semantically similar]
  .specs/codebase/TESTING.md → .claude/skills/spec-driven-eval/SKILL.md
- `T6: Realçar terminais por filtro de status` --implements--> `App()`  [EXTRACTED]
  .specs/features/terminal-statuses/tasks.md → src/App.tsx
- `T6: Realçar terminais por filtro de status` --implements--> `GridLayout()`  [EXTRACTED]
  .specs/features/terminal-statuses/tasks.md → src/components/grid/GridLayout.tsx
- `T4: Badge, hover de atividade e log` --implements--> `ActivityLog()`  [EXTRACTED]
  .specs/features/terminal-statuses/tasks.md → src/components/terminal/ActivityLog.tsx
- `T4: Badge, hover de atividade e log` --implements--> `StatusBadge()`  [EXTRACTED]
  .specs/features/terminal-statuses/tasks.md → src/components/terminal/StatusBadge.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Terminal-status feature build pipeline (T1 through T6)** — specs_features_terminal_statuses_tasks_t1, specs_features_terminal_statuses_tasks_t2, specs_features_terminal_statuses_tasks_t3, specs_features_terminal_statuses_tasks_t4, specs_features_terminal_statuses_tasks_t5, specs_features_terminal_statuses_tasks_t6 [EXTRACTED 1.00]
- **StatusBadge and ActivityLog wired into TerminalHeader (T5)** — src_components_terminal_terminalheader_terminalheader, src_components_terminal_statusbadge_statusbadge, src_components_terminal_activitylog_activitylog [EXTRACTED 1.00]
- **Recurring 'gate green, orphan component' wiring-gap pattern across features** — specs_features_terminal_statuses_tasks_t5, specs_features_multi_terminal_tasks_t12, specs_features_task_kanban_tasks_t7 [EXTRACTED 1.00]
- **Spec-driven triage-loop-plan-implement-evaluate pipeline** — claude_skills_spec_triage_skill, claude_skills_spec_loop_skill, claude_skills_tlc_spec_driven_skill, claude_skills_spec_driven_execution_skill, claude_skills_spec_driven_eval_skill [INFERRED 0.85]
- **Author-not-verifier independent verification principle** — claude_skills_tlc_spec_driven_skill_verifier, claude_skills_spec_driven_execution_skill_verifier, claude_skills_spec_loop_references_agent_briefs_validador, claude_skills_spec_driven_eval_skill_judge_author_rule [INFERRED 0.85]
- **Discover-once project profile pattern** — claude_skills_spec_triage_skill_project_profile, claude_skills_spec_driven_execution_skill_project_profile, claude_skills_spec_loop_skill [INFERRED 0.75]
- **Secondary Tauri window pattern shared by Kanban and Settings** — specs_features_task_kanban_design_kanbanwindow, specs_features_task_kanban_tasks_t1, specs_features_settings_shell_tasks_t1 [INFERRED 0.85]
- **task_changed empty-payload gap across design, task, and decision log** — specs_features_task_kanban_design_taskchangedevent, specs_features_task_kanban_tasks_t7 [INFERRED 0.85]
- **Waves serialize tasks over shared files (lib.rs/App.tsx/TerminalHeader.tsx)** — specs_runs_007_2026_08_03_journal_wavesequencing, feature_multi_terminal, feature_agent_selection, feature_settings_shell [EXTRACTED 1.00]
- **task-kanban/T8 blocked and returned to triage for a decision** — specs_runs_007_2026_08_03_journal_t8needsdecision, feature_task_kanban, specs_runs_007_2026_08_03_triage [EXTRACTED 1.00]
- **ACL capabilities gap threatens both kanban and settings windows** — specs_runs_007_2026_08_03_journal_aclgap, feature_task_kanban, feature_settings_shell [EXTRACTED 1.00]

## Communities (279 total, 189 thin omitted)

### Community 0 - "server.rs"
Cohesion: 0.09
Nodes (56): Into, IpcConnection, CreateProjectArgs, CreateTaskArgs, emit_task_changed(), err_response(), err_response_with(), FindRelatedArgs (+48 more)

### Community 1 - "catalog.rs"
Cohesion: 0.05
Nodes (65): AgentDescriptor, AgentStatus, catalog(), catalogo_tem_os_5_agentes_com_ids_esperados(), command_exists_in_dir(), command_exists_in_path(), detect_installed(), detect_installed_with() (+57 more)

### Community 2 - "TerminalManager"
Cohesion: 0.07
Nodes (62): HashSet, alive_terminal_ids(), get_with_project(), list_with_projects(), lista_tarefa_com_projeto_embutido(), ProjectRefDto, projeto_fica_nulo_apos_exclusao(), AppHandle (+54 more)

### Community 3 - "PtySession"
Cohesion: 0.06
Nodes (49): Child, Default, MasterPty, PtySession, Arc, Box, CommandBuilder, Duration (+41 more)

### Community 4 - "String"
Cohesion: 0.11
Nodes (46): env_var_test_lock(), MutexGuard, ActivityResult, as_object(), ciclo_completo_create_start_complete_complete_via_interface_mcp(), CreateProjectParams, CreateTaskParams, erro_do_app_chega_como_erro_mcp_descritivo() (+38 more)

### Community 5 - "tasks/service.rs"
Cohesion: 0.18
Nodes (36): apply_transition(), complete(), create(), delete(), get(), list(), list_active(), list_by_project() (+28 more)

### Community 6 - "Task"
Cohesion: 0.06
Nodes (42): root, BoardFilterCounts, BoardFilters(), BoardFiltersProps, countByStatus(), distinctProjects(), EMPTY_COUNTS, matchesQuery() (+34 more)

### Community 7 - "status_catalog.rs"
Cohesion: 0.10
Nodes (51): CatalogError, color_distance(), cores_visualmente_proximas_geram_aviso_na_criacao(), create(), create_com_rotulo_e_instrucao_grava_status_habilitado_com_cor_inedita(), create_sem_rotulo_ou_sem_instrucao_e_recusado(), CreateOutcome, delete() (+43 more)

### Community 8 - "check.rs"
Cohesion: 0.10
Nodes (49): S, allow_write(), current_exe_dir(), data_dir(), db_path(), deny_write(), Flavor, is_writable() (+41 more)

### Community 9 - "db.rs"
Cohesion: 0.06
Nodes (47): aplica_migracoes_em_banco_novo(), cria_o_schema_de_terminal_layout(), migracao_e_idempotente(), registra_a_versao_aplicada(), PathBuf, TempDir, temp_db_path(), title_source_so_aceita_agent_ou_user() (+39 more)

### Community 10 - "projects/service.rs"
Cohesion: 0.11
Nodes (50): exact_path_matches_project(), folder_name(), is_prefix(), mixed_separators_still_resolve(), most_specific_project_wins_among_two_matches(), no_match_falls_back_to_folder_name(), normalized_components(), project() (+42 more)

### Community 11 - "ipc_server.rs"
Cohesion: 0.13
Nodes (40): Listener, IpcConnection, LocalSocketTransport, Box, PathBuf, Read, Result, Self (+32 more)

### Community 12 - "Settings Sidebar Navigation"
Cohesion: 0.09
Nodes (42): Antigravity CLI Agent Option (Google), Claude Code Agent Option (Anthropic, currently selected), Codex CLI Agent Option (OpenAI), Default AI Agent Section, Feedback Settings Nav Item, General Settings Page, Settings > General Page Screenshot, Kimi Code Agent Option (Moonshot AI, BETA) (+34 more)

### Community 13 - "client.rs"
Cohesion: 0.13
Nodes (37): ativo_retorna_true_e_terminal_id(), call_tool(), call_tool_com_conexao_recusada_retorna_err(), call_tool_ok_false_do_app_vira_err_com_a_mensagem(), call_tool_ok_true_relay_sem_reinterpretar(), call_tool_over(), call_tool_sem_terminal_id_retorna_err_sem_conectar(), check_active() (+29 more)

### Community 14 - "tauri.conf.json"
Cohesion: 0.05
Nodes (38): appimage, deb, https://github.com/rafaelsene01/swarmdeck/releases/latest/download/latest.json, icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico (+30 more)

### Community 15 - "Skills Settings Page"
Cohesion: 0.09
Nodes (36): caveman Skill Entry, Export to Agent Action, gepeto Skill Entry, Settings > Skills Screenshot, karpathy-guidelines Skill Entry, MANUAL Skill Trigger Badge, Multi-Agent Skill Filtering (Claude, Codex, Antigravity, opencode, Kimi Code), Settings Dialog (+28 more)

### Community 16 - "terminal.rs"
Cohesion: 0.13
Nodes (30): Channel, parse_id(), pty_kill(), pty_resize(), pty_spawn(), pty_write(), pump_output(), AppHandle (+22 more)

### Community 17 - "meta.rs"
Cohesion: 0.16
Nodes (24): clear_status_nao_falha_num_terminal_sem_registro(), clear_status_zera_o_badge_sem_passar_pelo_catalogo(), dois_terminais_diferentes_nao_interferem_um_no_outro(), extract_valid_ids(), MetaError, open_db(), push_activity_nao_altera_titulo_nem_status_em_memoria(), rename_manual_do_usuario_vence_chamada_seguinte_do_agente() (+16 more)

### Community 18 - "AGENTS.md"
Cohesion: 0.09
Nodes (27): cargo build --workspace redundancy (corrected gate description), Traceability Marker (SPEC: comment convention), .claude/rules/spec-driven-changes.md (traceability marker rule), agent-selection (feature), mcp-task-server (feature), multi-terminal (feature), projects (feature), release-distribution (feature) (+19 more)

### Community 19 - "send.rs"
Cohesion: 0.16
Nodes (23): create_task_with_terminal(), criacao_manual_via_task_service_entra_em_pending(), delete_remove_a_tarefa_do_banco(), format_task_context(), format_task_context_inclui_id_titulo_descricao_e_plano(), get_apos_delete_retorna_not_found_o_que_fecha_o_detalhe_aberto(), resolve_alive_terminal(), Connection (+15 more)

### Community 20 - "spec-driven-eval skill"
Cohesion: 0.12
Nodes (24): spec-driven-eval quickstart guide, 4-chat-session evaluation flow, Example Wishlist PRD, Calibration anchors (MET/UNMET boundary), spec-driven-eval reference (template/anchors/example), Evaluation report template, Worked example: Start Free Trial Without a Card, spec-driven-eval skill (+16 more)

### Community 21 - "Git Worktrees feature"
Cohesion: 0.09
Nodes (24): Skills Manager feature (Gerenciador de Skills), SKL-01: List installed skills, SKL-02: Filter by agent and search, SKL-03: Open, remove, export skills, SKL-04: Skills marketplace, Git Worktrees feature, WT-01: Worktree per conversation, WT-02: Fallback on creation failure (+16 more)

### Community 22 - "deny"
Cohesion: 0.09
Nodes (22): args, command, src/**, mcpServers, context7, mcpServersDenyAll, permissions, acceptEditsPaths (+14 more)

### Community 23 - "portable.rs"
Cohesion: 0.17
Nodes (18): allow_write(), apply_portable(), apply_portable_com_sucesso_troca_o_executavel_e_preserva_o_old(), apply_portable_rejeita_bytes_truncados_pela_assinatura_do_arquivo_completo(), apply_portable_reprova_pasta_somente_leitura_antes_de_verificar_assinatura(), apply_portable_restaura_o_executavel_anterior_quando_a_escrita_falha(), apply_portable_with(), cleanup_stale_old() (+10 more)

### Community 24 - "lessons.py"
Cohesion: 0.26
Nodes (20): _auto_prune(), cmd_add(), cmd_init(), cmd_list(), cmd_penalize(), cmd_prune(), cmd_status(), _find() (+12 more)

### Community 25 - "SettingsShell.tsx"
Cohesion: 0.21
Nodes (9): CheckState, MODE_LABEL, UpdateSettings(), UpdateSettingsProps, ProjectRecord, SectionId, SECTIONS, SettingsShell() (+1 more)

### Community 26 - "swarmdeck-mcp/src/main.rs"
Cohesion: 0.14
Nodes (16): CheckActiveResult, main(), Box, Error, Json, Option, Result, Self (+8 more)

### Community 27 - "restore"
Cohesion: 0.19
Nodes (18): LayoutEntry, default_entry(), LayoutEntry, now_unix(), restore(), Option, Path, Result (+10 more)

### Community 28 - "App.tsx"
Cohesion: 0.19
Nodes (13): App(), createTerminalId(), defaultTerminal(), evenWidths(), TerminalPane(), TerminalPaneProps, close(), LayoutEntry (+5 more)

### Community 29 - "spec-loop skill"
Cohesion: 0.13
Nodes (19): Corretor brief, spec-loop subagent briefs doc, Implementador brief, UAT brief (exercitar produto real), Validador brief (missao e falsificar), spec-loop skill, Modo direto (implementation only), JOURNAL.md run journal (+11 more)

### Community 30 - "Execute (implement) doc"
Cohesion: 0.20
Nodes (12): Atomic git commit per task, Execute (implement) doc, Feature-level validation (post-last-task), Gate Check (VERIFY step), Sub-Agent Delegation mechanics doc, Phase-batch workers (~7 tasks/worker), Tasks phase doc, Gate Check Commands table (+4 more)

### Community 31 - "devDependencies"
Cohesion: 0.04
Nodes (46): jsdom, dependencies, react, react-dom, @tauri-apps/api, @tauri-apps/plugin-dialog, @xterm/addon-fit, @xterm/xterm (+38 more)

### Community 32 - "Task Kanban feature (Kanban de tarefas)"
Cohesion: 0.19
Nodes (19): Task Kanban feature (Kanban de tarefas), KAN-01: 4-column board, KAN-02: Real-time update (<1s), KAN-03: Task card, KAN-04: Send-to-terminal action, KAN-05: Mandatory test-phase flow, KAN-06: Project filter and search, KAN-07: Manual task creation (+11 more)

### Community 33 - "Db"
Cohesion: 0.25
Nodes (8): AsRef, DbError, Error, Db, Connection, Path, Result, Self

### Community 34 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, ES2022, @testing-library/jest-dom, vitest/globals, compilerOptions, allowImportingTsExtensions, baseUrl (+19 more)

### Community 35 - "SwarmDeck Main Grid Screenshot"
Cohesion: 0.21
Nodes (17): SwarmDeck Main Grid Screenshot, Spec File Diff Output in Terminal, Global App Toolbar, Agent Rate-Limit Prompt Dialog, RUN Button, Screenshot/Capture Button (toolbar), Terminal Status Indicator Dot, Terminal Grid Layout (+9 more)

### Community 36 - "Pro Plan (€6.99/month, Best Value)"
Cohesion: 0.22
Nodes (16): Conversation History (Pro only), Git Integration & AI Commits (Pro only), Keyboard Shortcuts (Pro only), Layout Mode (Grid only vs Grid + Tabs), Manage MCP / Claude Code Permissions, MCP Configuration & Marketplace, Project Count Limit (4 vs unlimited projects), Project Shortcuts (1 vs 6, 6x Boost) (+8 more)

### Community 37 - "TerminalHeader.tsx"
Cohesion: 0.22
Nodes (12): ActivityEntry, ActivityLog(), ActivityLogProps, formatActivityTime(), sortByMostRecent(), ENTRIES, STATUS_BADGE_MAX_LABEL_LENGTH, StatusBadge() (+4 more)

### Community 38 - "similarity.rs"
Cohesion: 0.24
Nodes (16): completed_tasks_are_ignored_even_when_near_identical(), find_similar(), identical_candidate_scores_near_one_and_recommends_reuse(), make_task(), moderately_similar_pair_falls_in_mid_range_and_recommends_ask_user(), paraphrased_pagination_request_falls_in_high_range_and_recommends_reuse(), Option, String (+8 more)

### Community 39 - "T1: CRUD do catálogo de status"
Cohesion: 0.17
Nodes (16): Feature: settings-shell, User story: Catálogo editável de status (P1 MVP), STAT-02: Catálogo de status — CRUD, STAT-03: Catálogo de status — ordem e prioridade, STAT-04: Propagação do catálogo na próxima sessão, T1: CRUD do catálogo de status, T2: Snapshot de catálogo por sessão, T3: UI do catálogo de status (+8 more)

### Community 40 - "skip_version"
Cohesion: 0.22
Nodes (13): auto_check(), is_version_skipped(), Connection, Result, set_auto_check(), skip_version(), auto_check_nasce_ligado_num_banco_novo(), migracao_de_settings_e_idempotente() (+5 more)

### Community 41 - "AgentDescriptor"
Cohesion: 0.20
Nodes (10): AgentCatalogEntry, NewTerminalDialog(), NewTerminalDialogProps, CATALOG, { invokeMock, openMock }, AgentDescriptor, AgentPanel(), AgentPanelProps (+2 more)

### Community 42 - "tlc-spec-driven skill"
Cohesion: 0.21
Nodes (13): Context Limits doc, Context zones (healthy/moderate/critical), AD-NNN project decision entry, Design phase doc, Knowledge Verification Chain, Risks & Concerns section, ## Decisions append-only log (AD-NNN), Memory Layer doc (+5 more)

### Community 43 - "make-portable.mjs"
Cohesion: 0.26
Nodes (12): APP_NAME, defaultBinaryPath(), main(), parseArgs(), PORTABLE_MARKER, portableArchiveName(), portableReadme(), ROOT (+4 more)

### Community 44 - ".try_transition"
Cohesion: 0.18
Nodes (15): complete_from_in_progress_moves_to_in_testing(), complete_from_in_testing_moves_to_completed(), complete_from_pending_is_rejected_no_phase_skip(), invalid_transition_error_lists_valid_actions(), InvalidTransition, Display, Error, Formatter (+7 more)

### Community 45 - "Triagem 008 — 11/08/2026"
Cohesion: 0.22
Nodes (8): Decisões do usuário (Fase 3), Divergências encontradas (Fase 1), Fora da execução, Inventário (Fase 2), Não verificado, Perfil do projeto (Fase 0), Relatório final, Triagem 008 — 11/08/2026

### Community 46 - "SwarmDeck Specs Index (README.md)"
Cohesion: 0.06
Nodes (49): CI Workflow (ci.yml), ci.yml: clippy job, ci.yml: commits job (Conventional Commits gate), ci.yml: frontend job, ci.yml: rust job, Release Workflow (release.yml), release.yml: build job (Windows/Linux matrix), release.yml: cleanup job (+41 more)

### Community 47 - "Settings Shell feature (Janela de Configurações)"
Cohesion: 0.18
Nodes (13): AgentPanel.tsx, Settings Shell feature (Janela de Configurações), ProjectsPanel.tsx, Decision: Settings is a second Tauri window, not a modal, SET-01: Open Settings in its own window, SET-02: Navigate between the 4 settings sections, StatusesPanel.tsx, UpdateSettings.tsx (+5 more)

### Community 48 - "Settings - Terminal Statuses screenshot"
Cohesion: 0.29
Nodes (13): "Add status" action button (create a custom status), Delete (trash icon) action per status row, Done status (default, green marker) - set when work is completely finished, validated and committed/pushed, Drag-to-reorder handles on each status row (sets sort priority for terminal tabs), Edit (pencil icon) action per status row - edit label, color and instruction text, Settings - Terminal Statuses screenshot, Needs input status (default, orange marker) - set when agent stops for a user decision, Needs testing status (default, blue marker) - set when implementation is done and pending manual user testing (+5 more)

### Community 49 - "SwarmDeck Screenshot: Terminal Initialization and Agent Selection"
Cohesion: 0.29
Nodes (13): Agent Provider Icon Row (Claude Code, ChatGPT, others, Beta), Choose Your Agent Step, Claude Code Agent (Selected, Anthropic / Turbo / Resume), Git Worktree Option Toggle, SwarmDeck Screenshot: Terminal Initialization and Agent Selection, Initialize Agent Empty State, Multi-Terminal Panel Layout, New Session Action (Start Fresh) (+5 more)

### Community 50 - "Run 005 spec-loop execution (02/08/2026)"
Cohesion: 0.17
Nodes (12): Transversal track: release-distribution, Triagem 001 (28/07/2026), Triagem 002 (28/07/2026), Finding: App.tsx still scaffolding placeholder, terminal components never mounted, Run 004 spec-loop execution (01/08/2026), Triagem 004 (01/08/2026), Blocked/stationed: mcp-task-server/T9 cannot start IpcServer without touching out-of-scope files, Bug found and fixed: make-portable.mjs default binary path pointed to wrong build output (+4 more)

### Community 51 - "picker_prefs.rs"
Cohesion: 0.29
Nodes (11): banco_novo_nao_tem_diretorio_gravado(), last_dir(), migracao_e_idempotente_em_banco_persistido(), open_db(), Connection, Option, Result, String (+3 more)

### Community 52 - "Validate & Verify doc"
Cohesion: 0.18
Nodes (12): Evidence-or-zero core rule, "Número copiado para a prosa" anti-pattern, Lessons self-improving layer doc, .specs/lessons.json canonical state, .specs/LESSONS.md rendered playbook, scripts/lessons.py, Verifier sub-agent (always-on), Discrimination Sensor (mutation testing) (+4 more)

### Community 53 - "bump-version.mjs"
Cohesion: 0.38
Nodes (9): BUMP_KINDS, bumpVersion(), main(), parseArgs(), parseVersion(), resolveVersion(), setJsonVersion(), setWorkspaceVersion() (+1 more)

### Community 54 - "Ordem de execução — M1 + M2"
Cohesion: 0.22
Nodes (11): Feature: agent-selection, Feature: mcp-task-server, Feature: multi-terminal, Feature: projects, Feature: release-distribution, Feature: task-kanban, Feature: terminal-statuses, mcp-task-server T0: contrato de ferramentas (gate de bloqueio do M2) (+3 more)

### Community 55 - "ProjectsPanel.tsx"
Cohesion: 0.39
Nodes (7): filterProjects(), ProjectRow, ProjectsPanel(), ProjectsPanelProps, sortByLastUsed(), PROJECTS, truncatePath()

### Community 56 - "Run 008 — 11/08/2026 (spec-loop)"
Cohesion: 0.25
Nodes (7): Devolvido para triagem, Estado da árvore no último checkpoint, Execução, Fila de execução (da triagem), Gates medidos nesta run, Não verificado, Run 008 — 11/08/2026 (spec-loop)

### Community 57 - "T4: Badge, hover de atividade e log"
Cohesion: 0.25
Nodes (11): TERM-06: Header git branch + manual rename, T12: Mount App.tsx (real grid integration), User story: Badge de status no terminal (P1 MVP), STAT-01: Badge de status no terminal, STAT-05: Título geral estável, STAT-06: Log de atividade, STAT-07: Rename manual vence (REVOGADO), User story: Título geral vs atividade (P1 MVP) (+3 more)

### Community 58 - "Create New Project Modal"
Cohesion: 0.20
Nodes (11): Create New Project Dialog Screenshot, Base Directory Selector (Project Folder Created Inside), Browse... Button (Native Folder Picker), Cancel Button, Create New Project Modal, Create Project Confirm Button, Initialize As Git Repository Checkbox, Project Color Swatch Picker (+3 more)

### Community 59 - "project_list"
Cohesion: 0.44
Nodes (10): project_create(), project_delete(), project_list(), project_update(), Mutex, Option, Result, State (+2 more)

### Community 60 - "default.json"
Cohesion: 0.20
Nodes (9): core:default, dialog:default, main, updater:default, description, identifier, permissions, $schema (+1 more)

### Community 61 - "Testing Strategy (TESTING.md)"
Cohesion: 0.20
Nodes (10): Testing Strategy (TESTING.md), Test coverage matrix, Gate: build, Gate: full, Gate: quick, Gate: scripts, Parallelism evaluation, uat-agent verification role (+2 more)

### Community 62 - "KanbanBoard (React)"
Cohesion: 0.20
Nodes (10): Column (React), Decision: event-delta sync, no polling, KanbanBoard (React), Decision: no drag-and-drop between columns in v1, Decision: normalized Map state, columns derived, Decision: independent per-column scroll, SendToTerminal (Rust), TaskCard (React) (+2 more)

### Community 63 - "Git Projects Modal"
Cohesion: 0.24
Nodes (9): Projects From Active Terminals List, Branch Indicator (master), Uncommitted Changes Count (63 changes), Close (X) Button, Git Projects Modal, Open Button, Project Card (chat-ia-local), Refresh Button (+1 more)

### Community 64 - "Kanban Board Screenshot (CodeAgentSwarm)"
Cohesion: 0.36
Nodes (10): Column task-count badge, Completed column, In Progress column, In Testing column, Kanban Board Screenshot (CodeAgentSwarm), Pending column, Project filter dropdown (All Projects), Task card (+2 more)

### Community 65 - "Left Toolbar Screenshot"
Cohesion: 0.24
Nodes (10): Active/Selected Toolbar Button Visual Pattern (amber highlight background), Add/New Item Icon (plus in square), SwarmDeck App Logo (hexagon/honeycomb icon with notification dot), Git Branch/Fork Icon, History/Undo Icon (clock with counter-clockwise arrow), Left Toolbar Screenshot, Layout/Panel Toggle Icon, Notification/Status Dot on App Logo (+2 more)

### Community 66 - "update_skip_version"
Cohesion: 0.29
Nodes (9): AppHandle, Mutex, Option, Result, State, String, terminals_active_count(), update_check() (+1 more)

### Community 67 - "patch-latest-json.mjs"
Cohesion: 0.42
Nodes (7): main(), parseArgs(), patchManifest(), pickAssetUrlByName(), DRAFT_ASSETS, scriptPath, withReleaseTag()

### Community 68 - "Onboarding Agent chat widget"
Cohesion: 0.42
Nodes (9): Chat input field ("Pregúntame algo...") with send button, Dimmed main app background (board/task columns behind modal overlay), CodeAgentSwarm hexagon/honeycomb branding icon, 11-onboarding-agent.png (Onboarding Agent chat screenshot), Inspect button (click any element to ask about it), Localization inconsistency: English UI text with Spanish input placeholder, Onboarding Agent chat widget, Suggested prompt chips ("How to get the maximum benefit...", "Does CodeAgentSwarm have a Skills marketplace?") (+1 more)

### Community 69 - "GridLayout.tsx"
Cohesion: 0.39
Nodes (6): applyDrag(), GridLayout(), GridLayoutProps, gridTemplate(), MIN_FRAC, Pane

### Community 70 - "kanban.rs"
Cohesion: 0.50
Nodes (8): focus_main(), kanban_focus_main(), kanban_open(), open(), register_cascade_close(), AppHandle, Result, String

### Community 71 - "windows/settings.rs"
Cohesion: 0.50
Nodes (8): focus_main(), open(), register_cascade_close(), AppHandle, Result, String, settings_focus_main(), settings_open()

### Community 72 - "Discuss Gray Areas doc"
Cohesion: 0.29
Nodes (8): Elicitation E (recall/precision/justified), context.md artifact, Discuss Gray Areas doc, Scope Guardrail (discuss clarifies, never adds capability), Specify phase doc, Implicit-Requirement Dimensions rubric, Requirement Closure Gate, Specify phase

### Community 73 - "spec-driven-execution skill"
Cohesion: 0.29
Nodes (8): Judge ≠ author rule, spec-driven-execution skill, Implementer sub-agent role, Per-role model assignment, Planner sub-agent role, Project Profile (Phase 0 discovery), Verifier sub-agent role (execution orchestrator), Perfil do projeto (Fase 0 discovery)

### Community 74 - "SwarmDeck Screenshot - Agent Initialization & Project Selection"
Cohesion: 0.39
Nodes (8): Initialize Agent Empty State (Terminal 1), SwarmDeck Screenshot - Agent Initialization & Project Selection, Multi-Terminal Side-by-Side Layout, New/Import/No Project Action Buttons, Project > Agent Selection Stepper, Project Search and Recent Project List, Recent Project Entry: chat-ia-local (D:\chat-ia-local, 5 days), Top Application Toolbar (layout, add, history, screenshot, run, settings)

### Community 75 - "Session Restoration Dialog"
Cohesion: 0.32
Nodes (8): Conversation Selection Checkbox (Terminal + Agent + Title), Screenshot: Restore Previous Session Dialog, Multi-Terminal Orchestration Feature (TERM-), Restore Selected Action, Session Restoration Dialog, Start Fresh Action, Terminal Slot Capacity Indicator, Unexpected App Close Recovery Flow

### Community 76 - "StatusesPanel"
Cohesion: 0.36
Nodes (5): StatusesPanel(), StatusesPanelProps, StatusRow, STATUSES, truncateInstruction()

### Community 77 - "Todo ajuste passa pela spec (rule)"
Cohesion: 0.29
Nodes (7): Cargo.toml workspace manifest, Ask before writing code principle, Todo ajuste passa pela spec (rule), Shared-file marker placement exception, SPEC: traceability marker, Old spec revocation procedure, src-tauri/src/lib.rs entry point

### Community 78 - "Coding Principles doc"
Cohesion: 0.40
Nodes (5): Coding Principles doc, Goal-driven principle, Simplicity principle, Surgical changes principle, Test integrity principle

### Community 79 - "T6: Realçar terminais por filtro de status"
Cohesion: 0.38
Nodes (7): KAN-06 (task-kanban requirement, mistakenly linked to STAT-08), STAT-08: Status como filtro, User story: Status como filtro (P2), T6: Realçar terminais por filtro de status, AD 08/08/2026: correção do dono de STAT-08 (não pertence ao Kanban), graphify (ferramenta de grafo de conhecimento usada para achar o erro de STAT-08), task-kanban/BoardFilters.tsx (mistaken destination for STAT-08)

### Community 82 - "UpdateBanner.tsx"
Cohesion: 0.50
Nodes (3): UPDATE, UpdateBanner(), UpdateBannerProps

### Community 83 - "Code Analysis Tools doc"
Cohesion: 0.83
Nodes (4): ast-grep (sg) structural search tool, Code Analysis Tools doc, grep standard text search, ripgrep (rg) text search tool

## Ambiguous Edges - Review These
- `ProjectsPanel.tsx` → `task-kanban T8: manual task creation form (NEEDS-DECISION)`  [AMBIGUOUS]
  .specs/features/task-kanban/tasks.md · relation: references
- `RUN Button` → `Chain/Link Icon Button`  [AMBIGUOUS]
  .specs/research/screenshots/14-toolbar-right.png · relation: conceptually_related_to
- `RUN Button` → `Glowing Sparkle/Burst Icon`  [AMBIGUOUS]
  .specs/research/screenshots/14-toolbar-right.png · relation: conceptually_related_to
- `Agent Rate-Limit Prompt Dialog` → `Spec File Diff Output in Terminal`  [AMBIGUOUS]
  .specs/research/screenshots/01-main-grid.png · relation: conceptually_related_to
- `Terminal Statuses Settings Nav Item` → `Per-Project Task Count Indicator ("1 tasks")`  [AMBIGUOUS]
  .specs/research/screenshots/07-settings-projects.png · relation: conceptually_related_to
- `Starter Plan (€2.99/month)` → `Conversation History (Pro only)`  [AMBIGUOUS]
  .specs/research/screenshots/05-paywall-feature-matrix.png · relation: conceptually_related_to
- `Starter Plan (€2.99/month)` → `Git Integration & AI Commits (Pro only)`  [AMBIGUOUS]
  .specs/research/screenshots/05-paywall-feature-matrix.png · relation: conceptually_related_to
- `Starter Plan (€2.99/month)` → `Keyboard Shortcuts (Pro only)`  [AMBIGUOUS]
  .specs/research/screenshots/05-paywall-feature-matrix.png · relation: conceptually_related_to
- `Starter Plan (€2.99/month)` → `Manage MCP / Claude Code Permissions`  [AMBIGUOUS]
  .specs/research/screenshots/05-paywall-feature-matrix.png · relation: conceptually_related_to
- `Starter Plan (€2.99/month)` → `Task Labels (Pro only)`  [AMBIGUOUS]
  .specs/research/screenshots/05-paywall-feature-matrix.png · relation: conceptually_related_to
- `Starter Plan (€2.99/month)` → `Turbo Mode (3x Boost, Pro only)`  [AMBIGUOUS]
  .specs/research/screenshots/05-paywall-feature-matrix.png · relation: conceptually_related_to
- `Onboarding Agent chat widget` → `Localization inconsistency: English UI text with Spanish input placeholder`  [AMBIGUOUS]
  .specs/research/screenshots/11-onboarding-agent.png · relation: conceptually_related_to
- `Chat input field ("Pregúntame algo...") with send button` → `Localization inconsistency: English UI text with Spanish input placeholder`  [AMBIGUOUS]
  .specs/research/screenshots/11-onboarding-agent.png · relation: conceptually_related_to
- `Layout/Panel Toggle Icon` → `Add/New Item Icon (plus in square)`  [AMBIGUOUS]
  .specs/research/screenshots/13-toolbar-left.png · relation: conceptually_related_to
- `STAT-08: Status como filtro` → `KAN-06 (task-kanban requirement, mistakenly linked to STAT-08)`  [AMBIGUOUS]
  .specs/features/terminal-statuses/spec.md · relation: references
- `STAT-08: Status como filtro` → `task-kanban/BoardFilters.tsx (mistaken destination for STAT-08)`  [AMBIGUOUS]
  .specs/features/terminal-statuses/spec.md · relation: references

## Knowledge Gaps
- **482 isolated node(s):** `$schema`, `src/**`, `tests/**`, `docs/**`, `Bash(git commit)` (+477 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **189 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `ProjectsPanel.tsx` and `task-kanban T8: manual task creation form (NEEDS-DECISION)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `RUN Button` and `Chain/Link Icon Button`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `RUN Button` and `Glowing Sparkle/Burst Icon`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Agent Rate-Limit Prompt Dialog` and `Spec File Diff Output in Terminal`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Terminal Statuses Settings Nav Item` and `Per-Project Task Count Indicator ("1 tasks")`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Starter Plan (€2.99/month)` and `Conversation History (Pro only)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Starter Plan (€2.99/month)` and `Git Integration & AI Commits (Pro only)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._