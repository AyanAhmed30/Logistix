"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getCustomerAccountingInvoices,
} from "@/app/actions/accounting/customer-accounting";
import { paymentStateLabel } from "@/lib/accounting-payments";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

type Filter = "outstanding" | "paid" | "overdue" | "all";

type Props = {
  contactId: string;
  initialFilter?: Filter;
};

type Row = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_lead_id: string | null;
  invoice_date: string;
  due_date: string | null;
  status: string;
  payment_state: string;
  outstanding_amount: number;
  total_amount: number;
  amount_paid: number;
  paid_date: string | null;
};

const TITLES: Record<Filter, string> = {
  outstanding: "Outstanding Invoices",
  paid: "Paid Invoices",
  overdue: "Overdue Invoices",
  all: "Customer Invoices",
};

export function AccountingCustomerInvoicesView({
  contactId,
  initialFilter = "outstanding",
}: Props) {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getCustomerAccountingInvoices(contactId, filter);
      if ("error" in res && res.error) {
        toast.error(res.error);
        setRows([]);
      } else {
        let list = (res.invoices ?? []) as Row[];
        const needle = search.trim().toLowerCase();
        if (needle) {
          list = list.filter((r) =>
            [r.invoice_number, r.customer_name, r.customer_lead_id]
              .join(" ")
              .toLowerCase()
              .includes(needle)
          );
        }
        setRows(list);
      }
      setLoading(false);
    });
  }, [contactId, filter, search]);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm mb-2"
            onClick={() => router.push(`/accounting/customers/${contactId}`)}
          >
            Back to Customer
          </Button>
          <h2 className="text-lg font-semibold text-primary-dark">
            {TITLES[filter]}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["outstanding", "paid", "overdue"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className={
                filter === f
                  ? "h-8 rounded-sm bg-[#017e84] hover:bg-[#016a6f]"
                  : "h-8 rounded-sm"
              }
              onClick={() => setFilter(f)}
            >
              {TITLES[f].replace(" Invoices", "")}
            </Button>
          ))}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 w-44 rounded-sm"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        {loading || isPending ? (
          <div className="p-4 text-sm text-secondary-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-secondary-muted">No invoices found.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Invoice Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>
                    {filter === "paid" ? "Paid Date" : "Invoice Date"}
                  </TableHead>
                  {filter !== "paid" ? <TableHead>Due Date</TableHead> : null}
                  <TableHead className="text-right">
                    {filter === "paid" ? "Amount" : "Outstanding"}
                  </TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const overdue = r.payment_state === "overdue";
                  return (
                    <TableRow
                      key={r.id}
                      className={overdue ? "bg-amber-50/70" : undefined}
                    >
                      <TableCell>
                        <Link
                          href={`/accounting/invoices/${r.id}`}
                          className="text-[#017e84] hover:underline font-medium"
                        >
                          {r.invoice_number}
                        </Link>
                      </TableCell>
                      <TableCell>{r.customer_name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.customer_lead_id || "—"}
                      </TableCell>
                      <TableCell>
                        {filter === "paid"
                          ? r.paid_date || r.invoice_date || "—"
                          : r.invoice_date || "—"}
                      </TableCell>
                      {filter !== "paid" ? (
                        <TableCell
                          className={overdue ? "text-amber-800 font-medium" : ""}
                        >
                          {r.due_date || "—"}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(
                          filter === "paid" ? r.amount_paid : r.outstanding_amount
                        )}
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {overdue ? (
                          <span className="text-amber-800 font-semibold">
                            Overdue
                          </span>
                        ) : (
                          paymentStateLabel(r.payment_state as never) || r.status
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
