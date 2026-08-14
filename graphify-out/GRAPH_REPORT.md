# Graph Report - ide  (2026-08-13)

## Corpus Check
- 146 files · ~154,395 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1548 nodes · 3436 edges · 74 communities (72 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bb636037`
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
- tests/session.rs
- client.rs
- tauri.conf.json
- prefs.rs
- terminal.rs
- meta.rs
- AGENTS.md
- send.rs
- spec-driven-eval skill
- task_service.rs
- deny
- portable.rs
- lessons.py
- SettingsShell.tsx
- swarmdeck-mcp/src/main.rs
- restore
- terminals.ts
- spec-loop skill
- Validate & Verify doc
- devDependencies
- Header.tsx
- EmptyState.tsx
- compilerOptions
- Db
- ProjectsPanel.tsx
- TerminalHeader.tsx
- similarity.rs
- StatusesPanel.tsx
- with_db
- App.tsx
- tlc-spec-driven skill
- make-portable.mjs
- agent_prefs.rs
- skip_version
- launch.rs
- picker_prefs.rs
- CI Workflow (ci.yml)
- Release Workflow (release.yml)
- cargo build --workspace redundancy (corrected gate description)
- project_list
- agent_default
- bump-version.mjs
- Evidence-or-zero core rule
- paths.rs
- default.json
- patch-latest-json.mjs
- GridLayout.tsx
- kanban.rs
- windows/settings.rs
- Discuss Gray Areas doc
- spec-driven-execution skill
- Todo ajuste passa pela spec (rule)
- Execute (implement) doc
- Code Analysis Tools doc

## God Nodes (most connected - your core abstractions)
1. `Db` - 50 edges
2. `IpcServer` - 37 edges
3. `TerminalManager` - 31 edges
4. `DbError` - 30 edges
5. `TaskError` - 24 edges
6. `err_response()` - 23 edges
7. `RouteResult` - 22 edges
8. `PtySession` - 22 edges
9. `spec-driven-eval skill` - 22 edges
10. `ProjectError` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Implementador brief` --semantically_similar_to--> `Implementer sub-agent role`  [INFERRED] [semantically similar]
  .claude/skills/spec-loop/references/agent-briefs.md → .claude/skills/spec-driven-execution/SKILL.md
- `spawn_fake_app()` --calls--> `socket_path()`  [INFERRED]
  crates/swarmdeck-mcp/src/tools.rs → crates/swarmdeck-mcp/src/client.rs
- `resolve_launch_command()` --calls--> `catalog()`  [INFERRED]
  src-tauri/src/agents/launch.rs → src-tauri/src/agents/catalog.rs
- `resolve_launch_command()` --calls--> `detect_installed()`  [INFERRED]
  src-tauri/src/agents/launch.rs → src-tauri/src/agents/catalog.rs
- `resolve_effective_default()` --calls--> `detect_installed()`  [INFERRED]
  src-tauri/src/agents/prefs.rs → src-tauri/src/agents/catalog.rs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Spec-driven triage-loop-plan-implement-evaluate pipeline** — claude_skills_spec_triage_skill, claude_skills_spec_loop_skill, claude_skills_tlc_spec_driven_skill, claude_skills_spec_driven_execution_skill, claude_skills_spec_driven_eval_skill [INFERRED 0.85]
- **Author-not-verifier independent verification principle** — claude_skills_tlc_spec_driven_skill_verifier, claude_skills_spec_driven_execution_skill_verifier, claude_skills_spec_loop_references_agent_briefs_validador, claude_skills_spec_driven_eval_skill_judge_author_rule [INFERRED 0.85]
- **Discover-once project profile pattern** — claude_skills_spec_triage_skill_project_profile, claude_skills_spec_driven_execution_skill_project_profile, claude_skills_spec_loop_skill [INFERRED 0.75]

## Communities (74 total, 2 thin omitted)

### Community 0 - "server.rs"
Cohesion: 0.09
Nodes (57): Into, IpcConnection, CreateProjectArgs, CreateTaskArgs, emit_task_changed(), err_response(), err_response_with(), FindRelatedArgs (+49 more)

### Community 1 - "catalog.rs"
Cohesion: 0.20
Nodes (14): AgentDescriptor, AgentStatus, catalog(), catalogo_tem_os_5_agentes_com_ids_esperados(), command_exists_in_dir(), command_exists_in_path(), detect_installed(), detect_installed_with() (+6 more)

### Community 2 - "TerminalManager"
Cohesion: 0.07
Nodes (61): HashSet, alive_terminal_ids(), get_with_project(), list_with_projects(), lista_tarefa_com_projeto_embutido(), ProjectRefDto, projeto_fica_nulo_apos_exclusao(), AppHandle (+53 more)

### Community 3 - "PtySession"
Cohesion: 0.08
Nodes (32): Child, Default, MasterPty, PtySession, Arc, Box, CommandBuilder, Duration (+24 more)

### Community 4 - "String"
Cohesion: 0.11
Nodes (46): env_var_test_lock(), MutexGuard, ActivityResult, as_object(), ciclo_completo_create_start_complete_complete_via_interface_mcp(), CreateProjectParams, CreateTaskParams, erro_do_app_chega_como_erro_mcp_descritivo() (+38 more)

### Community 5 - "tasks/service.rs"
Cohesion: 0.10
Nodes (51): apply_transition(), complete(), create(), delete(), get(), list(), list_active(), list_by_project() (+43 more)

### Community 6 - "Task"
Cohesion: 0.07
Nodes (41): BoardFilterCounts, BoardFilters(), BoardFiltersProps, countByStatus(), distinctProjects(), EMPTY_COUNTS, matchesQuery(), STATUS_LABELS (+33 more)

### Community 7 - "status_catalog.rs"
Cohesion: 0.10
Nodes (51): CatalogError, color_distance(), cores_visualmente_proximas_geram_aviso_na_criacao(), create(), create_com_rotulo_e_instrucao_grava_status_habilitado_com_cor_inedita(), create_sem_rotulo_ou_sem_instrucao_e_recusado(), CreateOutcome, delete() (+43 more)

### Community 8 - "check.rs"
Cohesion: 0.10
Nodes (43): S, already_pending(), check_and_download(), com_pendente_instala_e_intercepta(), falha_na_instalacao_ainda_intercepta_para_fechar_em_seguida(), handle_close(), AppHandle, FnOnce (+35 more)

### Community 9 - "db.rs"
Cohesion: 0.08
Nodes (31): aplica_migracoes_em_banco_novo(), cria_o_schema_de_terminal_layout(), migracao_e_idempotente(), registra_a_versao_aplicada(), PathBuf, TempDir, temp_db_path(), title_source_so_aceita_agent_ou_user() (+23 more)

### Community 10 - "projects/service.rs"
Cohesion: 0.11
Nodes (50): exact_path_matches_project(), folder_name(), is_prefix(), mixed_separators_still_resolve(), most_specific_project_wins_among_two_matches(), no_match_falls_back_to_folder_name(), normalized_components(), project() (+42 more)

### Community 11 - "ipc_server.rs"
Cohesion: 0.13
Nodes (40): Listener, IpcConnection, LocalSocketTransport, Box, PathBuf, Read, Result, Self (+32 more)

### Community 12 - "tests/session.rs"
Cohesion: 0.22
Nodes (17): comando_inexistente_falha_no_spawn(), processo_encerrado_reporta_exit_code(), pump_until(), pump_until_exit(), resize_e_aceito_pelo_kernel(), CommandBuilder, Duration, Fn (+9 more)

### Community 13 - "client.rs"
Cohesion: 0.13
Nodes (37): ativo_retorna_true_e_terminal_id(), call_tool(), call_tool_com_conexao_recusada_retorna_err(), call_tool_ok_false_do_app_vira_err_com_a_mensagem(), call_tool_ok_true_relay_sem_reinterpretar(), call_tool_over(), call_tool_sem_terminal_id_retorna_err_sem_conectar(), check_active() (+29 more)

### Community 14 - "tauri.conf.json"
Cohesion: 0.05
Nodes (38): appimage, deb, https://github.com/rafaelsene01/swarmdeck/releases/latest/download/latest.json, icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico (+30 more)

### Community 15 - "prefs.rs"
Cohesion: 0.27
Nodes (16): default_agent(), EffectiveDefault, fake_catalog(), nenhum_agente_instalado_devolve_none(), preferencia_instalada_e_honrada_sem_fallback(), preferencia_nao_instalada_cai_para_o_primeiro_disponivel_e_avisa(), resolve_effective_default(), resolve_effective_default_with() (+8 more)

### Community 16 - "terminal.rs"
Cohesion: 0.13
Nodes (30): Channel, parse_id(), pty_kill(), pty_resize(), pty_spawn(), pty_write(), pump_output(), AppHandle (+22 more)

### Community 17 - "meta.rs"
Cohesion: 0.16
Nodes (24): clear_status_nao_falha_num_terminal_sem_registro(), clear_status_zera_o_badge_sem_passar_pelo_catalogo(), dois_terminais_diferentes_nao_interferem_um_no_outro(), extract_valid_ids(), MetaError, open_db(), push_activity_nao_altera_titulo_nem_status_em_memoria(), rename_manual_do_usuario_vence_chamada_seguinte_do_agente() (+16 more)

### Community 18 - "AGENTS.md"
Cohesion: 0.15
Nodes (13): Traceability Marker (SPEC: comment convention), .claude/rules/spec-driven-changes.md (traceability marker rule), agent-selection (feature), mcp-task-server (feature), multi-terminal (feature), projects (feature), release-distribution (feature), task-kanban (feature) (+5 more)

### Community 19 - "send.rs"
Cohesion: 0.16
Nodes (23): create_task_with_terminal(), criacao_manual_via_task_service_entra_em_pending(), delete_remove_a_tarefa_do_banco(), format_task_context(), format_task_context_inclui_id_titulo_descricao_e_plano(), get_apos_delete_retorna_not_found_o_que_fecha_o_detalhe_aberto(), resolve_alive_terminal(), Connection (+15 more)

### Community 20 - "spec-driven-eval skill"
Cohesion: 0.12
Nodes (24): spec-driven-eval quickstart guide, 4-chat-session evaluation flow, Example Wishlist PRD, Calibration anchors (MET/UNMET boundary), spec-driven-eval reference (template/anchors/example), Evaluation report template, Worked example: Start Free Trial Without a Card, spec-driven-eval skill (+16 more)

### Community 21 - "task_service.rs"
Cohesion: 0.24
Nodes (16): complete_a_partir_de_in_progress_leva_a_in_testing_nunca_direto_a_completed(), complete_a_partir_de_in_testing_leva_a_completed(), complete_ou_start_com_task_id_inexistente_falha_sem_criar_linha(), count_tasks(), create_com_cwd_em_subpasta_do_projeto_resolve_o_mesmo_projeto(), create_com_cwd_igual_ao_path_do_projeto_infere_o_project_id(), create_sem_projeto_correspondente_deixa_project_id_nulo_sem_criar_projeto(), ctx() (+8 more)

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
Cohesion: 0.14
Nodes (11): CheckState, MODE_LABEL, UpdateSettings(), UpdateSettingsProps, root, AgentCatalogEntry, ProjectRecord, SectionId (+3 more)

### Community 26 - "swarmdeck-mcp/src/main.rs"
Cohesion: 0.14
Nodes (16): CheckActiveResult, main(), Box, Error, Json, Option, Result, Self (+8 more)

### Community 27 - "restore"
Cohesion: 0.19
Nodes (18): LayoutEntry, default_entry(), LayoutEntry, now_unix(), restore(), Option, Path, Result (+10 more)

### Community 28 - "terminals.ts"
Cohesion: 0.18
Nodes (10): App(), evenWidths(), { invokeMock, openMock }, close(), LayoutEntry, maximize(), minimize(), PaneMode (+2 more)

### Community 29 - "spec-loop skill"
Cohesion: 0.13
Nodes (19): Corretor brief, spec-loop subagent briefs doc, Implementador brief, UAT brief (exercitar produto real), Validador brief (missao e falsificar), spec-loop skill, Modo direto (implementation only), JOURNAL.md run journal (+11 more)

### Community 30 - "Validate & Verify doc"
Cohesion: 0.16
Nodes (16): Feature-level validation (post-last-task), Lessons self-improving layer doc, .specs/lessons.json canonical state, .specs/LESSONS.md rendered playbook, scripts/lessons.py, Sub-Agent Delegation mechanics doc, Phase-batch workers (~7 tasks/worker), Verifier sub-agent (always-on) (+8 more)

### Community 31 - "devDependencies"
Cohesion: 0.04
Nodes (48): jsdom, lucide-react, dependencies, lucide-react, react, react-dom, @tauri-apps/api, @tauri-apps/plugin-dialog (+40 more)

### Community 32 - "Header.tsx"
Cohesion: 0.40
Nodes (3): Header(), HeaderProps, INERT_LABELS

### Community 34 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, ES2022, @testing-library/jest-dom, vitest/globals, compilerOptions, allowImportingTsExtensions, baseUrl (+19 more)

### Community 35 - "Db"
Cohesion: 0.25
Nodes (8): AsRef, DbError, Error, Db, Connection, Path, Result, Self

### Community 36 - "ProjectsPanel.tsx"
Cohesion: 0.39
Nodes (7): filterProjects(), ProjectRow, ProjectsPanel(), ProjectsPanelProps, sortByLastUsed(), PROJECTS, truncatePath()

### Community 37 - "TerminalHeader.tsx"
Cohesion: 0.21
Nodes (12): ActivityEntry, ActivityLog(), ActivityLogProps, formatActivityTime(), sortByMostRecent(), ENTRIES, STATUS_BADGE_MAX_LABEL_LENGTH, StatusBadge() (+4 more)

### Community 38 - "similarity.rs"
Cohesion: 0.24
Nodes (16): completed_tasks_are_ignored_even_when_near_identical(), find_similar(), identical_candidate_scores_near_one_and_recommends_reuse(), make_task(), moderately_similar_pair_falls_in_mid_range_and_recommends_ask_user(), paraphrased_pagination_request_falls_in_high_range_and_recommends_reuse(), Option, String (+8 more)

### Community 39 - "StatusesPanel.tsx"
Cohesion: 0.36
Nodes (5): StatusesPanel(), StatusesPanelProps, StatusRow, STATUSES, truncateInstruction()

### Community 40 - "with_db"
Cohesion: 0.25
Nodes (17): AppHandle, FnOnce, Mutex, Option, Result, State, String, T (+9 more)

### Community 41 - "App.tsx"
Cohesion: 0.17
Nodes (13): AgentCatalogEntry, createTerminalId(), defaultTerminal(), NewTerminalDialog(), NewTerminalDialogProps, CATALOG, { invokeMock, openMock }, TerminalPane() (+5 more)

### Community 42 - "tlc-spec-driven skill"
Cohesion: 0.19
Nodes (14): Context Limits doc, Context zones (healthy/moderate/critical), AD-NNN project decision entry, Design phase doc, Knowledge Verification Chain, Risks & Concerns section, ## Decisions append-only log (AD-NNN), Memory Layer doc (+6 more)

### Community 43 - "make-portable.mjs"
Cohesion: 0.26
Nodes (12): APP_NAME, defaultBinaryPath(), main(), parseArgs(), PORTABLE_MARKER, portableArchiveName(), portableReadme(), ROOT (+4 more)

### Community 44 - "agent_prefs.rs"
Cohesion: 0.18
Nodes (14): agente_padrao_removido_do_sistema_cai_para_o_primeiro_disponivel_e_avisa(), grava_e_le_de_volta_na_mesma_sessao(), padrao_persiste_entre_reinicios(), path_lock(), PathIsoladoGuard, Drop, MutexGuard, Option (+6 more)

### Community 45 - "skip_version"
Cohesion: 0.22
Nodes (13): auto_check(), is_version_skipped(), Connection, Result, set_auto_check(), skip_version(), auto_check_nasce_ligado_num_banco_novo(), migracao_de_settings_e_idempotente() (+5 more)

### Community 46 - "launch.rs"
Cohesion: 0.33
Nodes (12): agente_conhecido_e_instalado_lanca_seu_comando(), agente_pedido_mas_nao_instalado_cai_para_shell(), aviso_descreve_o_agente_que_faltou(), fake_catalog(), LaunchResolution, resolve_launch_command(), resolve_with(), AgentDescriptor (+4 more)

### Community 47 - "picker_prefs.rs"
Cohesion: 0.29
Nodes (11): banco_novo_nao_tem_diretorio_gravado(), last_dir(), migracao_e_idempotente_em_banco_persistido(), open_db(), Connection, Option, Result, String (+3 more)

### Community 48 - "CI Workflow (ci.yml)"
Cohesion: 0.40
Nodes (5): CI Workflow (ci.yml), ci.yml: clippy job, ci.yml: commits job (Conventional Commits gate), ci.yml: frontend job, ci.yml: rust job

### Community 49 - "Release Workflow (release.yml)"
Cohesion: 0.90
Nodes (5): Release Workflow (release.yml), release.yml: build job (Windows/Linux matrix), release.yml: cleanup job, release.yml: finalize job, release.yml: prepare job

### Community 51 - "project_list"
Cohesion: 0.44
Nodes (10): project_create(), project_delete(), project_list(), project_update(), Mutex, Option, Result, State (+2 more)

### Community 52 - "agent_default"
Cohesion: 0.29
Nodes (9): agent_catalog(), agent_default(), AgentCatalogEntry, Mutex, Option, Result, State, String (+1 more)

### Community 53 - "bump-version.mjs"
Cohesion: 0.38
Nodes (9): BUMP_KINDS, bumpVersion(), main(), parseArgs(), parseVersion(), resolveVersion(), setJsonVersion(), setWorkspaceVersion() (+1 more)

### Community 54 - "Evidence-or-zero core rule"
Cohesion: 0.67
Nodes (3): Evidence-or-zero core rule, "Número copiado para a prosa" anti-pattern, Spec-anchored acceptance criteria check

### Community 55 - "paths.rs"
Cohesion: 0.13
Nodes (31): allow_write(), current_exe_dir(), data_dir(), db_path(), deny_write(), Flavor, is_writable(), is_writable_reprova_diretorio_somente_leitura() (+23 more)

### Community 60 - "default.json"
Cohesion: 0.20
Nodes (9): core:default, dialog:default, main, updater:default, description, identifier, permissions, $schema (+1 more)

### Community 67 - "patch-latest-json.mjs"
Cohesion: 0.42
Nodes (7): main(), parseArgs(), patchManifest(), pickAssetUrlByName(), DRAFT_ASSETS, scriptPath, withReleaseTag()

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

### Community 77 - "Todo ajuste passa pela spec (rule)"
Cohesion: 0.29
Nodes (7): Cargo.toml workspace manifest, Ask before writing code principle, Todo ajuste passa pela spec (rule), Shared-file marker placement exception, SPEC: traceability marker, Old spec revocation procedure, src-tauri/src/lib.rs entry point

### Community 78 - "Execute (implement) doc"
Cohesion: 0.22
Nodes (9): Coding Principles doc, Goal-driven principle, Simplicity principle, Surgical changes principle, Test integrity principle, Atomic git commit per task, Execute (implement) doc, Gate Check (VERIFY step) (+1 more)

### Community 83 - "Code Analysis Tools doc"
Cohesion: 0.83
Nodes (4): ast-grep (sg) structural search tool, Code Analysis Tools doc, grep standard text search, ripgrep (rg) text search tool

## Knowledge Gaps
- **192 isolated node(s):** `$schema`, `src/**`, `tests/**`, `docs/**`, `Bash(git commit)` (+187 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Db` connect `Db` to `server.rs`, `TerminalManager`, `status_catalog.rs`, `with_db`, `ipc_server.rs`, `picker_prefs.rs`, `terminal.rs`, `meta.rs`, `project_list`, `agent_default`, `restore`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `TestEnvGuard` connect `String` to `PtySession`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `TerminalManager` connect `TerminalManager` to `terminal.rs`, `server.rs`, `send.rs`, `ipc_server.rs`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `$schema`, `src/**`, `tests/**` to the rest of the system?**
  _192 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.08673050615595075 - nodes in this community are weakly interconnected._
- **Should `TerminalManager` be split into smaller, more focused modules?**
  _Cohesion score 0.06773211567732115 - nodes in this community are weakly interconnected._
- **Should `PtySession` be split into smaller, more focused modules?**
  _Cohesion score 0.07673469387755102 - nodes in this community are weakly interconnected._