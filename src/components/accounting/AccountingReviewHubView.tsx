"use client";

/**
 * Review hub — Control, Analysis, Regularization, Working Files, and Logs.
 */

import { useRouter } from "next/navigation";
import {
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileOutput,
  FileSearch,
  FolderOpen,
  History,
  Landmark,
  PackageMinus,
  Rows3,
  ScrollText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const TEAL = "#017e84";

const SECTIONS = [
  {
    heading: "Control",
    items: [
      {
        id: "journal-items",
        title: "Journal Items",
        description: "Inspect all journal lines from posted and draft entries",
        href: "/accounting/review/journal-items",
        icon: Rows3,
      },
      {
        id: "journal-entries",
        title: "Journal Entries",
        description: "Posted and draft journal entries — source documents for the ledger",
        href: "/accounting/journal-entries",
        icon: BookOpen,
      },
      {
        id: "journal-audit",
        title: "Journal Audit",
        description: "Journal entry lifecycle — created, posted, modified, reset",
        href: "/accounting/review/journal-audit",
        icon: FileSearch,
        audit: true,
      },
    ],
  },
  {
    heading: "Analysis",
    items: [
      {
        id: "assets",
        title: "Assets",
        description: "Fixed assets that post purchase, depreciation, and disposal journals",
        href: "/accounting/assets",
        icon: Building2,
      },
      {
        id: "depreciation-schedule",
        title: "Depreciation Schedule",
        description: "Depreciation board from posted and draft asset journal entries",
        href: "/accounting/review/depreciation-schedule",
        icon: CalendarClock,
      },
      {
        id: "loans",
        title: "Loans",
        description: "Loan accounts that post disbursement, principal, and interest journals",
        href: "/accounting/loans",
        icon: Landmark,
      },
      {
        id: "loans-analysis",
        title: "Loans Analysis",
        description:
          "Principal, interest, and payments from loan records and their posted journal entries",
        href: "/accounting/review/loans-analysis",
        icon: Landmark,
      },
      {
        id: "invoices-to-be-issued",
        title: "Invoices To Be Issued",
        description: "Sales orders with invoiceable lines awaiting customer invoices",
        href: "/accounting/review/invoices-to-be-issued",
        icon: FileOutput,
      },
      {
        id: "invoiced-not-delivered",
        title: "Invoiced Not Delivered",
        description:
          "Posted invoice lines whose sales-order quantity is not yet fully delivered",
        href: "/accounting/review/invoiced-not-delivered",
        icon: PackageMinus,
      },
    ],
  },
  {
    heading: "Regularization",
    items: [
      {
        id: "deferred-revenues",
        title: "Deferred Revenues",
        description:
          "Not yet supported — invoices do not create recognition schedules. Posted journal items on deferred-revenue accounts are shown if any exist.",
        href: "/accounting/review/deferred-revenues",
        icon: TrendingUp,
      },
      {
        id: "deferred-expenses",
        title: "Deferred Expenses",
        description:
          "Not yet supported — bills do not create prepaid schedules. Posted journal items on prepayment accounts are shown if any exist.",
        href: "/accounting/review/deferred-expenses",
        icon: TrendingDown,
      },
      {
        id: "annual-report",
        title: "Annual Report",
        description: "Fiscal-year P&L, Balance Sheet, and Cash Flow from posted entries",
        href: "/accounting/review/annual-report",
        icon: ScrollText,
      },
    ],
  },
  {
    heading: "Working Files",
    items: [
      {
        id: "working-files",
        title: "Working Files",
        description: "Audit working files, annual reports, and tax return documents",
        href: "/accounting/review/working-files",
        icon: FolderOpen,
      },
    ],
  },
  {
    heading: "Logs",
    items: [
      {
        id: "audit-trail",
        title: "Audit Trail",
        description: "Centralized accounting audit history across modules",
        href: "/accounting/review/audit-trail",
        icon: History,
        audit: true,
      },
    ],
  },
] as const;

export function AccountingReviewHubView() {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" style={{ color: TEAL }} />
          Review
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Accounting control, analysis, regularization, working files, and audit
          trail
        </p>
      </div>

      {SECTIONS.map(({ heading, items }) => (
        <div key={heading} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {heading}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className="text-left rounded-md border border-slate-200 bg-white p-4 hover:border-[#017e84]/40 hover:shadow-sm transition-all"
                >
                  <div
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md mb-3"
                    style={{ backgroundColor: `${TEAL}14`, color: TEAL }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-slate-800">{item.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
