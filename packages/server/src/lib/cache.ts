import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const row = await prisma.mediaCache.findUnique({ where: { key } });
  if (!row) return null;

  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    await prisma.mediaCache.delete({ where: { key } }).catch(() => undefined);
    return null;
  }

  return row.payload as T;
};

export const cacheSet = async (
  key: string,
  kind: string,
  payload: Prisma.InputJsonValue,
  ttlMs: number,
) => {
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.mediaCache.upsert({
    where: { key },
    create: { key, kind, payload, expiresAt },
    update: { payload, expiresAt },
  });
};

export const cached = async <T>(
  key: string,
  kind: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> => {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;

  const value = await load();
  await cacheSet(key, kind, value as Prisma.InputJsonValue, ttlMs).catch(() => undefined);
  return value;
};
