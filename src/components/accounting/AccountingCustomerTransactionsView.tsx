"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  getCustomerTransactionHistory,
  type CustomerTimelineEvent,
} from "@/app/actions/accounting/customer-accounting";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

type Props = { contactId: string };

export function AccountingCustomerTransactionsView({ contactId }: Props) {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const [rows, setRows] = useState<CustomerTimelineEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const pageSize = 20;

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getCustomerTransactionHistory(contactId, {
        page,
        pageSize,
        search: search.trim() || undefined,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setRows([]);
        setTotal(0);
      } else {
        setRows(res.transactions ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [contactId, page, search]);

  useEffect(() => {
    setPage(1);
  }, [search, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
            Transaction History
          </h2>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions…"
          className="h-8 w-56 rounded-sm"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        {loading || isPending ? (
          <div className="p-4 text-sm text-secondary-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-secondary-muted">No transactions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Organization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => {
                  const d = e.at ? new Date(e.at) : null;
                  const valid = d && !Number.isNaN(d.getTime());
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        {valid ? d!.toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        {valid ? d!.toLocaleTimeString() : "—"}
                      </TableCell>
                      <TableCell>{e.label}</TableCell>
                      <TableCell>{e.user || "—"}</TableCell>
                      <TableCell>{e.organization || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {total > pageSize ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
