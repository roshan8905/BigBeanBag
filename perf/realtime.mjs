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
const shortHoldMs = Number(process.env.SHORT_HOLD_MS ?? 45000);
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
    reconnection: false,
    reconnectionAttempts: 50,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000,
    timeout: 30000,
    extraHeaders: { Cookie: `bbb.sid=${env.SESSION_COOKIE}` },
  });
  const client = {
    socket,
    index,
    connectMs: null,
    connectAt: null,
    initialConnected: false,
    inRoom: false,
    autoRejoins: [],
    rejoinPromise: null,
  };
  socket.on('connect_error', (error) => errors.connectErrors.push({ index, message: error.message }));
  socket.on('room:error', (error) => errors.roomErrors.push({ index, message: error.message }));
  socket.on('disconnect', (reason) => {
    client.inRoom = false;
    errors.disconnects.push({ index, reason, at: Date.now() });
  });
  socket.on('connect', () => {
    if (!client.initialConnected) return;
    client.rejoinPromise = (async () => {
      const started = performance.now();
      try {
        const joined = await joinRoom(client);
        const record = { ok: true, ms: Math.round(joined.ms * 100) / 100, at: Date.now() };
        client.autoRejoins.push(record);
        return record;
      } catch (error) {
        const record = { ok: false, message: error.message, at: Date.now() };
        client.autoRejoins.push(record);
        errors.autoRejoinFailures.push({ index, message: error.message });
        return record;
      }
    })();
  });
  const connectedPromise = waitForEvent(socket, 'connect', 30000);
  const start = performance.now();
  socket.connect();
  try {
    const connected = await connectedPromise;
    client.connectMs = connected.at - start;
    client.connectAt = connected.at;
    client.initialConnected = true;
    return client;
  } catch (error) {
    socket.close();
    errors.connectTimeouts.push({ index, message: error.message });
    return null;
  }
};

const joinRoom = async (client) => {
  const start = performance.now();
  const result = await emitAck(client.socket, 'room:join', { code: room.code }, 30000);
  if (!result?.ok) {
    client.inRoom = false;
    throw new Error(result?.message ?? 'room join failed');
  }
  client.inRoom = true;
  return { ms: performance.now() - start, bytes: JSON.stringify(result.data).length, data: result.data };
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
  const present = clients.filter((client) => client.inRoom);
  const sender = present[0];
  const listeners = present.slice(1);
  const latencies = [];
  const rounds = [];
  if (!sender || !listeners.length) return { latencies, rounds, present: present.length };
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
    const auto = client.rejoinPromise;
    let rejoinMs;
    if (auto) {
      const record = await auto;
      if (!record.ok) throw new Error(record.message);
      rejoinMs = record.ms;
    } else {
      const joined = await joinRoom(client);
      rejoinMs = joined.ms;
    }
    return {
      ok: true,
      reconnectMs: Math.round(reconnectMs * 100) / 100,
      rejoinMs: Math.round(rejoinMs * 100) / 100,
    };
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
  const host = clients.find((client) => client.inRoom);
  if (!host) {
    errors.playbackErrors.push({ message: 'no host in room' });
    return { skipped: 'no host in room' };
  }
  let hostRejoinMs = null;
  if (!host.inRoom) {
    try {
      const rejoin = await joinRoom(host);
      hostRejoinMs = Math.round(rejoin.ms * 100) / 100;
    } catch (error) {
      errors.playbackErrors.push({ message: `host rejoin failed: ${error.message}` });
      return { skipped: `host rejoin failed: ${error.message}` };
    }
  }
  const listeners = clients.filter((client) => client !== host && client.inRoom);
  if (!listeners.length) {
    errors.playbackErrors.push({ message: 'no listeners in room' });
    return { skipped: 'no listeners in room', hostRejoinMs };
  }
  const playbackClients = [host, ...listeners];
  const offsets = await offsetsFor(playbackClients);
  let start = null;
  let startError = null;
  const startAttempts = [];
  const hostStartWait = waitForEvent(host.socket, 'playback:updated', 15000)
    .then((event) => ({ ok: true, at: event.at, data: event.data }))
    .catch(() => ({ ok: false }));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = performance.now();
    try {
      start = await emitAck(host.socket, 'playback:play', { positionMs: 0 }, 60000);
      startAttempts.push({
        attempt,
        ok: Boolean(start?.ok),
        ms: Math.round((performance.now() - started) * 100) / 100,
        message: start?.message ?? null,
      });
      if (start?.ok) break;
    } catch (error) {
      startError = error;
      startAttempts.push({
        attempt,
        ok: false,
        ms: Math.round((performance.now() - started) * 100) / 100,
        error: error.message,
      });
      break;
    }
    await sleep(2000);
  }
  let state = start?.ok ? start.data : null;
  let usedSnapshotFallback = false;
  if (!state || state.status !== 'PLAYING') {
    try {
      const snapshot = await joinRoom(host);
      if (snapshot.data?.playback?.status === 'PLAYING') {
        state = snapshot.data.playback;
        usedSnapshotFallback = true;
      }
    } catch {}
  }
  if (!state || state.status !== 'PLAYING') {
    errors.playbackErrors.push({
      message: startError?.message ?? start?.message ?? 'playback start failed',
    });
    return {
      skipped: startError?.message ?? start?.message ?? 'playback start failed',
      hostRejoinMs,
      startAttempts,
      startError: startError?.message ?? null,
    };
  }
  const hostStartEvent = usedSnapshotFallback ? { ok: false } : await hostStartWait;
  const hostStartAt = hostStartEvent.ok ? hostStartEvent.at : performance.now();
  let hostAnchorBase =
    (state.positionMs ?? 0) +
    (hostStartEvent.ok ? Math.max(hostStartAt + (offsets[0] ?? 0) - state.updatedAt, 0) : 0);
  let hostAnchorAt = hostStartAt;
  let latestState = state;
  const samples = [];
  const updateRounds = [];
  const latencyBuckets = [];
  const startedAt = performance.now();
  let nextSeekAt = 30000;
  let nextPingAt = 0;
  while (performance.now() - startedAt < durationMs) {
    await sleep(10000);
    const elapsed = performance.now() - startedAt;
    if (!host.socket.connected || listeners.filter((client) => client.socket.connected).length < Math.max(1, Math.floor(listeners.length * 0.5))) {
      errors.playbackErrors.push({ message: 'connections lost during hold', elapsedMs: elapsed });
      break;
    }
    if (elapsed >= nextSeekAt && elapsed < durationMs - 5000) {
      const waits = listeners.map((client) =>
        waitForEvent(client.socket, 'playback:updated', 5000)
          .then((event) => ({ ok: true, at: event.at, data: event.data }))
          .catch((error) => ({ ok: false, error: error.message })),
      );
      const hostWait = waitForEvent(host.socket, 'playback:updated', 10000)
        .then((event) => ({ ok: true, at: event.at, data: event.data }))
        .catch(() => ({ ok: false }));
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
      const hostReceived = await hostWait;
      const latencies = received.filter((row) => row.ok).map((row) => row.at - sentAt);
      const stateRows = received.filter((row) => row.ok).map((row) => row.data);
      const updateState = hostReceived.ok ? hostReceived.data : stateRows[0] ?? null;
      if (updateState) latestState = updateState;
      const hostEventAt = hostReceived.ok ? hostReceived.at : sentAt;
      const hostBase = updateState
        ? updateState.positionMs + Math.max(hostEventAt + (offsets[0] ?? 0) - updateState.updatedAt, 0)
        : nextSeekAt;
      const hostPosition = hostBase + (performance.now() - hostEventAt);
      hostAnchorAt = hostEventAt;
      hostAnchorBase = hostBase;
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
    const hostPosition = hostAnchorBase + (sampleNow - hostAnchorAt);
    if (elapsed >= nextPingAt) {
      const values = [];
      await Promise.all(
        playbackClients.map(async (client) => {
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
    for (let index = 1; index < playbackClients.length; index += 1) {
      const offset = offsets[index] ?? 0;
      const projected = latestState.positionMs + (sampleNow + offset - latestState.updatedAt);
      drift.push(projected - hostPosition);
    }
    samples.push({
      elapsedMs: Math.round(performance.now() - startedAt),
      driftP50: drift.length ? Math.round(percentile(drift, 50) * 100) / 100 : null,
      driftP95: drift.length ? Math.round(percentile(drift, 95) * 100) / 100 : null,
      driftMaxAbs: drift.length ? Math.round(Math.max(...drift.map(Math.abs)) * 100) / 100 : null,
      hostElapsedMs: Math.round(hostPosition),
    });
  }
  try {
    await emitAck(
      host.socket,
      'playback:pause',
      { positionMs: Math.max(hostAnchorBase + performance.now() - hostAnchorAt - 1000, 0) },
      20000,
    );
  } catch {}
  let joinWriteProbe = null;
  const probeClient = listeners.find((client) => client.inRoom && client.socket.connected);
  if (probeClient) {
    try {
      const firstJoin = await emitAck(probeClient.socket, 'room:join', { code: room.code }, 30000);
      await sleep(1500);
      const secondJoin = await emitAck(probeClient.socket, 'room:join', { code: room.code }, 30000);
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
    } catch (error) {
      errors.playbackErrors.push({ message: `join write probe failed: ${error.message}` });
    }
  }
  const allDrift = samples.map((row) => row.driftP50).filter((value) => typeof value === 'number');
  return {
    samples,
    updateRounds,
    latencyBuckets,
    joinWriteProbe,
    hostRejoinMs,
    startAttempts,
    startError: startError?.message ?? null,
    usedSnapshotFallback,
    driftP50: allDrift.length ? Math.round(percentile(allDrift, 50) * 100) / 100 : null,
    driftP95: allDrift.length ? Math.round(percentile(allDrift, 95) * 100) / 100 : null,
    driftMaxAbs: samples.length ? Math.max(...samples.map((row) => row.driftMaxAbs ?? 0)) : null,
    stateAtStart: state,
    hostStartMs: Math.round(hostStartAt),
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
    autoRejoinFailures: [],
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
  const reconnect =
    process.env.SKIP_RECONNECT === '1' ? { skipped: true } : await measureReconnect(active[1], errors);
  const levelHold = level >= 50 ? holdMs : Math.min(holdMs, shortHoldMs);
  let playback = null;
  try {
    playback = await measurePlayback(active, errors, levelHold);
  } catch (error) {
    errors.playbackErrors.push({ message: error.message });
    playback = { skipped: error.message };
  }
  const inRoomCount = active.filter((client) => client.inRoom).length;
  for (const client of active) client.socket.disconnect();
  await sleep(1000);
  const reconnectIndex = active[1]?.index;
  const disconnectReasons = errors.disconnects
    .filter((row) => row.reason !== 'client namespace disconnect' && row.reason !== 'io client disconnect')
    .filter((row) => row.index !== reconnectIndex)
    .reduce((acc, row) => {
      acc[row.reason] = (acc[row.reason] ?? 0) + 1;
      return acc;
    }, {});
  return {
    level,
    holdMs: levelHold,
    connected: connected.length,
    active: active.length,
    inRoom: inRoomCount,
    connectMs: stats(connectTimes),
    joinMs: stats(joinTimes),
    joinBytes: stats(joinBytes),
    rttMs: stats(rtt.values),
    rttPerClient: rtt.perClient.map((values) => stats(values)),
    fanoutMs: stats(fanout.latencies),
    fanoutRounds: fanout.rounds,
    reconnect,
    playback,
    autoRejoins: active.map((client) => ({
      index: client.index,
      total: client.autoRejoins.length,
      failures: client.autoRejoins.filter((row) => !row.ok).length,
    })),
    errors,
    disconnectReasons,
  };
};

const results = [];
for (const level of levels) {
  process.stdout.write(`level ${level}\n`);
  results.push(await runLevel(level));
  await fs.writeFile('results/realtime-partial.json', JSON.stringify({ room: room.code, levels, holdMs, results }, null, 2));
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
