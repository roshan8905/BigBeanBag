import type { Prisma } from '@prisma/client';
import { AppError, ERROR_CODES, type AddQueueItemInput, type QueueItem as QueueItemDto } from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { getYoutubeItem } from './youtube';

export const queueInclude = {
  votes: { select: { userId: true } },
  addedBy: { select: { id: true, name: true } },
} satisfies Prisma.QueueItemInclude;

export type QueueRow = Prisma.QueueItemGetPayload<{ include: typeof queueInclude }>;

export const loadQueueRows = async (roomId: string) =>
  prisma.queueItem.findMany({
    where: { roomId, status: { in: ['QUEUED', 'PLAYING'] } },
    include: queueInclude,
    orderBy: { createdAt: 'asc' },
  });

export const toQueueItemDto = (row: QueueRow, userId: string): QueueItemDto => ({
  id: row.id,
  roomId: row.roomId,
  source: row.source,
  youtubeId: row.youtubeId,
  spotifyId: row.spotifyId,
  title: row.title,
  artist: row.artist,
  thumbnail: row.thumbnail,
  durationMs: row.durationMs,
  mediaType: row.mediaType,
  status: row.status,
  addedBy: { id: row.addedBy.id, name: row.addedBy.name },
  voteCount: row.votes.length,
  votedByMe: row.votes.some((vote) => vote.userId === userId),
  createdAt: row.createdAt.toISOString(),
});

export const orderQueue = (rows: QueueRow[]) => {
  const playing = rows.filter((row) => row.status === 'PLAYING');
  const queued = rows
    .filter((row) => row.status === 'QUEUED')
    .sort((a, b) => b.votes.length - a.votes.length || a.createdAt.getTime() - b.createdAt.getTime());

  return [...playing, ...queued];
};

export const getQueue = async (roomId: string, userId: string) =>
  orderQueue(await loadQueueRows(roomId)).map((row) => toQueueItemDto(row, userId));

export const addQueueItem = async (roomId: string, userId: string, input: AddQueueItemInput) => {
  const canonical = await getYoutubeItem(input.youtubeId);
  const keepMatchTitle = input.source === 'SPOTIFY_MATCHED';

  const row = await prisma.queueItem.create({
    data: {
      roomId,
      addedById: userId,
      source: input.source,
      youtubeId: canonical.youtubeId,
      spotifyId: input.spotifyId,
      title: keepMatchTitle ? input.title : canonical.title,
      artist: keepMatchTitle ? input.artist : canonical.artist,
      thumbnail: canonical.thumbnail,
      durationMs: canonical.durationMs,
      mediaType: canonical.mediaType,
    },
    include: queueInclude,
  });

  return toQueueItemDto(row, userId);
};

export const toggleVote = async (roomId: string, itemId: string, userId: string) => {
  const item = await prisma.queueItem.findFirst({ where: { id: itemId, roomId } });
  if (!item) throw new AppError(ERROR_CODES.NOT_FOUND, 'That queue item is gone', 404);
  if (item.status !== 'QUEUED') {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'Only songs waiting in the queue can be voted on', 400);
  }

  const existing = await prisma.vote.findUnique({ where: { itemId_userId: { itemId, userId } } });
  let voted: boolean;

  if (existing) {
    await prisma.vote.delete({ where: { id: existing.id } });
    voted = false;
  } else {
    await prisma.vote.create({ data: { itemId, userId } }).catch((error) => {
      if ((error as { code?: string }).code !== 'P2002') throw error;
    });
    voted = true;
  }

  const voteCount = await prisma.vote.count({ where: { itemId } });
  return { itemId, voted, voteCount };
};

export const removeQueueItem = async (roomId: string, itemId: string) => {
  const item = await prisma.queueItem.findFirst({ where: { id: itemId, roomId } });
  if (!item) throw new AppError(ERROR_CODES.NOT_FOUND, 'That queue item is gone', 404);

  await prisma.queueItem.delete({ where: { id: item.id } });

  if (item.status === 'PLAYING') {
    await prisma.playbackState.updateMany({
      where: { roomId, currentItemId: item.id },
      data: { currentItemId: null, status: 'IDLE', positionMs: 0 },
    });
  }
};
