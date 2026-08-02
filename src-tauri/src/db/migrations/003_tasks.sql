-- Tasks, projects, terminal statuses and terminal activity log.
-- See .specs/features/mcp-task-server/design.md, section "Modelos de dados".

CREATE TABLE tasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  description    TEXT,
  plan           TEXT,
  implementation TEXT,
  status         TEXT NOT NULL CHECK(status IN
                   ('pending','in_progress','in_testing','completed')),
  project_id     TEXT REFERENCES projects(id) ON DELETE SET NULL,
  terminal_id    TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_tasks_status  ON tasks(status);
CREATE INDEX idx_tasks_project ON tasks(project_id);

CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL,
  last_used  INTEGER
);

CREATE TABLE terminal_statuses (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL,
  instruction TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE terminal_activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  terminal_id TEXT NOT NULL,
  activity    TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_activity_terminal ON terminal_activity(terminal_id, created_at DESC);

-- Seed: the 4 default terminal statuses (terminal-statuses/spec.md, P1
-- "Catalogo editavel de status", criterio 1). Colors and instructions are
-- an initial assumption, editable later by the user per the same spec.
INSERT INTO terminal_statuses (id, label, color, instruction, sort_order, enabled, is_default) VALUES
  ('working',       'Working',       '#22c55e', 'Use when you start working on something.', 0, 1, 0),
  ('needs_input',   'Needs input',   '#eab308', 'Use when you stop to ask the user something.', 1, 1, 0),
  ('needs_testing', 'Needs testing', '#3b82f6', 'Use when you finish implementing and the work is pending the user manual test.', 2, 1, 0),
  ('done',          'Done',          '#6b7280', 'Use when the work is fully finished.', 3, 1, 0);
