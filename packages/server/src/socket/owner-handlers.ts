import {
  AppError,
  ERROR_CODES,
  ModerationInputSchema,
  PromoteMemberSchema,
  RoomRestrictionSchema,
  UpdateRoomSchema,
  canManageRoom,
} from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { demoteMember, listMemberDtos, moderateMember, promoteMember } from '../services/moderation';
import { deleteRoom, rotateInvite, setRoomRestrictions, updateRoom } from '../services/rooms';
import { respond, type AppServer } from './ack';
import type { AppSocket } from './auth';
import { emitPresence, requireRole, requireRoomContext } from './broadcast';

const requireOwner = async (socket: AppSocket) => {
  const { roomId, userId } = requireRoomContext(socket);
  const role = await requireRole(roomId, userId);

  if (!canManageRoom(role)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'Only the owner can do that', 403);
  }

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { code: true } });
  if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Room not found', 404);

  return { roomId, userId, code: room.code };
};

export const registerOwnerHandlers = (io: AppServer, socket: AppSocket) => {
  socket.on('room:update', (payload, ack) =>
    respond(ack, async () => {
      const { roomId, userId, code } = await requireOwner(socket);
      const input = UpdateRoomSchema.parse(payload);
      const detail = await updateRoom(code, userId, input);
      io.to(roomId).emit('room:updated', detail.room);
      return detail.room;
    }),
  );

  socket.on('room:restrict', (payload, ack) =>
    respond(ack, async () => {
      const { roomId, userId, code } = await requireOwner(socket);
      const input = RoomRestrictionSchema.parse(payload);
      if (!Object.keys(input).length) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Pick at least one restriction', 400);
      }

      const detail = await setRoomRestrictions(code, userId, input);
      io.to(roomId).emit('room:updated', detail.room);
      return detail.room;
    }),
  );

  socket.on('room:delete', (ack) =>
    respond(ack, async () => {
      const { roomId, userId, code } = await requireOwner(socket);
      io.to(roomId).emit('room:deleted', { roomId });
      await deleteRoom(code, userId);
      io.socketsLeave(roomId);
      return undefined;
    }),
  );

  socket.on('invite:rotate', (ack) =>
    respond(ack, async () => {
      const { userId, code } = await requireOwner(socket);
      return rotateInvite(code, userId);
    }),
  );

  socket.on('member:promote', (payload, ack) =>
    respond(ack, async () => {
      const { roomId, userId } = requireRoomContext(socket);
      const { userId: targetUserId } = PromoteMemberSchema.parse(payload);
      const { member, role } = await promoteMember(roomId, userId, targetUserId);

      io.to(roomId).emit('room:members', await listMemberDtos(roomId));
      const targets = (await io.in(roomId).fetchSockets()).filter(
        (entry) => entry.data.userId === targetUserId,
      );
      for (const target of targets) target.emit('room:role', { role });

      return member;
    }),
  );

  socket.on('member:demote', (payload, ack) =>
    respond(ack, async () => {
      const { roomId, userId } = requireRoomContext(socket);
      const { userId: targetUserId } = PromoteMemberSchema.parse(payload);
      const { member, role } = await demoteMember(roomId, userId, targetUserId);

      io.to(roomId).emit('room:members', await listMemberDtos(roomId));
      const targets = (await io.in(roomId).fetchSockets()).filter(
        (entry) => entry.data.userId === targetUserId,
      );
      for (const target of targets) target.emit('room:role', { role });

      return member;
    }),
  );

  socket.on('moderation:act', (payload, ack) =>
    respond(ack, async () => {
      const { roomId, userId } = requireRoomContext(socket);
      const input = ModerationInputSchema.parse(payload);
      const result = await moderateMember(roomId, userId, input);

      io.to(roomId).emit('room:members', result.members);

      if (input.action === 'kick' || input.action === 'ban') {
        const targets = (await io.in(roomId).fetchSockets()).filter(
          (entry) => entry.data.userId === input.userId,
        );

        for (const target of targets) {
          target.emit('session:ended', {
            reason: input.action === 'ban' ? 'banned' : 'kicked',
          });
          target.leave(roomId);
          target.data.roomId = undefined;
          target.data.role = undefined;
        }
      }

      await emitPresence(io, roomId);
      return undefined;
    }),
  );
};
