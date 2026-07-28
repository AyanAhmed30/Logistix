import type { AccountingInvoiceDetail } from '@/app/actions/accounting/invoices';
import { LOGISTIX_LOGO_PATH } from '@/lib/logistix-logo';
import { paymentStateLabel } from '@/lib/accounting-payments';
import { SALES_CURRENCY } from '@/lib/sales-quotation-form';

const COLORS = {
  charcoal: [33, 37, 41] as [number, number, number],
  muted: [108, 117, 125] as [number, number, number],
  border: [222, 226, 230] as [number, number, number],
  tableHeader: [230, 244, 245] as [number, number, number],
  accent: [1, 126, 132] as [number, number, number],
  light: [248, 249, 250] as [number, number, number],
};

export type GenerateAccountingInvoicePdfOptions = {
  download?: boolean;
  openPrintDialog?: boolean;
  openInNewTab?: boolean;
  generatedBy?: string | null;
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
    currency: SALES_CURRENCY,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function splitMultiline(text: string | null | undefined) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Professional Odoo-inspired Accounting Invoice PDF.
 * Used for Preview, Print, and Send — one template only.
 */
export async function generateAccountingInvoicePdf(
  invoice: AccountingInvoiceDetail,
  options: GenerateAccountingInvoicePdfOptions = {}
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
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
      doc.addImage(logoData, 'JPEG', margin, y, 22, 22);
    } catch {
      try {
        doc.addImage(logoData, 'PNG', margin, y, 22, 22);
      } catch {
        // ignore
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(invoice.organization_name || 'Company', margin + 26, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  let cy = y + 12;
  for (const line of [
    invoice.company_address,
    invoice.company_phone ? `Tel: ${invoice.company_phone}` : null,
    invoice.company_email,
    invoice.company_website,
  ].filter(Boolean) as string[]) {
    doc.text(line, margin + 26, cy);
    cy += 3.8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.accent);
  doc.text('INVOICE', pageW - margin, y + 8, { align: 'right' });
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(invoice.invoice_number, pageW - margin, y + 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `Status: ${String(invoice.status).replace(/_/g, ' ')} · ${paymentStateLabel(invoice.payment_state)}`,
    pageW - margin,
    y + 20,
    { align: 'right' }
  );

  y = Math.max(cy, y + 28) + 6;
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Customer + Invoice meta
  const leftX = margin;
  const rightX = pageW / 2 + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.accent);
  doc.text('Bill To', leftX, y);
  doc.text('Invoice Details', rightX, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(invoice.customer_name || '—', leftX, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  const customerLines = [
    invoice.customer_lead_id ? `Customer ID: ${invoice.customer_lead_id}` : null,
    invoice.contact_person_name ? `Contact: ${invoice.contact_person_name}` : null,
    invoice.email,
    invoice.phone,
    ...splitMultiline(invoice.billing_address),
  ].filter(Boolean) as string[];

  let leftY = y;
  for (const line of customerLines) {
    const wrapped = doc.splitTextToSize(line, pageW / 2 - margin - 6);
    doc.text(wrapped, leftX, leftY);
    leftY += wrapped.length * 3.6;
  }

  if (invoice.shipping_address && invoice.shipping_address !== invoice.billing_address) {
    leftY += 2;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.accent);
    doc.text('Ship To', leftX, leftY);
    leftY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    for (const line of splitMultiline(invoice.shipping_address)) {
      const wrapped = doc.splitTextToSize(line, pageW / 2 - margin - 6);
      doc.text(wrapped, leftX, leftY);
      leftY += wrapped.length * 3.6;
    }
  }

  const meta: [string, string][] = [
    ['Invoice Date', formatDate(invoice.invoice_date)],
    ['Due Date', formatDate(invoice.due_date)],
    ['Payment Terms', invoice.payment_terms || 'Immediate'],
    ['Salesperson', invoice.salesperson_name || '—'],
    ['Sales Order', invoice.sales_order_number || '—'],
    ['Quotation', invoice.quotation_number || '—'],
    ['Organization', invoice.organization_name || '—'],
    ['Amount Due', money(invoice.amount_residual)],
  ];

  let rightY = y;
  doc.setFontSize(8);
  for (const [label, value] of meta) {
    doc.setTextColor(...COLORS.muted);
    doc.text(`${label}:`, rightX, rightY);
    doc.setTextColor(...COLORS.charcoal);
    doc.text(value, pageW - margin, rightY, { align: 'right' });
    rightY += 4.2;
  }

  y = Math.max(leftY, rightY) + 8;

  // Products table
  const colW = [48, 42, 14, 16, 22, 14, 12, 22];
  const headers = ['Product', 'Description', 'Qty', 'UOM', 'Price', 'Disc%', 'Tax%', 'Total'];
  let x = margin;
  doc.setFillColor(...COLORS.tableHeader);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.charcoal);
  headers.forEach((h, i) => {
    doc.text(h, x + 1, y + 5.2);
    x += colW[i];
  });
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  for (const line of invoice.lines) {
    if (y > pageH - 55) {
      doc.addPage();
      y = margin;
    }
    x = margin;
    const cells = [
      String(line.product_name || '').slice(0, 28),
      String(line.description || '').slice(0, 24),
      String(line.quantity),
      String(line.uom || '').slice(0, 8),
      money(line.unit_price),
      String(line.discount),
      String(line.taxes),
      money(line.line_total),
    ];
    doc.setTextColor(...COLORS.charcoal);
    cells.forEach((cell, i) => {
      doc.text(cell, x + 1, y);
      x += colW[i];
    });
    y += 5.5;
  }

  y += 4;
  doc.setDrawColor(...COLORS.border);
  doc.line(pageW - margin - 70, y, pageW - margin, y);
  y += 6;

  const totals: [string, string][] = [
    ['Subtotal', money(invoice.untaxed_amount)],
    ['Taxes', money(invoice.tax_amount)],
    ['Grand Total', money(invoice.total_amount)],
    ['Amount Paid', money(invoice.amount_paid)],
    ['Outstanding', money(invoice.amount_residual)],
  ];
  for (const [label, value] of totals) {
    const isGrand = label === 'Grand Total' || label === 'Outstanding';
    doc.setFont('helvetica', isGrand ? 'bold' : 'normal');
    doc.setFontSize(isGrand ? 10 : 9);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, pageW - margin - 55, y);
    doc.setTextColor(...COLORS.charcoal);
    doc.text(value, pageW - margin, y, { align: 'right' });
    y += 5.5;
  }

  if (invoice.customer_notes) {
    y += 4;
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.accent);
    doc.text('Notes', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.muted);
    const split = doc.splitTextToSize(invoice.customer_notes, pageW - margin * 2);
    doc.text(split, margin, y);
    y += split.length * 3.8 + 4;
  }

  // Footer block
  if (y > pageH - 48) {
    doc.addPage();
    y = margin;
  } else {
    y = Math.max(y + 8, pageH - 48);
  }

  doc.setDrawColor(...COLORS.border);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.charcoal);
  doc.text('Terms & Conditions', margin, y);
  doc.text('Authorized Signature', pageW - margin - 50, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  const terms = doc.splitTextToSize(
    invoice.payment_terms
      ? `Payment terms: ${invoice.payment_terms}. Please include the invoice number with your payment.`
      : 'Please include the invoice number with your payment.',
    100
  );
  doc.text(terms, margin, y);
  doc.line(pageW - margin - 50, y + 12, pageW - margin, y + 12);

  y += 18;
  doc.setFontSize(7);
  doc.text(
    `Generated ${new Date().toLocaleString()} · ${options.generatedBy || 'System'} · ${invoice.organization_name || ''}`,
    margin,
    y
  );

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
