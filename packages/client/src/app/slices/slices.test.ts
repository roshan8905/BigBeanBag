import { describe, expect, it } from 'vitest';
import type { Battle, ChatMessage, Poll, QueueItem, RoomSnapshot } from '@bigbeanbag/shared';
import {
  battleEnded,
  battleReducer,
  battlesLoaded,
  battleUpdated,
  clearBattle,
} from '@/app/slices/battleSlice';
import {
  chatAppended,
  chatLoaded,
  chatReducer,
  clearChat,
  reactionsUpdated,
} from '@/app/slices/chatSlice';
import { clearPoll, pollReducer, pollsLoaded, pollUpdated } from '@/app/slices/pollSlice';
import { clearQueue, queueReducer, queueUpdated } from '@/app/slices/queueSlice';
import {
  connectionChanged,
  errorReceived,
  membersReceived,
  presenceReceived,
  resetRoom,
  roleReceived,
  roomReducer,
  roomReceived,
  snapshotReceived,
} from '@/app/slices/roomSlice';

const makeItem = (id: string): QueueItem => ({
  id,
  roomId: 'room-1',
  source: 'YOUTUBE',
  youtubeId: 'dQw4w9WgXcQ',
  spotifyId: null,
  title: `Song ${id}`,
  artist: 'Tester',
  thumbnail: 'https://example.com/cover.jpg',
  durationMs: 180_000,
  mediaType: 'MUSIC',
  status: 'QUEUED',
  addedBy: { id: 'user-1', name: 'Ada' },
  createdAt: '2026-01-01T00:00:00.000Z',
});

const makeMessage = (id: string): ChatMessage => ({
  id,
  userId: 'user-1',
  name: 'Ada',
  avatarUrl: null,
  body: `Message ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const makeBattle = (
  id: string,
  status: Battle['status'],
  createdAt = '2026-01-01T00:00:00.000Z',
): Battle => ({
  id,
  status,
  endsAt: '2026-01-01T00:01:00.000Z',
  createdAt,
  entries: [
    {
      itemId: 'item-a',
      title: 'Song A',
      artist: 'Tester',
      thumbnail: 'https://example.com/a.jpg',
      votes: 2,
    },
    {
      itemId: 'item-b',
      title: 'Song B',
      artist: 'Tester',
      thumbnail: 'https://example.com/b.jpg',
      votes: 1,
    },
  ],
  myVoteItemId: 'item-a',
  winnerItemId: status === 'CLOSED' ? 'item-a' : null,
});

const makePoll = (
  id: string,
  status: Poll['status'],
  createdAt = '2026-01-01T00:00:00.000Z',
): Poll => ({
  id,
  question: 'Which song next?',
  status,
  createdBy: 'user-1',
  options: [
    { id: 'option-1', label: 'Song A', votes: 1 },
    { id: 'option-2', label: 'Song B', votes: 0 },
  ],
  totalVotes: 1,
  myVoteOptionId: 'option-1',
  createdAt,
});

const snapshot: RoomSnapshot = {
  room: {
    id: 'room-1',
    code: 'ABCD1234',
    name: 'Test room',
    visibility: 'PUBLIC',
    ownerId: 'user-1',
    locked: false,
    chatRestricted: false,
    addRestricted: false,
    autoplay: false,
    memberCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  me: { userId: 'user-1', role: 'OWNER' },
  members: [
    {
      userId: 'user-1',
      name: 'Ada',
      avatarUrl: null,
      role: 'OWNER',
      muted: false,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  queue: [makeItem('item-a')],
  playback: {
    currentItemId: null,
    status: 'IDLE',
    positionMs: 0,
    updatedAt: 1_000_000,
    durationMs: null,
  },
  chat: [],
  reactions: [],
  polls: [],
  battles: [],
  serverNow: 1_000_000,
};

describe('roomSlice', () => {
  it('hydrates a snapshot and tracks the server clock offset', () => {
    const state = roomReducer(undefined, snapshotReceived({ snapshot, receivedAt: 999_000 }));

    expect(state.connection).toBe('live');
    expect(state.serverOffsetMs).toBe(1000);
    expect(state.room?.code).toBe('ABCD1234');
    expect(state.me?.role).toBe('OWNER');
  });

  it('updates roles, presence, errors, and resets', () => {
    let state = roomReducer(undefined, snapshotReceived({ snapshot, receivedAt: 999_000 }));

    state = roomReducer(state, roleReceived('HOST'));
    expect(state.me?.role).toBe('HOST');

    state = roomReducer(state, presenceReceived(['user-1', 'user-2']));
    expect(state.presentIds).toEqual(['user-1', 'user-2']);

    state = roomReducer(state, roomReceived({ ...snapshot.room, locked: true }));
    expect(state.room?.locked).toBe(true);

    state = roomReducer(state, membersReceived([]));
    expect(state.members).toEqual([]);

    state = roomReducer(state, errorReceived('Nope'));
    expect(state.error).toBe('Nope');

    state = roomReducer(state, connectionChanged('error'));
    expect(state.connection).toBe('error');

    state = roomReducer(state, resetRoom());
    expect(state).toMatchObject({ room: null, me: null, connection: 'idle', error: '' });
  });
});

describe('queueSlice', () => {
  it('replaces and clears the queue', () => {
    let state = queueReducer(undefined, queueUpdated([makeItem('a'), makeItem('b')]));
    expect(state.items.map((item) => item.id)).toEqual(['a', 'b']);

    state = queueReducer(state, clearQueue());
    expect(state.items).toEqual([]);
  });
});

describe('chatSlice', () => {
  it('loads history and caps appended messages at 200', () => {
    let state = chatReducer(
      undefined,
      chatLoaded({ messages: [makeMessage('seed')], reactions: [{ emoji: '🔥', count: 2 }] }),
    );

    expect(state.messages).toHaveLength(1);
    expect(state.reactions[0]?.emoji).toBe('🔥');

    for (let index = 0; index < 205; index += 1) {
      state = chatReducer(state, chatAppended(makeMessage(`m${index}`)));
    }

    expect(state.messages).toHaveLength(200);
    expect(state.messages[0]?.id).toBe('m5');

    state = chatReducer(state, reactionsUpdated([]));
    expect(state.reactions).toEqual([]);

    state = chatReducer(state, clearChat());
    expect(state.messages).toEqual([]);
  });
});

describe('poll and battle slices', () => {
  it('loads multiple polls, updates them by id, and clears them', () => {
    let state = pollReducer(
      undefined,
      pollsLoaded([makePoll('poll-1', 'OPEN')]),
    );
    expect(state.polls.map((poll) => poll.id)).toEqual(['poll-1']);

    state = pollReducer(
      state,
      pollUpdated(makePoll('poll-2', 'OPEN', '2026-01-01T00:00:01.000Z')),
    );
    expect(state.polls.map((poll) => poll.id)).toEqual(['poll-1', 'poll-2']);

    state = pollReducer(state, pollUpdated(makePoll('poll-1', 'CLOSED')));
    expect(state.polls).toHaveLength(2);
    expect(state.polls.find((poll) => poll.id === 'poll-1')?.status).toBe('CLOSED');

    state = pollReducer(state, clearPoll());
    expect(state.polls).toEqual([]);
  });

  it('loads multiple battles, tracks endings by id, and clears them', () => {
    let state = battleReducer(
      undefined,
      battlesLoaded([makeBattle('battle-1', 'OPEN')]),
    );
    expect(state.battles.map((battle) => battle.id)).toEqual(['battle-1']);

    state = battleReducer(state, battleEnded(makeBattle('battle-1', 'CLOSED')));
    expect(state.battles[0]?.winnerItemId).toBe('item-a');

    state = battleReducer(
      state,
      battleUpdated(makeBattle('battle-2', 'OPEN', '2026-01-01T00:00:01.000Z')),
    );
    expect(state.battles.map((battle) => battle.id)).toEqual(['battle-1', 'battle-2']);

    state = battleReducer(state, clearBattle());
    expect(state.battles).toEqual([]);
  });
});
