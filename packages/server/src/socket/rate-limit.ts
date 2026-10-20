const buckets = new Map<string, { count: number; resetAt: number }>();

export const takeToken = (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
};

export const clearSocket = (socketId: string) => {
  for (const key of buckets.keys()) {
    if (key.startsWith(`${socketId}:`)) buckets.delete(key);
  }
};
