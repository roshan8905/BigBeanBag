import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { AppServer } from './ack';
import { socketAuth, type AppSocket } from './auth';
import { registerChatHandlers } from './chat-handlers';
import { registerGameHandlers, startBattleSweeper } from './game-handlers';
import { registerOwnerHandlers } from './owner-handlers';
import { registerPlaybackHandlers } from './playback-handlers';
import { registerRoomHandlers } from './room-handlers';

export type { AppServer };

export const createSocketServer = (httpServer: HttpServer): AppServer => {
  const io: AppServer = new Server(httpServer, {
    serveClient: false,
    pingInterval: 20000,
    pingTimeout: 25000,
  });

  io.use((socket, next) => {
    void socketAuth(socket as AppSocket, next);
  });

  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket as AppSocket);
    registerPlaybackHandlers(io, socket as AppSocket);
    registerOwnerHandlers(io, socket as AppSocket);
    registerChatHandlers(io, socket as AppSocket);
    registerGameHandlers(io, socket as AppSocket);
  });

  startBattleSweeper(io);

  return io;
};
