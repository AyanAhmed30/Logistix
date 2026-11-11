// Starts Next.js from this folder's real path.
//
// Windows accepts any letter case in a path, so a terminal opened at
// "c:\...\mega\logistix" works for most tools. Turbopack does not: it stores
// paths in its dev cache (.next/dev/cache) and later fails to resolve
// "tailwindcss" when the spelling changes between runs. Running Next.js from
// the canonical path keeps every run consistent, wherever it was started from.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = realpathSync.native(fileURLToPath(new URL('..', import.meta.url)));
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
const command = process.argv[2];

// A dev cache written under another spelling of this folder keeps the wrong
// paths forever, so drop it once and record which path the cache belongs to.
if (command === 'dev') {
  const cacheDir = join(appDir, '.next', 'dev', 'cache');
  const marker = join(cacheDir, 'logistix-root.txt');
  let recorded = null;
  try {
    recorded = readFileSync(marker, 'utf8');
  } catch {
    // No marker yet: the cache predates this launcher.
  }
  if (recorded !== appDir) {
    try {
      rmSync(join(cacheDir, 'turbopack'), { recursive: true, force: true });
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(marker, appDir);
      console.log('Cleared the Turbopack dev cache so it matches this folder. The first page load will be slower.');
    } catch (error) {
      console.warn(`Could not clear .next/dev/cache/turbopack (${error.code || error.message}). Stop any running "npm run dev" and try again.`);
    }
  }
}

const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  cwd: appDir,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
