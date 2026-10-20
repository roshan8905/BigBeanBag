import {
  AppError,
  ERROR_CODES,
  YOUTUBE_MUSIC_CATEGORY_ID,
  type MediaFilter,
  type MediaItem,
} from '@bigbeanbag/shared';
import { env, youtubeConfigured } from '../env';
import { cached } from '../lib/cache';

const API_ROOT = 'https://www.googleapis.com/youtube/v3';
const SEARCH_TTL_MS = 1000 * 60 * 60 * 6;
const VIDEO_TTL_MS = 1000 * 60 * 60 * 24 * 7;

type Thumbnails = {
  default?: { url?: string };
  medium?: { url?: string };
  high?: { url?: string };
};

type SearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: Thumbnails;
    categoryId?: string;
  };
};

type VideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: Thumbnails;
    categoryId?: string;
  };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
};

type YoutubeErrorBody = {
  error?: { message?: string; errors?: { reason?: string }[] };
};

const call = async <T>(path: string, params: Record<string, string>): Promise<T> => {
  if (!youtubeConfigured) {
    throw new AppError(
      ERROR_CODES.MEDIA_UNAVAILABLE,
      'YouTube search is not configured on this server yet',
      503,
    );
  }

  const url = new URL(`${API_ROOT}/${path}`);
  url.searchParams.set('key', env.YOUTUBE_API_KEY!);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as YoutubeErrorBody | null;
    const reason = body?.error?.errors?.[0]?.reason;

    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      throw new AppError(
        ERROR_CODES.MEDIA_UNAVAILABLE,
        'The YouTube search quota is used up for today. Paste a link instead, or try again tomorrow.',
        503,
      );
    }

    throw new AppError(ERROR_CODES.MEDIA_UNAVAILABLE, 'YouTube is not answering right now', 502);
  }

  return (await response.json()) as T;
};

export const parseIsoDuration = (value?: string): number => {
  if (!value) return 0;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return 0;

  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return (
    (Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000
  );
};

const thumbnailOf = (thumbnails?: Thumbnails) =>
  thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;

const toMediaItem = (video: VideoItem): MediaItem | null => {
  const youtubeId = video.id;
  const title = video.snippet?.title;
  const durationMs = parseIsoDuration(video.contentDetails?.duration);
  const thumbnail = thumbnailOf(video.snippet?.thumbnails);

  if (!youtubeId || !title || !durationMs || !thumbnail) return null;

  return {
    source: 'YOUTUBE',
    youtubeId,
    spotifyId: null,
    title,
    artist: video.snippet?.channelTitle ?? null,
    thumbnail,
    durationMs,
    mediaType: video.snippet?.categoryId === YOUTUBE_MUSIC_CATEGORY_ID ? 'MUSIC' : 'VIDEO',
  };
};

export const searchYoutube = async (
  query: string,
  filter: MediaFilter,
  limit: number,
): Promise<MediaItem[]> => {
  const cacheKey = `yt:search:${filter}:${limit}:${query.trim().toLowerCase()}`;

  return cached(cacheKey, 'youtube-search', SEARCH_TTL_MS, async () => {
    const params: Record<string, string> = {
      part: 'snippet',
      type: 'video',
      maxResults: String(Math.min(limit * 2, 25)),
      q: query,
      videoEmbeddable: 'true',
      safeSearch: 'none',
    };

    if (filter === 'MUSIC') params.videoCategoryId = YOUTUBE_MUSIC_CATEGORY_ID;

    const search = await call<{ items?: SearchItem[] }>('search', params);
    const ids = (search.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    if (!ids.length) return [];

    const videos = await call<{ items?: VideoItem[] }>('videos', {
      part: 'snippet,contentDetails,status',
      id: ids.join(','),
    });

    return (videos.items ?? [])
      .filter((video) => video.status?.embeddable !== false)
      .map(toMediaItem)
      .filter((item): item is MediaItem => {
        if (!item) return false;
        if (filter === 'MUSIC') return item.mediaType === 'MUSIC';
        if (filter === 'VIDEO') return item.mediaType === 'VIDEO';
        return true;
      })
      .slice(0, limit);
  });
};

export const getYoutubeItem = async (youtubeId: string): Promise<MediaItem> =>
  cached(`yt:video:${youtubeId}`, 'youtube-video', VIDEO_TTL_MS, async () => {
    const data = await call<{ items?: VideoItem[] }>('videos', {
      part: 'snippet,contentDetails,status',
      id: youtubeId,
    });

    const video = data.items?.[0];
    if (!video || !video.id) {
      throw new AppError(ERROR_CODES.MEDIA_UNAVAILABLE, 'That YouTube video could not be found', 404);
    }

    if (video.status?.embeddable === false) {
      throw new AppError(
        ERROR_CODES.MEDIA_NOT_EMBEDDABLE,
        'The video owner disabled embedding, so it cannot play inside BigBeanBag.',
        422,
      );
    }

    if (video.status?.privacyStatus && !['public', 'unlisted'].includes(video.status.privacyStatus)) {
      throw new AppError(ERROR_CODES.MEDIA_UNAVAILABLE, 'That video is not publicly watchable', 404);
    }

    const item = toMediaItem(video);
    if (!item) {
      throw new AppError(ERROR_CODES.MEDIA_UNAVAILABLE, 'That video has no playable metadata', 422);
    }

    return item;
  });
