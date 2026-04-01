import Fastify from 'fastify';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDatabase, type ResumeRow, type VideoRow } from './db.js';
import { scanVideoDirectory } from './video-indexer.js';

const isLoopbackAddress = (address: string) => {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  );
};

type BuildServerOptions = {
  videoRootDir?: string;
  sqlitePath?: string;
};

type VideoListItem = {
  id: string;
  path: string;
  title: string;
  mtimeMs: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

const rowToVideo = (row: VideoRow): VideoListItem => {
  return {
    id: row.id,
    path: row.relative_path,
    title: row.title,
    mtimeMs: row.mtime_ms,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const isFiniteNonNegativeNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
};

const getDatabasePath = (sqlitePath?: string) => {
  if (sqlitePath) {
    return sqlitePath;
  }

  if (process.env.LOCALTUBE_SQLITE_PATH) {
    return process.env.LOCALTUBE_SQLITE_PATH;
  }

  return join(process.cwd(), 'localtube.db');
};

const getVideoRootDir = (videoRootDir?: string) => {
  return videoRootDir ?? process.env.LOCALTUBE_VIDEO_ROOT;
};

const upsertResume = (db: Database.Database, videoId: string, positionSeconds: number) => {
  const now = new Date().toISOString();
  db.prepare(
    `
      INSERT INTO resume_progress (video_id, position_seconds, updated_at)
      VALUES (@video_id, @position_seconds, @updated_at)
      ON CONFLICT(video_id) DO UPDATE SET
        position_seconds = excluded.position_seconds,
        updated_at = excluded.updated_at
    `
  ).run({ video_id: videoId, position_seconds: positionSeconds, updated_at: now });
};

const rescanIntoDatabase = async (db: Database.Database, videoRootDir: string) => {
  const discovered = await scanVideoDirectory(videoRootDir);
  const indexedAt = new Date().toISOString();
  const existingRows = db.prepare('SELECT relative_path FROM videos').all() as Array<{
    relative_path: string;
  }>;
  const existingPaths = new Set(existingRows.map((row) => row.relative_path));

  let inserted = 0;
  let updated = 0;

  const upsertStatement = db.prepare(
    `
      INSERT INTO videos (
        id,
        relative_path,
        title,
        mtime_ms,
        size_bytes,
        created_at,
        updated_at,
        last_indexed_at
      ) VALUES (
        @id,
        @relative_path,
        @title,
        @mtime_ms,
        @size_bytes,
        @created_at,
        @updated_at,
        @last_indexed_at
      )
      ON CONFLICT(relative_path) DO UPDATE SET
        title = excluded.title,
        mtime_ms = excluded.mtime_ms,
        size_bytes = excluded.size_bytes,
        updated_at = excluded.updated_at,
        last_indexed_at = excluded.last_indexed_at
    `
  );

  const transaction = db.transaction(() => {
    for (const item of discovered) {
      const isExisting = existingPaths.has(item.relativePath);
      const payload = {
        id: item.id,
        relative_path: item.relativePath,
        title: item.title,
        mtime_ms: item.mtimeMs,
        size_bytes: item.sizeBytes,
        created_at: indexedAt,
        updated_at: indexedAt,
        last_indexed_at: indexedAt
      };

      upsertStatement.run(payload);

      if (isExisting) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }

    const deleteResult = db
      .prepare('DELETE FROM videos WHERE last_indexed_at != ?')
      .run(indexedAt);

    return Number(deleteResult.changes);
  });

  const deleted = transaction();

  return {
    scanned: discovered.length,
    inserted,
    updated,
    deleted
  };
};

export const buildServer = (options: BuildServerOptions = {}) => {
  const app = Fastify({ logger: false });
  const db = openDatabase(getDatabasePath(options.sqlitePath));
  const videoRootDir = getVideoRootDir(options.videoRootDir);

  app.addHook('onRequest', async (request, reply) => {
    if (!isLoopbackAddress(request.ip)) {
      await reply.code(403).send({ error: 'Loopback access only' });
    }
  });

  app.addHook('onClose', async () => {
    db.close();
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/api/videos', async (request) => {
    const query = request.query as { page?: string; pageSize?: string; q?: string };
    const page = parsePositiveInt(query.page, 1);
    const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);
    const offset = (page - 1) * pageSize;
    const searchTerm = query.q?.trim() ?? '';

    const whereClause = searchTerm.length > 0 ? 'WHERE title LIKE @q' : '';
    const bindings = searchTerm.length > 0 ? { q: `%${searchTerm}%` } : {};

    const totalRow = db
      .prepare(`SELECT COUNT(*) as total FROM videos ${whereClause}`)
      .get(bindings) as { total: number };
    const rows = db
      .prepare(
        `
          SELECT id, relative_path, title, mtime_ms, size_bytes, created_at, updated_at, last_indexed_at
          FROM videos
          ${whereClause}
          ORDER BY title ASC, relative_path ASC
          LIMIT @limit OFFSET @offset
        `
      )
      .all({ ...bindings, limit: pageSize, offset }) as VideoRow[];

    return {
      page,
      pageSize,
      total: totalRow.total,
      items: rows.map(rowToVideo)
    };
  });

  app.get('/api/videos/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const row = db
      .prepare(
        `
          SELECT id, relative_path, title, mtime_ms, size_bytes, created_at, updated_at, last_indexed_at
          FROM videos
          WHERE id = ?
        `
      )
      .get(params.id) as VideoRow | undefined;

    if (!row) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    return rowToVideo(row);
  });

  app.post('/api/index/rescan', async (_request, reply) => {
    if (!videoRootDir) {
      return reply.code(400).send({ error: 'LOCALTUBE_VIDEO_ROOT is not configured' });
    }

    try {
      const result = await rescanIntoDatabase(db, videoRootDir);
      return reply.code(200).send(result);
    } catch {
      return reply.code(500).send({
        error: 'Failed to scan video directory',
        code: 'VIDEO_SCAN_FAILED'
      });
    }
  });

  app.get('/api/videos/:id/resume', async (request, reply) => {
    const params = request.params as { id: string };
    const videoExists = db.prepare('SELECT id FROM videos WHERE id = ?').get(params.id) as
      | { id: string }
      | undefined;

    if (!videoExists) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    const row = db
      .prepare(
        'SELECT video_id, position_seconds, updated_at FROM resume_progress WHERE video_id = ?'
      )
      .get(params.id) as ResumeRow | undefined;

    if (!row) {
      return reply.code(200).send({ videoId: params.id, positionSeconds: 0, updatedAt: null });
    }

    return {
      videoId: row.video_id,
      positionSeconds: row.position_seconds,
      updatedAt: row.updated_at
    };
  });

  app.put('/api/videos/:id/resume', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as { positionSeconds?: unknown };

    if (!isFiniteNonNegativeNumber(body?.positionSeconds)) {
      return reply.code(400).send({ error: 'positionSeconds must be a finite non-negative number' });
    }

    const videoExists = db.prepare('SELECT id FROM videos WHERE id = ?').get(params.id) as
      | { id: string }
      | undefined;

    if (!videoExists) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    upsertResume(db, params.id, body.positionSeconds);
    const row = db
      .prepare(
        'SELECT video_id, position_seconds, updated_at FROM resume_progress WHERE video_id = ?'
      )
      .get(params.id) as ResumeRow;

    return reply.code(200).send({
      videoId: row.video_id,
      positionSeconds: row.position_seconds,
      updatedAt: row.updated_at
    });
  });

  return app;
};

export const startServer = async (app = buildServer(), port = 3000) => {
  await app.listen({ port, host: '127.0.0.1' });
  return app;
};
