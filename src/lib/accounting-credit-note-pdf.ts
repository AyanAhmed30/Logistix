import type { AccountingCreditNoteDetail } from '@/app/actions/accounting/credit-notes';
import { LOGISTIX_LOGO_PATH } from '@/lib/logistix-logo';
import { SALES_CURRENCY } from '@/lib/sales-quotation-form';

const COLORS = {
  charcoal: [33, 37, 41] as [number, number, number],
  muted: [108, 117, 125] as [number, number, number],
  border: [222, 226, 230] as [number, number, number],
  tableHeader: [230, 244, 245] as [number, number, number],
  accent: [1, 126, 132] as [number, number, number],
};

export type GenerateCreditNotePdfOptions = {
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

export async function generateAccountingCreditNotePdf(
  creditNote: AccountingCreditNoteDetail,
  options: GenerateCreditNotePdfOptions = {}
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  const logoUrl = creditNote.logo_url || LOGISTIX_LOGO_PATH;
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
  doc.text(creditNote.organization_name || 'Company', margin + 26, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  let cy = y + 12;
  for (const line of [
    creditNote.company_address,
    creditNote.company_phone ? `Tel: ${creditNote.company_phone}` : null,
    creditNote.company_email,
    creditNote.company_website,
  ].filter(Boolean) as string[]) {
    doc.text(line, margin + 26, cy);
    cy += 3.8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.accent);
  doc.text('CREDIT NOTE', pageW - margin, y + 8, { align: 'right' });
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(creditNote.credit_note_number, pageW - margin, y + 15, { align: 'right' });

  y = Math.max(cy, y + 28) + 6;
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.accent);
  doc.text('Customer', margin, y);
  doc.text('Credit Note Details', pageW / 2 + 4, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(creditNote.customer_name || '—', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  let leftY = y + 5;
  for (const line of [
    creditNote.customer_lead_id ? `Customer ID: ${creditNote.customer_lead_id}` : null,
    creditNote.email,
    creditNote.phone,
  ].filter(Boolean) as string[]) {
    doc.text(line, margin, leftY);
    leftY += 4;
  }

  let rightY = y;
  const meta: [string, string][] = [
    ['Date', formatDate(creditNote.credit_note_date)],
    ['Status', creditNote.status],
    ['Type', creditNote.refund_type],
    ['Original Invoice', creditNote.invoice_number || '—'],
    ['Reason', creditNote.reason || '—'],
    ['Organization', creditNote.organization_name || '—'],
  ];
  for (const [label, value] of meta) {
    doc.setTextColor(...COLORS.muted);
    doc.text(`${label}:`, pageW / 2 + 4, rightY);
    doc.setTextColor(...COLORS.charcoal);
    doc.text(String(value).slice(0, 36), pageW - margin, rightY, { align: 'right' });
    rightY += 4.2;
  }

  y = Math.max(leftY, rightY) + 8;

  const colW = [55, 50, 18, 18, 25, 24];
  const headers = ['Product', 'Description', 'Qty', 'UOM', 'Price', 'Total'];
  let x = margin;
  doc.setFillColor(...COLORS.tableHeader);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.charcoal);
  headers.forEach((h, i) => {
    doc.text(h, x + 1, y + 5.2);
    x += colW[i];
  });
  y += 10;

  doc.setFont('helvetica', 'normal');
  for (const line of creditNote.lines) {
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }
    x = margin;
    const cells = [
      String(line.product_name || '').slice(0, 30),
      String(line.description || '').slice(0, 28),
      String(line.quantity),
      String(line.uom || '').slice(0, 8),
      money(line.unit_price),
      money(line.line_total),
    ];
    cells.forEach((cell, i) => {
      doc.text(cell, x + 1, y);
      x += colW[i];
    });
    y += 5.5;
  }

  y += 6;
  const totals: [string, string][] = [
    ['Untaxed', money(creditNote.untaxed_amount)],
    ['Taxes', money(creditNote.tax_amount)],
    ['Credit Total', money(creditNote.total_amount)],
    ['Refunded', money(creditNote.amount_refunded)],
  ];
  for (const [label, value] of totals) {
    doc.setTextColor(...COLORS.muted);
    doc.text(label, pageW - margin - 55, y);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont('helvetica', 'bold');
    doc.text(value, pageW - margin, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 5.5;
  }

  y = Math.max(y + 10, pageH - 30);
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `Generated ${new Date().toLocaleString()} · ${options.generatedBy || 'System'} · ${creditNote.organization_name || ''}`,
    margin,
    y
  );

  const dataUrl = doc.output('datauristring');
  if (options.download) {
    doc.save(`${creditNote.credit_note_number || 'credit-note'}.pdf`);
  }
  if (options.openPrintDialog) {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const w = window.open(url);
    w?.addEventListener('load', () => w.print());
  } else if (!options.download && options.openInNewTab !== false) {
    const blob = doc.output('blob');
    window.open(URL.createObjectURL(blob), '_blank');
  }

  return { dataUrl };
}
