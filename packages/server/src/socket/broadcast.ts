import { AppError, ERROR_CODES, type PlaybackState } from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { loadQueueRows, orderQueue, toQueueItemDto } from '../services/queue';
import type { AppServer } from './ack';

export const emitPresence = async (io: AppServer, roomId: string) => {
  const sockets = await io.in(roomId).fetchSockets();
  const userIds = [
    ...new Set(sockets.map((socket) => socket.data.userId).filter((id): id is string => Boolean(id))),
  ];

  io.to(roomId).emit('room:presence', { userIds });
};

export const broadcastQueue = async (io: AppServer, roomId: string) => {
  const [rows, sockets] = await Promise.all([loadQueueRows(roomId), io.in(roomId).fetchSockets()]);
  const ordered = orderQueue(rows);

  for (const target of sockets) {
    target.emit('queue:updated', {
      items: ordered.map((row) => toQueueItemDto(row, target.data.userId)),
    });
  }
};

export const broadcastPlayback = (io: AppServer, roomId: string, state: PlaybackState) => {
  io.to(roomId).emit('playback:updated', state);
};

export const requireRoomContext = (socket: { data: { roomId?: string; userId?: string } }) => {
  if (!socket.data.roomId || !socket.data.userId) {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'Join a room before doing that', 403);
  }

  return { roomId: socket.data.roomId, userId: socket.data.userId };
};

export const requireRole = async (roomId: string, userId: string) => {
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { role: true },
  });

  if (!membership) throw new AppError(ERROR_CODES.FORBIDDEN, 'You are not in this room', 403);
  return membership.role;
};
