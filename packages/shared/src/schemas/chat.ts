import { z } from 'zod';
import { ChatBodySchema, EmojiSchema, IdSchema } from './common';

export const ChatMessageSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  name: z.string(),
  avatarUrl: z.string().nullable(),
  body: ChatBodySchema,
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SendChatMessageSchema = z.object({
  body: ChatBodySchema,
});
export type SendChatMessageInput = z.infer<typeof SendChatMessageSchema>;

export const SendReactionSchema = z.object({
  emoji: EmojiSchema,
});
export type SendReactionInput = z.infer<typeof SendReactionSchema>;

export const ReactionSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  name: z.string(),
  emoji: z.string(),
  createdAt: z.string(),
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const ReactionSummarySchema = z.object({
  emoji: z.string(),
  count: z.number().int().nonnegative(),
});
export type ReactionSummary = z.infer<typeof ReactionSummarySchema>;
