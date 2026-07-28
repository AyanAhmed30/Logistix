"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, FileDown, Printer } from "lucide-react";
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
  getCustomerStatement,
  logCustomerStatementGenerated,
} from "@/app/actions/accounting/customer-accounting";
import { generateCustomerStatementPdf } from "@/lib/accounting-customer-statement-pdf";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

type Props = { contactId: string };

type Statement = Awaited<ReturnType<typeof getCustomerStatement>> extends {
  statement?: infer S;
}
  ? NonNullable<S>
  : never;

export function AccountingCustomerStatementView({ contactId }: Props) {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getCustomerStatement(contactId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        setStatement(null);
      } else {
        setStatement(res.statement ?? null);
      }
      setLoading(false);
    });
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  async function runPdf(mode: "preview" | "print" | "download") {
    if (!statement) return;
    setPdfBusy(true);
    try {
      await logCustomerStatementGenerated(contactId);
      await generateCustomerStatementPdf(
        {
          ...statement,
          entries: (statement.entries || []).map((e) => ({
            date: e.date,
            reference: e.reference,
            debit: e.debit,
            credit: e.credit,
            balance: e.balance,
          })),
        },
        {
          openInNewTab: mode === "preview",
          openPrintDialog: mode === "print",
          download: mode === "download",
        }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate statement PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading || isPending) {
    return <div className="p-4 text-sm text-secondary-muted">Loading statement…</div>;
  }

  if (!statement) {
    return (
      <div className="p-4 text-sm text-secondary-muted">
        Statement unavailable.{" "}
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-sm ml-2"
          onClick={() => router.push(`/accounting/customers/${contactId}`)}
        >
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
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
            Customer Statement
          </h2>
          <p className="text-sm text-secondary-muted">
            {statement.customer_name}
            {statement.customer_lead_id ? (
              <span className="ml-2 font-mono">#{statement.customer_lead_id}</span>
            ) : null}
            {statement.organization_name ? (
              <span className="ml-2">· {statement.organization_name}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={pdfBusy}
            onClick={() => void runPdf("preview")}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Preview
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={pdfBusy}
            onClick={() => void runPdf("print")}
          >
            <Printer className="h-3.5 w-3.5 mr-1" />
            Print
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016a6f]"
            disabled={pdfBusy}
            onClick={() => void runPdf("download")}
          >
            <FileDown className="h-3.5 w-3.5 mr-1" />
            PDF Export
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6 bg-white border border-slate-200 rounded-sm p-3">
        <div>
          <p className="text-[11px] uppercase text-secondary-muted">Opening</p>
          <p className="font-semibold">{formatMoney(statement.opening_balance)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-secondary-muted">Invoices</p>
          <p className="font-semibold">{formatMoney(statement.invoice_total)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-secondary-muted">Payments</p>
          <p className="font-semibold">{formatMoney(statement.payment_total)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-secondary-muted">Outstanding</p>
          <p className="font-semibold text-[#017e84]">
            {formatMoney(statement.outstanding_balance)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-secondary-muted">Credit</p>
          <p className="font-semibold">{formatMoney(statement.credit_balance)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-secondary-muted">Closing</p>
          <p className="font-semibold">{formatMoney(statement.closing_balance)}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        {(statement.entries || []).length === 0 ? (
          <div className="p-6 text-sm text-secondary-muted">No transactions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(statement.entries || []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.date || "—"}</TableCell>
                    <TableCell>{e.reference}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.debit ? formatMoney(e.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.credit ? formatMoney(e.credit) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(e.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
