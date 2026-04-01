import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi, beforeAll } from 'vitest';
import { openDatabase } from '../src/db.js';
import { buildServer, startServer } from '../src/server.js';

beforeAll(() => {
  // Increase timeout for Phase 3 tests with media command execution
  vi.setConfig({ testTimeout: 20000 });
});

const startedServers: Array<{ close: () => Promise<void> }> = [];
const tempDirs: string[] = [];
const mediaCommandCalls: string[] = [];

const createVideoRoot = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'localtube-videos-'));
  tempDirs.push(dir);
  return dir;
};

const writeVideo = async (rootDir: string, relativePath: string, content = 'video') => {
  const fullPath = join(rootDir, relativePath);
  const parentDir = dirname(fullPath);
  await mkdir(parentDir, { recursive: true });
  await writeFile(fullPath, content, 'utf8');
};

afterEach(async () => {
  mediaCommandCalls.length = 0;

  while (startedServers.length > 0) {
    const server = startedServers.pop();
    if (server) {
      await server.close();
    }
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('backend localhost-only behavior', () => {
  it('server starts on loopback only', async () => {
    const rootDir = await createVideoRoot();
    const app = buildServer({ sqlitePath: join(rootDir, 'catalog.db') });
    await startServer(app, 0);
    startedServers.push(app);

    const address = app.server.address();
    expect(address).toBeTypeOf('object');

    if (address && typeof address === 'object') {
      expect(address.address).toBe('127.0.0.1');
    }
  });

  it('non-loopback request blocked', async () => {
    const rootDir = await createVideoRoot();
    const app = buildServer({ sqlitePath: join(rootDir, 'catalog.db') });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '10.0.0.12'
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('phase 2 indexing and catalog APIs', () => {
  it('scan inserts videos', async () => {
    const rootDir = await createVideoRoot();
    await writeVideo(rootDir, 'movie-one.mp4', 'video-1');
    await writeVideo(rootDir, 'nested/movie-two.mkv', 'video-2');
    await writeVideo(rootDir, 'notes.txt', 'not-a-video');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath: join(rootDir, 'catalog.db')
    });

    const indexResponse = await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });
    expect(indexResponse.statusCode).toBe(200);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=10',
      remoteAddress: '127.0.0.1'
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 10
    });
    expect(listResponse.json().items).toHaveLength(2);
  });

  it('rescan updates and deletes stale entries', async () => {
    const rootDir = await createVideoRoot();
    await writeVideo(rootDir, 'keep.mp4', 'initial');
    await writeVideo(rootDir, 'remove.mp4', 'stale');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath: join(rootDir, 'catalog.db')
    });

    await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    await rm(join(rootDir, 'remove.mp4'));
    await writeVideo(rootDir, 'keep.mp4', 'updated-content-and-size');

    const secondScan = await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    expect(secondScan.statusCode).toBe(200);
    expect(secondScan.json().deleted).toBe(1);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=10',
      remoteAddress: '127.0.0.1'
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().total).toBe(1);
    expect(listResponse.json().items[0].title).toBe('keep');
    expect(listResponse.json().items[0].sizeBytes).toBeGreaterThan('initial'.length);
  });

  it('resume position upsert', async () => {
    const rootDir = await createVideoRoot();
    await writeVideo(rootDir, 'watch.mp4', 'watch-me');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath: join(rootDir, 'catalog.db')
    });

    await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=1',
      remoteAddress: '127.0.0.1'
    });
    const videoId = listResponse.json().items[0].id as string;

    const putFirst = await app.inject({
      method: 'PUT',
      url: `/api/videos/${videoId}/resume`,
      payload: { positionSeconds: 42 },
      remoteAddress: '127.0.0.1'
    });
    expect(putFirst.statusCode).toBe(200);

    const putSecond = await app.inject({
      method: 'PUT',
      url: `/api/videos/${videoId}/resume`,
      payload: { positionSeconds: 84 },
      remoteAddress: '127.0.0.1'
    });
    expect(putSecond.statusCode).toBe(200);

    const resumeResponse = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/resume`,
      remoteAddress: '127.0.0.1'
    });

    expect(resumeResponse.statusCode).toBe(200);
    expect(resumeResponse.json().positionSeconds).toBe(84);
  });

  it('resume rejects NaN and Infinity', async () => {
    const rootDir = await createVideoRoot();
    await writeVideo(rootDir, 'watch.mp4', 'watch-me');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath: join(rootDir, 'catalog.db')
    });

    await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=1',
      remoteAddress: '127.0.0.1'
    });
    const videoId = listResponse.json().items[0].id as string;

    const nanResponse = await app.inject({
      method: 'PUT',
      url: `/api/videos/${videoId}/resume`,
      payload: { positionSeconds: Number.NaN },
      remoteAddress: '127.0.0.1'
    });
    expect(nanResponse.statusCode).toBe(400);
    expect(nanResponse.json()).toEqual({
      error: 'positionSeconds must be a finite non-negative number'
    });

    const infinityResponse = await app.inject({
      method: 'PUT',
      url: `/api/videos/${videoId}/resume`,
      payload: '{"positionSeconds":1e9999}',
      headers: {
        'content-type': 'application/json'
      },
      remoteAddress: '127.0.0.1'
    });
    expect(infinityResponse.statusCode).toBe(400);
    expect(infinityResponse.json()).toEqual({
      error: 'positionSeconds must be a finite non-negative number'
    });
  });

  it('rescan returns controlled error for invalid video root', async () => {
    const rootDir = await createVideoRoot();
    const invalidRoot = join(rootDir, 'missing-directory');
    const app = buildServer({
      videoRootDir: invalidRoot,
      sqlitePath: join(rootDir, 'catalog.db')
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'Failed to scan video directory',
      code: 'VIDEO_SCAN_FAILED'
    });
  });

  it('catalog pagination', async () => {
    const rootDir = await createVideoRoot();
    const files = ['alpha.mp4', 'beta.mp4', 'delta.mp4', 'echo.mp4', 'gamma.mp4'];
    for (const file of files) {
      await writeVideo(rootDir, file, file);
    }

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath: join(rootDir, 'catalog.db')
    });

    await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    const pageTwo = await app.inject({
      method: 'GET',
      url: '/api/videos?page=2&pageSize=2',
      remoteAddress: '127.0.0.1'
    });

    expect(pageTwo.statusCode).toBe(200);
    expect(pageTwo.json()).toMatchObject({
      total: 5,
      page: 2,
      pageSize: 2
    });
    expect(pageTwo.json().items).toHaveLength(2);

    const filtered = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=5&q=alp',
      remoteAddress: '127.0.0.1'
    });

    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().total).toBe(1);
    expect(filtered.json().items[0].title).toBe('alpha');
  });
});

describe('phase 3 media APIs', () => {
  it('range request returns 206', async () => {
    const rootDir = await createVideoRoot();
    const sqlitePath = join(rootDir, 'catalog.db');
    await writeVideo(rootDir, 'clip.mp4', '0123456789');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath
    });

    await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=1',
      remoteAddress: '127.0.0.1'
    });
    const videoId = listResponse.json().items[0].id as string;

    const streamResponse = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/stream`,
      headers: {
        range: 'bytes=0-3'
      },
      remoteAddress: '127.0.0.1'
    });

    expect(streamResponse.statusCode).toBe(206);
    expect(streamResponse.headers['content-range']).toBe('bytes 0-3/10');
    expect(streamResponse.body).toBe('0123');
  });

  it('invalid range returns 416', async () => {
    const rootDir = await createVideoRoot();
    const sqlitePath = join(rootDir, 'catalog.db');
    await writeVideo(rootDir, 'clip.mp4', '0123456789');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath
    });

    await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=1',
      remoteAddress: '127.0.0.1'
    });
    const videoId = listResponse.json().items[0].id as string;

    const streamResponse = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/stream`,
      headers: {
        range: 'bytes=100-200'
      },
      remoteAddress: '127.0.0.1'
    });

    expect(streamResponse.statusCode).toBe(416);
    expect(streamResponse.headers['content-range']).toBe('bytes */10');
  });

  it('ffprobe metadata persisted', async () => {
    const rootDir = await createVideoRoot();
    const sqlitePath = join(rootDir, 'catalog.db');
    await writeVideo(rootDir, 'meta.mp4', 'metadata-video');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath,
      runMediaCommand: async (command) => {
        mediaCommandCalls.push(command);
        if (command === 'ffprobe') {
          return {
            code: 0,
            stdout: JSON.stringify({
              format: {
                duration: '120.5',
                format_name: 'mov,mp4,m4a,3gp,3g2,mj2'
              },
              streams: [
                {
                  codec_type: 'video',
                  codec_name: 'h264',
                  width: 1920,
                  height: 1080
                }
              ]
            }),
            stderr: ''
          };
        }

        return {
          code: 0,
          stdout: '',
          stderr: ''
        };
      }
    });

    const rescanResponse = await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });
    expect(rescanResponse.statusCode).toBe(200);

    const db = openDatabase(sqlitePath);
    const row = db
      .prepare(
        `
          SELECT duration_seconds, width, height, codec_name, format_name
          FROM videos
          WHERE relative_path = 'meta.mp4'
        `
      )
      .get() as
      | {
          duration_seconds: number;
          width: number;
          height: number;
          codec_name: string;
          format_name: string;
        }
      | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.duration_seconds).toBe(120.5);
    expect(row?.width).toBe(1920);
    expect(row?.height).toBe(1080);
    expect(row?.codec_name).toBe('h264');
    expect(row?.format_name).toContain('mp4');
  });

  it('thumbnail generation cached', async () => {
    const rootDir = await createVideoRoot();
    const cacheDir = await mkdtemp(join(tmpdir(), 'localtube-thumbs-'));
    tempDirs.push(cacheDir);
    const sqlitePath = join(rootDir, 'catalog.db');
    await writeVideo(rootDir, 'thumb.mp4', 'thumbnail-video');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath,
      thumbnailCacheDir: cacheDir,
      runMediaCommand: async (command, args) => {
        mediaCommandCalls.push(command);

        if (command === 'ffmpeg') {
          const outputPath = args[args.length - 1];
          if (outputPath) {
            await writeFile(outputPath, 'jpeg-bytes', 'utf8');
          }
        }

        if (command === 'ffprobe') {
          return {
            code: 0,
            stdout: JSON.stringify({ format: {}, streams: [] }),
            stderr: ''
          };
        }

        return {
          code: 0,
          stdout: '',
          stderr: ''
        };
      }
    });

    await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=1',
      remoteAddress: '127.0.0.1'
    });
    const videoId = listResponse.json().items[0].id as string;

    const firstThumbnail = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/thumbnail`,
      remoteAddress: '127.0.0.1'
    });

    const secondThumbnail = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/thumbnail`,
      remoteAddress: '127.0.0.1'
    });

    expect(firstThumbnail.statusCode).toBe(200);
    expect(secondThumbnail.statusCode).toBe(200);

    const ffmpegCalls = mediaCommandCalls.filter((command) => command === 'ffmpeg');
    expect(ffmpegCalls).toHaveLength(1);
  });

  it('thumbnail endpoint returns 503 when ffmpeg unavailable', async () => {
    const rootDir = await createVideoRoot();
    const cacheDir = await mkdtemp(join(tmpdir(), 'localtube-thumbs-'));
    tempDirs.push(cacheDir);
    const sqlitePath = join(rootDir, 'catalog.db');
    await writeVideo(rootDir, 'clip.mp4', 'video-bytes');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath,
      thumbnailCacheDir: cacheDir,
      runMediaCommand: async (command) => {
        mediaCommandCalls.push(command);

        if (command === 'ffmpeg') {
          return {
            code: 127,
            stdout: '',
            stderr: 'ffmpeg: not found'
          };
        }

        if (command === 'ffprobe') {
          return {
            code: 0,
            stdout: JSON.stringify({ format: {}, streams: [] }),
            stderr: ''
          };
        }

        return {
          code: 0,
          stdout: '',
          stderr: ''
        };
      }
    });

    await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=1',
      remoteAddress: '127.0.0.1'
    });
    const videoId = listResponse.json().items[0].id as string;

    const thumbnailResponse = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/thumbnail`,
      remoteAddress: '127.0.0.1'
    });

    expect(thumbnailResponse.statusCode).toBe(503);
    expect(thumbnailResponse.json()).toEqual({
      error: 'ffmpeg is not available',
      code: 'MEDIA_TOOL_UNAVAILABLE'
    });
  });

  it('rescan succeeds and metadata remains null when ffprobe unavailable', async () => {
    const rootDir = await createVideoRoot();
    const sqlitePath = join(rootDir, 'catalog.db');
    await writeVideo(rootDir, 'noprobe.mp4', 'video-without-metadata');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath,
      runMediaCommand: async (command) => {
        mediaCommandCalls.push(command);

        if (command === 'ffprobe') {
          return {
            code: 127,
            stdout: '',
            stderr: 'ffprobe: not found'
          };
        }

        return {
          code: 0,
          stdout: '',
          stderr: ''
        };
      }
    });

    const rescanResponse = await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    expect(rescanResponse.statusCode).toBe(200);
    expect(rescanResponse.json()).toMatchObject({
      scanned: 1,
      inserted: 1
    });

    const db = openDatabase(sqlitePath);
    const row = db
      .prepare(
        `
          SELECT duration_seconds, width, height, codec_name, format_name
          FROM videos
          WHERE relative_path = 'noprobe.mp4'
        `
      )
      .get() as
      | {
          duration_seconds: number | null;
          width: number | null;
          height: number | null;
          codec_name: string | null;
          format_name: string | null;
        }
      | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row?.duration_seconds).toBeNull();
    expect(row?.width).toBeNull();
    expect(row?.height).toBeNull();
    expect(row?.codec_name).toBeNull();
    expect(row?.format_name).toBeNull();
  });

  it('malformed numeric ranges rejected (parseInt partial match)', async () => {
    const rootDir = await createVideoRoot();
    const sqlitePath = join(rootDir, 'catalog.db');
    await writeVideo(rootDir, 'clip.mp4', '0123456789');

    const app = buildServer({
      videoRootDir: rootDir,
      sqlitePath
    });
    startedServers.push(app);

    await app.inject({
      method: 'POST',
      url: '/api/index/rescan',
      remoteAddress: '127.0.0.1'
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/videos?page=1&pageSize=1',
      remoteAddress: '127.0.0.1'
    });
    const videoId = listResponse.json().items[0].id as string;

    const malformedResponses = [
      { range: 'bytes=0abc-3' },
      { range: 'bytes=0-3xyz' },
      { range: 'bytes=00-03' }
    ];

    for (const { range } of malformedResponses) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/videos/${videoId}/stream`,
        headers: { range },
        remoteAddress: '127.0.0.1'
      });
      expect(response.statusCode).toBe(416, `Expected range '${range}' to be rejected with 416`);
    }
  });
});
