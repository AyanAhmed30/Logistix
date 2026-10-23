/**
 * Shared Sales → Operations → Admin → Quotation inquiry workflow.
 * Stored on `lead_inquiries.approval_status` and derived for legacy rows.
 * Calculation origin comes from inquiry_confirmations.submitted_by_role.
 */

export type InquiryApprovalStatus =
  | "draft"
  | "sent"
  | "sent_to_admin"
  | "calculated_by_admin"
  | "approved"
  | "rejected";

export type InquiryWorkflowStatusKey =
  | "send_to_operation"
  | "send_to_admin"
  | "calculated_by_admin"
  | "ready_for_quotation"
  | "rejected"
  | "draft";

export type CalculationSubmitterRole = "operations" | "admin";

export const INQUIRY_WORKFLOW_LABELS: Record<
  Exclude<InquiryWorkflowStatusKey, "draft">,
  string
> = {
  send_to_operation: "Sent to Operations",
  send_to_admin: "Sent to Admin",
  calculated_by_admin: "Calculated by Admin",
  ready_for_quotation: "Approved by Admin",
  rejected: "Rejected by Admin",
};

export const INQUIRY_APPROVAL_STATUS_LABELS: Record<InquiryApprovalStatus, string> = {
  draft: "Draft",
  sent: INQUIRY_WORKFLOW_LABELS.send_to_operation,
  sent_to_admin: INQUIRY_WORKFLOW_LABELS.send_to_admin,
  calculated_by_admin: INQUIRY_WORKFLOW_LABELS.calculated_by_admin,
  approved: INQUIRY_WORKFLOW_LABELS.ready_for_quotation,
  rejected: INQUIRY_WORKFLOW_LABELS.rejected,
};

export type InquiryConfirmationStatusLite = {
  status?: string | null;
  created_at?: string | null;
  submitted_by_role?: string | null;
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
  calculatedByAdmin: boolean;
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
    value === "calculated_by_admin" ||
    value === "approved" ||
    value === "rejected"
  ) {
    return value;
  }
  return null;
}

function normalizeSubmitterRole(raw: string | null | undefined): CalculationSubmitterRole | null {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "admin" || value === "operations") return value;
  return null;
}

/** True when the latest meaningful confirmation was submitted by Admin. */
export function wasCalculatedByAdmin(
  confirmations: InquiryConfirmationStatusLite[] | null | undefined,
  approvalStatus?: string | null
): boolean {
  if (normalizeApprovalStatus(approvalStatus) === "calculated_by_admin") {
    return true;
  }
  const latest = latestConfirmation(confirmations);
  if (!latest) return false;
  return normalizeSubmitterRole(latest.submitted_by_role) === "admin";
}

export function formatInquiryApprovalDisplayLabel(input: {
  approvalStatus: InquiryApprovalStatus;
  calculatedByAdmin?: boolean;
}): string {
  const { approvalStatus, calculatedByAdmin } = input;
  if (approvalStatus === "approved") {
    return calculatedByAdmin
      ? "Approved by Admin — Calculated by Admin"
      : INQUIRY_WORKFLOW_LABELS.ready_for_quotation;
  }
  if (approvalStatus === "rejected") {
    return calculatedByAdmin
      ? "Rejected by Admin — Calculated by Admin"
      : INQUIRY_WORKFLOW_LABELS.rejected;
  }
  if (approvalStatus === "calculated_by_admin") {
    return INQUIRY_WORKFLOW_LABELS.calculated_by_admin;
  }
  return INQUIRY_APPROVAL_STATUS_LABELS[approvalStatus] || approvalStatus;
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
  const calculatedByAdmin = wasCalculatedByAdmin(input.confirmations, input.approval_status);
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
      label: formatInquiryApprovalDisplayLabel({
        approvalStatus: "rejected",
        calculatedByAdmin,
      }),
      approvalStatus: "rejected",
      isReadyForQuotation: false,
      calculatedByAdmin,
    };
  }

  if (stored === "approved" || hasApprovedConfirmation) {
    return {
      key: "ready_for_quotation",
      label: formatInquiryApprovalDisplayLabel({
        approvalStatus: "approved",
        calculatedByAdmin,
      }),
      approvalStatus: "approved",
      isReadyForQuotation: true,
      calculatedByAdmin,
    };
  }

  if (
    stored === "calculated_by_admin" ||
    (hasPendingConfirmation && calculatedByAdmin)
  ) {
    return {
      key: "calculated_by_admin",
      label: INQUIRY_WORKFLOW_LABELS.calculated_by_admin,
      approvalStatus: "calculated_by_admin",
      isReadyForQuotation: false,
      calculatedByAdmin: true,
    };
  }

  if (stored === "sent_to_admin" || hasPendingConfirmation) {
    return {
      key: "send_to_admin",
      label: INQUIRY_WORKFLOW_LABELS.send_to_admin,
      approvalStatus: "sent_to_admin",
      isReadyForQuotation: false,
      calculatedByAdmin: false,
    };
  }

  if (input.sent_to_accounting || stored === "sent") {
    return {
      key: "send_to_operation",
      label: INQUIRY_WORKFLOW_LABELS.send_to_operation,
      approvalStatus: "sent",
      isReadyForQuotation: false,
      calculatedByAdmin: false,
    };
  }

  return {
    key: "draft",
    label: "Draft",
    approvalStatus: "draft",
    isReadyForQuotation: false,
    calculatedByAdmin: false,
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
  return String(input.productName || "").trim();
}
