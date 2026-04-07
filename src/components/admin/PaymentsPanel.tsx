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
import { getPartners, type Partner } from "@/app/actions/partners";
import { getJournals, type Journal } from "@/app/actions/journals";
import { getChartOfAccounts, type ChartOfAccount } from "@/app/actions/chart_of_accounts";
import {
  createPayment,
  getPayments,
  postPayment,
  type Payment,
  type PaymentStatus,
  type PaymentType,
} from "@/app/actions/payments";

type FormState = {
  partner_id: string;
  payment_type: PaymentType;
  amount: string;
  payment_date: string;
  journal_id: string;
  liquidity_account_id: string;
};

const EMPTY_FORM: FormState = {
  partner_id: "",
  payment_type: "inbound",
  amount: "",
  payment_date: "",
  journal_id: "",
  liquidity_account_id: "",
};

export function PaymentsPanel() {
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [type, setType] = useState<PaymentType | "all">("all");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const partnerOptions = useMemo(() => {
    return partners.filter((partner) => {
      if (partner.status !== "active") return false;
      if (form.payment_type === "inbound") return partner.partner_type === "customer" || partner.partner_type === "both";
      return partner.partner_type === "vendor" || partner.partner_type === "both";
    });
  }, [partners, form.payment_type]);

  const journalOptions = useMemo(
    () => journals.filter((journal) => journal.is_active && (journal.type === "bank" || journal.type === "cash")),
    [journals]
  );

  const liquidityOptions = useMemo(
    () => accounts.filter((account) => account.is_active && account.type === "asset" && account.can_post),
    [accounts]
  );

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type]);

  async function loadData() {
    setIsLoading(true);
    const [paymentRes, partnerRes, journalRes, accountRes] = await Promise.all([
      getPayments(status, type),
      getPartners("all", "active"),
      getJournals("all"),
      getChartOfAccounts(),
    ]);

    if ("error" in paymentRes) {
      toast.error(paymentRes.error || "Failed to load payments.");
      setPayments([]);
    } else {
      setPayments(paymentRes.payments || []);
    }

    if ("error" in partnerRes) {
      toast.error(partnerRes.error || "Failed to load partners.");
      setPartners([]);
    } else {
      setPartners(partnerRes.partners || []);
    }

    if ("error" in journalRes) {
      toast.error(journalRes.error || "Failed to load journals.");
      setJournals([]);
    } else {
      setJournals(journalRes.journals || []);
    }

    if ("error" in accountRes) {
      toast.error(accountRes.error || "Failed to load accounts.");
      setAccounts([]);
    } else {
      setAccounts(accountRes.accounts || []);
    }
    setIsLoading(false);
  }

  function updateForm<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "payment_type" ? { partner_id: "" } : {}),
    }));
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createPayment({
        partner_id: form.partner_id,
        payment_type: form.payment_type,
        amount: Number(form.amount || 0),
        payment_date: form.payment_date,
        journal_id: form.journal_id,
        liquidity_account_id: form.liquidity_account_id,
      });
      if ("error" in result) {
        toast.error(result.error || "Failed to create payment.");
        return;
      }
      toast.success("Payment draft created.");
      setForm(EMPTY_FORM);
      await loadData();
    });
  }

  function handlePost(paymentId: string) {
    startTransition(async () => {
      const result = await postPayment(paymentId);
      if ("error" in result) {
        toast.error(result.error || "Failed to post payment.");
        return;
      }
      toast.success("Payment posted with journal entry.");
      await loadData();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Payments</h2>
        <p className="text-sm text-secondary-muted">
          Manage inbound/outbound payments. Posting creates bank/cash journal entries.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="space-y-2">
              <Label>Payment Type</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm bg-background"
                value={form.payment_type}
                onChange={(e) => updateForm("payment_type", e.target.value as PaymentType)}
                required
              >
                <option value="inbound">Inbound (Customer)</option>
                <option value="outbound">Outbound (Vendor)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Partner</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm bg-background"
                value={form.partner_id}
                onChange={(e) => updateForm("partner_id", e.target.value)}
                required
              >
                <option value="">Select partner</option>
                {partnerOptions.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => updateForm("amount", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.payment_date}
                onChange={(e) => updateForm("payment_date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Journal (Bank/Cash)</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm bg-background"
                value={form.journal_id}
                onChange={(e) => updateForm("journal_id", e.target.value)}
                required
              >
                <option value="">Select journal</option>
                {journalOptions.map((journal) => (
                  <option key={journal.id} value={journal.id}>
                    {journal.code} - {journal.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Liquidity Account</Label>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm bg-background"
                value={form.liquidity_account_id}
                onChange={(e) => updateForm("liquidity_account_id", e.target.value)}
                required
              >
                <option value="">Select account</option>
                {liquidityOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-6">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating..." : "Create Payment"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {(["all", "draft", "posted"] as const).map((tab) => (
          <Button key={tab} variant={status === tab ? "default" : "ghost"} onClick={() => setStatus(tab)}>
            {tab === "all" ? "All Statuses" : tab}
          </Button>
        ))}
        {(["all", "inbound", "outbound"] as const).map((tab) => (
          <Button key={tab} variant={type === tab ? "default" : "ghost"} onClick={() => setType(tab)}>
            {tab === "all" ? "All Types" : tab}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">Loading payments...</div>
          ) : payments.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">No payments found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Allocated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-semibold">{payment.payment_number}</TableCell>
                      <TableCell>{payment.payment_type}</TableCell>
                      <TableCell>{payment.amount.toFixed(2)}</TableCell>
                      <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
                      <TableCell>{payment.allocated_amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={payment.status === "posted" ? "default" : "outline"}>{payment.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {payment.status === "draft" ? (
                          <Button size="sm" disabled={isPending} onClick={() => handlePost(payment.id)}>
                            Post Payment
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
