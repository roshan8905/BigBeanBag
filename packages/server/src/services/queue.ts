import type { Prisma } from '@prisma/client';
import {
  AppError,
  ERROR_CODES,
  type AddQueueItemInput,
  type QueueItem as QueueItemDto,
} from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { getYoutubeItem } from './youtube';
import { skipTrack } from './playback';

export const queueInclude = {
  addedBy: { select: { id: true, name: true } },
} satisfies Prisma.QueueItemInclude;

export type QueueRow = Prisma.QueueItemGetPayload<{ include: typeof queueInclude }>;

export const loadQueueRows = async (roomId: string) =>
  prisma.queueItem.findMany({
    where: { roomId, status: { in: ['QUEUED', 'PLAYING'] } },
    include: queueInclude,
    orderBy: { createdAt: 'asc' },
  });

export const toQueueItemDto = (row: QueueRow): QueueItemDto => ({
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
  createdAt: row.createdAt.toISOString(),
});

const byCreatedAt = (a: QueueRow, b: QueueRow) => a.createdAt.getTime() - b.createdAt.getTime();

const byPosition = (a: QueueRow, b: QueueRow) =>
  (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
  a.createdAt.getTime() - b.createdAt.getTime();

export const orderQueue = (rows: QueueRow[], queueManual = false) => {
  const playing = rows.filter((row) => row.status === 'PLAYING');
  const queued = rows
    .filter((row) => row.status === 'QUEUED')
    .sort(queueManual ? byPosition : byCreatedAt);

  return [...playing, ...queued];
};

export const getQueue = async (roomId: string) => {
  const [rows, room] = await Promise.all([
    loadQueueRows(roomId),
    prisma.room.findUnique({ where: { id: roomId }, select: { queueManual: true } }),
  ]);

  return orderQueue(rows, room?.queueManual ?? false).map(toQueueItemDto);
};

const nextQueuePosition = async (roomId: string) => {
  const max = await prisma.queueItem.aggregate({ where: { roomId }, _max: { position: true } });
  return (max._max.position ?? 0) + 1;
};

export const addQueueItem = async (roomId: string, userId: string, input: AddQueueItemInput) => {
  const canonical = await getYoutubeItem(input.youtubeId);
  const keepMatchTitle = input.source === 'SPOTIFY_MATCHED';
  const room = await prisma.room.findUniqueOrThrow({
    where: { id: roomId },
    select: { queueManual: true },
  });
  const position = room.queueManual ? await nextQueuePosition(roomId) : null;

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
      position,
    },
    include: queueInclude,
  });

  return toQueueItemDto(row);
};

export const removeQueueItem = async (roomId: string, itemId: string) => {
  const item = await prisma.queueItem.findFirst({ where: { id: itemId, roomId } });
  if (!item) throw new AppError(ERROR_CODES.NOT_FOUND, 'That queue item is gone', 404);

  await prisma.queueItem.delete({ where: { id: item.id } });

  if (item.status === 'PLAYING') {
    await skipTrack(roomId);
  }
};

const writeManualOrder = async (roomId: string, queued: QueueRow[]) => {
  await prisma.$transaction([
    prisma.room.update({ where: { id: roomId }, data: { queueManual: true } }),
    ...queued.map((row, index) =>
      prisma.queueItem.update({ where: { id: row.id }, data: { position: index + 1 } }),
    ),
  ]);
};

export const shuffleQueue = async (roomId: string) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { queueManual: true },
  });
  if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Room not found', 404);

  const rows = await loadQueueRows(roomId);
  const queued = orderQueue(rows, room.queueManual).filter((row) => row.status === 'QUEUED');

  for (let index = queued.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = queued[index];
    const swap = queued[swapIndex];
    if (!current || !swap) continue;

    queued[index] = swap;
    queued[swapIndex] = current;
  }

  await writeManualOrder(roomId, queued);
};

export const moveQueueItem = async (roomId: string, itemId: string, toIndex: number) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { queueManual: true },
  });
  if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Room not found', 404);

  const rows = await loadQueueRows(roomId);
  const queued = orderQueue(rows, room.queueManual).filter((row) => row.status === 'QUEUED');
  const index = queued.findIndex((row) => row.id === itemId);

  if (index === -1) {
    if (rows.some((row) => row.id === itemId && row.status === 'PLAYING')) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'The playing song cannot be reordered', 400);
    }
    throw new AppError(ERROR_CODES.NOT_FOUND, 'That queue item is gone', 404);
  }

  const targetIndex = Math.min(toIndex, queued.length - 1);
  if (index === targetIndex) return;

  const [current] = queued.splice(index, 1);
  if (!current) return;

  queued.splice(targetIndex, 0, current);
  await writeManualOrder(roomId, queued);
};
