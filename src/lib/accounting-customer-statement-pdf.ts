import type { CustomerBalanceSummary } from '@/app/actions/accounting/customer-accounting';
import { LOGISTIX_LOGO_PATH } from '@/lib/logistix-logo';
import { SALES_CURRENCY } from '@/lib/sales-quotation-form';

type StatementPayload = CustomerBalanceSummary & {
  opening_balance: number;
  closing_balance: number;
  generated_at: string;
  entries: {
    date: string;
    reference: string;
    debit: number;
    credit: number;
    balance: number;
  }[];
};

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: SALES_CURRENCY,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export async function generateCustomerStatementPdf(
  statement: StatementPayload,
  options: {
    download?: boolean;
    openPrintDialog?: boolean;
    openInNewTab?: boolean;
    generatedBy?: string | null;
  } = {}
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  try {
    const res = await fetch(
      typeof window !== 'undefined'
        ? `${window.location.origin}${LOGISTIX_LOGO_PATH}`
        : LOGISTIX_LOGO_PATH
    );
    if (res.ok) {
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(blob);
      });
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, 'JPEG', margin, y, 18, 18);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(statement.organization_name || 'Company', margin + 22, y + 8);
  doc.setFontSize(16);
  doc.setTextColor(1, 126, 132);
  doc.text('CUSTOMER STATEMENT', pageW - margin, y + 8, { align: 'right' });
  doc.setTextColor(33, 37, 41);
  y += 26;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(statement.customer_name, margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(108, 117, 125);
  doc.text(`Customer ID: ${statement.customer_lead_id || '—'}`, margin, y);
  y += 4;
  doc.text(`Organization: ${statement.organization_name || '—'}`, margin, y);
  y += 8;

  const summary: [string, string][] = [
    ['Opening Balance', money(statement.opening_balance)],
    ['Total Invoices', money(statement.invoice_total)],
    ['Total Payments', money(statement.payment_total)],
    ['Credit Notes', money(statement.credit_note_total)],
    ['Outstanding', money(statement.outstanding_balance)],
    ['Closing Balance', money(statement.closing_balance)],
  ];
  for (const [label, value] of summary) {
    doc.setTextColor(108, 117, 125);
    doc.text(label, margin, y);
    doc.setTextColor(33, 37, 41);
    doc.text(value, pageW - margin, y, { align: 'right' });
    y += 5;
  }

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Date', margin, y);
  doc.text('Reference', margin + 28, y);
  doc.text('Debit', pageW - margin - 55, y);
  doc.text('Credit', pageW - margin - 30, y);
  doc.text('Balance', pageW - margin, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'normal');

  for (const row of statement.entries) {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    doc.text(row.date || '—', margin, y);
    doc.text(String(row.reference || '').slice(0, 28), margin + 28, y);
    doc.text(money(row.debit), pageW - margin - 55, y);
    doc.text(money(row.credit), pageW - margin - 30, y);
    doc.text(money(row.balance), pageW - margin, y, { align: 'right' });
    y += 4.5;
  }

  y += 10;
  doc.setFontSize(7);
  doc.setTextColor(108, 117, 125);
  doc.text(
    `Generated ${new Date(statement.generated_at).toLocaleString()} · ${options.generatedBy || 'System'}`,
    margin,
    Math.max(y, 285)
  );

  const dataUrl = doc.output('datauristring');
  if (options.download) doc.save(`statement-${statement.customer_lead_id || 'customer'}.pdf`);
  if (options.openPrintDialog) {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const w = window.open(url);
    w?.addEventListener('load', () => w.print());
  } else if (!options.download && options.openInNewTab !== false) {
    window.open(URL.createObjectURL(doc.output('blob')), '_blank');
  }
  return { dataUrl };
}
