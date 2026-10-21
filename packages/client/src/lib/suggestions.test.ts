import { describe, expect, it } from 'vitest';
import { buildSuggestionQueries, cleanArtistName } from '@/lib/suggestions';

describe('queue suggestions', () => {
  it('cleans common YouTube channel suffixes', () => {
    expect(cleanArtistName('Frank Ocean - Topic')).toBe('Frank Ocean');
    expect(cleanArtistName('DrakeVEVO')).toBe('Drake');
    expect(cleanArtistName('  Radiohead  ')).toBe('Radiohead');
  });

  it('ignores empty and generic channel names', () => {
    expect(cleanArtistName(null)).toBe('');
    expect(cleanArtistName('Various Artists')).toBe('');
    expect(cleanArtistName('YouTube')).toBe('');
  });

  it('builds queries from the newest unique queue artists', () => {
    expect(
      buildSuggestionQueries([
        { artist: 'Artist A - Topic' },
        { artist: 'Artist B' },
        { artist: 'Artist A' },
      ]),
    ).toEqual([
      'Artist A songs',
      'Artist A mix',
      'Artist A live',
      'Artist B songs',
      'Artist B mix',
      'Artist B live',
    ]);
  });

  it('returns no queries when the queue has no usable artists', () => {
    expect(buildSuggestionQueries([{ artist: null }, { artist: 'Various Artists' }])).toEqual([]);
  });
});
