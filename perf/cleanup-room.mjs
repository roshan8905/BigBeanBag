import fs from 'node:fs/promises';
import { loadEnv, request } from './lib.mjs';

const env = await loadEnv();
const file = 'results/test-room.json';
const room = JSON.parse(await fs.readFile(file, 'utf8'));
const response = await request(env.BASE_URL, `/api/rooms/${room.code}`, {
  method: 'DELETE',
  cookie: env.SESSION_COOKIE,
});
console.log(JSON.stringify({ code: room.code, status: response.status, ms: Math.round(response.ms) }));
if (response.status === 204 || response.status === 404) await fs.rm(file);
else process.exit(1);
