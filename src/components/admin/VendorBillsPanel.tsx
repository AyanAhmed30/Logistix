"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createVendorBill,
  getVendorBills,
  postVendorBill,
  type VendorBill,
  type VendorBillStatus,
} from "@/app/actions/vendor_bills";
import { getPartners, type Partner } from "@/app/actions/partners";

type BillForm = {
  vendor_partner_id: string;
  bill_date: string;
  due_date: string;
  total_amount: string;
};

const EMPTY_FORM: BillForm = {
  vendor_partner_id: "",
  bill_date: "",
  due_date: "",
  total_amount: "",
};

export function VendorBillsPanel() {
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<VendorBillStatus | "all">("all");
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [form, setForm] = useState<BillForm>(EMPTY_FORM);

  const vendorOptions = useMemo(
    () =>
      partners.filter(
        (item) => item.status === "active" && (item.partner_type === "vendor" || item.partner_type === "both")
      ),
    [partners]
  );

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function loadData() {
    setIsLoading(true);
    const [billRes, partnerRes] = await Promise.all([getVendorBills(status), getPartners("all", "active")]);
    if ("error" in billRes) {
      toast.error(billRes.error || "Failed to load vendor bills.");
      setBills([]);
    } else {
      setBills(billRes.bills || []);
    }
    if ("error" in partnerRes) {
      toast.error(partnerRes.error || "Failed to load partners.");
      setPartners([]);
    } else {
      setPartners(partnerRes.partners || []);
    }
    setIsLoading(false);
  }

  function updateForm<K extends keyof BillForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createVendorBill({
        vendor_partner_id: form.vendor_partner_id,
        bill_date: form.bill_date,
        due_date: form.due_date,
        total_amount: Number(form.total_amount || 0),
      });
      if ("error" in result) {
        toast.error(result.error || "Failed to create vendor bill.");
        return;
      }
      toast.success("Vendor bill created.");
      setForm(EMPTY_FORM);
      await loadData();
    });
  }

  function handlePost(billId: string) {
    startTransition(async () => {
      const result = await postVendorBill(billId);
      if ("error" in result) {
        toast.error(result.error || "Failed to post vendor bill.");
        return;
      }
      toast.success("Vendor bill posted with journal entry.");
      await loadData();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Vendor Bills</h2>
        <p className="text-sm text-secondary-muted">
          Draft and post vendor bills. Posting auto-creates purchase journal entries.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <Label>Vendor</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm bg-background"
                value={form.vendor_partner_id}
                onChange={(e) => updateForm("vendor_partner_id", e.target.value)}
                required
              >
                <option value="">Select vendor</option>
                {vendorOptions.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Bill Date</Label>
              <Input
                type="date"
                value={form.bill_date}
                onChange={(e) => updateForm("bill_date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => updateForm("due_date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Total Amount</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.total_amount}
                onChange={(e) => updateForm("total_amount", e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Bill"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b overflow-x-auto">
        {(["all", "draft", "posted", "paid"] as const).map((tab) => (
          <Button
            key={tab}
            variant={status === tab ? "default" : "ghost"}
            onClick={() => setStatus(tab)}
            className="rounded-b-none shrink-0"
          >
            {tab === "all" ? "All" : tab[0].toUpperCase() + tab.slice(1)}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">Loading vendor bills...</div>
          ) : bills.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">No vendor bills found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Bill Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-semibold">{bill.bill_number}</TableCell>
                      <TableCell>{new Date(bill.bill_date).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(bill.due_date).toLocaleDateString()}</TableCell>
                      <TableCell>{bill.total_amount.toFixed(2)}</TableCell>
                      <TableCell>{bill.paid_amount.toFixed(2)}</TableCell>
                      <TableCell>{bill.outstanding_amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={bill.status === "paid" ? "default" : bill.status === "posted" ? "secondary" : "outline"}>
                          {bill.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {bill.status === "draft" ? (
                          <Button size="sm" onClick={() => handlePost(bill.id)} disabled={isPending}>
                            Post Bill
                          </Button>
                        ) : (
                          <span className="text-xs text-secondary-muted">No actions</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
