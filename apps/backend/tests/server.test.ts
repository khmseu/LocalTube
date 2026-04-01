import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, startServer } from '../src/server.js';

const startedServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (startedServers.length > 0) {
    const server = startedServers.pop();
    if (server) {
      await server.close();
    }
  }
});

describe('backend localhost-only behavior', () => {
  it('server starts on loopback only', async () => {
    const app = buildServer();
    await startServer(app, 0);
    startedServers.push(app);

    const address = app.server.address();
    expect(address).toBeTypeOf('object');

    if (address && typeof address === 'object') {
      expect(address.address).toBe('127.0.0.1');
    }
  });

  it('non-loopback request blocked', async () => {
    const app = buildServer();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '10.0.0.12'
    });

    expect(response.statusCode).toBe(403);
  });
});
