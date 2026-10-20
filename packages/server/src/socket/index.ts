import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { AppServer } from './ack';
import { socketAuth, type AppSocket } from './auth';
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
  });

  return io;
};
