"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Handshake } from "lucide-react";
import {
  applyNegotiationTotals,
  attachNegotiationCustomerPdf,
  getQuotationNegotiationState,
  rejectCustomerNegotiationRequest,
  saveNegotiationCounterDraft,
  type QuotationNegotiationState,
} from "@/app/actions/sales/quotation-negotiation";
import { getSalesQuotationPdfPayload } from "@/app/actions/sales/quotation-pdf";
import { generateSalesQuotationPdf } from "@/lib/sales-quotation-pdf";

type Props = {
  quotationId: string | null;
  enabled: boolean;
  onApplied?: () => void;
};

function formatMoney(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function SalesQuotationNegotiationPanel({
  quotationId,
  enabled,
  onApplied,
}: Props) {
  const [state, setState] = useState<QuotationNegotiationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [rejectMessage, setRejectMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    if (!quotationId || !enabled) {
      setState(null);
      return;
    }
    setLoading(true);
    const res = await getQuotationNegotiationState(quotationId);
    setLoading(false);
    if ("error" in res && res.error) {
      // Migration may not be applied yet — stay quiet unless there is pending UI need
      if (/020_quotation_negotiation|column|does not exist/i.test(res.error)) {
        setState(null);
        return;
      }
      toast.error(res.error);
      setState(null);
      return;
    }
    if ("negotiation" in res && res.negotiation) {
      setState(res.negotiation);
      if (res.negotiation.pendingCounterAmount != null) {
        setCounterAmount(String(res.negotiation.pendingCounterAmount));
      } else if (res.negotiation.pendingCustomerRequestAmount != null) {
        setCounterAmount(String(res.negotiation.pendingCustomerRequestAmount));
      }
      if (res.negotiation.pendingCounterMessage) {
        setCounterMessage(res.negotiation.pendingCounterMessage);
      }
    }
  }, [quotationId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!quotationId || !enabled) return null;

  const hasPendingRequest = state?.pendingCustomerRequestAmount != null;
  const hasDraftCounter = state?.pendingCounterAmount != null;
  const showPanel =
    hasPendingRequest ||
    hasDraftCounter ||
    state?.negotiationStatus === "awaiting_sales" ||
    state?.negotiationStatus === "awaiting_customer" ||
    state?.negotiationStatus === "accepted" ||
    state?.negotiationStatus === "declined";

  if (loading && !state) {
    return (
      <div className="border-b border-slate-200 bg-white px-3 py-3 flex items-center gap-2 text-sm text-secondary-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading negotiation…
      </div>
    );
  }

  if (!showPanel && !state?.canNegotiate) {
    return null;
  }

  if (!showPanel) {
    return null;
  }

  function handleSaveDraft() {
    if (!quotationId) return;
    const amount = Number(counterAmount);
    if (!(amount > 0)) {
      toast.error("Enter a valid counter-offer amount");
      return;
    }
    startTransition(async () => {
      const res = await saveNegotiationCounterDraft(
        quotationId,
        amount,
        counterMessage
      );
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("negotiation" in res && res.negotiation) {
        setState(res.negotiation);
        toast.success("Counter offer saved as draft — send to customer when ready");
      }
    });
  }

  function handleReject() {
    if (!quotationId) return;
    startTransition(async () => {
      const res = await rejectCustomerNegotiationRequest(
        quotationId,
        rejectMessage || "We are unable to meet this requested price."
      );
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("negotiation" in res && res.negotiation) {
        setState(res.negotiation);
        setRejectMessage("");
        toast.success("Negotiation request rejected");
        onApplied?.();
      }
    });
  }

  async function generateAndSend(mode: "accept_request" | "send_counter") {
    if (!quotationId) return;
    startTransition(async () => {
      try {
        const applied = await applyNegotiationTotals(quotationId, mode);
        if ("error" in applied && applied.error) {
          toast.error(applied.error);
          return;
        }

        const freshPayload = await getSalesQuotationPdfPayload(quotationId);
        if ("error" in freshPayload && freshPayload.error) {
          toast.error(
            `Totals updated but PDF failed: ${freshPayload.error}. Use Send Quotation to Customer to retry PDF.`
          );
          onApplied?.();
          return;
        }
        if (!("payload" in freshPayload) || !freshPayload.payload) {
          toast.error("Totals updated but PDF payload missing. Resend PDF manually.");
          onApplied?.();
          return;
        }

        const generated = await generateSalesQuotationPdf(freshPayload.payload, {
          silent: true,
        });
        if (!generated?.dataUrl) {
          toast.error(
            "Totals updated but PDF generation failed. Use Send Quotation to Customer to retry."
          );
          onApplied?.();
          return;
        }

        const attached = await attachNegotiationCustomerPdf(
          quotationId,
          generated.dataUrl,
          mode
        );
        if ("error" in attached && attached.error) {
          toast.error(attached.error);
          onApplied?.();
          return;
        }

        if ("negotiation" in attached && attached.negotiation) {
          setState(attached.negotiation);
        }
        toast.success(
          mode === "accept_request"
            ? "Accepted request and sent updated quotation to customer"
            : "Counter offer sent to customer"
        );
        onApplied?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to send offer");
      }
    });
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50/40">
      <div className="px-3 py-2.5 flex items-center gap-2 border-b border-amber-200/80">
        <Handshake className="h-4 w-4 text-amber-800" />
        <p className="text-sm font-semibold text-amber-950">Negotiation</p>
        {state?.negotiationStatus ? (
          <span className="ml-auto text-[11px] uppercase tracking-wide text-amber-800/80">
            {state.negotiationStatus.replace(/_/g, " ")}
          </span>
        ) : null}
      </div>

      <div className="p-3 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-sm border border-amber-200 bg-white px-2.5 py-2">
            <div className="text-secondary-muted">Current offer</div>
            <div className="font-semibold text-[#017e84] tabular-nums">
              {formatMoney(state?.totalAmount)}
            </div>
          </div>
          <div className="rounded-sm border border-amber-200 bg-white px-2.5 py-2">
            <div className="text-secondary-muted">Original offer</div>
            <div className="font-semibold tabular-nums">
              {formatMoney(state?.originalOfferAmount ?? state?.totalAmount)}
            </div>
          </div>
        </div>

        {hasPendingRequest ? (
          <div className="rounded-sm border border-violet-200 bg-violet-50 px-2.5 py-2 space-y-1">
            <p className="font-semibold text-violet-950">
              Customer requested price revision
            </p>
            <p className="text-violet-900">
              Current: {formatMoney(state?.totalAmount)} → Requested:{" "}
              <span className="font-semibold">
                {formatMoney(state?.pendingCustomerRequestAmount)}
              </span>
            </p>
            {state?.pendingCustomerRequestMessage ? (
              <p className="text-violet-800/90 italic">
                “{state.pendingCustomerRequestMessage}”
              </p>
            ) : null}
          </div>
        ) : null}

        {state?.negotiationStatus === "accepted" ? (
          <p className="text-emerald-800 font-medium">
            Customer accepted {formatMoney(state.totalAmount)}.
          </p>
        ) : null}

        {state?.negotiationStatus === "declined" ? (
          <p className="text-red-700 font-medium">Customer declined this quotation.</p>
        ) : null}

        {hasPendingRequest && state?.canNegotiate ? (
          <div className="space-y-2 rounded-sm border border-slate-200 bg-white p-2.5">
            <p className="text-xs font-semibold text-slate-700">Respond</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[11px] text-secondary-muted">
                  Counter offer amount
                </label>
                <Input
                  className="h-8 rounded-sm mt-1"
                  inputMode="decimal"
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  placeholder="e.g. 1700"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] text-secondary-muted">Message</label>
                <Textarea
                  className="mt-1 rounded-sm"
                  rows={2}
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  placeholder="We can offer … as our best possible rate."
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 bg-[#017e84] hover:bg-[#016970] text-white"
                disabled={isPending}
                onClick={() => void generateAndSend("accept_request")}
              >
                Accept requested amount
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={isPending}
                onClick={handleSaveDraft}
              >
                Save counter draft
              </Button>
              {hasDraftCounter ? (
                <Button
                  size="sm"
                  className="h-8 bg-amber-700 hover:bg-amber-800 text-white"
                  disabled={isPending}
                  onClick={() => void generateAndSend("send_counter")}
                >
                  Send Counter Offer to Customer
                </Button>
              ) : null}
            </div>

            <div className="border-t border-slate-100 pt-2 space-y-2">
              <Textarea
                className="rounded-sm"
                rows={2}
                value={rejectMessage}
                onChange={(e) => setRejectMessage(e.target.value)}
                placeholder="Optional rejection message"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-red-700 border-red-200"
                disabled={isPending}
                onClick={handleReject}
              >
                Reject request
              </Button>
            </div>
          </div>
        ) : null}

        {!hasPendingRequest && hasDraftCounter && state?.canNegotiate ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">
              Draft counter: {formatMoney(state.pendingCounterAmount)}
              {state.pendingCounterMessage
                ? ` — “${state.pendingCounterMessage}”`
                : ""}
            </p>
            <Button
              size="sm"
              className="h-8 bg-amber-700 hover:bg-amber-800 text-white"
              disabled={isPending}
              onClick={() => void generateAndSend("send_counter")}
            >
              Send Counter Offer to Customer
            </Button>
          </div>
        ) : null}

        {isPending ? (
          <div className="flex items-center gap-2 text-xs text-secondary-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Working…
          </div>
        ) : null}
      </div>
    </div>
  );
}
