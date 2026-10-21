import type { Prisma, ChatMessage, Reaction, Room, RoomMember, User } from '@prisma/client';
import type {
  ChatMessage as ChatMessageDto,
  Reaction as ReactionDto,
  Role,
  Room as RoomDto,
  RoomDetail,
  RoomMember as RoomMemberDto,
  RoomSummary,
} from '@bigbeanbag/shared';

export const roomMetaInclude = {
  owner: { select: { name: true } },
  _count: { select: { members: true } },
} satisfies Prisma.RoomInclude;

export const roomDetailInclude = {
  ...roomMetaInclude,
  members: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'asc' },
  },
} satisfies Prisma.RoomInclude;

export type RoomWithMeta = Prisma.RoomGetPayload<{ include: typeof roomMetaInclude }>;
export type RoomWithDetail = Prisma.RoomGetPayload<{ include: typeof roomDetailInclude }>;

export const toRoomDto = (room: RoomWithMeta): RoomDto => ({
  id: room.id,
  code: room.code,
  name: room.name,
  visibility: room.visibility,
  ownerId: room.ownerId,
  locked: room.locked,
  chatRestricted: room.chatRestricted,
  addRestricted: room.addRestricted,
  autoplay: room.autoplay,
  memberCount: room._count.members,
  createdAt: room.createdAt.toISOString(),
});

export const toRoomSummary = (room: RoomWithMeta, role: Role | null): RoomSummary => ({
  ...toRoomDto(room),
  ownerName: room.owner.name,
  role,
});

type MemberWithUser = RoomMember & { user: Pick<User, 'id' | 'name' | 'avatarUrl'> };

export const toMemberDto = (member: MemberWithUser): RoomMemberDto => ({
  userId: member.user.id,
  name: member.user.name,
  avatarUrl: member.user.avatarUrl,
  role: member.role,
  muted: member.muted,
  joinedAt: member.joinedAt.toISOString(),
});

export const toRoomDetail = (room: RoomWithDetail, role: Role | null): RoomDetail => ({
  room: toRoomDto(room as RoomWithMeta),
  ownerName: room.owner.name,
  role,
  members: room.members.map(toMemberDto),
});

export type RoomRecord = Room;

type ChatWithUser = ChatMessage & { user: Pick<User, 'id' | 'name' | 'avatarUrl'> };

export const toChatMessageDto = (message: ChatWithUser): ChatMessageDto => ({
  id: message.id,
  userId: message.user.id,
  name: message.user.name,
  avatarUrl: message.user.avatarUrl,
  body: message.body,
  createdAt: message.createdAt.toISOString(),
});

type ReactionWithUser = Reaction & { user: Pick<User, 'id' | 'name'> };

export const toReactionDto = (reaction: ReactionWithUser): ReactionDto => ({
  id: reaction.id,
  userId: reaction.user.id,
  name: reaction.user.name,
  emoji: reaction.emoji,
  createdAt: reaction.createdAt.toISOString(),
});
