import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RoomDetail } from '@bigbeanbag/shared';
import { createApp } from './create-app';
import { prisma } from './lib/prisma';

const app = createApp();
const run = randomBytes(4).toString('hex');
const userIds: string[] = [];

type TestUser = { id: string; name: string };

const makeUser = async (label: string): Promise<TestUser> => {
  const user = await prisma.user.create({
    data: {
      googleId: `test-${run}-${label}`,
      email: `test-${run}-${label}@bigbeanbag.test`,
      name: `Tester ${label}`,
    },
  });
  userIds.push(user.id);
  return { id: user.id, name: user.name };
};

const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set('x-test-user-id', user.id),
  post: (url: string) => request(app).post(url).set('x-test-user-id', user.id),
  patch: (url: string) => request(app).patch(url).set('x-test-user-id', user.id),
  delete: (url: string) => request(app).delete(url).set('x-test-user-id', user.id),
});

let owner: TestUser;
let guest: TestUser;
let outsider: TestUser;

beforeAll(async () => {
  owner = await makeUser('owner');
  guest = await makeUser('guest');
  outsider = await makeUser('outsider');
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

const createRoom = async (
  user: TestUser,
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE' = 'UNLISTED',
  name = `Room ${randomBytes(3).toString('hex')}`,
) => {
  const response = await as(user).post('/api/rooms').send({ name, visibility });
  expect(response.status).toBe(201);
  return response.body as RoomDetail;
};

describe('room creation and joining', () => {
  it('makes the creator the permanent owner', async () => {
    const detail = await createRoom(owner, 'PUBLIC', 'Vinyl hour');
    expect(detail.role).toBe('OWNER');
    expect(detail.room.memberCount).toBe(1);
    expect(detail.room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(detail.members[0]).toMatchObject({ userId: owner.id, role: 'OWNER' });
  });

  it('joins by room code and lists the room for both users', async () => {
    const detail = await createRoom(owner);
    const join = await as(guest).post('/api/rooms/join').send({ code: detail.room.code });

    expect(join.status).toBe(200);
    expect(join.body.role).toBe('MEMBER');
    expect(join.body.room.memberCount).toBe(2);

    const guestRooms = await as(guest).get('/api/rooms');
    expect(guestRooms.status).toBe(200);
    expect(guestRooms.body.mine.map((room: { code: string }) => room.code)).toContain(detail.room.code);
  });

  it('rejects joining a locked room', async () => {
    const detail = await createRoom(owner);
    await as(owner).post(`/api/rooms/${detail.room.code}/lock`).send({ locked: true });

    const join = await as(outsider).post('/api/rooms/join').send({ code: detail.room.code });
    expect(join.status).toBe(403);
    expect(join.body.error.code).toBe('ROOM_LOCKED');
  });

  it('requires an invite link for private rooms', async () => {
    const detail = await createRoom(owner, 'PRIVATE');

    const preview = await as(outsider).get(`/api/rooms/${detail.room.code}`);
    expect(preview.status).toBe(403);

    const codeJoin = await as(outsider).post('/api/rooms/join').send({ code: detail.room.code });
    expect(codeJoin.status).toBe(403);

    const invite = await as(owner).get(`/api/rooms/${detail.room.code}/invite`);
    expect(invite.status).toBe(200);
    expect(invite.body.token).toBeTruthy();

    const tokenJoin = await as(outsider).post(`/api/rooms/join/${invite.body.token}`);
    expect(tokenJoin.status).toBe(200);
    expect(tokenJoin.body.room.code).toBe(detail.room.code);
  });
});

describe('invites', () => {
  it('rotates and revokes invite links', async () => {
    const detail = await createRoom(owner);
    const first = await as(owner).get(`/api/rooms/${detail.room.code}/invite`);
    const rotated = await as(owner).post(`/api/rooms/${detail.room.code}/invite/rotate`);

    expect(rotated.body.token).not.toBe(first.body.token);

    const stale = await as(outsider).post(`/api/rooms/join/${first.body.token}`);
    expect(stale.status).toBe(404);

    const fresh = await as(outsider).post(`/api/rooms/join/${rotated.body.token}`);
    expect(fresh.status).toBe(200);

    const revoke = await as(owner).delete(`/api/rooms/${detail.room.code}/invite`);
    expect(revoke.status).toBe(204);

    const state = await as(owner).get(`/api/rooms/${detail.room.code}/invite`);
    expect(state.body).toEqual({ token: null, url: null });
  });
});

describe('owner protections', () => {
  it('blocks non-owners from settings, locks, invites, and deletion', async () => {
    const detail = await createRoom(owner);
    await as(guest).post('/api/rooms/join').send({ code: detail.room.code });

    const update = await as(guest).patch(`/api/rooms/${detail.room.code}`).send({ name: 'Hijacked' });
    expect(update.status).toBe(403);

    const lock = await as(guest).post(`/api/rooms/${detail.room.code}/lock`).send({ locked: true });
    expect(lock.status).toBe(403);

    const invite = await as(guest).post(`/api/rooms/${detail.room.code}/invite/rotate`);
    expect(invite.status).toBe(403);

    const remove = await as(guest).delete(`/api/rooms/${detail.room.code}`);
    expect(remove.status).toBe(403);
  });

  it('lets the owner delete the room', async () => {
    const detail = await createRoom(owner);
    const remove = await as(owner).delete(`/api/rooms/${detail.room.code}`);
    expect(remove.status).toBe(204);

    const missing = await as(owner).get(`/api/rooms/${detail.room.code}`);
    expect(missing.status).toBe(404);
  });
});

describe('public discovery', () => {
  it('lists public rooms and hides private ones', async () => {
    const publicRoom = await createRoom(owner, 'PUBLIC', 'Open deck');
    const privateRoom = await createRoom(owner, 'PRIVATE', 'Secret stash');

    const response = await as(outsider).get('/api/rooms');
    const codes = response.body.publicRooms.map((room: { code: string }) => room.code);

    expect(codes).toContain(publicRoom.room.code);
    expect(codes).not.toContain(privateRoom.room.code);
  });
});
