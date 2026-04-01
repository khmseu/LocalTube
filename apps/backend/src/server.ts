import Fastify from 'fastify';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';
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

const isAllowedHostname = (hostname: string) => {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
};

const parseHostHeaderHostname = (hostHeader: string) => {
  const host = hostHeader.split(',', 1)[0]?.trim().toLowerCase() ?? '';
  if (host.length === 0) {
    return '';
  }

  if (host.startsWith('[')) {
    const endBracketIndex = host.indexOf(']');
    if (endBracketIndex === -1) {
      return '';
    }

    return host.slice(1, endBracketIndex);
  }

  return host.split(':', 1)[0] ?? '';
};

const isAllowedHostHeader = (hostHeader: string) => {
  const hostname = parseHostHeaderHostname(hostHeader);
  return isAllowedHostname(hostname);
};

const isAllowedOrigin = (originHeader: string) => {
  try {
    const origin = new URL(originHeader);
    return isAllowedHostname(origin.hostname.toLowerCase());
  } catch {
    return false;
  }
};

type BuildServerOptions = {
  videoRootDir?: string;
  sqlitePath?: string;
  thumbnailCacheDir?: string;
  runMediaCommand?: MediaCommandRunner;
};

type ConfigValidationOptions = {
  videoRootDir?: string;
};

type MediaCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type MediaCommandRunner = (command: string, args: string[]) => Promise<MediaCommandResult>;

type VideoMetadata = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  codecName: string | null;
  formatName: string | null;
};

type VideoListItem = {
  id: string;
  path: string;
  title: string;
  mtimeMs: number;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  codecName: string | null;
  formatName: string | null;
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
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    codecName: row.codec_name,
    formatName: row.format_name,
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

export const validateServerConfig = (options: ConfigValidationOptions = {}) => {
  const videoRootDir = getVideoRootDir(options.videoRootDir);
  if (!videoRootDir || videoRootDir.trim().length === 0) {
    throw new Error('LOCALTUBE_VIDEO_ROOT must be configured before startup');
  }

  return {
    videoRootDir
  };
};

const getThumbnailCacheDir = (thumbnailCacheDir?: string) => {
  if (thumbnailCacheDir) {
    return thumbnailCacheDir;
  }

  if (process.env.LOCALTUBE_THUMBNAIL_CACHE_DIR) {
    return process.env.LOCALTUBE_THUMBNAIL_CACHE_DIR;
  }

  return join(process.cwd(), '.localtube-thumbnails');
};

const defaultMediaCommandRunner: MediaCommandRunner = async (command, args) => {
  return await new Promise<MediaCommandResult>((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      resolve({
        code: 127,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });

    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
};

const isToolUnavailable = (result: MediaCommandResult) => {
  return result.code === 127 || /not found|enoent/i.test(result.stderr);
};

const strictParseInt = (str: string): number | null => {
  if (!str || !/^\d+$/.test(str)) {
    return null;
  }
  const num = Number.parseInt(str, 10);
  if (!Number.isFinite(num)) {
    return null;
  }
  // Reject leading zeros: '00' should not parse as valid
  if (String(num) !== str) {
    return null;
  }
  return num;
};

const parseRange = (headerValue: string, fileSize: number) => {
  if (!headerValue.startsWith('bytes=')) {
    return null;
  }

  const rangeValue = headerValue.slice('bytes='.length).trim();
  if (rangeValue.length === 0 || rangeValue.includes(',')) {
    return null;
  }

  const [rawStart, rawEnd] = rangeValue.split('-', 2);
  if (rawStart === undefined || rawEnd === undefined) {
    return null;
  }

  if (rawStart === '' && rawEnd === '') {
    return null;
  }

  if (rawStart === '') {
    const suffixLength = strictParseInt(rawEnd);
    if (suffixLength === null || suffixLength <= 0) {
      return null;
    }

    const start = Math.max(fileSize - suffixLength, 0);
    return { start, end: fileSize - 1 };
  }

  const start = strictParseInt(rawStart);
  if (start === null || start < 0 || start >= fileSize) {
    return null;
  }

  if (rawEnd === '') {
    return { start, end: fileSize - 1 };
  }

  const parsedEnd = strictParseInt(rawEnd);
  if (parsedEnd === null || parsedEnd < start) {
    return null;
  }

  return { start, end: Math.min(parsedEnd, fileSize - 1) };
};

const probeVideoMetadata = async (
  runMediaCommand: MediaCommandRunner,
  absolutePath: string
): Promise<VideoMetadata | null> => {
  const result = await runMediaCommand('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    absolutePath
  ]);

  if (result.code !== 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout) as {
      format?: { duration?: string; format_name?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
      }>;
    };

    const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video');
    const duration = parsed.format?.duration ? Number.parseFloat(parsed.format.duration) : null;

    return {
      durationSeconds: typeof duration === 'number' && Number.isFinite(duration) ? duration : null,
      width: typeof videoStream?.width === 'number' ? videoStream.width : null,
      height: typeof videoStream?.height === 'number' ? videoStream.height : null,
      codecName: videoStream?.codec_name ?? null,
      formatName: parsed.format?.format_name ?? null
    };
  } catch {
    return null;
  }
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

const rescanIntoDatabase = async (
  db: Database.Database,
  videoRootDir: string,
  runMediaCommand: MediaCommandRunner
) => {
  const discovered = await scanVideoDirectory(videoRootDir);
  const indexedAt = new Date().toISOString();
  const existingRows = db.prepare('SELECT relative_path FROM videos').all() as Array<{
    relative_path: string;
  }>;
  const existingPaths = new Set(existingRows.map((row) => row.relative_path));

  // Probe metadata for all discovered videos first, before transaction
  const metadataByPath = new Map<string, VideoMetadata | null>();
  for (const item of discovered) {
    const metadata = await probeVideoMetadata(runMediaCommand, join(videoRootDir, item.relativePath));
    metadataByPath.set(item.relativePath, metadata);
  }

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
        duration_seconds,
        width,
        height,
        codec_name,
        format_name,
        created_at,
        updated_at,
        last_indexed_at
      ) VALUES (
        @id,
        @relative_path,
        @title,
        @mtime_ms,
        @size_bytes,
        @duration_seconds,
        @width,
        @height,
        @codec_name,
        @format_name,
        @created_at,
        @updated_at,
        @last_indexed_at
      )
      ON CONFLICT(relative_path) DO UPDATE SET
        title = excluded.title,
        mtime_ms = excluded.mtime_ms,
        size_bytes = excluded.size_bytes,
        duration_seconds = excluded.duration_seconds,
        width = excluded.width,
        height = excluded.height,
        codec_name = excluded.codec_name,
        format_name = excluded.format_name,
        updated_at = excluded.updated_at,
        last_indexed_at = excluded.last_indexed_at
    `
  );

  const transaction = db.transaction(() => {
    for (const item of discovered) {
      const isExisting = existingPaths.has(item.relativePath);
      const metadata = metadataByPath.get(item.relativePath) ?? null;
      const payload = {
        id: item.id,
        relative_path: item.relativePath,
        title: item.title,
        mtime_ms: item.mtimeMs,
        size_bytes: item.sizeBytes,
        duration_seconds: metadata?.durationSeconds ?? null,
        width: metadata?.width ?? null,
        height: metadata?.height ?? null,
        codec_name: metadata?.codecName ?? null,
        format_name: metadata?.formatName ?? null,
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
}

export const buildServer = (options: BuildServerOptions = {}) => {
  const app = Fastify({ logger: false });
  const db = openDatabase(getDatabasePath(options.sqlitePath));
  const videoRootDir = getVideoRootDir(options.videoRootDir);
  const thumbnailCacheDir = getThumbnailCacheDir(options.thumbnailCacheDir);
  const runMediaCommand = options.runMediaCommand ?? defaultMediaCommandRunner;
  const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  app.addHook('onRequest', async (request, reply) => {
    if (!isLoopbackAddress(request.ip)) {
      await reply.code(403).send({ error: 'Loopback access only' });
      return;
    }

    const hostHeader = request.headers.host;
    if (typeof hostHeader !== 'string' || !isAllowedHostHeader(hostHeader)) {
      await reply.code(403).send({ error: 'Invalid host header' });
      return;
    }

    const method = request.method.toUpperCase();
    if (mutatingMethods.has(method)) {
      const originHeader = request.headers.origin;
      if (typeof originHeader !== 'string' || !isAllowedOrigin(originHeader)) {
        await reply.code(403).send({ error: 'Origin not allowed' });
        return;
      }
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
          SELECT id, relative_path, title, mtime_ms, size_bytes, duration_seconds, width, height, codec_name, format_name, created_at, updated_at, last_indexed_at
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
          SELECT id, relative_path, title, mtime_ms, size_bytes, duration_seconds, width, height, codec_name, format_name, created_at, updated_at, last_indexed_at
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
      const result = await rescanIntoDatabase(db, videoRootDir, runMediaCommand);
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

  app.get('/api/videos/:id/stream', async (request, reply) => {
    if (!videoRootDir) {
      return reply.code(400).send({ error: 'LOCALTUBE_VIDEO_ROOT is not configured' });
    }

    const params = request.params as { id: string };
    const row = db
      .prepare('SELECT relative_path, size_bytes FROM videos WHERE id = ?')
      .get(params.id) as { relative_path: string; size_bytes: number } | undefined;

    if (!row) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    const absolutePath = join(videoRootDir, row.relative_path);
    const rangeHeader = request.headers.range;

    if (!rangeHeader || typeof rangeHeader !== 'string') {
      reply.code(200);
      reply.header('content-type', 'video/mp4');
      reply.header('accept-ranges', 'bytes');
      reply.header('content-length', String(row.size_bytes));
      return reply.send(createReadStream(absolutePath));
    }

    const parsedRange = parseRange(rangeHeader, row.size_bytes);
    if (!parsedRange) {
      return reply.code(416).header('content-range', `bytes */${row.size_bytes}`).send();
    }

    const contentLength = parsedRange.end - parsedRange.start + 1;
    reply.code(206);
    reply.header('content-type', 'video/mp4');
    reply.header('accept-ranges', 'bytes');
    reply.header('content-range', `bytes ${parsedRange.start}-${parsedRange.end}/${row.size_bytes}`);
    reply.header('content-length', String(contentLength));
    return reply.send(createReadStream(absolutePath, { start: parsedRange.start, end: parsedRange.end }));
  });

  app.get('/api/videos/:id/thumbnail', async (request, reply) => {
    if (!videoRootDir) {
      return reply.code(400).send({ error: 'LOCALTUBE_VIDEO_ROOT is not configured' });
    }

    const params = request.params as { id: string };
    const row = db
      .prepare('SELECT id, relative_path, mtime_ms FROM videos WHERE id = ?')
      .get(params.id) as { id: string; relative_path: string; mtime_ms: number } | undefined;

    if (!row) {
      return reply.code(404).send({ error: 'Video not found' });
    }

    await mkdir(thumbnailCacheDir, { recursive: true });
    const thumbnailPath = join(thumbnailCacheDir, `${row.id}-${row.mtime_ms}.jpg`);

    try {
      await access(thumbnailPath);
      reply.code(200);
      reply.header('content-type', 'image/jpeg');
      return reply.send(createReadStream(thumbnailPath));
    } catch {
      const sourcePath = join(videoRootDir, row.relative_path);
      const ffmpegResult = await runMediaCommand('ffmpeg', [
        '-y',
        '-i',
        sourcePath,
        '-ss',
        '00:00:01',
        '-vframes',
        '1',
        thumbnailPath
      ]);

      if (ffmpegResult.code !== 0) {
        if (isToolUnavailable(ffmpegResult)) {
          return reply.code(503).send({ error: 'ffmpeg is not available', code: 'MEDIA_TOOL_UNAVAILABLE' });
        }
        return reply.code(500).send({ error: 'Failed to generate thumbnail' });
      }

      reply.code(200);
      reply.header('content-type', 'image/jpeg');
      return reply.send(createReadStream(thumbnailPath));
    }
  });

  return app;
};

export const startServer = async (app = buildServer(), port = 3000) => {
  await app.listen({ port, host: '127.0.0.1' });
  return app;
};
