import type { Server } from 'socket.io';
import type {
  Ack,
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@bigbeanbag/shared';
import { AppError, ERROR_CODES, errorMessage } from '@bigbeanbag/shared';
import { ZodError } from 'zod';

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export const respond = async <T>(ack: Ack<T> | undefined, run: () => Promise<T>) => {
  try {
    const data = await run();
    if (typeof ack === 'function') ack({ ok: true, data });
  } catch (error) {
    const code = error instanceof AppError ? error.code : ERROR_CODES.INTERNAL;
    const message =
      error instanceof ZodError
        ? (error.issues[0]?.message ?? 'Invalid input')
        : errorMessage(error);

    if (typeof ack === 'function') ack({ ok: false, code, message });
  }
};

export const emitRoomError = (socket: { emit: (event: 'room:error', payload: { code: string; message: string }) => void }, message: string, code = ERROR_CODES.INTERNAL) => {
  socket.emit('room:error', { code, message });
};
