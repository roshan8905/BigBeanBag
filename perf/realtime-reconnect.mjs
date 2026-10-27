import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { loadEnv } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const socket = io(env.BASE_URL, {
  transports: ['websocket'],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 2000,
  timeout: 30000,
  extraHeaders: { Cookie: `bbb.sid=${env.SESSION_COOKIE}` },
});
const emitAck = (event, payload, timeout = 30000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeout);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
const waitForConnect = (timeout = 30000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), timeout);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(performance.now());
    });
  });
const initial = waitForConnect();
const connectStart = performance.now();
socket.connect();
const initialAt = await initial;
const connectMs = initialAt - connectStart;
const joinStart = performance.now();
const join = await emitAck('room:join', { code: room.code });
const joinMs = performance.now() - joinStart;
const reconnectWait = waitForConnect();
const closeAt = performance.now();
socket.io.engine.close();
const reconnectAt = await reconnectWait;
const reconnectMs = reconnectAt - closeAt;
const rejoinStart = performance.now();
const rejoin = await emitAck('room:join', { code: room.code });
const rejoinMs = performance.now() - rejoinStart;
const summary = {
  connectMs: Math.round(connectMs * 100) / 100,
  join: { ok: Boolean(join?.ok), ms: Math.round(joinMs * 100) / 100 },
  reconnectMs: Math.round(reconnectMs * 100) / 100,
  rejoin: { ok: Boolean(rejoin?.ok), ms: Math.round(rejoinMs * 100) / 100 },
};
await fs.writeFile('results/realtime-reconnect.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
socket.disconnect();
