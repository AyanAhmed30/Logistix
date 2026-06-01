const STORAGE_KEY = "logistix-warehouse-return-console";

export type WarehouseReturnMode = {
  consoleId: string;
  consoleNumber: string;
};

export function getWarehouseReturnMode(): WarehouseReturnMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WarehouseReturnMode;
  } catch {
    return null;
  }
}

export function setWarehouseReturnMode(mode: WarehouseReturnMode | null) {
  if (typeof window === "undefined") return;
  if (!mode) {
    sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("logistix-return-mode-changed"));
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(mode));
  window.dispatchEvent(new CustomEvent("logistix-return-mode-changed"));
}

export const WAREHOUSE_RETURN_MODE_EVENT = "logistix-return-mode-changed";
