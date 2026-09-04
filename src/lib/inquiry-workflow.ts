/**
 * Shared Sales → Operations → Admin → Quotation inquiry workflow.
 * Stored on `lead_inquiries.approval_status` and derived for legacy rows.
 */

export type InquiryApprovalStatus =
  | "draft"
  | "sent"
  | "sent_to_admin"
  | "approved"
  | "rejected";

export type InquiryWorkflowStatusKey =
  | "send_to_operation"
  | "send_to_admin"
  | "ready_for_quotation"
  | "rejected"
  | "draft";

export const INQUIRY_WORKFLOW_LABELS: Record<
  Exclude<InquiryWorkflowStatusKey, "draft">,
  string
> = {
  send_to_operation: "Send to Operation",
  send_to_admin: "Send to Admin",
  ready_for_quotation: "Ready for Quotation",
  rejected: "Rejected",
};

export const INQUIRY_APPROVAL_STATUS_LABELS: Record<InquiryApprovalStatus, string> = {
  draft: "Draft",
  sent: INQUIRY_WORKFLOW_LABELS.send_to_operation,
  sent_to_admin: INQUIRY_WORKFLOW_LABELS.send_to_admin,
  approved: INQUIRY_WORKFLOW_LABELS.ready_for_quotation,
  rejected: INQUIRY_WORKFLOW_LABELS.rejected,
};

export type InquiryConfirmationStatusLite = {
  status?: string | null;
  created_at?: string | null;
};

export type InquiryWorkflowInput = {
  sent_to_accounting?: boolean | null;
  approval_status?: string | null;
  confirmations?: InquiryConfirmationStatusLite[] | null;
};

export type InquiryWorkflowStatus = {
  key: InquiryWorkflowStatusKey;
  label: string;
  approvalStatus: InquiryApprovalStatus;
  isReadyForQuotation: boolean;
};

function latestConfirmation(
  confirmations: InquiryConfirmationStatusLite[] | null | undefined
): InquiryConfirmationStatusLite | null {
  if (!Array.isArray(confirmations) || confirmations.length === 0) return null;
  return [...confirmations].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  })[0];
}

function normalizeApprovalStatus(raw: string | null | undefined): InquiryApprovalStatus | null {
  const value = String(raw || "").trim().toLowerCase();
  if (
    value === "draft" ||
    value === "sent" ||
    value === "sent_to_admin" ||
    value === "approved" ||
    value === "rejected"
  ) {
    return value;
  }
  return null;
}

/**
 * Resolve display workflow from the stored approval_status, with confirmation
 * fallback so inquiries created before `sent_to_admin` still show correctly.
 */
export function resolveInquiryWorkflowStatus(
  input: InquiryWorkflowInput
): InquiryWorkflowStatus {
  const stored = normalizeApprovalStatus(input.approval_status);
  const latest = latestConfirmation(input.confirmations);
  const latestStatus = String(latest?.status || "").trim().toLowerCase();
  const hasApprovedConfirmation =
    latestStatus === "approved" ||
    (input.confirmations || []).some((c) => String(c.status || "").toLowerCase() === "approved");
  const hasPendingConfirmation =
    latestStatus === "pending" ||
    (input.confirmations || []).some((c) => String(c.status || "").toLowerCase() === "pending");
  const hasRejectedConfirmation = latestStatus === "rejected";

  if (stored === "rejected" || (hasRejectedConfirmation && !hasApprovedConfirmation && !hasPendingConfirmation)) {
    return {
      key: "rejected",
      label: INQUIRY_WORKFLOW_LABELS.rejected,
      approvalStatus: "rejected",
      isReadyForQuotation: false,
    };
  }

  if (stored === "approved" || hasApprovedConfirmation) {
    return {
      key: "ready_for_quotation",
      label: INQUIRY_WORKFLOW_LABELS.ready_for_quotation,
      approvalStatus: "approved",
      isReadyForQuotation: true,
    };
  }

  if (stored === "sent_to_admin" || hasPendingConfirmation) {
    return {
      key: "send_to_admin",
      label: INQUIRY_WORKFLOW_LABELS.send_to_admin,
      approvalStatus: "sent_to_admin",
      isReadyForQuotation: false,
    };
  }

  if (input.sent_to_accounting || stored === "sent") {
    return {
      key: "send_to_operation",
      label: INQUIRY_WORKFLOW_LABELS.send_to_operation,
      approvalStatus: "sent",
      isReadyForQuotation: false,
    };
  }

  return {
    key: "draft",
    label: "Draft",
    approvalStatus: "draft",
    isReadyForQuotation: false,
  };
}

export function inquiryQuotationHref(inquiryId: string): string {
  return `/sales/quotations/new?inquiryId=${encodeURIComponent(inquiryId)}`;
}

export function inquiryDetailsHref(inquiryId: string): string {
  return `/crm/inquiries/${encodeURIComponent(inquiryId)}`;
}

export function buildInquiryQuotationDescription(input: {
  productName?: string | null;
  quantity?: string | null;
  totalWeight?: string | null;
  cbm?: string | null;
  description?: string | null;
  hsCode?: string | null;
  uom?: string | null;
  specifications?: string | null;
  operationsDescription?: string | null;
}): string {
  const lines: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const trimmed = String(value || "").trim();
    if (trimmed) lines.push(`${label}: ${trimmed}`);
  };

  push("Product", input.productName);
  push("Quantity", input.quantity);
  push("Weight (kg)", input.totalWeight);
  push("CBM", input.cbm);
  push("UOM", input.uom);
  push("HS Code", input.hsCode);
  push("Specifications", input.specifications);

  const description = String(input.description || "").trim();
  if (description) {
    lines.push(`Description: ${description}`);
  }

  const operations = String(input.operationsDescription || "").trim();
  if (operations) {
    lines.push(`Operations notes: ${operations}`);
  }

  return lines.join("\n");
}
