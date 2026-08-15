# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.
## [0.1.5] - 2026-08-15

### Outros

- Delete graphify-out directory

- Delete screenshots directory

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Enhance CLAUDE.MD with new Knowledge Graph section detailing usage scenarios and best practices. Update settings.json to introduce PreToolUse hooks for smart grep functionality and improve command execution for code review graph tools, ensuring better integration and user experience.

- Add .gitignore and project.yml for Serena configuration; enhance update handling in Tauri

- Implement release-distribution update handling in App component; add tests for update badge visibility in Header. Enhance App and Header components to manage and display update availability status, ensuring a seamless user experience during updates.

- Refactor async function signature and improve logging format in update handling. Ensure consistent code style in apply.rs and re-order module imports in mod.rs for better organization.

## [0.1.4] - 2026-08-13

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Remove obsolete specification and project documentation files from the repository, including README.md, EXECUTION.md, PROJECT.md, ROADMAP.md, and STATE.md. This cleanup streamlines the project structure and eliminates outdated content that no longer reflects the current state of development. Additionally, remove associated screenshots and triage documentation to maintain consistency in project resources.

- Update stat-index.json to reflect changes in file sizes, modification times, and word counts for various project documentation and specifications. This update ensures accurate tracking of project resources and maintains consistency across the cache.

- Refactor conversation-cleanup specification to clarify feature description and remove outdated notification and worktree specifications. This update enhances documentation accuracy and streamlines project resources by eliminating obsolete files.

- Remove obsolete testing and specification files for agent selection and conversation cleanup features. This cleanup enhances project organization by eliminating outdated documentation that no longer reflects the current development state, streamlining resources for future work.

- Update .gitignore to exclude .specs directory, enhance AGENTS.md with concise build and test command descriptions, and add lucide-react dependency in package.json and package-lock.json. Refactor App component to initialize with an empty terminal state and integrate Header and EmptyState components for improved user experience.

- Update .gitignore to refine ignored files, remove AGENTS.md for improved project clarity, and enhance CLAUDE.MD with detailed MCP tools usage instructions. Introduce new skills for debugging, exploring the codebase, refactoring safely, and reviewing changes, while deleting obsolete spec-driven-eval files to streamline resources and maintain documentation accuracy.

## [0.1.3] - 2026-08-12

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Update specifications and tasks across multiple features. Enhanced agent-selection and multi-terminal specs with new task details, including session management improvements and directory selection. Corrected task statuses and integrated components in terminal-statuses and task-kanban features. Verified updates in release-distribution tasks, ensuring accurate tracking of implementation progress and addressing integration gaps. Documented changes to reflect the current state of the project and improve clarity in specifications.

- Update graph output files and enhance documentation. Added new entries to .graphify_labels.json and .graphify_labels.json.sig, reflecting recent changes in project structure and features. Updated GRAPH_REPORT.md to include the latest statistics and community hubs. Adjusted .graphify_root for improved path management. Introduced new files for the 2026-08-11 run, ensuring comprehensive tracking of project evolution and task specifications.

- Merge `terminal-statuses/T5` into `mcp-task-server/T9` to unify the implementation of terminal status updates. The integration resolves the dependency on `IpcServer` for real-time status changes and finalizes the architectural decision regarding `Arc-wrapping`. Additionally, `projects/T5` is descheduled to ensure the original `create` function is properly migrated, aligning with user decisions from the latest triage. Updated project state documentation to reflect these changes and the current status of tasks.

## [0.1.2] - 2026-08-03

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Update documentation and specifications for SwarmDeck. Refine README.md to clarify product methodology, enhance UI inventory descriptions, and adjust feature specifications based on observed product behavior. Add new entries to .gitignore for local daemon state and revise project state documentation to reflect changes in specification approach. Ensure consistency in terminology and improve clarity across multiple spec files.

## [0.1.1] - 2026-08-03

### Outros

- Initialize SwarmDeck project with essential files and configurations. Added .gitignore, Cargo.toml, and Cargo.lock for Rust setup. Created package.json and package-lock.json for Node.js dependencies. Included basic HTML structure in index.html and TypeScript configuration in tsconfig.json. Set up Vite for development and testing. Added initial specifications and testing strategy documentation in .specs directory.

- Update dependencies in Cargo.lock and Cargo.toml; refine skill documentation and task specifications. Added new packages including `cfg_aliases`, `downcast-rs`, `filedescriptor`, `lazy_static`, `nix`, `portable-pty`, `serial2`, `shared_library`, and `shell-words`. Removed unnecessary flags for ConPTY in design and tasks documentation, reflecting changes in `portable-pty` 0.9.0. Adjusted terminal module structure for better session management.

- Enhance documentation and testing for terminal session management. Updated SKILL.md to clarify task behavior regarding file declarations. Expanded README.md to include new release and distribution features, increasing traceable requirements. Improved TESTING.md with detailed explanations of testing strategies for scripts and pipelines. Added timeout handling in PtySession for graceful shutdowns and implemented synchronization in session tests to prevent concurrency issues.

- Update documentation in README.md, TESTING.md, EXECUTION.md, ROADMAP.md, and STATE.md to correct task counts, execution statuses, and clarify testing strategies. Adjusted task descriptions to reflect accurate information following triagem 001. Enhanced clarity on parallel execution capabilities and removed outdated planning statuses.

- Revise MCP tool contract documentation in `tasks.md` to reflect user decision on freezing inferred names from `CLAUDE.md` without prior validation against the reference implementation. Update `STATE.md` to resolve the corresponding block and clarify the impact on task execution statuses. Adjust `Done when` criteria in `tasks.md` to align with the new contract approach, removing the need for external validation.

- Update documentation across multiple files to reflect user decisions from triagem 002 on task verification processes and execution statuses. Adjust README.md to correct execution status for `EXECUTE`, clarify the MCP tool contract in `tasks.md`, and enhance `TESTING.md` with detailed verification rules for `uat-agent` tasks. Revise `STATE.md` to document the implications of these changes on task execution and verification criteria, ensuring consistency across project specifications.

- Add updater plugin configuration in tauri.conf.json for automatic updates

- Add MCP server configuration to settings.json, including context7 command and deny all setting

- Refactor MCP server settings in settings.json to enhance command handling and security configurations, including updates to context7 command and deny all settings.

- Enhance SKILL.md documentation for spec-driven execution. Updated descriptions to clarify the orchestrator's role, added details on project profile discovery, and improved the explanation of sub-agent roles and their interactions. Expanded the section on Phase 0 to provide clearer guidance on building the project profile, ensuring users understand the necessary steps and requirements for effective execution.

- Refactor database migration constant in mod.rs for improved readability. Update test assertions in throttle.rs for better formatting and clarity. Simplify pump_until function signature in session.rs for consistency and readability.

- Enhance release distribution profile in Cargo.toml for optimized binary size by enabling stripping and thin LTO. Add new test script command in package.json. Update task status in release-distribution documentation to reflect progress. Modify tauri configuration for versioning and installer targets. Implement database path management in Tauri application setup for improved data handling.

- Refactor Tauri application setup for improved database path management and update tauri configuration for versioning and installer targets. Enhance release distribution documentation with new test script command in package.json and update task status to reflect current progress.

- Enhance documentation in spec-driven changes and SKILL.md to clarify the exception for shared file markers and detail the new run mode options. Update agent briefs to reflect the impact of the chosen mode on brief usage, ensuring users understand the implications for execution and validation processes.

- Update test script command in package.json to use glob pattern for test files. Enhance CI workflow by adding Clippy checks for Rust code quality and updating dependencies installation. Revise release distribution documentation to reflect the current implementation status and clarify task execution requirements. Document changes in STATE.md regarding the correction of the test command and the impact on task verification processes.

- Update Cargo.toml and related files to include new dependencies for release distribution and update capabilities. Enhance the Tauri application setup by integrating the updater plugin and refining command structures. Revise documentation in STATE.md and ROADMAP.md to reflect the current status of tasks and features, ensuring clarity on implementation progress and verification processes.

- Enhance SKILL.md documentation to clarify the orchestration context management and task execution rules. Introduce guidelines for handling task reports and context accumulation during large runs, emphasizing the importance of summarizing completed tasks and maintaining an efficient orchestration process. Update catalog.rs to improve command existence checks by utilizing case-insensitive comparisons and refining file type validation logic.

- Refactor agent preference test to improve clarity and functionality. Update the `with_only_codex_instalado` method to dynamically set the binary name based on the operating system, ensuring compatibility across platforms. Add specification comment for agent selection (AGT-01) to enhance documentation.

- Update task statuses and documentation across multiple features. Corrected task counts in README.md, agent-selection, multi-terminal, and mcp-task-server specs. Enhanced coverage details and clarified integration gaps in tasks.md for agent-selection and multi-terminal. Adjusted release-distribution tasks to reflect implementation progress and pipeline dependencies. Addressed verification needs for UI components in multi-terminal and ensured accurate documentation in ROADMAP.md and EXECUTION.md.

- Audit and fix critical bugs in release distribution tasks. Identified and documented two major issues: incorrect file paths in the commit step of T6, which would cause job failures, and a default binary path mismatch in T7 that could lead to integration issues. Updated task documentation to reflect these findings and clarified the impact on the pipeline execution. Ensured accurate tracking of task statuses and dependencies in the release-distribution spec.

- Fix release workflow to correctly add files for commit. Updated `release.yml` to reference the correct paths for `Cargo.toml` and `Cargo.lock`, ensuring the release process functions as intended. Adjusted task documentation to reflect this critical change and prevent future job failures.

- Refactor test assertions and formatting for improved readability. Updated multiple test cases in `tasks.rs` and `status_catalog.rs` to enhance clarity by breaking long lines and ensuring consistent formatting. This change aims to improve code maintainability and readability in test scenarios.

- Populate AGENTS.md with project documentation and guidelines for language usage, traceability markers, and commit practices. Update Cargo.lock and package.json to include new dependencies for dialog and file handling plugins. Enhance multi-terminal specs with new features for session restoration and directory selection, including integration of native folder picker and session management improvements. Update agent-selection specs to reflect observed features and new tasks for resuming sessions. Document changes in tasks.md and spec.md to ensure clarity on implementation progress and verification processes.


