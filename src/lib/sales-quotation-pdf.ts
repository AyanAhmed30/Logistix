import type { SalesQuotationPdfPayload } from '@/app/actions/sales/quotation-pdf';
import { LOGISTIX_LOGO_PATH } from '@/lib/logistix-logo';
import {
  createErpPdfContext,
  drawPdfHairline,
  drawPdfHeader,
  drawPdfPartyBlock,
  drawPdfSection,
  drawPdfTableHeader,
  drawPdfTableRow,
  drawPdfTotals,
  finalizePdfPages,
  formatPdfDate,
  formatPdfMoney,
  loadPdfImageDataUrl,
  pdfMultiline,
  type ErpPdfDoc,
  type ErpPdfTableColumn,
} from '@/lib/erp-document-pdf';

export type GenerateSalesQuotationPdfOptions = {
  download?: boolean;
  openPrintDialog?: boolean;
  /** When true, only return dataUrl — do not download, print, or open a tab. */
  silent?: boolean;
};

/**
 * Minimal professional Quotation PDF — corporate, print-friendly.
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

  const logoUrl = payload.organization.logoUrl || LOGISTIX_LOGO_PATH;
  const logoData = await loadPdfImageDataUrl(
    logoUrl.startsWith('http') || logoUrl.startsWith('data:')
      ? logoUrl
      : typeof window !== 'undefined'
        ? `${window.location.origin}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`
        : logoUrl
  );

  const companyLines = [
    ...pdfMultiline(payload.organization.address),
    [payload.organization.email, payload.organization.phone]
      .filter(Boolean)
      .join(' · '),
    payload.organization.website || '',
  ].filter(Boolean);

  drawPdfHeader(ctx, {
    logoData,
    companyName: payload.organization.name || 'Company',
    companyLines,
    docTitle: 'QUOTATION',
    docNumber: payload.quotation.number || '—',
    metaRight: [
      ['Date', formatPdfDate(payload.quotation.date)],
      ['Valid until', formatPdfDate(payload.quotation.expiration)],
    ],
  });

  const half = ctx.contentW / 2 - 4;
  const customerLines = [
    payload.customer.company || '',
    payload.customer.contactPerson
      ? `Attn: ${payload.customer.contactPerson}`
      : '',
    ...pdfMultiline(payload.customer.invoiceAddress),
    payload.customer.email ? `Email: ${payload.customer.email}` : '',
    payload.customer.phone ? `Phone: ${payload.customer.phone}` : '',
  ].filter(Boolean);

  const shipLines = pdfMultiline(payload.customer.deliveryAddress);
  const leftEnd = drawPdfPartyBlock(ctx, {
    title: 'Bill To',
    name: payload.customer.name || '—',
    lines: customerLines,
    x: ctx.margin,
    width: half,
  });
  const rightEnd = shipLines.length
    ? drawPdfPartyBlock(ctx, {
        title: 'Ship To',
        name: payload.customer.name || '—',
        lines: shipLines,
        x: ctx.margin + half + 8,
        width: half,
      })
    : ctx.y;
  ctx.y = Math.max(leftEnd, rightEnd) + 6;

  // Meta row
  const metaBits = [
    payload.quotation.salesperson
      ? `Salesperson: ${payload.quotation.salesperson}`
      : '',
    payload.quotation.customerReference
      ? `Reference: ${payload.quotation.customerReference}`
      : '',
    payload.quotation.paymentTerms
      ? `Payment Terms: ${payload.quotation.paymentTerms}`
      : '',
  ].filter(Boolean);
  if (metaBits.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 115);
    doc.text(metaBits.join('   ·   '), ctx.margin, ctx.y);
    ctx.y += 6;
  }

  drawPdfHairline(ctx);
  ctx.y += 5;

  const hasDiscount = payload.lines.some((l) => Number(l.discount) > 0);
  const hasDelivered = payload.lines.some(
    (l) => l.qtyDelivered != null && Number(l.qtyDelivered) > 0
  );

  const columns: ErpPdfTableColumn[] = [
    { key: 'desc', label: 'Description', width: hasDelivered ? 68 : 78 },
    { key: 'qty', label: 'Qty', width: 16, align: 'right' },
  ];
  if (hasDelivered) {
    columns.push({ key: 'deliv', label: 'Deliv.', width: 16, align: 'right' });
  }
  columns.push(
    { key: 'price', label: 'Unit Price', width: 28, align: 'right' },
    ...(hasDiscount
      ? [{ key: 'disc', label: 'Disc%', width: 14, align: 'right' as const }]
      : []),
    { key: 'tax', label: 'Tax%', width: 14, align: 'right' },
    { key: 'amt', label: 'Amount', width: hasDiscount ? 22 : 28, align: 'right' }
  );

  // Normalize widths to contentW
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const scale = ctx.contentW / totalW;
  columns.forEach((c) => {
    c.width = Math.round(c.width * scale * 10) / 10;
  });

  const drawHeader = () => drawPdfTableHeader(ctx, columns);
  drawHeader();

  for (const line of payload.lines) {
    const title = String(line.product || 'Product');
    const extra =
      line.description && line.description !== title
        ? `\n${line.description}`
        : '';
    drawPdfTableRow(
      ctx,
      columns,
      {
        desc: `${title}${extra}`,
        qty: String(line.quantity ?? ''),
        deliv:
          line.qtyDelivered != null ? String(line.qtyDelivered) : '',
        price: formatPdfMoney(Number(line.unitPrice) || 0),
        disc: String(line.discount ?? 0),
        tax: String(line.taxes ?? 0),
        amt: formatPdfMoney(Number(line.lineTotal) || 0),
      },
      { repeatHeader: drawHeader }
    );
  }

  const totals: Array<{ label: string; value: string; emphasize?: boolean }> = [
    {
      label: 'Subtotal',
      value: formatPdfMoney(Number(payload.totals.untaxed) || 0),
    },
  ];
  if (Number(payload.totals.discount) > 0) {
    totals.push({
      label: 'Discount',
      value: formatPdfMoney(Number(payload.totals.discount) || 0),
    });
  }
  totals.push({
    label: 'Tax',
    value: formatPdfMoney(Number(payload.totals.tax) || 0),
  });
  totals.push({
    label: 'Total',
    value: formatPdfMoney(Number(payload.totals.total) || 0),
    emphasize: true,
  });
  drawPdfTotals(ctx, totals);

  if (payload.quotation.paymentTerms) {
    drawPdfSection(ctx, 'Payment Terms', payload.quotation.paymentTerms);
  }
  drawPdfSection(ctx, 'Notes', payload.quotation.customerNotes);

  finalizePdfPages(
    ctx,
    [
      payload.organization.name,
      payload.organization.phone,
      payload.organization.email,
    ]
      .filter(Boolean)
      .join(' · ')
  );

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
