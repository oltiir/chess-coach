CREATE TABLE IF NOT EXISTS crews (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY, crew_id TEXT NOT NULL, name TEXT NOT NULL, name_key TEXT NOT NULL, chesscom TEXT NOT NULL,
  pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, recovery_hash TEXT NOT NULL, level INTEGER, rival_id TEXT,
  created_at INTEGER NOT NULL, UNIQUE (crew_id, name_key)
);
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, member_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS games (
  member_id TEXT NOT NULL, crew_id TEXT NOT NULL, url TEXT NOT NULL, end_time INTEGER NOT NULL, result TEXT NOT NULL,
  my_color TEXT NOT NULL, my_rating INTEGER NOT NULL, opp_rating INTEGER NOT NULL, opp_name TEXT NOT NULL, moves TEXT NOT NULL,
  hangs INTEGER NOT NULL, own_moves INTEGER NOT NULL, free_missed INTEGER NOT NULL, clock_used REAL, plies TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (member_id, url)
);
CREATE INDEX IF NOT EXISTS games_crew_time ON games (crew_id, end_time DESC);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, crew_id TEXT NOT NULL, owner_id TEXT NOT NULL, url TEXT NOT NULL, ply INTEGER NOT NULL,
  author_id TEXT NOT NULL, text TEXT NOT NULL, arrow TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_game ON notes (owner_id, url);
CREATE TABLE IF NOT EXISTS login_failures (key TEXT NOT NULL, ts INTEGER NOT NULL);
