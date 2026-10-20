import {
  AppError,
  ERROR_CODES,
  canManageRoles,
  canModerate,
  type ModerationInput,
  type Role,
  type RoomMember as RoomMemberDto,
} from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { toMemberDto } from '../lib/dto';

const memberInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

const findMember = (roomId: string, userId: string) =>
  prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    include: memberInclude,
  });

const requireActor = async (roomId: string, userId: string) => {
  const actor = await findMember(roomId, userId);
  if (!actor) throw new AppError(ERROR_CODES.FORBIDDEN, 'You are not in this room', 403);
  return actor;
};

export const listMemberDtos = async (roomId: string): Promise<RoomMemberDto[]> => {
  const members = await prisma.roomMember.findMany({
    where: { roomId },
    include: memberInclude,
    orderBy: { joinedAt: 'asc' },
  });

  return members.map(toMemberDto);
};

const changeRole = async (roomId: string, actorId: string, targetUserId: string, role: Role) => {
  const actor = await requireActor(roomId, actorId);
  if (!canManageRoles(actor.role)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'Only the owner can change roles', 403);
  }

  if (targetUserId === actorId) {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'The owner role is permanent', 403);
  }

  const target = await findMember(roomId, targetUserId);
  if (!target) throw new AppError(ERROR_CODES.NOT_FOUND, 'That person is not in this room', 404);
  if (target.role === 'OWNER') {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'The owner role cannot be changed', 403);
  }
  if (target.role === role) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `That person is already a ${role.toLowerCase()}`, 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const member = await tx.roomMember.update({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      data: { role },
      include: memberInclude,
    });

    await tx.roomRoleChange.create({
      data: {
        roomId,
        targetUserId,
        changedById: actorId,
        oldRole: target.role,
        newRole: role,
      },
    });

    return member;
  });

  return { member: toMemberDto(updated), role };
};

export const promoteMember = (roomId: string, actorId: string, targetUserId: string) =>
  changeRole(roomId, actorId, targetUserId, 'HOST');

export const demoteMember = (roomId: string, actorId: string, targetUserId: string) =>
  changeRole(roomId, actorId, targetUserId, 'MEMBER');

export const moderateMember = async (
  roomId: string,
  actorId: string,
  input: ModerationInput,
) => {
  const actor = await requireActor(roomId, actorId);

  if (input.action === 'unban') {
    if (!canModerate(actor.role, 'MEMBER')) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Only the owner or a host can lift bans', 403);
    }

    const target = await findMember(roomId, input.userId);
    if (target?.role === 'OWNER') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'The owner cannot be moderated', 403);
    }

    await prisma.roomBan.deleteMany({ where: { roomId, userId: input.userId } });
    return { action: input.action, targetUserId: input.userId, members: await listMemberDtos(roomId) };
  }

  const target = await findMember(roomId, input.userId);
  if (!target) throw new AppError(ERROR_CODES.NOT_FOUND, 'That person is not in this room', 404);

  if (!canModerate(actor.role, target.role)) {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'You cannot moderate that person', 403);
  }

  if (input.action === 'mute' || input.action === 'unmute') {
    await prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId: input.userId } },
      data: { muted: input.action === 'mute' },
    });

    return { action: input.action, targetUserId: input.userId, members: await listMemberDtos(roomId) };
  }

  if (input.action === 'ban') {
    await prisma.$transaction([
      prisma.roomBan.upsert({
        where: { roomId_userId: { roomId, userId: input.userId } },
        create: {
          roomId,
          userId: input.userId,
          bannedById: actorId,
          reason: input.reason ?? null,
        },
        update: {
          bannedById: actorId,
          reason: input.reason ?? null,
          createdAt: new Date(),
        },
      }),
      prisma.roomMember.delete({
        where: { roomId_userId: { roomId, userId: input.userId } },
      }),
    ]);

    return { action: input.action, targetUserId: input.userId, members: await listMemberDtos(roomId) };
  }

  await prisma.roomMember.delete({ where: { roomId_userId: { roomId, userId: input.userId } } });
  return { action: input.action, targetUserId: input.userId, members: await listMemberDtos(roomId) };
};
