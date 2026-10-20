import {
  AppError,
  ERROR_CODES,
  SendChatMessageSchema,
  SendReactionSchema,
  canControlPlayback,
} from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { listReactionSummary, sendChatMessage, toggleReaction } from '../services/chat';
import { respond, type AppServer } from './ack';
import type { AppSocket } from './auth';
import { requireRoomContext } from './broadcast';
import { takeToken } from './rate-limit';

const requireChatAccess = async (socket: AppSocket) => {
  const { roomId, userId } = requireRoomContext(socket);

  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { muted: true, role: true },
  });

  if (!membership) throw new AppError(ERROR_CODES.FORBIDDEN, 'You are not in this room', 403);
  if (membership.muted) throw new AppError(ERROR_CODES.MUTED, 'You are muted in this room', 403);

  const room = await prisma.room.findUniqueOrThrow({
    where: { id: roomId },
    select: { chatRestricted: true },
  });

  if (room.chatRestricted && !canControlPlayback(membership.role)) {
    throw new AppError(ERROR_CODES.CHAT_RESTRICTED, 'Only hosts can chat right now', 403);
  }

  return { roomId, userId };
};

export const registerChatHandlers = (io: AppServer, socket: AppSocket) => {
  socket.on('chat:send', (payload, ack) =>
    respond(ack, async () => {
      if (!takeToken(`${socket.id}:chat`, 5, 5000)) {
        throw new AppError(ERROR_CODES.RATE_LIMITED, 'Slow down on the messages', 429);
      }

      const { roomId, userId } = await requireChatAccess(socket);
      const { body } = SendChatMessageSchema.parse(payload);
      const message = await sendChatMessage(roomId, userId, body);

      io.to(roomId).emit('chat:new', message);
      return message;
    }),
  );

  socket.on('reaction:send', (payload, ack) =>
    respond(ack, async () => {
      if (!takeToken(`${socket.id}:reaction`, 12, 5000)) {
        throw new AppError(ERROR_CODES.RATE_LIMITED, 'Easy on the reactions', 429);
      }

      const { roomId, userId } = await requireChatAccess(socket);
      const { emoji } = SendReactionSchema.parse(payload);
      const { added } = await toggleReaction(roomId, userId, emoji);

      if (added) io.to(roomId).emit('reaction:new', added);
      io.to(roomId).emit('reactions:summary', await listReactionSummary(roomId));
      return undefined;
    }),
  );
};
