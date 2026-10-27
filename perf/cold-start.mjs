import fs from 'node:fs/promises';
import { loadEnv, request, sleep, stats } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const probes = [
  { name: 'health-cold', path: '/api/health' },
  { name: 'auth-me-after-cold', path: '/api/auth/me', cookie: env.SESSION_COOKIE },
  { name: 'rooms-after-cold', path: '/api/rooms', cookie: env.SESSION_COOKIE },
  { name: 'room-detail-after-cold', path: `/api/rooms/${room.code}`, cookie: env.SESSION_COOKIE },
];
const results = [];
for (const probe of probes) {
  const first = await request(env.BASE_URL, probe.path, probe);
  await sleep(1000);
  const warm = [];
  for (let i = 0; i < 10; i += 1) {
    const response = await request(env.BASE_URL, probe.path, probe);
    warm.push(Math.round(response.ms * 100) / 100);
    await sleep(1000);
  }
  results.push({
    name: probe.name,
    path: probe.path,
    firstMs: Math.round(first.ms * 100) / 100,
    firstStatus: first.status,
    firstCache: first.headers?.vercelCache ?? null,
    firstRegion: first.headers?.vercelId?.split('::')[1] ?? null,
    warm: stats(warm),
  });
}
await fs.writeFile('results/cold-start.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
