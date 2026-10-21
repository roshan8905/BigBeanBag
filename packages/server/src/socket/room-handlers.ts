import {
  AddQueueItemSchema,
  AppError,
  ERROR_CODES,
  JoinRoomSchema,
  RemoveQueueItemSchema,
  VoteToggleSchema,
  canControlPlayback,
  canRemoveFromQueue,
} from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { addQueueItem, getQueue, removeQueueItem, toggleVote } from '../services/queue';
import { loadPlayback } from '../services/playback';
import { leaveRoom } from '../services/rooms';
import { buildRoomSnapshot } from '../services/snapshot';
import { respond, type AppServer } from './ack';
import type { AppSocket } from './auth';
import {
  broadcastPlayback,
  broadcastQueue,
  emitPresence,
  requireRole,
  requireRoomContext,
} from './broadcast';
import { clearSocket, takeToken } from './rate-limit';

export const registerRoomHandlers = (io: AppServer, socket: AppSocket) => {
  socket.on('sync:ping', (payload, ack) => {
    ack({ ok: true, data: { t0: payload.t0, serverNow: Date.now() } });
  });

  socket.on('room:join', (payload, ack) =>
    respond(ack, async () => {
      const { code } = JoinRoomSchema.parse(payload);
      const room = await prisma.room.findUnique({ where: { code }, select: { id: true } });
      if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Room not found', 404);

      const role = await requireRole(room.id, socket.data.userId);

      if (socket.data.roomId && socket.data.roomId !== room.id) {
        socket.leave(socket.data.roomId);
      }

      socket.join(room.id);
      socket.data.roomId = room.id;
      socket.data.role = role;

      const snapshot = await buildRoomSnapshot(room.id, socket.data.userId);
      socket.to(room.id).emit('room:members', snapshot.members);
      await emitPresence(io, room.id);

      return snapshot;
    }),
  );

  socket.on('room:leave', (ack) =>
    respond(ack, async () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        socket.leave(roomId);
        socket.data.roomId = undefined;
        socket.data.role = undefined;
        await emitPresence(io, roomId);
      }
      return undefined;
    }),
  );

  socket.on('room:exit', (ack) =>
    respond(ack, async () => {
      const { roomId, userId } = requireRoomContext(socket);
      const members = await leaveRoom(roomId, userId);

      socket.leave(roomId);
      socket.data.roomId = undefined;
      socket.data.role = undefined;

      io.to(roomId).emit('room:members', members);
      await emitPresence(io, roomId);
      return undefined;
    }),
  );

  socket.on('queue:add', (payload, ack) =>
    respond(ack, async () => {
      if (!takeToken(`${socket.id}:queue`, 8, 5000)) {
        throw new AppError(ERROR_CODES.RATE_LIMITED, 'Slow down, that is a lot of songs', 429);
      }

      const { roomId, userId } = requireRoomContext(socket);
      const role = await requireRole(roomId, userId);
      const room = await prisma.room.findUniqueOrThrow({
        where: { id: roomId },
        select: { addRestricted: true },
      });

      if (room.addRestricted && !canControlPlayback(role)) {
        throw new AppError(ERROR_CODES.ADD_RESTRICTED, 'Only hosts can add songs right now', 403);
      }

      const input = AddQueueItemSchema.parse(payload);
      const item = await addQueueItem(roomId, userId, input);
      await broadcastQueue(io, roomId);
      return item;
    }),
  );

  socket.on('queue:vote', (payload, ack) =>
    respond(ack, async () => {
      if (!takeToken(`${socket.id}:vote`, 20, 5000)) {
        throw new AppError(ERROR_CODES.RATE_LIMITED, 'Easy on the votes', 429);
      }

      const { roomId, userId } = requireRoomContext(socket);
      const { itemId } = VoteToggleSchema.parse(payload);
      const result = await toggleVote(roomId, itemId, userId);
      await broadcastQueue(io, roomId);
      return result;
    }),
  );

  socket.on('queue:remove', (payload, ack) =>
    respond(ack, async () => {
      const { roomId, userId } = requireRoomContext(socket);
      const role = await requireRole(roomId, userId);
      if (!canRemoveFromQueue(role)) {
        throw new AppError(ERROR_CODES.FORBIDDEN, 'Only hosts can remove queue items', 403);
      }

      const { itemId } = RemoveQueueItemSchema.parse(payload);
      await removeQueueItem(roomId, itemId);
      await broadcastQueue(io, roomId);
      broadcastPlayback(io, roomId, await loadPlayback(roomId));
      return { items: await getQueue(roomId, userId) };
    }),
  );

  socket.on('disconnect', () => {
    clearSocket(socket.id);
    if (socket.data.roomId) void emitPresence(io, socket.data.roomId);
  });
};
