import type { AccountingInvoiceDetail } from '@/app/actions/accounting/invoices';
import {
  getLogistixLogoImageFormat,
  LOGISTIX_LOGO_PATH,
  LOGISTIX_LOGO_PDF_HEIGHT,
  LOGISTIX_LOGO_PDF_WIDTH,
} from '@/lib/logistix-logo';

export type GenerateAccountingInvoicePdfOptions = {
  download?: boolean;
  openPrintDialog?: boolean;
  openInNewTab?: boolean;
  generatedBy?: string | null;
};

/** Brand accent only — layout mirrors Odoo ReportLab invoice. */
const THEME: [number, number, number] = [1, 126, 132]; // #017e84
const INK: [number, number, number] = [0, 0, 0];
const MUTED: [number, number, number] = [80, 80, 80];

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

/** Odoo: Rs. 7,020.00 */
function rs(n: number) {
  return `Rs. ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0)}`;
}

/** Odoo: 78.00 */
function num2(n: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

/** Odoo: 08/12/2026 */
function mdY(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function addressLines(text: string | null | undefined): string[] {
  const raw = String(text || '').trim();
  if (!raw) return [];
  if (raw.includes('\n')) {
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  // Avoid dumping one huge comma line — break into readable chunks
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return [raw];
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    out.push(parts.slice(i, i + 2).join(', '));
  }
  return out;
}

/** Odoo Amount column = untaxed (qty × price × (1 − discount%)). */
function lineUntaxed(line: {
  quantity: number;
  unit_price: number;
  discount: number;
}) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const disc = Number(line.discount) || 0;
  return Math.round(qty * price * (1 - disc / 100) * 100) / 100;
}

/**
 * Odoo invoice pattern (exact structure from INV_26-27_0001):
 *
 * [LOGO] Company Name
 *        Company address
 *
 * Customer name / address
 *
 * Invoice INV/…
 * Invoice Date          Due Date
 * MM/DD/YYYY            MM/DD/YYYY
 *
 * Description | Quantity | Unit Price | Taxes | Amount
 * …
 *
 * Payment Communication: INV/…     Untaxed Amount
 *                                  General Sales Tax
 *                                  Total
 *
 *              company@email
 *               Page X / Y
 *
 * Theme: Logistix logo + teal title only.
 */
export async function generateAccountingInvoicePdf(
  invoice: AccountingInvoiceDetail,
  options: GenerateAccountingInvoicePdfOptions = {}
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 595.28
  const pageH = doc.internal.pageSize.getHeight(); // 841.89

  // Odoo-like margins (~62pt content start)
  const left = 62;
  const right = pageW - 40;
  let y = 50; // jsPDF: origin top-left, y grows downward

  const logoUrl = invoice.logo_url || LOGISTIX_LOGO_PATH;
  const resolvedLogo =
    logoUrl.startsWith('http') || logoUrl.startsWith('data:')
      ? logoUrl
      : typeof window !== 'undefined'
        ? `${window.location.origin}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`
        : logoUrl;
  const logoData = await loadImageAsDataUrl(resolvedLogo);

  const logoW = Math.min(LOGISTIX_LOGO_PDF_WIDTH * 2.8346, 110);
  const logoH = LOGISTIX_LOGO_PDF_HEIGHT * 2.8346;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 50) {
      doc.addPage();
      y = 50;
      return true;
    }
    return false;
  };

  // ─────────────────────────────────────────────
  // 1) HEADER: Logo + company name/address (left)
  // ─────────────────────────────────────────────
  let companyX = left;
  const headerY = y;

  if (logoData) {
    try {
      doc.addImage(
        logoData,
        getLogistixLogoImageFormat(logoData),
        40,
        headerY - 6,
        logoW,
        logoH
      );
      companyX = 40 + logoW + 10;
    } catch {
      try {
        doc.addImage(logoData, 'JPEG', 40, headerY - 6, logoW, logoH);
        companyX = 40 + logoW + 10;
      } catch {
        /* ignore */
      }
    }
  }

  // Company name — 15pt bold (Odoo)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  const companyName = String(invoice.organization_name || 'Company').trim();
  const nameWidth = Math.max(160, right - companyX - 20);
  const nameLines = doc.splitTextToSize(companyName, nameWidth);
  doc.text(nameLines, companyX, y);
  y += nameLines.length * 16;

  // Company address — 9pt (Odoo)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  for (const line of addressLines(invoice.company_address).slice(0, 4)) {
    doc.text(line, companyX, y);
    y += 12;
  }
  // Keep company block at least as tall as logo
  if (logoData) {
    y = Math.max(y, headerY + logoH + 8);
  }
  y += 18;

  // ─────────────────────────────────────────────
  // 2) CUSTOMER DETAILS — professional label/value table
  // ─────────────────────────────────────────────
  const customerName = String(invoice.customer_name || '').trim();
  const customerAddress = addressLines(invoice.billing_address)
    .filter(
      (line) =>
        !customerName || line.toLowerCase() !== customerName.toLowerCase()
    )
    .join(', ');
  const customerEmail = String(invoice.email || '').trim();
  const customerPhone = String(invoice.phone || '').trim();
  const contactPerson = String(invoice.contact_person_name || '').trim();

  const customerRows: Array<{ label: string; value: string }> = [];
  if (customerName) customerRows.push({ label: 'Customer', value: customerName });
  if (contactPerson && contactPerson.toLowerCase() !== customerName.toLowerCase()) {
    customerRows.push({ label: 'Contact', value: contactPerson });
  }
  if (customerAddress) customerRows.push({ label: 'Address', value: customerAddress });
  if (customerEmail) customerRows.push({ label: 'Email', value: customerEmail });
  if (customerPhone) customerRows.push({ label: 'Phone', value: customerPhone });

  if (customerRows.length) {
    const tableX = left;
    const tableW = right - left;
    const labelW = 78;
    const valueX = tableX + labelW + 8;
    const valueW = tableW - labelW - 16;
    const padY = 7;
    const rowGap = 2;

    // Section title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...THEME);
    doc.text('CUSTOMER DETAILS', tableX, y);
    y += 8;

    // Top rule
    doc.setDrawColor(...THEME);
    doc.setLineWidth(1);
    doc.line(tableX, y, tableX + tableW, y);
    y += padY + 2;

    for (let i = 0; i < customerRows.length; i++) {
      const row = customerRows[i];
      const valueLines = doc.splitTextToSize(row.value, valueW);
      const rowH = Math.max(12, valueLines.length * 11);

      ensureSpace(rowH + padY + 6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(row.label, tableX + 2, y + 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text(valueLines, valueX, y + 8);

      y += rowH + padY;

      // Subtle row separator (not after last)
      if (i < customerRows.length - 1) {
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.4);
        doc.line(tableX, y - rowGap, tableX + tableW, y - rowGap);
      }
    }

    // Bottom rule
    doc.setDrawColor(...THEME);
    doc.setLineWidth(0.7);
    doc.line(tableX, y, tableX + tableW, y);
    y += 20;
  } else {
    y += 10;
  }

  // ─────────────────────────────────────────────
  // 3) DOCUMENT TITLE — left, large (Odoo: below customer)
  // ─────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(22);
  doc.setTextColor(...THEME);
  doc.text(`Invoice ${invoice.invoice_number || ''}`.trim(), left, y);
  y += 28;

  // ─────────────────────────────────────────────
  // 4) DATES — two columns side by side (Odoo)
  // ─────────────────────────────────────────────
  const dateCol1 = left;
  const dateCol2 = 300;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text('Invoice Date', dateCol1, y);
  doc.text('Due Date', dateCol2, y);
  y += 13;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(mdY(invoice.invoice_date) || '—', dateCol1, y);
  doc.text(
    mdY(invoice.due_date) || mdY(invoice.invoice_date) || '—',
    dateCol2,
    y
  );
  y += 28;

  // ─────────────────────────────────────────────
  // 5) TABLE — Odoo column x positions
  // ─────────────────────────────────────────────
  // From Odoo PDF: 62.4, 222.3, 307.0, 382.3, 438.8
  const col = {
    desc: left,
    qty: 222,
    price: 307,
    taxes: 382,
    amount: 439,
  };

  const drawTableHeader = () => {
    ensureSpace(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('Description', col.desc, y);
    doc.text('Quantity', col.qty, y);
    doc.text('Unit Price', col.price, y);
    doc.text('Taxes', col.taxes, y);
    doc.text('Amount', col.amount, y);
    y += 5;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.6);
    doc.line(left, y, right, y);
    y += 14;
  };

  drawTableHeader();

  const productLines = (invoice.lines || []).filter((l) => {
    const name = String(l.product_name || '').trim();
    return Boolean(name) || Number(l.quantity) > 0 || Number(l.unit_price) > 0;
  });

  for (const line of productLines) {
    const title = String(line.product_name || 'Item').trim();
    const descRaw = String(line.description || '').trim();
    // Odoo shows product name; only add description if different and useful
    const showDesc =
      descRaw &&
      descRaw.toLowerCase() !== title.toLowerCase() &&
      descRaw.toLowerCase() !== 'product';
    const label = showDesc ? `${title}\n${descRaw}` : title;
    const descLines = doc.splitTextToSize(label, col.qty - col.desc - 8);
    const rowH = Math.max(16, descLines.length * 11 + 4);

    if (ensureSpace(rowH + 10)) drawTableHeader();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(descLines, col.desc, y);

    const taxPct = Number(line.taxes) || 0;
    const untaxed = lineUntaxed(line);

    doc.text(num2(Number(line.quantity) || 0), col.qty, y);
    doc.text(num2(Number(line.unit_price) || 0), col.price, y);
    doc.text(taxPct ? `${taxPct}%` : '', col.taxes, y);
    doc.text(rs(untaxed), col.amount, y);

    y += rowH;
  }

  y += 8;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 20;

  // ─────────────────────────────────────────────
  // 6) Payment Communication + Totals (Odoo)
  // ─────────────────────────────────────────────
  ensureSpace(72);
  const totalsTop = y;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const payLabel = 'Payment Communication: ';
  doc.text(payLabel, left, y);
  doc.setFont('helvetica', 'bold');
  doc.text(
    String(invoice.invoice_number || ''),
    left + doc.getTextWidth(payLabel),
    y
  );

  // Optional bank (our ERP feature) — keep minimal under communication
  let leftY = y + 14;
  const bank = invoice.bank_account;
  if (bank?.name || bank?.account_mask) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const bits = [bank.name, bank.account_mask, bank.currency]
      .filter(Boolean)
      .join(' · ');
    if (bits) {
      doc.text(bits, left, leftY);
      leftY += 12;
    }
  }

  // Totals — Odoo x ~317 / ~425
  const tLabelX = 318;
  const tValueX = 425;
  let ty = totalsTop;

  const row = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 9.5);
    doc.setTextColor(...INK);
    doc.text(label, tLabelX, ty);
    doc.text(value, tValueX, ty);
    ty += bold ? 16 : 14;
  };

  row('Untaxed Amount', rs(Number(invoice.untaxed_amount) || 0));
  if (Number(invoice.tax_amount) > 0.004) {
    row('General Sales Tax', rs(Number(invoice.tax_amount) || 0));
  }
  row('Total', rs(Number(invoice.total_amount) || 0), true);

  if (Number(invoice.amount_paid) > 0.004) {
    row('Amount Paid', rs(Number(invoice.amount_paid) || 0));
    row('Amount Due', rs(Number(invoice.amount_residual) || 0), true);
  }

  y = Math.max(leftY, ty) + 12;

  // Notes only if present
  const notes = String(invoice.customer_notes || '').trim();
  if (notes) {
    ensureSpace(36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    for (const line of doc.splitTextToSize(notes, right - left)) {
      ensureSpace(12);
      doc.text(line, left, y);
      y += 12;
    }
  }

  // ─────────────────────────────────────────────
  // 7) FOOTER — email + Page X / Y centered (Odoo)
  // ─────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  const footerEmail = String(invoice.company_email || '').trim();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    if (footerEmail) {
      doc.text(footerEmail, pageW / 2, pageH - 34, { align: 'center' });
    }
    doc.text(`Page ${i} / ${pages}`, pageW / 2, pageH - 24, {
      align: 'center',
    });
  }

  const dataUrl = doc.output('datauristring');
  const fileName = `${String(invoice.invoice_number || 'invoice').replace(/\//g, '_')}_Invoice.pdf`;

  if (options.download) {
    doc.save(fileName);
  } else if (options.openPrintDialog && typeof window !== 'undefined') {
    const w = window.open(dataUrl);
    w?.addEventListener('load', () => w.print());
  } else if (options.openInNewTab !== false && typeof window !== 'undefined') {
    window.open(dataUrl, '_blank');
  }

  return { dataUrl };
}
