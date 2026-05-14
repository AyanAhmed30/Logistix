/** Shapes used by `getLoadingInstructionsForUser` and the user Loading Instructions panel. */

export type LoadingInstructionPdfConsole = {
  id: string;
  console_number: string;
  container_number: string | null;
  date?: string | null;
  bl_number?: string | null;
  carrier?: string | null;
  so?: string | null;
  total_cartons?: number | null;
  total_cbm?: number | null;
};

export type LoadingInstructionPdfCarton = {
  id: string;
  carton_serial_number: string;
  carton_index: number;
  scan_token: string | null;
  tracking_id?: string | null;
  sticker_identifier?: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimension_unit: string | null;
};

export type LoadingInstructionPdfOrder = {
  id: string;
  shipping_mark: string;
  destination_country: string;
  total_cartons: number;
  item_description: string | null;
  cartons: LoadingInstructionPdfCarton[];
};
