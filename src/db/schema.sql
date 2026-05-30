CREATE TABLE IF NOT EXISTS agents (
  id        TEXT PRIMARY KEY,
  tool      TEXT NOT NULL DEFAULT 'unknown',
  last_seen TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent TEXT NOT NULL,
  recipient  TEXT NOT NULL,          -- '#channel' or '@agent-id'
  body       TEXT NOT NULL,
  reply_to   INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_reads (
  agent_id     TEXT PRIMARY KEY,
  last_read_id INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo',  -- todo | doing | review | done
  assignee    TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL,
  agent_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,          -- created | claimed | status | note
  detail     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presence (
  agent_id   TEXT PRIMARY KEY,
  status     TEXT,
  working_on TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snippets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent TEXT NOT NULL,
  title      TEXT NOT NULL,
  language   TEXT,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
