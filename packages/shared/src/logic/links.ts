import { ALLOWED_LINK_HOSTS } from '../constants';
import { AppError, ERROR_CODES } from '../errors';

export type ParsedMediaLink =
  | { source: 'YOUTUBE'; youtubeId: string }
  | { source: 'SPOTIFY'; spotifyId: string };

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_UNSUPPORTED_MESSAGE =
  'Only individual Spotify tracks are supported. Albums, playlists, and episodes cannot be queued.';

const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

const parseYoutube = (url: URL): ParsedMediaLink => {
  const segments = url.pathname.split('/').filter(Boolean);
  const path = url.pathname.replace(/\/+$/, '');
  const candidate =
    normalizeHost(url.hostname) === 'youtu.be'
      ? segments[0]
      : path === '/watch'
        ? (url.searchParams.get('v') ?? undefined)
        : segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live' || segments[0] === 'v'
          ? segments[1]
          : undefined;

  if (!candidate || !YOUTUBE_ID_PATTERN.test(candidate)) {
    throw new AppError(ERROR_CODES.LINK_UNSUPPORTED, 'Paste a link to a single YouTube video');
  }

  return { source: 'YOUTUBE', youtubeId: candidate };
};

const parseSpotify = (url: URL): ParsedMediaLink => {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0]?.startsWith('intl-')) segments.shift();

  const [kind, id] = segments;

  if (!kind) {
    throw new AppError(ERROR_CODES.SPOTIFY_UNSUPPORTED, SPOTIFY_UNSUPPORTED_MESSAGE);
  }

  if (kind !== 'track') {
    throw new AppError(ERROR_CODES.SPOTIFY_UNSUPPORTED, SPOTIFY_UNSUPPORTED_MESSAGE);
  }

  if (!id || !SPOTIFY_ID_PATTERN.test(id)) {
    throw new AppError(ERROR_CODES.LINK_UNSUPPORTED, 'That Spotify track link looks incomplete');
  }

  return { source: 'SPOTIFY', spotifyId: id };
};

export const parseMediaLink = (raw: string): ParsedMediaLink => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AppError(ERROR_CODES.LINK_UNSUPPORTED, 'Paste a full YouTube or Spotify link');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError(ERROR_CODES.LINK_UNSUPPORTED, 'Only web links from YouTube or Spotify work');
  }

  const host = normalizeHost(url.hostname);
  if (!(ALLOWED_LINK_HOSTS as readonly string[]).includes(host)) {
    throw new AppError(ERROR_CODES.LINK_UNSUPPORTED, 'Only YouTube and Spotify links are supported');
  }

  return host === 'open.spotify.com' ? parseSpotify(url) : parseYoutube(url);
};
