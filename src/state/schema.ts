export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  pane_id TEXT,
  tmux_session TEXT,
  tmux_window TEXT,
  tmux_window_index TEXT,
  pid INTEGER NOT NULL,
  cwd TEXT NOT NULL,
  pi_session_file TEXT,
  model TEXT,
  state TEXT NOT NULL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  last_prompt TEXT,
  last_event_at INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL,
  read_until_event_at INTEGER,
  acknowledged_at INTEGER,
  dismissed_until_event_at INTEGER,
  last_notified_event_at INTEGER
);

CREATE TABLE IF NOT EXISTS dashboard_presence (
  instance_id TEXT PRIMARY KEY,
  pid INTEGER NOT NULL,
  tmux_pane_id TEXT,
  started_at INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL
);
`;
