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
  /** When true, click shows Coming Soon instead of navigating. */
  comingSoon?: boolean;
};

export const CONTACT_SMART_BUTTONS: ContactSmartButtonDef[] = [
  { key: "opportunities", label: "Opportunities", placeholderCount: 0 },
  { key: "sales", label: "Sales", placeholderCount: 0, comingSoon: true },
  { key: "meetings", label: "Meetings", placeholderCount: 0, comingSoon: true },
  { key: "tasks", label: "Tasks", placeholderCount: 0, comingSoon: true },
  { key: "documents", label: "Documents", placeholderCount: 0, comingSoon: true },
];

export type ContactSmartButtonCounts = Partial<Record<ContactSmartButtonKey, number>>;
