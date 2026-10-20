import type { PlaybackState as DbPlaybackState } from '@prisma/client';
import type { PlaybackState } from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';

export const ensurePlayback = async (roomId: string) =>
  prisma.playbackState.upsert({
    where: { roomId },
    create: { roomId },
    update: {},
  });

export const toPlaybackDto = (state: DbPlaybackState, durationMs: number | null): PlaybackState => ({
  currentItemId: state.currentItemId,
  status: state.status,
  positionMs: state.positionMs,
  updatedAt: state.updatedAt.getTime(),
  durationMs,
});
