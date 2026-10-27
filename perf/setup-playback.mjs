import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { loadEnv } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const socket = io(env.BASE_URL, {
  transports: ['websocket'],
  autoConnect: false,
  reconnection: false,
  timeout: 30000,
  extraHeaders: { Cookie: `bbb.sid=${env.SESSION_COOKIE}` },
});
const emitAck = (event, payload) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), 30000);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
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
  console.error(join);
  process.exit(1);
}
const started = performance.now();
const play = await emitAck('playback:play', { positionMs: 0 });
console.log(
  JSON.stringify({
    ok: Boolean(play?.ok),
    ms: Math.round((performance.now() - started) * 100) / 100,
    status: play?.data?.status ?? null,
    currentItemId: play?.data?.currentItemId ?? null,
    positionMs: play?.data?.positionMs ?? null,
    message: play?.message ?? null,
  }),
);
socket.disconnect();
