import jsPDF from "jspdf";
import type { ProformaInvoiceFormData } from "@/lib/proforma-invoice";

const PDF_PAGE_WIDTH_MM = 210;
const PDF_PAGE_HEIGHT_MM = 297;

function replaceInputsWithText(root: HTMLElement) {
  root.querySelectorAll("input").forEach((input) => {
    const el = input as HTMLInputElement;
    const span = document.createElement("span");
    const value = el.value.trim();
    span.textContent = value;
    span.className = [
      "block w-full whitespace-pre-wrap break-words text-xs text-slate-900",
      el.classList.contains("text-right") ? "text-right" : "",
      el.classList.contains("text-center") ? "text-center" : "",
      el.classList.contains("font-semibold") ? "font-semibold" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (!value) {
      span.classList.add("min-h-[1.25rem]");
    }
    el.replaceWith(span);
  });
}

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

export async function downloadProformaInvoicePdf(
  data: ProformaInvoiceFormData,
  sourceElement?: HTMLElement | null
) {
  if (!sourceElement) {
    throw new Error("Invoice document element is required for PDF export.");
  }

  const html2canvas = (await import("html2canvas")).default;
  const fileName = data.invoiceNumber
    ? `proforma-invoice-${data.invoiceNumber.replace(/\//g, "_")}.pdf`
    : "proforma-invoice.pdf";

  const canvas = await html2canvas(sourceElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: sourceElement.scrollWidth,
    onclone: (clonedDoc) => {
      const clonedRoot = clonedDoc.getElementById("proforma-invoice-document");
      if (clonedRoot) {
        replaceInputsWithText(clonedRoot);
        clonedRoot.querySelectorAll("img").forEach((img) => {
          img.setAttribute("crossorigin", "anonymous");
        });
      }
    },
  });

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  addCanvasToPdf(doc, canvas, PDF_PAGE_WIDTH_MM, PDF_PAGE_HEIGHT_MM);
  doc.save(fileName);
}
