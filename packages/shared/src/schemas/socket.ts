import type { ErrorCode } from '../errors';
import type { ChatMessage, Reaction, ReactionSummary } from './chat';
import type {
  AddQueueItemInput,
  QueueItem,
  QueueUpdated,
  RemoveQueueItemInput,
  VoteToggleInput,
} from './queue';
import type {
  JoinRoomInput,
  ModerationInput,
  PromoteMemberInput,
  Room,
  RoomMember,
  RoomRestrictionInput,
  RoomSnapshot,
  UpdateRoomInput,
} from './room';
import type { ClockPong, PlaybackState, PlayCommandInput, SeekCommandInput, TrackEndedInput } from './playback';
import type { Battle, BattleVoteInput, ClosePollInput, CreateBattleInput, CreatePollInput, Poll, VotePollInput } from './poll';
import type { SendChatMessageInput, SendReactionInput } from './chat';

export type AckResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

export type Ack<T = undefined> = (result: AckResult<T>) => void;

export interface ClientToServerEvents {
  'room:join': (payload: JoinRoomInput, ack: Ack<RoomSnapshot>) => void;
  'room:leave': (ack?: Ack) => void;
  'room:update': (payload: UpdateRoomInput, ack: Ack<Room>) => void;
  'room:restrict': (payload: RoomRestrictionInput, ack: Ack<Room>) => void;
  'room:delete': (ack: Ack) => void;
  'invite:rotate': (ack: Ack<{ token: string; url: string }>) => void;
  'member:promote': (payload: PromoteMemberInput, ack: Ack<RoomMember>) => void;
  'member:demote': (payload: PromoteMemberInput, ack: Ack<RoomMember>) => void;
  'moderation:act': (payload: ModerationInput, ack: Ack) => void;
  'queue:add': (payload: AddQueueItemInput, ack: Ack<QueueItem>) => void;
  'queue:vote': (payload: VoteToggleInput, ack: Ack<{ itemId: string; voted: boolean; voteCount: number }>) => void;
  'queue:remove': (payload: RemoveQueueItemInput, ack: Ack<QueueUpdated>) => void;
  'playback:play': (payload: PlayCommandInput, ack: Ack<PlaybackState>) => void;
  'playback:pause': (payload: PlayCommandInput, ack: Ack<PlaybackState>) => void;
  'playback:seek': (payload: SeekCommandInput, ack: Ack<PlaybackState>) => void;
  'playback:skip': (ack: Ack<PlaybackState>) => void;
  'playback:ended': (payload: TrackEndedInput, ack: Ack<PlaybackState>) => void;
  'chat:send': (payload: SendChatMessageInput, ack: Ack<ChatMessage>) => void;
  'reaction:send': (payload: SendReactionInput, ack: Ack) => void;
  'poll:create': (payload: CreatePollInput, ack: Ack<Poll>) => void;
  'poll:vote': (payload: VotePollInput, ack: Ack<Poll>) => void;
  'poll:close': (payload: ClosePollInput, ack: Ack<Poll>) => void;
  'battle:create': (payload: CreateBattleInput, ack: Ack<Battle>) => void;
  'battle:vote': (payload: BattleVoteInput, ack: Ack<Battle>) => void;
  'sync:ping': (payload: { t0: number }, ack: Ack<ClockPong>) => void;
}

export interface ServerToClientEvents {
  'room:snapshot': (payload: RoomSnapshot) => void;
  'room:updated': (room: Room) => void;
  'room:members': (members: RoomMember[]) => void;
  'room:role': (payload: { role: 'OWNER' | 'HOST' | 'MEMBER' }) => void;
  'room:presence': (payload: { userIds: string[] }) => void;
  'room:deleted': (payload: { roomId: string }) => void;
  'queue:updated': (payload: QueueUpdated) => void;
  'playback:updated': (state: PlaybackState) => void;
  'chat:new': (message: ChatMessage) => void;
  'reaction:new': (reaction: Reaction) => void;
  'reactions:summary': (summary: ReactionSummary[]) => void;
  'poll:updated': (poll: Poll) => void;
  'battle:updated': (battle: Battle) => void;
  'battle:ended': (battle: Battle) => void;
  'session:ended': (payload: { reason: 'kicked' | 'banned' | 'room-deleted' }) => void;
  'room:error': (payload: { code: ErrorCode; message: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  roomId?: string;
  role?: 'OWNER' | 'HOST' | 'MEMBER';
}
