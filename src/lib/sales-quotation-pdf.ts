import type { SalesQuotationPdfPayload } from '@/app/actions/sales/quotation-pdf';
import { preparePdfLogoFit } from '@/lib/logistix-logo';
import {
  createErpPdfContext,
  ensurePdfSpace,
  type ErpPdfDoc,
} from '@/lib/erp-document-pdf';
import {
  formatTaxLabel,
  quotationLineDisplayDescription,
} from '@/lib/sales-quotation-form';

export type GenerateSalesQuotationPdfOptions = {
  download?: boolean;
  openPrintDialog?: boolean;
  /** When true, only return dataUrl — do not download, print, or open a tab. */
  silent?: boolean;
};

function formatOdooDate(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatOdooQty(n: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function formatOdooRs(n: number) {
  return `Rs. ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0)}`;
}

function formatOdooPrice(n: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function drawLogo(
  doc: ErpPdfDoc,
  logo: {
    dataUrl: string;
    format: 'PNG' | 'JPEG';
    widthMm: number;
    heightMm: number;
  } | null,
  x: number,
  y: number
) {
  if (!logo) return 0;
  try {
    doc.addImage(logo.dataUrl, logo.format, x, y, logo.widthMm, logo.heightMm);
    return logo.heightMm;
  } catch {
    try {
      doc.addImage(
        logo.dataUrl,
        logo.format === 'PNG' ? 'JPEG' : 'PNG',
        x,
        y,
        logo.widthMm,
        logo.heightMm
      );
      return logo.heightMm;
    } catch {
      return 0;
    }
  }
}

/**
 * Odoo quotation report layout — matches the attached Quotation PDF:
 * customer, Quotation #, date / expiration / contact, line table, GST totals, footer.
 */
export async function generateSalesQuotationPdf(
  payload: SalesQuotationPdfPayload,
  options: GenerateSalesQuotationPdfOptions = {}
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  }) as unknown as ErpPdfDoc;
  const ctx = createErpPdfContext(doc);
  ctx.margin = 14;
  ctx.contentW = ctx.pageW - ctx.margin * 2;
  ctx.y = 12;
  ctx.footerReserve = 24;

  const logo = await preparePdfLogoFit(payload.organization.logoUrl, 78, 26);
  const logoH = drawLogo(doc, logo, ctx.margin, ctx.y);
  ctx.y += (logoH || 22) + 5;
  doc.setDrawColor(1, 126, 132);
  doc.setLineWidth(0.7);
  doc.line(ctx.margin, ctx.y, ctx.pageW - ctx.margin, ctx.y);
  ctx.y += 10;

  const customerName = payload.customer.name || '—';
  const quotationNumber = payload.quotation.number || '—';
  const contactName =
    payload.customer.contactPerson || payload.customer.name || '';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(33, 33, 33);
  doc.text(customerName, ctx.margin, ctx.y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(33, 33, 33);
  doc.text(`Quotation # ${quotationNumber}`, ctx.pageW - ctx.margin, ctx.y, {
    align: 'right',
  });
  ctx.y += 10;

  const infoCols: Array<{ label: string; value: string }> = [
    { label: 'Quotation Date', value: formatOdooDate(payload.quotation.date) },
    {
      label: 'Expiration',
      value: formatOdooDate(payload.quotation.expiration),
    },
    { label: 'Contact', value: contactName },
  ];
  const infoW = ctx.contentW / 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  infoCols.forEach((col, i) => {
    doc.text(col.label, ctx.margin + i * infoW, ctx.y);
  });
  ctx.y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(33, 33, 33);
  infoCols.forEach((col, i) => {
    doc.text(col.value || '', ctx.margin + i * infoW, ctx.y);
  });
  ctx.y += 10;

  const columns = [
    { key: 'desc', label: 'Description', width: 72, align: 'left' as const },
    { key: 'qty', label: 'Quantity', width: 28, align: 'right' as const },
    { key: 'price', label: 'Unit Price', width: 28, align: 'right' as const },
    { key: 'tax', label: 'Taxes', width: 22, align: 'right' as const },
    { key: 'amt', label: 'Amount', width: 28, align: 'right' as const },
  ];
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const scale = ctx.contentW / totalW;
  columns.forEach((c) => {
    c.width = Math.round(c.width * scale * 10) / 10;
  });

  const drawTableHeader = () => {
    ensurePdfSpace(ctx, 12);
    doc.setFillColor(1, 126, 132);
    doc.rect(ctx.margin, ctx.y, ctx.contentW, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    let x = ctx.margin;
    for (const col of columns) {
      const tx = col.align === 'right' ? x + col.width - 1.5 : x + 1.5;
      doc.text(col.label, tx, ctx.y + 6, { align: col.align });
      x += col.width;
    }
    ctx.y += 10;
  };

  drawTableHeader();

  for (const line of payload.lines) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const discount = Math.min(100, Math.max(0, Number(line.discount) || 0));
    if (qty === 0 && price === 0) continue;

    const description =
      quotationLineDisplayDescription(line.product, line.description) || '—';
    const descLines = doc.splitTextToSize(description, columns[0].width - 3);
    const rowH = Math.max(13, descLines.length * 5 + 8);
    const amount = qty * price * (1 - discount / 100);

    if (ensurePdfSpace(ctx, rowH + 2)) {
      drawTableHeader();
    }

    let x = ctx.margin;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(33, 33, 33);
    doc.text(descLines, x + 1.5, ctx.y + 5);

    x += columns[0].width;
    doc.text(formatOdooQty(Number(line.quantity) || 0), x + columns[1].width - 1.5, ctx.y + 5, {
      align: 'right',
    });
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text('Units', x + columns[1].width - 1.5, ctx.y + 10, {
      align: 'right',
    });

    x += columns[1].width;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(33, 33, 33);
    doc.text(formatOdooPrice(Number(line.unitPrice) || 0), x + columns[2].width - 1.5, ctx.y + 5, {
      align: 'right',
    });

    x += columns[2].width;
    doc.text(
      formatTaxLabel(line.taxes),
      x + columns[3].width - 1.5,
      ctx.y + 5,
      { align: 'right' }
    );

    x += columns[3].width;
    doc.text(formatOdooRs(amount), x + columns[4].width - 1.5, ctx.y + 5, {
      align: 'right',
    });

    ctx.y += rowH;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.15);
    doc.line(ctx.margin, ctx.y, ctx.margin + ctx.contentW, ctx.y);
    ctx.y += 1;
  }

  ensurePdfSpace(ctx, 36);
  ctx.y += 8;
  const totalsX = ctx.pageW - ctx.margin - 80;
  const totals = [
    { label: 'Untaxed Amount', value: formatOdooRs(payload.totals.untaxed), bold: false },
    { label: 'General Sales Tax', value: formatOdooRs(payload.totals.tax), bold: false },
    { label: 'Total', value: formatOdooRs(payload.totals.total), bold: true },
  ];
  for (const row of totals) {
    if (row.bold) {
      ctx.y += 2;
      doc.setDrawColor(1, 126, 132);
      doc.setLineWidth(0.45);
      doc.line(totalsX, ctx.y, ctx.pageW - ctx.margin, ctx.y);
      ctx.y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(1, 126, 132);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(90, 90, 90);
    }
    doc.text(row.label, totalsX, ctx.y);
    doc.setTextColor(33, 33, 33);
    doc.text(row.value, ctx.pageW - ctx.margin, ctx.y, { align: 'right' });
    ctx.y += row.bold ? 8 : 6.5;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const footerY = ctx.pageH - 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(33, 33, 33);
    doc.text(payload.organization.name || '', ctx.margin, footerY);
    if (payload.organization.country) {
      doc.setFontSize(10);
      doc.setTextColor(110, 110, 110);
      doc.text(payload.organization.country, ctx.margin, footerY + 5);
    }
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(`Page ${i} / ${pages}`, ctx.pageW - ctx.margin, footerY, {
      align: 'right',
    });
  }

  const dataUrl = (doc as unknown as { output: (t: string) => string }).output(
    'datauristring'
  );

  if (options.silent) {
    return { dataUrl };
  }

  if (options.download) {
    (doc as unknown as { save: (n: string) => void }).save(
      `${payload.quotation.number || 'quotation'}.pdf`
    );
  } else if (options.openPrintDialog && typeof window !== 'undefined') {
    const w = window.open(dataUrl);
    w?.addEventListener('load', () => w.print());
  } else if (typeof window !== 'undefined') {
    window.open(dataUrl, '_blank');
  }

  return { dataUrl };
}
