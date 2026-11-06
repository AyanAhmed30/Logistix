# Logistix design system reference

What the code actually does, inspected 2026-11-05 on branch `testing`. If this disagrees with the code, trust the code and tell the user.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4 (CSS-first config in `src/app/globals.css`; no `tailwind.config`), `tailwindcss-animate`
- shadcn/ui, "new-york" style, `baseColor: neutral`, primitives in `src/components/ui/`
- Radix primitives, `lucide-react` icons, `sonner` toasts, `recharts` charts, `@dnd-kit` drag and drop
- `cn()` from `@/lib/utils`, `class-variance-authority` for variants

## Color

### Brand

| Role | Value | Usage |
|---|---|---|
| Brand teal | `#017e84` | Module header bar, primary actions, links, active state. Written as `bg-[#017e84]` (about 560 uses) |
| Teal hover | `#016970` | Hover and pressed state of teal |
| Teal tint | `#e6f4f5` | Active step or chip, as `bg-[#e6f4f5] text-[#017e84] border-[#017e84]/40` |
| Primary dark | `#073D51`, `text-primary-dark` | Headings and strong text |
| Accent | `#218C94`, `text-primary-accent` | Mainly Admin dashboard panels (about 15 files) |
| Muted text | `#577B86`, `text-secondary-muted` | Secondary text and helper text |
| Light | `#AAC6CF`, `bg-light-bg` | Decorative only; never use as text |
| Page background | `#f8f9fa` | CRM, Sales and Accounting shells |
| Surface | white, `border-slate-200` | Tables, panels, control panels |

**Primary button caveat:** `<Button>` default uses `--primary`, a dark navy, while most primary actions override it with `bg-[#017e84] hover:bg-[#016970] text-white`. Copy what the surrounding module does. Do not change the `--primary` token, because that restyles the whole app.

**Global text rule:** `globals.css` applies `text-primary-dark` to `*`, so an element does not inherit a parent's text color unless it sets its own. If text color seems ignored, set it on the element itself.

**Dark mode:** not active. There is no `ThemeProvider`, and only about 14 `dark:` classes exist. Design for light mode only.

### Semantic colors

Match the existing badge pattern: tinted background, dark text, matching border.

| Meaning | Classes |
|---|---|
| Success | `bg-emerald-50 text-emerald-800 border-emerald-200` |
| Warning, pending, draft-attention | `bg-amber-50 text-amber-800 border-amber-200` |
| Error, cancelled, rejected | `bg-red-50 text-red-700 border-red-200` |
| Information, in progress | `bg-sky-50 text-sky-800 border-sky-200` (older screens use `blue`) |
| Neutral, closed, disposed | `bg-slate-100 text-slate-700 border-slate-300` |

Status mappings are currently repeated per file (`statusBadge`, `statusBadgeClass`). Reuse the mapping in the same module. Check what a status already looks like before assigning a color.

### Measured contrast (WCAG 2)

| Pair | Ratio | Result |
|---|---|---|
| White on `#017e84` | 4.86 | Passes AA |
| White on `#016970` | 6.45 | Passes AA |
| `#017e84` text on white | 4.86 | Passes AA |
| `#017e84` text on `#f8f9fa` | 4.61 | Passes AA |
| `#073D51` on white | 11.70 | Passes AAA |
| `#577B86` on white | 4.58 | Passes AA, narrowly |
| `#577B86` on `#f8f9fa` | 4.35 | **Fails AA for normal text.** Use `slate-600` or place it on a white surface |
| `slate-500` on white | 4.76 | Passes AA |
| `slate-400` on white | 2.56 | **Fails.** About 170 existing uses. Fine for decorative icons; do not use for text in new work |
| `#AAC6CF` on white | 1.80 | **Fails.** Decorative only |

## Typography

- System font stacks in `globals.css`. The `--font-geist-*` variable names are misleading: Geist is not loaded, on purpose, to avoid a network font fetch at build time. Do not add web fonts.
- Headings default to `font-bold text-primary-dark`.
- The app is dense: `text-sm` (about 1470 uses) and `text-xs` (about 1150 uses) dominate. `text-2xl` and above are rare.
- `tabular-nums` is already common for numbers.

## Radius and shadow

- `--radius` is `0.75rem`, but working screens mostly use `rounded-lg` and `rounded-md`. Status chips use `rounded-sm`.
- Surfaces use a border, not a shadow. `.hover-lift`, `.animate-fade-up` and `.animate-float-slow` are used only by the landing page (`src/app/page.tsx`) and should not be used on working screens.

## Shells

Each module has a shell. Do not build new page chrome.

| Module | Files | Pattern |
|---|---|---|
| CRM | `crm/CrmShell.tsx`, `CrmTopNav`, `CrmControlPanel` | Teal `h-12` sticky header, control panel, `bg-[#f8f9fa]`, `p-3 sm:p-4 md:p-5` |
| Sales | `sales/SalesShell.tsx`, `SalesTopNav`, `SalesControlPanel` | Same pattern |
| Accounting | `accounting/AccountingShell.tsx`, `AccountingTopNav`, `AccountingControlPanel` | Same pattern |
| Admin dashboard | `admin/AdminDashboardShell.tsx`, `AdminUserManager.tsx` | White `h-16` header, tab-state single page, `.sidebar-button` navigation |
| Organization | `organization/OrganizationDashboardShell.tsx` | `.sidebar-button` navigation |

The control panel row holds breadcrumb, New button, search, filters and favorites. Page metadata comes from `src/lib/*-navigation.ts`.

Module header actions must stay. These include `OrganizationSwitcher`, `AppNotificationBell` and the user menu.

## Components to reuse

**Primitives** (`src/components/ui/`): `button` (sizes `xs`, `sm`, default `h-9`, `lg`, `icon*`), `input`, `textarea`, `select`, `checkbox`, `label`, `form`, `table`, `dialog`, `sheet`, `dropdown-menu`, `badge`, `card`, `separator`, `sonner`, `ModuleLoadingOverlay`.

Missing: `AlertDialog`, `Tabs`, `Tooltip`, `Popover`, `Skeleton`, `Pagination`. Check module folders for a local version before adding one with the shadcn CLI, and ask first if the addition is shared.

**Loading and empty states**:
- `accounting/AccountingSkeleton.tsx`: `AccountingSkeleton`, `AccountingTableSkeleton`, `AccountingKpiSkeleton`, `AccountingFormSkeleton`, `AccountingChartSkeleton`
- `sales/SalesSkeleton.tsx`: `SalesPageSkeleton`, `SalesReportSkeleton`, `SalesKanbanSkeleton`, `SalesEmptyState`
- Route-level `loading.tsx` files exist for the main modules

**Status bars**: `AccountingInvoiceStatusBar`, `SalesQuotationStatusBar` (Odoo-style step bar; `role="list"` with an `aria-label`).

**Hooks**: `useDebouncedValue`, `use-safe-async`, `useCrmKeyboardShortcuts`, `useSalesKeyboardShortcuts`, `useAccountingShortcuts`.

**Contexts**: `AdminOrganizationContext` (active organization, `switchVersion`), `DashboardAccessContext` (module access). Components use these to gate data and actions. Keep them in place when restructuring.

## Reference screens

| Pattern | Best example |
|---|---|
| Server-paged list with search, filters, loading, empty, error and retry | `admin/contacts/ContactsListView.tsx` |
| Kanban with cached paint and silent refresh | `crm/CrmPipelineView.tsx` |
| Business form with status bar | `accounting/*FormView.tsx`, `crm/CrmOpportunityFormView.tsx` |
| Charts | `accounting/AccountingReportsView.tsx`, `hr/AnalyticsPanel.tsx` |

## Known constraints and inconsistencies

Do not fix these in passing. Mention them if they affect the work.

- Brand teal is hard-coded across hundreds of classes instead of a token. Moving it to a token is a separate, agreed task.
- `globals.css` forces `[data-slot="dialog-content"]` to center with `!important`, so custom dialog positioning needs care. `Sheet` is used in only one file.
- Native `confirm()` appears in about 8 places, and about 10 files build their own `fixed inset-0` modals. Use `Dialog` for new work.
- `useForm` appears only inside `ui/form.tsx`. Real forms use controlled state and server actions.
- No screen has unsaved-change protection (`beforeunload`).
- Nothing handles `prefers-reduced-motion` yet.
- Only about 25 of the roughly 146 tables use raw `<table>`; the rest use the `Table` primitive. Prefer the primitive.
- `InvoicePanel.tsx` and printable documents have their own palette (`#1f2435`, `#8c4f82`). Printed document design is separate from app UI and must keep its layout.
