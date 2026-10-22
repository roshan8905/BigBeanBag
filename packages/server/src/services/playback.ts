import type { PlaybackState as DbPlaybackState } from '@prisma/client';
import type { PlaybackState } from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { maybeAutoplay } from './autoplay';

export const ensurePlayback = async (roomId: string) =>
  prisma.playbackState.upsert({
    where: { roomId },
    create: { roomId },
    update: {},
  });

export const toPlaybackDto = (
  state: DbPlaybackState,
  durationMs: number | null,
): PlaybackState => ({
  currentItemId: state.currentItemId,
  status: state.status,
  positionMs: state.positionMs,
  updatedAt: state.updatedAt.getTime(),
  durationMs,
});

const nextQueued = async (roomId: string) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { queueManual: true },
  });

  if (room?.queueManual) {
    return prisma.queueItem.findFirst({
      where: { roomId, status: 'QUEUED' },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  return prisma.queueItem.findFirst({
    where: { roomId, status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
  });
};

const nextQueuedWithAutoplay = async (roomId: string) => {
  const next = await nextQueued(roomId);
  if (next) return next;

  await maybeAutoplay(roomId);
  return nextQueued(roomId);
};

export const loadPlayback = async (roomId: string) => {
  const state = await ensurePlayback(roomId);
  const current = state.currentItemId
    ? await prisma.queueItem.findUnique({ where: { id: state.currentItemId } })
    : null;

  return toPlaybackDto(state, current?.durationMs ?? null);
};

const clampPosition = (positionMs: number, durationMs: number | null) => {
  const safe = Math.max(positionMs, 0);
  return durationMs ? Math.min(safe, durationMs) : safe;
};

export const startPlayback = async (roomId: string, positionMs?: number) => {
  const state = await ensurePlayback(roomId);

  if (!state.currentItemId) {
    const next = await nextQueuedWithAutoplay(roomId);
    if (!next) return loadPlayback(roomId);

    await prisma.queueItem.update({ where: { id: next.id }, data: { status: 'PLAYING' } });
    const updated = await prisma.playbackState.update({
      where: { roomId },
      data: {
        currentItemId: next.id,
        status: 'PLAYING',
        positionMs: clampPosition(positionMs ?? 0, next.durationMs),
      },
    });

    return toPlaybackDto(updated, next.durationMs);
  }

  const current = await prisma.queueItem.findUnique({ where: { id: state.currentItemId } });
  const updated = await prisma.playbackState.update({
    where: { roomId },
    data: {
      status: 'PLAYING',
      ...(positionMs !== undefined
        ? { positionMs: clampPosition(positionMs, current?.durationMs ?? null) }
        : {}),
    },
  });

  return toPlaybackDto(updated, current?.durationMs ?? null);
};

export const pausePlayback = async (roomId: string, positionMs?: number) => {
  const state = await ensurePlayback(roomId);
  const current = state.currentItemId
    ? await prisma.queueItem.findUnique({ where: { id: state.currentItemId } })
    : null;

  const updated = await prisma.playbackState.update({
    where: { roomId },
    data: {
      status: state.currentItemId ? 'PAUSED' : 'IDLE',
      ...(positionMs !== undefined
        ? { positionMs: clampPosition(positionMs, current?.durationMs ?? null) }
        : {}),
    },
  });

  return toPlaybackDto(updated, current?.durationMs ?? null);
};

export const seekPlayback = async (roomId: string, positionMs: number) => {
  const state = await ensurePlayback(roomId);
  const current = state.currentItemId
    ? await prisma.queueItem.findUnique({ where: { id: state.currentItemId } })
    : null;

  const updated = await prisma.playbackState.update({
    where: { roomId },
    data: { positionMs: clampPosition(positionMs, current?.durationMs ?? null) },
  });

  return toPlaybackDto(updated, current?.durationMs ?? null);
};

export const skipTrack = async (roomId: string) => {
  const state = await ensurePlayback(roomId);

  if (state.currentItemId) {
    await prisma.queueItem.updateMany({
      where: { id: state.currentItemId, roomId },
      data: { status: 'PLAYED', playedAt: new Date() },
    });
  }

  const next = await nextQueuedWithAutoplay(roomId);

  if (!next) {
    const idle = await prisma.playbackState.update({
      where: { roomId },
      data: { currentItemId: null, status: 'IDLE', positionMs: 0 },
    });
    return toPlaybackDto(idle, null);
  }

  await prisma.queueItem.update({ where: { id: next.id }, data: { status: 'PLAYING' } });
  const updated = await prisma.playbackState.update({
    where: { roomId },
    data: { currentItemId: next.id, status: 'PLAYING', positionMs: 0 },
  });

  return toPlaybackDto(updated, next.durationMs);
};

export const finishTrack = async (roomId: string, itemId: string) => {
  const state = await ensurePlayback(roomId);
  if (state.currentItemId !== itemId) return loadPlayback(roomId);

  return skipTrack(roomId);
};
