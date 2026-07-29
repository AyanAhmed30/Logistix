import type { AccountingBillDetail } from '@/app/actions/accounting/bills';
import { LOGISTIX_LOGO_PATH } from '@/lib/logistix-logo';
import { SALES_CURRENCY } from '@/lib/sales-quotation-form';

export type GenerateAccountingBillPdfOptions = {
  download?: boolean;
  openPrintDialog?: boolean;
  openInNewTab?: boolean;
};

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: SALES_CURRENCY,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

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

/** Vendor Bill PDF — Logistix theme, Odoo-like layout. */
export async function generateAccountingBillPdf(
  bill: AccountingBillDetail,
  options: GenerateAccountingBillPdfOptions = {}
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  const logoUrl = bill.logo_url || LOGISTIX_LOGO_PATH;
  const logoData = await loadImageAsDataUrl(
    logoUrl.startsWith('http') || logoUrl.startsWith('data:')
      ? logoUrl
      : typeof window !== 'undefined'
        ? `${window.location.origin}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`
        : logoUrl
  );
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', margin, y, 28, 10);
    } catch {
      // ignore
    }
  }

  doc.setFontSize(16);
  doc.setTextColor(1, 126, 132);
  doc.text('Vendor Bill', pageW - margin, y + 6, { align: 'right' });
  y += 16;

  doc.setFontSize(10);
  doc.setTextColor(33, 37, 41);
  doc.text(bill.organization_name || 'Organization', margin, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(108, 117, 125);
  doc.text(`Bill: ${bill.bill_number}`, pageW - margin, y, { align: 'right' });
  doc.text(`Date: ${bill.bill_date || '—'}`, pageW - margin, y + 5, { align: 'right' });
  y += 12;

  doc.setTextColor(33, 37, 41);
  doc.setFontSize(10);
  doc.text('Vendor', margin, y);
  y += 5;
  doc.setFontSize(9);
  doc.text(bill.vendor_name || '—', margin, y);
  y += 4;
  if (bill.vendor_lead_id) {
    doc.text(`ID: ${bill.vendor_lead_id}`, margin, y);
    y += 4;
  }
  if (bill.billing_address) {
    for (const line of bill.billing_address.split(/\n/).filter(Boolean)) {
      doc.text(line, margin, y);
      y += 4;
    }
  }
  y += 6;

  const colX = [margin, margin + 55, margin + 75, margin + 95, margin + 120, margin + 145];
  doc.setFillColor(230, 244, 245);
  doc.rect(margin, y, pageW - margin * 2, 7, 'F');
  doc.setFontSize(8);
  doc.setTextColor(1, 126, 132);
  ['Product', 'Qty', 'UOM', 'Price', 'Tax%', 'Amount'].forEach((h, i) => {
    doc.text(h, colX[i], y + 5);
  });
  y += 10;

  doc.setTextColor(33, 37, 41);
  for (const line of bill.lines) {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    doc.text(String(line.product_name || '').slice(0, 28), colX[0], y);
    doc.text(String(line.quantity), colX[1], y);
    doc.text(String(line.uom || ''), colX[2], y);
    doc.text(money(line.unit_price), colX[3], y);
    doc.text(String(line.taxes), colX[4], y);
    doc.text(money(line.line_total), colX[5], y);
    y += 5;
  }

  y += 8;
  doc.setFontSize(10);
  doc.text(`Untaxed: ${money(bill.untaxed_amount)}`, pageW - margin, y, { align: 'right' });
  y += 5;
  doc.text(`Tax: ${money(bill.tax_amount)}`, pageW - margin, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${money(bill.total_amount)}`, pageW - margin, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  if (options.openPrintDialog) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else if (options.openInNewTab) {
    window.open(doc.output('bloburl'), '_blank');
  } else if (options.download) {
    doc.save(`${bill.bill_number || 'bill'}.pdf`);
  } else {
    window.open(doc.output('bloburl'), '_blank');
  }
}
