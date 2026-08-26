#!/usr/bin/env node
/**
 * Verifies the production web build works with a GitHub Pages project-site
 * base path (e.g. /my-repo/). Builds apps/web into a temp directory and
 * asserts that index.html references assets under the base path.
 *
 * Usage: node scripts/check-pages-build.mjs [basePath]
 *   basePath defaults to /eternal-blocks/
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const webAppDir = resolve(here, '../apps/web');
const baseArg = process.argv[2] ?? '/eternal-blocks/';
const base = baseArg.startsWith('/') ? baseArg : `/${baseArg}`;
const normalized = base.endsWith('/') ? base : `${base}/`;

const outDir = mkdtempSync(join(tmpdir(), 'eb-pages-check-'));

console.log(`> building apps/web with base path "${normalized}"`);
execSync(`npx vite build --base "${normalized}" --outDir "${outDir}"`, {
  cwd: webAppDir,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE_PATH: normalized },
});

const indexHtml = readFileSync(join(outDir, 'index.html'), 'utf8');

const expectedAsset = `${normalized}assets/`;
if (!indexHtml.includes(expectedAsset)) {
  console.error(`✗ FAIL: index.html does not reference ${expectedAsset}`);
  console.error(indexHtml.slice(0, 800));
  process.exitCode = 1;
} else {
  console.log(`✓ OK: production build references assets at ${expectedAsset}`);
}

const faviconRef = indexHtml.includes('favicon.svg');
if (!faviconRef) {
  console.error('✗ FAIL: favicon.svg missing from built index.html');
  process.exitCode = 1;
}

// Also confirm the module entry exists on disk under the base path.
const assetMatch = /src="(\/[^"]+\.js)"/.exec(indexHtml);
if (assetMatch) {
  const url = assetMatch[1];
  const rel = url.startsWith(normalized) ? url.slice(normalized.length) : url.replace(/^\//, '');
  const assetOnDisk = join(outDir, rel);
  try {
    readFileSync(assetOnDisk);
    console.log(`✓ OK: entry bundle exists (${url})`);
  } catch {
    console.error(`✗ FAIL: entry bundle not found on disk: ${assetOnDisk}`);
    process.exitCode = 1;
  }
}

rmSync(outDir, { recursive: true, force: true });
if (process.exitCode) {
  console.error('Pages build-path check FAILED');
} else {
  console.log('Pages build-path check passed');
}
