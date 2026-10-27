import fs from 'node:fs/promises';

const data = JSON.parse(await fs.readFile('results/sme.json', 'utf8'));
const bundle = data.results[0];
const packageOf = (file) => {
  const normalized = file.replaceAll('\\', '/');
  const pnpm = normalized.match(/node_modules\/\.pnpm\/(@[^/]+\+[^/@]+|[^/@]+)@/);
  if (pnpm) return pnpm[1].replace('+', '/');
  const plain = normalized.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (plain) return plain[1];
  if (normalized.includes('/packages/client/src/')) return '(app source)';
  if (normalized.includes('/packages/shared/')) return '@bigbeanbag/shared';
  return '(other)';
};
const packages = {};
const files = [];
for (const [file, value] of Object.entries(bundle.files)) {
  const pkg = packageOf(file);
  packages[pkg] = (packages[pkg] ?? 0) + value.size;
  files.push({ file: file.replace(/^(\.\.\/)+/, ''), package: pkg, bytes: value.size });
}
const kb = (value) => Math.round((value / 1024) * 10) / 10;
const total = bundle.totalBytes;
const result = {
  totalBytes: total,
  totalKb: kb(total),
  unmappedBytes: total - Object.values(bundle.files).reduce((sum, value) => sum + value.size, 0),
  packages: Object.entries(packages)
    .map(([name, bytes]) => ({ name, bytes, kb: kb(bytes), percent: Math.round((bytes / total) * 1000) / 10 }))
    .sort((a, b) => b.bytes - a.bytes),
  files: files
    .map((row) => ({ ...row, kb: kb(row.bytes), percent: Math.round((row.bytes / total) * 1000) / 10 }))
    .sort((a, b) => b.bytes - a.bytes),
};
await fs.writeFile('results/sme-report.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, files: result.files.slice(0, 25) }, null, 2));
