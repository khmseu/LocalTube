import Database from 'better-sqlite3';

export type VideoRow = {
  id: string;
  relative_path: string;
  title: string;
  mtime_ms: number;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  last_indexed_at: string;
};

export type ResumeRow = {
  video_id: string;
  position_seconds: number;
  updated_at: string;
};

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  relative_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_indexed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);
CREATE INDEX IF NOT EXISTS idx_videos_updated_at ON videos(updated_at);

CREATE TABLE IF NOT EXISTS resume_progress (
  video_id TEXT PRIMARY KEY,
  position_seconds REAL NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);
`;

export const openDatabase = (sqlitePath: string) => {
  const db = new Database(sqlitePath);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
};
