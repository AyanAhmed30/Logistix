"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPartners, type Partner } from "@/app/actions/partners";
import { getReconciliationData, reconcilePayment } from "@/app/actions/reconciliation";
import type { Payment } from "@/app/actions/payments";
import type { Invoice } from "@/app/actions/invoices";
import type { VendorBill } from "@/app/actions/vendor_bills";

type AllocationRow = {
  targetId: string;
  amount: string;
};

export function ReconciliationPanel() {
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendorBills, setVendorBills] = useState<VendorBill[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [allocations, setAllocations] = useState<AllocationRow[]>([{ targetId: "", amount: "" }]);

  const selectedPayment = useMemo(
    () => payments.find((payment) => payment.id === selectedPaymentId) ?? null,
    [payments, selectedPaymentId]
  );

  const availableTargets = useMemo(() => {
    if (!selectedPayment) return [];
    if (selectedPayment.payment_type === "inbound") {
      return invoices
        .filter((item) => item.partner_id === selectedPayment.partner_id && item.outstanding_amount > 0)
        .map((item) => ({
          id: item.id,
          label: `Invoice ${item.invoice_number} (Outstanding ${item.outstanding_amount.toFixed(2)})`,
          maxAmount: item.outstanding_amount,
        }));
    }
    return vendorBills
      .filter((item) => item.vendor_partner_id === selectedPayment.partner_id && item.outstanding_amount > 0)
      .map((item) => ({
        id: item.id,
        label: `Bill ${item.bill_number} (Outstanding ${item.outstanding_amount.toFixed(2)})`,
        maxAmount: item.outstanding_amount,
      }));
  }, [selectedPayment, invoices, vendorBills]);

  const remainingPaymentAmount = useMemo(() => {
    if (!selectedPayment) return 0;
    return Number(selectedPayment.amount || 0) - Number(selectedPayment.allocated_amount || 0);
  }, [selectedPayment]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  async function loadData() {
    setIsLoading(true);
    const [partnersRes, reconRes] = await Promise.all([
      getPartners("all", "active"),
      getReconciliationData(partnerId || undefined),
    ]);

    if ("error" in partnersRes) {
      toast.error(partnersRes.error || "Failed to load partners.");
      setPartners([]);
    } else {
      setPartners(partnersRes.partners || []);
    }

    if ("error" in reconRes) {
      toast.error(reconRes.error || "Failed to load reconciliation data.");
      setPayments([]);
      setInvoices([]);
      setVendorBills([]);
    } else {
      setPayments((reconRes.payments as Payment[]) || []);
      setInvoices((reconRes.invoices as Invoice[]) || []);
      setVendorBills((reconRes.vendorBills as VendorBill[]) || []);
    }
    setIsLoading(false);
  }

  function updateAllocation(index: number, key: keyof AllocationRow, value: string) {
    setAllocations((prev) => prev.map((row, idx) => (idx === index ? { ...row, [key]: value } : row)));
  }

  function addAllocationRow() {
    setAllocations((prev) => [...prev, { targetId: "", amount: "" }]);
  }

  function removeAllocationRow(index: number) {
    setAllocations((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleReconcile() {
    if (!selectedPayment) {
      toast.error("Select a posted payment first.");
      return;
    }
    const normalized = allocations
      .map((row) => ({
        targetId: row.targetId,
        amount: Number(row.amount || 0),
      }))
      .filter((row) => row.targetId && row.amount > 0);

    if (normalized.length === 0) {
      toast.error("Add at least one valid allocation.");
      return;
    }

    const requested = normalized.reduce((sum, row) => sum + row.amount, 0);
    if (requested > remainingPaymentAmount) {
      toast.error("Allocation exceeds remaining payment amount.");
      return;
    }

    startTransition(async () => {
      const result = await reconcilePayment(
        selectedPayment.id,
        normalized.map((row) =>
          selectedPayment.payment_type === "inbound"
            ? { invoice_id: row.targetId, amount: row.amount }
            : { vendor_bill_id: row.targetId, amount: row.amount }
        )
      );
      if ("error" in result) {
        toast.error(result.error || "Reconciliation failed.");
        return;
      }
      toast.success("Reconciliation completed.");
      setAllocations([{ targetId: "", amount: "" }]);
      setSelectedPaymentId("");
      await loadData();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Reconciliation</h2>
        <p className="text-sm text-secondary-muted">
          Reconcile posted payments with posted invoices/vendor bills. Supports partial and multi-document allocation.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Partner Filter</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm bg-background"
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
              >
                <option value="">All partners</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Posted Payment</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm bg-background"
                value={selectedPaymentId}
                onChange={(e) => setSelectedPaymentId(e.target.value)}
              >
                <option value="">Select payment</option>
                {payments
                  .filter((payment) => payment.status === "posted" && Number(payment.amount) > Number(payment.allocated_amount))
                  .map((payment) => (
                    <option key={payment.id} value={payment.id}>
                      {payment.payment_number} | {payment.payment_type} | Remaining{" "}
                      {(Number(payment.amount) - Number(payment.allocated_amount)).toFixed(2)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {selectedPayment && (
            <div className="rounded-md border p-3 bg-slate-50">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{selectedPayment.payment_type}</Badge>
                <span className="text-sm">
                  Amount: {selectedPayment.amount.toFixed(2)} | Allocated: {selectedPayment.allocated_amount.toFixed(2)} | Remaining:{" "}
                  {remainingPaymentAmount.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {selectedPayment && (
            <div className="space-y-3">
              {allocations.map((row, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Target Document</Label>
                    <select
                      className="h-10 w-full rounded-md border px-3 text-sm bg-background"
                      value={row.targetId}
                      onChange={(e) => updateAllocation(index, "targetId", e.target.value)}
                    >
                      <option value="">Select target</option>
                      {availableTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Allocate Amount</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) => updateAllocation(index, "amount", e.target.value)}
                      />
                      {allocations.length > 1 && (
                        <Button type="button" variant="outline" onClick={() => removeAllocationRow(index)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={addAllocationRow}>
                  Add Allocation
                </Button>
                <Button type="button" disabled={isPending} onClick={handleReconcile}>
                  {isPending ? "Reconciling..." : "Reconcile"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && <div className="text-sm text-secondary-muted">Loading reconciliation data...</div>}
    </div>
  );
}
