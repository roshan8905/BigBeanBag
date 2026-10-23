import { createServer } from 'node:http';
import { createApp } from './create-app';
import { env } from './env';
import { prisma } from './lib/prisma';
import { createSocketServer } from './socket';

const app = createApp();
const server = createServer(app);
const io = createSocketServer(server);
const isVercel = Boolean(process.env.VERCEL);

// Vercel's Node runtime owns the HTTP listener and passes WebSocket upgrades
// through to the exported server. Locally we bind the normal dev port.
if (!isVercel) {
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
}

export default server;
