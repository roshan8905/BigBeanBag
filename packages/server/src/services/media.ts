import {
  AppError,
  ERROR_CODES,
  parseMediaLink,
  type MediaFilter,
  type ResolvedMedia,
} from '@bigbeanbag/shared';
import { getYoutubeItem, searchYoutube } from './youtube';
import { matchSpotifyTrack, resolveSpotifyTrack } from './spotify';

export const searchMedia = (query: string, filter: MediaFilter, limit: number) =>
  searchYoutube(query, filter, limit);

export const resolveMedia = async (rawUrl: string): Promise<ResolvedMedia> => {
  const parsed = parseMediaLink(rawUrl);

  if (parsed.source === 'YOUTUBE') {
    const item = await getYoutubeItem(parsed.youtubeId);
    return { item, needsConfirmation: false, originalUrl: rawUrl };
  }

  const track = await resolveSpotifyTrack(parsed.spotifyId);
  const item = await matchSpotifyTrack(track);

  if (!item) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'No playable match found for that Spotify track', 404);
  }

  return { item, needsConfirmation: true, originalUrl: rawUrl };
};
