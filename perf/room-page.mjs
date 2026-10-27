import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { loadEnv } from './lib.mjs';

const env = await loadEnv();
const room = JSON.parse(await fs.readFile('results/test-room.json', 'utf8'));
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = `${env.BASE_URL}/rooms/${room.code}`;
const youtubePattern = /(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com|google\.com)/i;

const launch = () =>
  puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

const instrument = async (page) => {
  await page.evaluateOnNewDocument(() => {
    window.__perf = { lcp: null, cls: 0, fcp: null, longTasks: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__perf.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') window.__perf.fcp = entry.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__perf.longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
  });
};

const run = async (browser, blockYoutube) => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
  await page.setCacheEnabled(false);
  await page.setCookie({
    name: 'bbb.sid',
    value: env.SESSION_COOKIE,
    domain: 'bigbeanbag.vercel.app',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  });
  await instrument(page);
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  const inflight = new Map();
  const requests = [];
  client.on('Network.requestWillBeSent', (event) => {
    inflight.set(event.requestId, {
      url: event.request.url,
      type: event.type,
      start: event.timestamp,
    });
  });
  client.on('Network.responseReceived', (event) => {
    const row = inflight.get(event.requestId);
    if (row) {
      row.status = event.response.status;
      row.mimeType = event.response.mimeType;
      row.fromCache = event.response.fromDiskCache || event.response.fromServiceWorker;
      row.protocol = event.response.protocol;
    }
  });
  client.on('Network.loadingFinished', (event) => {
    const row = inflight.get(event.requestId);
    if (row) {
      row.bytes = event.encodedDataLength;
      row.end = event.timestamp;
      row.durationMs = Math.round((row.end - row.start) * 1000 * 10) / 10;
      requests.push(row);
      inflight.delete(event.requestId);
    }
  });
  client.on('Network.loadingFailed', (event) => {
    const row = inflight.get(event.requestId);
    if (row) {
      row.error = event.errorText;
      row.blocked = event.blockedReason ?? null;
      requests.push(row);
      inflight.delete(event.requestId);
    }
  });
  if (blockYoutube) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (youtubePattern.test(request.url())) request.abort('blockedbyclient');
      else request.continue();
    });
  }
  const started = performance.now();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  const navigationMs = performance.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 15000));
  const perf = await page.evaluate(() => ({
    ...window.__perf,
    finalUrl: location.href,
    iframes: [...document.querySelectorAll('iframe')].map((frame) => frame.src),
    resources: performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      duration: Math.round(entry.duration * 10) / 10,
    })),
    navigation: performance.getEntriesByType('navigation')[0]
      ? {
          domContentLoaded: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd * 10) / 10,
          load: Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd * 10) / 10,
          responseStart: Math.round(performance.getEntriesByType('navigation')[0].responseStart * 10) / 10,
        }
      : null,
  }));
  await context.close();
  const youtubeRequests = requests.filter((row) => youtubePattern.test(row.url));
  const totalBytes = requests.reduce((sum, row) => sum + (row.bytes ?? 0), 0);
  const youtubeBytes = youtubeRequests.reduce((sum, row) => sum + (row.bytes ?? 0), 0);
  return {
    blockYoutube,
    navigationMs: Math.round(navigationMs * 100) / 100,
    perf,
    totalBytes,
    totalRequests: requests.length,
    youtubeBytes,
    youtubeRequestCount: youtubeRequests.length,
    topRequests: requests
      .map((row) => ({
        url: row.url,
        type: row.type,
        status: row.status ?? null,
        protocol: row.protocol ?? null,
        bytes: row.bytes ?? 0,
        durationMs: row.durationMs ?? null,
        error: row.error ?? null,
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 30),
    youtubeRequests: youtubeRequests
      .map((row) => ({ url: row.url, type: row.type, status: row.status ?? null, bytes: row.bytes ?? 0, durationMs: row.durationMs ?? null }))
      .sort((a, b) => b.bytes - a.bytes),
  };
};

const browser = await launch();
try {
  const withYoutube = await run(browser, false);
  const withoutYoutube = await run(browser, true);
  const result = { url, withYoutube, withoutYoutube };
  await fs.writeFile('results/room-page.json', JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      withYoutube: {
        navigationMs: withYoutube.navigationMs,
        totalBytes: withYoutube.totalBytes,
        requests: withYoutube.totalRequests,
        youtubeBytes: withYoutube.youtubeBytes,
        youtubeRequests: withYoutube.youtubeRequestCount,
        lcp: withYoutube.perf.lcp,
        cls: withYoutube.perf.cls,
        fcp: withYoutube.perf.fcp,
        longTasks: withYoutube.perf.longTasks.length,
        iframes: withYoutube.perf.iframes.length,
      },
      withoutYoutube: {
        navigationMs: withoutYoutube.navigationMs,
        totalBytes: withoutYoutube.totalBytes,
        requests: withoutYoutube.totalRequests,
        lcp: withoutYoutube.perf.lcp,
        cls: withoutYoutube.perf.cls,
        fcp: withoutYoutube.perf.fcp,
        longTasks: withoutYoutube.perf.longTasks.length,
      },
    }),
  );
} finally {
  await browser.close();
}
