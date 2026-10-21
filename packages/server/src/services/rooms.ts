import { AppError, ERROR_CODES, type CreateRoomInput, type UpdateRoomInput } from '@bigbeanbag/shared';
import type { Prisma, Role } from '@prisma/client';
import { env } from '../env';
import { generateInviteToken, generateRoomCode } from '../lib/ids';
import { prisma } from '../lib/prisma';
import {
  roomDetailInclude,
  roomMetaInclude,
  toMemberDto,
  toRoomDetail,
  toRoomSummary,
  type RoomWithDetail,
} from '../lib/dto';

const inviteUrl = (token: string) => `${env.APP_URL}/join/${token}`;

const findRoomByCode = async (code: string) =>
  prisma.room.findUnique({ where: { code }, include: roomDetailInclude });

const membershipRole = (membership: { role: Role } | null): Role | null => membership?.role ?? null;

export const getMembership = async (roomId: string, userId: string) =>
  prisma.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });

const assertCanJoin = async (
  room: { id: string; locked: boolean; visibility: string },
  userId: string,
  allowPrivate: boolean,
) => {
  if (room.locked) {
    throw new AppError(ERROR_CODES.ROOM_LOCKED, 'This room is locked right now', 403);
  }

  const ban = await prisma.roomBan.findUnique({ where: { roomId_userId: { roomId: room.id, userId } } });
  if (ban) throw new AppError(ERROR_CODES.BANNED, 'You are banned from this room', 403);

  if (!allowPrivate && room.visibility === 'PRIVATE') {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'This room is private. Use its invite link.', 403);
  }
};

const join = async (room: RoomWithDetail, userId: string, allowPrivate = false) => {
  const membership = room.members.find((member) => member.userId === userId);
  if (membership) return toRoomDetail(room, membership.role);

  await assertCanJoin(room, userId, allowPrivate);
  await prisma.roomMember.create({ data: { roomId: room.id, userId, role: 'MEMBER' } });

  const updated = await prisma.room.findUniqueOrThrow({ where: { id: room.id }, include: roomDetailInclude });
  return toRoomDetail(updated, 'MEMBER');
};

export const createRoom = async (ownerId: string, input: CreateRoomInput) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const room = await prisma.room.create({
        data: {
          name: input.name,
          visibility: input.visibility,
          ownerId,
          code: generateRoomCode(),
          inviteToken: generateInviteToken(),
          members: { create: { userId: ownerId, role: 'OWNER' } },
          playback: { create: {} },
        },
        include: roomDetailInclude,
      });

      return toRoomDetail(room, 'OWNER');
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') continue;
      throw error;
    }
  }

  throw new AppError(ERROR_CODES.INTERNAL, 'Could not allocate a room code, try again', 500);
};

export const listRooms = async (userId: string) => {
  const [memberships, publicRooms] = await Promise.all([
    prisma.roomMember.findMany({
      where: { userId },
      include: { room: { include: roomMetaInclude } },
      orderBy: { joinedAt: 'desc' },
    }),
    prisma.room.findMany({
      where: { visibility: 'PUBLIC', members: { none: { userId } } },
      include: roomMetaInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return {
    mine: memberships.map((membership) => toRoomSummary(membership.room, membership.role)),
    publicRooms: publicRooms.map((room) => toRoomSummary(room, null)),
  };
};

export const getRoomForUser = async (code: string, userId: string) => {
  const room = await findRoomByCode(code);
  if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Room not found', 404);

  const role = membershipRole(room.members.find((member) => member.userId === userId) ?? null);
  if (!role && room.visibility === 'PRIVATE') {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'This room is private. Use its invite link.', 403);
  }

  return toRoomDetail(role ? room : { ...room, members: [] }, role);
};

export const joinRoomByCode = async (code: string, userId: string) => {
  const room = await findRoomByCode(code);
  if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Room not found', 404);
  return join(room, userId);
};

export const joinRoomByToken = async (token: string, userId: string) => {
  const room = await prisma.room.findUnique({ where: { inviteToken: token }, include: roomDetailInclude });
  if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'This invite link is no longer valid', 404);
  return join(room, userId, true);
};

const requireOwner = async (code: string, userId: string) => {
  const room = await prisma.room.findUnique({ where: { code }, include: roomDetailInclude });
  if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Room not found', 404);
  if (room.ownerId !== userId) throw new AppError(ERROR_CODES.FORBIDDEN, 'Only the room owner can do that', 403);
  return room;
};

export const updateRoom = async (code: string, userId: string, input: UpdateRoomInput) => {
  const room = await requireOwner(code, userId);
  const updated = await prisma.room.update({ where: { id: room.id }, data: input, include: roomDetailInclude });
  return toRoomDetail(updated, 'OWNER');
};

export const setRoomLocked = async (code: string, userId: string, locked: boolean) => {
  const room = await requireOwner(code, userId);
  const updated = await prisma.room.update({ where: { id: room.id }, data: { locked }, include: roomDetailInclude });
  return toRoomDetail(updated, 'OWNER');
};

export const setRoomRestrictions = async (
  code: string,
  userId: string,
  input: { chatRestricted?: boolean; addRestricted?: boolean; locked?: boolean },
) => {
  const room = await requireOwner(code, userId);
  const updated = await prisma.room.update({
    where: { id: room.id },
    data: input,
    include: roomDetailInclude,
  });
  return toRoomDetail(updated, 'OWNER');
};

export const deleteRoom = async (code: string, userId: string) => {
  const room = await requireOwner(code, userId);
  await prisma.room.delete({ where: { id: room.id } });
};

export const leaveRoom = async (roomId: string, userId: string) => {
  const membership = await getMembership(roomId, userId);
  if (!membership) throw new AppError(ERROR_CODES.NOT_FOUND, 'You are not in this room', 404);
  if (membership.role === 'OWNER') {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      'Owners cannot leave their own room. Delete it instead.',
      400,
    );
  }

  await prisma.roomMember.delete({ where: { roomId_userId: { roomId, userId } } });

  const room = await prisma.room.findUnique({ where: { id: roomId }, include: roomDetailInclude });
  return room ? room.members.map(toMemberDto) : [];
};

export const getInvite = async (code: string, userId: string) => {
  const room = await requireOwner(code, userId);
  return room.inviteToken ? { token: room.inviteToken, url: inviteUrl(room.inviteToken) } : { token: null, url: null };
};

export const rotateInvite = async (code: string, userId: string) => {
  const room = await requireOwner(code, userId);
  const token = generateInviteToken();
  await prisma.room.update({ where: { id: room.id }, data: { inviteToken: token } });
  return { token, url: inviteUrl(token) };
};

export const revokeInvite = async (code: string, userId: string) => {
  const room = await requireOwner(code, userId);
  await prisma.room.update({ where: { id: room.id }, data: { inviteToken: null } });
};

export const listMembers = async (code: string, userId: string) => {
  const detail = await getRoomForUser(code, userId);
  if (!detail.role) throw new AppError(ERROR_CODES.FORBIDDEN, 'Join this room to see its members', 403);
  return detail.members;
};
