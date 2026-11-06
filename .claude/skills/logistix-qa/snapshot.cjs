#!/usr/bin/env node
// Read-only fingerprint of the Logistix and logistix-app repositories for the QA pre/post check.
//   node snapshot.cjs                    print the fingerprint to stdout
//   node snapshot.cjs --compare <file>   compare the current state with a saved fingerprint
//                                        (exit 0 = match, exit 1 = differences listed)
//   node snapshot.cjs --tmpdir           print the approved QA temp folder
// Covers HEAD, branch, all refs, stashes, staged and unstaged diffs, and the content hash of every
// modified/untracked file plus the repo-root .env* files (hashes only). QA_REPORT.md is excluded.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const REPOS = [
  ['web', ROOT],
  ['mobile', path.resolve(ROOT, '..', 'logistix-app')],
];
const QA_TMP = path.join(os.tmpdir(), 'logistix-qa');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
function git(cwd, args) {
  return execFileSync('git', ['--no-optional-locks', '-C', cwd, ...args], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], // keep Git's CRLF warnings out of the fingerprint output
  });
}
function fileHash(abs) {
  try {
    const st = fs.lstatSync(abs);
    if (st.isDirectory()) return 'DIR';
    if (st.isSymbolicLink()) return `LINK:${fs.readlinkSync(abs)}`;
    return sha(fs.readFileSync(abs));
  } catch {
    return 'MISSING';
  }
}

function fingerprint() {
  const lines = [];
  for (const [name, dir] of REPOS) {
    if (!fs.existsSync(path.join(dir, '.git'))) {
      lines.push(`${name} REPO absent`);
      continue;
    }
    const out = (args) => git(dir, args).toString('utf8').trim();
    let head = 'NONE';
    try {
      head = out(['rev-parse', 'HEAD']);
    } catch {}
    lines.push(`${name} HEAD ${head}`);
    lines.push(`${name} BRANCH ${out(['branch', '--show-current']) || '(detached)'}`);
    lines.push(`${name} REFS ${sha(git(dir, ['for-each-ref', '--format=%(refname) %(objectname)']))}`);
    lines.push(`${name} STASH ${sha(git(dir, ['stash', 'list', '--format=%H']))}`);
    lines.push(`${name} STAGED ${sha(git(dir, ['diff', '--cached', '--binary', '--', '.', ':(exclude)QA_REPORT.md']))}`);
    lines.push(`${name} UNSTAGED ${sha(git(dir, ['diff', '--binary', '--', '.', ':(exclude)QA_REPORT.md']))}`);
    const status = git(dir, ['status', '--porcelain=v1', '-z', '-uall'])
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
    const files = [];
    for (let i = 0; i < status.length; i++) {
      const entry = status[i];
      const code = entry.slice(0, 2);
      const rel = entry.slice(3);
      if (code[0] === 'R' || code[0] === 'C') i++; // skip rename source
      if (name === 'web' && rel === 'QA_REPORT.md') continue;
      files.push(`${name} FILE ${code.replace(/ /g, '.')} ${rel} ${fileHash(path.join(dir, rel))}`);
    }
    for (const f of fs.readdirSync(dir)) {
      if (/^\.env/.test(f)) files.push(`${name} FILE !! ${f} ${fileHash(path.join(dir, f))}`);
    }
    lines.push(...files.sort());
  }
  return lines;
}

const argv = process.argv.slice(2);
if (argv[0] === '--tmpdir') {
  const msys = QA_TMP.replace(/^([A-Za-z]):\\/, (_, d) => `/${d.toLowerCase()}/`).replace(/\\/g, '/');
  console.log(`${QA_TMP}\n${msys}`);
} else if (argv[0] === '--compare') {
  if (!argv[1]) {
    console.error('usage: node snapshot.cjs --compare <saved-fingerprint-file>');
    process.exit(2);
  }
  const before = fs.readFileSync(argv[1], 'utf8').split(/\r?\n/).filter(Boolean);
  const after = fingerprint();
  const a = new Set(before);
  const b = new Set(after);
  const gone = before.filter((l) => !b.has(l));
  const added = after.filter((l) => !a.has(l));
  if (!gone.length && !added.length) {
    console.log(`SNAPSHOT MATCH (${after.length} entries; QA_REPORT.md excluded)`);
  } else {
    console.log('SNAPSHOT MISMATCH');
    for (const l of gone) console.log(`- ${l}`);
    for (const l of added) console.log(`+ ${l}`);
    process.exit(1);
  }
} else {
  console.log(fingerprint().join('\n'));
}
