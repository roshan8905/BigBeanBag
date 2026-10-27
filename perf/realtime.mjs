import fs from 'node:fs/promises';
import { io } from 'socket.io-client';
import { loadEnv, percentile, sleep, stats } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const queueFile = 'results/test-queue.json';
let queueItem = null;
try {
  queueItem = JSON.parse(await fs.readFile(queueFile, 'utf8'));
} catch {}
const levels = (process.env.LEVELS ?? '5,20,50').split(',').map(Number);
const holdMs = Number(process.env.HOLD_MS ?? 300000);
const fanoutRounds = Number(process.env.FANOUT_ROUNDS ?? 20);
const rttRounds = Number(process.env.RTT_ROUNDS ?? 10);
const emojis = ['🔥', '❤️', '😂', '🎉', '👏', '🤯'];

const waitForEvent = (socket, event, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`${event} timeout`));
    }, timeoutMs);
    const onEvent = (data) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve({ data, at: performance.now() });
    };
    socket.on(event, onEvent);
  });

const emitAck = (socket, event, payload, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), timeoutMs);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });

const connectClient = async (index, errors) => {
  const socket = io(env.BASE_URL, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 50,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000,
    timeout: 30000,
    extraHeaders: { Cookie: `bbb.sid=${env.SESSION_COOKIE}` },
  });
  socket.on('connect_error', (error) => errors.connectErrors.push({ index, message: error.message }));
  socket.on('room:error', (error) => errors.roomErrors.push({ index, message: error.message }));
  socket.on('disconnect', (reason) => errors.disconnects.push({ index, reason, at: Date.now() }));
  const connectedPromise = waitForEvent(socket, 'connect', 30000);
  const start = performance.now();
  socket.connect();
  try {
    const connected = await connectedPromise;
    return { socket, index, connectMs: connected.at - start, connectAt: connected.at };
  } catch (error) {
    socket.close();
    errors.connectTimeouts.push({ index, message: error.message });
    return null;
  }
};

const joinRoom = async (client) => {
  const start = performance.now();
  const result = await emitAck(client.socket, 'room:join', { code: room.code }, 30000);
  if (!result?.ok) throw new Error(result?.message ?? 'room join failed');
  return { ms: performance.now() - start, bytes: JSON.stringify(result.data).length };
};

const measureRtt = async (clients) => {
  const values = [];
  const perClient = clients.map(() => []);
  for (let round = 0; round < rttRounds; round += 1) {
    await Promise.all(
      clients.map(async (client, index) => {
        const t0 = performance.now();
        try {
          const result = await emitAck(client.socket, 'sync:ping', { t0 }, 10000);
          if (!result?.ok) return;
          const rtt = performance.now() - t0;
          values.push(rtt);
          perClient[index].push(rtt);
        } catch {}
      }),
    );
    await sleep(300);
  }
  return { values, perClient };
};

const measureFanout = async (clients) => {
  const sender = clients[0];
  const listeners = clients.slice(1);
  const latencies = [];
  const rounds = [];
  for (let round = 0; round < fanoutRounds; round += 1) {
    const waits = listeners.map((client) =>
      waitForEvent(client.socket, 'reactions:summary', 5000)
        .then((event) => ({ ok: true, at: event.at }))
        .catch((error) => ({ ok: false, error: error.message })),
    );
    const sentAt = performance.now();
    let ackMs = null;
    try {
      const ack = await emitAck(sender.socket, 'reaction:send', { emoji: emojis[round % emojis.length] }, 10000);
      ackMs = performance.now() - sentAt;
      if (!ack?.ok) rounds.push({ round, ackOk: false, message: ack?.message ?? null });
    } catch (error) {
      rounds.push({ round, ackOk: false, message: error.message });
    }
    const received = await Promise.all(waits);
    const roundLatencies = received.filter((row) => row.ok).map((row) => row.at - sentAt);
    latencies.push(...roundLatencies);
    rounds.push({
      round,
      sentAt: Math.round(sentAt),
      ackMs: ackMs === null ? null : Math.round(ackMs * 100) / 100,
      received: roundLatencies.length,
      missing: received.length - roundLatencies.length,
      p50: roundLatencies.length ? Math.round(percentile(roundLatencies, 50) * 100) / 100 : null,
      p95: roundLatencies.length ? Math.round(percentile(roundLatencies, 95) * 100) / 100 : null,
      max: roundLatencies.length ? Math.round(Math.max(...roundLatencies) * 100) / 100 : null,
      skew: roundLatencies.length ? Math.round((Math.max(...roundLatencies) - Math.min(...roundLatencies)) * 100) / 100 : null,
    });
    await sleep(1000);
  }
  return { latencies, rounds };
};

const measureReconnect = async (client, errors) => {
  const connectedPromise = waitForEvent(client.socket, 'connect', 30000);
  const reconnectStart = performance.now();
  client.socket.io.engine.close();
  try {
    await connectedPromise;
    const reconnectMs = performance.now() - reconnectStart;
    const joined = await joinRoom(client);
    return { ok: true, reconnectMs: Math.round(reconnectMs * 100) / 100, rejoinMs: Math.round(joined.ms * 100) / 100 };
  } catch (error) {
    errors.reconnectFailures.push({ message: error.message });
    return { ok: false, error: error.message };
  }
};

const offsetsFor = async (clients, rounds = 5) => {
  const offsets = clients.map(() => []);
  for (let round = 0; round < rounds; round += 1) {
    await Promise.all(
      clients.map(async (client, index) => {
        const t0 = performance.now();
        try {
          const result = await emitAck(client.socket, 'sync:ping', { t0 }, 10000);
          if (!result?.ok) return;
          const t1 = performance.now();
          const offset = result.data.serverNow - (t0 + t1) / 2;
          offsets[index].push(offset);
        } catch {}
      }),
    );
    await sleep(200);
  }
  return offsets.map((values) => (values.length ? percentile(values, 50) : 0));
};

const measurePlayback = async (clients, errors, durationMs) => {
  if (!queueItem) return { skipped: 'no queue item' };
  const host = clients[0];
  const listeners = clients.slice(1);
  const offsets = await offsetsFor(clients);
  const start = await emitAck(host.socket, 'playback:play', { positionMs: 0 }, 20000);
  if (!start?.ok) {
    errors.playbackErrors.push({ message: start?.message ?? 'playback start failed' });
    return { skipped: start?.message ?? 'playback start failed' };
  }
  const hostStart = performance.now();
  const state = start.data;
  if (state.status !== 'PLAYING') {
    errors.playbackErrors.push({ message: 'no playable queue item' });
    return { skipped: 'no playable queue item', state };
  }
  let latestState = state;
  const samples = [];
  const updateRounds = [];
  const latencyBuckets = [];
  let joinWriteProbe = null;
  if (listeners[0]) {
    const firstJoin = await emitAck(listeners[0].socket, 'room:join', { code: room.code }, 20000);
    await sleep(1500);
    const secondJoin = await emitAck(listeners[0].socket, 'room:join', { code: room.code }, 20000);
    if (firstJoin?.ok && secondJoin?.ok) {
      joinWriteProbe = {
        firstUpdatedAt: firstJoin.data.playback.updatedAt,
        secondUpdatedAt: secondJoin.data.playback.updatedAt,
        firstPositionMs: firstJoin.data.playback.positionMs,
        secondPositionMs: secondJoin.data.playback.positionMs,
        updatedAtChanged: firstJoin.data.playback.updatedAt !== secondJoin.data.playback.updatedAt,
        deltaMs: secondJoin.data.playback.updatedAt - firstJoin.data.playback.updatedAt,
      };
    }
  }
  const startedAt = Date.now();
  let nextSeekAt = 30000;
  let nextPingAt = 0;
  while (Date.now() - startedAt < durationMs) {
    await sleep(10000);
    const elapsed = Date.now() - startedAt;
    if (elapsed >= nextSeekAt && elapsed < durationMs - 5000) {
      const waits = listeners.map((client) =>
        waitForEvent(client.socket, 'playback:updated', 5000)
          .then((event) => ({ ok: true, at: event.at, data: event.data }))
          .catch((error) => ({ ok: false, error: error.message })),
      );
      const sentAt = performance.now();
      let ackMs = null;
      try {
        const ack = await emitAck(host.socket, 'playback:seek', { positionMs: nextSeekAt }, 20000);
        ackMs = performance.now() - sentAt;
        if (!ack?.ok) errors.playbackErrors.push({ message: ack?.message ?? 'seek failed' });
      } catch (error) {
        errors.playbackErrors.push({ message: error.message });
      }
      const received = await Promise.all(waits);
      const latencies = received.filter((row) => row.ok).map((row) => row.at - sentAt);
      const stateRows = received.filter((row) => row.ok).map((row) => row.data);
      const updateState = stateRows[0] ?? null;
      if (updateState) latestState = updateState;
      const hostPosition = nextSeekAt + (performance.now() - sentAt);
      const driftValues = [];
      if (updateState) {
        received.forEach((row, index) => {
          if (!row.ok) return;
          const offset = offsets[index + 1] ?? 0;
          const projected = updateState.positionMs + (performance.now() + offset - updateState.updatedAt);
          driftValues.push(projected - hostPosition);
        });
      }
      updateRounds.push({
        elapsedMs: elapsed,
        ackMs: ackMs === null ? null : Math.round(ackMs * 100) / 100,
        received: latencies.length,
        missing: received.length - latencies.length,
        p50: latencies.length ? Math.round(percentile(latencies, 50) * 100) / 100 : null,
        p95: latencies.length ? Math.round(percentile(latencies, 95) * 100) / 100 : null,
        max: latencies.length ? Math.round(Math.max(...latencies) * 100) / 100 : null,
        skew: latencies.length ? Math.round((Math.max(...latencies) - Math.min(...latencies)) * 100) / 100 : null,
        driftP50: driftValues.length ? Math.round(percentile(driftValues, 50) * 100) / 100 : null,
        driftMaxAbs: driftValues.length ? Math.round(Math.max(...driftValues.map(Math.abs)) * 100) / 100 : null,
      });
      nextSeekAt += 30000;
    }
    const sampleNow = performance.now();
    const hostPosition = (Date.now() - startedAt);
    if (elapsed >= nextPingAt) {
      const values = [];
      await Promise.all(
        clients.map(async (client) => {
          const t0 = performance.now();
          try {
            const result = await emitAck(client.socket, 'sync:ping', { t0 }, 10000);
            if (result?.ok) values.push(performance.now() - t0);
          } catch {}
        }),
      );
      latencyBuckets.push({
        minute: Math.floor(elapsed / 60000),
        n: values.length,
        p50: values.length ? Math.round(percentile(values, 50) * 100) / 100 : null,
        p95: values.length ? Math.round(percentile(values, 95) * 100) / 100 : null,
      });
      nextPingAt += 15000;
    }
    const drift = [];
    for (let index = 1; index < clients.length; index += 1) {
      const offset = offsets[index] ?? 0;
      const projected = latestState.positionMs + (sampleNow + offset - latestState.updatedAt);
      drift.push(projected - hostPosition);
    }
    samples.push({
      elapsedMs: Date.now() - startedAt,
      driftP50: drift.length ? Math.round(percentile(drift, 50) * 100) / 100 : null,
      driftP95: drift.length ? Math.round(percentile(drift, 95) * 100) / 100 : null,
      driftMaxAbs: drift.length ? Math.round(Math.max(...drift.map(Math.abs)) * 100) / 100 : null,
      hostElapsedMs: Math.round(hostPosition),
    });
  }
  try {
    await emitAck(host.socket, 'playback:pause', { positionMs: Math.max(Date.now() - startedAt - 1000, 0) }, 20000);
  } catch {}
  const allDrift = samples.map((row) => row.driftP50).filter((value) => typeof value === 'number');
  return {
    samples,
    updateRounds,
    latencyBuckets,
    joinWriteProbe,
    driftP50: allDrift.length ? Math.round(percentile(allDrift, 50) * 100) / 100 : null,
    driftP95: allDrift.length ? Math.round(percentile(allDrift, 95) * 100) / 100 : null,
    driftMaxAbs: samples.length ? Math.max(...samples.map((row) => row.driftMaxAbs ?? 0)) : null,
    stateAtStart: state,
    hostStartMs: Math.round(hostStart),
  };
};

const runLevel = async (level) => {
  const errors = {
    connectErrors: [],
    connectTimeouts: [],
    roomErrors: [],
    disconnects: [],
    reconnectFailures: [],
    playbackErrors: [],
    joinFailures: [],
  };
  const clients = [];
  const connectPromises = [];
  for (let index = 0; index < level; index += 1) {
    connectPromises.push(connectClient(index, errors));
    await sleep(50);
  }
  const connected = (await Promise.all(connectPromises)).filter(Boolean);
  const connectTimes = connected.map((client) => client.connectMs);
  const joinTimes = [];
  const joinBytes = [];
  await Promise.all(
    connected.map(async (client) => {
      try {
        const joined = await joinRoom(client);
        joinTimes.push(joined.ms);
        joinBytes.push(joined.bytes);
      } catch (error) {
        errors.joinFailures.push({ index: client.index, message: error.message });
      }
    }),
  );
  const active = connected.filter((client) => !errors.joinFailures.some((row) => row.index === client.index));
  if (active.length < 2) {
    for (const client of connected) client.socket.disconnect();
    return {
      level,
      connected: connected.length,
      active: active.length,
      connectMs: stats(connectTimes),
      joinMs: stats(joinTimes),
      joinBytes: stats(joinBytes),
      errors,
    };
  }
  const rtt = await measureRtt(active);
  const fanout = await measureFanout(active);
  const reconnect = await measureReconnect(active[1], errors);
  const playback = await measurePlayback(active, errors, holdMs);
  for (const client of active) client.socket.disconnect();
  await sleep(1000);
  const disconnectReasons = errors.disconnects
    .filter((row) => row.reason !== 'client namespace disconnect')
    .reduce((acc, row) => {
      acc[row.reason] = (acc[row.reason] ?? 0) + 1;
      return acc;
    }, {});
  return {
    level,
    connected: connected.length,
    active: active.length,
    connectMs: stats(connectTimes),
    joinMs: stats(joinTimes),
    joinBytes: stats(joinBytes),
    rttMs: stats(rtt.values),
    rttPerClient: rtt.perClient.map((values) => stats(values)),
    fanoutMs: stats(fanout.latencies),
    fanoutRounds: fanout.rounds,
    reconnect,
    playback,
    errors,
    disconnectReasons,
  };
};

const results = [];
for (const level of levels) {
  process.stdout.write(`level ${level}\n`);
  results.push(await runLevel(level));
  await sleep(3000);
}
await fs.writeFile('results/realtime.json', JSON.stringify({ room: room.code, levels, holdMs, results }, null, 2));
for (const result of results) {
  console.log(
    JSON.stringify({
      level: result.level,
      connected: result.connected,
      active: result.active,
      connect: result.connectMs,
      join: result.joinMs,
      rtt: result.rttMs,
      fanout: result.fanoutMs,
      reconnect: result.reconnect,
      drift: result.playback?.driftP50 ?? null,
      driftMax: result.playback?.driftMaxAbs ?? null,
      errors: {
        connect: result.errors.connectErrors.length,
        timeouts: result.errors.connectTimeouts.length,
        joins: result.errors.joinFailures.length,
        disconnects: result.disconnectReasons,
        playback: result.errors.playbackErrors.length,
      },
    }),
  );
}
