import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { loadEnv, request } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const search = await request(
  env.BASE_URL,
  '/api/media/search?query=daft%20punk&filter=MUSIC&limit=5',
  { cookie: env.SESSION_COOKIE, timeout: 30000 },
);
const candidates = [
  'https://www.youtube.com/watch?v=5NV6Rdv1a3I',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=jNQXAC9IVRw',
];
const attempts = [];
let resolveResponse = null;
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
    resolveResponse = response;
    item = JSON.parse(response.body).item;
    break;
  }
}
let added = null;
if (item) {
  const socket = io(env.BASE_URL, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: false,
    timeout: 30000,
    extraHeaders: { Cookie: `bbb.sid=${env.SESSION_COOKIE}` },
  });
  await new Promise((resolveConnect, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 30000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolveConnect();
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect();
  });
  const emitAck = (event, payload) =>
    new Promise((resolveAck, reject) => {
      const timer = setTimeout(() => reject(new Error(`${event} timeout`)), 30000);
      socket.emit(event, payload, (result) => {
        clearTimeout(timer);
        resolveAck(result);
      });
    });
  const join = await emitAck('room:join', { code: room.code });
  if (join?.ok) {
    const started = performance.now();
    const result = await emitAck('queue:add', item);
    added = {
      ok: Boolean(result?.ok),
      ms: Math.round((performance.now() - started) * 100) / 100,
      itemId: result?.data?.id ?? null,
      message: result?.message ?? null,
    };
  }
  socket.disconnect();
  if (added?.itemId) {
    await fs.writeFile('results/test-queue.json', JSON.stringify({ itemId: added.itemId, item }, null, 2));
  }
}
const summary = {
  search: {
    status: search.status,
    ms: Math.round(search.ms * 100) / 100,
    bytes: search.bytes,
    items: search.status === 200 ? JSON.parse(search.body).items.length : null,
  },
  resolve: {
    status: resolveResponse?.status ?? 0,
    ms: resolveResponse ? Math.round(resolveResponse.ms * 100) / 100 : null,
    bytes: resolveResponse?.bytes ?? 0,
    attempts,
    item: item ? { youtubeId: item.youtubeId, title: item.title, durationMs: item.durationMs } : null,
  },
  queueAdd: added,
};
await fs.writeFile('results/media.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
