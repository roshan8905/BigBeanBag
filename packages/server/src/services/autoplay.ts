import { buildSuggestionQueries, type MediaItem } from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { searchYoutube } from './youtube';

const FALLBACK_QUERIES = ['Top hits', 'Chill songs', 'Throwback hits'];
const TARGET_TRACKS = 3;

const findSuggestions = async (roomId: string) => {
  const recent = await prisma.queueItem.findMany({
    where: { roomId, artist: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { artist: true },
  });

  const queries = buildSuggestionQueries([...recent].reverse());
  const artistQueries = queries.filter((query) => query.endsWith(' songs'));
  const searchQueries = artistQueries.length ? artistQueries.slice(0, TARGET_TRACKS) : FALLBACK_QUERIES;

  const [queued, played] = await Promise.all([
    prisma.queueItem.findMany({
      where: { roomId, status: { in: ['QUEUED', 'PLAYING'] } },
      select: { youtubeId: true },
    }),
    prisma.queueItem.findMany({
      where: { roomId, status: 'PLAYED' },
      orderBy: { playedAt: 'desc' },
      take: 50,
      select: { youtubeId: true },
    }),
  ]);

  const seen = new Set([...queued, ...played].map((item) => item.youtubeId));
  const responses = await Promise.allSettled(
    searchQueries.map((query) => searchYoutube(query, 'MUSIC', 5)),
  );

  const picks: MediaItem[] = [];
  for (const response of responses) {
    if (response.status === 'rejected') {
      console.error('Autoplay suggestion search failed', response.reason);
      continue;
    }

    for (const item of response.value) {
      if (seen.has(item.youtubeId)) continue;

      seen.add(item.youtubeId);
      picks.push(item);
      if (picks.length === TARGET_TRACKS) break;
    }

    if (picks.length === TARGET_TRACKS) break;
  }

  return picks;
};

export const maybeAutoplay = async (roomId: string) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { autoplay: true, ownerId: true, queueManual: true },
    });
    if (!room?.autoplay) return;

    const picks = await findSuggestions(roomId);
    if (!picks.length) return;

    let position: number | null = null;
    if (room.queueManual) {
      const max = await prisma.queueItem.aggregate({ where: { roomId }, _max: { position: true } });
      position = (max._max.position ?? 0) + 1;
    }

    const createdAt = Date.now();
    await prisma.$transaction(
      picks.map((item, index) =>
        prisma.queueItem.create({
          data: {
            roomId,
            addedById: room.ownerId,
            source: item.source,
            youtubeId: item.youtubeId,
            spotifyId: item.spotifyId,
            title: item.title,
            artist: item.artist,
            thumbnail: item.thumbnail,
            durationMs: item.durationMs,
            mediaType: item.mediaType,
            position: position === null ? null : position + index,
            createdAt: new Date(createdAt + index),
          },
        }),
      ),
    );
  } catch (error) {
    console.error('Autoplay failed to refill the queue', error);
  }
};
