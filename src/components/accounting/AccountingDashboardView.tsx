"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Users, LayoutDashboard } from "lucide-react";
import { getAccountingDashboardStats } from "@/app/actions/accounting/invoices";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingKpiSkeleton } from "@/components/accounting/AccountingSkeleton";

export function AccountingDashboardView() {
  const { switchVersion } = useAdminOrganization();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    draftCount: 0,
    invoiceCount: 0,
    customerCount: 0,
  });

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
        });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [switchVersion]);

  const cards = [
    {
      label: "Customers",
      value: stats.customerCount,
      href: "/accounting/customers",
      icon: Users,
    },
    {
      label: "Customer Invoices",
      value: stats.invoiceCount,
      href: "/accounting/invoices",
      icon: FileText,
    },
    {
      label: "Draft Invoices",
      value: stats.draftCount,
      href: "/accounting/invoices",
      icon: LayoutDashboard,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-primary-dark">
          Accounting Dashboard
        </h2>
        <p className="text-sm text-secondary-muted mt-1">
          Customers, invoices, payments, credit notes, refunds, and reports.
        </p>
      </div>

      {loading ? (
        <AccountingKpiSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
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
                <p className="mt-2 text-2xl font-semibold text-primary-dark">
                  {card.value}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
