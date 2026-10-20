import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@bigbeanbag/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export const getSocket = (): AppSocket => {
  if (!socket) {
    socket = io({
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
  }

  return socket;
};

export const connectSocket = (): AppSocket => {
  const instance = getSocket();
  if (!instance.connected) instance.connect();
  return instance;
};
