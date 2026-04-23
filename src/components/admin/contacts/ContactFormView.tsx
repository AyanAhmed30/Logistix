"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Cloud,
  Trash2,
  Mail,
  Phone,
  Building2,
  UserRound,
  Plus,
  X,
  Briefcase,
  Globe,
  Tag as TagIcon,
  ImageIcon,
  FileText,
  ArrowUpRight,
} from "lucide-react";
import {
  createContact,
  updateContact,
  deleteContact,
  getContactById,
  getContactActivity,
  getContactTags,
  createContactTag,
  getSalespersonOptions,
  deleteChildContact,
  type ContactWithRelations,
  type ContactActivityLog,
  type ContactTag,
  type CompanyType,
  type SalespersonOption,
  type Contact,
} from "@/app/actions/contacts";
import { ContactChatter } from "@/components/admin/contacts/ContactChatter";
import { ChildContactDialog } from "@/components/admin/contacts/ChildContactDialog";
import {
  getQuotationsByContact,
  type Quotation,
  type QuotationStatus,
} from "@/app/actions/quotations";
import {
  getInvoicesByContact,
  type Invoice,
  type InvoiceStatus,
} from "@/app/actions/invoices";

type Props = {
  contactId: string | null;
  onBack: () => void;
  onSaved: (id: string) => void;
};

type FormState = {
  company_type: CompanyType;
  name: string;
  company_name: string;
  email: string;
  phone: string;

  street: string;
  street2: string;
  city: string;
  state: string;
  country: string;
  zip: string;

  job_position: string;
  website: string;
  tax_id: string;

  // Sales & Purchase
  salesperson_id: string | null;
  pricelist: string;
  payment_terms: string;
  sales_payment_method: string;
  incoterm: string;
  incoterm_location: string;
  group_rfq: string;
  buyer: string;
  purchase_payment_terms: string;
  purchase_payment_method: string;
  receipt_reminder: boolean;
  fiscal_position: string;
  company_ref: string;
  industry: string;

  // Accounting
  receivable_account: string;
  payable_account: string;
  tax_settings: string;

  // Notes
  notes: string;
};

const EMPTY_FORM: FormState = {
  company_type: "person",
  name: "",
  company_name: "",
  email: "",
  phone: "",
  street: "",
  street2: "",
  city: "",
  state: "",
  country: "",
  zip: "",
  job_position: "",
  website: "",
  tax_id: "",
  salesperson_id: null,
  pricelist: "",
  payment_terms: "",
  sales_payment_method: "",
  incoterm: "",
  incoterm_location: "",
  group_rfq: "On Order",
  buyer: "",
  purchase_payment_terms: "",
  purchase_payment_method: "",
  receipt_reminder: false,
  fiscal_position: "",
  company_ref: "",
  industry: "",
  receivable_account: "",
  payable_account: "",
  tax_settings: "",
  notes: "",
};

type FormTab = "contacts" | "sales" | "accounting" | "notes";

const PAYMENT_TERM_OPTIONS = [
  "Immediate Payment",
  "15 Days",
  "Net 30",
  "Net 60",
  "End of Next Month",
];

const PAYMENT_METHOD_OPTIONS = [
  "Cash",
  "Bank Transfer",
  "Cheque",
  "Credit Card",
  "Online Payment",
];

const PRICELIST_OPTIONS = ["Default (PKR)", "Default (USD)", "Wholesale", "Retail"];

const INCOTERM_OPTIONS = [
  "EXW — Ex Works",
  "FCA — Free Carrier",
  "FOB — Free On Board",
  "CFR — Cost and Freight",
  "CIF — Cost, Insurance & Freight",
  "DAP — Delivered at Place",
  "DDP — Delivered Duty Paid",
];

const GROUP_RFQ_OPTIONS = ["On Order", "Daily", "Weekly", "Always"];

const FISCAL_POSITION_OPTIONS = [
  "Domestic",
  "Export - Zero Rated",
  "Import - Reverse Charge",
  "Free Zone",
];

export function ContactFormView({ contactId, onBack, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loadedContact, setLoadedContact] = useState<ContactWithRelations | null>(null);
  const [activity, setActivity] = useState<ContactActivityLog[]>([]);
  const [allTags, setAllTags] = useState<ContactTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggest, setShowTagSuggest] = useState(false);
  const [salespersons, setSalespersons] = useState<SalespersonOption[]>([]);
  const [activeTab, setActiveTab] = useState<FormTab>("contacts");
  const [loading, setLoading] = useState(false);
  const [childDialogOpen, setChildDialogOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(contactId);
  const [isPending, startTransition] = useTransition();

  // Load tags + salespersons
  useEffect(() => {
    getContactTags().then((res) => {
      if ("tags" in res && res.tags) setAllTags(res.tags);
    });
    getSalespersonOptions().then((res) => {
      if ("salespersons" in res && res.salespersons) setSalespersons(res.salespersons);
    });
  }, []);

  // Load contact when opening existing
  useEffect(() => {
    let cancelled = false;

    if (!contactId) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setLoadedContact(null);
        setForm(EMPTY_FORM);
        setSelectedTagIds([]);
        setActivity([]);
        setSavedId(null);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
    });
    Promise.all([getContactById(contactId), getContactActivity(contactId)]).then(
      ([cRes, aRes]) => {
        if (cancelled) return;
        if ("error" in cRes && cRes.error) {
          toast.error(cRes.error);
        } else if ("contact" in cRes && cRes.contact) {
          const c = cRes.contact;
          setLoadedContact(c);
          setSavedId(c.id);
          setForm({
            company_type: c.company_type,
            name: c.name,
            company_name: c.company_name || "",
            email: c.email || "",
            phone: c.phone || "",
            street: c.street || "",
            street2: c.street2 || "",
            city: c.city || "",
            state: c.state || "",
            country: c.country || "",
            zip: c.zip || "",
            job_position: c.job_position || "",
            website: c.website || "",
            tax_id: c.tax_id || "",
            salesperson_id: c.salesperson_id,
            pricelist: c.pricelist || "",
            payment_terms: c.payment_terms || "",
            sales_payment_method: c.sales_payment_method || "",
            incoterm: c.incoterm || "",
            incoterm_location: c.incoterm_location || "",
            group_rfq: c.group_rfq || "On Order",
            buyer: c.buyer || "",
            purchase_payment_terms: c.purchase_payment_terms || "",
            purchase_payment_method: c.purchase_payment_method || "",
            receipt_reminder: Boolean(c.receipt_reminder),
            fiscal_position: c.fiscal_position || "",
            company_ref: c.company_ref || "",
            industry: c.industry || "",
            receivable_account: c.receivable_account || "",
            payable_account: c.payable_account || "",
            tax_settings: c.tax_settings || "",
            notes: c.notes || "",
          });
          setSelectedTagIds(c.tags.map((t) => t.id));
        }
        if ("activity" in aRes && aRes.activity) setActivity(aRes.activity);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectedTags(): ContactTag[] {
    const byId = new Map(allTags.map((t) => [t.id, t]));
    return selectedTagIds
      .map((id) => byId.get(id))
      .filter((t): t is ContactTag => Boolean(t));
  }

  const suggestedTags = useMemo(() => {
    const needle = tagInput.trim().toLowerCase();
    if (!needle) return [] as ContactTag[];
    return allTags
      .filter((t) => !selectedTagIds.includes(t.id))
      .filter((t) => t.name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [tagInput, allTags, selectedTagIds]);

  async function addTagByName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = allTags.find(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      if (!selectedTagIds.includes(existing.id)) {
        setSelectedTagIds((prev) => [...prev, existing.id]);
      }
    } else {
      const res = await createContactTag(trimmed);
      if ("tag" in res && res.tag) {
        setAllTags((prev) => [...prev, res.tag as ContactTag]);
        setSelectedTagIds((prev) => [...prev, (res.tag as ContactTag).id]);
      } else if ("error" in res && res.error) {
        toast.error(res.error);
      }
    }
    setTagInput("");
    setShowTagSuggest(false);
  }

  async function saveNow(options?: { silent?: boolean }): Promise<string | null> {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return null;
    }

    const payload = {
      ...form,
      tag_ids: selectedTagIds,
    };
    const res = savedId
      ? await updateContact({ id: savedId, ...payload })
      : await createContact(payload);

    if ("error" in res && res.error) {
      toast.error(res.error);
      return null;
    }
    if ("contact" in res && res.contact) {
      if (!options?.silent) {
        toast.success(savedId ? "Contact updated" : "Contact created");
      }
      setSavedId(res.contact.id);
      const activityRes = await getContactActivity(res.contact.id);
      if ("activity" in activityRes && activityRes.activity) {
        setActivity(activityRes.activity);
      }
      onSaved(res.contact.id);
      return res.contact.id;
    }
    return null;
  }

  function handleSave() {
    startTransition(async () => {
      await saveNow();
    });
  }

  function handleAddRelated() {
    if (savedId) {
      setChildDialogOpen(true);
      return;
    }
    if (!form.name.trim()) {
      toast.error("Enter a name first to add related contacts");
      return;
    }
    // Auto-save the main contact, then open the dialog.
    startTransition(async () => {
      const newId = await saveNow({ silent: true });
      if (newId) setChildDialogOpen(true);
    });
  }

  function handleDiscard() {
    if (savedId && loadedContact) {
      // Reset to loaded contact
      const c = loadedContact;
      setForm({
        company_type: c.company_type,
        name: c.name,
        company_name: c.company_name || "",
        email: c.email || "",
        phone: c.phone || "",
        street: c.street || "",
        street2: c.street2 || "",
        city: c.city || "",
        state: c.state || "",
        country: c.country || "",
        zip: c.zip || "",
        job_position: c.job_position || "",
        website: c.website || "",
        tax_id: c.tax_id || "",
        salesperson_id: c.salesperson_id,
        pricelist: c.pricelist || "",
        payment_terms: c.payment_terms || "",
        sales_payment_method: c.sales_payment_method || "",
        incoterm: c.incoterm || "",
        incoterm_location: c.incoterm_location || "",
        group_rfq: c.group_rfq || "On Order",
        buyer: c.buyer || "",
        purchase_payment_terms: c.purchase_payment_terms || "",
        purchase_payment_method: c.purchase_payment_method || "",
        receipt_reminder: Boolean(c.receipt_reminder),
        fiscal_position: c.fiscal_position || "",
        company_ref: c.company_ref || "",
        industry: c.industry || "",
        receivable_account: c.receivable_account || "",
        payable_account: c.payable_account || "",
        tax_settings: c.tax_settings || "",
        notes: c.notes || "",
      });
      setSelectedTagIds(c.tags.map((t) => t.id));
    } else {
      onBack();
    }
  }

  function handleDelete() {
    if (!savedId) {
      onBack();
      return;
    }
    if (!confirm("Delete this contact? This cannot be undone.")) return;
    startTransition(async () => {
      const res = await deleteContact(savedId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Contact deleted");
      onBack();
    });
  }

  function handleChildCreated(child: Contact) {
    setLoadedContact((prev) =>
      prev ? { ...prev, children: [...prev.children, child] } : prev
    );
  }

  async function handleChildDelete(childId: string) {
    if (!confirm("Remove this related contact?")) return;
    const res = await deleteChildContact(childId);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    setLoadedContact((prev) =>
      prev ? { ...prev, children: prev.children.filter((c) => c.id !== childId) } : prev
    );
    toast.success("Related contact removed");
  }

  return (
    <div className="space-y-4">
      {/* Top breadcrumb / actions bar (Odoo-style) */}
      <div className="flex items-center gap-2 text-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5 h-8 px-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Contacts
        </Button>
        <span className="text-secondary-muted">/</span>
        <span className="font-medium text-violet-700">
          {savedId ? form.name || "Untitled" : "New"}
        </span>
        <div className="flex items-center gap-1 ml-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            title="Save"
            className="h-7 w-7 rounded-md border border-slate-200 flex items-center justify-center text-secondary-muted hover:text-violet-600 hover:bg-slate-50"
          >
            <Cloud className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={isPending}
            title="Discard"
            className="h-7 w-7 rounded-md border border-slate-200 flex items-center justify-center text-secondary-muted hover:text-rose-600 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
          {savedId && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              title="Delete"
              className="h-7 w-7 rounded-md border border-slate-200 flex items-center justify-center text-secondary-muted hover:text-rose-600 hover:bg-slate-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-secondary-muted">Loading contact…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4">
          {/* LEFT: Form */}
          <div className="bg-white border rounded-lg shadow-sm">
            {/* Header section with avatar + name */}
            <div className="p-6 border-b">
              <div className="flex gap-5">
                {/* Avatar placeholder */}
                <div className="h-24 w-24 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 shrink-0">
                  {form.company_type === "company" ? (
                    <Building2 className="h-12 w-12" />
                  ) : (
                    <ImageIcon className="h-12 w-12" />
                  )}
                </div>

                {/* Right content */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Company / Individual toggle */}
                  <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5 w-fit text-xs">
                    <button
                      type="button"
                      onClick={() => update("company_type", "person")}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        form.company_type === "person"
                          ? "bg-white shadow-sm text-primary-dark font-semibold"
                          : "text-secondary-muted"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3 w-3" />
                        Individual
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => update("company_type", "company")}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        form.company_type === "company"
                          ? "bg-white shadow-sm text-primary-dark font-semibold"
                          : "text-secondary-muted"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        Company
                      </span>
                    </button>
                  </div>

                  {/* Name input - large */}
                  <Input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Name (company or person)"
                    className="text-2xl font-semibold h-12 border-0 border-b border-slate-200 rounded-none px-0 shadow-none focus-visible:ring-0 focus-visible:border-violet-500 placeholder:text-slate-300"
                  />

                  {/* Icon rows */}
                  <IconField
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    value={form.company_name}
                    onChange={(v) => update("company_name", v)}
                    placeholder="Company Employer"
                  />
                  <IconField
                    icon={<Mail className="h-3.5 w-3.5" />}
                    value={form.email}
                    onChange={(v) => update("email", v)}
                    placeholder="Email"
                    type="email"
                  />
                  <IconField
                    icon={<Phone className="h-3.5 w-3.5" />}
                    value={form.phone}
                    onChange={(v) => update("phone", v)}
                    placeholder="Phone"
                  />
                </div>
              </div>

              {/* Address + Job / Website / Tags grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Address */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[88px_1fr] items-start gap-x-3 gap-y-1.5">
                    <div className="text-xs text-secondary-muted pt-1.5">Address</div>
                    <div className="space-y-1.5">
                      <UnderlineInput
                        value={form.street}
                        onChange={(v) => update("street", v)}
                        placeholder="Street…"
                      />
                      <UnderlineInput
                        value={form.street2}
                        onChange={(v) => update("street2", v)}
                        placeholder="Street 2…"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <UnderlineInput
                          value={form.city}
                          onChange={(v) => update("city", v)}
                          placeholder="City"
                        />
                        <UnderlineInput
                          value={form.state}
                          onChange={(v) => update("state", v)}
                          placeholder="State"
                        />
                        <UnderlineInput
                          value={form.zip}
                          onChange={(v) => update("zip", v)}
                          placeholder="ZIP"
                        />
                      </div>
                      <UnderlineInput
                        value={form.country}
                        onChange={(v) => update("country", v)}
                        placeholder="Country"
                      />
                    </div>
                    <div className="text-xs text-secondary-muted pt-1.5">NTN</div>
                    <UnderlineInput
                      value={form.tax_id}
                      onChange={(v) => update("tax_id", v)}
                      placeholder="not applicable"
                    />
                  </div>
                </div>

                {/* Job Position / Website / Tags */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[100px_1fr] items-center gap-x-3 gap-y-3">
                    <div className="text-xs text-secondary-muted flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" />
                      Job Position
                    </div>
                    <UnderlineInput
                      value={form.job_position}
                      onChange={(v) => update("job_position", v)}
                      placeholder="e.g. Sales Director"
                    />

                    <div className="text-xs text-secondary-muted flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" />
                      Website
                    </div>
                    <UnderlineInput
                      value={form.website}
                      onChange={(v) => update("website", v)}
                      placeholder="e.g. https://www.logistix.com"
                    />

                    <div className="text-xs text-secondary-muted flex items-center gap-1.5 self-start pt-1">
                      <TagIcon className="h-3.5 w-3.5" />
                      Tags
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-1 focus-within:border-violet-500 transition-colors relative">
                        {selectedTags().map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              backgroundColor: `${tag.color}20`,
                              color: tag.color,
                            }}
                          >
                            {tag.name}
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedTagIds((prev) =>
                                  prev.filter((id) => id !== tag.id)
                                )
                              }
                              className="hover:opacity-70"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                        <input
                          value={tagInput}
                          onChange={(e) => {
                            setTagInput(e.target.value);
                            setShowTagSuggest(true);
                          }}
                          onFocus={() => setShowTagSuggest(true)}
                          onBlur={() => setTimeout(() => setShowTagSuggest(false), 120)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTagByName(tagInput);
                            }
                            if (e.key === "Backspace" && !tagInput && selectedTagIds.length > 0) {
                              setSelectedTagIds((prev) => prev.slice(0, -1));
                            }
                          }}
                          placeholder={
                            selectedTagIds.length === 0
                              ? 'e.g. "B2B", "VIP", "Consulting"…'
                              : ""
                          }
                          className="flex-1 min-w-[120px] bg-transparent outline-none text-xs py-1"
                        />
                        {showTagSuggest && suggestedTags.length > 0 && (
                          <div className="absolute top-full left-0 mt-1 bg-white border rounded-md shadow-lg z-20 py-1 min-w-[200px]">
                            {suggestedTags.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSelectedTagIds((prev) => [...prev, t.id]);
                                  setTagInput("");
                                  setShowTagSuggest(false);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
                              >
                                {t.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0 border-b bg-white sticky top-0 z-10">
              <TabButton
                label="Contacts"
                active={activeTab === "contacts"}
                onClick={() => setActiveTab("contacts")}
              />
              <TabButton
                label="Sales & Purchase"
                active={activeTab === "sales"}
                onClick={() => setActiveTab("sales")}
              />
              <TabButton
                label="Accounting"
                active={activeTab === "accounting"}
                onClick={() => setActiveTab("accounting")}
              />
              <TabButton
                label="Notes"
                active={activeTab === "notes"}
                onClick={() => setActiveTab("notes")}
              />
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === "contacts" && (
                <div className="space-y-8">
                  <ContactsTabContent
                    relatedContacts={loadedContact?.children || []}
                    canAddChild
                    onAddChild={handleAddRelated}
                    onDeleteChild={handleChildDelete}
                  />
                  <LinkedQuotationsSection
                    contactId={savedId}
                    contactName={form.name}
                  />
                  <LinkedInvoicesSection contactId={savedId} />
                </div>
              )}

              {activeTab === "sales" && (
                <SalesPurchaseTab
                  form={form}
                  update={update}
                  salespersons={salespersons}
                />
              )}

              {activeTab === "accounting" && (
                <AccountingTab form={form} update={update} />
              )}

              {activeTab === "notes" && (
                <Textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder='Type "/" for commands'
                  rows={14}
                  className="border-0 shadow-none focus-visible:ring-0 resize-none text-sm"
                />
              )}
            </div>
          </div>

          {/* RIGHT: Chatter */}
          <div className="xl:min-h-[640px]">
            <ContactChatter
              contactId={savedId}
              activity={activity}
              onAppend={(log) => setActivity((prev) => [log, ...prev])}
            />
          </div>
        </div>
      )}

      {/* Child contact dialog */}
      <ChildContactDialog
        open={childDialogOpen}
        parentId={savedId}
        onOpenChange={setChildDialogOpen}
        onCreated={handleChildCreated}
      />
    </div>
  );
}

// =============================================================
// Sub-components
// =============================================================

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2.5 text-xs font-semibold transition-colors ${
        active
          ? "text-violet-700"
          : "text-secondary-muted hover:text-primary-dark"
      }`}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-violet-600 rounded-full" />
      )}
    </button>
  );
}

function IconField({
  icon,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 focus-within:border-violet-500 transition-colors">
      <span className="text-secondary-muted">{icon}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="flex-1 bg-transparent outline-none text-sm py-1 placeholder:text-slate-400"
      />
    </div>
  );
}

function UnderlineInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border-0 border-b border-transparent focus:border-violet-500 bg-transparent outline-none text-sm py-1 placeholder:text-slate-400 transition-colors hover:border-slate-200"
    />
  );
}

function ContactsTabContent({
  relatedContacts,
  canAddChild,
  onAddChild,
  onDeleteChild,
}: {
  relatedContacts: Contact[];
  canAddChild: boolean;
  onAddChild: () => void;
  onDeleteChild: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {relatedContacts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {relatedContacts.map((child) => (
            <div
              key={child.id}
              className="group border rounded-lg p-3 hover:shadow-sm hover:border-violet-300 transition-all relative"
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-md bg-slate-100 border flex items-center justify-center text-secondary-muted shrink-0">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-primary-dark truncate">
                      {child.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                      {child.contact_kind}
                    </span>
                  </div>
                  {child.job_position && (
                    <div className="text-xs text-secondary-muted mt-0.5">
                      {child.job_position}
                    </div>
                  )}
                  {child.email && (
                    <div className="text-xs text-secondary-muted flex items-center gap-1 mt-1">
                      <Mail className="h-3 w-3" />
                      {child.email}
                    </div>
                  )}
                  {child.phone && (
                    <div className="text-xs text-secondary-muted flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3" />
                      {child.phone}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteChild(child.id)}
                  className="opacity-0 group-hover:opacity-100 text-secondary-muted hover:text-rose-600 transition-opacity"
                  title="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onAddChild}
        disabled={!canAddChild}
        className="w-full border border-dashed rounded-lg p-6 text-center text-violet-600 hover:bg-violet-50/40 hover:border-violet-400 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Related Contacts
      </button>
      {!canAddChild && (
        <p className="text-xs text-secondary-muted text-center">
          Save the contact first to add related contacts.
        </p>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-primary-dark pb-2 border-b mb-3">
      {children}
    </h3>
  );
}

function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1.5">
      <Label className="text-xs text-secondary-muted pt-1.5">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function SalesPurchaseTab({
  form,
  update,
  salespersons,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  salespersons: SalespersonOption[];
}) {
  return (
    <div className="space-y-8">
      {/* SALES / PURCHASE row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-0">
        {/* SALES */}
        <div>
          <SectionTitle>Sales</SectionTitle>

          <FormRow label="Salesperson">
            <Select
              value={form.salesperson_id || "none"}
              onValueChange={(v) =>
                update("salesperson_id", v === "none" ? null : v)
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {salespersons.map((sp) => (
                  <SelectItem key={sp.id} value={sp.id}>
                    {sp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Pricelist">
            <Select
              value={form.pricelist || "none"}
              onValueChange={(v) => update("pricelist", v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {PRICELIST_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Payment Terms">
            <Select
              value={form.payment_terms || "none"}
              onValueChange={(v) => update("payment_terms", v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {PAYMENT_TERM_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Payment Method">
            <Select
              value={form.sales_payment_method || "none"}
              onValueChange={(v) =>
                update("sales_payment_method", v === "none" ? "" : v)
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {PAYMENT_METHOD_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Incoterm">
            <Select
              value={form.incoterm || "none"}
              onValueChange={(v) => update("incoterm", v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {INCOTERM_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Incoterm Location">
            <Input
              value={form.incoterm_location}
              onChange={(e) => update("incoterm_location", e.target.value)}
              className="h-8"
              placeholder="e.g. Karachi Port"
            />
          </FormRow>
        </div>

        {/* PURCHASE */}
        <div>
          <SectionTitle>Purchase</SectionTitle>

          <FormRow label="Group RFQ">
            <Select
              value={form.group_rfq || "On Order"}
              onValueChange={(v) => update("group_rfq", v)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="On Order" />
              </SelectTrigger>
              <SelectContent>
                {GROUP_RFQ_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Buyer">
            <Input
              value={form.buyer}
              onChange={(e) => update("buyer", e.target.value)}
              className="h-8"
              placeholder="e.g. John Doe"
            />
          </FormRow>

          <FormRow label="Payment Terms">
            <Select
              value={form.purchase_payment_terms || "none"}
              onValueChange={(v) =>
                update("purchase_payment_terms", v === "none" ? "" : v)
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {PAYMENT_TERM_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Payment Method">
            <Select
              value={form.purchase_payment_method || "none"}
              onValueChange={(v) =>
                update("purchase_payment_method", v === "none" ? "" : v)
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {PAYMENT_METHOD_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Receipt Reminder">
            <label className="inline-flex items-center gap-2 h-8">
              <input
                type="checkbox"
                checked={form.receipt_reminder}
                onChange={(e) => update("receipt_reminder", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-violet-600"
              />
              <span className="text-xs text-secondary-muted">
                Remind buyer to confirm receipt
              </span>
            </label>
          </FormRow>
        </div>
      </div>

      {/* FISCAL INFORMATION / MISC row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-0">
        <div>
          <SectionTitle>Fiscal Information</SectionTitle>
          <FormRow label="Fiscal Position">
            <Select
              value={form.fiscal_position || "none"}
              onValueChange={(v) => update("fiscal_position", v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {FISCAL_POSITION_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
        </div>

        <div>
          <SectionTitle>Misc</SectionTitle>
          <FormRow label="Reference">
            <Input
              value={form.company_ref}
              onChange={(e) => update("company_ref", e.target.value)}
              className="h-8"
              placeholder="Internal reference"
            />
          </FormRow>
          <FormRow label="Industry">
            <Input
              value={form.industry}
              onChange={(e) => update("industry", e.target.value)}
              className="h-8"
              placeholder="e.g. Logistics, Retail"
            />
          </FormRow>
        </div>
      </div>
    </div>
  );
}

function AccountingTab({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <SectionTitle>General</SectionTitle>

        <FormRow label="Account Receivable">
          <Input
            value={form.receivable_account}
            onChange={(e) => update("receivable_account", e.target.value)}
            className="h-8"
            placeholder="1121001 Receivable from Customers"
          />
        </FormRow>

        <FormRow label="Account Payable">
          <Input
            value={form.payable_account}
            onChange={(e) => update("payable_account", e.target.value)}
            className="h-8"
            placeholder="2221001 Payable to Suppliers"
          />
        </FormRow>

        <FormRow label="Tax Settings">
          <Input
            value={form.tax_settings}
            onChange={(e) => update("tax_settings", e.target.value)}
            className="h-8"
            placeholder="e.g. Standard VAT 17%"
          />
        </FormRow>

        <FormRow label="Fiscal Position">
          <Select
            value={form.fiscal_position || "none"}
            onValueChange={(v) => update("fiscal_position", v === "none" ? "" : v)}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select fiscal position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {FISCAL_POSITION_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>
      </div>

      <div>
        <SectionTitle>Customer Invoices</SectionTitle>
        <FormRow label="Tax ID / NTN">
          <Input
            value={form.tax_id}
            onChange={(e) => update("tax_id", e.target.value)}
            className="h-8"
            placeholder="e.g. 1234567-8"
          />
        </FormRow>
        <p className="text-xs text-secondary-muted pl-[152px]">
          Used on customer invoices.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Linked Quotations section (shown on the Contacts tab)
// ─────────────────────────────────────────────────────────────

function formatQuotationStatus(status: QuotationStatus): string {
  switch (status) {
    case "quotation":
      return "Quotation";
    case "quotation_sent":
      return "Sent";
    case "sales_order":
      return "Sales Order";
    default:
      return status;
  }
}

function quotationStatusClasses(status: QuotationStatus): string {
  switch (status) {
    case "quotation":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "quotation_sent":
      return "bg-green-50 text-green-700 border-green-300";
    case "sales_order":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function formatInvoiceStatus(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "approved":
      return "Approved";
    case "confirmed":
      return "Confirmed";
    case "posted":
      return "Posted";
    case "partially_paid":
      return "Partially Paid";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function invoiceStatusClasses(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "bg-slate-50 text-slate-700 border-slate-200";
    case "approved":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "confirmed":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "posted":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "partially_paid":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "paid":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "cancelled":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function LinkedQuotationsSection({
  contactId,
  contactName,
}: {
  contactId: string | null;
  contactName: string;
}) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contactId) {
      Promise.resolve().then(() => {
        setQuotations([]);
      });
      return;
    }
    Promise.resolve().then(() => {
      setLoading(true);
    });
    getQuotationsByContact(contactId).then((res) => {
      Promise.resolve().then(() => {
        if ("error" in res && res.error) {
          setQuotations([]);
        } else if ("quotations" in res && res.quotations) {
          setQuotations(res.quotations);
        }
        setLoading(false);
      });
    });
  }, [contactId]);

  function openQuotation(qId: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("admin:open-quotation", {
        detail: { quotationId: qId },
      })
    );
  }

  function createQuotationForContact() {
    if (!contactId) {
      toast.error("Save the contact first to create a quotation.");
      return;
    }
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("admin:open-quotation", {
        detail: { contactId, contactName },
      })
    );
  }

  const total = quotations.reduce((sum, q) => sum + Number(q.total_amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-primary-dark">Quotations</h3>
          <span className="text-xs text-secondary-muted">
            {quotations.length} record{quotations.length !== 1 ? "s" : ""}
            {quotations.length > 0 && (
              <> • Total {total.toFixed(2)} Rs.</>
            )}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={createQuotationForContact}
          disabled={!contactId}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          New Quotation
        </Button>
      </div>

      {!contactId ? (
        <div className="border border-dashed rounded-lg p-6 text-center text-xs text-secondary-muted">
          Save the contact first to see linked quotations.
        </div>
      ) : loading ? (
        <div className="border rounded-lg p-6 text-center text-xs text-secondary-muted">
          Loading quotations…
        </div>
      ) : quotations.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center text-xs text-secondary-muted">
          No quotations linked to this contact yet.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-secondary-muted">
              <tr>
                <th className="text-left font-medium px-3 py-2">Number</th>
                <th className="text-left font-medium px-3 py-2">Date</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="text-right font-medium px-3 py-2">Total</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => (
                <tr
                  key={q.id}
                  className="border-t hover:bg-violet-50/50 transition-colors cursor-pointer"
                  onClick={() => openQuotation(q.id)}
                >
                  <td className="px-3 py-2 font-medium text-violet-700">
                    {q.quotation_number || `QT-${q.id.substring(0, 8).toUpperCase()}`}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {new Date(q.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${quotationStatusClasses(
                        q.status
                      )}`}
                    >
                      {formatQuotationStatus(q.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">
                    {Number(q.total_amount || 0).toFixed(2)} Rs.
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    <ArrowUpRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LinkedInvoicesSection({ contactId }: { contactId: string | null }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contactId) {
      Promise.resolve().then(() => {
        setInvoices([]);
      });
      return;
    }
    Promise.resolve().then(() => {
      setLoading(true);
    });
    getInvoicesByContact(contactId).then((res) => {
      Promise.resolve().then(() => {
        if ("error" in res && res.error) {
          setInvoices([]);
        } else if ("invoices" in res && res.invoices) {
          setInvoices(res.invoices);
        }
        setLoading(false);
      });
    });
  }, [contactId]);

  function openInvoice(invoiceId: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("admin:open-invoice", {
        detail: { invoiceId },
      })
    );
  }

  const total = invoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-primary-dark">Invoices</h3>
          <span className="text-xs text-secondary-muted">
            {invoices.length} record{invoices.length !== 1 ? "s" : ""}
            {invoices.length > 0 && <> • Total {total.toFixed(2)} Rs.</>}
          </span>
        </div>
      </div>

      {!contactId ? (
        <div className="border border-dashed rounded-lg p-6 text-center text-xs text-secondary-muted">
          Save the contact first to see linked invoices.
        </div>
      ) : loading ? (
        <div className="border rounded-lg p-6 text-center text-xs text-secondary-muted">
          Loading invoices…
        </div>
      ) : invoices.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center text-xs text-secondary-muted">
          No invoices linked to this contact yet.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-secondary-muted">
              <tr>
                <th className="text-left font-medium px-3 py-2">Number</th>
                <th className="text-left font-medium px-3 py-2">Date</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="text-right font-medium px-3 py-2">Total</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr
                  key={i.id}
                  className="border-t hover:bg-violet-50/50 transition-colors cursor-pointer"
                  onClick={() => openInvoice(i.id)}
                >
                  <td className="px-3 py-2 font-medium text-violet-700">
                    {i.invoice_number}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {new Date(i.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${invoiceStatusClasses(
                        i.invoice_status
                      )}`}
                    >
                      {formatInvoiceStatus(i.invoice_status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">
                    {Number(i.total_amount || 0).toFixed(2)} Rs.
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    <ArrowUpRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
