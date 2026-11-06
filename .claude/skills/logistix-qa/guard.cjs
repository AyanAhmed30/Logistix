#!/usr/bin/env node
// PreToolUse guard for the logistix-qa agent.
// Reads the hook payload on stdin. Exit 0 = allow, exit 2 = block (stderr is shown to the agent).
// Allowlist policy: anything not explicitly permitted is blocked. Any internal error blocks.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MOBILE = path.resolve(ROOT, '..', 'logistix-app');
const REPORT = path.join(ROOT, 'QA_REPORT.md');
const QA_TMP = path.join(os.tmpdir(), 'logistix-qa');
const SKILL_DIR = __dirname;
const SAFE_ENV = process.env.LOGISTIX_QA_SAFE_ENV === '1';
const RO_BROWSER = SAFE_ENV || process.env.LOGISTIX_QA_READONLY_BROWSER === '1';
const PROBE = '__logistix_qa_guard_probe__';
const WIN = process.platform === 'win32';
let CWD = process.cwd(); // replaced by the session cwd from the hook payload

class Blocked extends Error {}
const block = (why) => {
  throw new Blocked(why);
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
function normPath(raw) {
  let s = String(raw || '').trim();
  if (/^\/tmp(\/|$)/i.test(s)) s = path.join(os.tmpdir(), s.slice(4));
  const msys = /^\/([a-z])(\/.*)?$/i.exec(s);
  if (msys) s = `${msys[1].toUpperCase()}:${msys[2] || '/'}`;
  const r = path.resolve(CWD, s);
  return WIN ? r.toLowerCase() : r;
}
const key = (p) => (WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
function within(p, dir) {
  const a = normPath(p);
  const d = key(dir);
  return a === d || a.startsWith(d + path.sep);
}
function isAbsoluteLike(s) {
  return /^([a-z]:[\\/]|\/)/i.test(String(s));
}
/** Literal absolute path inside the approved temp folder (no variables, globs or `..`). */
function inQaTmp(s) {
  const v = String(s);
  if (!isAbsoluteLike(v) || /[$`*?]|(^|[\\/])\.\.([\\/]|$)/.test(v)) return false;
  return within(v, QA_TMP) && normPath(v) !== key(QA_TMP);
}
function isEnvFile(p) {
  const b = path.basename(String(p));
  return /^\.env(\..+)?$/i.test(b) && !/example$/i.test(b);
}
function readable(p) {
  return within(p, ROOT) || within(p, MOBILE) || within(p, os.tmpdir());
}

// ---------------------------------------------------------------------------
// Content rules (applied to whole Bash commands and to scripts run from QA_TMP)
// ---------------------------------------------------------------------------
const CONTENT_RULES = [
  [/\.(insert|upsert|update|delete|rpc)\s*\(/i, 'Supabase/PostgREST write or RPC calls'],
  [/\b(insert\s+into|delete\s+from|update\s+\w+\s+set|drop\s+(table|index|schema|function|policy|view|trigger|extension)|alter\s+(table|function|policy)|truncate\s+(table\s+)?\w|create\s+(or\s+replace\s+)?(table|index|extension|policy|function|trigger|view)|grant\s+\w|revoke\s+\w)\b/i, 'SQL that changes data or schema'],
  [/method\s*:\s*["'`]?(POST|PUT|PATCH|DELETE)/i, 'Mutating HTTP requests from scripts'],
  [/\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|unlinkSync|rmSync|rmdirSync|renameSync|mkdirSync|copyFileSync|cpSync|truncateSync|symlinkSync|chmodSync)\b|\bfs\.(promises\.)?(unlink|rm|rename|mkdir|copyFile|cp|truncate|writeFile|appendFile)\b/, 'Scripts that write or delete files (print to stdout and redirect into the QA temp folder instead)'],
  [/\b(child_process|execSync|spawnSync|execFile|spawn\()/, 'Scripts that start other processes'],
  [/console\.(log|error|info|warn|dir)\([^)]*(?<![!])process\.env\.\w*(KEY|SECRET|TOKEN|PASSWORD)/i, 'Printing secret values'],
  [/loadEnvFile|dotenv|readFileSync\([^)]*\.env/i, 'Loading environment files (credentials)'],
];
const DB_GATE = /(@supabase\/supabase-js|createClient\(|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|supabase\.co|utils\/supabase|app\/actions)/;
const BROWSER_GATE = /\b(playwright|puppeteer|chromium|webkit)\b/i;

function checkContent(text, where) {
  for (const [re, why] of CONTENT_RULES) if (re.test(text)) block(`${why} (${where})`);
  if (!SAFE_ENV && DB_GATE.test(text)) {
    block(`Database access needs a dedicated test database; launch Claude Code with LOGISTIX_QA_SAFE_ENV=1 only when .env.local points at one (${where})`);
  }
  if (!RO_BROWSER && BROWSER_GATE.test(text)) {
    block(`Browser automation is off: the only database holds real data. Launch Claude Code with LOGISTIX_QA_READONLY_BROWSER=1 or LOGISTIX_QA_SAFE_ENV=1 to enable it (${where})`);
  }
}

// ---------------------------------------------------------------------------
// Shell parsing
// ---------------------------------------------------------------------------
/** Splits a command into segments of tokens, honouring quotes. Operators become separators. */
function parse(cmd) {
  const segments = [];
  let tokens = [];
  let cur = '';
  let has = false;
  let q = null;
  const push = () => {
    if (has) tokens.push(cur);
    cur = '';
    has = false;
  };
  const endSeg = () => {
    push();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      has = true;
      continue;
    }
    if (c === '\\' && i + 1 < cmd.length) {
      cur += cmd[++i];
      has = true;
      continue;
    }
    if (c === '\n' || c === ';' || c === '|' || (c === '&' && cmd[i + 1] !== '>' && cmd[i - 1] !== '>')) {
      endSeg();
      if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
      continue;
    }
    if (c === '(' || c === ')') {
      endSeg();
      continue;
    }
    if (/\s/.test(c)) {
      push();
      continue;
    }
    if (c === '>' || (c === '<' && cmd[i + 1] === '<')) {
      // Redirection operator becomes its own token (keeps a leading fd digit / &).
      let op = '';
      if (has && /^(\d|&)$/.test(cur)) {
        op = cur;
        cur = '';
        has = false;
      } else push();
      while (cmd[i] === '>' || cmd[i] === '<' || cmd[i] === '&' || cmd[i] === '|') op += cmd[i++];
      i--;
      tokens.push(op);
      continue;
    }
    cur += c;
    has = true;
  }
  if (q) block('Unbalanced quotes');
  endSeg();
  return segments;
}

function checkRedirects(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^(\d|&)?<<</.test(t)) continue; // here-string feeds stdin only
    if (/^(\d|&)?<</.test(t)) block('Heredocs are not allowed; write the script into the QA temp folder with the Write tool and run it');
    if (/^(\d|&)?>>?$/.test(t) || /^(\d)?>>?&$/.test(t) || /^&>>?$/.test(t)) {
      const target = tokens[i + 1];
      if (target === undefined) block('Redirection without a target');
      if (/^(\d)?>&$/.test(t) && /^\d$/.test(target)) {
        i++;
        continue; // 2>&1, >&2
      }
      if (target === '/dev/null' || /^nul$/i.test(target)) {
        i++;
        continue;
      }
      if (!inQaTmp(target)) block(`Output redirection is only allowed into the QA temp folder (${QA_TMP}); target: ${target}`);
      i++;
      continue;
    }
    if (/>/.test(t) && /^[\d&]?>/.test(t)) {
      // Forms like 2>&1 kept as one token, or >file glued
      const m = /^[\d&]?>>?(&\d)?(.*)$/.exec(t);
      if (m && m[1] && !m[2]) continue;
      if (m && m[2] && m[2] !== '/dev/null' && !inQaTmp(m[2])) block(`Output redirection is only allowed into the QA temp folder (${QA_TMP}); target: ${m[2]}`);
      continue;
    }
    out.push(t);
  }
  return out;
}

const READ_ONLY_CMDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'cut', 'tr', 'uniq', 'diff', 'cmp', 'md5sum', 'sha1sum', 'sha256sum',
  'basename', 'dirname', 'realpath', 'readlink', 'pwd', 'echo', 'printf', 'date', 'test', '[', 'true', 'false',
  'which', 'file', 'stat', 'du', 'df', 'tree', 'jq', 'column', 'nl', 'comm', 'paste', 'tac', 'rev', 'seq',
  'sleep', 'cd', 'grep', 'egrep', 'fgrep', 'rg', 'find', 'sort', 'awk', 'sed', 'xargs', 'curl', 'ps', 'tasklist',
  'netstat', 'whoami', 'hostname', 'uname', 'node', 'npm', 'npx', 'git', 'mkdir', 'rm', 'rmdir', 'touch', 'tee',
  'cp', 'mv', 'kill', 'taskkill', 'command', 'timeout', 'time', 'export', 'unset', 'env', 'type',
]);
const TMP_ONLY_CMDS = new Set(['mkdir', 'rm', 'rmdir', 'touch', 'tee', 'cp', 'mv']);

const GIT_READ = new Set([
  'status', 'log', 'diff', 'show', 'blame', 'rev-parse', 'ls-files', 'ls-tree', 'cat-file', 'describe', 'shortlog',
  'grep', 'check-ignore', 'merge-base', 'for-each-ref', 'name-rev', 'rev-list', 'whatchanged', 'count-objects',
  'version', 'help', 'show-ref', 'diff-tree', 'diff-index', 'diff-files', 'var',
]);

function checkGit(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const a = args[i];
    if (a === '-C' || a === '-c') i += 2;
    else if (a === '--no-pager' || a === '--no-optional-locks' || a === '-P') i += 1;
    else block(`Git global option not allowed: ${a}`);
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (!sub) return;
  if (rest.some((a) => /^--output(=|$)/.test(a) || a === '-w')) block('Git options that write files or objects');
  if (GIT_READ.has(sub)) return;
  if (sub === 'branch') {
    if (rest.every((a) => /^(--show-current|-a|-r|-v|-vv|--list|-l|--all|--remotes|--contains|--merged|--no-merged|--no-color|--color)$/.test(a) || !a.startsWith('-') && rest.some((b) => /^(--contains|--merged|--no-merged)$/.test(b)))) return;
    block('Creating, renaming or deleting Git branches');
  }
  if (sub === 'stash' && (rest[0] === 'list' || rest[0] === 'show')) return;
  if (sub === 'config' && rest.length && /^(--get|--get-all|--list|-l|--get-regexp)$/.test(rest[0])) return;
  if (sub === 'remote' && (rest.length === 0 || /^(-v|--verbose|get-url|show)$/.test(rest[0]))) return;
  if (sub === 'reflog' && (rest.length === 0 || rest[0] === 'show' || rest[0].startsWith('-'))) return;
  if (sub === 'tag' && (rest.length === 0 || /^(-l|--list|--contains|--points-at)$/.test(rest[0]))) return;
  block(`Git command changes repository state or is not on the read-only list: git ${sub}`);
}

const NPM_SCRIPTS = new Set(['lint', 'type-check', 'typecheck', 'format:check', 'dev', 'start', 'test:accounting', 'test:accounting:architecture']);
function checkNpm(args) {
  const a = args.filter((x) => !/^--(silent|prefix=.*)$/.test(x) && x !== '-s');
  if (!a.length || /^(-v|--version|ls|list|view|outdated|help|root|bin|prefix)$/.test(a[0])) return;
  if (a[0] === 'config' && a[1] === 'get') return;
  if (a[0] === 'run' || a[0] === 'run-script') {
    const script = a[1];
    if (!script) return;
    if (/^test:accounting:e2e$|^test:e2e$/.test(script)) {
      if (!SAFE_ENV) block('Playwright e2e specs create records with real accounts; they run only with LOGISTIX_QA_SAFE_ENV=1 against a dedicated test database');
      return;
    }
    if (script === 'test:accounting:review' && fs.existsSync(path.join(ROOT, 'node_modules', '.bin', 'tsx'))) return;
    if (NPM_SCRIPTS.has(script)) {
      if (a.slice(2).some((x) => /^--(fix|write)$/.test(x))) block('Auto-fix / write modes');
      return;
    }
    block(`npm script not on the QA allowlist: ${script}`);
  }
  if (a[0] === 'test' || a[0] === 't') block('npm test is not defined for these repos');
  block(`npm command changes dependencies or is not on the read-only list: npm ${a[0]}`);
}

const NPX_BINS = new Set(['tsc', 'eslint', 'playwright', 'next', 'expo', 'prettier']);
function checkNpx(args) {
  if (args.some((x) => /^(-y|--yes|-p|--package)(=|$)/.test(x))) block('npx auto-installing packages');
  const bin = args.find((x) => !x.startsWith('-'));
  if (!bin) return;
  const local = ['', '.cmd'].some((ext) => fs.existsSync(path.join(ROOT, 'node_modules', '.bin', bin + ext)) || fs.existsSync(path.join(MOBILE, 'node_modules', '.bin', bin + ext)));
  if (!NPX_BINS.has(bin) || !local) block(`npx binary not installed locally or not on the QA allowlist: ${bin}`);
  const rest = args.slice(args.indexOf(bin) + 1);
  if (rest.some((x) => /^--(fix|write)(=|$)/.test(x) || x === '-w' && bin === 'prettier')) block('Auto-fix / write modes');
  if (bin === 'tsc') {
    if (rest.some((x) => /^(--build|-b|--init|--watch|-w)$/.test(x))) block('tsc build/init/watch modes');
    const outIdx = rest.findIndex((x) => /^--outDir$|^--outFile$/.test(x));
    if (!rest.includes('--noEmit') && !(outIdx >= 0 && inQaTmp(rest[outIdx + 1] || ''))) block('tsc must use --noEmit or --outDir inside the QA temp folder');
  }
  if (bin === 'eslint') {
    const o = rest.findIndex((x) => /^(-o|--output-file)$/.test(x));
    if (o >= 0 && !inQaTmp(rest[o + 1] || '')) block('eslint output file must be inside the QA temp folder');
  }
  if (bin === 'playwright') {
    const sub = rest.find((x) => !x.startsWith('-'));
    if (!sub || /^(--version|-V|--help)$/.test(rest[0] || '')) return;
    if (sub === 'test' && rest.includes('--list')) return;
    if (sub === 'test') {
      if (!SAFE_ENV) block('Playwright e2e specs create records with real accounts; they run only with LOGISTIX_QA_SAFE_ENV=1 against a dedicated test database');
      return;
    }
    if (sub === 'show-report' || sub === 'show-trace') return;
    block(`playwright ${sub} is not allowed`);
  }
  if (bin === 'next' && !/^(dev|start|info|--version|-v|--help)$/.test(rest[0] || '--version')) block(`next ${rest[0]} is not allowed (builds overwrite the developer's .next output)`);
  if (bin === 'expo' && !/^(lint|config|--version|--help)$/.test(rest[0] || '--version')) block(`expo ${rest[0]} is not allowed`);
  if (bin === 'prettier' && !rest.some((x) => /^(--check|-c|--list-different|-l|--version)$/.test(x))) block('prettier is only allowed with --check');
}

function checkNode(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-e' || a === '--eval' || a === '-p' || a === '--print') {
      checkContent(args[i + 1] || '', 'inline script');
      return;
    }
    if (a === '--test') {
      for (const f of args.slice(i + 1).filter((x) => !x.startsWith('-'))) {
        if (!(within(f, ROOT) || inQaTmp(f))) block(`node --test files must be in the repo or the QA temp folder: ${f}`);
        if (inQaTmp(f)) scanFile(f);
      }
      return;
    }
    if (a.startsWith('-')) {
      if (/^--(import|require|loader|experimental-loader)$|^-r$/.test(a)) block(`node option not allowed: ${a}`);
      continue;
    }
    const f = a;
    if (within(f, SKILL_DIR) && /\.(cjs|js|mjs)$/.test(f)) return; // trusted QA tooling (not writable by the agent)
    if (inQaTmp(f)) {
      scanFile(f);
      return;
    }
    if (/\.test\.(c|m)?(j|t)s$/.test(f) && within(f, ROOT)) return;
    block(`node may only run inline checks, test files, QA tooling, or scripts in the QA temp folder; not: ${f}`);
  }
}
function scanFile(f) {
  let text;
  try {
    text = fs.readFileSync(normPath(f), 'utf8');
  } catch {
    return; // missing file: node will just fail
  }
  checkContent(text, path.basename(f));
}

function checkSegment(rawTokens, whole) {
  let tokens = checkRedirects(rawTokens);
  // strip leading VAR=value assignments and wrappers
  while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens = tokens.slice(1);
  while (tokens.length && (tokens[0] === 'time' || tokens[0] === 'command' && tokens[1] !== '-v')) tokens = tokens.slice(1);
  if (tokens[0] === 'timeout') tokens = tokens.slice(1).filter((x, idx) => !(idx === 0 && /^\d/.test(x)) && !(x.startsWith('-')));
  if (!tokens.length) return;
  const cmd = path.basename(tokens[0]).replace(/\.exe$/i, '');
  const args = tokens.slice(1);

  if (!READ_ONLY_CMDS.has(cmd)) block(`Command not on the QA allowlist: ${cmd}`);
  for (const a of args) {
    if (isEnvFile(a) || /(^|[\\/=])\.env(\.(?!.*example$)[\w.-]+)?$/i.test(a)) block('Environment files hold credentials and must not be read');
  }
  if (TMP_ONLY_CMDS.has(cmd)) {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!targets.length || !targets.every(inQaTmp)) block(`${cmd} is only allowed on paths inside the QA temp folder (${QA_TMP})`);
    return;
  }
  switch (cmd) {
    case 'git':
      return checkGit(args);
    case 'npm':
      return checkNpm(args);
    case 'npx':
      return checkNpx(args);
    case 'node':
      return checkNode(args);
    case 'env':
      if (!args.length) block('Dumping environment variables');
      return checkSegment(args.filter((a) => !/^[A-Za-z_]\w*=/.test(a)).map(String), whole);
    case 'export':
      if (!args.length || args.includes('-p')) block('Dumping environment variables');
      return;
    case 'echo':
    case 'printf':
      if (/\$\{?\w*(KEY|SECRET|TOKEN|PASSWORD)/i.test(whole)) block('Printing secret values');
      return;
    case 'sed':
      if (args.some((a) => /^(-i|--in-place)/.test(a) || /(^|;|\s)w\s/.test(a))) block('In-place / writing sed');
      return;
    case 'awk':
      if (args.some((a) => /system\s*\(|print[^;]*>\s*"|\|\s*getline/.test(a))) block('awk that writes files or runs commands');
      return;
    case 'find':
      if (args.some((a) => /^-(delete|exec|execdir|ok|okdir|fprint|fprintf|fls)$/.test(a))) block('find actions that execute or write');
      return;
    case 'sort':
      if (args.some((a) => /^(-o|--output)/.test(a))) block('sort -o writes files');
      return;
    case 'xargs': {
      const inner = args.filter((a) => !a.startsWith('-'));
      if (!inner.length || !/^(md5sum|sha1sum|sha256sum|grep|cat|ls|wc|head|stat)$/.test(path.basename(inner[0]))) block('xargs may only feed read-only commands');
      return;
    }
    case 'grep':
    case 'egrep':
    case 'fgrep':
      if (args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')) {
        const targets = args.filter((a) => !a.startsWith('-'));
        if (targets.some((t) => [ROOT, MOBILE, path.dirname(ROOT)].some((d) => normPath(t) === key(d)) || t === '.' || t === './') && !args.some((a) => /^--exclude=\.?env|^--exclude='?\.env/.test(a))) {
          block('Recursive grep over a repo root would read .env files; use the Grep tool, a subfolder, or --exclude=".env*"');
        }
      }
      return;
    case 'rg':
      if (args.some((a) => /^(-u+|--no-ignore.*|-uu+)$/.test(a))) block('rg flags that bypass .gitignore would read .env files');
      return;
    case 'curl':
      if (args.some((a) => /^(-X|--request)$/.test(a)) && !args.some((a) => /^(GET|HEAD)$/i.test(a))) block('Mutating HTTP requests');
      if (args.some((a) => /^(-d|--data.*|-F|--form.*|-T|--upload-file|-O|--remote-name)$/.test(a) || /^-X(POST|PUT|PATCH|DELETE)$/i.test(a))) block('Mutating HTTP requests or file downloads');
      {
        const o = args.findIndex((a) => /^(-o|--output)$/.test(a));
        if (o >= 0 && args[o + 1] !== '/dev/null' && !inQaTmp(args[o + 1] || '')) block('curl output must go to the QA temp folder');
      }
      if (args.some((a) => /supabase\.co/i.test(a)) && !SAFE_ENV) block('Direct requests to the Supabase project need LOGISTIX_QA_SAFE_ENV=1');
      return;
    case 'kill':
    case 'taskkill':
      return; // stopping a dev server the agent started
    default:
      return;
  }
}

function checkBash(command) {
  const c = String(command || '');
  if (c.includes(PROBE)) block('GUARD ACTIVE: logistix-qa enforcement hooks are running');
  if (/`/.test(c.replace(/'[^']*'/g, ''))) block('Backtick command substitution is not allowed');
  if (/\b(eval|exec|source)\b|(^|[;&|]\s*)\.\s|\b(bash|sh|zsh|pwsh|powershell|cmd)(\.exe)?\b(\s|$)/i.test(c.replace(/'[^']*'|"[^"]*"/g, ''))) {
    block('Shell indirection (eval/exec/source/nested shells) is not allowed');
  }
  if (/\$\((?!\()/.test(c)) {
    // Validate each $( ... ) body as its own command, then neutralise it.
    const inner = [...c.matchAll(/\$\(([^()]*)\)/g)].map((m) => m[1]);
    for (const body of inner) checkBash(body);
  }
  // Content rules apply to code that executes (node -e bodies, scripts in QA_TMP), not to file
  // names or search patterns on the command line; the allowlist covers everything else.
  for (const seg of parse(c.replace(/\$\(([^()]*)\)/g, 'SUBST'))) checkSegment(seg, c);
}

const ALLOWED_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit', 'TodoWrite', 'ToolSearch']);

function main(input) {
  const tool = input.tool_name || '';
  const t = input.tool_input || {};
  if (input.cwd) CWD = input.cwd;
  if (!ALLOWED_TOOLS.has(tool)) block(`Tool not available to the QA agent: ${tool}`);
  switch (tool) {
    case 'Write':
    case 'Edit': {
      const f = String(t.file_path || '');
      if (normPath(f) === key(REPORT) || inQaTmp(f)) return;
      block(`The only files this agent may write are ${REPORT} and files inside ${QA_TMP}. Attempted: ${f}`);
      break;
    }
    case 'Read':
    case 'Grep':
    case 'Glob': {
      const p = String(t.file_path || t.path || '');
      const g = String(t.glob || t.pattern || '');
      if (isEnvFile(p) || (tool !== 'Grep' && /(^|[\/*])\.env/.test(g) && !/example/.test(g)) || (tool === 'Grep' && /(^|[\/*])\.env/.test(String(t.glob || '')) && !/example/.test(String(t.glob || '')))) {
        block('Environment files hold credentials and must not be read');
      }
      if (p && !readable(p)) block(`Reads are limited to the Logistix repo, logistix-app and the temp folder. Attempted: ${p}`);
      return;
    }
    case 'Bash':
      return checkBash(t.command);
    default:
      return;
  }
}

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    main(JSON.parse(raw || '{}'));
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Blocked ? e.message : `guard error (${e && e.message}); blocking to stay safe`;
    process.stderr.write(`BLOCKED (logistix-qa read-only policy): ${msg}\nUse a read-only alternative, or record the affected test as Blocked in QA_REPORT.md.\n`);
    process.exit(2);
  }
});
