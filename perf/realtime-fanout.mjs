import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { loadEnv, percentile, sleep, stats } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const levels = (process.env.LEVELS ?? '5,20,50').split(',').map(Number);
const rounds = Number(process.env.FANOUT_ROUNDS ?? 5);
const emoji = '🔥';
const results = [];
const emitAck = (socket, event, payload, timeout) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeout);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
const waitForEvent = (socket, event, timeout) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`${event} timeout`));
    }, timeout);
    const onEvent = (data) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve({ at: performance.now(), data });
    };
    socket.on(event, onEvent);
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
    return { index, socket: null, connectMs: null, joinMs: null, joinOk: false };
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
  return { index, socket, connectMs, joinMs, joinOk };
};
for (const level of levels) {
  const errors = [];
  const pending = [];
  for (let index = 0; index < level; index += 1) {
    pending.push(connectOne(index, errors));
    await sleep(100);
  }
  const clients = await Promise.all(pending);
  const present = clients.filter((client) => client.socket?.connected && client.joinOk);
  const sender = present[0];
  const listeners = present.slice(1);
  const latencies = [];
  const roundRows = [];
  if (sender && listeners.length) {
    for (let round = 0; round < rounds; round += 1) {
      const waits = listeners.map((client) =>
        waitForEvent(client.socket, 'reactions:summary', 10000)
          .then((event) => ({ ok: true, at: event.at }))
          .catch((error) => ({ ok: false, error: error.message })),
      );
      const sentAt = performance.now();
      let ackMs = null;
      let ackOk = false;
      try {
        const ack = await emitAck(sender.socket, 'reaction:send', { emoji }, 20000);
        ackMs = performance.now() - sentAt;
        ackOk = Boolean(ack?.ok);
        if (!ackOk) errors.push({ index: sender.index, event: 'reaction_error', message: ack?.message ?? 'reaction failed' });
      } catch (error) {
        errors.push({ index: sender.index, event: 'reaction_timeout', message: error.message });
      }
      const received = await Promise.all(waits);
      const values = received.filter((row) => row.ok).map((row) => row.at - sentAt);
      latencies.push(...values);
      roundRows.push({
        round,
        sentAt: Math.round(sentAt),
        ackOk,
        ackMs: ackMs === null ? null : Math.round(ackMs * 100) / 100,
        received: values.length,
        missing: listeners.length - values.length,
        p50: values.length ? Math.round(percentile(values, 50) * 100) / 100 : null,
        p95: values.length ? Math.round(percentile(values, 95) * 100) / 100 : null,
        max: values.length ? Math.round(Math.max(...values) * 100) / 100 : null,
      });
      await sleep(1000);
    }
  }
  const summary = {
    level,
    connected: clients.filter((client) => client.connectMs !== null).length,
    joined: present.length,
    listeners: listeners.length,
    connectMs: stats(clients.map((client) => client.connectMs).filter((value) => typeof value === 'number')),
    joinMs: stats(clients.map((client) => client.joinMs).filter((value) => typeof value === 'number')),
    fanoutMs: stats(latencies),
    rounds: roundRows,
    errors,
  };
  results.push(summary);
  await fs.writeFile('results/realtime-fanout.json', JSON.stringify({ room: room.code, results }, null, 2));
  console.log(JSON.stringify(summary));
  for (const client of clients) client.socket?.disconnect();
  await sleep(3000);
}
