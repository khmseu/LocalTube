import Database from "better-sqlite3";

export type VideoRow = {
  id: string;
  relative_path: string;
  title: string;
  mtime_ms: number;
  size_bytes: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  codec_name: string | null;
  format_name: string | null;
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
  duration_seconds REAL,
  width INTEGER,
  height INTEGER,
  codec_name TEXT,
  format_name TEXT,
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

const ensureVideoMetadataColumns = (db: Database.Database) => {
  const columns = db.prepare("PRAGMA table_info(videos)").all() as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("duration_seconds")) {
    db.exec("ALTER TABLE videos ADD COLUMN duration_seconds REAL");
  }
  if (!names.has("width")) {
    db.exec("ALTER TABLE videos ADD COLUMN width INTEGER");
  }
  if (!names.has("height")) {
    db.exec("ALTER TABLE videos ADD COLUMN height INTEGER");
  }
  if (!names.has("codec_name")) {
    db.exec("ALTER TABLE videos ADD COLUMN codec_name TEXT");
  }
  if (!names.has("format_name")) {
    db.exec("ALTER TABLE videos ADD COLUMN format_name TEXT");
  }
};

export const openDatabase = (sqlitePath: string) => {
  const db = new Database(sqlitePath);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  ensureVideoMetadataColumns(db);
  return db;
};
