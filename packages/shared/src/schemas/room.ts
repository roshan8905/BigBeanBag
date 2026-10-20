import { z } from 'zod';
import { ChatBodySchema, DisplayNameSchema, IdSchema, RoomCodeSchema } from './common';
import { PlaybackStateSchema } from './playback';
import { QueueItemSchema } from './queue';
import { ChatMessageSchema, ReactionSummarySchema } from './chat';
import { BattleSchema, PollSchema } from './poll';
import { RoleSchema } from './user';

export const VisibilitySchema = z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const RoomSettingsSchema = z.object({
  name: DisplayNameSchema,
  visibility: VisibilitySchema,
});
export type RoomSettingsInput = z.infer<typeof RoomSettingsSchema>;

export const CreateRoomSchema = RoomSettingsSchema;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const UpdateRoomSchema = RoomSettingsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Nothing to update' },
);
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;

export const JoinRoomSchema = z.object({
  code: RoomCodeSchema,
});
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

export const RoomSchema = z.object({
  id: IdSchema,
  code: z.string(),
  name: z.string(),
  visibility: VisibilitySchema,
  ownerId: IdSchema,
  locked: z.boolean(),
  chatRestricted: z.boolean(),
  addRestricted: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Room = z.infer<typeof RoomSchema>;

export const RoomSummarySchema = RoomSchema.extend({
  ownerName: z.string(),
  role: RoleSchema.nullable(),
});
export type RoomSummary = z.infer<typeof RoomSummarySchema>;

export const RoomListSchema = z.object({
  mine: z.array(RoomSummarySchema),
  publicRooms: z.array(RoomSummarySchema),
});
export type RoomList = z.infer<typeof RoomListSchema>;

export const RoomMemberSchema = z.object({
  userId: IdSchema,
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: RoleSchema,
  muted: z.boolean(),
  joinedAt: z.string(),
});
export type RoomMember = z.infer<typeof RoomMemberSchema>;

export const RoomDetailSchema = z.object({
  room: RoomSchema,
  ownerName: z.string(),
  role: RoleSchema.nullable(),
  members: z.array(RoomMemberSchema),
});
export type RoomDetail = z.infer<typeof RoomDetailSchema>;

export const InviteStateSchema = z.object({
  token: z.string().nullable(),
  url: z.string().nullable(),
});
export type InviteState = z.infer<typeof InviteStateSchema>;

export const RoomSnapshotSchema = z.object({
  room: RoomSchema,
  me: z.object({
    userId: IdSchema,
    role: RoleSchema,
  }),
  members: z.array(RoomMemberSchema),
  queue: z.array(QueueItemSchema),
  playback: PlaybackStateSchema,
  chat: z.array(ChatMessageSchema),
  reactions: z.array(ReactionSummarySchema),
  poll: PollSchema.nullable(),
  battle: BattleSchema.nullable(),
  serverNow: z.number(),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const InviteSchema = z.object({
  token: z.string(),
  url: z.string(),
  qrDataUrl: z.string().optional(),
});
export type Invite = z.infer<typeof InviteSchema>;

export const InviteTokenParamsSchema = z.object({
  token: z.string().min(8).max(128),
});
export type InviteTokenParams = z.infer<typeof InviteTokenParamsSchema>;

export const PromoteMemberSchema = z.object({
  userId: IdSchema,
});
export type PromoteMemberInput = z.infer<typeof PromoteMemberSchema>;

export const ModerationActionSchema = z.enum(['kick', 'ban', 'unban', 'mute', 'unmute']);
export type ModerationAction = z.infer<typeof ModerationActionSchema>;

export const ModerationInputSchema = z.object({
  userId: IdSchema,
  action: ModerationActionSchema,
  reason: ChatBodySchema.optional(),
});
export type ModerationInput = z.infer<typeof ModerationInputSchema>;

export const RoomRestrictionSchema = z.object({
  chatRestricted: z.boolean().optional(),
  addRestricted: z.boolean().optional(),
  locked: z.boolean().optional(),
});
export type RoomRestrictionInput = z.infer<typeof RoomRestrictionSchema>;

export const LockRoomSchema = z.object({
  locked: z.boolean(),
});
export type LockRoomInput = z.infer<typeof LockRoomSchema>;
