import Fastify from 'fastify';

const isLoopbackAddress = (address: string) => {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  );
};

export const buildServer = () => {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (request, reply) => {
    if (!isLoopbackAddress(request.ip)) {
      await reply.code(403).send({ error: 'Loopback access only' });
    }
  });

  app.get('/health', async () => ({ ok: true }));

  return app;
};

export const startServer = async (app = buildServer(), port = 3000) => {
  await app.listen({ port, host: '127.0.0.1' });
  return app;
};
