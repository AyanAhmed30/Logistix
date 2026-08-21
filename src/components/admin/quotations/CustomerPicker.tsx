"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Building2,
  Check,
  Loader2,
  Plus,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  createQuickContact,
  searchCustomerContacts,
  type CustomerSearchResult,
} from "@/app/actions/contacts";
import { getCachedContactPickerResults, peekContactPickerCache } from "@/lib/contact-picker-cache";

export type PickedCustomer = {
  contact_id: string;
  name: string;
  vendor_only: boolean;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  lead_id_formatted?: string | null;
  salesperson_id?: string | null;
};

type Props = {
  /** Currently linked contact id (persisted on the quotation). */
  contactId: string | null;
  /** Currently displayed customer name (free text, possibly legacy). */
  customerName: string;
  /** Fired when the user selects a contact or creates a new one. */
  onSelect: (picked: PickedCustomer) => void;
  /**
   * Allow the user to clear the selection / revert to free-text.
   * Defaults to false — quotations must have a customer.
   */
  allowClear?: boolean;
  /**
   * `customer` — quotation-style (excludes vendor-only contacts).
   * `vendor` — vendor bills (vendor_rank > 0).
   * `all` — every org contact (CRM opportunities).
   */
  contactScope?: 'customer' | 'vendor' | 'all';
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

function contactPickerSubtitle(contact: CustomerSearchResult): string {
  const parts = [
    contact.lead_id_formatted ? `#${contact.lead_id_formatted}` : null,
    contact.company_name,
    contact.phone,
    contact.email,
    contact.city,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return parts.join(' • ') || 'No contact info';
}

export function CustomerPicker({
  contactId,
  customerName,
  onSelect,
  disabled = false,
  contactScope = 'customer',
  placeholder = "Type to find a customer…",
  className,
  inputClassName,
}: Props) {
  const scopeKey =
    contactScope === "all"
      ? "all"
      : contactScope === "vendor"
        ? "vendor"
        : "customer";
  const cachedInitial = peekContactPickerCache(scopeKey, "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>(cachedInitial || []);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the displayed name in sync with the parent.
  useEffect(() => {
    if (!open) setQuery(customerName || "");
  }, [customerName, open]);

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const runSearch = useCallback(async (needle: string) => {
    const key =
      contactScope === "all"
        ? "all"
        : contactScope === "vendor"
          ? "vendor"
          : "customer";
    const cached = peekContactPickerCache(key, needle);
    if (cached) {
      setResults(cached);
      setActiveIndex(cached.length > 0 ? 0 : -1);
      return;
    }

    setLoading(true);
    try {
      const contacts = await getCachedContactPickerResults(key, needle, async () => {
        const res = await searchCustomerContacts(needle, {
          scope: contactScope,
        });
        if ("error" in res && res.error) {
          toast.error(res.error);
          return [];
        }
        return "contacts" in res ? res.contacts : [];
      });
      setResults(contacts);
      setActiveIndex(contacts.length > 0 ? 0 : -1);
    } finally {
      setLoading(false);
    }
  }, [contactScope]);

  // Preload recent contacts for instant dropdown open
  useEffect(() => {
    void runSearch("");
  }, [runSearch]);

  // Debounced query while typing — faster for Customer ID lookups
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const digits = query.replace(/\D/g, "");
    const idLike =
      /^#?\d{4,8}$/.test(query.trim()) ||
      /^#?[Cc]\d{3,8}$/.test(query.trim()) ||
      (digits.length >= 4 && digits.length / Math.max(query.trim().length, 1) >= 0.7);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, idLike ? 80 : 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, runSearch]);

  const typedName = query.trim();
  const exactMatch = useMemo(
    () =>
      results.find(
        (r) => r.name.trim().toLowerCase() === typedName.toLowerCase()
      ),
    [results, typedName]
  );
  const canCreateNew = typedName.length > 0 && !exactMatch;

  function handleSelect(contact: CustomerSearchResult) {
    const vendor_only =
      Number(contact.vendor_rank) > 0 && Number(contact.customer_rank) === 0;
    onSelect({
      contact_id: contact.id,
      name: contact.name,
      vendor_only,
      email: contact.email,
      phone: contact.phone,
      company_name: contact.company_name,
      lead_id_formatted: contact.lead_id_formatted ?? null,
      salesperson_id: contact.salesperson_id ?? null,
    });
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (results.length === 0) void runSearch(query);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev < results.length - 1 ? prev + 1 : prev;
        return next < 0 && results.length > 0 ? 0 : next;
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }
    if (e.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-picker-index="${activeIndex}"]`
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, results.length]);

  return (
    <div className={className ? `relative ${className}` : "relative"} ref={wrapperRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          ref={inputRef}
          value={query}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              if (results.length === 0) void runSearch(query);
            }
          }}
          onKeyDown={handleInputKeyDown}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={
            inputClassName
              ? `${inputClassName} !pl-9`
              : "pl-9"
          }
        />
        {contactId && !open && (
          <span
            className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium"
            title="Linked to a contact"
          >
            <Check className="h-3 w-3" /> Linked
          </span>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-40 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div ref={listRef} className="max-h-72 overflow-y-auto">
            {loading && results.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                No matching contact.
              </div>
            )}

            {results.length > 0 &&
              results.map((c, index) => {
                const isVendor =
                  Number(c.vendor_rank) > 0 && Number(c.customer_rank) === 0;
                const Icon = c.company_type === "company" ? Building2 : User;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-picker-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSelect(c)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2 text-left ${
                      isActive ? 'bg-violet-50' : 'hover:bg-violet-50'
                    }`}
                  >
                    <div className="h-7 w-7 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-800 truncate">
                          {c.name}
                        </span>
                        {isVendor && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 text-[10px] font-medium">
                            <AlertTriangle className="h-3 w-3" /> Vendor
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {contactPickerSubtitle(c)}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          {canCreateNew && (
            <button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="w-full flex items-center gap-2 border-t px-3 py-2.5 text-sm text-violet-700 hover:bg-violet-50"
            >
              <Plus className="h-4 w-4" /> Create new contact{" "}
              <span className="font-medium truncate">&quot;{typedName}&quot;</span>
            </button>
          )}
        </div>
      )}

      <CreateContactDialog
        open={createDialogOpen}
        initialName={typedName}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={(picked) => {
          onSelect(picked);
          setCreateDialogOpen(false);
          setOpen(false);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inline "Create new contact" dialog
// ─────────────────────────────────────────────────────────────

function CreateContactDialog({
  open,
  initialName,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onCreated: (picked: PickedCustomer) => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      Promise.resolve().then(() => {
        setName(initialName);
        setEmail("");
        setPhone("");
        setCompanyName("");
      });
    }
  }, [open, initialName]);

  function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      const res = await createQuickContact({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        company_name: companyName.trim() || null,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("contact" in res && res.contact) {
        toast.success("Contact created");
        onCreated({
          contact_id: res.contact.id,
          name: res.contact.name,
          vendor_only: false,
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs">Company</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Optional"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 300…"
                className="mt-1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Creating…" : "Create & Use"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
