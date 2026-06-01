export type LoadingPhase = "open" | "full_reported" | "space_available" | "closed";

export type ConsoleOrderAssignmentStatus = "active" | "released" | "fully_loaded";

export type ScanMode = "inward" | "outward" | "return";

export type LoadingConsoleMeta = {
  id: string;
  console_number: string;
  container_number: string | null;
  loading_phase: LoadingPhase | null;
  status: string;
};

export const LOADING_PHASE_LABELS: Record<LoadingPhase, string> = {
  open: "Open for loading",
  full_reported: "Container full reported",
  space_available: "Space available",
  closed: "Loading closed",
};
