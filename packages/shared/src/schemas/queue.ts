import { z } from 'zod';
import { IdSchema } from './common';
import { MediaItemSchema, MediaTypeSchema, MediaSourceSchema } from './media';

export const QueueStatusSchema = z.enum(['QUEUED', 'PLAYING', 'PLAYED']);
export type QueueStatus = z.infer<typeof QueueStatusSchema>;

export const AddQueueItemSchema = MediaItemSchema;
export type AddQueueItemInput = z.infer<typeof AddQueueItemSchema>;

export const QueueItemSchema = z.object({
  id: IdSchema,
  roomId: IdSchema,
  source: MediaSourceSchema,
  youtubeId: z.string(),
  spotifyId: z.string().nullable(),
  title: z.string(),
  artist: z.string().nullable(),
  thumbnail: z.string(),
  durationMs: z.number().int(),
  mediaType: MediaTypeSchema,
  status: QueueStatusSchema,
  addedBy: z.object({
    id: IdSchema,
    name: z.string(),
  }),
  createdAt: z.string(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const RemoveQueueItemSchema = z.object({
  itemId: IdSchema,
});
export type RemoveQueueItemInput = z.infer<typeof RemoveQueueItemSchema>;

export const QueueMoveSchema = z.object({
  itemId: IdSchema,
  toIndex: z.number().int().nonnegative(),
});
export type QueueMoveInput = z.infer<typeof QueueMoveSchema>;

export const QueueAutoplaySchema = z.object({
  enabled: z.boolean(),
});
export type QueueAutoplayInput = z.infer<typeof QueueAutoplaySchema>;

export const QueueUpdatedSchema = z.object({
  items: z.array(QueueItemSchema),
});
export type QueueUpdated = z.infer<typeof QueueUpdatedSchema>;
