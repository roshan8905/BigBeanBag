import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration } from '@/lib/format';

describe('formatDuration', () => {
  it('formats whole minutes and pads seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_600_000)).toBe('60:00');
  });

  it('clamps negative and sub-second values', () => {
    expect(formatDuration(-500)).toBe('0:00');
    expect(formatDuration(999)).toBe('0:00');
    expect(formatDuration(1_500)).toBe('0:01');
  });
});

describe('formatClock', () => {
  it('renders a non-empty local time', () => {
    const label = formatClock(new Date('2026-01-02T15:04:00Z').getTime());
    expect(label.length).toBeGreaterThan(0);
    expect(label).toMatch(/\d/);
  });
});
