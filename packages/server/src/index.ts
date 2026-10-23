import { createServer } from 'node:http';
import type { Express } from 'express';
import { createApp } from './create-app';
import { env } from './env';
import { prisma } from './lib/prisma';
import { createSocketServer } from './socket';

const app: Express = createApp();
const server = createServer(app);
const io = createSocketServer(server);

// Vercel intercepts `server.listen` to hand the server to its function runtime.
// Locally the same call binds the normal HTTP port used by `pnpm dev`.
server.listen(env.PORT, () => {
  console.log(`BigBeanBag API listening on ${env.SERVER_URL}`);
});

if (!process.env.VERCEL) {
  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    io.close();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

export default server;
