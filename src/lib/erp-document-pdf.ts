/**
 * Shared minimal professional ERP document PDF helpers.
 * Used by Quotation + Invoice PDFs for consistent typography and layout.
 */

export const ERP_PDF = {
  accent: [1, 126, 132] as [number, number, number],
  ink: [28, 28, 30] as [number, number, number],
  muted: [110, 110, 115] as [number, number, number],
  line: [220, 220, 223] as [number, number, number],
  soft: [246, 247, 248] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export type ErpPdfDoc = {
  setFont: (name: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (...rgb: number[]) => void;
  setDrawColor: (...rgb: number[]) => void;
  setFillColor: (...rgb: number[]) => void;
  setLineWidth: (w: number) => void;
  text: (
    text: string | string[],
    x: number,
    y: number,
    options?: { align?: 'left' | 'center' | 'right'; maxWidth?: number }
  ) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  addImage: (...args: unknown[]) => void;
  addPage: () => void;
  splitTextToSize: (text: string, size: number) => string[];
  getNumberOfPages: () => number;
  setPage: (n: number) => void;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

export async function loadPdfImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '') || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function formatPdfMoney(n: number, currency = 'PKR') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function formatPdfDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function pdfMultiline(text: string | null | undefined) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export type ErpDocumentPdfContext = {
  doc: ErpPdfDoc;
  pageW: number;
  pageH: number;
  margin: number;
  contentW: number;
  y: number;
  footerReserve: number;
};

export function createErpPdfContext(doc: ErpPdfDoc): ErpDocumentPdfContext {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  return {
    doc,
    pageW,
    pageH,
    margin,
    contentW: pageW - margin * 2,
    y: margin,
    footerReserve: 16,
  };
}

export function ensurePdfSpace(ctx: ErpDocumentPdfContext, needed: number) {
  if (ctx.y + needed > ctx.pageH - ctx.footerReserve) {
    ctx.doc.addPage();
    ctx.y = ctx.margin;
    return true;
  }
  return false;
}

export function drawPdfHairline(ctx: ErpDocumentPdfContext, y?: number) {
  const yy = y ?? ctx.y;
  ctx.doc.setDrawColor(...ERP_PDF.line);
  ctx.doc.setLineWidth(0.2);
  ctx.doc.line(ctx.margin, yy, ctx.pageW - ctx.margin, yy);
}

export function drawPdfHeader(
  ctx: ErpDocumentPdfContext,
  args: {
    logoData: string | null;
    companyName: string;
    companyLines: string[];
    docTitle: string;
    docNumber: string;
    metaRight: Array<[string, string]>;
  }
) {
  const { doc, margin, pageW } = ctx;
  let leftX = margin;

  if (args.logoData) {
    try {
      doc.addImage(args.logoData, 'JPEG', margin, ctx.y, 16, 16);
      leftX = margin + 20;
    } catch {
      try {
        doc.addImage(args.logoData, 'PNG', margin, ctx.y, 16, 16);
        leftX = margin + 20;
      } catch {
        /* ignore */
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...ERP_PDF.ink);
  doc.text(args.companyName || 'Company', leftX, ctx.y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...ERP_PDF.muted);
  let cy = ctx.y + 10;
  for (const line of args.companyLines.slice(0, 3)) {
    doc.text(String(line).slice(0, 62), leftX, cy);
    cy += 3.6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...ERP_PDF.ink);
  doc.text(args.docTitle, pageW - margin, ctx.y + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...ERP_PDF.accent);
  doc.text(args.docNumber || '—', pageW - margin, ctx.y + 12, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(...ERP_PDF.muted);
  let ry = ctx.y + 17;
  for (const [label, value] of args.metaRight.slice(0, 3)) {
    doc.text(`${label}: ${value}`, pageW - margin, ry, { align: 'right' });
    ry += 3.8;
  }

  ctx.y = Math.max(cy, ry, ctx.y + 18) + 4;
  drawPdfHairline(ctx);
  ctx.y += 8;
}

export function drawPdfPartyBlock(
  ctx: ErpDocumentPdfContext,
  args: {
    title: string;
    name: string;
    lines: string[];
    x: number;
    width: number;
  }
) {
  const { doc } = ctx;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...ERP_PDF.accent);
  doc.text(args.title.toUpperCase(), args.x, ctx.y);

  let ly = ctx.y + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...ERP_PDF.ink);
  const nameLines = doc.splitTextToSize(args.name || '—', args.width);
  doc.text(nameLines, args.x, ly);
  ly += nameLines.length * 4.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...ERP_PDF.muted);
  for (const line of args.lines) {
    const wrapped = doc.splitTextToSize(String(line), args.width);
    doc.text(wrapped, args.x, ly);
    ly += wrapped.length * 3.6;
  }
  return ly;
}

export type ErpPdfTableColumn = {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
};

export function drawPdfTableHeader(
  ctx: ErpDocumentPdfContext,
  columns: ErpPdfTableColumn[]
) {
  ensurePdfSpace(ctx, 10);
  const { doc, margin } = ctx;
  doc.setFillColor(...ERP_PDF.soft);
  doc.rect(margin, ctx.y, ctx.contentW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...ERP_PDF.muted);

  let x = margin;
  const hy = ctx.y + 4.6;
  for (const col of columns) {
    const align = col.align || 'left';
    const tx = align === 'right' ? x + col.width - 1.5 : x + 1.5;
    doc.text(col.label, tx, hy, { align });
    x += col.width;
  }
  ctx.y += 8;
}

export function drawPdfTableRow(
  ctx: ErpDocumentPdfContext,
  columns: ErpPdfTableColumn[],
  values: Record<string, string>,
  opts?: { repeatHeader?: () => void }
) {
  const { doc, margin } = ctx;
  const cells = columns.map((col) => {
    const raw = String(values[col.key] ?? '');
    const maxW = Math.max(8, col.width - 3);
    const lines = doc.splitTextToSize(raw || '—', maxW);
    return { col, lines };
  });
  const rowH = Math.max(6.5, ...cells.map((c) => c.lines.length * 3.5 + 2.5));

  if (ensurePdfSpace(ctx, rowH + 2)) {
    opts?.repeatHeader?.();
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...ERP_PDF.ink);

  let x = margin;
  for (const cell of cells) {
    const align = cell.col.align || 'left';
    const tx = align === 'right' ? x + cell.col.width - 1.5 : x + 1.5;
    doc.text(cell.lines, tx, ctx.y + 4, { align });
    x += cell.col.width;
  }
  ctx.y += rowH;
  doc.setDrawColor(...ERP_PDF.line);
  doc.setLineWidth(0.15);
  doc.line(margin, ctx.y, margin + ctx.contentW, ctx.y);
  ctx.y += 0.5;
}

export function drawPdfTotals(
  ctx: ErpDocumentPdfContext,
  rows: Array<{ label: string; value: string; emphasize?: boolean }>
) {
  ensurePdfSpace(ctx, rows.length * 5 + 8);
  const boxW = 72;
  const x = ctx.pageW - ctx.margin - boxW;
  ctx.y += 4;

  for (const row of rows) {
    if (row.emphasize) {
      drawPdfHairline(ctx, ctx.y);
      ctx.y += 4;
      ctx.doc.setFont('helvetica', 'bold');
      ctx.doc.setFontSize(10);
      ctx.doc.setTextColor(...ERP_PDF.ink);
    } else {
      ctx.doc.setFont('helvetica', 'normal');
      ctx.doc.setFontSize(8.5);
      ctx.doc.setTextColor(...ERP_PDF.muted);
    }
    ctx.doc.text(row.label, x, ctx.y);
    ctx.doc.setTextColor(...ERP_PDF.ink);
    ctx.doc.text(row.value, ctx.pageW - ctx.margin, ctx.y, { align: 'right' });
    ctx.y += row.emphasize ? 6 : 5;
  }
}

export function drawPdfSection(
  ctx: ErpDocumentPdfContext,
  title: string,
  body: string | null | undefined
) {
  const text = String(body || '').trim();
  if (!text) return;
  ensurePdfSpace(ctx, 18);
  ctx.y += 4;
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(7.5);
  ctx.doc.setTextColor(...ERP_PDF.accent);
  ctx.doc.text(title.toUpperCase(), ctx.margin, ctx.y);
  ctx.y += 4.5;
  ctx.doc.setFont('helvetica', 'normal');
  ctx.doc.setFontSize(8);
  ctx.doc.setTextColor(...ERP_PDF.ink);
  const lines = ctx.doc.splitTextToSize(text, ctx.contentW);
  for (const line of lines) {
    ensurePdfSpace(ctx, 5);
    ctx.doc.text(line, ctx.margin, ctx.y);
    ctx.y += 3.8;
  }
}

export function finalizePdfPages(
  ctx: ErpDocumentPdfContext,
  footerLeft: string
) {
  const pages = ctx.doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    ctx.doc.setPage(i);
    ctx.doc.setDrawColor(...ERP_PDF.line);
    ctx.doc.setLineWidth(0.2);
    ctx.doc.line(
      ctx.margin,
      ctx.pageH - 12,
      ctx.pageW - ctx.margin,
      ctx.pageH - 12
    );
    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.setFontSize(7);
    ctx.doc.setTextColor(...ERP_PDF.muted);
    ctx.doc.text(footerLeft.slice(0, 80), ctx.margin, ctx.pageH - 7);
    ctx.doc.text(`Page ${i} of ${pages}`, ctx.pageW - ctx.margin, ctx.pageH - 7, {
      align: 'right',
    });
  }
}
