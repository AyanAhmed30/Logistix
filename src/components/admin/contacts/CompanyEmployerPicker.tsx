"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, X } from "lucide-react";
import {
  getCompanyContactOptions,
  type CompanyContactOption,
} from "@/app/actions/contacts";

type Props = {
  parentId: string | null;
  companyName: string;
  onParentIdChange: (companyId: string | null) => void;
  onCompanyNameChange: (name: string) => void;
  excludeContactId?: string | null;
  disabled?: boolean;
};

export function CompanyEmployerPicker({
  parentId,
  companyName,
  onParentIdChange,
  onCompanyNameChange,
  excludeContactId,
  disabled = false,
}: Props) {
  const [companies, setCompanies] = useState<CompanyContactOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(companyName);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getCompanyContactOptions({
      excludeContactId: excludeContactId || undefined,
      includeContactId: parentId,
    }).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        setCompanies([]);
      } else if ("companies" in res) {
        setCompanies(res.companies);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [excludeContactId, parentId]);

  const selected = useMemo(
    () => companies.find((company) => company.id === parentId) ?? null,
    [companies, parentId]
  );

  useEffect(() => {
    if (selected) {
      setInputValue(selected.name);
      return;
    }
    setInputValue(companyName);
  }, [selected, companyName, parentId]);

  const selectCompany = useCallback(
    (company: CompanyContactOption | null) => {
      if (!company) {
        onParentIdChange(null);
        onCompanyNameChange("");
        setInputValue("");
      } else {
        onParentIdChange(company.id);
        onCompanyNameChange(company.name);
        setInputValue(company.name);
      }
      setOpen(false);
    },
    [onParentIdChange, onCompanyNameChange]
  );

  const commitInput = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        selectCompany(null);
        return;
      }

      const exact = companies.find(
        (company) => company.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (exact) {
        selectCompany(exact);
        return;
      }

      onParentIdChange(null);
      onCompanyNameChange(trimmed);
      setInputValue(trimmed);
    },
    [companies, selectCompany, onParentIdChange, onCompanyNameChange]
  );

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        commitInput(inputValue);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, inputValue, commitInput]);

  const filtered = useMemo(() => {
    const needle = inputValue.trim().toLowerCase();
    if (!needle) return companies;
    return companies.filter((company) =>
      company.name.toLowerCase().includes(needle)
    );
  }, [companies, inputValue]);

  function handleInputChange(next: string) {
    setInputValue(next);
    onCompanyNameChange(next);
    if (parentId) {
      const linked = selected?.name ?? "";
      if (next.trim().toLowerCase() !== linked.trim().toLowerCase()) {
        onParentIdChange(null);
      }
    }
    if (!open) setOpen(true);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      if (selected) setInputValue(selected.name);
      else setInputValue(companyName);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (filtered.length === 1) {
        selectCompany(filtered[0]);
      } else {
        commitInput(inputValue);
        setOpen(false);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 border-b border-slate-200 focus-within:border-violet-500 transition-colors">
        <span className="text-secondary-muted shrink-0">
          <Building2 className="h-3.5 w-3.5" />
        </span>
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => !disabled && setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              if (!containerRef.current?.contains(document.activeElement)) {
                commitInput(inputValue);
                setOpen(false);
              }
            }, 120);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Company (Employer)"
          className="flex-1 min-w-0 bg-transparent py-1 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          autoComplete="off"
        />
        <span className="flex items-center gap-1 shrink-0">
          {inputValue && !disabled ? (
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              onClick={() => selectCompany(null)}
              aria-label="Clear company"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              setOpen((prev) => !prev);
              inputRef.current?.focus();
            }}
            className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-60"
            aria-label="Toggle company list"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </span>
      </div>

      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-slate-200 bg-white shadow-lg">
          <ul className="max-h-52 overflow-y-auto py-1">
            {loading ? (
              <li className="px-3 py-2 text-xs text-secondary-muted">
                Loading companies…
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-secondary-muted">
                {companies.length === 0
                  ? "No company contacts yet. Type a name or create a Company contact first."
                  : "No matching companies. You can keep the typed name."}
              </li>
            ) : (
              filtered.map((company) => (
                <li key={company.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectCompany(company)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-violet-50 ${
                      parentId === company.id
                        ? "bg-violet-50 font-medium text-violet-800"
                        : "text-primary-dark"
                    }`}
                  >
                    {company.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
