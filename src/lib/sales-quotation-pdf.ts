import type { SalesQuotationPdfPayload } from '@/app/actions/sales/quotation-pdf';
import { LOGISTIX_LOGO_PATH } from '@/lib/logistix-logo';

const COLORS = {
  charcoal: [33, 37, 41] as [number, number, number],
  muted: [108, 117, 125] as [number, number, number],
  border: [222, 226, 230] as [number, number, number],
  tableHeader: [241, 243, 245] as [number, number, number],
  accent: [1, 126, 132] as [number, number, number], // #017e84
  white: [255, 255, 255] as [number, number, number],
};

async function loadImageAsDataUrl(url: string): Promise<string | null> {
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

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

export type GenerateSalesQuotationPdfOptions = {
  download?: boolean;
  openPrintDialog?: boolean;
};

/**
 * Client-side jsPDF generator for Sales quotations (Odoo-style layout + ERP teal accent).
 */
export async function generateSalesQuotationPdf(
  payload: SalesQuotationPdfPayload,
  options: GenerateSalesQuotationPdfOptions = {}
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  const logoUrl = payload.organization.logoUrl || LOGISTIX_LOGO_PATH;
  const logoData = await loadImageAsDataUrl(
    logoUrl.startsWith('http') || logoUrl.startsWith('data:')
      ? logoUrl
      : typeof window !== 'undefined'
        ? `${window.location.origin}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`
        : logoUrl
  );

  // Header
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', margin, y, 22, 22);
    } catch {
      try {
        doc.addImage(logoData, 'PNG', margin, y, 22, 22);
      } catch {
        // ignore logo failures
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(payload.organization.name || 'Company', margin + 26, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  const companyLines = [
    ...payload.organization.address.split('\n').filter(Boolean),
    payload.organization.email,
    payload.organization.phone,
    payload.organization.website,
  ].filter(Boolean);
  let cy = y + 13;
  for (const line of companyLines.slice(0, 5)) {
    doc.text(line, margin + 26, cy);
    cy += 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.accent);
  doc.text('Quotation', pageW - margin, y + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(payload.quotation.number, pageW - margin, y + 15, { align: 'right' });

  y = Math.max(cy, y + 28) + 6;

  // Meta box
  doc.setDrawColor(...COLORS.border);
  doc.setFillColor(...COLORS.tableHeader);
  doc.roundedRect(margin, y, pageW - margin * 2, 22, 1, 1, 'FD');

  const metaLeft = [
    ['Date', formatDate(payload.quotation.date)],
    ['Expiration', formatDate(payload.quotation.expiration)],
    ['Salesperson', payload.quotation.salesperson || '—'],
  ];
  const metaRight = [
    ['Customer Ref.', payload.quotation.customerReference || '—'],
    ['Payment Terms', payload.quotation.paymentTerms || '—'],
  ];

  doc.setFontSize(8);
  let mx = margin + 4;
  let my = y + 6;
  for (const [label, value] of metaLeft) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    doc.text(label, mx, my);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.charcoal);
    doc.text(String(value), mx, my + 5);
    mx += 55;
  }
  mx = margin + 4;
  my = y + 16;
  for (const [label, value] of metaRight) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    doc.text(label, mx, my);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.charcoal);
    doc.text(String(value), mx + 28, my);
    mx += 80;
  }

  y += 28;

  // Customer section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.accent);
  doc.text('Customer', margin, y);
  doc.text('Invoice Address', margin + 95, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(payload.customer.name || '—', margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  if (payload.customer.contactPerson) {
    doc.text(`Attn: ${payload.customer.contactPerson}`, margin, y);
    y += 4;
  }

  const invLines = payload.customer.invoiceAddress.split('\n').filter(Boolean);
  const shipLines = payload.customer.deliveryAddress.split('\n').filter(Boolean);
  let iy = y;
  for (const line of invLines.slice(0, 4)) {
    doc.text(line, margin + 95, iy);
    iy += 4;
  }
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.accent);
  doc.text('Delivery Address', margin + 95, iy + 2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.muted);
  iy += 7;
  for (const line of shipLines.slice(0, 3)) {
    doc.text(line, margin + 95, iy);
    iy += 4;
  }

  y = Math.max(y + invLines.length * 4 + 4, iy) + 6;

  // Table header
  const cols = {
    product: margin,
    qty: margin + 78,
    uom: margin + 92,
    price: margin + 108,
    disc: margin + 130,
    tax: margin + 145,
    total: pageW - margin,
  };

  doc.setFillColor(...COLORS.accent);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);
  const headerY = y + 5.5;
  doc.text('Product / Description', cols.product + 2, headerY);
  doc.text('Qty', cols.qty, headerY, { align: 'right' });
  doc.text('UOM', cols.uom, headerY);
  doc.text('Price', cols.price, headerY, { align: 'right' });
  doc.text('Disc%', cols.disc, headerY, { align: 'right' });
  doc.text('Tax%', cols.tax, headerY, { align: 'right' });
  doc.text('Total', cols.total, headerY, { align: 'right' });
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.charcoal);

  for (const line of payload.lines) {
    if (y > pageH - 55) {
      doc.addPage();
      y = margin;
    }
    const title = line.product || 'Product';
    const desc =
      line.description && line.description !== title ? line.description : '';
    doc.setFont('helvetica', 'bold');
    doc.text(title.slice(0, 48), cols.product + 2, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    if (desc) {
      doc.text(desc.slice(0, 55), cols.product + 2, y + 4);
    }
    doc.setTextColor(...COLORS.charcoal);
    const rowY = y + (desc ? 2 : 0);
    doc.text(String(line.quantity), cols.qty, rowY, { align: 'right' });
    doc.text(String(line.uom || ''), cols.uom, rowY);
    doc.text(money(line.unitPrice), cols.price, rowY, { align: 'right' });
    doc.text(String(line.discount || 0), cols.disc, rowY, { align: 'right' });
    doc.text(String(line.taxes || 0), cols.tax, rowY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(money(line.lineTotal), cols.total, rowY, { align: 'right' });
    y += desc ? 11 : 8;
    doc.setDrawColor(...COLORS.border);
    doc.line(margin, y - 2, pageW - margin, y - 2);
  }

  y += 4;

  // Totals
  const totalsX = pageW - margin - 70;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('Untaxed Amount', totalsX, y);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(money(payload.totals.untaxed), pageW - margin, y, { align: 'right' });
  y += 6;
  doc.setTextColor(...COLORS.muted);
  doc.text('Taxes', totalsX, y);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(money(payload.totals.tax), pageW - margin, y, { align: 'right' });
  y += 7;
  doc.setFillColor(...COLORS.tableHeader);
  doc.rect(totalsX - 4, y - 4, pageW - margin - (totalsX - 4), 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.accent);
  doc.text('Total', totalsX, y + 3);
  doc.text(money(payload.totals.total), pageW - margin, y + 3, { align: 'right' });
  y += 16;

  // Notes / terms
  if (payload.quotation.customerNotes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.accent);
    doc.text('Customer Notes', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.charcoal);
    const noteLines = doc.splitTextToSize(payload.quotation.customerNotes, pageW - margin * 2);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.accent);
  doc.text('Terms & Conditions', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  const terms = `Payment terms: ${payload.quotation.paymentTerms || 'Immediate'}. This quotation is valid until the expiration date shown above unless otherwise agreed in writing.`;
  const termLines = doc.splitTextToSize(terms, pageW - margin * 2 - 90);
  doc.text(termLines, margin, y);

  // Signature
  const sigX = pageW - margin - 70;
  const sigY = Math.min(y + termLines.length * 4 + 8, pageH - 35);
  doc.setDrawColor(...COLORS.border);
  doc.line(sigX, sigY + 12, pageW - margin, sigY + 12);
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text('Customer Signature', sigX, sigY + 17);
  doc.text('Date _______________', sigX, sigY + 22);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `${payload.organization.name} · ${payload.organization.email || ''} · ${payload.organization.phone || ''}`,
    pageW / 2,
    pageH - 8,
    { align: 'center' }
  );

  const filename = `${payload.quotation.number || 'quotation'}.pdf`;

  if (options.download) {
    doc.save(filename);
  } else if (options.openPrintDialog) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  }

  return {
    blob: doc.output('blob') as Blob,
    dataUrl: doc.output('datauristring') as string,
    filename,
  };
}
