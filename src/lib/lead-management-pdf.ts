import jsPDF from "jspdf";
import {
  buildIsolatedCanvasElement,
  finalizeCanvasClone,
} from "@/lib/html2canvas-pdf-utils";

const PDF_PAGE_WIDTH_MM = 210;
const PDF_PAGE_HEIGHT_MM = 297;

function addCanvasToPdf(doc: jsPDF, canvas: HTMLCanvasElement, pageWidth: number, pageHeight: number) {
  const imgData = canvas.toDataURL("image/png");
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  if (imgHeight <= pageHeight) {
    doc.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);
    return;
  }

  let offsetY = 0;
  let pageIndex = 0;
  const sliceHeightPx = Math.floor((canvas.width * pageHeight) / pageWidth);

  while (offsetY < canvas.height) {
    if (pageIndex > 0) {
      doc.addPage();
    }

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = Math.min(sliceHeightPx, canvas.height - offsetY);
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) break;

    ctx.drawImage(
      canvas,
      0,
      offsetY,
      canvas.width,
      sliceCanvas.height,
      0,
      0,
      canvas.width,
      sliceCanvas.height
    );

    const sliceHeightMm = (sliceCanvas.height * pageWidth) / canvas.width;
    doc.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 0, 0, pageWidth, sliceHeightMm);

    offsetY += sliceHeightPx;
    pageIndex += 1;
  }
}

export async function downloadLeadManagementPdf(
  sourceElement: HTMLElement,
  options?: { leadNumber?: string | null; productName?: string }
) {
  const html2canvas = (await import("html2canvas")).default;
  const leadPart = options?.leadNumber?.trim().replace(/[^\w-]+/g, "_") || "lead";
  const productPart = options?.productName?.trim().replace(/[^\w-]+/g, "_").slice(0, 40) || "inquiry";
  const fileName = `lead-management-${leadPart}-${productPart}.pdf`;

  const { element: renderElement, cleanup } = buildIsolatedCanvasElement(sourceElement);

  try {
    const canvas = await html2canvas(renderElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: renderElement.scrollWidth,
      height: renderElement.scrollHeight,
      windowWidth: renderElement.scrollWidth,
      windowHeight: renderElement.scrollHeight,
      onclone: (clonedDoc, clonedElement) => {
        finalizeCanvasClone(clonedDoc, clonedElement);
      },
    });

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    addCanvasToPdf(doc, canvas, PDF_PAGE_WIDTH_MM, PDF_PAGE_HEIGHT_MM);
    doc.save(fileName);
  } finally {
    cleanup();
  }

}
