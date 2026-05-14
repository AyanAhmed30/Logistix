import jsPDF from "jspdf";
import QRCode from "qrcode";
import { buildOutwardScanUrl } from "@/lib/scan-sticker-url";

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

/** Helvetica / WinAnsi: avoid mojibake from bullets, arrows, em dashes, etc. */
function pdfPlainText(s: unknown): string {
  const raw = String(s ?? "").trim() || "-";
  let out = "";
  for (const ch of raw) {
    const c = ch.charCodeAt(0);
    out += c <= 255 ? ch : "?";
  }
  return out || "-";
}

function fmtDim(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return String(n);
}

async function loadLogoForPdf(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (typeof fetch === "undefined") return null;
  try {
    const res = await fetch("/logo.jpg");
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("read"));
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = dataUrl;
    });
    if (!dims.width || !dims.height) return null;
    return { dataUrl, width: dims.width, height: dims.height };
  } catch {
    return null;
  }
}

async function qrPngDataUrl(scanUrl: string): Promise<string> {
  return QRCode.toDataURL(scanUrl, {
    width: 600,
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

/** Same 101x152 mm sticker layout as `BookOrderModal` / `appendOrderToPdf`, with outward scan URL in the QR. */
async function appendStickerPage(
  pdf: InstanceType<typeof jsPDF>,
  opts: {
    isFirstPage: boolean;
    logo: { dataUrl: string; width: number; height: number } | null;
    consoleNumber: string;
    order: LoadingInstructionPdfOrder;
    carton: LoadingInstructionPdfCarton;
    cartonPosition: number;
    outwardScanUrl: string;
  }
): Promise<void> {
  const { isFirstPage, logo, consoleNumber, order, carton, cartonPosition, outwardScanUrl } = opts;
  if (!isFirstPage) {
    pdf.addPage([101, 152], "p");
  }

  pdf.setFont("helvetica", "normal");
  pdf.setLineWidth(0.2);
  pdf.rect(6, 6, 89, 140);

  if (logo) {
    const maxLogoWidth = 60;
    const maxLogoHeight = 16;
    const scale = Math.min(maxLogoWidth / logo.width, maxLogoHeight / logo.height);
    const logoWidth = logo.width * scale;
    const logoHeight = logo.height * scale;
    const logoX = (101 - logoWidth) / 2;
    const logoY = 10;
    pdf.addImage(logo.dataUrl, "PNG", logoX, logoY, logoWidth, logoHeight);
  }

  const startY = 30;
  const boxLeft = 10;
  const boxWidth = 81;
  const rowHeight = 14;

  pdf.setFontSize(8);
  pdf.text(pdfPlainText(`Loading console: ${consoleNumber}`), boxLeft + 2, startY - 2);

  pdf.setFontSize(9);
  pdf.rect(boxLeft, startY, boxWidth, rowHeight);
  pdf.text("Item Description:", boxLeft + 2, startY + 6);
  pdf.text(pdfPlainText(order.item_description), boxLeft + 2, startY + 11);

  pdf.rect(boxLeft, startY + rowHeight, boxWidth, rowHeight);
  pdf.text("Shipping Mark:", boxLeft + 2, startY + rowHeight + 6);
  pdf.text(pdfPlainText(order.shipping_mark), boxLeft + 2, startY + rowHeight + 11);

  pdf.rect(boxLeft, startY + rowHeight * 2, boxWidth, rowHeight);
  pdf.text("Carton Serial No:", boxLeft + 2, startY + rowHeight * 2 + 6);
  pdf.text(pdfPlainText(carton.carton_serial_number), boxLeft + 2, startY + rowHeight * 2 + 11);

  pdf.rect(boxLeft, startY + rowHeight * 3, boxWidth / 2, rowHeight);
  pdf.rect(boxLeft + boxWidth / 2, startY + rowHeight * 3, boxWidth / 2, rowHeight);
  pdf.text("TotalWeight:", boxLeft + 2, startY + rowHeight * 3 + 6);
  pdf.text(pdfPlainText(carton.weight != null ? String(carton.weight) : "-"), boxLeft + 2, startY + rowHeight * 3 + 11);
  pdf.text("Dimensions:", boxLeft + boxWidth / 2 + 2, startY + rowHeight * 3 + 6);
  pdf.text(
    `${fmtDim(carton.length)} x ${fmtDim(carton.width)} x ${fmtDim(carton.height)}`,
    boxLeft + boxWidth / 2 + 2,
    startY + rowHeight * 3 + 11
  );

  pdf.rect(boxLeft, startY + rowHeight * 4, boxWidth, rowHeight);
  pdf.text("Destination Country:", boxLeft + 2, startY + rowHeight * 4 + 6);
  pdf.text(pdfPlainText(order.destination_country), boxLeft + 2, startY + rowHeight * 4 + 11);

  pdf.rect(boxLeft, startY + rowHeight * 5, boxWidth, rowHeight);
  pdf.text("Total Cartons:", boxLeft + 2, startY + rowHeight * 5 + 6);
  pdf.text(`${order.total_cartons}-${cartonPosition}`, boxLeft + 2, startY + rowHeight * 5 + 11);

  const qrCodeDataUrl = await qrPngDataUrl(outwardScanUrl);
  if (qrCodeDataUrl) {
    pdf.addImage(qrCodeDataUrl, "PNG", 28, 108, 44, 44);
  }

  const trackingId =
    (typeof carton.tracking_id === "string" && carton.tracking_id) ||
    `TRK-${String(carton.carton_serial_number)}`;
  const stickerId =
    (typeof carton.sticker_identifier === "string" && carton.sticker_identifier) ||
    String(carton.carton_serial_number);

  pdf.setFontSize(7);
  pdf.text(`Tracking: ${pdfPlainText(trackingId)}`, 10, 106);
  pdf.text(`QR ID: ${pdfPlainText(stickerId)}`, 10, 110);
  pdf.setFontSize(6);
  pdf.text("Outward load scan (same sticker; URL in QR)", 10, 115);
}

export async function downloadLoadingInstructionPdf(args: {
  console: LoadingInstructionPdfConsole;
  orders: LoadingInstructionPdfOrder[];
}): Promise<void> {
  const { console: cons, orders } = args;
  const logo = await loadLogoForPdf();

  type FlatRow = { order: LoadingInstructionPdfOrder; carton: LoadingInstructionPdfCarton; pos: number };
  const flat: FlatRow[] = [];
  for (const o of orders) {
    const sorted = [...o.cartons].sort((a, b) => (a.carton_index ?? 0) - (b.carton_index ?? 0));
    sorted.forEach((carton, idx) => {
      flat.push({ order: o, carton, pos: idx + 1 });
    });
  }

  if (flat.length === 0) {
    throw new Error("No cartons to print");
  }

  const pdf = new jsPDF({ unit: "mm", format: [101, 152], orientation: "portrait" });
  const consoleNumber = pdfPlainText(cons.console_number);

  for (let i = 0; i < flat.length; i += 1) {
    const { order, carton, pos } = flat[i];
    const scanId = (carton.scan_token || carton.carton_serial_number || "").trim();
    if (!scanId) {
      throw new Error(`Missing scan token for carton ${carton.carton_serial_number}`);
    }
    const outwardScanUrl = buildOutwardScanUrl(scanId, cons.id);
    await appendStickerPage(pdf, {
      isFirstPage: i === 0,
      logo,
      consoleNumber,
      order,
      carton,
      cartonPosition: pos,
      outwardScanUrl,
    });
  }

  const safe = pdfPlainText(cons.console_number || "console").replace(/[^\w.-]+/g, "_");
  pdf.save(`loading-stickers-${safe}.pdf`);
}
