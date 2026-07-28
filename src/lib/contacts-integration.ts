/**
 * Integration hooks for Contacts ↔ CRM / Sales / Meetings / Documents.
 */

export type ContactSmartButtonKey =
  | "opportunities"
  | "sales"
  | "meetings"
  | "tasks"
  | "documents";

export type ContactSmartButtonDef = {
  key: ContactSmartButtonKey;
  label: string;
  /** Placeholder until backend modules are connected. */
  placeholderCount: number;
};

export const CONTACT_SMART_BUTTONS: ContactSmartButtonDef[] = [
  { key: "opportunities", label: "Opportunities", placeholderCount: 0 },
  { key: "sales", label: "Sales", placeholderCount: 0 },
  { key: "meetings", label: "Meetings", placeholderCount: 0 },
  { key: "tasks", label: "Tasks", placeholderCount: 0 },
  { key: "documents", label: "Documents", placeholderCount: 0 },
];

export type ContactSmartButtonCounts = Partial<Record<ContactSmartButtonKey, number>>;

export function contactSmartButtonHref(
  key: ContactSmartButtonKey,
  contactId: string,
  opts?: { documentsBasePath?: string }
): string | null {
  const id = encodeURIComponent(contactId);
  switch (key) {
    case "opportunities":
      return `/crm/pipeline?contactId=${id}`;
    case "sales":
      return `/sales/quotations?contactId=${id}`;
    case "meetings":
      return `/crm/activities?contactId=${id}&activityType=meetings`;
    case "tasks":
      return `/crm/activities?contactId=${id}&activityType=tasks`;
    case "documents":
      return opts?.documentsBasePath
        ? `${opts.documentsBasePath}?related=documents`
        : null;
    default:
      return null;
  }
}
