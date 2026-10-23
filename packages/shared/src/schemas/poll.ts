import { z } from 'zod';
import { MAX_POLL_OPTIONS, MIN_POLL_OPTIONS } from '../constants';
import { IdSchema } from './common';

export const PollStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type PollStatus = z.infer<typeof PollStatusSchema>;

export const CreatePollSchema = z.object({
  question: z.string().trim().min(3).max(140),
  options: z
    .array(z.string().trim().min(1).max(60))
    .min(MIN_POLL_OPTIONS)
    .max(MAX_POLL_OPTIONS),
});
export type CreatePollInput = z.infer<typeof CreatePollSchema>;

export const PollOptionSchema = z.object({
  id: IdSchema,
  label: z.string(),
  votes: z.number().int().nonnegative(),
});
export type PollOption = z.infer<typeof PollOptionSchema>;

export const PollSchema = z.object({
  id: IdSchema,
  question: z.string(),
  status: PollStatusSchema,
  createdBy: z.string(),
  options: z.array(PollOptionSchema),
  totalVotes: z.number().int().nonnegative(),
  myVoteOptionId: z.string().nullable(),
  createdAt: z.string(),
});
export type Poll = z.infer<typeof PollSchema>;

export const VotePollSchema = z.object({
  pollId: IdSchema,
  optionId: IdSchema,
});
export type VotePollInput = z.infer<typeof VotePollSchema>;

export const ClosePollSchema = z.object({
  pollId: IdSchema,
});
export type ClosePollInput = z.infer<typeof ClosePollSchema>;

export const CreateBattleSchema = z
  .object({
    itemAId: IdSchema,
    itemBId: IdSchema,
    durationSec: z.number().int().min(15).max(300).default(60),
  })
  .refine((value) => value.itemAId !== value.itemBId, {
    message: 'Pick two different songs',
    path: ['itemBId'],
  });
export type CreateBattleInput = z.infer<typeof CreateBattleSchema>;

export const BattleVoteSchema = z.object({
  battleId: IdSchema,
  itemId: IdSchema,
});
export type BattleVoteInput = z.infer<typeof BattleVoteSchema>;

export const BattleStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type BattleStatus = z.infer<typeof BattleStatusSchema>;

export const BattleEntrySchema = z.object({
  itemId: IdSchema,
  title: z.string(),
  artist: z.string().nullable(),
  thumbnail: z.string(),
  votes: z.number().int().nonnegative(),
});

export const BattleSchema = z.object({
  id: IdSchema,
  status: BattleStatusSchema,
  endsAt: z.string(),
  createdAt: z.string(),
  entries: z.array(BattleEntrySchema).length(2),
  myVoteItemId: z.string().nullable(),
  winnerItemId: z.string().nullable(),
});
export type Battle = z.infer<typeof BattleSchema>;
