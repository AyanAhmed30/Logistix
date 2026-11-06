---
name: logistix-qa
description: Read-only end-to-end QA of one Logistix ERP module (web + mobile). Discovers routes, components, server actions, database objects and workflows; designs positive/negative/boundary/validation/permission/integration/regression scenarios; runs only safe tests; and merges findings into QA_REPORT.md. Use when the user asks to QA, test, audit or verify a module or feature.
argument-hint: <module or feature, e.g. "Contacts", "CRM pipeline", "Operations inquiry approval">
context: fork
agent: logistix-qa
---

# Logistix QA procedure

Target: **$ARGUMENTS** (if empty, stop and ask which module to audit).

Paths: `ROOT` is the Logistix repo (the folder containing `.claude/agents/logistix-qa.md`). `MOBILE` is `ROOT/../logistix-app`. The report is `ROOT/QA_REPORT.md`, the only file you may write.

## 0. Enforcement self-test (mandatory first tool call)

Run exactly: `echo __logistix_qa_guard_probe__`

- **Expected:** the call is **blocked** with `GUARD ACTIVE`. Continue.
- **If the command runs and prints the token, the guard is not active.** This happens when Claude Code was opened in a parent folder such as `mega`, the `logistix-qa` agent was not loaded, and a generic agent is running this skill. **Stop now.** Make no other tool call. Reply only: "QA not started: the logistix-qa enforcement hooks are not active. Open Claude Code with the Logistix folder as the working directory and invoke /logistix-qa again."

## 1. Temp folder and pre-flight snapshot (mandatory)

1. Get the approved temp folder: `node <ROOT>/.claude/skills/logistix-qa/snapshot.cjs --tmpdir`. It prints the Windows path and the Git Bash path. Create this run's folder with a **literal absolute path** (no variables), e.g. `mkdir -p /c/Users/<you>/AppData/Local/Temp/logistix-qa/run-20261027-1530`. Call it `RUN`.
2. Everything temporary goes inside `RUN` and nowhere else: harness scripts (Write tool), compiled test output (`npx tsc --outDir RUN/...`), logs (`> RUN/x.log`), screenshots and fingerprints. The guard blocks writes anywhere else.
3. Save the fingerprint: `node <ROOT>/.claude/skills/logistix-qa/snapshot.cjs > RUN/pre.txt`. It covers both repos: HEAD, branch, all refs, stashes, staged and unstaged diffs, and a **content hash of every modified or untracked file** and of the root `.env*` files (hashes only). `QA_REPORT.md` is excluded.

Uncommitted developer changes are expected. Never touch them. Note in the report that they exist (file names only, from `git status --short`) so findings in those files are attributed correctly.

## 2. Environment classification → allowed tiers

Determine facts without reading `.env*` values:
- Which env variable names exist: read `.env.local.example` / `.env.example`, or test presence with a script that prints only `true/false`.
- Whether the Supabase URL is local (`localhost`/`127.0.0.1`) or hosted. Treat hosted as **production** unless the user has stated otherwise.
- Whether `LOGISTIX_QA_SAFE_ENV=1` or `LOGISTIX_QA_READONLY_BROWSER=1` is set in your environment (`node -e "console.log(process.env.LOGISTIX_QA_SAFE_ENV==='1')"`).
- Which tools are installed: `node_modules/.bin` (playwright, tsx, …), system Chrome, Playwright browsers. Never install missing ones.

| Tier | What | Allowed when |
|---|---|---|
| T0 Static | Code reading, route/action/schema tracing, migration review, diff review | Always |
| T1 Local checks | `npm run lint`, `npm run type-check` (web); `npm run lint`, `npm run typecheck` (mobile); pure-logic unit tests via `node --test` (e.g. `.next-test/*.test.js`, or `.test.ts` files whose imports resolve under Node type stripping) | Always (they only read code; Next may write to the git-ignored `.next`) |
| T2 Read-only DB | `select`-only queries (counts, shapes, constraints, index presence) via supabase-js; print aggregates or IDs only | `LOGISTIX_QA_SAFE_ENV=1` and the DB is confirmed to be a test DB |
| T3 Read-only browser | Run the app locally (`npm run dev` in background) and navigate, search, filter and paginate with a Playwright script saved in `RUN`; capture console errors, failed requests and screenshots into `RUN` | `LOGISTIX_QA_READONLY_BROWSER=1` (user accepts viewing real data) or `LOGISTIX_QA_SAFE_ENV=1`. Never click Save/Submit/Approve/Reject/Delete/Confirm/Import unless T4 |
| T4 Mutating | Existing Playwright e2e specs (`npx playwright test …`; they create records), submitting forms, approvals, drag-and-drop stage moves | `LOGISTIX_QA_SAFE_ENV=1` **and** dedicated test accounts for each role are known |

Tests in a tier that is not allowed are recorded as **Blocked: <missing capability>**.

## 3. Module discovery (T0)

Build a map before testing, citing `path:line` for every claim:
- **Entry points:** pages and routes in `src/app/**`, tab states in `src/components/admin/AdminUserManager.tsx`, CRM routes under `/crm`, and mobile screens in `MOBILE/app/**`.
- **Components and client state:** loaders, caches (`src/lib/*-client-cache.ts`), context (`AdminOrganizationContext`), and debounce and pagination logic.
- **Server actions and APIs:** `src/app/actions/**` and `src/app/api/**`. For each one record the auth check (`ensureAuth`/role), the organization scoping, the module-access check and the Supabase client used (service role vs user).
- **Database:** tables, columns, constraints, indexes, RLS, triggers and functions from `supabase/migrations/**` and `supabase/schema.sql`, and the ID generation sequences.
- **Workflows:** status transitions, approvals, notifications and cross-module hand-offs (e.g. Contacts → CRM opportunity → inquiry → Operations → approval), plus what the mobile app reads and writes through the same tables.
- **Intended behavior:** derive it from the code, comments, `README.md`, `LOGISTIX_SYSTEM_MASTER_GUIDE.md`, `MOBILE/docs/**` and git history (`git log -p -- <path>`). Where the intent is ambiguous, say so rather than guessing.

## 4. Scenario matrix

For each feature, list cases with ID `TC-<MODULE>-NNN` in these categories: Positive, Negative, Boundary, Validation, Permission/role and organization isolation, Integration (cross-module, web↔mobile), Regression (recent commits touching the module), Performance (where measurable), and Error/empty/loading states.

For each case record the category, preconditions, steps, expected result (with its source), the tier needed, and the status.

## 5. Execution and evidence

- Run the allowed tiers only. Long-running servers go in the background. Stop any process you started before finishing.
- **Logic harnesses:** to exercise a pure function, copy it verbatim into a script in `RUN` (Write tool) and run `node RUN/<file>`. The guard reads such scripts before running them and blocks file writes, child processes, database access and mutating HTTP requests inside them. Scripts print to stdout only.
- **Evidence:** the exact command and exit code, failing test names, trimmed error output, console and network errors (method, path, status; no payloads containing personal data), screenshot paths inside `RUN` (temporary; describe them in the report, since `RUN` is deleted at the end), and `path:line` references.
- **Compare expected with actual.** A finding is **Confirmed** only when reproduced (a test failure, an observed browser behavior or query result) or proven by an unambiguous code path. Otherwise it is **Suspected**, with the reason and what would confirm it.
- **Severity:**
  - **Critical:** data loss or corruption, security or organization-isolation breach, auth bypass, or a core workflow fully blocked.
  - **High:** a major feature broken or wrong business data with no workaround.
  - **Medium:** partial breakage, a workaround exists, or wrong non-critical data.
  - **Low:** cosmetic, minor UX, or logging.

## 6. Updating QA_REPORT.md (merge, never overwrite)

1. Read the whole report first.
2. **Bug IDs:** `LGX-<MODULE>-NNN`. Before adding a bug, search the report for the same root cause (file, function, symptom). If it already exists, update its Status, Last verified and Evidence, and append to its history line instead of creating a duplicate. Never renumber or reuse IDs.
3. **Statuses:** `Open – Confirmed`, `Open – Suspected`, `Fixed – Verified` (retested and gone), `Not reproducible`, `By design`, `Blocked`. Re-check every existing Open finding of the audited module and update its status with the evidence.
4. Append one entry to the **Run log**, with the date, module, branch, HEAD, tiers allowed and blocked, the pre/post snapshot match, and the test counts.
5. Update the module's row in **Coverage summary** (passed / failed / blocked / not run).
6. Use the finding template already in the report. Edit with targeted `Edit` calls; never rewrite the whole file with `Write` once it has content.

## 7. Post-flight verification (mandatory)

1. Stop any process you started (dev server, browser).
2. Run `node <ROOT>/.claude/skills/logistix-qa/snapshot.cjs --compare RUN/pre.txt`. Exit 0 prints `SNAPSHOT MATCH`. Exit 1 lists every entry that changed (`-` before, `+` after), including content changes to pre-existing uncommitted files. Record "Snapshot match: yes/no" in the run log, with the listed differences if any. Never try to revert anything.
3. Clean up only this run's folder: `rm -rf RUN` with the literal absolute path. Never delete anything outside the QA temp folder.

## 8. Final reply

Keep it short: the module, the tiers run and blocked, the case counts, the new or updated bug IDs with severity and Confirmed/Suspected, the snapshot result, and what would unblock the blocked tests.
