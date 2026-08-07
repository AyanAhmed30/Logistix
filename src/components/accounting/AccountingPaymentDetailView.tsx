"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccountingCustomerPaymentDetail } from "@/app/actions/accounting/payments";
import { paymentMethodLabel } from "@/lib/accounting-payments";
import { formatMoney } from "@/lib/sales-quotation-form";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { AccountingActivitiesPanel } from "@/components/accounting/AccountingActivitiesPanel";

type Props = {
  paymentId: string;
};

export function AccountingPaymentDetailView({ paymentId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<
    NonNullable<
      Awaited<ReturnType<typeof getAccountingCustomerPaymentDetail>>["payment"]
    > | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getAccountingCustomerPaymentDetail(paymentId).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        toast.error(res.error);
        setPayment(null);
      } else if (res.payment) {
        setPayment(res.payment);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  if (loading) {
    return (
      <div className="p-4">
        <AccountingTableSkeleton rows={6} cols={4} />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-secondary-muted">Payment not found.</p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-sm"
          onClick={() => router.push("/accounting/payments")}
        >
          Back to Payments
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/80">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => router.push("/accounting/payments")}
          >
            <ArrowLeft className="h-4 w-4" />
            Payments
          </Button>
          <span className="text-sm font-semibold text-primary-dark">
            {payment.payment_number}
          </span>
          <span className="inline-flex rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 capitalize">
            {payment.status}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-slate-200">
          {payment.contact_id ? (
            <button
              type="button"
              onClick={() =>
                router.push(`/accounting/customers/${payment.contact_id}`)
              }
              className="rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[84px]"
            >
              <div className="flex items-center gap-1 text-sm font-semibold text-[#017e84]">
                <UserRound className="h-3.5 w-3.5" />
              </div>
              <div className="text-[10px] text-secondary-muted mt-0.5">
                Customer
              </div>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              router.push(`/accounting/invoices/${payment.invoice_id}`)
            }
            className="rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-left hover:border-[#017e84]/40 min-w-[84px]"
          >
            <div className="text-sm font-semibold tabular-nums text-[#017e84] leading-none">
              1
            </div>
            <div className="text-[10px] text-secondary-muted mt-0.5">
              Invoice
            </div>
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-4">
          <Field label="Customer" value={payment.customer_name || "—"} />
          <Field
            label="Customer ID"
            value={payment.customer_lead_id || "—"}
            mono
          />
          <Field
            label="Invoice"
            value={payment.invoice_number || "—"}
            link={
              payment.invoice_id
                ? () =>
                    router.push(`/accounting/invoices/${payment.invoice_id}`)
                : undefined
            }
          />
          <Field label="Payment Date" value={payment.payment_date || "—"} />
          <Field
            label="Payment Method"
            value={paymentMethodLabel(payment.payment_method)}
          />
          <Field label="Amount" value={formatMoney(payment.amount)} />
          <Field
            label="Invoice Total"
            value={
              payment.invoice_total != null
                ? formatMoney(payment.invoice_total)
                : "—"
            }
          />
          <Field
            label="Amount Paid (Invoice)"
            value={
              payment.invoice_amount_paid != null
                ? formatMoney(payment.invoice_amount_paid)
                : "—"
            }
          />
          <Field
            label="Remaining Balance"
            value={
              payment.amount_residual != null
                ? formatMoney(payment.amount_residual)
                : "—"
            }
          />
          <Field label="Reference" value={payment.reference || "—"} />
          <Field label="Paid By" value={payment.paid_by || "—"} />
          <Field
            label="Organization"
            value={payment.organization_name || "—"}
          />
        </div>

        {payment.notes ? (
          <div className="px-4 pb-4">
            <p className="text-[11px] uppercase text-secondary-muted mb-1">
              Notes
            </p>
            <p className="text-sm text-primary-dark whitespace-pre-wrap">
              {payment.notes}
            </p>
          </div>
        ) : null}
      </div>

      {payment.contact_id ? (
        <AccountingActivitiesPanel contactId={payment.contact_id} />
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: () => void;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase text-secondary-muted mb-0.5">
        {label}
      </p>
      {link ? (
        <button
          type="button"
          onClick={link}
          className="text-sm font-medium text-[#017e84] hover:underline text-left"
        >
          {value}
        </button>
      ) : (
        <p
          className={`text-sm text-primary-dark ${
            mono ? "font-mono text-xs" : ""
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}
