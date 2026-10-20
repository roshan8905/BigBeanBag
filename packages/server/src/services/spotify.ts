import { AppError, ERROR_CODES, type MediaItem, type SpotifyTrackMeta } from '@bigbeanbag/shared';
import { env, spotifyConfigured } from '../env';
import { cached } from '../lib/cache';
import { searchYoutube } from './youtube';

const TRACK_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MATCH_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_ROOT = 'https://api.spotify.com/v1';

type SpotifyApiTrack = {
  id: string;
  name: string;
  duration_ms?: number;
  artists?: { name?: string }[];
  album?: { images?: { url?: string }[] };
};

type SpotifyOEmbed = {
  title?: string;
  thumbnail_url?: string;
  author_name?: string;
};

let tokenCache: { token: string; expiresAt: number } | null = null;

const getAccessToken = async () => {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;

  const credentials = Buffer.from(
    `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`,
  ).toString('base64');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new AppError(ERROR_CODES.MEDIA_UNAVAILABLE, 'Spotify did not hand out an access token', 502);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new AppError(ERROR_CODES.MEDIA_UNAVAILABLE, 'Spotify returned an empty token', 502);
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 3600) - 60, 60) * 1000,
  };

  return tokenCache.token;
};

const fetchFromApi = async (spotifyId: string): Promise<SpotifyTrackMeta> => {
  const token = await getAccessToken();
  const response = await fetch(`${API_ROOT}/tracks/${spotifyId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new AppError(ERROR_CODES.MEDIA_UNAVAILABLE, 'That Spotify track could not be resolved', 502);
  }

  const track = (await response.json()) as SpotifyApiTrack;
  const artist = track.artists?.map((entry) => entry.name).filter(Boolean).join(', ') || null;

  return {
    id: spotifyId,
    title: track.name,
    artist: artist ?? 'Unknown artist',
    thumbnail: track.album?.images?.[0]?.url ?? null,
    durationMs: track.duration_ms ?? null,
  };
};

const fetchFromOEmbed = async (spotifyId: string): Promise<SpotifyTrackMeta> => {
  const target = encodeURIComponent(`https://open.spotify.com/track/${spotifyId}`);
  const response = await fetch(`https://open.spotify.com/oembed?url=${target}`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new AppError(ERROR_CODES.MEDIA_UNAVAILABLE, 'That Spotify track could not be resolved', 502);
  }

  const data = (await response.json()) as SpotifyOEmbed;
  if (!data.title) {
    throw new AppError(ERROR_CODES.MEDIA_UNAVAILABLE, 'Spotify sent no track title', 502);
  }

  return {
    id: spotifyId,
    title: data.title,
    artist: data.author_name ?? 'Unknown artist',
    thumbnail: data.thumbnail_url ?? null,
    durationMs: null,
  };
};

export const resolveSpotifyTrack = async (spotifyId: string): Promise<SpotifyTrackMeta> =>
  cached(`spotify:track:${spotifyId}`, 'spotify-track', TRACK_TTL_MS, async () => {
    if (spotifyConfigured) {
      try {
        return await fetchFromApi(spotifyId);
      } catch {
        return fetchFromOEmbed(spotifyId);
      }
    }

    return fetchFromOEmbed(spotifyId);
  });

export const matchSpotifyTrack = async (track: SpotifyTrackMeta): Promise<MediaItem> =>
  cached(`spotify:match:${track.id}`, 'spotify-match', MATCH_TTL_MS, async () => {
    const results = await searchYoutube(`${track.title} ${track.artist}`, 'ALL', 5);
    const best =
      results.find((item) => item.mediaType === 'MUSIC') ?? results[0] ?? null;

    if (!best) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        'No playable YouTube match was found for that Spotify track',
        404,
      );
    }

    return {
      source: 'SPOTIFY_MATCHED',
      youtubeId: best.youtubeId,
      spotifyId: track.id,
      title: track.title,
      artist: track.artist,
      thumbnail:
        best.thumbnail || track.thumbnail || `https://i.ytimg.com/vi/${best.youtubeId}/mqdefault.jpg`,
      durationMs: best.durationMs,
      mediaType: best.mediaType,
    };
  });
