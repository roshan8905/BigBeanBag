import type { ChatMessage, ReactionSummary } from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { toChatMessageDto, toReactionDto } from '../lib/dto';

const chatInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

const reactionInclude = {
  user: { select: { id: true, name: true } },
} as const;

export const listRecentMessages = async (roomId: string): Promise<ChatMessage[]> => {
  const rows = await prisma.chatMessage.findMany({
    where: { roomId },
    include: chatInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return rows.reverse().map(toChatMessageDto);
};

export const sendChatMessage = async (roomId: string, userId: string, body: string) => {
  const message = await prisma.chatMessage.create({
    data: { roomId, userId, body },
    include: chatInclude,
  });

  return toChatMessageDto(message);
};

export const listReactionSummary = async (roomId: string): Promise<ReactionSummary[]> => {
  const groups = await prisma.reaction.groupBy({
    by: ['emoji'],
    where: { roomId },
    _count: { _all: true },
  });

  return groups
    .map((group) => ({ emoji: group.emoji, count: group._count._all }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
};

export const toggleReaction = async (roomId: string, userId: string, emoji: string) => {
  const existing = await prisma.reaction.findFirst({
    where: { roomId, userId, emoji },
    select: { id: true },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    return { added: null };
  }

  const reaction = await prisma.reaction.create({
    data: { roomId, userId, emoji },
    include: reactionInclude,
  });

  return { added: toReactionDto(reaction) };
};
