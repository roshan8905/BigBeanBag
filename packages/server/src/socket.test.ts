import { createServer, type Server as HttpServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  AckResult,
  Battle,
  ChatMessage,
  ClientToServerEvents,
  PlaybackState,
  Poll,
  QueueItem,
  QueueUpdated,
  ReactionSummary,
  Room,
  RoomMember,
  RoomSnapshot,
  Role,
  ServerToClientEvents,
} from '@bigbeanbag/shared';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { createSocketServer, type AppServer } from './socket';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const app = createApp();
const httpServer: HttpServer = createServer(app);
const io: AppServer = createSocketServer(httpServer);
const run = randomBytes(4).toString('hex');
const userIds: string[] = [];
const sockets: TestSocket[] = [];

let baseUrl = '';
let ownerId = '';
let guestId = '';
let memberId = '';
let roomCode = '';
let roomId = '';

const makeUser = async (label: string) => {
  const user = await prisma.user.create({
    data: {
      googleId: `test-${run}-${label}`,
      email: `test-${run}-${label}@bigbeanbag.test`,
      name: `Socket ${label}`,
    },
  });
  userIds.push(user.id);
  return user.id;
};

const connect = (userId?: string) =>
  new Promise<TestSocket>((resolve, reject) => {
    const socket = createClient(baseUrl, {
      auth: userId ? { testUserId: userId } : {},
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    }) as TestSocket;

    socket.once('connect', () => {
      sockets.push(socket);
      resolve(socket);
    });
    socket.once('connect_error', (error) => reject(error));
  });

const nextQueue = (socket: TestSocket) =>
  new Promise<QueueUpdated>((resolve) => socket.once('queue:updated', resolve));

const joinRoom = (socket: TestSocket, code: string) =>
  new Promise<AckResult<RoomSnapshot>>((resolve) => socket.emit('room:join', { code }, resolve));

const addItem = (socket: TestSocket, youtubeId: string, title: string) =>
  new Promise<AckResult<QueueItem>>((resolve) =>
    socket.emit(
      'queue:add',
      {
        source: 'YOUTUBE',
        youtubeId,
        spotifyId: null,
        title,
        artist: 'Socket Channel',
        thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        durationMs: 180_000,
        mediaType: 'MUSIC',
      },
      resolve,
    ),
  );

const remove = (socket: TestSocket, itemId: string) =>
  new Promise<AckResult<QueueUpdated>>((resolve) =>
    socket.emit('queue:remove', { itemId }, resolve),
  );

const shuffle = (socket: TestSocket) =>
  new Promise<AckResult<QueueUpdated>>((resolve) => socket.emit('queue:shuffle', resolve));

const moveItem = (socket: TestSocket, itemId: string, toIndex: number) =>
  new Promise<AckResult<QueueUpdated>>((resolve) =>
    socket.emit('queue:move', { itemId, toIndex }, resolve),
  );

const setAutoplay = (socket: TestSocket, enabled: boolean) =>
  new Promise<AckResult<Room>>((resolve) => socket.emit('queue:autoplay', { enabled }, resolve));

const play = (socket: TestSocket, positionMs?: number) =>
  new Promise<AckResult<PlaybackState>>((resolve) =>
    socket.emit('playback:play', positionMs === undefined ? {} : { positionMs }, resolve),
  );

const pause = (socket: TestSocket, positionMs?: number) =>
  new Promise<AckResult<PlaybackState>>((resolve) =>
    socket.emit('playback:pause', positionMs === undefined ? {} : { positionMs }, resolve),
  );

const seek = (socket: TestSocket, positionMs: number) =>
  new Promise<AckResult<PlaybackState>>((resolve) =>
    socket.emit('playback:seek', { positionMs }, resolve),
  );

const skip = (socket: TestSocket) =>
  new Promise<AckResult<PlaybackState>>((resolve) => socket.emit('playback:skip', resolve));

const promote = (socket: TestSocket, userId: string) =>
  new Promise<AckResult<RoomMember>>((resolve) =>
    socket.emit('member:promote', { userId }, resolve),
  );

const demote = (socket: TestSocket, userId: string) =>
  new Promise<AckResult<RoomMember>>((resolve) =>
    socket.emit('member:demote', { userId }, resolve),
  );

const moderate = (
  socket: TestSocket,
  userId: string,
  action: 'mute' | 'unmute' | 'kick' | 'ban' | 'unban',
) =>
  new Promise<AckResult<undefined>>((resolve) =>
    socket.emit('moderation:act', { userId, action }, resolve),
  );

const sendChat = (socket: TestSocket, body: string) =>
  new Promise<AckResult<ChatMessage>>((resolve) => socket.emit('chat:send', { body }, resolve));

const sendReaction = (socket: TestSocket, emoji: string) =>
  new Promise<AckResult<undefined>>((resolve) => socket.emit('reaction:send', { emoji }, resolve));

const createPoll = (socket: TestSocket, question: string, options: string[]) =>
  new Promise<AckResult<Poll>>((resolve) =>
    socket.emit('poll:create', { question, options }, resolve),
  );

const votePoll = (socket: TestSocket, pollId: string, optionId: string) =>
  new Promise<AckResult<Poll>>((resolve) =>
    socket.emit('poll:vote', { pollId, optionId }, resolve),
  );

const closePoll = (socket: TestSocket, pollId: string) =>
  new Promise<AckResult<Poll>>((resolve) => socket.emit('poll:close', { pollId }, resolve));

const createBattle = (socket: TestSocket, itemAId: string, itemBId: string, durationSec = 15) =>
  new Promise<AckResult<Battle>>((resolve) =>
    socket.emit('battle:create', { itemAId, itemBId, durationSec }, resolve),
  );

const voteBattle = (socket: TestSocket, battleId: string, itemId: string) =>
  new Promise<AckResult<Battle>>((resolve) =>
    socket.emit('battle:vote', { battleId, itemId }, resolve),
  );

const mockYoutube = () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('q');

      if (query) {
        const seed = query
          .replace(/[^a-z0-9]/gi, '')
          .slice(0, 8)
          .toUpperCase();
        const suggested = [1, 2, 3].map((index) => ({
          id: { videoId: `AUT${seed}${index}` },
          snippet: {
            title: `Suggested ${seed} ${index}`,
            channelTitle: 'Socket Channel',
            thumbnails: { high: { url: 'https://i.ytimg.com/vi/autoplay/hqdefault.jpg' } },
            categoryId: '10',
          },
        }));

        return new Response(JSON.stringify({ items: suggested }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      const ids = (url.searchParams.get('id') ?? '').split(',').filter(Boolean);

      const items = ids.map((id) => ({
        id,
        snippet: {
          title: `Video ${id}`,
          channelTitle: 'Socket Channel',
          thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
          categoryId: '10',
        },
        contentDetails: { duration: 'PT3M' },
        status: { embeddable: true, privacyStatus: 'public' },
      }));

      return new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
};

beforeAll(async () => {
  mockYoutube();
  ownerId = await makeUser('owner');
  guestId = await makeUser('guest');
  memberId = await makeUser('member');

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const created = await request(app)
    .post('/api/rooms')
    .set('x-test-user-id', ownerId)
    .send({ name: 'Socket room', visibility: 'UNLISTED' });

  roomCode = created.body.room.code;
  roomId = created.body.room.id;

  await request(app)
    .post('/api/rooms/join')
    .set('x-test-user-id', guestId)
    .send({ code: roomCode });
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await new Promise<void>((resolve) => io.close(() => resolve()));

  const media = userMediaKeys();
  await prisma.mediaCache.deleteMany({
    where: { OR: [{ key: { in: media } }, { key: { startsWith: 'yt:search:' } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
  vi.unstubAllGlobals();
});

const userMediaKeys = () => [
  'yt:video:TSTVID00001',
  'yt:video:TSTVID00002',
  'yt:video:TSTVID00003',
];

describe('socket room access', () => {
  it('refuses sockets without a valid session', async () => {
    await expect(connect()).rejects.toThrow('UNAUTHORIZED');
  });
});

describe('live queue', () => {
  it('shares the queue in add order and enforces removal rights', async () => {
    const owner = await connect(ownerId);
    const guest = await connect(guestId);

    const ownerSnapshot = await joinRoom(owner, roomCode);
    expect(ownerSnapshot.ok).toBe(true);
    if (!ownerSnapshot.ok) return;

    const presencePromise = new Promise<{ userIds: string[] }>((resolve) =>
      owner.once('room:presence', resolve),
    );

    const guestSnapshot = await joinRoom(guest, roomCode);
    expect(guestSnapshot.ok).toBe(true);
    if (!guestSnapshot.ok) return;

    expect(ownerSnapshot.data.room.id).toBe(roomId);
    expect(ownerSnapshot.data.me.role).toBe('OWNER');
    expect(guestSnapshot.data.me.role).toBe('MEMBER');
    expect(ownerSnapshot.data.queue).toEqual([]);

    const presence = await presencePromise;
    expect(presence.userIds.sort()).toEqual([ownerId, guestId].sort());

    const guestQueueUpdate = nextQueue(guest);

    const first = await addItem(owner, 'TSTVID00001', 'First song');
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const afterFirst = await guestQueueUpdate;
    expect(afterFirst.items).toHaveLength(1);
    expect(afterFirst.items[0]).not.toHaveProperty('voteCount');
    expect(afterFirst.items[0]).not.toHaveProperty('votedByMe');

    const ownerQueueUpdate = nextQueue(owner);
    const second = await addItem(guest, 'TSTVID00002', 'Second song');
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const guestUpdate = await ownerQueueUpdate;
    expect(guestUpdate.items.map((item) => item.id)).toEqual([first.data.id, second.data.id]);

    const denied = await remove(guest, second.data.id);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe('FORBIDDEN');

    const removed = await remove(owner, second.data.id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.data.items.map((item) => item.id)).toEqual([first.data.id]);
  });
});

describe('queue ordering and autoplay', () => {
  it('lets hosts reshuffle and drag songs to any position', async () => {
    const created = await request(app)
      .post('/api/rooms')
      .set('x-test-user-id', ownerId)
      .send({ name: 'Ordering room', visibility: 'UNLISTED' });

    const code = created.body.room.code as string;
    await request(app).post('/api/rooms/join').set('x-test-user-id', guestId).send({ code });

    const owner = await connect(ownerId);
    const guest = await connect(guestId);
    expect((await joinRoom(owner, code)).ok).toBe(true);
    expect((await joinRoom(guest, code)).ok).toBe(true);

    const first = await addItem(owner, 'TSTVID00001', 'First song');
    const second = await addItem(owner, 'TSTVID00002', 'Second song');
    const third = await addItem(owner, 'TSTVID00003', 'Third song');
    expect(first.ok && second.ok && third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) return;

    const initial = await joinRoom(owner, code);
    expect(initial.ok).toBe(true);
    if (initial.ok) {
      expect(initial.data.queue.map((item) => item.id)).toEqual([
        first.data.id,
        second.data.id,
        third.data.id,
      ]);
    }

    const guestShuffle = await shuffle(guest);
    expect(guestShuffle.ok).toBe(false);
    if (!guestShuffle.ok) expect(guestShuffle.code).toBe('FORBIDDEN');

    const guestMove = await moveItem(guest, third.data.id, 0);
    expect(guestMove.ok).toBe(false);
    if (!guestMove.ok) expect(guestMove.code).toBe('FORBIDDEN');

    const movedOnce = await moveItem(owner, third.data.id, 1);
    expect(movedOnce.ok).toBe(true);
    if (!movedOnce.ok) return;
    expect(movedOnce.data.items.map((item) => item.id)).toEqual([
      first.data.id,
      third.data.id,
      second.data.id,
    ]);

    const movedTwice = await moveItem(owner, third.data.id, 0);
    expect(movedTwice.ok).toBe(true);
    if (!movedTwice.ok) return;
    expect(movedTwice.data.items.map((item) => item.id)).toEqual([
      third.data.id,
      first.data.id,
      second.data.id,
    ]);

    const movedBack = await moveItem(owner, third.data.id, 1);
    expect(movedBack.ok).toBe(true);
    if (!movedBack.ok) return;
    expect(movedBack.data.items.map((item) => item.id)).toEqual([
      first.data.id,
      third.data.id,
      second.data.id,
    ]);

    const snapshot = await joinRoom(owner, code);
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) {
      expect(snapshot.data.queue.map((item) => item.id)).toEqual([
        first.data.id,
        third.data.id,
        second.data.id,
      ]);
      expect(snapshot.data.queue[0]).not.toHaveProperty('voteCount');
    }

    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const shuffled = await shuffle(owner);
    random.mockRestore();

    expect(shuffled.ok).toBe(true);
    if (!shuffled.ok) return;
    expect(shuffled.data.items.map((item) => item.id)).toEqual([
      third.data.id,
      second.data.id,
      first.data.id,
    ]);
  }, 60000);

  it('fills the queue from suggestions when autoplay is on and the queue runs out', async () => {
    const created = await request(app)
      .post('/api/rooms')
      .set('x-test-user-id', ownerId)
      .send({ name: 'Autoplay room', visibility: 'UNLISTED' });

    const code = created.body.room.code as string;
    await request(app).post('/api/rooms/join').set('x-test-user-id', guestId).send({ code });

    const owner = await connect(ownerId);
    const guest = await connect(guestId);
    expect((await joinRoom(owner, code)).ok).toBe(true);
    expect((await joinRoom(guest, code)).ok).toBe(true);

    const added = await addItem(owner, 'TSTVID00001', 'Seed song');
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const guestToggle = await setAutoplay(guest, true);
    expect(guestToggle.ok).toBe(false);
    if (!guestToggle.ok) expect(guestToggle.code).toBe('FORBIDDEN');

    const roomUpdate = new Promise<Room>((resolve) => guest.once('room:updated', resolve));
    const enabled = await setAutoplay(owner, true);
    expect(enabled.ok).toBe(true);
    if (!enabled.ok) return;
    expect(enabled.data.autoplay).toBe(true);
    expect((await roomUpdate).autoplay).toBe(true);

    const withAutoplay = await joinRoom(owner, code);
    expect(withAutoplay.ok).toBe(true);
    if (withAutoplay.ok) expect(withAutoplay.data.room.autoplay).toBe(true);

    const started = await play(owner);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data).toMatchObject({ status: 'PLAYING', currentItemId: added.data.id });

    const queueUpdate = nextQueue(owner);
    const skipped = await skip(owner);
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.data.status).toBe('PLAYING');
    expect(skipped.data.currentItemId).toBeTruthy();

    const items = (await queueUpdate).items;
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.youtubeId.startsWith('AUT'))).toBe(true);
    expect(items.some((item) => item.id === skipped.data.currentItemId)).toBe(true);
    expect(items.find((item) => item.id === skipped.data.currentItemId)?.status).toBe('PLAYING');

    const disabled = await setAutoplay(owner, false);
    expect(disabled.ok).toBe(true);
    if (disabled.ok) expect(disabled.data.autoplay).toBe(false);
  }, 60000);
});

describe('playback control', () => {
  it('lets only the owner or host drive playback and keeps the room in sync', async () => {
    const created = await request(app)
      .post('/api/rooms')
      .set('x-test-user-id', ownerId)
      .send({ name: 'Playback room', visibility: 'UNLISTED' });

    const code = created.body.room.code as string;
    await request(app).post('/api/rooms/join').set('x-test-user-id', guestId).send({ code });

    const owner = await connect(ownerId);
    const guest = await connect(guestId);
    expect((await joinRoom(owner, code)).ok).toBe(true);
    expect((await joinRoom(guest, code)).ok).toBe(true);

    const added = await addItem(owner, 'TSTVID00001', 'Playable song');
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const denied = await play(guest);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe('FORBIDDEN');

    const guestPlayback = new Promise<PlaybackState>((resolve) =>
      guest.once('playback:updated', resolve),
    );

    const started = await play(owner);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data).toMatchObject({
      status: 'PLAYING',
      currentItemId: added.data.id,
      positionMs: 0,
    });

    const broadcast = await guestPlayback;
    expect(broadcast.currentItemId).toBe(added.data.id);

    const sought = await seek(owner, 5000);
    expect(sought.ok).toBe(true);
    if (sought.ok) expect(sought.data.positionMs).toBe(5000);

    const paused = await pause(owner, 5000);
    expect(paused.ok).toBe(true);
    if (paused.ok) expect(paused.data.status).toBe('PAUSED');

    const resumed = await play(owner, 5000);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.data.status).toBe('PLAYING');

    const finished = await skip(owner);
    expect(finished.ok).toBe(true);
    if (finished.ok) {
      expect(finished.data).toMatchObject({ status: 'IDLE', currentItemId: null });
    }
  }, 60000);
});

describe('roles and moderation', () => {
  it('keeps roles owner-only and limits hosts to moderating members', async () => {
    const created = await request(app)
      .post('/api/rooms')
      .set('x-test-user-id', ownerId)
      .send({ name: 'Mod room', visibility: 'UNLISTED' });

    const code = created.body.room.code as string;
    for (const userId of [guestId, memberId]) {
      await request(app).post('/api/rooms/join').set('x-test-user-id', userId).send({ code });
    }

    const owner = await connect(ownerId);
    const guest = await connect(guestId);
    const member = await connect(memberId);

    expect((await joinRoom(owner, code)).ok).toBe(true);
    expect((await joinRoom(guest, code)).ok).toBe(true);
    expect((await joinRoom(member, code)).ok).toBe(true);

    const guestRole = new Promise<{ role: Role }>((resolve) => guest.once('room:role', resolve));
    const promoted = await promote(owner, guestId);
    expect(promoted.ok).toBe(true);
    if (promoted.ok) expect(promoted.data.role).toBe('HOST');
    expect((await guestRole).role).toBe('HOST');

    const hostPromote = await promote(guest, memberId);
    expect(hostPromote.ok).toBe(false);

    const ownerDemote = await demote(guest, ownerId);
    expect(ownerDemote.ok).toBe(false);

    const muted = await moderate(guest, memberId, 'mute');
    expect(muted.ok).toBe(true);

    const ownerBan = await moderate(guest, ownerId, 'ban');
    expect(ownerBan.ok).toBe(false);

    const guestRoleAgain = new Promise<{ role: Role }>((resolve) =>
      guest.once('room:role', resolve),
    );
    const demoted = await demote(owner, guestId);
    expect(demoted.ok).toBe(true);
    expect((await guestRoleAgain).role).toBe('MEMBER');

    const kicked = new Promise<{ reason: string }>((resolve) =>
      member.once('session:ended', resolve),
    );
    const kick = await moderate(owner, memberId, 'kick');
    expect(kick.ok).toBe(true);
    expect((await kicked).reason).toBe('kicked');

    const rejoin = await request(app)
      .post('/api/rooms/join')
      .set('x-test-user-id', memberId)
      .send({ code });
    expect(rejoin.status).toBe(200);

    const banned = await moderate(owner, memberId, 'ban');
    expect(banned.ok).toBe(true);

    const blocked = await request(app)
      .post('/api/rooms/join')
      .set('x-test-user-id', memberId)
      .send({ code });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('BANNED');

    const unbanned = await moderate(owner, memberId, 'unban');
    expect(unbanned.ok).toBe(true);

    const allowed = await request(app)
      .post('/api/rooms/join')
      .set('x-test-user-id', memberId)
      .send({ code });
    expect(allowed.status).toBe(200);

    const restrictEvent = new Promise<Room>((resolve) => guest.once('room:updated', resolve));
    const restricted = await new Promise<AckResult<Room>>((resolve) =>
      owner.emit('room:restrict', { chatRestricted: true, locked: true }, resolve),
    );
    expect(restricted.ok).toBe(true);

    const liveRoom = await restrictEvent;
    expect(liveRoom.chatRestricted).toBe(true);
    expect(liveRoom.locked).toBe(true);

    const guestDelete = await new Promise<AckResult<undefined>>((resolve) =>
      guest.emit('room:delete', resolve),
    );
    expect(guestDelete.ok).toBe(false);

    const renamed = await new Promise<AckResult<Room>>((resolve) =>
      owner.emit('room:update', { name: 'Renamed room' }, resolve),
    );
    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(renamed.data.name).toBe('Renamed room');

    const ownerExit = await new Promise<AckResult<undefined>>((resolve) =>
      owner.emit('room:exit', resolve),
    );
    expect(ownerExit.ok).toBe(false);

    const guestExit = await new Promise<AckResult<undefined>>((resolve) =>
      guest.emit('room:exit', resolve),
    );
    expect(guestExit.ok).toBe(true);

    const afterExit = await joinRoom(owner, code);
    expect(afterExit.ok).toBe(true);
    if (afterExit.ok) {
      expect(afterExit.data.members.some((member) => member.userId === guestId)).toBe(false);
    }
  }, 60000);
});

describe('chat and reactions', () => {
  it('broadcasts chat, toggles emoji reactions, and respects mute and chat restrictions', async () => {
    const created = await request(app)
      .post('/api/rooms')
      .set('x-test-user-id', ownerId)
      .send({ name: 'Chat room', visibility: 'UNLISTED' });

    const code = created.body.room.code as string;
    await request(app).post('/api/rooms/join').set('x-test-user-id', guestId).send({ code });

    const owner = await connect(ownerId);
    const guest = await connect(guestId);
    expect((await joinRoom(owner, code)).ok).toBe(true);
    expect((await joinRoom(guest, code)).ok).toBe(true);

    const incoming = new Promise<ChatMessage>((resolve) => owner.once('chat:new', resolve));
    const sent = await sendChat(guest, 'hello beans');
    expect(sent.ok).toBe(true);

    const received = await incoming;
    expect(received.body).toBe('hello beans');
    expect(received.userId).toBe(guestId);

    const summaryPromise = new Promise<ReactionSummary[]>((resolve) =>
      owner.once('reactions:summary', resolve),
    );
    const reaction = await sendReaction(guest, '🔥');
    expect(reaction.ok).toBe(true);

    const summary = await summaryPromise;
    expect(summary.find((entry) => entry.emoji === '🔥')?.count).toBe(1);

    const clearedPromise = new Promise<ReactionSummary[]>((resolve) =>
      owner.once('reactions:summary', resolve),
    );
    const cleared = await sendReaction(guest, '🔥');
    expect(cleared.ok).toBe(true);
    expect((await clearedPromise).find((entry) => entry.emoji === '🔥')).toBeUndefined();

    const mute = await moderate(owner, guestId, 'mute');
    expect(mute.ok).toBe(true);

    const mutedChat = await sendChat(guest, 'can anyone hear me');
    expect(mutedChat.ok).toBe(false);
    if (!mutedChat.ok) expect(mutedChat.code).toBe('MUTED');

    const unmute = await moderate(owner, guestId, 'unmute');
    expect(unmute.ok).toBe(true);

    const restricted = await new Promise<AckResult<Room>>((resolve) =>
      owner.emit('room:restrict', { chatRestricted: true }, resolve),
    );
    expect(restricted.ok).toBe(true);

    const restrictedChat = await sendChat(guest, 'hello?');
    expect(restrictedChat.ok).toBe(false);
    if (!restrictedChat.ok) expect(restrictedChat.code).toBe('CHAT_RESTRICTED');

    const hostChat = await sendChat(owner, 'hosts can still talk');
    expect(hostChat.ok).toBe(true);

    const snapshot = await joinRoom(owner, code);
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) {
      expect(snapshot.data.chat.map((message) => message.body)).toContain('hello beans');
      expect(snapshot.data.chat.map((message) => message.body)).toContain('hosts can still talk');
    }
  }, 60000);
});

describe('polls and battles', () => {
  it('runs multiple polls and a timed song battle', async () => {
    const created = await request(app)
      .post('/api/rooms')
      .set('x-test-user-id', ownerId)
      .send({ name: 'Games room', visibility: 'UNLISTED' });

    const code = created.body.room.code as string;
    await request(app).post('/api/rooms/join').set('x-test-user-id', guestId).send({ code });

    const owner = await connect(ownerId);
    const guest = await connect(guestId);
    expect((await joinRoom(owner, code)).ok).toBe(true);
    expect((await joinRoom(guest, code)).ok).toBe(true);

    const first = await addItem(owner, 'TSTVID00001', 'Battle A');
    const second = await addItem(owner, 'TSTVID00002', 'Battle B');
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const ownerPoll = new Promise<Poll>((resolve) => owner.once('poll:updated', resolve));
    const poll = await createPoll(guest, 'Which one first?', ['Song A', 'Song B']);
    expect(poll.ok).toBe(true);
    if (!poll.ok) return;
    expect((await ownerPoll).options).toHaveLength(2);

    const ownerSecondPoll = new Promise<Poll>((resolve) => owner.once('poll:updated', resolve));
    const secondPoll = await createPoll(guest, 'Which one second?', ['Song C', 'Song D']);
    expect(secondPoll.ok).toBe(true);
    if (!secondPoll.ok) return;
    expect((await ownerSecondPoll).id).toBe(secondPoll.data.id);

    const optionId = poll.data.options[1]?.id ?? '';
    const guestPoll = new Promise<Poll>((resolve) => guest.once('poll:updated', resolve));
    const ownerPollVote = new Promise<Poll>((resolve) => owner.once('poll:updated', resolve));

    const voted = await votePoll(guest, poll.data.id, optionId);
    expect(voted.ok).toBe(true);
    if (voted.ok) {
      expect(voted.data.totalVotes).toBe(1);
      expect(voted.data.myVoteOptionId).toBe(optionId);
    }

    const ownerView = await ownerPollVote;
    expect(ownerView.id).toBe(poll.data.id);
    expect(ownerView.totalVotes).toBe(1);
    expect(ownerView.myVoteOptionId).toBeNull();
    const guestPollView = await guestPoll;
    expect(guestPollView.id).toBe(poll.data.id);
    expect(guestPollView.myVoteOptionId).toBe(optionId);

    const cleared = await votePoll(guest, poll.data.id, optionId);
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.data.totalVotes).toBe(0);
      expect(cleared.data.myVoteOptionId).toBeNull();
      expect(cleared.data.options.find((option) => option.id === optionId)?.votes).toBe(0);
    }

    const closed = await closePoll(guest, poll.data.id);
    expect(closed.ok).toBe(true);
    if (closed.ok) expect(closed.data.status).toBe('CLOSED');

    const afterClose = await joinRoom(owner, code);
    expect(afterClose.ok).toBe(true);
    if (afterClose.ok) {
      expect(afterClose.data.polls.find((entry) => entry.id === poll.data.id)?.status).toBe(
        'CLOSED',
      );
      expect(afterClose.data.polls.find((entry) => entry.id === secondPoll.data.id)?.status).toBe(
        'OPEN',
      );
    }

    const battleEnded = new Promise<Battle>((resolve) => owner.once('battle:ended', resolve));
    const guestCreate = new Promise<Battle>((resolve) => guest.once('battle:updated', resolve));
    const battle = await createBattle(owner, first.data.id, second.data.id, 15);
    expect(battle.ok).toBe(true);
    if (!battle.ok) return;

    const createdView = await guestCreate;
    expect(createdView.entries).toHaveLength(2);

    const guestBattle = new Promise<Battle>((resolve) => guest.once('battle:updated', resolve));
    const battleVote = await voteBattle(guest, battle.data.id, first.data.id);
    expect(battleVote.ok).toBe(true);

    const guestView = await guestBattle;
    expect(guestView.entries.find((entry) => entry.itemId === first.data.id)?.votes).toBe(1);
    expect(guestView.myVoteItemId).toBe(first.data.id);

    const ended = await battleEnded;
    expect(ended.status).toBe('CLOSED');
    expect(ended.winnerItemId).toBe(first.data.id);

    const snapshot = await joinRoom(owner, code);
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) {
      expect(snapshot.data.battles.find((entry) => entry.id === battle.data.id)?.winnerItemId).toBe(
        first.data.id,
      );
      expect(snapshot.data.polls.find((entry) => entry.id === secondPoll.data.id)?.status).toBe(
        'OPEN',
      );
    }
  }, 60000);
});
