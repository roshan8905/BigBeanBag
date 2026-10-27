import fs from 'node:fs/promises';

const stats = JSON.parse(await fs.readFile('results/bundle-stats.json', 'utf8'));
const manifest = JSON.parse(
  await fs.readFile('results/bundle-dist/.vite/manifest.json', 'utf8'),
);

const packageOf = (id) => {
  const normalized = id.replaceAll('\\', '/');
  const pnpm = normalized.match(/node_modules\/\.pnpm\/(@[^/]+\+[^/@]+|[^/@]+)@/);
  if (pnpm) return pnpm[1].replace('+', '/');
  const plain = normalized.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (plain) return plain[1];
  if (normalized.includes('/packages/client/src/')) return '(app source)';
  if (normalized.includes('/packages/shared/')) return '@bigbeanbag/shared';
  if (normalized.startsWith('\0vite') || normalized.includes('vite/preload')) return '(vite runtime)';
  return '(other)';
};

const chunks = {};
const packages = {};
const modules = [];

for (const [uid, meta] of Object.entries(stats.nodeMetas)) {
  const size = Object.values(meta.moduleParts).reduce(
    (total, partUid) => total + (stats.nodeParts[partUid]?.renderedLength ?? 0),
    0,
  );
  const gzip = Object.values(meta.moduleParts).reduce(
    (total, partUid) => total + (stats.nodeParts[partUid]?.gzipLength ?? 0),
    0,
  );
  if (!size) continue;
  const pkg = packageOf(meta.id);
  packages[pkg] = packages[pkg] ?? { bytes: 0, gzip: 0, modules: 0 };
  packages[pkg].bytes += size;
  packages[pkg].gzip += gzip;
  packages[pkg].modules += 1;
  for (const [chunk, partUid] of Object.entries(meta.moduleParts)) {
    const part = stats.nodeParts[partUid];
    chunks[chunk] = chunks[chunk] ?? { bytes: 0, gzip: 0, modules: 0 };
    chunks[chunk].bytes += part?.renderedLength ?? 0;
    chunks[chunk].gzip += part?.gzipLength ?? 0;
    chunks[chunk].modules += 1;
  }
  modules.push({ id: meta.id, package: pkg, bytes: size, gzip });
}

const kb = (value) => Math.round((value / 1024) * 10) / 10;
const packageRows = Object.entries(packages)
  .map(([name, value]) => ({ name, kb: kb(value.bytes), gzipKb: kb(value.gzip), modules: value.modules }))
  .sort((a, b) => b.kb - a.kb);
const chunkRows = Object.entries(chunks)
  .map(([name, value]) => ({ name, kb: kb(value.bytes), gzipKb: kb(value.gzip), modules: value.modules }))
  .sort((a, b) => b.kb - a.kb);
const moduleRows = modules
  .map((row) => ({ ...row, kb: kb(row.bytes), gzipKb: kb(row.gzip) }))
  .sort((a, b) => b.kb - a.kb)
  .slice(0, 25);

const dynamicImports = Object.values(manifest)
  .flatMap((entry) => entry.dynamicImports ?? []);
const result = {
  totalKb: kb(modules.reduce((sum, row) => sum + row.bytes, 0)),
  totalGzipKb: kb(modules.reduce((sum, row) => sum + row.gzip, 0)),
  chunks: chunkRows,
  packages: packageRows,
  modules: moduleRows,
  manifest,
  dynamicImports,
  entryChunks: Object.values(manifest).map((entry) => ({
    file: entry.file,
    isEntry: entry.isEntry,
    imports: entry.imports ?? [],
    dynamicImports: entry.dynamicImports ?? [],
  })),
};
await fs.writeFile('results/bundle-report.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, manifest: undefined }, null, 2));
