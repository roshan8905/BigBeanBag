import { createServer, type Server as HttpServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  AckResult,
  ClientToServerEvents,
  PlaybackState,
  QueueItem,
  QueueUpdated,
  RoomMember,
  RoomSnapshot,
  Role,
  Room,
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

const vote = (socket: TestSocket, itemId: string) =>
  new Promise<AckResult<{ itemId: string; voted: boolean; voteCount: number }>>((resolve) =>
    socket.emit('queue:vote', { itemId }, resolve),
  );

const remove = (socket: TestSocket, itemId: string) =>
  new Promise<AckResult<QueueUpdated>>((resolve) => socket.emit('queue:remove', { itemId }, resolve));

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

const moderate = (socket: TestSocket, userId: string, action: 'mute' | 'unmute' | 'kick' | 'ban' | 'unban') =>
  new Promise<AckResult<undefined>>((resolve) =>
    socket.emit('moderation:act', { userId, action }, resolve),
  );

const mockYoutube = () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
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

  await request(app).post('/api/rooms/join').set('x-test-user-id', guestId).send({ code: roomCode });
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await new Promise<void>((resolve) => io.close(() => resolve()));

  const media = userMediaKeys();
  await prisma.mediaCache.deleteMany({ where: { key: { in: media } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
  vi.unstubAllGlobals();
});

const userMediaKeys = () => ['yt:video:TSTVID00001', 'yt:video:TSTVID00002'];

describe('socket room access', () => {
  it('refuses sockets without a valid session', async () => {
    await expect(connect()).rejects.toThrow('UNAUTHORIZED');
  });
});

describe('live queue', () => {
  it('shares the queue, toggles votes, orders by votes, and enforces removal rights', async () => {
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
    expect(afterFirst.items[0]?.votedByMe).toBe(false);

    const ownerQueueUpdate = nextQueue(owner);
    const second = await addItem(guest, 'TSTVID00002', 'Second song');
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const guestUpdate = await ownerQueueUpdate;
    expect(guestUpdate.items).toHaveLength(2);

    const ownerReorder = nextQueue(owner);
    const guestReorder = nextQueue(guest);

    const voteResult = await vote(guest, second.data.id);
    expect(voteResult.ok).toBe(true);
    if (!voteResult.ok) return;
    expect(voteResult.data).toMatchObject({ voted: true, voteCount: 1 });

    const reordered = await ownerReorder;
    expect(reordered.items.map((item) => item.id)).toEqual([second.data.id, first.data.id]);
    expect(reordered.items[0]?.votedByMe).toBe(false);

    const guestOwnView = await guestReorder;
    expect(guestOwnView.items[0]?.votedByMe).toBe(true);

    const tiedPromise = nextQueue(owner);
    const unvote = await vote(guest, second.data.id);
    expect(unvote.ok).toBe(true);
    if (!unvote.ok) return;
    expect(unvote.data).toMatchObject({ voted: false, voteCount: 0 });

    const tied = await tiedPromise;
    expect(tied.items.map((item) => item.id)).toEqual([first.data.id, second.data.id]);

    const denied = await remove(guest, second.data.id);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe('FORBIDDEN');

    const removed = await remove(owner, second.data.id);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.data.items.map((item) => item.id)).toEqual([first.data.id]);
  });
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
  });
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
  }, 60000);
});
