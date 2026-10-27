import fs from 'node:fs/promises';
import path from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const url = process.env.BASE_URL ?? 'https://bigbeanbag.vercel.app/';
const runs = Number(process.env.RUNS ?? 5);
const outDir = path.resolve('results/lighthouse');
const summaryFile = path.resolve('results/lighthouse-summary.json');
const metrics = [
  ['performance', 'categories', 'performance'],
  ['accessibility', 'categories', 'accessibility'],
  ['bestPractices', 'categories', 'best-practices'],
  ['seo', 'categories', 'seo'],
  ['lcp', 'audits', 'largest-contentful-paint'],
  ['tbt', 'audits', 'total-blocking-time'],
  ['cls', 'audits', 'cumulative-layout-shift'],
  ['fcp', 'audits', 'first-contentful-paint'],
  ['ttfb', 'audits', 'server-response-time'],
  ['speedIndex', 'audits', 'speed-index'],
  ['totalByteWeight', 'audits', 'total-byte-weight'],
  ['unusedJs', 'audits', 'unused-javascript'],
  ['renderBlocking', 'audits', 'render-blocking-resources'],
  ['lcpElement', 'audits', 'largest-contentful-paint-element'],
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const read = (lhr, group, id) => {
  if (group === 'categories') return lhr.categories[id]?.score ?? null;
  const audit = lhr.audits[id];
  if (!audit) return null;
  if (audit.numericValue !== undefined) return audit.numericValue;
  return audit.score ?? null;
};

const networkSummary = (lhr) => {
  const items = lhr.audits['network-requests']?.details?.items ?? [];
  return items
    .map((item) => ({
      url: item.url,
      type: item.resourceType,
      status: item.statusCode,
      protocol: item.protocol ?? null,
      transferBytes: item.transferSize,
      resourceBytes: item.resourceSize,
      durationMs: Math.round((item.networkEndTime - item.networkRequestTime) * 10) / 10,
      startMs: Math.round(item.networkRequestTime * 10) / 10,
    }))
    .sort((a, b) => b.transferBytes - a.transferBytes);
};

const runOne = async (profile, index) => {
  const desktop = profile === 'desktop';
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  try {
    const options = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port,
      formFactor: desktop ? 'desktop' : 'mobile',
      screenEmulation: desktop
        ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
        : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
      throttlingMethod: 'simulate',
      throttling: desktop
        ? { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 }
        : { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4, requestLatencyMs: 562.5, downloadThroughputKbps: 1474.56, uploadThroughputKbps: 675 },
    };
    const result = await lighthouse(url, options);
    const lhr = result.lhr;
    await fs.writeFile(
      path.join(outDir, `${profile}-${index + 1}.json`),
      JSON.stringify(lhr),
    );
    const row = { profile, run: index + 1, finalUrl: lhr.finalDisplayedUrl };
    for (const [key, group, id] of metrics) row[key] = read(lhr, group, id);
    row.network = networkSummary(lhr);
    row.lcpElement = lhr.audits['largest-contentful-paint-element']?.details?.items ?? null;
    row.renderBlocking = lhr.audits['render-blocking-resources']?.details?.items ?? [];
    row.unusedJsItems = lhr.audits['unused-javascript']?.details?.items ?? [];
    row.diagnostics = {
      mainThreadWork: lhr.audits['mainthread-work-breakdown']?.numericValue ?? null,
      bootupTime: lhr.audits['bootup-time']?.numericValue ?? null,
      domSize: lhr.audits['dom-size']?.numericValue ?? null,
      thirdParty: lhr.audits['third-parties']?.details?.items ?? [],
      lcpPhases: lhr.audits['largest-contentful-paint']?.details?.items ?? [],
    };
    return row;
  } finally {
    await chrome.kill();
  }
};

await fs.mkdir(outDir, { recursive: true });
const rows = [];
for (const profile of ['mobile', 'desktop']) {
  for (let i = 0; i < runs; i += 1) {
    process.stdout.write(`${profile} run ${i + 1}/${runs}\n`);
    rows.push(await runOne(profile, i));
  }
}

const medians = {};
for (const profile of ['mobile', 'desktop']) {
  const subset = rows.filter((row) => row.profile === profile);
  medians[profile] = {};
  for (const [key] of metrics) {
    const values = subset.map((row) => row[key]).filter((value) => typeof value === 'number');
    medians[profile][key] = values.length ? median(values) : null;
  }
}

await fs.writeFile(summaryFile, JSON.stringify({ url, runs, medians, rows }, null, 2));
process.stdout.write(`${JSON.stringify(medians, null, 2)}\n`);
