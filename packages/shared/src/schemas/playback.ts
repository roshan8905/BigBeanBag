import { z } from 'zod';
import { EpochMsSchema } from './common';

export const PlaybackStatusSchema = z.enum(['PLAYING', 'PAUSED', 'IDLE']);
export type PlaybackStatus = z.infer<typeof PlaybackStatusSchema>;

export const PlaybackStateSchema = z.object({
  currentItemId: z.string().nullable(),
  status: PlaybackStatusSchema,
  positionMs: z.number().int().nonnegative(),
  updatedAt: EpochMsSchema,
  durationMs: z.number().int().nonnegative().nullable(),
});
export type PlaybackState = z.infer<typeof PlaybackStateSchema>;

export const PlayCommandSchema = z.object({
  positionMs: z.number().int().nonnegative().optional(),
});
export type PlayCommandInput = z.infer<typeof PlayCommandSchema>;

export const SeekCommandSchema = z.object({
  positionMs: z.number().int().nonnegative(),
});
export type SeekCommandInput = z.infer<typeof SeekCommandSchema>;

export const TrackEndedSchema = z.object({
  itemId: z.string(),
});
export type TrackEndedInput = z.infer<typeof TrackEndedSchema>;

export const ClockPingSchema = z.object({
  t0: z.number(),
});
export type ClockPing = z.infer<typeof ClockPingSchema>;

export const ClockPongSchema = z.object({
  t0: z.number(),
  serverNow: z.number(),
});
export type ClockPong = z.infer<typeof ClockPongSchema>;
