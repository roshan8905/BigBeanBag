import { describe, expect, it } from 'vitest';
import { parseIsoDuration } from './services/youtube';
import { resolveMedia } from './services/media';

describe('youtube durations', () => {
  it('parses ISO 8601 durations into milliseconds', () => {
    expect(parseIsoDuration('PT3M40S')).toBe(220_000);
    expect(parseIsoDuration('PT1H2M3S')).toBe(3_723_000);
    expect(parseIsoDuration('PT45S')).toBe(45_000);
    expect(parseIsoDuration('P1DT1S')).toBe(86_401_000);
  });

  it('returns zero for missing or malformed durations', () => {
    expect(parseIsoDuration(undefined)).toBe(0);
    expect(parseIsoDuration('')).toBe(0);
    expect(parseIsoDuration('nonsense')).toBe(0);
  });
});

describe('media resolution guard rails', () => {
  it('rejects unsupported domains before any network call', async () => {
    await expect(resolveMedia('https://vimeo.com/123456')).rejects.toMatchObject({
      code: 'LINK_UNSUPPORTED',
    });
  });

  it('rejects spotify albums before any network call', async () => {
    await expect(
      resolveMedia('https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT'),
    ).rejects.toMatchObject({ code: 'SPOTIFY_UNSUPPORTED' });
  });
});
