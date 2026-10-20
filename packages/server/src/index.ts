import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './env';
import { prisma } from './lib/prisma';
import { createSocketServer } from './socket';

const app = createApp();
const server = createServer(app);
const io = createSocketServer(server);

server.listen(env.PORT, () => {
  console.log(`BigBeanBag API listening on ${env.SERVER_URL}`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down`);
  io.close();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
