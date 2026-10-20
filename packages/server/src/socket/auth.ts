import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@bigbeanbag/shared';
import { env, isTest } from '../env';
import { prisma } from '../lib/prisma';
import { sessionStore } from '../lib/session';

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type StoredSession = { passport?: { user?: string } } | null;

const readCookie = (header: string | undefined, name: string) => {
  for (const part of (header ?? '').split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    if (trimmed.slice(0, separator) === name) {
      return decodeURIComponent(trimmed.slice(separator + 1));
    }
  }
  return null;
};

const unsign = (value: string, secret: string) => {
  const raw = value.startsWith('s:') ? value.slice(2) : value;
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const sid = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  const expected = createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b) ? sid : null;
};

const loadSession = (sid: string) =>
  new Promise<StoredSession>((resolve, reject) => {
    sessionStore.get(sid, (error, session) => {
      if (error) reject(error);
      else resolve((session as StoredSession) ?? null);
    });
  });

export const socketAuth = async (socket: AppSocket, next: (error?: Error) => void) => {
  try {
    if (isTest) {
      const testUserId = socket.handshake.auth?.testUserId;
      if (typeof testUserId === 'string') {
        const user = await prisma.user.findUnique({ where: { id: testUserId } });
        if (!user) return next(new Error('UNAUTHORIZED'));
        socket.data.userId = user.id;
        return next();
      }
    }

    const cookie = readCookie(socket.handshake.headers.cookie, env.SESSION_COOKIE_NAME);
    if (!cookie) return next(new Error('UNAUTHORIZED'));

    const sid = unsign(cookie, env.SESSION_SECRET);
    if (!sid) return next(new Error('UNAUTHORIZED'));

    const session = await loadSession(sid);
    const userId = session?.passport?.user;
    if (!userId) return next(new Error('UNAUTHORIZED'));

    socket.data.userId = userId;
    return next();
  } catch {
    return next(new Error('UNAUTHORIZED'));
  }
};
