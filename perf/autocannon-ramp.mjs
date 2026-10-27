import fs from 'node:fs/promises';
import autocannon from 'autocannon';
import { loadEnv } from './lib.mjs';

const env = await loadEnv();
const stages = [
  { connections: 10, overallRate: 2, duration: 10 },
  { connections: 10, overallRate: 5, duration: 10 },
  { connections: 10, overallRate: 10, duration: 10 },
  { connections: 20, overallRate: 15, duration: 10 },
  { connections: 50, overallRate: 20, duration: 20 },
  { connections: 50, overallRate: 20, duration: 20 },
];
const endpoints = [
  { name: 'auth-config', path: '/api/auth/config' },
  { name: 'health', path: '/api/health' },
];
const results = [];
for (const endpoint of endpoints) {
  for (const stage of stages) {
    process.stdout.write(`${endpoint.name} c=${stage.connections} rps=${stage.overallRate}\n`);
    const result = await autocannon({
      url: `${env.BASE_URL}${endpoint.path}`,
      connections: stage.connections,
      overallRate: stage.overallRate,
      duration: stage.duration,
      workers: 1,
      timeout: 30,
      headers: { 'user-agent': 'bigbeanbag-perf-audit' },
    });
    results.push({
      endpoint: endpoint.name,
      path: endpoint.path,
      connections: stage.connections,
      targetRps: stage.overallRate,
      duration: stage.duration,
      requests: result.requests,
      latency: result.latency,
      throughput: result.throughput,
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
      resets: result.resets,
    });
  }
}
await fs.writeFile('results/autocannon.json', JSON.stringify(results, null, 2));
for (const row of results) {
  console.log(
    `${row.endpoint.padEnd(12)} c=${String(row.connections).padStart(2)} target=${String(row.targetRps).padStart(2)}rps actual=${Math.round(row.requests.average)}rps p50=${row.latency.p50}ms p95=${row.latency.p95}ms p99=${row.latency.p99}ms max=${row.latency.max}ms err=${row.errors} non2xx=${row.non2xx} timeouts=${row.timeouts}`,
  );
}
