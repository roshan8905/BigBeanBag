import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { parseMediaLink } from './links';

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error('Expected the link parser to throw');
};

describe('youtube links', () => {
  const id = 'dQw4w9WgXcQ';

  it('accepts watch, short, mobile, music, embed, and youtu.be links', () => {
    const links = [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
    ];

    for (const link of links) {
      expect(parseMediaLink(link)).toEqual({ source: 'YOUTUBE', youtubeId: id });
    }
  });

  it('rejects playlist and malformed video links', () => {
    expectCode(() => parseMediaLink('https://www.youtube.com/playlist?list=PL123'), 'LINK_UNSUPPORTED');
    expectCode(() => parseMediaLink('https://www.youtube.com/watch?v=short'), 'LINK_UNSUPPORTED');
    expectCode(() => parseMediaLink('https://youtu.be/'), 'LINK_UNSUPPORTED');
  });
});

describe('spotify links', () => {
  const trackId = '4cOdK2wGLETKBW3PvgPWqT';

  it('accepts track links with locale prefixes and query strings', () => {
    expect(parseMediaLink(`https://open.spotify.com/track/${trackId}`)).toEqual({
      source: 'SPOTIFY',
      spotifyId: trackId,
    });
    expect(parseMediaLink(`https://open.spotify.com/intl-de/track/${trackId}?si=xyz`)).toEqual({
      source: 'SPOTIFY',
      spotifyId: trackId,
    });
  });

  it('rejects albums, playlists, episodes, shows, and artists', () => {
    for (const kind of ['album', 'playlist', 'episode', 'show', 'artist']) {
      expectCode(() => parseMediaLink(`https://open.spotify.com/${kind}/${trackId}`), 'SPOTIFY_UNSUPPORTED');
    }
  });

  it('rejects malformed track ids', () => {
    expectCode(() => parseMediaLink('https://open.spotify.com/track/too-short'), 'LINK_UNSUPPORTED');
  });
});

describe('domain allow-list', () => {
  it('rejects every other host', () => {
    const blocked = [
      'https://vimeo.com/123456',
      'https://soundcloud.com/artist/track',
      'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
      'https://spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      'javascript:alert(1)',
      'ftp://youtube.com/watch?v=dQw4w9WgXcQ',
      'not a url',
    ];

    for (const link of blocked) {
      expectCode(() => parseMediaLink(link), 'LINK_UNSUPPORTED');
    }
  });
});
