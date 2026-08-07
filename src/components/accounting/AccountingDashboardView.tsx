"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Building2,
  FileText,
  Landmark,
  LayoutDashboard,
  Link2,
  Lock,
  Receipt,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { getAccountingDashboardStats } from "@/app/actions/accounting/invoices";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingKpiSkeleton } from "@/components/accounting/AccountingSkeleton";

type DashStats = {
  draftCount: number;
  invoiceCount: number;
  customerCount: number;
  billCount: number;
  jeCount: number;
  assetCount: number;
  loanCount: number;
  taxReturnCount: number;
  hardLockDate: string | null;
  openFiscalYears: number;
  receivablesOutstanding: number;
  payablesOutstanding: number;
};

const empty: DashStats = {
  draftCount: 0,
  invoiceCount: 0,
  customerCount: 0,
  billCount: 0,
  jeCount: 0,
  assetCount: 0,
  loanCount: 0,
  taxReturnCount: 0,
  hardLockDate: null,
  openFiscalYears: 0,
  receivablesOutstanding: 0,
  payablesOutstanding: 0,
};

export function AccountingDashboardView() {
  const { switchVersion } = useAdminOrganization();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashStats>(empty);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getAccountingDashboardStats().then((res) => {
      if (cancelled) return;
      if (!("error" in res && res.error)) {
        setStats({
          draftCount: res.draftCount ?? 0,
          invoiceCount: res.invoiceCount ?? 0,
          customerCount: res.customerCount ?? 0,
          billCount: res.billCount ?? 0,
          jeCount: res.jeCount ?? 0,
          assetCount: res.assetCount ?? 0,
          loanCount: res.loanCount ?? 0,
          taxReturnCount: res.taxReturnCount ?? 0,
          hardLockDate: res.hardLockDate ?? null,
          openFiscalYears: res.openFiscalYears ?? 0,
          receivablesOutstanding: res.receivablesOutstanding ?? 0,
          payablesOutstanding: res.payablesOutstanding ?? 0,
        });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [switchVersion]);

  const cards = [
    { label: "Customers", value: stats.customerCount, href: "/accounting/customers", icon: Users },
    { label: "Invoices", value: stats.invoiceCount, href: "/accounting/invoices", icon: FileText },
    {
      label: "Receivables",
      value: stats.receivablesOutstanding.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      }),
      href: "/accounting/reconcile",
      icon: Wallet,
      isText: true,
    },
    {
      label: "Payables",
      value: stats.payablesOutstanding.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      }),
      href: "/accounting/bills",
      icon: Truck,
      isText: true,
    },
    { label: "Draft Invoices", value: stats.draftCount, href: "/accounting/invoices", icon: LayoutDashboard },
    { label: "Vendor Bills", value: stats.billCount, href: "/accounting/bills", icon: Truck },
    { label: "Journal Entries", value: stats.jeCount, href: "/accounting/journal-entries", icon: BookOpen },
    { label: "Assets", value: stats.assetCount, href: "/accounting/assets", icon: Building2 },
    { label: "Loans", value: stats.loanCount, href: "/accounting/loans", icon: Landmark },
    { label: "Tax Returns", value: stats.taxReturnCount, href: "/accounting/tax-returns", icon: Receipt },
    {
      label: "Fiscal Lock",
      value: stats.hardLockDate || "Open",
      href: "/accounting/configuration/lock-dates",
      icon: Lock,
      isText: true,
    },
    {
      label: "Open Fiscal Years",
      value: stats.openFiscalYears,
      href: "/accounting/configuration/lock-dates",
      icon: Link2,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-primary-dark">
          Accounting Dashboard
        </h2>
        <p className="text-sm text-secondary-muted mt-1">
          End-to-end flow: invoices → journals → payments → reconcile → assets →
          loans → taxes → lock dates → year closing.
        </p>
      </div>

      {loading ? (
        <AccountingKpiSkeleton count={8} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.label}
                href={card.href}
                className="bg-white border border-slate-200 rounded-sm shadow-sm p-4 hover:border-[#017e84]/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-secondary-muted">{card.label}</span>
                  <Icon className="h-4 w-4 text-[#017e84]" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-primary-dark tabular-nums truncate">
                  {"isText" in card && card.isText
                    ? String(card.value)
                    : card.value}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-4">
        <p className="text-sm font-semibold text-primary-dark mb-2">
          Accounting Architecture
        </p>
        <p className="text-xs text-secondary-muted leading-relaxed">
          Contacts → CRM → Opportunity → Quotation → Sales Order → Invoice → Post →
          Journal Entries → Payments → Reconciliation → Assets → Loans → Taxes →
          Reports → Lock Dates → Year Closing. Journal Entries remain the single
          source of truth; lock dates and fiscal year close prevent changes to
          finalized periods.
        </p>
      </div>
    </div>
  );
}
