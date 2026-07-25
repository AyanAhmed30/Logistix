"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  User,
  Briefcase,
  Mail,
  Phone,
  Banknote,
  Star,
  Trash2,
  ChevronDown,
  Loader2,
  Building2,
} from "lucide-react";
import { createCrmOpportunity } from "@/app/actions/crm/opportunities";
import type {
  CrmOpportunityCard,
  CrmOpportunityPriority,
  CrmPipelineStage,
} from "@/app/actions/crm/types";
import {
  getContactById,
  searchCustomerContacts,
  type CustomerSearchResult,
  type SalespersonOption,
} from "@/app/actions/contacts";

type Props = {
  stage: CrmPipelineStage;
  salespersons: SalespersonOption[];
  defaultSalespersonId?: string;
  onCreated: (opportunity: CrmOpportunityCard) => void;
  onCancel: () => void;
};

export function CrmPipelineQuickCreate({
  stage,
  salespersons,
  defaultSalespersonId,
  onCreated,
  onCancel,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [contactResults, setContactResults] = useState<CustomerSearchResult[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [expectedRevenue, setExpectedRevenue] = useState("0.00");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [priority, setPriority] = useState<CrmOpportunityPriority>(0);
  const [salespersonId, setSalespersonId] = useState(defaultSalespersonId || "");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);
  const contactWrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!salespersonId && salespersons.length > 0) {
      setSalespersonId(salespersons[0].id);
    }
  }, [salespersons, salespersonId]);

  // Close form when clicking anywhere outside it
  useEffect(() => {
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (formRef.current && !formRef.current.contains(target)) {
        onCancelRef.current();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelRef.current();
    }
    // Delay so the same click that opened "+" doesn't immediately close
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("touchstart", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!contactWrapRef.current?.contains(e.target as Node)) {
        setContactOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const runContactSearch = useCallback(async (q: string) => {
    setContactLoading(true);
    try {
      const res = await searchCustomerContacts(q);
      if ("contacts" in res && res.contacts) {
        setContactResults(res.contacts);
      } else {
        setContactResults([]);
      }
    } finally {
      setContactLoading(false);
    }
  }, []);

  function onContactQueryChange(value: string) {
    setContactQuery(value);
    setContactId(null);
    setContactOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runContactSearch(value);
    }, 200);
  }

  async function handleContactSelect(contact: CustomerSearchResult) {
    setContactId(contact.id);
    setContactQuery(contact.name);
    setContactOpen(false);
    if (!name.trim()) setName(contact.name);

    const res = await getContactById(contact.id);
    if ("contact" in res && res.contact) {
      setEmail(res.contact.email || "");
      setPhone(res.contact.phone || res.contact.mobile || "");
    }
  }

  function buildPayload() {
    if (!name.trim()) {
      toast.error("Opportunity name is required.");
      return null;
    }
    if (!contactId) {
      toast.error("Contact is required.");
      return null;
    }
    const revenue = Number(expectedRevenue) || 0;
    if (!Number.isFinite(revenue) || revenue < 0) {
      toast.error("Expected revenue cannot be negative.");
      return null;
    }
    return {
      name: name.trim(),
      contact_id: contactId,
      stage_id: stage.id,
      expected_revenue: revenue,
      email: email.trim() || null,
      phone: phone.trim() || null,
      salesperson_id: salespersonId || null,
      probability: stage.default_probability ?? 10,
      priority,
    };
  }

  function handleAdd(e?: React.FormEvent) {
    e?.preventDefault();
    const payload = buildPayload();
    if (!payload) return;

    startTransition(async () => {
      const result = await createCrmOpportunity(payload);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("opportunity" in result && result.opportunity) {
        toast.success("Opportunity created");
        onCreated(result.opportunity);
      }
    });
  }

  function handleEdit() {
    const payload = buildPayload();
    if (!payload) return;

    startTransition(async () => {
      const result = await createCrmOpportunity(payload);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("opportunity" in result && result.opportunity) {
        toast.success("Opportunity created");
        onCreated(result.opportunity);
        router.push(`/crm/opportunities/${result.opportunity.id}`);
      }
    });
  }

  const fieldInput =
    "w-full bg-transparent border-0 border-b border-slate-200 rounded-none px-0 py-1.5 text-sm text-primary-dark placeholder:text-slate-400 focus:outline-none focus:border-[#017e84] focus:ring-0";

  return (
    <form
      ref={formRef}
      onSubmit={handleAdd}
      className="rounded-lg border border-slate-200 bg-white shadow-sm p-3 space-y-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Contact */}
      <div className="relative" ref={contactWrapRef}>
        <div className="flex items-center gap-2 border-b border-[#017e84]">
          <User className="h-4 w-4 text-secondary-muted shrink-0" />
          <input
            value={contactQuery}
            onChange={(e) => onContactQueryChange(e.target.value)}
            onFocus={() => {
              setContactOpen(true);
              if (contactResults.length === 0) void runContactSearch(contactQuery);
            }}
            placeholder="Contact"
            className="w-full bg-transparent border-0 rounded-none px-0 py-1.5 text-sm text-primary-dark placeholder:text-slate-400 focus:outline-none focus:ring-0"
            disabled={isPending}
            autoComplete="off"
          />
          <ChevronDown className="h-3.5 w-3.5 text-[#017e84] shrink-0" />
        </div>
        {contactOpen ? (
          <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {contactLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-secondary-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            ) : contactResults.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-secondary-muted">
                No matching contact
              </div>
            ) : (
              contactResults.map((c) => {
                const Icon = c.company_type === "company" ? Building2 : User;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void handleContactSelect(c)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-primary-dark hover:bg-[#017e84]/10"
                  >
                    <Icon className="h-3.5 w-3.5 text-secondary-muted shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {/* Opportunity's Name */}
      <div className="flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-secondary-muted shrink-0" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Opportunity's Name"
          className={fieldInput}
          autoFocus
          disabled={isPending}
        />
      </div>

      {/* Contact Email */}
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-secondary-muted shrink-0" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Contact Email"
          className={fieldInput}
          disabled={isPending}
        />
      </div>

      {/* Contact Phone */}
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 text-secondary-muted shrink-0" />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Contact Phone"
          className={fieldInput}
          disabled={isPending}
        />
      </div>

      {/* Value + Priority */}
      <div className="flex items-center justify-between gap-3 pt-2 pb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Banknote className="h-4 w-4 text-secondary-muted shrink-0" />
          <span className="text-sm text-secondary-muted shrink-0">Rs.</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={expectedRevenue}
            onChange={(e) => setExpectedRevenue(e.target.value)}
            className="w-24 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-[#017e84] rounded-none px-0 py-0.5 text-sm text-primary-dark focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            disabled={isPending}
          />
        </div>
        <div className="flex items-center gap-0.5 shrink-0" title="Priority">
          {[1, 2, 3].map((star) => (
            <button
              key={star}
              type="button"
              disabled={isPending}
              onClick={() =>
                setPriority((prev) =>
                  prev === star ? 0 : (star as CrmOpportunityPriority)
                )
              }
              className="p-0.5 text-slate-300 hover:text-amber-400 transition-colors"
              aria-label={`Priority ${star}`}
            >
              <Star
                className={`h-4 w-4 ${
                  priority >= star ? "fill-amber-400 text-amber-400" : ""
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Actions: Add | Edit | Trash */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-8 px-4 rounded text-sm font-medium text-white bg-[#017e84] hover:bg-[#016970] disabled:opacity-60"
        >
          {isPending ? "…" : "Add"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleEdit}
          className="h-8 px-4 rounded text-sm font-medium text-primary-dark bg-slate-100 hover:bg-slate-200 border border-slate-200 disabled:opacity-60"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onCancel}
          className="h-8 w-8 inline-flex items-center justify-center rounded text-secondary-muted bg-slate-100 hover:bg-slate-200 border border-slate-200 disabled:opacity-60 ml-auto"
          aria-label="Discard"
          title="Discard"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
