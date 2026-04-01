import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, parse, relative } from 'node:path';

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.m4v',
  '.wmv',
  '.flv',
  '.mpg',
  '.mpeg'
]);

export type DiscoveredVideo = {
  id: string;
  relativePath: string;
  title: string;
  mtimeMs: number;
  sizeBytes: number;
};

const toPosixPath = (value: string) => value.split('\\').join('/');

const stableVideoId = (relativePath: string) => {
  return createHash('sha256').update(relativePath).digest('hex');
};

const walk = async (rootDir: string, currentDir: string, acc: DiscoveredVideo[]) => {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walk(rootDir, fullPath, acc);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = extname(entry.name).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(extension)) {
      continue;
    }

    const fileStats = await stat(fullPath);
    const relativePath = toPosixPath(relative(rootDir, fullPath));

    acc.push({
      id: stableVideoId(relativePath),
      relativePath,
      title: parse(entry.name).name,
      mtimeMs: Math.trunc(fileStats.mtimeMs),
      sizeBytes: fileStats.size
    });
  }
};

export const scanVideoDirectory = async (rootDir: string) => {
  const discovered: DiscoveredVideo[] = [];
  await walk(rootDir, rootDir, discovered);
  discovered.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return discovered;
};
