import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { loadEnv, sleep, stats } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const levels = (process.env.LEVELS ?? '5,20,50').split(',').map(Number);
const results = [];
const emitAck = (socket, event, payload, timeout) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeout);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
const connectOne = async (index, errors) => {
  const socket = io(env.BASE_URL, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: false,
    timeout: 20000,
    extraHeaders: { Cookie: `bbb.sid=${env.SESSION_COOKIE}` },
  });
  const started = performance.now();
  const connected = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 20000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(true);
    });
    socket.once('connect_error', (error) => {
      errors.push({ index, event: 'connect_error', message: error.message });
      clearTimeout(timer);
      resolve(false);
    });
    socket.connect();
  });
  if (!connected) {
    socket.close();
    return { index, socket: null, connectMs: null, joinMs: null, joinOk: false, connected: false };
  }
  const connectMs = performance.now() - started;
  let joinMs = null;
  let joinOk = false;
  try {
    const joinStart = performance.now();
    const join = await emitAck(socket, 'room:join', { code: room.code }, 20000);
    joinMs = performance.now() - joinStart;
    joinOk = Boolean(join?.ok);
    if (!joinOk) errors.push({ index, event: 'join_error', message: join?.message ?? 'join failed' });
  } catch (error) {
    errors.push({ index, event: 'join_timeout', message: error.message });
  }
  return { index, socket, connectMs, joinMs, joinOk, connected: true };
};
for (const level of levels) {
  const levelStart = Date.now();
  const errors = [];
  const disconnects = [];
  const pending = [];
  for (let index = 0; index < level; index += 1) {
    pending.push(connectOne(index, errors));
    await sleep(100);
  }
  const clients = await Promise.all(pending);
  for (const client of clients) {
    if (!client.socket) continue;
    client.socket.on('disconnect', (reason) => {
      client.connected = false;
      disconnects.push({ index: client.index, reason, elapsedMs: Date.now() - levelStart });
    });
  }
  const active = clients.filter((client) => client.connected);
  const pings = [];
  const pingTimer = setInterval(() => {
    for (const client of clients) {
      if (!client.connected || !client.socket?.connected) continue;
      const t0 = performance.now();
      client.socket.emit('sync:ping', { t0 }, (result) => {
        if (result?.ok) pings.push(performance.now() - t0);
      });
    }
  }, 5000);
  await sleep(60000);
  clearInterval(pingTimer);
  const inRoom = clients.filter((client) => client.connected && client.joinOk).length;
  const summary = {
    level,
    connected: clients.filter((client) => client.connectMs !== null).length,
    active: active.length,
    inRoom,
    connectMs: stats(clients.map((client) => client.connectMs).filter((value) => typeof value === 'number')),
    joinMs: stats(clients.map((client) => client.joinMs).filter((value) => typeof value === 'number')),
    pingMs: stats(pings),
    disconnects,
    errors,
  };
  results.push(summary);
  await fs.writeFile('results/realtime-connections.json', JSON.stringify({ room: room.code, results }, null, 2));
  console.log(JSON.stringify(summary));
  for (const client of clients) client.socket?.disconnect();
  await sleep(5000);
}
