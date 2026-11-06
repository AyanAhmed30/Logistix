---
name: logistix-ui-ux
description: Senior product design and frontend standards for the Logistix ERP/CRM web app. Use for any request that designs, redesigns, reviews or builds user interface in Logistix - UI or UX improvements, dashboards, ERP and CRM screens, responsive layouts, forms, tables, data grids, navigation, sidebars, modals, drawers, cards, charts, empty, loading and error states, frontend component design, visual redesign, accessibility, or design-system work. Do not use for backend-only work with no visible UI change, such as server actions, SQL, migrations, RLS, API logic, accounting calculations, or test and CI setup.
argument-hint: <screen, component or UI problem>
---

# Logistix UI/UX

Work as a senior product designer and senior frontend engineer on a working ERP. People use it all day to run logistics, sales and accounting. Good design here means faster, clearer, more consistent work, not a new look.

**Request:** $ARGUMENTS

Before designing, read [references/design-system.md](references/design-system.md). It records this codebase's actual tokens, components, patterns and measured contrast.

## Priority when guidance conflicts

1. What the user asked for in this request.
2. The preservation rules below.
3. This skill and its reference.
4. Any general design skill, including `frontend-design:frontend-design`.

That general skill aims for a distinctive identity, new typefaces and aesthetic risk. Logistix is an existing brand, so treat this skill as the brief: keep its writing guidance and its advice on avoiding templated output, but do not change the palette, typefaces or layout concept unless the user asks for a redesign.

## Preservation rules (never break these)

UI work never changes behavior on its own. Always preserve:

- API integrations, server actions, Supabase queries and database schemas
- Authentication, user roles, module permissions and access gating
- Organization switching and organization-level data isolation
- Form validations, calculations, status transitions and business workflows
- Existing navigation, routes, keyboard shortcuts and deep links

Also:

- Do not remove a field, column, filter or action to make a screen look cleaner. If something seems unnecessary, ask.
- Do not add fake or placeholder data where real data exists.
- Do not create a component that duplicates an existing one. Search first.
- Do not add a UI library unless the existing stack cannot do the job and the user agrees.
- Do not touch unrelated screens, and do not refactor logic while restyling.
- If a design needs a backend or permission change, stop and ask. Do not include it silently.

## Process

For every UI request:

1. **Inspect** the screen, its components and its server actions. Trace which props and state carry business logic.
2. **Understand** who uses it, what job it does, and how often.
3. **Map the workflow**: entry points, steps, permissions, and each state (loading, empty, error, partial, read-only).
4. **Review** the reference file, then look for the closest existing screen. In the module shells, match that screen before inventing anything.
5. **List the problems** as specific usability and visual issues, each tied to the code.
6. **Decide the approach.** For anything larger than a small fix, describe the plan and the files you expect to touch before editing. Wait for approval if it changes layout or flow noticeably.
7. **Implement** inside the existing architecture, with the smallest change that solves the problem.
8. **Test** responsive behavior at the widths below.
9. **Check for regressions** in the visual result and in the screen's behavior.
10. **Verify** every action still works, then report honestly (see "Reporting").

## Design standards

### Enterprise quality

Aim for the quality of Odoo, Linear, Stripe Dashboard, Notion, Vercel Dashboard and modern enterprise CRMs: consistency, calm surfaces, clear hierarchy, density and fast interactions. Use them as a quality bar and do not copy their layouts or branding. Odoo is the closest model, because the CRM, Sales and Accounting modules already follow its control panel, status bar and kanban patterns.

### Avoid generic AI design

Do not use:

- Gradient-heavy dashboards or gradient washes as decoration
- Rounded cards around everything, or the same card layout on every screen
- Decorative shadows; use a border and spacing to separate surfaces
- Colors outside the system, or color without meaning
- Oversized headings or KPI numbers, or excess whitespace on working screens
- Decoration with no function, such as icons in tinted circles or eyebrow labels above headings
- Inconsistent spacing
- Entrance animations, `hover-lift` on working screens, or motion that delays work

Prefer plain surfaces, one border weight, aligned edges, and hierarchy from weight and position.

### Typography

Use the existing font stack. Keep this hierarchy, and match neighboring screens when they differ:

| Role | Classes |
|---|---|
| Page title | `text-base sm:text-lg font-semibold text-primary-dark` in module control panels; `text-xl font-semibold` for standalone pages |
| Section heading | `text-base font-semibold` |
| Body and form values | `text-sm` |
| Labels | `text-sm font-medium` (`text-xs` in dense forms) |
| Helper text | `text-xs text-secondary-muted` |
| Table header | `text-xs` or `text-sm`, `font-semibold text-primary-dark` |
| Table cell | `text-sm` |
| Numbers | `tabular-nums`, right-aligned in tables |

Use sentence case. Never go below `text-xs`, and use it for secondary information only.

### Color

Keep the existing brand unless the user explicitly requests a redesign. Use the semantic mapping in the reference file for success, warning, error, information, neutral and status badges. A status keeps the same color on every screen. Never rely on color alone: pair it with a label or an icon.

### Spacing and layout

Use the Tailwind 4px scale: `gap-2` within controls, `gap-3`/`gap-4` between related groups, `gap-6` between sections. Page padding follows the shell, `p-3 sm:p-4 md:p-5`. Align to shared edges, and keep content density appropriate to the task: lists and forms are dense, reports may breathe.

### Tables and data-heavy screens

- Keep the information density. Do not trade columns for decoration.
- Give each table a clear primary column, with secondary columns quieter.
- Left-align text, right-align numbers, and keep dates and IDs in one format.
- Provide search, filters, pagination and sorting where the data needs them. Do them server-side if the data can grow, following Contacts (`getContactsPage`). Changing a query is a logic change, so get agreement first.
- Keep rows, actions and pagination stable while reloading. Dim existing rows instead of blanking them.
- Show loading, empty (with a different message when filters are active) and error states with Retry.
- Below `md`, keep horizontal scroll with the key column visible, or switch to stacked rows. Never hide data with no way to reach it.

### Forms

- Group fields by meaning, in the order the user works through them.
- Every input has a visible label. Use `h-9` inputs consistently and mark required fields.
- Show validation next to the field in plain language, and link it with `aria-invalid` and `aria-describedby`. Keep the existing validation rules.
- Tab order follows the visual order, and Enter submits only where that is safe.
- Keep Save and Cancel in a consistent place. Disable Save and show progress while saving, and prevent double submission.
- Add unsaved-change protection on long or high-value forms. Nothing in the app does this yet, so propose it first.
- Follow the file's existing pattern. Most forms use controlled state and server actions, so do not convert one to react-hook-form as part of a visual change.

### Responsive design

Every new or changed screen must work at 1440px (desktop), 1024px (laptop), 768px (tablet) and 375px (mobile). Adapt rather than shrink:

- Navigation collapses into the existing mobile menu.
- Tables scroll or stack.
- Forms go to one column.
- Secondary actions move into a menu.
- Touch targets are at least 40px on touch layouts.
- No horizontal page scroll. Only tables and kanban boards scroll sideways.

### Interaction

- Every control has hover, focus-visible, active and disabled states.
- Show progress in place: a skeleton for first load, dimmed content for reloads, and a button spinner for actions. Never add artificial delays or full-screen blockers.
- Use `sonner` toasts for results. Name the action, as in "Contact saved".
- Destructive actions need a confirmation that names what is affected. Use a `Dialog` for new work, since no `AlertDialog` exists yet.
- Keep transitions short and subtle (100 to 200ms, color and opacity). Respect `prefers-reduced-motion` for any new motion.

### Accessibility

Follow WCAG 2.2 AA in practice:

- Everything works by keyboard, focus is always visible, and dialogs trap and restore focus. Radix does this if you use the existing `ui/` primitives.
- Text contrast is at least 4.5:1, or 3:1 for large text and UI boundaries. See the measured values in the reference.
- Use semantic HTML: `button` for actions, `a`/`Link` for navigation, `th` for headers, and one `h1` per page.
- Every input has a label, and icon-only buttons have an `aria-label`.
- Announce async changes with `aria-busy`, `aria-live` or a toast.

## Visual quality checks

After a UI change, check each of these and record the result:

- Desktop, tablet and mobile layout
- Typography and spacing consistency, and component alignment
- Interactive states
- Form validation
- Table behavior
- Loading, empty and error states
- Every existing action still works

Always run `npm run type-check` and `npm run lint`.

Use a browser or screenshots if one is available, and inspect the rendered UI. The app reads real data from the one hosted database, so **only view and navigate**: never submit, approve, delete or drag anything unless the user confirms a safe test environment. Mobile app UI lives in `../logistix-app`, a separate Expo project; this skill covers the web app.

## Reporting

End with: what changed and why, the files touched, and what you verified, split into **checked in a browser**, **checked by code or type-check only**, and **not checked**. Never say responsive or visual testing was done unless you saw the rendered screen.
