import { describe, expect, it } from 'vitest';
import { CreatePollSchema, CreateRoomSchema, RoomCodeSchema } from '../index';

describe('room code', () => {
  it('accepts uppercase codes from the room alphabet', () => {
    expect(RoomCodeSchema.parse('AB23CD')).toBe('AB23CD');
  });

  it('normalizes lowercase and trims whitespace', () => {
    expect(RoomCodeSchema.parse('  ab23cd ')).toBe('AB23CD');
  });

  it('rejects ambiguous characters', () => {
    expect(RoomCodeSchema.safeParse('AB10CD').success).toBe(false);
    expect(RoomCodeSchema.safeParse('ABC').success).toBe(false);
  });
});

describe('room settings', () => {
  it('requires a sensible name and a known visibility', () => {
    expect(CreateRoomSchema.safeParse({ name: 'Lo-fi lounge', visibility: 'PUBLIC' }).success).toBe(true);
    expect(CreateRoomSchema.safeParse({ name: 'x', visibility: 'PUBLIC' }).success).toBe(false);
    expect(CreateRoomSchema.safeParse({ name: 'Lo-fi lounge', visibility: 'SECRET' }).success).toBe(false);
  });
});

describe('poll input', () => {
  it('requires between two and six options', () => {
    expect(CreatePollSchema.safeParse({ question: 'Which track?', options: ['A', 'B'] }).success).toBe(true);
    expect(CreatePollSchema.safeParse({ question: 'Which track?', options: ['A'] }).success).toBe(false);
  });
});
