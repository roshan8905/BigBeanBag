import {
  AppError,
  ERROR_CODES,
  PlayCommandSchema,
  SeekCommandSchema,
  TrackEndedSchema,
  canControlPlayback,
} from '@bigbeanbag/shared';
import type { AppServer } from './ack';
import { respond } from './ack';
import type { AppSocket } from './auth';
import { broadcastPlayback, broadcastQueue, requireRole, requireRoomContext } from './broadcast';
import { takeToken } from './rate-limit';
import {
  finishTrack,
  pausePlayback,
  seekPlayback,
  skipTrack,
  startPlayback,
} from '../services/playback';

const requireController = async (socket: AppSocket) => {
  const { roomId, userId } = requireRoomContext(socket);
  const role = await requireRole(roomId, userId);

  if (!canControlPlayback(role)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'Only the owner or a host can control playback',
      403,
    );
  }

  return roomId;
};

const guard = (socket: AppSocket) => {
  if (!takeToken(`${socket.id}:playback`, 20, 5000)) {
    throw new AppError(ERROR_CODES.RATE_LIMITED, 'Slow down on the controls', 429);
  }
};

export const registerPlaybackHandlers = (io: AppServer, socket: AppSocket) => {
  socket.on('playback:play', (payload, ack) =>
    respond(ack, async () => {
      guard(socket);
      const roomId = await requireController(socket);
      const { positionMs } = PlayCommandSchema.parse(payload);
      const state = await startPlayback(roomId, positionMs);
      broadcastPlayback(io, roomId, state);
      await broadcastQueue(io, roomId);
      return state;
    }),
  );

  socket.on('playback:pause', (payload, ack) =>
    respond(ack, async () => {
      guard(socket);
      const roomId = await requireController(socket);
      const { positionMs } = PlayCommandSchema.parse(payload);
      const state = await pausePlayback(roomId, positionMs);
      broadcastPlayback(io, roomId, state);
      await broadcastQueue(io, roomId);
      return state;
    }),
  );

  socket.on('playback:seek', (payload, ack) =>
    respond(ack, async () => {
      guard(socket);
      const roomId = await requireController(socket);
      const { positionMs } = SeekCommandSchema.parse(payload);
      const state = await seekPlayback(roomId, positionMs);
      broadcastPlayback(io, roomId, state);
      return state;
    }),
  );

  socket.on('playback:skip', (ack) =>
    respond(ack, async () => {
      guard(socket);
      const roomId = await requireController(socket);
      const state = await skipTrack(roomId);
      broadcastPlayback(io, roomId, state);
      await broadcastQueue(io, roomId);
      return state;
    }),
  );

  socket.on('playback:ended', (payload, ack) =>
    respond(ack, async () => {
      guard(socket);
      const roomId = await requireController(socket);
      const { itemId } = TrackEndedSchema.parse(payload);
      const state = await finishTrack(roomId, itemId);
      broadcastPlayback(io, roomId, state);
      await broadcastQueue(io, roomId);
      return state;
    }),
  );
};
