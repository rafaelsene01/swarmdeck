# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.
## [0.1.20] - 2026-08-18

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Enhance TerminalPane to handle pending data before terminal ID resolution

- Introduced a mechanism to store bytes produced by xterm before `pty_spawn` resolves, preventing data loss during session restoration.
- Implemented a `sendToPty` function to manage data transmission to the terminal, ensuring that pending data is sent once the terminal ID is available.

## [0.1.19] - 2026-08-18

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Implement session restoration handling for delayed agent catalog response

- Added a new test to verify that sessions are correctly restored when the agent catalog is received after the workspace is loaded.
- Introduced a state variable to manage the catalog loading status, preventing the session restoration modal from displaying prematurely.
- Updated the App component to handle the catalog response and ensure proper session restoration behavior.

- Update base64 dependency and enhance public key handling in signature verification

- Added `base64` crate as a direct dependency in `Cargo.toml` to facilitate public key decoding.
- Implemented `parse_public_key` and `parse_signature` functions to handle multiple formats of public keys and signatures, improving robustness in the signature verification process.
- Updated tests to ensure correct handling of public keys and signatures in various formats.

- Refactor test assertions for improved readability

- Reformatted the assertion in the `build_open_command_roteia_script_do_windows_por_cmd` test for better clarity and alignment.
- Simplified the error handling in the `verify_signature` function by combining method calls into a single line for improved conciseness.

- Revert "chore(release): v0.1.19"

This reverts commit 869283a52d3eafc6d2ce41076aa685b25055f73a.

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Update tauri configuration to include installer icon

- Added "installerIcon" property to the NSIS configuration in tauri.conf.json to specify the icon used for the installer.

## [0.1.18] - 2026-08-18

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Refactor App component to integrate Settings as an overlay

- Updated the App component to mount the SettingsShell inline as an overlay instead of opening a separate OS window.
- Modified the settings_open command handling to reflect the new overlay behavior.
- Enhanced the SettingsShell component to support closing via backdrop click and Escape key.
- Updated tests to verify the new overlay functionality and interactions with the settings modal.

## [0.1.17] - 2026-08-17

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Refactor save function call for improved readability in terminal layout tests

- Reformatted the `save` function call in the terminal layout tests to enhance code clarity and maintainability.
- Ensured consistent formatting for better alignment with coding standards.

- Enhance TerminalHeader and App components for editor integration

- Added `cwd` prop to the `TerminalHeader` component to pass the current working directory to the `EditorMenu`.
- Updated the `TerminalHeader` test to reflect the new button for opening the editor.
- Introduced editor-related specifications in relevant files to support editor launch functionality.
- Refactored command resolution logic in the Tauri backend to facilitate editor command execution.

## [0.1.16] - 2026-08-17

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Refactor QuotaIndicator component to correct arc order and update test descriptions

- Adjusted the drawing order for the `QuotaIndicator` component to reflect the correct relationship between the 5h and weekly arcs.
- Updated test descriptions for clarity, ensuring they accurately describe the expected behavior of the popover and arc order.
- Modified the `KINDS_FOR` mapping to align with the new order, enhancing consistency across the component's logic and tests.

- Update LayoutMenu styles for improved responsiveness and alignment

- Changed the width of the dropdown menu to use `max-content` for better adaptability.
- Adjusted layout menu item styles to justify content to the start, enhancing visual alignment.
- Modified nested item width to `auto`, allowing for more flexible layout behavior.

## [0.1.15] - 2026-08-17

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Refactor update process and enhance silent update functionality

- Updated the update workflow to separate the download and installation steps, allowing for a smoother user experience during updates.
- Introduced progress tracking for downloads, emitting events to update the UI accordingly.
- Modified the UpdateSettings component to reflect changes in the update state and improve user interaction.
- Updated tests to ensure the new download and install flow works as expected, including handling of download progress and installation confirmation.
- Enhanced the update mechanism to ensure compatibility with the latest Tauri plugin updates.

- Implement terminal layout options and enhance workspace management

- Added support for terminal layout options, allowing users to customize the arrangement of terminal panes.
- Introduced functionality to save and restore terminal workspaces, preserving layout and terminal states across sessions.
- Updated the App component to handle workspace retrieval and saving with debounce to optimize performance.
- Enhanced GridLayout to apply layout plans based on the active tab's configuration.
- Refactored tests to cover new layout options and workspace management features, ensuring robust functionality.

- Update normalize_span function to use DEFAULT_SPAN constant

- Modified the normalize_span function to return DEFAULT_SPAN instead of a hardcoded string for unspecified spans, improving maintainability and consistency in the codebase.

- Refactor terminal initialization and update GridLayout handling

- Updated the default terminal initialization logic to reflect changes in workspace management, ensuring the app opens with an empty state when no previous layout is saved.
- Enhanced comments for clarity regarding the behavior of GridLayout and terminal state management, addressing issues with mode changes and internal snapshots.
- Improved the handling of terminal pane identities to maintain consistency during state updates.

- Implement session restore functionality and enhance terminal management

- Introduced session restore capabilities, allowing users to resume previous terminal sessions with saved states.
- Updated the TerminalPane and App components to handle session IDs and resume flags, ensuring proper initialization of terminal sessions.
- Enhanced workspace management to support the confirmation modal for restoring sessions, improving user experience during app boot.
- Refactored terminal state handling to include agent session IDs, facilitating seamless transitions between new and resumed sessions.
- Updated tests to cover new session restore features and ensure robust functionality across terminal management scenarios.

## [0.1.14] - 2026-08-16

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Refactor HTTP request handling and streamline test code

- Improved readability of the HTTP request handling by formatting the match statement.
- Simplified the test code for credential reading by condensing the fetch_with function call into a single line.

## [0.1.13] - 2026-08-16

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Refactor update mechanism and remove legacy code

- Updated the update workflow to reflect changes in the Tauri updater plugin, ensuring it handles updates across all platforms uniformly since SILENT-36.
- Removed the portable update logic and associated functions, streamlining the update process.
- Introduced a new function to retrieve the latest schema version from migrations, enhancing database management.
- Updated tests to align with the new update mechanism and ensure consistency in schema version checks.

- Enhance QuotaIndicator and refactor quota handling

- Increased the size of the QuotaIndicator icon for better visibility.
- Updated the styling of the icon to center it and match the new dimensions.
- Refactored the quota decoding logic to improve clarity and maintainability, introducing a new `plan_label` function to derive plan labels from the rate limit tier.
- Adjusted the credential reading function to return both the token and tier, streamlining the credential management process.

## [0.1.12] - 2026-08-16

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Add rustls as a direct dependency and implement crypto provider installation

- Added `rustls` as a direct dependency in `Cargo.toml` to ensure proper cryptographic provider installation.
- Implemented `install_crypto_provider` function in `lib.rs` to set the default crypto provider for `reqwest`, preventing panic during HTTP client construction.
- Updated tests in `manifest.rs` to verify that the HTTP client can be built without panic when the crypto provider is installed.

## [0.1.11] - 2026-08-16

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Enhance terminal functionality and update header components

- Added inline renaming feature for terminal tabs, allowing users to rename tabs directly.
- Implemented cloning and resetting of terminals, with appropriate state management to limit the number of terminals per tab.
- Updated the header component to remove unused elements and adjust the layout, improving the overall user interface.
- Enhanced quota indicator functionality to include a list of providers and their statuses, with tests to verify the new behavior.
- Refactored related components and tests to ensure consistency and reliability across the application.

## [0.1.10] - 2026-08-16

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Add terminal tab functionality to App component

- Implemented a new terminal tab system allowing users to create, close, and switch between multiple terminal tabs.
- Updated the App state management to handle terminal tabs, ensuring terminals are preserved when switching tabs.
- Enhanced tests for terminal tab interactions, verifying the creation of new tabs, terminal persistence, and closing behavior.
- Refactored related components to support the new tabbed interface, improving user experience and application structure.

- Implement terminal-chrome features and enhance styling

- Added functionality for maximizing terminal panes, ensuring they overlay the header and tab bar correctly.
- Updated the App component to reflect changes in terminal pane styling, including z-index and positioning adjustments for maximized states.
- Enhanced CSS variables for terminal-chrome, improving the visual distinction of terminal windows.
- Introduced new tests for terminal-chrome interactions, verifying the behavior of maximized terminals.
- Refactored related components to support the new terminal-chrome design, enhancing user experience.

## [0.1.9] - 2026-08-16

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Enhance silent update functionality in UpdateSettings and SettingsShell components

- Updated UpdateSettings to include a "Check for updates" button that triggers manual update checks, improving user interaction during the update process.
- Added handling for different update states, including loading and error states, to provide better feedback to users.
- Refactored SettingsShell to manage the state of the update check and ensure that the UI reflects the current update status without unnecessary loading indicators.
- Updated tests to cover new scenarios related to the silent update feature, ensuring robustness and reliability.

## [0.1.8] - 2026-08-15

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Add test for handling registry failure in silent update process

Introduce a new test case to verify that a failure in setting the registry does not invalidate an already applied update. The test ensures that the version reported remains correct and that the file swap has been successfully applied, even when the registry operation fails. Additionally, clean up unused code in check.rs and update module documentation in mod.rs to reflect the silent update feature.

- Refactor update module for Windows compatibility and enhance documentation

Add conditional compilation for Windows in the `apply.rs` and `check.rs` files to prevent dead code warnings during non-Windows builds. Update documentation to clarify the purpose of the `pubkey` function and the `run_with` function's Windows-specific context. This change ensures that the code remains clean and maintainable across different platforms.

- Refactor kanban and settings commands to be asynchronous

Update the `kanban_open`, `kanban_focus_main`, `settings_open`, and `settings_focus_main` functions to be asynchronous. This change is necessary to prevent blocking the main thread during window operations, ensuring smoother application performance and avoiding issues with window rendering and event processing.

## [0.1.7] - 2026-08-15

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Implement silent update functionality in the release workflow and UpdateSettings component. Add support for uploading signed raw executables and updating the latest.json manifest for silent updates. Refactor UpdateSettings to handle new update states and improve user feedback during the update process. Enhance SettingsShell to manage update status and apply updates with user confirmation. Update tests to cover new silent update scenarios and ensure proper functionality.

## [0.1.6] - 2026-08-15

### Outros

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Implement quota indicator functionality in the application, including a new QuotaIndicator component and associated tests. Enhance the SettingsShell to manage quota preferences, allowing users to toggle the indicator and select the tracking window. Update Cargo.toml to include necessary dependencies for HTTP requests and date handling. Ensure all components are integrated and tested for a seamless user experience.

## [0.1.5] - 2026-08-15

### Outros

- Delete graphify-out directory

- Delete screenshots directory

- Merge branch 'master' of github.com:rafaelsene01/swarmdeck

- Enhance CLAUDE.MD with new Knowledge Graph section detailing usage scenarios and best practices. Update settings.json to introduce PreToolUse hooks for smart grep functionality and improve command execution for code review graph tools, ensuring better integration and user experience.

- Add .gitignore and project.yml for Serena configuration; enhance update handling in Tauri

- Implement release-distribution update handling in App component; add tests for update badge visibility in Header. Enhance App and Header components to manage and display update availability status, ensuring a seamless user experience during updates.

- Refactor async function signature and improve logging format in update handling. Ensure consistent code style in apply.rs and re-order module imports in mod.rs for better organization.

- Add tests for SettingsShell component to validate window close functionality, sidebar navigation, and auto-check toggle persistence. Enhance SettingsShell with icons for sidebar sections and implement real persistence for auto-check settings.

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


