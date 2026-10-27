import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { loadEnv } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const started = performance.now();
const events = [];
const pings = [];
const socket = io(env.BASE_URL, {
  transports: ['websocket'],
  autoConnect: false,
  reconnection: false,
  timeout: 30000,
  extraHeaders: { Cookie: `bbb.sid=${env.SESSION_COOKIE}` },
});
const emitAck = (event, payload, timeout = 20000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeout);
    const callback = (result) => {
      clearTimeout(timer);
      resolve(result);
    };
    if (payload === undefined) socket.emit(event, callback);
    else socket.emit(event, payload, callback);
  });
socket.on('connect', async () => {
  events.push({ event: 'connect', ms: Math.round((performance.now() - started) * 100) / 100 });
  try {
    const join = await emitAck('room:join', { code: room.code });
    events.push({ event: 'join', ok: Boolean(join?.ok), ms: Math.round((performance.now() - started) * 100) / 100 });
  } catch (error) {
    events.push({ event: 'join-error', message: error.message, ms: Math.round((performance.now() - started) * 100) / 100 });
  }
});
socket.on('disconnect', (reason) => {
  events.push({ event: 'disconnect', reason, ms: Math.round((performance.now() - started) * 100) / 100 });
});
socket.on('connect_error', (error) => {
  events.push({ event: 'connect_error', message: error.message, ms: Math.round((performance.now() - started) * 100) / 100 });
});
socket.connect();
const timer = setInterval(async () => {
  if (!socket.connected) return;
  const t0 = performance.now();
  try {
    const result = await emitAck('sync:ping', { t0 }, 10000);
    if (result?.ok) pings.push({ at: Math.round((performance.now() - started) * 100) / 100, ms: Math.round((performance.now() - t0) * 100) / 100 });
  } catch (error) {
    pings.push({ at: Math.round((performance.now() - started) * 100) / 100, error: error.message });
  }
}, 1000);
await new Promise((resolve) => setTimeout(resolve, 70000));
clearInterval(timer);
if (socket.connected) socket.disconnect();
const summary = {
  startedAt: new Date().toISOString(),
  events,
  pingCount: pings.length,
  pings,
  connectedAtEnd: socket.connected,
};
await fs.writeFile('results/realtime-lifetime.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
