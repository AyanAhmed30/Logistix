"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  ScrollText,
} from "lucide-react";
import { ContactFormView } from "@/components/admin/contacts/ContactFormView";
import { AccountingActivitiesPanel } from "@/components/accounting/AccountingActivitiesPanel";
import {
  getCustomerAccountingBalance,
  type CustomerBalanceSummary,
} from "@/app/actions/accounting/customer-accounting";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

type Props = {
  contactId: string;
};

const SMART = [
  { id: "ledger", label: "Ledger", icon: BookOpen, href: (id: string) => `/accounting/customers/${id}/ledger` },
  { id: "statement", label: "Statement", icon: ScrollText, href: (id: string) => `/accounting/customers/${id}/statement` },
  { id: "outstanding", label: "Outstanding", icon: FileText, href: (id: string) => `/accounting/customers/${id}/invoices?filter=outstanding` },
  { id: "paid", label: "Paid", icon: CheckCircle2, href: (id: string) => `/accounting/customers/${id}/invoices?filter=paid` },
  { id: "overdue", label: "Overdue", icon: AlertTriangle, href: (id: string) => `/accounting/customers/${id}/invoices?filter=overdue` },
  { id: "timeline", label: "Timeline", icon: Clock, href: (id: string) => `/accounting/customers/${id}/timeline` },
  { id: "transactions", label: "Transactions", icon: History, href: (id: string) => `/accounting/customers/${id}/transactions` },
] as const;

export function AccountingCustomerHub({ contactId }: Props) {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const [balance, setBalance] = useState<CustomerBalanceSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCustomerAccountingBalance(contactId).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        // Soft fail — contact may still open
        setBalance(null);
      } else if (res.balance) {
        setBalance(res.balance);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [contactId, switchVersion]);

  const counts: Record<string, number | string> = {
    outstanding: balance?.outstanding_count ?? 0,
    paid: balance?.paid_count ?? 0,
    overdue: balance?.overdue_count ?? 0,
  };

  return (
    <div className="space-y-3">
      {balance ? (
        <div className="grid gap-2 sm:grid-cols-4 bg-white border border-slate-200 rounded-sm p-3">
          <div>
            <p className="text-[11px] uppercase text-secondary-muted">Current Balance</p>
            <p className="text-lg font-semibold text-primary-dark">
              {formatMoney(balance.current_balance)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-secondary-muted">Outstanding</p>
            <p className="text-lg font-semibold text-[#017e84]">
              {formatMoney(balance.outstanding_balance)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-secondary-muted">Paid Amount</p>
            <p className="text-lg font-semibold text-primary-dark">
              {formatMoney(balance.paid_amount)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-secondary-muted">Credit Balance</p>
            <p className="text-lg font-semibold text-emerald-700">
              {formatMoney(balance.credit_balance)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {SMART.map((item) => {
          const Icon = item.icon;
          const count = counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(item.href(contactId))}
              className="rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[84px]"
            >
              <div className="flex items-center gap-1 text-sm font-semibold text-[#017e84] leading-none">
                <Icon className="h-3.5 w-3.5" />
                {count != null ? <span>{count}</span> : null}
              </div>
              <div className="text-[10px] text-secondary-muted mt-0.5">{item.label}</div>
            </button>
          );
        })}
      </div>

      <AccountingActivitiesPanel contactId={contactId} />

      <ContactFormView
        contactId={contactId}
        readOnly={false}
        backLabel="Customers"
        onBack={() => router.push("/accounting/customers")}
        onSaved={(id) => {
          router.push(`/accounting/customers/${id}`);
          toast.success("Customer saved");
        }}
      />
    </div>
  );
}
