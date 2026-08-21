"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, HelpCircle, Send, FileSearch } from "lucide-react";
import {
  createCrmOpportunity,
  updateCrmOpportunity,
  getCrmOpportunityById,
  moveCrmOpportunityStage,
} from "@/app/actions/crm/opportunities";
import {
  getCachedCrmPipelineStages,
  getCachedSalespersonOptions,
} from "@/lib/crm-client-cache";
import {
  getContactById,
  type Contact,
  type SalespersonOption,
} from "@/app/actions/contacts";
import type { CrmOpportunityPriority, CrmPipelineStage } from "@/app/actions/crm/types";
import { CustomerPicker, type PickedCustomer } from "@/components/admin/quotations/CustomerPicker";
import { OpportunityChatter } from "@/components/crm/OpportunityChatter";
import { CrmActivityDialog } from "@/components/crm/CrmActivityDialog";
import { CrmLostReasonDialog } from "@/components/crm/CrmLostReasonDialog";
import { CrmFormSkeleton } from "@/components/crm/CrmSkeleton";
import { salesQuotationNewUrlFromOpportunity } from "@/lib/sales-crm-bridge";
import {
  CRM_AUTO_ASSIGN_MODES,
  probabilityForStageName,
} from "@/lib/crm-automation";
import {
  crmOpportunityInquiryUrl,
  formatInquiryStatusLabel,
  isCrmQualifiedStage,
} from "@/lib/crm-inquiry-utils";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import {
  getCrmOpportunityInquirySummary,
  type CrmOpportunityInquirySummary,
} from "@/app/actions/crm/inquiries";

type Props = {
  opportunityId?: string | null;
  initialStageId?: string | null;
};

type FormState = {
  name: string;
  contact_id: string | null;
  customer_name: string;
  contact_person_id: string | null;
  stage_id: string;
  expected_revenue: string;
  probability: string;
  priority: CrmOpportunityPriority;
  salesperson_id: string;
  sales_team: string;
  tags: string;
  campaign: string;
  medium: string;
  source: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  expected_closing_date: string;
  internal_notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  contact_id: null,
  customer_name: "",
  contact_person_id: null,
  stage_id: "",
  expected_revenue: "0",
  probability: "10",
  priority: 0,
  salesperson_id: "",
  sales_team: "",
  tags: "",
  campaign: "",
  medium: "",
  source: "",
  email: "",
  phone: "",
  mobile: "",
  website: "",
  expected_closing_date: "",
  internal_notes: "",
};

type DetailTab = "notes" | "extra";

function FieldLabel({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <div
      className="flex items-center gap-1 text-xs text-secondary-muted min-w-[120px] shrink-0"
      title={tip}
    >
      <span>{children}</span>
      {tip ? <HelpCircle className="h-3 w-3 text-slate-300" aria-hidden /> : null}
    </div>
  );
}

function StageStatusBar({
  stages,
  activeStageId,
  onSelect,
  disabled,
}: {
  stages: CrmPipelineStage[];
  activeStageId: string;
  onSelect: (stageId: string) => void;
  disabled?: boolean;
}) {
  const visible = stages.filter((s) => !s.is_lost);
  const lostStage = stages.find((s) => s.is_lost);
  const isLost = Boolean(lostStage && lostStage.id === activeStageId);

  return (
    <div className="flex items-stretch h-8 overflow-hidden rounded-sm">
      {visible.map((stage, index) => {
        const active = !isLost && stage.id === activeStageId;
        const clip =
          index === 0
            ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)"
            : "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)";
        return (
          <button
            key={stage.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(stage.id)}
            aria-current={active ? "step" : undefined}
            aria-label={`Stage: ${stage.name}`}
            className={`relative px-4 text-xs font-medium transition-colors ${
              active
                ? "bg-[#017e84] text-white"
                : "bg-slate-100 text-secondary-muted hover:bg-slate-200"
            } ${index > 0 ? "-ml-2" : ""}`}
            style={{
              clipPath: clip,
              zIndex: visible.length - index,
              minWidth: index === visible.length - 1 ? 72 : 96,
            }}
          >
            {stage.name}
          </button>
        );
      })}
    </div>
  );
}

function SalespersonAvatar({ name }: { name: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#017e84] text-white text-[11px] font-semibold shrink-0">
      {initial}
    </span>
  );
}

export function CrmOpportunityFormView({ opportunityId, initialStageId }: Props) {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const isEdit = Boolean(opportunityId);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [salespersons, setSalespersons] = useState<SalespersonOption[]>([]);
  const [currentSalespersonId, setCurrentSalespersonId] = useState<string | null>(null);
  const [contactPersons, setContactPersons] = useState<Contact[]>([]);
  const [customerLeadId, setCustomerLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(isEdit));
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<DetailTab>("notes");
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [chatterKey, setChatterKey] = useState(0);
  const [inquirySummary, setInquirySummary] = useState<CrmOpportunityInquirySummary | null>(null);
  const [leadScore, setLeadScore] = useState(0);
  const [lostReasonOpen, setLostReasonOpen] = useState(false);
  const [pendingLostStageId, setPendingLostStageId] = useState<string | null>(null);
  const [lostReasonLabel, setLostReasonLabel] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    void Promise.all([getCachedCrmPipelineStages(), getCachedSalespersonOptions()]).then(
      ([stagesRes, salesRes]) => {
        if ("stages" in stagesRes && stagesRes.stages) setStages(stagesRes.stages);
        if ("salespersons" in salesRes && salesRes.salespersons) {
          setSalespersons(salesRes.salespersons);
        }
        if ("currentSalespersonId" in salesRes && salesRes.currentSalespersonId) {
          setCurrentSalespersonId(salesRes.currentSalespersonId);
        }
      }
    );
  }, [switchVersion]);

  useEffect(() => {
    if (isEdit && opportunityId) return;
    if (stages.length === 0) return;

    const preferred =
      (form.stage_id && stages.some((s) => s.id === form.stage_id) ? form.stage_id : null) ||
      (initialStageId && stages.some((s) => s.id === initialStageId) ? initialStageId : null) ||
      stages.find((s) => s.name === "New")?.id ||
      stages[0]?.id ||
      "";

    if (preferred && preferred !== form.stage_id) {
      update("stage_id", preferred);
    }
  }, [stages, isEdit, opportunityId, initialStageId, form.stage_id]);

  useEffect(() => {
    if (!isEdit || !opportunityId) {
      return;
    }

    setLoading(true);
    void getCrmOpportunityById(opportunityId)
      .then((res) => {
        if ("error" in res && res.error) {
          toast.error(res.error);
          router.push("/crm/pipeline");
          return;
        }
        if (!("opportunity" in res) || !res.opportunity) return;
        const o = res.opportunity;
        setForm({
          name: o.name,
          contact_id: o.contact_id,
          customer_name: o.customer_name || "",
          contact_person_id: o.contact_person_id,
          stage_id: o.stage_id,
          expected_revenue: String(o.expected_revenue ?? 0),
          probability: String(o.probability ?? 0),
          priority: o.priority,
          salesperson_id: o.salesperson_id || "",
          sales_team: o.sales_team || "",
          tags: (o.tags || []).join(", "),
          campaign: o.campaign || "",
          medium: o.medium || "",
          source: o.source || "",
          email: o.email || "",
          phone: o.phone || "",
          mobile: o.mobile || "",
          website: o.website || "",
          expected_closing_date: o.expected_closing_date
            ? o.expected_closing_date.slice(0, 10)
            : "",
          internal_notes: o.internal_notes || "",
        });
        setLeadScore(Number(o.lead_score) || 0);
        setLostReasonLabel(o.lost_reason || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isEdit, opportunityId, router]);

  useEffect(() => {
    if (!isEdit || !opportunityId) {
      setInquirySummary(null);
      return;
    }
    void getCrmOpportunityInquirySummary(opportunityId).then((res) => {
      if ("summary" in res) setInquirySummary(res.summary);
    });
  }, [isEdit, opportunityId, chatterKey]);

  useEffect(() => {
    if (form.salesperson_id || salespersons.length === 0) return;
    const preferred =
      (currentSalespersonId && salespersons.some((s) => s.id === currentSalespersonId)
        ? currentSalespersonId
        : null) || salespersons[0]?.id;
    if (preferred) update("salesperson_id", preferred);
  }, [salespersons, form.salesperson_id, currentSalespersonId]);

  const salespersonName = useMemo(
    () => salespersons.find((s) => s.id === form.salesperson_id)?.name || "",
    [salespersons, form.salesperson_id]
  );

  const wonStage = stages.find((s) => s.is_won);
  const lostStage = stages.find((s) => s.is_lost);
  const currentStage = stages.find((s) => s.id === form.stage_id);
  const showSendInquiry = isEdit && isCrmQualifiedStage(currentStage?.name);
  const latestInquiryLabel = inquirySummary?.latest_approval_status
    ? formatInquiryStatusLabel(inquirySummary.latest_approval_status)
    : inquirySummary?.latest_status
      ? formatInquiryStatusLabel(inquirySummary.latest_status)
      : null;

  async function handleCustomerSelect(picked: PickedCustomer) {
    update("contact_id", picked.contact_id);
    update("customer_name", picked.name);
    update("contact_person_id", null);
    if (!form.name.trim()) update("name", `${picked.name} — Opportunity`);

    // Customer ID belongs to the Contact — set from picker immediately.
    setCustomerLeadId(picked.lead_id_formatted || null);
    if (picked.email) update("email", picked.email);
    if (picked.phone) update("phone", picked.phone);
    if (picked.salesperson_id) update("salesperson_id", picked.salesperson_id);

    const res = await getContactById(picked.contact_id);
    if ("contact" in res && res.contact) {
      const c = res.contact;
      // Prefer contact's permanent ID; never clear a known valid ID with null.
      const contactCustomerId = c.lead_id_formatted || null;
      if (contactCustomerId) {
        setCustomerLeadId(contactCustomerId);
      }
      if (!picked.email) update("email", c.email || "");
      if (!picked.phone) update("phone", c.phone || "");
      update("mobile", c.mobile || "");
      update("website", c.website || "");
      if (c.salesperson_id) update("salesperson_id", c.salesperson_id);
      const children = (c.children || []).filter(
        (child) => child.contact_kind === "contact" || child.company_type === "person"
      );
      setContactPersons(children);
    } else {
      setContactPersons([]);
    }
  }

  useEffect(() => {
    if (!form.contact_id) {
      setContactPersons([]);
      setCustomerLeadId(null);
      return;
    }
    const contactId = form.contact_id;
    void getContactById(contactId).then((res) => {
      if (!("contact" in res) || !res.contact) return;
      // Only adopt the Contact's permanent Customer ID — never invent/overwrite with another.
      if (res.contact.lead_id_formatted) {
        setCustomerLeadId(res.contact.lead_id_formatted);
      }
      const children = (res.contact.children || []).filter(
        (c) => c.contact_kind === "contact" || c.company_type === "person"
      );
      setContactPersons(children);
    });
  }, [form.contact_id]);

  const validate = useCallback((): string | null => {
    if (!form.name.trim()) return "Opportunity name is required.";
    if (!form.contact_id) return "Contact is required.";
    if (!form.salesperson_id) return "Salesperson is required.";
    const revenue = Number(form.expected_revenue);
    if (!Number.isFinite(revenue) || revenue < 0) {
      return "Expected revenue cannot be negative.";
    }
    return null;
  }, [form]);

  const buildPayload = useCallback(
    (stageOverride?: string) => {
      const stageId = stageOverride || form.stage_id || undefined;
      const stageName = stages.find((s) => s.id === stageId)?.name || currentStage?.name;
      return {
        id: opportunityId || undefined,
        name: form.name.trim(),
        contact_id: form.contact_id!,
        contact_person_id: form.contact_person_id,
        stage_id: stageId,
        stage_name: stageName,
        expected_revenue: Number(form.expected_revenue) || 0,
        probability: Number(form.probability) || 0,
        priority: form.priority,
        salesperson_id: form.salesperson_id,
        sales_team: form.sales_team || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        campaign: form.campaign || null,
        medium: form.medium || null,
        source: form.source || null,
        email: form.email || null,
        phone: form.phone || null,
        mobile: form.mobile || null,
        website: form.website || null,
        expected_closing_date: form.expected_closing_date || null,
        internal_notes: form.internal_notes || null,
      };
    },
    [form, opportunityId, stages, currentStage]
  );

  const handleSubmit = useCallback(() => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateCrmOpportunity(buildPayload())
        : await createCrmOpportunity(buildPayload());

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Opportunity updated" : "Opportunity created");
      const id = "opportunity" in result ? result.opportunity?.id : null;
      if ("opportunity" in result && result.opportunity) {
        setLeadScore(Number(result.opportunity.lead_score) || 0);
      }
      if (!isEdit && id) {
        router.push(`/crm/opportunities/${id}`);
      } else {
        setChatterKey((k) => k + 1);
      }
    });
  }, [buildPayload, isEdit, router, validate]);

  useEffect(() => {
    function onShortcutSave() {
      if (isPending) return;
      handleSubmit();
    }
    window.addEventListener("crm:shortcut-save", onShortcutSave);
    return () => window.removeEventListener("crm:shortcut-save", onShortcutSave);
  }, [isPending, handleSubmit]);

  function applyStageLocally(stageId: string, probability?: number) {
    update("stage_id", stageId);
    if (typeof probability === "number") {
      update("probability", String(probability));
    }
  }

  function changeStage(stageId: string, lostReason?: string) {
    const target = stages.find((s) => s.id === stageId);

    if (!isEdit || !opportunityId) {
      update("stage_id", stageId);
      if (target) {
        const p = probabilityForStageName(
          target.name,
          target.is_won,
          target.is_lost,
          target.default_probability
        );
        update("probability", String(p));
      }
      return;
    }
    if (stageId === form.stage_id && !lostReason) return;

    if (target?.is_lost && !lostReason) {
      setPendingLostStageId(stageId);
      setLostReasonOpen(true);
      return;
    }

    startTransition(async () => {
      const result = await moveCrmOpportunityStage(opportunityId, stageId, {
        lostReason: lostReason || null,
        stageName: target?.name || null,
      });
      if ("needsLostReason" in result && result.needsLostReason) {
        setPendingLostStageId(stageId);
        setLostReasonOpen(true);
        return;
      }
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      applyStageLocally(stageId, "probability" in result ? result.probability : undefined);
      if (lostReason) setLostReasonLabel(lostReason);
      if (target?.is_won) setLostReasonLabel(null);
      setChatterKey((k) => k + 1);
      toast.success("Stage updated");
    });
  }

  function markWon() {
    if (!wonStage) {
      toast.error("No Won stage configured.");
      return;
    }
    changeStage(wonStage.id);
  }

  function markLost() {
    if (!lostStage) {
      toast.error("No Lost stage configured.");
      return;
    }
    setPendingLostStageId(lostStage.id);
    setLostReasonOpen(true);
  }

  const revenueDisplay = Number(form.expected_revenue || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (loading) {
    return <CrmFormSkeleton />;
  }

  return (
    <div className="-mx-1 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden min-h-[calc(100vh-140px)] flex flex-col">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/crm/pipeline")}
            className="gap-1.5 h-8 text-secondary-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Pipeline
          </Button>
          <Button
            size="sm"
            className="h-8 bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={!isEdit || !opportunityId}
            title={
              isEdit
                ? "Create a quotation from this opportunity"
                : "Save the opportunity first"
            }
            onClick={() => {
              if (!opportunityId) return;
              router.push(salesQuotationNewUrlFromOpportunity(opportunityId));
            }}
          >
            New Quotation
          </Button>
          {showSendInquiry ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-[#017e84] text-[#017e84] hover:bg-[#017e84]/5"
              disabled={!opportunityId || isPending}
              onClick={() => {
                if (!opportunityId) return;
                startTransition(() => {
                  router.push(crmOpportunityInquiryUrl(opportunityId, "create"));
                });
              }}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {isPending ? "Opening…" : "Send Inquiry"}
            </Button>
          ) : null}
          {isEdit && inquirySummary && inquirySummary.total > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                if (!opportunityId) return;
                router.push(crmOpportunityInquiryUrl(opportunityId, "view"));
              }}
            >
              <FileSearch className="h-3.5 w-3.5 mr-1.5" />
              Inquiries ({inquirySummary.total})
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled
            title="Email templates — Coming Soon"
          >
            Email Templates
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={isPending || !wonStage}
            onClick={markWon}
          >
            Won
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={isPending || !lostStage}
            onClick={markLost}
          >
            Lost
          </Button>
          <Button
            size="sm"
            className="h-8 bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={() => handleSubmit()}
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {isEdit && inquirySummary && inquirySummary.total > 0 ? (
            <div
              className="hidden md:flex flex-col items-end text-right"
              title="Linked inquiries from this opportunity"
            >
              <span className="text-[10px] uppercase tracking-wide text-secondary-muted">
                Inquiries
              </span>
              <span className="text-sm font-semibold text-[#017e84] tabular-nums">
                {inquirySummary.total}
                {latestInquiryLabel ? ` · ${latestInquiryLabel}` : ""}
              </span>
            </div>
          ) : null}
          <div
            className="hidden sm:flex flex-col items-end text-right"
            title="Lead score based on probability, revenue, stage, and activities"
          >
            <span className="text-[10px] uppercase tracking-wide text-secondary-muted">
              Lead Score
            </span>
            <span className="text-sm font-semibold text-[#017e84] tabular-nums">{leadScore}</span>
          </div>
          <StageStatusBar
            stages={stages}
            activeStageId={form.stage_id}
            onSelect={changeStage}
            disabled={isPending}
          />
        </div>
      </div>

      {lostReasonLabel ? (
        <div className="mx-4 mt-3 text-xs text-secondary-muted">
          Lost reason: <span className="font-medium text-primary-dark">{lostReasonLabel}</span>
        </div>
      ) : null}

      {/* Body: form + chatter */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] flex-1 min-h-0">
        {/* LEFT */}
        <div className="min-w-0 p-5 md:p-6 border-b xl:border-b-0 xl:border-r border-slate-200 space-y-6 overflow-y-auto">
          {/* Title */}
          <input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Opportunity's Name"
            className="w-full bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-[#017e84] rounded-none px-0 py-1 text-2xl md:text-3xl font-semibold text-primary-dark placeholder:text-slate-300 focus:outline-none focus:ring-0"
            disabled={isPending}
          />

          {/* Expected Revenue + Probability */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-1 text-xs text-secondary-muted mb-1">
                Expected Revenue
                <HelpCircle className="h-3 w-3 text-slate-300" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-secondary-muted">Rs.</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.expected_revenue}
                  onChange={(e) => update("expected_revenue", e.target.value)}
                  className="w-full max-w-[180px] bg-transparent border-0 border-b border-slate-200 rounded-none px-0 py-0.5 text-2xl font-semibold text-primary-dark focus:outline-none focus:border-[#017e84] focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  disabled={isPending}
                  aria-label={`Expected revenue Rs. ${revenueDisplay}`}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs text-secondary-muted mb-1">
                Probability
                <HelpCircle className="h-3 w-3 text-slate-300" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-secondary-muted">at</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.probability}
                  onChange={(e) => update("probability", e.target.value)}
                  className="w-20 bg-transparent border-0 border-b border-slate-200 rounded-none px-0 py-0.5 text-2xl font-semibold text-primary-dark focus:outline-none focus:border-[#017e84] focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  disabled={isPending}
                />
                <span className="text-2xl font-semibold text-primary-dark">%</span>
              </div>
              {currentStage?.is_won || currentStage?.is_lost ? (
                <p className="text-[11px] text-secondary-muted mt-1">
                  Stage: {currentStage.name}
                </p>
              ) : null}
            </div>
          </div>

          {/* Field grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <FieldLabel tip="Customer / company linked to this opportunity">
                  Contact
                </FieldLabel>
                <div className="flex-1 min-w-0 [&_input]:border-0 [&_input]:border-b [&_input]:border-slate-200 [&_input]:rounded-none [&_input]:px-0 [&_input]:shadow-none [&_input]:focus-visible:ring-0 [&_input]:focus:border-[#017e84] [&_.absolute]:hidden">
                  <CustomerPicker
                    contactId={form.contact_id}
                    customerName={form.customer_name}
                    onSelect={handleCustomerSelect}
                    contactScope="all"
                    placeholder="Select contact…"
                    disabled={isPending}
                  />
                </div>
              </div>

              {customerLeadId ? (
                <div className="flex items-center gap-3 md:col-span-2">
                  <FieldLabel tip="Permanent Customer ID from the linked contact">
                    Customer ID
                  </FieldLabel>
                  <span className="font-mono text-sm font-semibold text-primary-dark">
                    {customerLeadId}
                  </span>
                </div>
              ) : null}

              <div className="flex items-center gap-3">
                <FieldLabel tip="Person at the company">Contact Person</FieldLabel>
                <Select
                  value={form.contact_person_id || "none"}
                  onValueChange={(v) =>
                    update("contact_person_id", v === "none" ? null : v)
                  }
                  disabled={isPending || !form.contact_id || contactPersons.length === 0}
                >
                  <SelectTrigger className="flex-1 border-0 border-b border-slate-200 rounded-none px-0 h-9 shadow-none focus:ring-0 focus:border-[#017e84]">
                    <SelectValue placeholder="Select person…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {contactPersons.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <FieldLabel tip="Email address">Email</FieldLabel>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="e.g. mail@example.com"
                  className="flex-1 bg-transparent border-0 border-b border-slate-200 rounded-none px-0 py-1.5 text-sm text-primary-dark placeholder:text-slate-400 focus:outline-none focus:border-[#017e84]"
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center gap-3">
                <FieldLabel tip="Phone number">Phone</FieldLabel>
                <input
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="e.g. (555) 555-0199"
                  className="flex-1 bg-transparent border-0 border-b border-slate-200 rounded-none px-0 py-1.5 text-sm text-primary-dark placeholder:text-slate-400 focus:outline-none focus:border-[#017e84]"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <FieldLabel tip="Assigned salesperson">Salesperson</FieldLabel>
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                  {salespersonName ? <SalespersonAvatar name={salespersonName} /> : null}
                  <Select
                    value={form.salesperson_id}
                    onValueChange={(v) => update("salesperson_id", v)}
                    disabled={isPending}
                  >
                    <SelectTrigger className="border-0 border-b border-slate-200 rounded-none px-0 h-9 shadow-none focus:ring-0 focus:border-[#017e84]">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {salespersons.map((sp) => (
                        <SelectItem key={sp.id} value={sp.id}>
                          {sp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  </div>
                  <p className="text-[10px] text-secondary-muted">
                    Assignment: {CRM_AUTO_ASSIGN_MODES.find((m) => m.enabled)?.label}
                    {" · "}
                    <span className="opacity-70">Round-robin Coming Soon</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <FieldLabel tip="Expected closing date">Expected Closing</FieldLabel>
                <input
                  type="date"
                  value={form.expected_closing_date}
                  onChange={(e) => update("expected_closing_date", e.target.value)}
                  className="flex-1 bg-transparent border-0 border-b border-slate-200 rounded-none px-0 py-1.5 text-sm text-primary-dark focus:outline-none focus:border-[#017e84] empty:text-slate-400"
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center gap-3">
                <FieldLabel tip="Comma-separated tags">Tags</FieldLabel>
                <input
                  value={form.tags}
                  onChange={(e) => update("tags", e.target.value)}
                  placeholder=""
                  className="flex-1 bg-transparent border-0 border-b border-slate-200 rounded-none px-0 py-1.5 text-sm text-primary-dark placeholder:text-slate-400 focus:outline-none focus:border-[#017e84]"
                  disabled={isPending}
                />
              </div>
            </div>
          </div>

          {/* Notes / Extra Info tabs */}
          <div className="pt-2">
            <div className="flex items-center gap-6 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setTab("notes")}
                className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === "notes"
                    ? "border-[#017e84] text-[#017e84]"
                    : "border-transparent text-secondary-muted hover:text-primary-dark"
                }`}
              >
                Notes
              </button>
              <button
                type="button"
                onClick={() => setTab("extra")}
                className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === "extra"
                    ? "border-[#017e84] text-[#017e84]"
                    : "border-transparent text-secondary-muted hover:text-primary-dark"
                }`}
              >
                Extra Info
              </button>
            </div>

            {tab === "notes" ? (
              <Textarea
                value={form.internal_notes}
                onChange={(e) => update("internal_notes", e.target.value)}
                placeholder="Add a description…"
                rows={6}
                className="mt-3 border-0 shadow-none resize-y focus-visible:ring-0 px-0 text-sm"
                disabled={isPending}
              />
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-secondary-muted mb-1">Sales Team</div>
                  <Input
                    value={form.sales_team}
                    onChange={(e) => update("sales_team", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div>
                  <div className="text-xs text-secondary-muted mb-1">Campaign</div>
                  <Input
                    value={form.campaign}
                    onChange={(e) => update("campaign", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div>
                  <div className="text-xs text-secondary-muted mb-1">Medium</div>
                  <Input
                    value={form.medium}
                    onChange={(e) => update("medium", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div>
                  <div className="text-xs text-secondary-muted mb-1">Source</div>
                  <Input
                    value={form.source}
                    onChange={(e) => update("source", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div>
                  <div className="text-xs text-secondary-muted mb-1">Mobile</div>
                  <Input
                    value={form.mobile}
                    onChange={(e) => update("mobile", e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div>
                  <div className="text-xs text-secondary-muted mb-1">Website</div>
                  <Input
                    value={form.website}
                    onChange={(e) => update("website", e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Chatter */}
        <div className="min-h-[520px] xl:min-h-0 bg-slate-50/40">
          <OpportunityChatter
            key={chatterKey}
            opportunityId={isEdit ? opportunityId! : null}
            onScheduleActivity={
              isEdit && opportunityId
                ? () => setActivityDialogOpen(true)
                : undefined
            }
          />
        </div>
      </div>

      {isEdit && opportunityId ? (
        <CrmActivityDialog
          open={activityDialogOpen}
          onOpenChange={setActivityDialogOpen}
          opportunityId={opportunityId}
          salespersons={salespersons}
          defaultAssignedTo={form.salesperson_id || undefined}
          onSaved={() => {
            setChatterKey((k) => k + 1);
            setActivityDialogOpen(false);
          }}
        />
      ) : null}

      <CrmLostReasonDialog
        open={lostReasonOpen}
        onOpenChange={(open) => {
          setLostReasonOpen(open);
          if (!open) setPendingLostStageId(null);
        }}
        onConfirm={(reason) => {
          if (pendingLostStageId) {
            changeStage(pendingLostStageId, reason);
            setPendingLostStageId(null);
          }
        }}
      />
    </div>
  );
}
