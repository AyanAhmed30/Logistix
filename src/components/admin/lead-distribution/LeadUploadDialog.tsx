"use client";

import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "@/lib/app-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { checkLeadImport, importLeads, type LeadRowCheck } from "@/app/actions/lead-distribution";
import {
  LEAD_IMPORT_ACCEPT,
  LEAD_IMPORT_MAX_ROWS,
  readLeadFile,
  rowsToLeads,
  type LeadImportRow,
} from "@/lib/lead-import";

type Preview = {
  fileName: string;
  leads: LeadImportRow[];
  checks: Map<number, LeadRowCheck["issue"]>;
  missingColumns: string[];
};

type RowFilter = "all" | "ready" | "duplicate" | "invalid";

const STATUS_STYLE = {
  ready: "bg-emerald-50 text-emerald-800 border-emerald-200",
  duplicate: "bg-amber-50 text-amber-800 border-amber-200",
  invalid: "bg-red-50 text-red-700 border-red-200",
} as const;

export function LeadUploadDialog({
  open,
  onOpenChange,
  onImported,
  onSetupRequired,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  onSetupRequired: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [filter, setFilter] = useState<RowFilter>("all");

  function reset() {
    setPreview(null);
    setError(null);
    setFilter("all");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    reset();
    setReading(true);
    try {
      const rows = await readLeadFile(file);
      const { leads, recognized } = rowsToLeads(rows);
      if (leads.length === 0) {
        setError("No leads were found. The first row must hold the column names (for example Contact Name, Phone Number, Email).");
        return;
      }
      if (leads.length > LEAD_IMPORT_MAX_ROWS) {
        setError(`This file has ${leads.length.toLocaleString()} leads. Upload at most ${LEAD_IMPORT_MAX_ROWS.toLocaleString()} at a time.`);
        return;
      }
      const missingColumns = [
        !recognized.includes("name") && !recognized.includes("firstName") ? "a name column" : null,
        !recognized.includes("phone") && !recognized.includes("email") ? "a phone or email column" : null,
      ].filter((v): v is string => Boolean(v));

      const res = await checkLeadImport(leads);
      if ("setupRequired" in res) {
        onSetupRequired();
        onOpenChange(false);
        return;
      }
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setPreview({
        fileName: file.name,
        leads,
        checks: new Map(res.results.map((r) => [r.rowNumber, r.issue])),
        missingColumns,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be read.");
    } finally {
      setReading(false);
    }
  }

  const statusOf = (lead: LeadImportRow): keyof typeof STATUS_STYLE => {
    const issue = preview?.checks.get(lead.rowNumber);
    return issue ? issue.kind : "ready";
  };

  const counts = useMemo(() => {
    const c = { ready: 0, duplicate: 0, invalid: 0 };
    for (const lead of preview?.leads ?? []) c[statusOf(lead)]++;
    return c;
    // statusOf only reads preview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const shown = (preview?.leads ?? []).filter((lead) => filter === "all" || statusOf(lead) === filter);

  async function handleImport() {
    if (!preview) return;
    const ready = preview.leads.filter((lead) => statusOf(lead) === "ready");
    setImporting(true);
    try {
      const res = await importLeads(ready, preview.fileName);
      if ("setupRequired" in res) {
        onSetupRequired();
        onOpenChange(false);
        return;
      }
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${res.imported.toLocaleString()} lead${res.imported === 1 ? "" : "s"} imported` +
          (res.skipped ? `, ${res.skipped} skipped` : "")
      );
      reset();
      onOpenChange(false);
      onImported();
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (importing) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload leads</DialogTitle>
          <DialogDescription>
            Excel (.xlsx) or CSV. The first row must hold the column names: Contact Name, Phone Number, Email, Company
            Name, Country, City. Other columns are kept as notes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label
            htmlFor="lead-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-[#017e84] focus-within:outline-2 focus-within:outline-[#017e84]"
          >
            {reading ? (
              <Loader2 className="h-5 w-5 animate-spin stroke-[#017e84]" aria-hidden />
            ) : (
              <FileSpreadsheet className="h-5 w-5 stroke-[#017e84]" aria-hidden />
            )}
            <span className="text-sm font-medium text-primary-dark">
              {reading ? "Reading the file…" : preview ? `${preview.fileName} — choose another file` : "Choose a file"}
            </span>
            <span className="text-xs text-slate-600">.xlsx or .csv, up to {LEAD_IMPORT_MAX_ROWS.toLocaleString()} leads</span>
            <input
              ref={inputRef}
              id="lead-file"
              type="file"
              accept={LEAD_IMPORT_ACCEPT}
              className="sr-only"
              disabled={reading || importing}
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {preview ? (
            <>
              {preview.missingColumns.length ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No {preview.missingColumns.join(" or ")} was recognised. Check the column names in the first row.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show rows">
                {(
                  [
                    ["all", `All rows (${preview.leads.length})`],
                    ["ready", `Ready to import (${counts.ready})`],
                    ["duplicate", `Duplicates (${counts.duplicate})`],
                    ["invalid", `Invalid (${counts.invalid})`],
                  ] as Array<[RowFilter, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                    className={`rounded-md border px-2.5 py-1 text-sm ${
                      filter === id
                        ? "border-[#017e84]/40 bg-[#e6f4f5] font-medium text-[#016970]"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[45vh] overflow-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      {["Row", "Name", "Phone", "Email", "Company", "City / country", "Status"].map((h) => (
                        <th key={h} className="px-2.5 py-2 text-xs font-semibold text-primary-dark">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((lead) => {
                      const status = statusOf(lead);
                      const issue = preview.checks.get(lead.rowNumber);
                      return (
                        <tr key={lead.rowNumber} className="border-b border-slate-100 last:border-0">
                          <td className="px-2.5 py-1.5 tabular-nums text-slate-600">{lead.rowNumber}</td>
                          <td className="px-2.5 py-1.5 font-medium text-primary-dark">{lead.name || "—"}</td>
                          <td className="px-2.5 py-1.5 whitespace-nowrap">{lead.phone || "—"}</td>
                          <td className="px-2.5 py-1.5">{lead.email || "—"}</td>
                          <td className="px-2.5 py-1.5">{lead.companyName || "—"}</td>
                          <td className="px-2.5 py-1.5">{[lead.city, lead.country].filter(Boolean).join(", ") || "—"}</td>
                          <td className="px-2.5 py-1.5">
                            <span className={`inline-flex whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                              {status === "ready" ? "Ready" : status === "duplicate" ? "Duplicate" : "Invalid"}
                            </span>
                            {issue ? <span className="mt-0.5 block text-xs text-slate-600">{issue.reason}</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-600">
                          No rows in this group.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-600">
                Duplicates and invalid rows are not imported. Leads are not assigned and no inquiries are created.
              </p>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            className="bg-[#017e84] text-white hover:bg-[#016970]"
            disabled={!preview || counts.ready === 0 || importing || reading}
            onClick={() => void handleImport()}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin stroke-white" aria-hidden /> : <Upload className="h-4 w-4 stroke-white" aria-hidden />}
            {importing ? "Importing…" : `Import ${counts.ready.toLocaleString()} lead${counts.ready === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
