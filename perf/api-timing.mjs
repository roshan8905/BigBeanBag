import fs from 'node:fs/promises';
import { loadEnv, request, sleep, stats } from './lib.mjs';

const env = await loadEnv();
const baseUrl = env.BASE_URL;
const cookie = env.SESSION_COOKIE;
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const samples = Number(process.env.SAMPLES ?? 30);
const intervalMs = Number(process.env.INTERVAL_MS ?? 1500);
const endpoints = [
  { name: 'health', path: '/api/health' },
  { name: 'auth-config', path: '/api/auth/config' },
  { name: 'auth-me-anon', path: '/api/auth/me' },
  { name: 'auth-me', path: '/api/auth/me', cookie },
  { name: 'rooms-list', path: '/api/rooms', cookie },
  { name: 'room-detail', path: `/api/rooms/${room.code}`, cookie },
  { name: 'room-members', path: `/api/rooms/${room.code}/members`, cookie },
  { name: 'room-invite', path: `/api/rooms/${room.code}/invite`, cookie },
  { name: 'room-join', path: '/api/rooms/join', method: 'POST', body: { code: room.code }, cookie },
];
const results = [];

for (const endpoint of endpoints) {
  process.stdout.write(`${endpoint.name}\n`);
  for (let i = 0; i < 2; i += 1) await request(baseUrl, endpoint.path, endpoint);
  const rows = [];
  for (let i = 0; i < samples; i += 1) {
    const response = await request(baseUrl, endpoint.path, endpoint);
    rows.push({
      ms: Math.round(response.ms * 100) / 100,
      status: response.status,
      bytes: response.bytes,
      cache: response.headers?.vercelCache ?? null,
      region: response.headers?.vercelId?.split('::')[1] ?? null,
      error: response.error ?? null,
    });
    if (i < samples - 1) await sleep(intervalMs);
  }
  const okRows = rows.filter((row) => row.status >= 200 && row.status < 300);
  results.push({
    name: endpoint.name,
    method: endpoint.method ?? 'GET',
    path: endpoint.path,
    authenticated: Boolean(endpoint.cookie),
    stats: stats(okRows.map((row) => row.ms)),
    errorRate: Math.round(((rows.length - okRows.length) / rows.length) * 10000) / 100,
    statuses: [...new Set(rows.map((row) => row.status))],
    bytes: okRows.length ? okRows[0].bytes : null,
    regions: [...new Set(rows.map((row) => row.region).filter(Boolean))],
    cache: [...new Set(rows.map((row) => row.cache).filter(Boolean))],
    rows,
  });
  await fs.writeFile('results/api-timing-partial.json', JSON.stringify({ baseUrl, samples, intervalMs, results }, null, 2));
  const current = results[results.length - 1];
  console.log(
    `${current.name.padEnd(14)} n=${current.stats.count} p50=${current.stats.p50}ms p95=${current.stats.p95}ms p99=${current.stats.p99}ms max=${current.stats.max}ms err=${current.errorRate}% status=${current.statuses.join(',')} bytes=${current.bytes} region=${current.regions.join(',')} cache=${current.cache.join(',')}`,
  );
}

await fs.writeFile('results/api-timing.json', JSON.stringify({ baseUrl, samples, intervalMs, results }, null, 2));
