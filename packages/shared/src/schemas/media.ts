import { z } from 'zod';
import { MAX_QUEUE_TITLE_LENGTH, MAX_SEARCH_RESULTS } from '../constants';

export const MediaTypeSchema = z.enum(['MUSIC', 'VIDEO']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const MediaFilterSchema = z.enum(['ALL', 'MUSIC', 'VIDEO']);
export type MediaFilter = z.infer<typeof MediaFilterSchema>;

export const MediaSourceSchema = z.enum(['YOUTUBE', 'SPOTIFY_MATCHED']);
export type MediaSource = z.infer<typeof MediaSourceSchema>;

export const MediaItemSchema = z.object({
  source: MediaSourceSchema,
  youtubeId: z.string().min(1).max(32),
  spotifyId: z.string().min(1).max(64).nullable(),
  title: z.string().min(1).max(MAX_QUEUE_TITLE_LENGTH),
  artist: z.string().max(MAX_QUEUE_TITLE_LENGTH).nullable(),
  thumbnail: z.string().url(),
  durationMs: z.number().int().positive(),
  mediaType: MediaTypeSchema,
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

export const SearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(120),
  filter: MediaFilterSchema.default('ALL'),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_RESULTS).default(MAX_SEARCH_RESULTS),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const ResolveLinkSchema = z.object({
  url: z.string().trim().min(1).max(2048),
});
export type ResolveLinkInput = z.infer<typeof ResolveLinkSchema>;

export const ResolvedMediaSchema = z.object({
  item: MediaItemSchema,
  needsConfirmation: z.boolean(),
  originalUrl: z.string(),
});
export type ResolvedMedia = z.infer<typeof ResolvedMediaSchema>;

export const SpotifyTrackMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  thumbnail: z.string().url().nullable(),
  durationMs: z.number().int().positive().nullable(),
});
export type SpotifyTrackMeta = z.infer<typeof SpotifyTrackMetaSchema>;

