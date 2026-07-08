export const LOGISTIX_LOGO_PATH = "/logo.jpg";

export async function loadLogistixLogoDataUrl(): Promise<string | null> {
  try {
    const response = await fetch(LOGISTIX_LOGO_PATH);
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

/** Logo dimensions for jsPDF (mm), preserving ~3.4:1 aspect ratio. */
export const LOGISTIX_LOGO_PDF_WIDTH = 42;
export const LOGISTIX_LOGO_PDF_HEIGHT = 12;

export function getLogistixLogoImageFormat(dataUrl: string): "JPEG" | "PNG" {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
}
