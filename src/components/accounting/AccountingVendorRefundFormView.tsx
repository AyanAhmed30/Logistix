"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelAccountingVendorRefund,
  getAccountingVendorRefundDetail,
  postAccountingVendorRefund,
  type AccountingVendorRefundDetail,
} from "@/app/actions/accounting/vendor-refunds";
import { formatMoney } from "@/lib/sales-quotation-form";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

type Props = { refundId: string };

export function AccountingVendorRefundFormView({ refundId }: Props) {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const [detail, setDetail] = useState<AccountingVendorRefundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getAccountingVendorRefundDetail(refundId);
    if ("error" in res && res.error) {
      toast.error(res.error);
      setDetail(null);
    } else if (res.refund) {
      setDetail(res.refund);
    }
    setLoading(false);
  }, [refundId]);

  useEffect(() => {
    void load();
  }, [load, switchVersion]);

  if (loading) return <AccountingFormSkeleton />;
  if (!detail) {
    return (
      <div className="p-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/accounting/vendor-refunds")}
        >
          Back
        </Button>
      </div>
    );
  }

  const isDraft = detail.status === "draft";
  const statusLabel =
    detail.status === "posted" && detail.amount_refunded > 0.004
      ? "Refunded"
      : detail.status;

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/80">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1"
            onClick={() => router.push("/accounting/vendor-refunds")}
          >
            <ArrowLeft className="h-4 w-4" />
            Refunds
          </Button>
          <span className="font-semibold">{detail.refund_number}</span>
          <span className="text-xs capitalize border rounded-sm px-2 py-0.5 bg-slate-50">
            {statusLabel}
          </span>
          <div className="ml-auto flex gap-1.5">
            {isDraft ? (
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await postAccountingVendorRefund(refundId);
                    if ("error" in res && res.error) toast.error(res.error);
                    else {
                      toast.success("Refund posted");
                      if (res.refund) setDetail(res.refund);
                    }
                  });
                }}
              >
                Confirm
              </Button>
            ) : null}
            {detail.status !== "cancelled" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-sm"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await cancelAccountingVendorRefund(refundId);
                    if ("error" in res && res.error) toast.error(res.error);
                    else {
                      toast.success("Refund cancelled");
                      if (res.refund) setDetail(res.refund);
                    }
                  });
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 p-4 text-sm">
          <div>
            <p className="text-[11px] uppercase text-secondary-muted">Vendor</p>
            <p className="font-medium">{detail.vendor_name}</p>
            <p className="font-mono text-xs text-secondary-muted">
              {detail.vendor_lead_id || "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-secondary-muted">Bill</p>
            {detail.bill_id ? (
              <button
                type="button"
                className="text-[#017e84] hover:underline font-medium"
                onClick={() => router.push(`/accounting/bills/${detail.bill_id}`)}
              >
                {detail.bill_number || detail.bill_id}
              </button>
            ) : (
              <p>—</p>
            )}
            <p className="text-secondary-muted">Date: {detail.refund_date}</p>
            <p className="text-secondary-muted capitalize">
              Type: {detail.refund_type.replace(/_/g, " ")}
            </p>
          </div>
        </div>

        <div className="px-4 pb-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.product_name || "—"}</TableCell>
                  <TableCell>
                    {l.quantity} {l.uom}
                  </TableCell>
                  <TableCell>{formatMoney(l.unit_price)}</TableCell>
                  <TableCell className="text-right">
                    {formatMoney(l.line_total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end mt-3 font-semibold text-[#017e84]">
            Total: {formatMoney(detail.total_amount)}
          </div>
        </div>

        {(detail.notes || detail.reason) && (
          <div className="px-4 pb-4 text-sm">
            {detail.reason ? (
              <p>
                <span className="text-secondary-muted">Reason: </span>
                {detail.reason}
              </p>
            ) : null}
            {detail.notes ? (
              <p className="mt-1 whitespace-pre-wrap">{detail.notes}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
