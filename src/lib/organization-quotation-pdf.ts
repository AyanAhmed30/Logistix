import type { OrganizationQuotationLineItem } from "@/lib/organization-quotation";
import { splitQuotationItemDescription } from "@/lib/organization-quotation";
import { LOGISTIX_LOGO_PATH } from "@/lib/logistix-logo";

export type OrganizationQuotationPdfData = {
  organization: {
    name: string;
    logoUrl?: string | null;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    taxNumber?: string;
  };
  customer: {
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    postalCode?: string;
    taxNumber?: string;
  } | null;
  quotationNumber: string;
  quotationDate: string;
  expiryDate?: string;
  reference?: string;
  lineItems: OrganizationQuotationLineItem[];
  grossTotal: number;
  discountPercent?: number;
  discountTotal: number;
  salesTaxPercent?: number;
  taxTotal: number;
  grandTotal: number;
  notes?: string;
  terms?: string;
};

const COLORS = {
  charcoal: [33, 37, 41] as [number, number, number],
  muted: [108, 117, 125] as [number, number, number],
  border: [222, 226, 230] as [number, number, number],
  surface: [248, 249, 250] as [number, number, number],
  tableHeader: [241, 243, 245] as [number, number, number],
  zebra: [252, 252, 253] as [number, number, number],
  accent: [15, 76, 92] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const PAGE = {
  format: "a4" as const,
  margin: 14,
  footerHeight: 20,
};

const BASE_FONT = {
  docTitle: 22,
  metaValue: 10.5,
  metaLabel: 9,
  companyName: 15,
  companyDetail: 10,
  sectionLabel: 9,
  label: 10,
  body: 10.5,
  tableHeader: 9.5,
  tableBody: 10,
  notesTitle: 10,
  notesBody: 10,
  totalLabel: 10,
  totalValue: 10,
  grandTotalLabel: 12,
  grandTotalValue: 13,
  footer: 8.5,
  footerTagline: 8,
};

const BASE_LAYOUT = {
  lineHeight: 5.2,
  sectionGap: 7,
  cardPadding: 5,
  tableRowPad: 4.5,
  tableHeaderHeight: 12,
  logoSize: 26,
  minLineGap: 1.5,
};

type PdfMetrics = {
  font: typeof BASE_FONT;
  layout: typeof BASE_LAYOUT;
};

function buildMetrics(scale: number): PdfMetrics {
  const s = (value: number) => value * scale;
  return {
    font: {
      docTitle: s(BASE_FONT.docTitle),
      metaValue: s(BASE_FONT.metaValue),
      metaLabel: s(BASE_FONT.metaLabel),
      companyName: s(BASE_FONT.companyName),
      companyDetail: s(BASE_FONT.companyDetail),
      sectionLabel: s(BASE_FONT.sectionLabel),
      label: s(BASE_FONT.label),
      body: s(BASE_FONT.body),
      tableHeader: s(BASE_FONT.tableHeader),
      tableBody: s(BASE_FONT.tableBody),
      notesTitle: s(BASE_FONT.notesTitle),
      notesBody: s(BASE_FONT.notesBody),
      totalLabel: s(BASE_FONT.totalLabel),
      totalValue: s(BASE_FONT.totalValue),
      grandTotalLabel: s(BASE_FONT.grandTotalLabel),
      grandTotalValue: s(BASE_FONT.grandTotalValue),
      footer: s(BASE_FONT.footer),
      footerTagline: s(BASE_FONT.footerTagline),
    },
    layout: {
      lineHeight: s(BASE_LAYOUT.lineHeight),
      sectionGap: s(BASE_LAYOUT.sectionGap),
      cardPadding: s(BASE_LAYOUT.cardPadding),
      tableRowPad: s(BASE_LAYOUT.tableRowPad),
      tableHeaderHeight: s(BASE_LAYOUT.tableHeaderHeight),
      logoSize: s(BASE_LAYOUT.logoSize),
      minLineGap: s(BASE_LAYOUT.minLineGap),
    },
  };
}

type InfoField = { label: string; value: string };

function measureWrappedLines(
  doc: import("jspdf").jsPDF,
  text: string,
  maxWidth: number,
  fontSize: number,
  fontStyle: "normal" | "bold" = "normal"
) {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function lineHeightFor(fontSize: number, layout: PdfMetrics["layout"]) {
  return Math.max(layout.lineHeight, fontSize * 0.45);
}

function measureContentHeight(
  doc: import("jspdf").jsPDF,
  data: OrganizationQuotationPdfData,
  metrics: PdfMetrics,
  contentWidth: number,
  contentLeft: number,
  contentRight: number,
  hasLogo: boolean
) {
  const { font: FONT, layout: LAYOUT } = metrics;
  const tableColumns = buildTableColumns(contentLeft, contentRight);
  const companyTextX = hasLogo ? contentLeft + LAYOUT.logoSize + 5 : contentLeft;
  const companyTextWidth = Math.max(70, contentRight - companyTextX - 38);

  let height = PAGE.margin;

  const companyNameLines = measureWrappedLines(
    doc,
    data.organization.name || "Company",
    companyTextWidth,
    FONT.companyName,
    "bold"
  );
  let companyHeight =
    6 +
    companyNameLines.length * lineHeightFor(FONT.companyName, LAYOUT) +
    LAYOUT.minLineGap;

  const companyLines = [
    data.organization.phone ? `Tel: ${data.organization.phone}` : "",
    data.organization.email ? `Email: ${data.organization.email}` : "",
    data.organization.address || "",
    data.organization.taxNumber ? `NTN: ${data.organization.taxNumber}` : "",
  ].filter(Boolean);

  for (const line of companyLines) {
    companyHeight +=
      measureWrappedLines(doc, line, companyTextWidth, FONT.companyDetail).length *
      lineHeightFor(FONT.companyDetail, LAYOUT);
  }

  height += Math.max(companyHeight, LAYOUT.logoSize) + LAYOUT.sectionGap;

  const metaFields: InfoField[] = [
    { label: "RFQ Number", value: displayValue(data.reference) },
    { label: "Quotation No.", value: displayQuotationNumber(data.quotationNumber) },
    { label: "Date", value: formatDisplayDate(data.quotationDate) },
  ];
  if (data.expiryDate) {
    metaFields.push({ label: "Valid Until", value: formatDisplayDate(data.expiryDate) });
  }

  const colWidth = contentWidth / metaFields.length;
  const measureHorizontalRow = (fields: InfoField[], isHeader: boolean) => {
    const fontSize = isHeader ? FONT.tableHeader : FONT.body;
    let maxLines = 1;
    for (const field of fields) {
      const text = isHeader ? field.label : field.value;
      maxLines = Math.max(
        maxLines,
        measureWrappedLines(doc, text, colWidth - 4, fontSize, isHeader ? "bold" : "normal").length
      );
    }
    return maxLines * lineHeightFor(fontSize, LAYOUT) + LAYOUT.tableRowPad * 2;
  };
  height += measureHorizontalRow(metaFields, true) + measureHorizontalRow(metaFields, false) + LAYOUT.sectionGap;

  const billToFields = data.customer ? buildBillToFields(data.customer) : [];
  if (billToFields.length > 0) {
    height += 5;
    height += measureHorizontalRow(billToFields, true) + measureHorizontalRow(billToFields, false) + LAYOUT.sectionGap;
  }

  height += LAYOUT.tableHeaderHeight;
  for (const item of data.lineItems) {
    const { item: itemName, description: itemDescription } = splitLineItem(item);
    const itemLines = measureWrappedLines(doc, itemName, tableColumns[0].width - 4, FONT.tableBody);
    const descriptionLines = measureWrappedLines(
      doc,
      itemDescription,
      tableColumns[1].width - 4,
      FONT.tableBody
    );
    const rowTextLines = Math.max(itemLines.length, descriptionLines.length, 1);
    height += rowTextLines * lineHeightFor(FONT.tableBody, LAYOUT) + LAYOUT.tableRowPad * 2;
  }

  height += LAYOUT.sectionGap;

  const notesBlocks: Array<{ label: string; value: string }> = [];
  if (data.notes?.trim()) notesBlocks.push({ label: "Payment Terms", value: data.notes.trim() });
  if (data.terms?.trim()) notesBlocks.push({ label: "Terms & Conditions", value: data.terms.trim() });

  const totalsFields: InfoField[] = [
    { label: "Gross Total", value: formatAmount(data.grossTotal) },
    {
      label: `Sales Tax (${(data.salesTaxPercent || 0).toFixed(2)}%)`,
      value: formatAmount(data.taxTotal),
    },
    {
      label: `Document Discount (${(data.discountPercent || 0).toFixed(2)}%)`,
      value: `-${formatAmount(data.discountTotal)}`,
      hide: (data.discountPercent || 0) <= 0 && data.discountTotal <= 0,
    },
  ]
    .filter((row) => !("hide" in row && row.hide))
    .map(({ label, value }) => ({ label, value }));
  totalsFields.push({ label: "Grand Total", value: formatAmount(data.grandTotal) });

  height +=
    measureHorizontalRow(totalsFields, true) +
    measureHorizontalRow(totalsFields, false) +
    LAYOUT.sectionGap;

  const notesTextWidth = contentWidth - LAYOUT.cardPadding * 2;
  let notesHeight = 0;
  if (notesBlocks.length > 0) {
    notesHeight = LAYOUT.cardPadding + 6;
    for (const block of notesBlocks) {
      notesHeight += lineHeightFor(FONT.notesTitle, LAYOUT) + LAYOUT.minLineGap;
      notesHeight +=
        measureWrappedLines(doc, block.value, notesTextWidth, FONT.notesBody).length *
        lineHeightFor(FONT.notesBody, LAYOUT);
      notesHeight += 3;
    }
    notesHeight += LAYOUT.cardPadding;
  }

  height += notesHeight + LAYOUT.sectionGap + PAGE.footerHeight;
  return height;
}

function resolveSinglePageScale(
  doc: import("jspdf").jsPDF,
  data: OrganizationQuotationPdfData,
  pageHeight: number,
  contentWidth: number,
  contentLeft: number,
  contentRight: number,
  hasLogo: boolean
) {
  const maxHeight = pageHeight;
  let scale = 1;
  while (scale >= 0.55) {
    const metrics = buildMetrics(scale);
    if (measureContentHeight(doc, data, metrics, contentWidth, contentLeft, contentRight, hasLogo) <= maxHeight) {
      return scale;
    }
    scale -= 0.025;
  }
  return 0.55;
}

type TableColumn = {
  key: string;
  label: string;
  x: number;
  width: number;
  align: "left" | "right" | "center";
};

function formatAmount(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDisplayDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatQuantity(value: string): string {
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return value || "0.00";
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function splitLineItem(item: OrganizationQuotationLineItem) {
  const split = splitQuotationItemDescription(item.description);
  return {
    item: split.item || "—",
    description: split.description || "—",
  };
}

function displayValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function formatCustomerAddress(customer: NonNullable<OrganizationQuotationPdfData["customer"]>) {
  const parts = [customer.address, customer.city, customer.country, customer.postalCode].filter((part) =>
    Boolean(part?.trim())
  );
  return parts.length > 0 ? parts.join(", ") : "—";
}

function buildBillToFields(customer: NonNullable<OrganizationQuotationPdfData["customer"]>): InfoField[] {
  return [
    { label: "Customer Name", value: displayValue(customer.name) },
    { label: "Company", value: displayValue(customer.company) },
    { label: "Phone", value: displayValue(customer.phone) },
    { label: "Email", value: displayValue(customer.email) },
    { label: "Address", value: formatCustomerAddress(customer) },
  ];
}

function displayQuotationNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "Auto-generated") return "—";
  return trimmed;
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" | null {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
    return "JPEG";
  }
  return null;
}

function buildFileName(quotationNumber: string): string {
  const safeNumber = quotationNumber.replace(/[^\w-]+/g, "_") || "quotation";
  const date = new Date().toISOString().slice(0, 10);
  return `Quotation_${safeNumber}_${date}.pdf`;
}

function buildTableColumns(contentLeft: number, contentRight: number): TableColumn[] {
  const widths = { item: 20, unit: 16, qty: 22, unitPrice: 24, amount: 24 };
  const descriptionWidth =
    contentRight - contentLeft - widths.item - widths.unit - widths.qty - widths.unitPrice - widths.amount;

  let x = contentLeft;
  return [
    { key: "item", label: "Item", x, width: widths.item, align: "left" },
    { key: "description", label: "Description", x: (x += widths.item), width: descriptionWidth, align: "left" },
    { key: "unit", label: "Unit", x: (x += descriptionWidth), width: widths.unit, align: "center" },
    { key: "qty", label: "Quantity", x: (x += widths.unit), width: widths.qty, align: "right" },
    {
      key: "unitPrice",
      label: "Unit Price",
      x: (x += widths.qty),
      width: widths.unitPrice,
      align: "right",
    },
    {
      key: "amount",
      label: "Amount",
      x: (x += widths.unitPrice),
      width: Math.max(widths.amount, contentRight - x),
      align: "right",
    },
  ];
}

function getColumnEdges(columns: TableColumn[]) {
  const edges = [columns[0].x];
  for (const column of columns) {
    edges.push(column.x + column.width);
  }
  return edges;
}

export async function downloadOrganizationQuotationPdf(
  data: OrganizationQuotationPdfData
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: PAGE.format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentLeft = PAGE.margin;
  const contentRight = pageWidth - PAGE.margin;
  const contentWidth = contentRight - contentLeft;
  const tableColumns = buildTableColumns(contentLeft, contentRight);
  const columnEdges = getColumnEdges(tableColumns);

  const logoDataUrl =
    (await loadImageDataUrl(data.organization.logoUrl || "")) ||
    (await loadImageDataUrl(LOGISTIX_LOGO_PATH));
  const logoFormat = logoDataUrl ? imageFormatFromDataUrl(logoDataUrl) : null;
  const hasLogo = Boolean(logoDataUrl && logoFormat);

  const layoutScale = resolveSinglePageScale(
    doc,
    data,
    pageHeight,
    contentWidth,
    contentLeft,
    contentRight,
    hasLogo
  );
  const { font: FONT, layout: LAYOUT } = buildMetrics(layoutScale);

  let y = PAGE.margin;

  function ensureSpace(_height: number, _extraReserve = 0) {
    // Single-page PDF: content scale is pre-calculated to fit one A4 page.
  }

  function setFill(color: [number, number, number]) {
    doc.setFillColor(...color);
  }

  function setStroke(color: [number, number, number]) {
    doc.setDrawColor(...color);
  }

  function setText(color: [number, number, number]) {
    doc.setTextColor(...color);
  }

  function drawAccentBar() {
    setFill(COLORS.accent);
    doc.rect(0, 0, pageWidth, 1.2, "F");
  }

  function drawRoundedCard(x: number, top: number, width: number, height: number, fill = COLORS.surface) {
    setFill(fill);
    setStroke(COLORS.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, top, width, height, 1.5, 1.5, "FD");
  }

  function drawSectionLabel(label: string, x: number, top: number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT.sectionLabel);
    setText(COLORS.muted);
    doc.text(label.toUpperCase(), x, top);
  }

  function textLineHeight(fontSize: number) {
    return Math.max(LAYOUT.lineHeight, fontSize * 0.45);
  }

  function wrapLines(text: string, maxWidth: number, fontSize = FONT.body, fontStyle: "normal" | "bold" = "normal") {
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(text, maxWidth) as string[];
  }

  drawAccentBar();
  y = PAGE.margin;

  const headerTop = y;
  const companyTextX = hasLogo ? contentLeft + LAYOUT.logoSize + 5 : contentLeft;
  const companyTextWidth = Math.max(70, contentRight - companyTextX - 38);

  if (logoDataUrl && logoFormat) {
    try {
      doc.addImage(logoDataUrl, logoFormat, contentLeft, headerTop, LAYOUT.logoSize, LAYOUT.logoSize);
    } catch {
      // Continue without logo if rendering fails.
    }
  }

  const companyStartY = headerTop + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT.companyName);
  setText(COLORS.charcoal);
  const companyNameLines = wrapLines(
    data.organization.name || "Company",
    companyTextWidth,
    FONT.companyName,
    "bold"
  );
  companyNameLines.forEach((line, index) => {
    doc.text(line, companyTextX, companyStartY + index * textLineHeight(FONT.companyName));
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT.companyDetail);
  setText(COLORS.muted);
  let companyY =
    companyStartY +
    companyNameLines.length * textLineHeight(FONT.companyName) +
    LAYOUT.minLineGap;
  const companyLines = [
    data.organization.phone ? `Tel: ${data.organization.phone}` : "",
    data.organization.email ? `Email: ${data.organization.email}` : "",
    data.organization.address || "",
    data.organization.taxNumber ? `NTN: ${data.organization.taxNumber}` : "",
  ].filter(Boolean);

  const companyLineHeight = textLineHeight(FONT.companyDetail);
  for (const line of companyLines) {
    for (const part of wrapLines(line, companyTextWidth, FONT.companyDetail)) {
      doc.text(part, companyTextX, companyY);
      companyY += companyLineHeight;
    }
  }

  const metaRows: Array<[string, string]> = [
    ["RFQ Number", displayValue(data.reference)],
    ["Quotation No.", displayQuotationNumber(data.quotationNumber)],
    ["Date", formatDisplayDate(data.quotationDate)],
  ];
  if (data.expiryDate) {
    metaRows.push(["Valid Until", formatDisplayDate(data.expiryDate)]);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT.docTitle);
  setText(COLORS.accent);
  doc.text("QUOTATION", contentRight, headerTop + 9, { align: "right" });

  y = Math.max(companyY, headerTop + LAYOUT.logoSize) + LAYOUT.sectionGap;

  function measureHorizontalTableRow(fields: InfoField[], isHeader: boolean) {
    const colWidth = contentWidth / fields.length;
    const fontSize = isHeader ? FONT.tableHeader : FONT.body;
    let maxLines = 1;
    for (const field of fields) {
      const text = isHeader ? field.label : field.value;
      const lines = wrapLines(text, colWidth - 4, fontSize, isHeader ? "bold" : "normal");
      maxLines = Math.max(maxLines, lines.length);
    }
    return maxLines * textLineHeight(fontSize) + LAYOUT.tableRowPad * 2;
  }

  function drawHorizontalTable(fields: InfoField[], emphasizeLast = false) {
    const colWidth = contentWidth / fields.length;
    const headerHeight = measureHorizontalTableRow(fields, true);
    const valueHeight = measureHorizontalTableRow(fields, false);
    const tableHeight = headerHeight + valueHeight;

    ensureSpace(tableHeight + 4);

    let rowTop = y;
    setStroke(COLORS.border);
    doc.setLineWidth(0.2);
    doc.rect(contentLeft, rowTop, contentWidth, tableHeight);

    setFill(COLORS.tableHeader);
    doc.rect(contentLeft, rowTop, contentWidth, headerHeight, "F");

    for (let index = 1; index < fields.length; index += 1) {
      const x = contentLeft + colWidth * index;
      doc.line(x, rowTop, x, rowTop + tableHeight);
    }

    doc.line(contentLeft, rowTop + headerHeight, contentRight, rowTop + headerHeight);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT.tableHeader);
    setText(COLORS.charcoal);
    fields.forEach((field, index) => {
      const emphasized = emphasizeLast && index === fields.length - 1;
      const cellX = contentLeft + colWidth * index + 2;
      const lines = wrapLines(field.label.toUpperCase(), colWidth - 4, FONT.tableHeader, "bold");
      setText(emphasized ? COLORS.accent : COLORS.charcoal);
      lines.forEach((line, lineIndex) => {
        doc.text(line, cellX, rowTop + LAYOUT.tableRowPad + (lineIndex + 1) * textLineHeight(FONT.tableHeader));
      });
    });

    rowTop += headerHeight;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT.body);
    setText(COLORS.charcoal);
    fields.forEach((field, index) => {
      const emphasized = emphasizeLast && index === fields.length - 1;
      const cellX = contentLeft + colWidth * index + 2;
      const valueSize = emphasized ? FONT.grandTotalValue : FONT.body;
      const lines = wrapLines(
        field.value,
        colWidth - 4,
        valueSize,
        emphasized ? "bold" : "normal"
      );
      doc.setFont("helvetica", emphasized ? "bold" : "normal");
      doc.setFontSize(valueSize);
      setText(emphasized ? COLORS.accent : COLORS.charcoal);
      lines.forEach((line, lineIndex) => {
        doc.text(
          line,
          cellX,
          rowTop + LAYOUT.tableRowPad + (lineIndex + 1) * textLineHeight(valueSize)
        );
      });
    });

    y += tableHeight + LAYOUT.sectionGap;
  }

  drawHorizontalTable(
    metaRows.map(([label, value]) => ({
      label,
      value,
    }))
  );

  const billToFields = data.customer ? buildBillToFields(data.customer) : [];
  if (billToFields.length > 0) {
    drawSectionLabel("Bill To", contentLeft, y);
    y += 5;
    drawHorizontalTable(billToFields);
  }

  function drawTableGrid(rowTop: number, rowHeight: number, fill?: [number, number, number]) {
    if (fill) {
      setFill(fill);
      doc.rect(contentLeft, rowTop, contentWidth, rowHeight, "F");
    }

    setStroke(COLORS.border);
    doc.setLineWidth(0.2);
    doc.rect(contentLeft, rowTop, contentWidth, rowHeight);

    for (let index = 1; index < columnEdges.length - 1; index += 1) {
      const x = columnEdges[index];
      doc.line(x, rowTop, x, rowTop + rowHeight);
    }
  }

  function drawHeaderCell(column: TableColumn, headerTop: number, headerHeight: number) {
    const padding = 1.5;
    const maxWidth = Math.max(4, column.width - padding * 2);
    const lines = wrapLines(column.label.toUpperCase(), maxWidth, FONT.tableHeader);
    const lineH = textLineHeight(FONT.tableHeader);
    const textBlockHeight = lines.length * lineH;
    const startY = headerTop + Math.max(padding + lineH, (headerHeight - textBlockHeight) / 2 + lineH);

    lines.forEach((line, index) => {
      const textX =
        column.align === "right"
          ? column.x + column.width - padding
          : column.align === "center"
            ? column.x + column.width / 2
            : column.x + padding;
      doc.text(line, textX, startY + index * lineH, { align: column.align });
    });
  }

  function drawTableHeader() {
    const headerHeight = LAYOUT.tableHeaderHeight;
    ensureSpace(headerHeight + 4);

    drawTableGrid(y, headerHeight, COLORS.tableHeader);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT.tableHeader);
    setText(COLORS.charcoal);

    for (const column of tableColumns) {
      drawHeaderCell(column, y, headerHeight);
    }

    y += headerHeight;
  }

  drawTableHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT.tableBody);

  data.lineItems.forEach((item, index) => {
    const { item: itemName, description: itemDescription } = splitLineItem(item);
    const itemLines = doc.splitTextToSize(itemName, tableColumns[0].width - 4) as string[];
    const descriptionLines = doc.splitTextToSize(
      itemDescription,
      tableColumns[1].width - 4
    ) as string[];
    const rowTextLines = Math.max(itemLines.length, descriptionLines.length, 1);
    const rowLineHeight = textLineHeight(FONT.tableBody);
    const rowHeight = rowTextLines * rowLineHeight + LAYOUT.tableRowPad * 2;

    const rowTop = y;
    drawTableGrid(rowTop, rowHeight, index % 2 === 0 ? COLORS.zebra : COLORS.white);

    const textY = rowTop + LAYOUT.tableRowPad;

    itemLines.forEach((line, lineIndex) => {
      doc.text(line, tableColumns[0].x + 2, textY + lineIndex * rowLineHeight);
    });
    descriptionLines.forEach((line, lineIndex) => {
      doc.text(line, tableColumns[1].x + 2, textY + lineIndex * rowLineHeight);
    });
    setText(COLORS.charcoal);
    const numericY = textY + ((rowTextLines - 1) * rowLineHeight) / 2;
    doc.text(item.quantity_uom || "—", tableColumns[2].x + tableColumns[2].width / 2, numericY, {
      align: "center",
    });
    doc.text(
      formatQuantity(item.quantity),
      tableColumns[3].x + tableColumns[3].width - 2,
      numericY,
      { align: "right" }
    );
    doc.text(
      formatAmount(item.unit_price),
      tableColumns[4].x + tableColumns[4].width - 2,
      numericY,
      { align: "right" }
    );
    doc.setFont("helvetica", "bold");
    doc.text(
      formatAmount(item.line_total),
      tableColumns[5].x + tableColumns[5].width - 2,
      numericY,
      { align: "right" }
    );
    doc.setFont("helvetica", "normal");

    y += rowHeight;
  });

  y += LAYOUT.sectionGap;

  const totalsFields: InfoField[] = [
    { label: "Gross Total", value: formatAmount(data.grossTotal) },
    {
      label: `Sales Tax (${(data.salesTaxPercent || 0).toFixed(2)}%)`,
      value: formatAmount(data.taxTotal),
    },
  ];
  if ((data.discountPercent || 0) > 0 || data.discountTotal > 0) {
    totalsFields.push({
      label: `Document Discount (${(data.discountPercent || 0).toFixed(2)}%)`,
      value: `-${formatAmount(data.discountTotal)}`,
    });
  }
  totalsFields.push({ label: "Grand Total", value: formatAmount(data.grandTotal) });
  drawHorizontalTable(totalsFields, true);

  const notesBlocks: Array<{ label: string; text: string }> = [];
  if (data.notes?.trim()) notesBlocks.push({ label: "Payment Terms", text: data.notes.trim() });
  if (data.terms?.trim()) notesBlocks.push({ label: "Terms & Conditions", text: data.terms.trim() });

  const notesBoxWidth = contentWidth;
  const notesTextWidth = notesBoxWidth - LAYOUT.cardPadding * 2;
  let notesHeight = 0;
  if (notesBlocks.length > 0) {
    notesHeight = LAYOUT.cardPadding + 6;
    for (const block of notesBlocks) {
      notesHeight += textLineHeight(FONT.notesTitle) + LAYOUT.minLineGap;
      notesHeight += wrapLines(block.text, notesTextWidth, FONT.notesBody).length * textLineHeight(FONT.notesBody);
      notesHeight += 3;
    }
    notesHeight += LAYOUT.cardPadding;
  }

  const bottomSectionHeight = notesHeight + LAYOUT.sectionGap;
  ensureSpace(bottomSectionHeight, 4);

  const bottomY = y;

  if (notesBlocks.length > 0) {
    const notesCardHeight = notesHeight;
    drawRoundedCard(contentLeft, bottomY, notesBoxWidth, notesCardHeight);

    drawSectionLabel("Notes", contentLeft + LAYOUT.cardPadding, bottomY + 5);
    let notesY = bottomY + 12;
    const notesX = contentLeft + LAYOUT.cardPadding;

    for (const block of notesBlocks) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(FONT.notesTitle);
      setText(COLORS.charcoal);
      doc.text(block.label, notesX, notesY);
      notesY += textLineHeight(FONT.notesTitle) + LAYOUT.minLineGap;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(FONT.notesBody);
      setText(COLORS.charcoal);
      for (const line of wrapLines(block.text, notesTextWidth, FONT.notesBody)) {
        doc.text(line, notesX, notesY);
        notesY += textLineHeight(FONT.notesBody);
      }
      notesY += 3;
    }
  }

  y = bottomY + notesHeight + LAYOUT.sectionGap;

  const pageCount = 1;
  doc.setPage(1);
  drawAccentBar();

  const footerTop = pageHeight - PAGE.footerHeight;
  setStroke(COLORS.border);
  doc.setLineWidth(0.2);
  doc.line(contentLeft, footerTop, contentRight, footerTop);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT.footer);
  setText(COLORS.charcoal);
  doc.text(data.organization.name || "", contentLeft, footerTop + 6);

  doc.setFont("helvetica", "normal");
  setText(COLORS.muted);
  const footerParts = [
    data.organization.phone,
    data.organization.email,
    data.organization.website,
  ].filter((part): part is string => Boolean(part?.trim()));
  if (footerParts.length > 0) {
    const footerLine = footerParts.join("   |   ");
    const footerLines = wrapLines(footerLine, contentWidth - 50, FONT.footer);
    footerLines.forEach((line, index) => {
      doc.text(line, contentLeft, footerTop + 10 + index * textLineHeight(FONT.footer));
    });
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(FONT.footerTagline);
  setText(COLORS.muted);
  doc.text("Thank you for your business.", contentRight, footerTop + 6, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text("Page 1 of 1", contentRight, footerTop + 11, { align: "right" });

  doc.save(buildFileName(data.quotationNumber));
}
