import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SalesQuotationPdfPayload } from '@/app/actions/sales/quotation-pdf';
import type { PreparedPdfLogo } from '@/lib/logistix-logo';
import { generateSalesQuotationPdf } from '@/lib/sales-quotation-pdf';

const LOGO_WIDTH_MM = 78;
const LOGO_HEIGHT_MM = 26;

function stripPdfDataUrl(pdfDataUrlOrBase64: string): Buffer {
  const raw = pdfDataUrlOrBase64.trim();
  const base64 = raw.includes('base64,') ? raw.split('base64,')[1] || '' : raw;
  if (!base64) {
    throw new Error('PDF payload is empty');
  }
  return Buffer.from(base64, 'base64');
}

function logoFromBuffer(buf: Buffer, mime: string): PreparedPdfLogo {
  return {
    dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
    format: mime.includes('png') ? 'PNG' : 'JPEG',
    widthMm: LOGO_WIDTH_MM,
    heightMm: LOGO_HEIGHT_MM,
  };
}

async function loadLogoFromPublic(relative: string, mime: string): Promise<PreparedPdfLogo | null> {
  try {
    const buf = await readFile(join(process.cwd(), 'public', relative.replace(/^\//, '')));
    return logoFromBuffer(buf, mime);
  } catch {
    return null;
  }
}

async function loadServerPdfLogo(sourceUrl?: string | null): Promise<PreparedPdfLogo | null> {
  if (sourceUrl?.startsWith('data:')) {
    return {
      dataUrl: sourceUrl,
      format: sourceUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG',
      widthMm: LOGO_WIDTH_MM,
      heightMm: LOGO_HEIGHT_MM,
    };
  }

  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    try {
      const res = await fetch(sourceUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = res.headers.get('content-type') || 'image/jpeg';
        return logoFromBuffer(buf, mime.split(';')[0] || 'image/jpeg');
      }
    } catch {
      // Fall through to the bundled wordmark.
    }
  }

  return (
    (await loadLogoFromPublic('logo.jpg', 'image/jpeg')) ||
    (await loadLogoFromPublic('logo.png', 'image/png'))
  );
}

/**
 * Render the customer quotation PDF entirely on the server.
 * Do not return these bytes through a Server Action — React Flight will
 * reject large nested/binary payloads with "Maximum array nesting exceeded".
 */
export async function renderSalesQuotationPdfBufferFromPayload(
  payload: SalesQuotationPdfPayload
): Promise<{ buffer: Buffer } | { error: string }> {
  try {
    const logo = await loadServerPdfLogo(payload.organization.logoUrl);
    const generated = await generateSalesQuotationPdf(payload, {
      silent: true,
      logo,
    });
    if (!generated?.dataUrl) {
      return { error: 'PDF generation failed' };
    }

    const buffer = stripPdfDataUrl(generated.dataUrl);
    if (buffer.byteLength < 100) {
      return { error: 'PDF generation failed. Please try Download PDF first, then send again.' };
    }
    if (buffer.byteLength > 20 * 1024 * 1024) {
      return { error: 'PDF is too large to send (max 20 MB).' };
    }
    return { buffer };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'PDF generation failed',
    };
  }
}
