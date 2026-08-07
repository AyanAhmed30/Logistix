"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getCrmPipelineBoard,
  moveCrmOpportunityStage,
} from "@/app/actions/crm/opportunities";
import type {
  CrmOpportunityCard,
  CrmPipelineBoardFilters,
  CrmPipelineStage,
} from "@/app/actions/crm/types";
import {
  getCachedSalespersonOptions,
  invalidateCrmClientCache,
  loadCrmUiPrefs,
  saveCrmUiPrefs,
} from "@/lib/crm-client-cache";
import { type SalespersonOption } from "@/app/actions/contacts";
import { CrmKanbanSkeleton, CrmEmptyState } from "@/components/crm/CrmSkeleton";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Send,
  Settings2,
} from "lucide-react";
import { isCrmQualifiedStage, crmOpportunityInquiryUrl } from "@/lib/crm-inquiry-utils";
import { CrmStageManagerDialog } from "@/components/crm/CrmStageManagerDialog";
import { CrmPipelineQuickCreate } from "@/components/crm/CrmPipelineQuickCreate";
import { CrmLostReasonDialog } from "@/components/crm/CrmLostReasonDialog";
import { ModuleLoadingOverlay } from "@/components/ui/ModuleLoadingOverlay";

function formatRevenue(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatCardDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function OpportunityCard({
  opportunity,
  onOpen,
  onSendInquiry,
  sendingInquiry,
}: {
  opportunity: CrmOpportunityCard;
  onOpen: (id: string) => void;
  onSendInquiry: (id: string) => void;
  sendingInquiry?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  const showSendInquiry = isCrmQualifiedStage(opportunity.stage_name);
  const createdLabel = formatCardDateTime(opportunity.created_at);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="touch-none"
      {...attributes}
      {...listeners}
    >
      <div
        className="rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
        onClick={() => {
          if (!isDragging) onOpen(opportunity.id);
        }}
      >
        <div className="p-3 space-y-1">
          <h3 className="font-semibold text-sm text-primary-dark truncate">
            {opportunity.name}
          </h3>
          {opportunity.customer_name ? (
            <p className="text-xs text-secondary-muted truncate">
              <span className="text-slate-400">Customer </span>
              <span className="text-primary-dark font-medium">
                {opportunity.customer_name}
              </span>
            </p>
          ) : null}
          {opportunity.customer_lead_id ? (
            <p className="text-xs text-secondary-muted truncate">
              <span className="text-slate-400">Customer ID </span>
              <span className="font-mono font-semibold text-primary-dark">
                {opportunity.customer_lead_id}
              </span>
            </p>
          ) : null}
          {createdLabel ? (
            <p className="text-[11px] text-slate-400 truncate">{createdLabel}</p>
          ) : null}
          {showSendInquiry ? (
            <div className="pt-2">
              <Button
                type="button"
                size="sm"
                disabled={sendingInquiry}
                className="h-7 w-full text-xs bg-[#017e84] hover:bg-[#016970] text-white disabled:opacity-70"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSendInquiry(opportunity.id);
                }}
              >
                {sendingInquiry ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Send className="h-3 w-3 mr-1.5" />
                )}
                {sendingInquiry ? "Opening…" : "Send Inquiry"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  opportunities,
  onOpenOpportunity,
  onSendInquiry,
  sendingInquiryId,
  onToggleFold,
  isGlobalAdminView,
  quickCreateOpen,
  onQuickCreateOpen,
  onQuickCreateClose,
  onQuickCreateSuccess,
  salespersons,
  defaultSalespersonId,
}: {
  stage: CrmPipelineStage;
  opportunities: CrmOpportunityCard[];
  onOpenOpportunity: (id: string) => void;
  onSendInquiry: (id: string) => void;
  sendingInquiryId?: string | null;
  onToggleFold: (stage: CrmPipelineStage) => void;
  isGlobalAdminView: boolean;
  quickCreateOpen: boolean;
  onQuickCreateOpen: () => void;
  onQuickCreateClose: () => void;
  onQuickCreateSuccess: (opportunity: CrmOpportunityCard) => void;
  salespersons: SalespersonOption[];
  defaultSalespersonId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const stageOpps = opportunities.filter((o) =>
    isGlobalAdminView ? o.stage_name === stage.name : o.stage_id === stage.id
  );
  const totalRevenue = stageOpps.reduce((sum, o) => sum + (o.expected_revenue || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-[300px] sm:w-[320px] flex flex-col max-h-[calc(100vh-280px)] ${
        isOver ? "ring-2 ring-[#017e84]/30 rounded-xl" : ""
      }`}
    >
      <div
        className={`rounded-t-xl border border-b-0 px-4 py-3 ${
          stage.is_won
            ? "bg-emerald-50 border-emerald-200"
            : stage.is_lost
              ? "bg-rose-50 border-rose-200"
              : "bg-slate-50 border-slate-200"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-sm text-primary-dark truncate">{stage.name}</h2>
            <p className="text-xs text-secondary-muted mt-0.5">
              {stageOpps.length} · {formatRevenue(totalRevenue)}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {!isGlobalAdminView ? (
              <button
                type="button"
                className="rounded p-1 text-[#017e84] hover:bg-[#017e84]/10 transition-colors"
                title="New opportunity"
                onClick={onQuickCreateOpen}
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 p-1"
              onClick={() => onToggleFold(stage)}
              title={stage.is_folded ? "Unfold stage" : "Fold stage"}
            >
              {stage.is_folded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {!stage.is_folded ? (
        <div className="flex-1 overflow-y-auto rounded-b-xl border border-slate-200 bg-slate-100/60 p-2 space-y-2 min-h-[120px]">
          {quickCreateOpen ? (
            <CrmPipelineQuickCreate
              stage={stage}
              salespersons={salespersons}
              defaultSalespersonId={defaultSalespersonId || undefined}
              onCreated={(opportunity) => {
                onQuickCreateSuccess(opportunity);
                onQuickCreateClose();
              }}
              onCancel={onQuickCreateClose}
            />
          ) : null}
          <SortableContext items={stageOpps.map((o) => o.id)} strategy={verticalListSortingStrategy}>
            {stageOpps.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                onOpen={onOpenOpportunity}
                onSendInquiry={onSendInquiry}
                sendingInquiry={sendingInquiryId === opp.id}
              />
            ))}
          </SortableContext>
          {stageOpps.length === 0 ? (
            <div className="py-8 text-center text-xs text-secondary-muted">Drop opportunities here</div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-b-xl border border-slate-200 bg-slate-100/40 px-3 py-2 text-xs text-secondary-muted">
          Folded · {stageOpps.length} opportunities
        </div>
      )}
    </div>
  );
}

export function CrmPipelineView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactIdFilter = searchParams.get("contactId");
  const { switchVersion } = useAdminOrganization();
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [opportunities, setOpportunities] = useState<CrmOpportunityCard[]>([]);
  const [salespersons, setSalespersons] = useState<SalespersonOption[]>([]);
  const [currentSalespersonId, setCurrentSalespersonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [isGlobalAdminView, setIsGlobalAdminView] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [quickCreateStageId, setQuickCreateStageId] = useState<string | null>(null);
  const [sendingInquiryId, setSendingInquiryId] = useState<string | null>(null);
  const [lostReasonOpen, setLostReasonOpen] = useState(false);
  const [pendingLostMove, setPendingLostMove] = useState<{
    opportunityId: string;
    stageId: string;
    previous: CrmOpportunityCard[];
  } | null>(null);
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [salespersonFilter, setSalespersonFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"created_at" | "expected_revenue">(() => {
    const prefs = loadCrmUiPrefs();
    return prefs.pipelineSortBy || "created_at";
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    const prefs = loadCrmUiPrefs();
    return prefs.pipelineSortDir || "desc";
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const filters: CrmPipelineBoardFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      stageId: stageFilter !== "all" ? stageFilter : undefined,
      salespersonId: salespersonFilter !== "all" ? salespersonFilter : undefined,
      contactId: contactIdFilter || undefined,
      sortBy,
      sortDir,
    }),
    [search, stageFilter, salespersonFilter, contactIdFilter, sortBy, sortDir]
  );

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setOrgError(null);
    const result = await getCrmPipelineBoard(filters);
    if ("error" in result && result.error && !("stages" in result && result.stages?.length)) {
      toast.error(result.error);
      setOrgError(result.error);
      setStages([]);
      setOpportunities([]);
    } else if ("error" in result && result.error) {
      setOrgError(result.error);
      setStages(result.stages || []);
      setOpportunities(result.opportunities || []);
    } else {
      setOrgError(null);
      setStages(result.stages || []);
      setOpportunities(result.opportunities || []);
    }
    setIsGlobalAdminView(Boolean("isGlobalAdminView" in result && result.isGlobalAdminView));
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    setQuickCreateStageId(null);
    void loadBoard();
  }, [loadBoard, switchVersion]);

  useEffect(() => {
    function onControlSearch(e: Event) {
      const query = (e as CustomEvent<{ query?: string }>).detail?.query ?? "";
      setSearch(query);
    }
    function onControlFilter(e: Event) {
      const filterId = (e as CustomEvent<{ filterId?: string }>).detail?.filterId;
      if (filterId === "all" || filterId === "open") {
        setSalespersonFilter("all");
      }
      // "my" / "customers" are interpreted by the control panel for other routes
    }
    window.addEventListener("crm:control-search", onControlSearch);
    window.addEventListener("crm:control-filter", onControlFilter);
    return () => {
      window.removeEventListener("crm:control-search", onControlSearch);
      window.removeEventListener("crm:control-filter", onControlFilter);
    };
  }, []);

  useEffect(() => {
    void getCachedSalespersonOptions().then((res) => {
      if ("salespersons" in res && res.salespersons) setSalespersons(res.salespersons);
      if ("currentSalespersonId" in res && res.currentSalespersonId) {
        setCurrentSalespersonId(res.currentSalespersonId);
      }
    });
  }, [switchVersion]);

  useEffect(() => {
    saveCrmUiPrefs({ pipelineSortBy: sortBy, pipelineSortDir: sortDir });
  }, [sortBy, sortDir]);

  useEffect(() => {
    function onOpenQuickCreate(e: Event) {
      const detail = (e as CustomEvent<{ stageId?: string }>).detail || {};
      if (isGlobalAdminView) {
        toast.info("Select a specific organization to create opportunities.");
        return;
      }
      const targetId =
        detail.stageId ||
        stages.find((s) => s.name === "New")?.id ||
        stages[0]?.id ||
        null;
      if (targetId) setQuickCreateStageId(targetId);
    }
    window.addEventListener("crm:pipeline-quick-create", onOpenQuickCreate);
    return () => window.removeEventListener("crm:pipeline-quick-create", onOpenQuickCreate);
  }, [stages, isGlobalAdminView]);

  function handleQuickCreateSuccess(opportunity: CrmOpportunityCard) {
    setOpportunities((prev) => {
      if (prev.some((o) => o.id === opportunity.id)) return prev;
      return [opportunity, ...prev];
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const opportunityId = String(active.id);
    const overId = String(over.id);

    let targetStageId: string | null = null;
    if (stages.some((s) => s.id === overId)) {
      targetStageId = overId;
    } else {
      const targetOpp = opportunities.find((o) => o.id === overId);
      if (targetOpp) {
        targetStageId = isGlobalAdminView
          ? stages.find((s) => s.name === targetOpp.stage_name)?.id ?? null
          : targetOpp.stage_id;
      }
    }
    if (!targetStageId) return;

    const opp = opportunities.find((o) => o.id === opportunityId);
    if (!opp) return;
    const targetStage = stages.find((s) => s.id === targetStageId);
    const alreadyThere = isGlobalAdminView
      ? opp.stage_name === targetStage?.name
      : opp.stage_id === targetStageId;
    if (alreadyThere) return;

    const previous = opportunities;

    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === opportunityId
          ? {
              ...o,
              stage_id: targetStageId!,
              stage_name: targetStage?.name ?? o.stage_name,
            }
          : o
      )
    );

    if (targetStage?.is_lost) {
      setPendingLostMove({
        opportunityId,
        stageId: targetStageId!,
        previous,
      });
      setLostReasonOpen(true);
      return;
    }

    startTransition(async () => {
      try {
        const result = await moveCrmOpportunityStage(opportunityId, targetStageId!, {
          stageName: targetStage?.name || null,
        });
        if ("needsLostReason" in result && result.needsLostReason) {
          setPendingLostMove({
            opportunityId,
            stageId: targetStageId!,
            previous,
          });
          setLostReasonOpen(true);
          return;
        }
        if ("error" in result && result.error) {
          toast.error(result.error);
          setOpportunities(previous);
          return;
        }
        // Smooth: keep optimistic UI; only patch fields returned by the server
        if ("probability" in result || "stage_id" in result) {
          setOpportunities((prev) =>
            prev.map((o) =>
              o.id === opportunityId
                ? {
                    ...o,
                    stage_id:
                      "stage_id" in result && result.stage_id
                        ? String(result.stage_id)
                        : o.stage_id,
                    stage_name: targetStage?.name ?? o.stage_name,
                    probability:
                      "probability" in result && typeof result.probability === "number"
                        ? result.probability
                        : o.probability,
                  }
                : o
            )
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to move opportunity.");
        setOpportunities(previous);
      }
    });
  }

  function handleToggleFold(stage: CrmPipelineStage) {
    if (isGlobalAdminView) {
      toast.info("Switch to a specific organization to fold stages.");
      return;
    }
    startTransition(async () => {
      const { toggleCrmPipelineStageFold } = await import("@/app/actions/crm/stages");
      const result = await toggleCrmPipelineStageFold(stage.id, !stage.is_folded);
      if ("error" in result && result.error) toast.error(result.error);
      else void loadBoard();
    });
  }

  const activeOpportunity = activeId
    ? opportunities.find((o) => o.id === activeId)
    : null;

  if (orgError && stages.length === 0 && !loading) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center max-w-lg mx-auto mt-8">
        <p className="text-sm text-amber-900 font-medium">{orgError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sendingInquiryId ? <ModuleLoadingOverlay label="Inquiry" /> : null}
      {isGlobalAdminView ? (
        <div className="rounded-sm border border-[#017e84]/20 bg-[#017e84]/5 px-4 py-2.5 text-sm text-[#017e84]">
          <strong>Admin view</strong> — showing opportunities from all organizations. Select a
          company in the header to manage stages or create opportunities for one organization.
        </div>
      ) : null}
      {contactIdFilter ? (
        <div className="rounded-sm border border-slate-200 bg-white px-4 py-2 text-sm text-secondary-muted flex items-center justify-between gap-3">
          <span>
            Showing opportunities for a selected contact.{" "}
            <button
              type="button"
              className="text-[#017e84] hover:underline font-medium"
              onClick={() => router.push("/crm/pipeline")}
            >
              Clear filter
            </button>
          </span>
        </div>
      ) : null}

      {/* Secondary filters — search lives in the Odoo-style control panel */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-full sm:w-[150px] h-8 rounded-sm text-sm">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                {stage.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
          <SelectTrigger className="w-full sm:w-[150px] h-8 rounded-sm text-sm">
            <SelectValue placeholder="Salesperson" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All salespeople</SelectItem>
            {salespersons.map((sp) => (
              <SelectItem key={sp.id} value={sp.id}>
                {sp.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={`${sortBy}:${sortDir}`}
          onValueChange={(v) => {
            const [by, dir] = v.split(":") as [
              "created_at" | "expected_revenue",
              "asc" | "desc",
            ];
            setSortBy(by);
            setSortDir(dir);
          }}
        >
          <SelectTrigger className="w-full sm:w-[170px] h-8 rounded-sm text-sm">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at:desc">Newest first</SelectItem>
            <SelectItem value="created_at:asc">Oldest first</SelectItem>
            <SelectItem value="expected_revenue:desc">Revenue high → low</SelectItem>
            <SelectItem value="expected_revenue:asc">Revenue low → high</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 ml-auto rounded-sm"
          disabled={isGlobalAdminView}
          title={isGlobalAdminView ? "Select an organization to manage stages" : undefined}
          onClick={() => setStageManagerOpen(true)}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Stages</span>
        </Button>
      </div>

      {loading ? (
        <CrmKanbanSkeleton />
      ) : stages.length === 0 ? (
        <CrmEmptyState
          title="No stages configured"
          description="Open Stages to set up your pipeline and start tracking opportunities."
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                opportunities={opportunities}
                onOpenOpportunity={(id) => router.push(`/crm/opportunities/${id}`)}
                onSendInquiry={(id) => {
                  if (sendingInquiryId) return;
                  setSendingInquiryId(id);
                  router.push(crmOpportunityInquiryUrl(id, "create"));
                }}
                sendingInquiryId={sendingInquiryId}
                onToggleFold={handleToggleFold}
                isGlobalAdminView={isGlobalAdminView}
                quickCreateOpen={quickCreateStageId === stage.id}
                onQuickCreateOpen={() => setQuickCreateStageId(stage.id)}
                onQuickCreateClose={() => setQuickCreateStageId(null)}
                onQuickCreateSuccess={handleQuickCreateSuccess}
                salespersons={salespersons}
                defaultSalespersonId={currentSalespersonId}
              />
            ))}
          </div>
          <DragOverlay>
            {activeOpportunity ? (
              <div className="w-[300px] opacity-90 rotate-2">
                <OpportunityCard
                  opportunity={activeOpportunity}
                  onOpen={() => {}}
                  onSendInquiry={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <CrmStageManagerDialog
        open={stageManagerOpen}
        onOpenChange={setStageManagerOpen}
        stages={stages}
        onChanged={() => {
          invalidateCrmClientCache("stages");
          void loadBoard();
        }}
      />

      <CrmLostReasonDialog
        open={lostReasonOpen}
        onOpenChange={(open) => {
          setLostReasonOpen(open);
          if (!open && pendingLostMove) {
            setOpportunities(pendingLostMove.previous);
            setPendingLostMove(null);
          }
        }}
        onConfirm={(reason) => {
          if (!pendingLostMove) return;
          const { opportunityId, stageId, previous } = pendingLostMove;
          const lostStage = stages.find((s) => s.id === stageId);
          setPendingLostMove(null);
          startTransition(async () => {
            try {
              const result = await moveCrmOpportunityStage(opportunityId, stageId, {
                lostReason: reason,
                stageName: lostStage?.name || "Lost",
              });
              if ("error" in result && result.error) {
                toast.error(result.error);
                setOpportunities(previous);
                return;
              }
              setOpportunities((prev) =>
                prev.map((o) =>
                  o.id === opportunityId
                    ? {
                        ...o,
                        stage_id:
                          "stage_id" in result && result.stage_id
                            ? String(result.stage_id)
                            : stageId,
                        stage_name: lostStage?.name ?? o.stage_name,
                        probability:
                          "probability" in result && typeof result.probability === "number"
                            ? result.probability
                            : 0,
                        lost_reason: reason,
                      }
                    : o
                )
              );
              toast.success("Marked as lost");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to mark as lost."
              );
              setOpportunities(previous);
            }
          });
        }}
      />
    </div>
  );
}
