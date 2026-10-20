import { describe, expect, it } from 'vitest';
import { youtubeErrorCopy } from '@/lib/youtube';

describe('youtubeErrorCopy', () => {
  it('explains embedding blocks', () => {
    expect(youtubeErrorCopy(101)).toContain('blocked playback');
    expect(youtubeErrorCopy(150)).toContain('blocked playback');
  });

  it('explains private, invalid, and unknown failures', () => {
    expect(youtubeErrorCopy(100)).toContain('private');
    expect(youtubeErrorCopy(2)).toContain('not valid');
    expect(youtubeErrorCopy(5)).toContain('cannot play');
  });
});
