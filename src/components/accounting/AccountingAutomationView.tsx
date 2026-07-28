"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
  getAccountingAuditLogs,
  getAccountingEmailTemplates,
  type AccountingEmailTemplate,
} from "@/app/actions/accounting/automation";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

export function AccountingAutomationView() {
  const { switchVersion } = useAdminOrganization();
  const [templates, setTemplates] = useState<AccountingEmailTemplate[]>([]);
  const [logs, setLogs] = useState<
    {
      id: string;
      action: string;
      performed_by: string | null;
      entity_type: string;
      performed_at: string;
      details: unknown;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const [tRes, aRes] = await Promise.all([
        getAccountingEmailTemplates(),
        getAccountingAuditLogs({ search: search.trim() || undefined, pageSize: 40 }),
      ]);
      if ("error" in tRes && tRes.error) toast.error(tRes.error);
      else setTemplates(tRes.templates ?? []);
      if ("error" in aRes && aRes.error) {
        // Soft — billing users may not see audit
        setLogs([]);
      } else {
        setLogs(aRes.logs ?? []);
      }
      setLoading(false);
    });
  }, [search]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-primary-dark">Automation & Security</h2>
        <p className="text-sm text-secondary-muted">
          Email templates, invoice numbering (org sequences), reminders, and audit trail
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-3 space-y-2">
        <h3 className="text-sm font-semibold">Invoice Automation</h3>
        <ul className="text-sm text-secondary-muted list-disc pl-5 space-y-1">
          <li>Invoice numbers are allocated sequentially per organization (INV#####).</li>
          <li>Due dates are calculated from payment terms (Immediate, Net 30, 15 Days, etc.).</li>
          <li>Payment state updates automatically when payments are registered.</li>
          <li>Reminders can be sent or scheduled from the invoice form.</li>
        </ul>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200">
          <h3 className="text-sm font-semibold">Email Templates</h3>
        </div>
        {loading || isPending ? (
          <div className="p-4 text-sm text-secondary-muted">Loading…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Key</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.template_key}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell className="text-sm text-secondary-muted truncate max-w-md">
                    {t.subject}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Accounting Audit Log</h3>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit…"
            className="h-8 w-48 rounded-sm"
          />
        </div>
        {logs.length === 0 ? (
          <div className="p-4 text-sm text-secondary-muted">
            No audit entries yet (requires migration). Logs are never deleted.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Date / Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => {
                const d = l.performed_at ? new Date(l.performed_at) : null;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">
                      {d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>{l.performed_by || "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{l.entity_type}</TableCell>
                    <TableCell className="text-xs">{l.action}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <div className="px-3 py-2 border-t">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            onClick={() => load()}
          >
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}
