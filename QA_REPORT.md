# Logistix QA Report

Single, cumulative findings report maintained by the read-only `logistix-qa` agent (`.claude/agents/logistix-qa.md`, procedure in `.claude/skills/logistix-qa/SKILL.md`). Findings are merged across runs: existing bugs are re-verified and their status updated; IDs are never reused or renumbered.

- **Bug ID:** `LGX-<MODULE>-NNN` · **Test case ID:** `TC-<MODULE>-NNN`
- **Severity:** Critical · High · Medium · Low
- **Status:** Open – Confirmed · Open – Suspected · Fixed – Verified · Not reproducible · By design · Blocked
- **Confirmed** = reproduced, or proven by an unambiguous code path. **Suspected** = plausible but not reproduced; the entry states what would confirm it.

---

## Test environment & capabilities

Last verified: 2026-10-27 (run #1, Contacts)

| Item | State |
|---|---|
| Web repo | `Logistix`, branch `testing`, Next.js 16 |
| Mobile repo | `../logistix-app`, branch `main`, Expo (has uncommitted developer changes in `app.json`, `package.json`, `package-lock.json`) |
| Database | Single hosted Supabase project (`*.supabase.co`) from `.env.local`, using the service-role key. **Treated as production.** No local Supabase (no `supabase/config.toml`, CLI or Docker) and no seed scripts |
| Test accounts | None dedicated. Existing e2e specs log in as the real `admin` user. No accounts per role (agent / manager / org user) |
| Lint / type-check | Available: `npm run lint`, `npm run type-check` (web); `npm run lint`, `npm run typecheck` (mobile) |
| Unit tests | Node test runner (`node --test`) on `.next-test/journalEngine.test.js`. `tsx` is **not installed**, so the `npx tsx --test` scripts are blocked. Unit tests cover accounting and a few helpers only |
| Browser / e2e | `@playwright/test` installed, system Chrome present, `playwright.config.ts` (no `webServer`; needs `npm run dev`). 11 specs (9 accounting, inquiry flag, portal profile phone). Several create records |
| Mobile tests | No test framework or test files |
| CI | `.github/workflows/ci.yml`: lint, type-check and build on `main`/`master` only; runs no tests |
| Mobile env | `logistix-app/.env` is empty, so the mobile app cannot connect until it is configured |

**QA enforcement status.** The `logistix-qa` agent's PreToolUse hook (`.claude/skills/logistix-qa/guard.cjs`) blocks every write except this report and the QA temp folder, all Git state changes, installs, `.env` reads and unapproved tools. Claude Code applies it only when (1) the session is opened with `Logistix` as the working folder (from `mega` the agent is not discovered) and (2) the `Logistix` folder has been trusted in Claude Code. Without trust, Claude Code loads the agent but silently skips its hooks (debug log: "Skipping frontmatter hooks … folder … is not trusted"). As of 2026-10-27 the folder is **not trusted**, so enforcement is **not yet active**. Every run starts with a guard self-test and stops if the probe is not blocked.

**Safety gates (applied by the guard).** Launch Claude Code with one of these environment variables to unlock tiers:
- `LOGISTIX_QA_SAFE_ENV=1`: only when `.env.local` points at a dedicated test database with test accounts. Unlocks read-only DB queries (T2), browser (T3) and mutating e2e/UI (T4).
- `LOGISTIX_QA_READONLY_BROWSER=1`: read-only browsing of the configured environment (T3) only. It means viewing real data; no submissions.

---

## Coverage summary

| Module | Last run | Passed | Failed | Blocked | Not run | Open bugs (C/H/M/L) |
|---|---|---|---|---|---|---|
| Contacts | 2026-10-27 (run #1) | 16 | 10 | 6 | 2 | 1 / 2 / 5 / 1 |

## Findings index

| ID | Module | Severity | Status | Title | Last verified |
|---|---|---|---|---|---|
| LGX-CONTACTS-001 | Contacts | Critical | Open – Confirmed | `organization` / `operations` sessions bypass organization isolation in all Contacts actions | 2026-10-27 (#1) |
| LGX-CONTACTS-002 | Contacts | High | Open – Confirmed | No server-side module permission or ownership check on Contacts read/update/delete | 2026-10-27 (#1) |
| LGX-CONTACTS-003 | Contacts | High | Open – Confirmed | Deleting a contact cascades to employees/history and unlinks invoices, journal entries, opportunities | 2026-10-27 (#1) |
| LGX-CONTACTS-004 | Contacts | Medium | Open – Confirmed | Phone search misses phones stored with spaces or dashes | 2026-10-27 (#1) |
| LGX-CONTACTS-005 | Contacts | Medium | Open – Confirmed | Search terms containing `.` (emails, "M. Ali") return no results | 2026-10-27 (#1) |
| LGX-CONTACTS-006 | Contacts | Medium | Open – Confirmed | Sales-agent list ignores the active organization; listed rows from other orgs cannot be opened | 2026-10-27 (#1) |
| LGX-CONTACTS-007 | Contacts | Medium | Open – Suspected | Contacts without an organization block creation in every org with an unsearchable "already exists" error | 2026-10-27 (#1) |
| LGX-CONTACTS-008 | Contacts | Medium | Open – Suspected | Salesperson transfer and tag replacement are not atomic with the contact update | 2026-10-27 (#1) |
| LGX-CONTACTS-009 | Contacts | Low | Open – Confirmed | Contact tags are global across organizations; tag lookup uses wildcard `ilike` | 2026-10-27 (#1) |

## Findings

<!-- Copy this template for each new bug, newest module section last.

### LGX-<MODULE>-NNN — <title>
- **Module / feature:**
- **Severity:** · **Status:** · **Confidence:** Confirmed | Suspected · **Reproducibility:** Always | Intermittent (x/y) | Not reproduced
- **Found:** <date, run #> · **Last verified:** <date, run #>
- **Description:**
- **Preconditions:** (role, organization, data state, tier/environment)
- **Steps to reproduce:**
  1.
- **Expected result:** (and its source: code path, requirement, prior behavior)
- **Actual result:**
- **Evidence:** (command + exit code, failing test name, trimmed log, console/network error, screenshot path under test-results/; no personal data)
- **Relevant code / API / DB objects:** (`path:line`, function, server action, table/column/index/RLS)
- **Suggested investigation / fix direction:** (not implemented)
- **History:** <date> opened · <date> re-verified → <status>
-->

### Contacts

### LGX-CONTACTS-001 — `organization` / `operations` sessions bypass organization isolation in all Contacts actions
- **Module / feature:** Contacts: list, detail, activity, create, update, delete, child contacts, chatter
- **Severity:** Critical · **Status:** Open – Confirmed · **Confidence:** Confirmed (unambiguous code path; exploit not executed) · **Reproducibility:** Always (by code path)
- **Found:** 2026-10-27, run #1 · **Last verified:** 2026-10-27, run #1
- **Description:** `resolveContactsOrganizationId` returns `{ unscoped: true }` for any role that `sessionUsesOrganizationScope` rejects (`organization`, `operations`). Every Contacts action then skips the `organization_id` filter while using the service-role client, so these sessions can list, open, edit and delete contacts of **every** organization. The legacy organization login creates exactly such a session, with no `organizationId`.
- **Preconditions:** Logged in through the `organizations` table login (role `organization`) or a legacy `operations` session; the attacker invokes the Contacts server actions directly (server actions are callable from any route).
- **Steps to reproduce:**
  1. Log in as an organization account (`auth.ts` organization branch).
  2. Invoke `getContacts()` / `getContactsPage()` → scope resolves to `{organizationId: null, agentIdForOwnership: null, createdByFallback: null}` → unfiltered query on all contacts.
  3. Invoke `getContactById(<id from another org>)`, `updateContact({...})` or `deleteContact(<id>)` → no org filter applied.
- **Expected result:** Contacts are visible and mutable only within the caller's active organization (source: `applyOrganizationFilter` doc "Strict multi-company filter", `admin-organization-context.ts:88-91`; "Odoo multi-company" comment at `contacts.ts:400`). Roles without a Contacts module should be denied.
- **Actual result:** Unscoped roles receive cross-organization read/write/delete.
- **Evidence:** `src/app/actions/contacts.ts:418-420` (unscoped return), `:498-499` and `:542-546` (list with null org → no org filter), `:1120-1122` (detail), `:1189` (activity), `:1801-1803`, `:1884-1886` (update), `:1961-1963` (delete), `:2081-2083` (child delete), `:2122` (chatter); `src/lib/admin-organization-context.ts:19-21` (only admin/user/sales_agent are scoped); `src/app/actions/auth.ts:349-353` (organization session without `organizationId`). Not executed: needs T4 with a test organization account.
- **Relevant code / API / DB objects:** `resolveContactsOrganizationId`, `resolveContactsListScope`, `applyContactsListFilters`; table `contacts` (service-role client, RLS bypassed).
- **Suggested investigation / fix direction:** Treat `unscoped` as deny for Contacts (return Access Denied) instead of "no filter"; add an explicit role/module allow-list.
- **History:** 2026-10-27 opened (run #1)

### LGX-CONTACTS-002 — No server-side module permission or ownership check on Contacts read/update/delete
- **Module / feature:** Contacts server actions (authorization)
- **Severity:** High · **Status:** Open – Confirmed · **Confidence:** Confirmed (code path) · **Reproducibility:** Always (by code path)
- **Found:** 2026-10-27, run #1 · **Last verified:** 2026-10-27, run #1
- **Description:** `ensureAuth` only checks that a session exists. No Contacts action checks the `customers` (Contacts) permission key, Sales access level or ownership. (a) A portal `user` whose permissions exclude Contacts/Sales (e.g. HR-only) can call every Contacts action for their org. (b) A Sales user with "own documents" access sees only their contacts in the browse list (`:535-538`), but `getContactById`, `updateContact` (including `salesperson_id` reassignment via `transfer_contact_to_sales_agent`) and `deleteContact` accept any contact id in the org.
- **Preconditions:** Portal user without the `customers` permission, or a Sales user with `own` level; target contact in the same org.
- **Steps to reproduce:**
  1. As a Sales "own" user, search a customer by name (org-wide search, `:520-523`) to get another agent's contact id.
  2. Open it (`getContactById`) → loads; save with a different Salesperson → ownership and CRM opportunities transferred; or Delete → row deleted.
- **Expected result:** The sidebar gates Contacts on `CONTACTS_PERMISSION_KEY = 'customers'` (`module-permissions.ts:172-173`), and the list enforces "Contact Module ownership" (`contacts.ts:469-471`). The server should enforce the same rules.
- **Actual result:** No check exists in any action (`grep sessionHas|hasModulePermission|hasDepartmentAccess` in `contacts.ts` → 0 matches).
- **Evidence:** `src/app/actions/contacts.ts:167-170`; detail `:1098-1122`; update `:1779-1887`; delete `:1943-1966`; `createContactTag` `:1234-1259`. Not executed (needs T4 and role-specific test accounts).
- **Relevant code / API / DB objects:** `ensureAuth`, `getContactById`, `updateContact`, `deleteContact`, RPC `transfer_contact_to_sales_agent`.
- **Suggested investigation / fix direction:** Add a shared `requireContactsAccess(session, 'read'|'write'|'delete')` using `module-permissions` / `sales-roles`, and apply the ownership predicate to detail and mutations for `sales_user`.
- **History:** 2026-10-27 opened (run #1)

### LGX-CONTACTS-003 — Deleting a contact cascades to employees/history and unlinks invoices, journal entries and opportunities
- **Module / feature:** Contacts → Delete (cross-module: Accounting, CRM, Sales, mobile)
- **Severity:** High · **Status:** Open – Confirmed · **Confidence:** Confirmed (code path + FK definitions) · **Reproducibility:** Always (by code path)
- **Found:** 2026-10-27, run #1 · **Last verified:** 2026-10-27, run #1
- **Description:** `deleteContact` issues a plain `DELETE` with no check for linked records. By FK definition this (a) **cascades**: every contact whose `parent_id` is the deleted company (employees and invoice/delivery addresses), tag links, activity logs, sales-assignment history, `accounting_activities`, `lead_to_contact_migrations`; and (b) **sets NULL** on `contact_id` in customer invoices, journal entries, vendor bills, credit notes, loans, assets, reconciliation rows, CRM opportunities, quotations (`contact_id`, `contact_person_id`, invoice/delivery address). Posted financial documents lose their partner link, which breaks partner ledgers and statements. The UI only shows `confirm("Delete this contact? This cannot be undone.")`. Rated High rather than Critical because it requires an explicit, confirmed delete; raise it to Critical if T2 shows deletable contacts with posted invoices.
- **Preconditions:** A company contact with linked individuals, or a customer with invoices/opportunities; any user who can reach `deleteContact` (see LGX-CONTACTS-002).
- **Steps to reproduce:**
  1. Open a company contact that has employees and posted invoices → Delete → confirm.
- **Expected result:** Deletion is blocked (or archived via `is_active`) when financial/CRM documents reference the contact, and the user is warned about dependent contacts (Odoo prevents deleting partners with journal items).
- **Actual result:** The delete succeeds, employees are deleted, and documents are silently unlinked.
- **Evidence:** `src/app/actions/contacts.ts:1943-1971`; `src/components/admin/contacts/ContactFormView.tsx:570`; FKs: `supabase/migrations/create_contacts_module.sql:26,149,180` (cascade), `021_mobile_signup_agent_assignment.sql:71` (cascade), `create_accounting_reporting_automation_phase8_9.sql:75` (cascade), `migrate_legacy_leads_to_contacts.sql:140` (cascade), `create_accounting_module_phase1.sql:13`, `create_accounting_journal_entries_module.sql:22,74`, `create_crm_pipeline_module.sql:32-33`, `integrate_quotations_contacts.sql:15`, `sales_quotation_form_phase3.sql:9-15` (set null).
- **Relevant code / API / DB objects:** `deleteContact`, `deleteChildContact`; `contacts.parent_id`, accounting/CRM/quotation `contact_id` FKs.
- **Suggested investigation / fix direction:** Pre-delete reference check with a clear error, or soft-delete (`is_active=false`); consider `ON DELETE RESTRICT` for posted accounting tables.
- **History:** 2026-10-27 opened (run #1)

### LGX-CONTACTS-004 — Phone search misses phones stored with spaces or dashes
- **Module / feature:** Contacts list search (also the app-level duplicate pre-check)
- **Severity:** Medium · **Status:** Open – Confirmed · **Confidence:** Confirmed (logic reproduced) · **Reproducibility:** Always
- **Found:** 2026-10-27, run #1 · **Last verified:** 2026-10-27, run #1
- **Description:** `buildContactsSearchOrFilter` matches phones with `phone.ilike.%<last10 digits>%` against the raw column. Phones are stored free-form (`buildContactPayload` keeps the input as typed), so a stored `+92 312 3456789` or `0312-3456789` never contains the contiguous digits. The code comment states the intent: "Phone columns store formatted values (+92 312…). Match by last 10 digits." The duplicate-phone error tells users to "search for this customer instead", and that search then finds nothing. `findExistingContactByPhone` (`:320`) has the same flaw; the DB trigger 047 still blocks the duplicate, because it compares digits only.
- **Preconditions:** A contact whose phone contains separators.
- **Steps to reproduce:**
  1. Search `03123456789` or `0312-3456789` for a contact stored as `+92 312 3456789`.
- **Expected result:** The contact is found (source: comment at `contacts.ts:256`).
- **Actual result:** No match.
- **Evidence:** T1 harness (lines `contacts.ts:211-266` copied verbatim to the scratchpad and run with `node`, exit 0): `"03123456789" => false`, `"0312-3456789" => false`; filter generated: `phone.ilike.%3123456789%`. Same row matched by `#674810` and `ali` → true.
- **Relevant code / API / DB objects:** `normalizeContactsSearchToken`, `buildContactsSearchOrFilter` (`contacts.ts:211-266`), `findExistingContactByPhone` (`:300-353`); indexes `idx_contacts_phone_digits_tail` / `idx_contacts_mobile_digits_tail` (047) already exist on digit-tail expressions but are not usable via PostgREST `ilike`.
- **Suggested investigation / fix direction:** Search through an RPC or generated column that uses the digit-tail expressions (already indexed), or normalize phones on write.
- **History:** 2026-10-27 opened (run #1)

### LGX-CONTACTS-005 — Search terms containing `.` (emails, "M. Ali") return no results
- **Module / feature:** Contacts list search
- **Severity:** Medium · **Status:** Open – Confirmed · **Confidence:** Confirmed (logic reproduced) · **Reproducibility:** Always
- **Found:** 2026-10-27, run #1 · **Last verified:** 2026-10-27, run #1
- **Description:** To keep the PostgREST `.or()` string parseable, `normalizeContactsSearchToken` replaces `% _ , . ( )` with spaces instead of quoting the value. Any full email (`ali.khan@gmail.com` → `ali khan@gmail com`) and any name with a period, comma or parentheses then no longer matches the stored text. A quoting helper `escapePostgrestFilterValue` exists but is unused (lint warning).
- **Preconditions:** A contact with email `ali.khan@gmail.com` or name `M. Ali Traders`.
- **Steps to reproduce:**
  1. Search `ali.khan@gmail.com`, `ali.khan` or `M. Ali`.
- **Expected result:** Matching contact returned (search placeholder: name, Customer ID or phone; the query includes `email.ilike`).
- **Actual result:** No results.
- **Evidence:** T1 harness (same as LGX-CONTACTS-004): `"ali.khan@gmail.com" => false`, `"ali.khan" => false`, `"M. Ali" => false`. `npx eslint …contacts.ts` → `199:10 warning 'escapePostgrestFilterValue' is defined but never used`.
- **Relevant code / API / DB objects:** `contacts.ts:199-205`, `:217-221`, `:241-249`.
- **Suggested investigation / fix direction:** Quote the value with `escapePostgrestFilterValue` (double quotes allow `,.()`) and escape `%`/`_` with a backslash, instead of stripping them.
- **History:** 2026-10-27 opened (run #1)

### LGX-CONTACTS-006 — Sales-agent list ignores the active organization; listed rows from other orgs cannot be opened
- **Module / feature:** Contacts list scope for sales agents
- **Severity:** Medium · **Status:** Open – Confirmed · **Confidence:** Confirmed (code path) · **Reproducibility:** Always when the agent owns contacts in more than one org
- **Found:** 2026-10-27, run #1 · **Last verified:** 2026-10-27, run #1
- **Description:** In `applyContactsListFilters`, the no-search branch for a resolved salesperson filters only by `salesperson_id` and never applies `organizationId` (unlike the `createdByFallback` branch just below it). Counts and pages therefore include the agent's contacts from every organization. `getContactById` does filter by the active org, so clicking such a row returns "Contact not found." The same branch with an empty org also applies when searching (`:524-527`).
- **Preconditions:** A login mapped to `sales_agents` with contacts in two organizations; org A selected in the header.
- **Steps to reproduce:**
  1. Open Contacts with org A active and no search. Rows from org B appear; open one → error.
- **Expected result:** Business data is scoped to the active organization (`admin-organization-context.ts:18`, "Admin portal, portal users, and sales agents scope business data by active organization").
- **Actual result:** Cross-org rows of the same owner are listed.
- **Evidence:** `src/app/actions/contacts.ts:535-541` compared with `:1116-1122`. Not executed (needs T3/T2).
- **Relevant code / API / DB objects:** `applyContactsListFilters`, `getContactsPage`, `getContacts`.
- **Suggested investigation / fix direction:** Apply `applyOrganizationFilter` in the `agentIdForOwnership` branches as well.
- **History:** 2026-10-27 opened (run #1)

### LGX-CONTACTS-007 — Contacts without an organization block creation in every org with an unsearchable "already exists" error
- **Module / feature:** Contacts create/update duplicate prevention
- **Severity:** Medium · **Status:** Open – Suspected · **Confidence:** Suspected (depends on whether NULL-org contacts with phones exist) · **Reproducibility:** Not reproduced
- **Found:** 2026-10-27, run #1 · **Last verified:** 2026-10-27, run #1
- **Description:** Both trigger `prevent_duplicate_contact_phone` (`c.organization_id IS NULL` matches any org) and `findExistingContactByPhone` (`rowOrg` null is not skipped) treat contacts without an organization as duplicates in every org. The list deliberately hides NULL-org rows ("Does not include legacy NULL organization_id rows"). The user is told to search for a customer they can never find, and the error reveals that contact's name and Customer ID.
- **Preconditions:** At least one `contacts` row with `organization_id IS NULL` and a phone of 10 or more digits.
- **Steps to reproduce:**
  1. In org A, create a contact with the same phone as a NULL-org contact → "This customer already exists"; search → not found.
- **Expected result:** Either NULL-org rows are excluded from the duplicate check, or they are reachable.
- **Actual result (by code):** Creation is blocked with a dead-end message.
- **Evidence:** `supabase/migrations/047_prevent_duplicate_contact_phone.sql:35-39`; `src/app/actions/contacts.ts:334-338`; `src/lib/admin-organization-context.ts:86-91`. To confirm (T2): `select count(*) from contacts where organization_id is null and coalesce(phone,mobile) is not null`.
- **Relevant code / API / DB objects:** trigger `trg_prevent_duplicate_contact_phone`, `findExistingContactByPhone`.
- **Suggested investigation / fix direction:** Backfill the remaining NULL-org rows (see `backfill_legacy_contacts_organization.sql`) or align the duplicate rule with list visibility.
- **History:** 2026-10-27 opened (run #1)

### LGX-CONTACTS-008 — Salesperson transfer and tag replacement are not atomic with the contact update
- **Module / feature:** Contacts → Save (CRM ownership hand-off)
- **Severity:** Medium · **Status:** Open – Suspected · **Confidence:** Suspected (non-atomic path is certain; needs a failing update to show impact) · **Reproducibility:** Not reproduced
- **Found:** 2026-10-27, run #1 · **Last verified:** 2026-10-27, run #1
- **Description:** `updateContact` calls RPC `transfer_contact_to_sales_agent` (which moves contact and CRM ownership) **before** the row update. If the update then fails (e.g. the duplicate-phone trigger fires on a concurrent edit, or any constraint error), ownership has already moved and the user sees an error. `replaceTagLinks` deletes all links and then inserts the new ones, ignoring errors on both, so a failed insert silently drops every tag. Clearing the Salesperson removes the owner that the mobile app needs to create inquiries (`logistix-app/app/(tabs)/inquiries/new.tsx:98`).
- **Preconditions:** Edit the salesperson together with a change that makes the update fail.
- **Steps to reproduce:** Needs T4 (mutating) on a test DB.
- **Expected result:** All-or-nothing save.
- **Actual result (by code):** Partial state is possible.
- **Evidence:** `src/app/actions/contacts.ts:1852-1870`, `:1880-1898`, `:1265-1274`.
- **Relevant code / API / DB objects:** RPC `transfer_contact_to_sales_agent` (migration 028), `contact_tag_links`.
- **Suggested investigation / fix direction:** Move the update and transfer into one DB function or transaction; check errors in `replaceTagLinks`.
- **History:** 2026-10-27 opened (run #1)

### LGX-CONTACTS-009 — Contact tags are global across organizations; tag lookup uses wildcard `ilike`
- **Module / feature:** Contacts → Tags
- **Severity:** Low · **Status:** Open – Confirmed · **Confidence:** Confirmed (schema + code path) · **Reproducibility:** Always
- **Found:** 2026-10-27, run #1 · **Last verified:** 2026-10-27, run #1
- **Description:** `contact_tags` has no `organization_id` and a globally unique `name`. `getContactTags` returns every org's tags, so tag names created by one company appear in another's suggestions. `createContactTag` checks existence with `.ilike('name', input)`, so `_`/`%` act as wildcards (`a_b` matches `axb`), and `.maybeSingle()` fails when several rows match.
- **Preconditions:** Two organizations using tags.
- **Steps to reproduce:**
  1. Org A creates tag "VIP-Karachi"; org B types "VIP" → suggestion shows org A's tag.
- **Expected result:** Tags scoped per organization (multi-company).
- **Actual result:** Shared global tag list.
- **Evidence:** `supabase/migrations/create_contacts_module.sql:119-125`; `src/app/actions/contacts.ts:1216-1259`.
- **Suggested investigation / fix direction:** Add `organization_id` to `contact_tags`; use `.eq` on `lower(name)` for the existence check.
- **History:** 2026-10-27 opened (run #1)

---

## Test cases by module

<!-- Per audited module: a table of TC-<MODULE>-NNN | Category | Scenario | Tier | Status (Passed/Failed/Blocked/Not run) | Evidence or blocking reason | Linked bug -->

### Contacts (run #1, 2026-10-27)

**Module map (T0).** Entry: Admin dashboard tab `contacts` (`src/lib/admin-navigation.ts:76,161`; `src/components/admin/AdminUserManager.tsx:254,351,377`) → `src/components/admin/ContactsPanel.tsx` → `contacts/ContactsListView.tsx` (server pagination, 250 ms debounce, `contacts-client-cache.ts` keyed by org + switchVersion) and `contacts/ContactFormView.tsx` (create/update/delete, children, tags, chatter). Server actions: `src/app/actions/contacts.ts` (all use `createAdminClient` = service role; auth = `ensureAuth` session-only; org scope via `resolveContactsOrganizationId`; no module-permission check). DB: `contacts`, `contact_tags`, `contact_tag_links`, `contact_activity_logs`, `contact_sales_assignments`; duplicate-phone trigger (047), `created_at` backfill (048), search indexes (050), Customer ID sequence RPC `allocate_contact_lead_id_formatted`. Hand-offs: create → `ensureAutoOpportunityForNewContact` (CRM); salesperson change → RPC `transfer_contact_to_sales_agent` (028); the mobile app relies on `contacts.phone` + `salesperson_id` for inquiries (021/024/029). Uncommitted developer changes at audit time: mobile `app.json`, `package.json`, `package-lock.json` (none in Contacts files).

| ID | Category | Scenario | Tier | Status | Evidence or blocking reason | Linked bug |
|---|---|---|---|---|---|---|
| TC-CONTACTS-001 | Positive | List loads newest first with stable `id` tie-breaker | T0 | Passed | `contacts.ts:744-747` | |
| TC-CONTACTS-002 | Boundary | Page size clamped to 1..100, page ≥ 1 | T0 | Passed | `contacts.ts:671-675` | |
| TC-CONTACTS-003 | Boundary | Page past end → empty rows + counts; UI steps back to last page | T0 | Passed | `contacts.ts:811,835`; `ContactsListView.tsx:200-202` | |
| TC-CONTACTS-004 | Positive | Search by Customer ID with leading `#` | T1 | Passed | Harness: `"#674810" => true` | |
| TC-CONTACTS-005 | Positive | Search by name substring | T1 | Passed | Harness: `"ali" => true` | |
| TC-CONTACTS-006 | Positive | Search by phone digits for a formatted stored phone | T1 | Failed | Harness: `"03123456789" => false` | LGX-CONTACTS-004 |
| TC-CONTACTS-007 | Positive | Search by full email / name containing `.` | T1 | Failed | Harness: `"ali.khan@gmail.com" => false` | LGX-CONTACTS-005 |
| TC-CONTACTS-008 | Validation | Date range filter: Karachi day bounds, end exclusive, swapped dates | T1 | Passed | `node --test` on tsc-compiled `contact-date-range.test.ts`: 4/4 pass | |
| TC-CONTACTS-009 | Validation | Name required; employer-linked individual may use phone as name | T0 | Passed | `contacts.ts:373-393,1624-1630` | |
| TC-CONTACTS-010 | Validation | Company has no employer; not own employer; employer must be company type, same org | T0 | Passed | `contacts.ts:1283,1399-1416` | |
| TC-CONTACTS-011 | Validation | Duplicate phone blocked on create/update (trigger 047, digit comparison) | T0 | Passed | `047_…sql:19-58`; error parsed `contacts.ts:355-371` | |
| TC-CONTACTS-012 | Permission | Org isolation for admin/user/sales_agent in detail, update, delete, children, chatter | T0 | Passed | Org filter applied when scoped (`:1120,1801,1884,1961,2012,2081,2122`) | |
| TC-CONTACTS-013 | Permission | Org isolation for `organization` / `operations` sessions | T0 | Failed | `unscoped` → no filter | LGX-CONTACTS-001 |
| TC-CONTACTS-014 | Permission | Contacts (`customers`) module permission enforced server-side | T0 | Failed | No check in `contacts.ts` | LGX-CONTACTS-002 |
| TC-CONTACTS-015 | Permission | Sales "own" user cannot open/edit/reassign/delete other agents' contacts | T0 | Failed | Detail/mutations lack ownership | LGX-CONTACTS-002 |
| TC-CONTACTS-016 | Permission | Sales-agent list limited to active organization | T0 | Failed | `contacts.ts:535-536` | LGX-CONTACTS-006 |
| TC-CONTACTS-017 | Integration | New top-level contact auto-creates CRM opportunity (skips child / org-less) | T0 | Passed | `contacts.ts:1736-1771`; execution needs T4 | |
| TC-CONTACTS-018 | Integration | Salesperson change transfers CRM ownership atomically | T0 | Failed | Transfer before update, no rollback | LGX-CONTACTS-008 |
| TC-CONTACTS-019 | Integration | Delete contact with children / invoices / opportunities is guarded | T0 | Failed | Cascade / SET NULL FKs, no guard | LGX-CONTACTS-003 |
| TC-CONTACTS-020 | Integration (web↔mobile) | Mobile inquiry resolves contact by phone + salesperson after web edits | T4 | Blocked | Mutating; mobile `.env` empty; no test DB | |
| TC-CONTACTS-021 | Integration | Duplicate warning → user finds the existing customer through search | T0/T1 | Failed | Phone search fails; NULL-org rows hidden | LGX-CONTACTS-004, LGX-CONTACTS-007 |
| TC-CONTACTS-022 | Regression (`cfcb91f`) | `getContactsPage` keeps `getContacts` access/search/child-filter semantics | T0 | Passed | Same `applyContactsListFilters`; DB ownership filter replaces in-memory one | |
| TC-CONTACTS-023 | Validation | Tag create dedupes case-insensitively, scoped per org | T0 | Failed | Global table, wildcard `ilike` | LGX-CONTACTS-009 |
| TC-CONTACTS-024 | Error state | Query error → toast + error state; cached page retained | T0 | Passed | `ContactsListView.tsx:155-162` | |
| TC-CONTACTS-025 | Empty state | Super Admin without org → empty list; create/edit/delete blocked with message | T0 | Passed | `contacts.ts:494-496,1576-1580,1789-1793` | |
| TC-CONTACTS-026 | Performance | List/search response time at production volume | T3 | Blocked | `LOGISTIX_QA_READONLY_BROWSER`/`SAFE_ENV` not set | |
| TC-CONTACTS-027 | Performance | CRM Customers uses unpaginated `getContacts` (loops up to 100k rows) | T0 | Not run | `crm/customers.ts:15` → `contacts.ts:904-935`; needs measurement | |
| TC-CONTACTS-028 | Regression | Web type-check | T1 | Passed | `npm run type-check` exit 0 | |
| TC-CONTACTS-029 | Regression | Lint of Contacts files | T1 | Passed | `npx eslint <contacts files>` exit 0, 0 errors / 1 warning | LGX-CONTACTS-005 |
| TC-CONTACTS-030 | Positive | Browser: debounce, type/source filters, pagination, console/network errors | T3 | Blocked | Browser gate not set | |
| TC-CONTACTS-031 | Positive | Create/update/delete/children/chatter end-to-end | T4 | Blocked | No test DB or role accounts | |
| TC-CONTACTS-032 | Regression | Indexes 047/050 and trigger present on the live DB | T2 | Blocked | Hosted DB treated as production | |
| TC-CONTACTS-033 | Validation | Search with `"` or other PostgREST metacharacters does not error | T3 | Not run | Needs browser or test DB | |
| TC-CONTACTS-034 | Positive | Search `.or()` combined with source-filter `.or()` is ANDed correctly | T2/T3 | Blocked | Needs live query | |

---

## Run log

| # | Date | Module | Branch @ HEAD (web / mobile) | Tiers run | Tiers blocked | Pre/post snapshot match | Passed / Failed / Blocked / Not run |
|---|---|---|---|---|---|---|---|
| 0 | 2026-10-27 | QA system setup (no audit) | `testing` @ `cfcb91f` / `main` @ `6af2283` | none | T2–T4 (no dedicated test DB or test accounts) | n/a | 0 / 0 / 0 / 0 |
| 1 | 2026-10-27 | Contacts | `testing` @ `cfcb91f` / `main` @ `6af2283` | T0, T1 (type-check exit 0; scoped eslint exit 0, 1 warning; date-range unit test 4/4 via tsc→CJS, because `node --test` on the `.ts` fails with ERR_MODULE_NOT_FOUND on extensionless imports and `tsx` is absent; search logic harness) | T2–T4 (hosted DB = production; no `LOGISTIX_QA_*` gates; no role test accounts) | yes (all hashes and branches identical; note: the untracked-file content hash covers names only, because `xargs md5sum` resolves paths relative to the cwd) | 16 / 10 / 6 / 2 |

> Run #1 caveat (added 2026-10-27): this run was invoked from a session opened at `mega`, so it ran in a generic fallback agent **without** the logistix-qa hooks. Its read-only behaviour was by instruction only. An independent check afterwards found no Git-state change in either repo, and the only file changed was this report (plus the git-ignored `tsconfig.tsbuildinfo` refreshed by type-check). The snapshot step has since been replaced by `snapshot.cjs`, which hashes the contents of every modified or untracked file.
