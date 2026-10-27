import fs from 'node:fs/promises';

export const loadEnv = async () => {
  const text = await fs.readFile(new URL('./.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0) env[line.slice(0, index)] = line.slice(index + 1);
  }
  return env;
};

export const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
};

export const stats = (values) => {
  if (!values.length) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    min: Math.round(Math.min(...values) * 100) / 100,
    p50: Math.round(percentile(values, 50) * 100) / 100,
    p95: Math.round(percentile(values, 95) * 100) / 100,
    p99: Math.round(percentile(values, 99) * 100) / 100,
    max: Math.round(Math.max(...values) * 100) / 100,
    mean: Math.round((sum / values.length) * 100) / 100,
  };
};

export const request = async (baseUrl, path, options = {}) => {
  const headers = { ...(options.headers ?? {}) };
  if (options.cookie) headers.Cookie = `bbb.sid=${options.cookie}`;
  if (options.body) headers['Content-Type'] = 'application/json';
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeout ?? 30000),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      ms: performance.now() - started,
      bytes: Buffer.byteLength(text),
      headers: {
        cacheControl: response.headers.get('cache-control'),
        contentEncoding: response.headers.get('content-encoding'),
        serverTiming: response.headers.get('server-timing'),
        vercelCache: response.headers.get('x-vercel-cache'),
        vercelId: response.headers.get('x-vercel-id'),
      },
      body: text,
    };
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - started, bytes: 0, error: error.message, body: '' };
  }
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
