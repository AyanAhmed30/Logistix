export const LOGISTIX_LOGO_PATH = "/logo.jpg";

export async function loadLogistixLogoDataUrl(): Promise<string | null> {
  try {
    const url =
      typeof window !== "undefined" && !LOGISTIX_LOGO_PATH.startsWith("http")
        ? `${window.location.origin}${LOGISTIX_LOGO_PATH}`
        : LOGISTIX_LOGO_PATH;
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read logo"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Logo dimensions for jsPDF (mm), preserving the wordmark aspect ratio. */
export const LOGISTIX_LOGO_PDF_WIDTH = 78;
export const LOGISTIX_LOGO_PDF_HEIGHT = 26;

export function getLogistixLogoImageFormat(dataUrl: string): "JPEG" | "PNG" {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
}

export type PreparedPdfLogo = {
  dataUrl: string;
  format: "PNG" | "JPEG";
  widthMm: number;
  heightMm: number;
};

/**
 * Load the Logistix wordmark at its natural aspect ratio as a crisp PNG for jsPDF.
 */
export async function preparePdfLogoFit(
  sourceUrl?: string | null,
  maxWidthMm = LOGISTIX_LOGO_PDF_WIDTH,
  maxHeightMm = LOGISTIX_LOGO_PDF_HEIGHT
): Promise<PreparedPdfLogo | null> {
  const candidates = [
    LOGISTIX_LOGO_PATH,
    sourceUrl && sourceUrl !== LOGISTIX_LOGO_PATH ? sourceUrl : null,
  ].filter((u): u is string => Boolean(u));

  for (const raw of candidates) {
    const url =
      raw.startsWith("http") || raw.startsWith("data:")
        ? raw
        : typeof window !== "undefined"
          ? `${window.location.origin}${raw.startsWith("/") ? "" : "/"}${raw}`
          : raw;

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || "") || null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (!dataUrl) continue;

      if (typeof Image === "undefined") {
        return {
          dataUrl,
          format: getLogistixLogoImageFormat(dataUrl),
          widthMm: maxWidthMm,
          heightMm: maxHeightMm,
        };
      }

      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = dataUrl;
      });
      if (!img || !img.naturalWidth || !img.naturalHeight) {
        return {
          dataUrl,
          format: getLogistixLogoImageFormat(dataUrl),
          widthMm: maxWidthMm,
          heightMm: maxHeightMm,
        };
      }

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0);
      const png = canvas.toDataURL("image/png");
      const aspect = img.naturalWidth / img.naturalHeight;
      let widthMm = maxWidthMm;
      let heightMm = widthMm / aspect;
      if (heightMm > maxHeightMm) {
        heightMm = maxHeightMm;
        widthMm = heightMm * aspect;
      }

      return { dataUrl: png, format: "PNG", widthMm, heightMm };
    } catch {
      continue;
    }
  }

  return null;
}
