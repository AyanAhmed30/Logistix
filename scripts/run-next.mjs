// Starts Next.js from this folder's real path.
//
// Windows accepts any letter case in a path, so a terminal opened at
// "c:\...\mega\logistix" works for most tools. Turbopack does not: it stores
// paths in its dev cache (.next/dev/cache) and later fails to resolve
// "tailwindcss" when the spelling changes between runs. Running Next.js from
// the canonical path keeps every run consistent, wherever it was started from.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const appDir = realpathSync.native(fileURLToPath(new URL('..', import.meta.url)));
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');

const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  cwd: appDir,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
