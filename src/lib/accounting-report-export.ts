/**
 * Client-side report export helpers (CSV / Excel SpreadsheetML / PDF via jsPDF).
 */

export type ExportColumn = { key: string; label: string };

function escapeCsv(v: unknown) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRowsAsCsv(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[]
) {
  const header = columns.map((c) => escapeCsv(c.label)).join(',');
  const lines = rows.map((r) =>
    columns.map((c) => escapeCsv(r[c.key])).join(',')
  );
  const bom = '\uFEFF';
  downloadTextFile(filename, bom + [header, ...lines].join('\n'), 'text/csv;charset=utf-8');
}

/** Excel-compatible SpreadsheetML (.xls) — opens in Excel without extra deps. */
export function exportRowsAsExcel(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  sheetName = 'Report'
) {
  const escapeXml = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const header = columns
    .map((c) => `<Cell><Data ss:Type="String">${escapeXml(c.label)}</Data></Cell>`)
    .join('');
  const body = rows
    .map((r) => {
      const cells = columns
        .map((c) => {
          const val = r[c.key];
          const isNum = typeof val === 'number' && Number.isFinite(val);
          return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${escapeXml(
            val
          )}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table>
   <Row>${header}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;

  downloadTextFile(
    filename.endsWith('.xls') ? filename : `${filename}.xls`,
    xml,
    'application/vnd.ms-excel'
  );
}

export async function exportRowsAsPdf(
  title: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  filename: string
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 10;
  let y = margin;
  doc.setFontSize(14);
  doc.setTextColor(1, 126, 132);
  doc.text(title, margin, y);
  y += 8;
  doc.setTextColor(33, 37, 41);
  doc.setFontSize(8);

  const colW = (doc.internal.pageSize.getWidth() - margin * 2) / Math.max(1, columns.length);
  doc.setFont('helvetica', 'bold');
  columns.forEach((c, i) => {
    doc.text(c.label, margin + i * colW, y, { maxWidth: colW - 2 });
  });
  y += 5;
  doc.setFont('helvetica', 'normal');

  for (const row of rows.slice(0, 80)) {
    if (y > doc.internal.pageSize.getHeight() - 12) {
      doc.addPage();
      y = margin;
    }
    columns.forEach((c, i) => {
      doc.text(String(row[c.key] ?? ''), margin + i * colW, y, { maxWidth: colW - 2 });
    });
    y += 4.5;
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
