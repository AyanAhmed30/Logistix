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

export type PickedCustomer = {
  contact_id: string;
  name: string;
  vendor_only: boolean;
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
  disabled?: boolean;
  placeholder?: string;
};

export function CustomerPicker({
  contactId,
  customerName,
  onSelect,
  disabled = false,
  placeholder = "Type to find a customer…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
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
    setLoading(true);
    try {
      const res = await searchCustomerContacts(needle);
      if ("error" in res && res.error) {
        toast.error(res.error);
        setResults([]);
      } else if ("contacts" in res) {
        setResults(res.contacts);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced query
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, 200);
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
    });
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={query}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              if (results.length === 0) runSearch(query);
            }
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-8"
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
          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                No matching customer.
              </div>
            )}

            {!loading &&
              results.map((c) => {
                const isVendor =
                  Number(c.vendor_rank) > 0 && Number(c.customer_rank) === 0;
                const Icon = c.company_type === "company" ? Building2 : User;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-violet-50"
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
                        {[c.email, c.phone, c.city].filter(Boolean).join(" • ") ||
                          "No contact info"}
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
