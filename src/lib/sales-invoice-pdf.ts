import type { SalesInvoiceDetail } from '@/app/actions/sales/to-invoice';
import { LOGISTIX_LOGO_PATH } from '@/lib/logistix-logo';

const COLORS = {
  charcoal: [33, 37, 41] as [number, number, number],
  muted: [108, 117, 125] as [number, number, number],
  border: [222, 226, 230] as [number, number, number],
  tableHeader: [241, 243, 245] as [number, number, number],
  accent: [1, 126, 132] as [number, number, number],
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

export type GenerateSalesInvoicePdfOptions = {
  download?: boolean;
  openPrintDialog?: boolean;
  /** When false, only return dataUrl (no new tab). Default true when not downloading/printing. */
  openInNewTab?: boolean;
};

export async function generateSalesInvoicePdf(
  invoice: SalesInvoiceDetail,
  options: GenerateSalesInvoicePdfOptions = {}
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  const logoUrl = invoice.logo_url || LOGISTIX_LOGO_PATH;
  const logoData = await loadImageAsDataUrl(
    logoUrl.startsWith('http') || logoUrl.startsWith('data:')
      ? logoUrl
      : typeof window !== 'undefined'
        ? `${window.location.origin}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`
        : logoUrl
  );

  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', margin, y, 20, 20);
    } catch {
      try {
        doc.addImage(logoData, 'PNG', margin, y, 20, 20);
      } catch {
        // ignore
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(invoice.organization_name || 'Company', margin + 24, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  let cy = y + 12;
  for (const line of [
    invoice.company_address,
    invoice.company_email,
    invoice.company_phone,
  ].filter(Boolean) as string[]) {
    doc.text(line, margin + 24, cy);
    cy += 4;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.accent);
  doc.text('Invoice', pageW - margin, y + 8, { align: 'right' });
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(invoice.invoice_number, pageW - margin, y + 15, { align: 'right' });

  y = Math.max(cy, y + 26) + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.accent);
  doc.text('Bill To', margin, y);
  y += 5;
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(invoice.customer_name || '—', margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Invoice Date: ${formatDate(invoice.invoice_date)}`, margin, y);
  doc.text(`Due Date: ${formatDate(invoice.due_date)}`, margin + 70, y);
  y += 5;
  doc.text(`Payment Terms: ${invoice.payment_terms}`, margin, y);
  doc.text(`Source SO: ${invoice.quotation_number || '—'}`, margin + 70, y);
  y += 10;

  const colX = [margin, margin + 70, margin + 90, margin + 115, margin + 140, margin + 160];
  doc.setFillColor(...COLORS.tableHeader);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.charcoal);
  const headers = ['Product', 'Qty', 'UoM', 'Price', 'Tax%', 'Amount'];
  headers.forEach((h, i) => {
    doc.text(h, colX[i], y + 5.5);
  });
  y += 10;

  doc.setFont('helvetica', 'normal');
  for (const line of invoice.lines) {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    doc.setTextColor(...COLORS.charcoal);
    doc.text(String(line.product_name || '').slice(0, 36), colX[0], y);
    doc.text(String(line.quantity), colX[1], y);
    doc.text(String(line.uom).slice(0, 8), colX[2], y);
    doc.text(money(line.unit_price), colX[3], y);
    doc.text(String(line.taxes), colX[4], y);
    doc.text(money(line.line_total), colX[5], y);
    y += 6;
  }

  y += 6;
  doc.setDrawColor(...COLORS.border);
  doc.line(pageW - margin - 70, y, pageW - margin, y);
  y += 6;
  doc.setFontSize(9);
  const totals: [string, string][] = [
    ['Untaxed', money(invoice.untaxed_amount)],
    ['Taxes', money(invoice.tax_amount)],
    ['Total', money(invoice.total_amount)],
  ];
  for (const [label, value] of totals) {
    doc.setTextColor(...COLORS.muted);
    doc.text(label, pageW - margin - 55, y);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont('helvetica', 'bold');
    doc.text(value, pageW - margin, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 6;
  }

  if (invoice.notes) {
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('Notes', margin, y);
    y += 4;
    const split = doc.splitTextToSize(invoice.notes, pageW - margin * 2);
    doc.text(split, margin, y);
  }

  const dataUrl = doc.output('datauristring');
  if (options.download) {
    doc.save(`${invoice.invoice_number || 'invoice'}.pdf`);
  }
  if (options.openPrintDialog) {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const w = window.open(url);
    w?.addEventListener('load', () => {
      w.print();
    });
  } else if (!options.download && options.openInNewTab !== false) {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  return { dataUrl };
}
