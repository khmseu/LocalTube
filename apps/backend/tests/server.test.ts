import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, startServer } from '../src/server.js';

const startedServers: Array<{ close: () => Promise<void> }> = [];
const tempDirs: string[] = [];

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
