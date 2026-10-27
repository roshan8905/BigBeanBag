import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { loadEnv, request } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const candidates = [
  'https://www.youtube.com/watch?v=A_MjCqQoLLA',
  'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
];
const attempts = [];
let item = null;
for (const url of candidates) {
  const response = await request(env.BASE_URL, '/api/media/resolve', {
    method: 'POST',
    cookie: env.SESSION_COOKIE,
    body: { url },
    timeout: 30000,
  });
  attempts.push({ url, status: response.status, ms: Math.round(response.ms * 100) / 100 });
  if (response.status === 200) {
    item = JSON.parse(response.body).item;
    break;
  }
}
if (!item || item.durationMs <= 300000) {
  console.error(JSON.stringify({ error: 'no track longer than 5 minutes', attempts, item }));
  process.exit(1);
}
const socket = io(env.BASE_URL, {
  transports: ['websocket'],
  autoConnect: false,
  reconnection: false,
  timeout: 30000,
  extraHeaders: { Cookie: `bbb.sid=${env.SESSION_COOKIE}` },
});
const emitAck = (event, payload, timeout = 30000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeout);
    const callback = (result) => {
      clearTimeout(timer);
      resolve(result);
    };
    if (payload === undefined) socket.emit(event, callback);
    else socket.emit(event, payload, callback);
  });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('connect timeout')), 30000);
  socket.on('connect', () => {
    clearTimeout(timer);
    resolve();
  });
  socket.on('connect_error', (error) => {
    clearTimeout(timer);
    reject(error);
  });
  socket.connect();
});
const join = await emitAck('room:join', { code: room.code });
if (!join?.ok) {
  console.error(JSON.stringify({ error: 'join failed', join }));
  process.exit(1);
}
const addStarted = performance.now();
const added = await emitAck('queue:add', item);
if (!added?.ok) {
  console.error(JSON.stringify({ error: 'queue add failed', added }));
  process.exit(1);
}
const addMs = performance.now() - addStarted;
const skipStarted = performance.now();
const skipped = await emitAck('playback:skip');
const skipMs = performance.now() - skipStarted;
const state = skipped?.data ?? null;
const summary = {
  attempts,
  item: {
    youtubeId: item.youtubeId,
    title: item.title,
    durationMs: item.durationMs,
  },
  queueAdd: {
    ok: Boolean(added.ok),
    ms: Math.round(addMs * 100) / 100,
    itemId: added.data?.id ?? null,
  },
  skip: {
    ok: Boolean(skipped?.ok),
    ms: Math.round(skipMs * 100) / 100,
    status: state?.status ?? null,
    currentItemId: state?.currentItemId ?? null,
    positionMs: state?.positionMs ?? null,
    durationMs: state?.durationMs ?? null,
    message: skipped?.message ?? null,
  },
};
if (summary.skip.ok && summary.skip.currentItemId) {
  await fs.writeFile(
    'results/test-queue.json',
    JSON.stringify({ itemId: summary.skip.currentItemId, item }, null, 2),
  );
}
await fs.writeFile('results/long-media.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
socket.disconnect();
