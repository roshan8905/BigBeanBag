import fs from 'node:fs/promises';
import { loadEnv, request } from './lib.mjs';

const env = await loadEnv();
const baseUrl = env.BASE_URL;
const cookie = env.SESSION_COOKIE;
const file = 'results/test-room.json';

try {
  const existing = JSON.parse(await fs.readFile(file, 'utf8'));
  await request(baseUrl, `/api/rooms/${existing.code}`, { method: 'DELETE', cookie });
} catch {}

const name = `Perf Audit ${new Date().toISOString().slice(0, 19)}`;
const response = await request(baseUrl, '/api/rooms', {
  method: 'POST',
  cookie,
  body: { name, visibility: 'UNLISTED' },
});
if (response.status !== 201) {
  console.error(response.status, response.body);
  process.exit(1);
}
const detail = JSON.parse(response.body);
await fs.mkdir('results', { recursive: true });
await fs.writeFile(file, JSON.stringify({ code: detail.room.code, id: detail.room.id, name }, null, 2));
console.log(JSON.stringify({ code: detail.room.code, id: detail.room.id, createMs: Math.round(response.ms) }));
