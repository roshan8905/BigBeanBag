import fs from 'node:fs/promises';
import { loadEnv, request, sleep, stats } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const first = await request(env.BASE_URL, '/api/health', { timeout: 60000 });
let firstBody = null;
try {
  firstBody = JSON.parse(first.body);
} catch {}
const warmHealth = [];
for (let i = 0; i < 10; i += 1) {
  const response = await request(env.BASE_URL, '/api/health');
  warmHealth.push(Math.round(response.ms * 100) / 100);
  await sleep(1000);
}
const warmProbes = [];
for (const probe of [
  { name: 'auth-me', path: '/api/auth/me', cookie: env.SESSION_COOKIE },
  { name: 'rooms', path: '/api/rooms', cookie: env.SESSION_COOKIE },
  { name: 'room-detail', path: `/api/rooms/${room.code}`, cookie: env.SESSION_COOKIE },
]) {
  const values = [];
  for (let i = 0; i < 5; i += 1) {
    const response = await request(env.BASE_URL, probe.path, probe);
    values.push({ ms: Math.round(response.ms * 100) / 100, status: response.status });
    await sleep(1000);
  }
  warmProbes.push({
    name: probe.name,
    path: probe.path,
    values,
    stats: stats(values.map((row) => row.ms)),
  });
}
const summary = {
  firstHealth: {
    ms: Math.round(first.ms * 100) / 100,
    status: first.status,
    region: first.headers?.vercelId?.split('::')[1] ?? null,
    cache: first.headers?.vercelCache ?? null,
    uptimeSeconds: firstBody?.uptimeSeconds ?? null,
    body: firstBody,
  },
  warmHealth: stats(warmHealth),
  warmProbes,
};
await fs.writeFile('results/cold-start.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
