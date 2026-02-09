"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { getNextCartonSerial, createOrderWithCartons } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderSaved?: () => void;
};

const DESTINATION_OPTIONS = [{ label: "Pakistan", value: "Pakistan" }];

type OrderDraft = {
  itemDescription: string;
  destinationCountry: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  dimensionUnit: "cm" | "m" | "mm";
  totalCartons: number;
};

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function BookOrderModal({ open, onOpenChange, onOrderSaved }: Props) {
  const [shippingMark, setShippingMark] = useState("");
  const [orders, setOrders] = useState<OrderDraft[]>([
    {
      itemDescription: "",
      destinationCountry: "Pakistan",
      weight: "",
      length: "",
      width: "",
      height: "",
      dimensionUnit: "cm",
      totalCartons: 1,
    },
  ]);
  const [isPending] = useTransition();
  const [savingOrderIndex, setSavingOrderIndex] = useState<number | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    // Reset form when modal opens
    const resetForm = () => {
      setShippingMark("");
      setOrders([
        {
          itemDescription: "",
          destinationCountry: "Pakistan",
          weight: "",
          length: "",
          width: "",
          height: "",
          dimensionUnit: "cm",
          totalCartons: 1,
        },
      ]);
    };
    resetForm();
    if (!logoDataUrl) {
      fetch("/logo.jpg")
        .then((res) => res.blob())
        .then(
          (blob) =>
            new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            })
        )
        .then((dataUrl) => {
          setLogoDataUrl(dataUrl);
          const img = new Image();
          img.onload = () => {
            setLogoSize({ width: img.naturalWidth, height: img.naturalHeight });
          };
          img.src = dataUrl;
        })
        .catch(() => null);
    }
  }, [open, logoDataUrl]);

  function addSubOrder() {
    setOrders((prev) => [
      ...prev,
      {
        itemDescription: "",
        destinationCountry: "Pakistan",
        weight: "",
        length: "",
        width: "",
        height: "",
        dimensionUnit: "cm",
        totalCartons: 1,
      },
    ]);
  }

  function updateOrder(index: number, updates: Partial<OrderDraft>) {
    setOrders((prev) =>
      prev.map((order, i) => (i === index ? { ...order, ...updates } : order))
    );
  }

  function handleTotalCartonsChange(index: number, value: string) {
    const nextTotal = Number(value);
    if (!Number.isFinite(nextTotal) || nextTotal < 1) {
      return;
    }
    updateOrder(index, { totalCartons: nextTotal });
  }

  function handleWeightAuto(index: number) {
    const order = orders[index];
    if (!order || order.weight.trim()) return;
    const lengthValue = toNumber(order.length);
    const widthValue = toNumber(order.width);
    const heightValue = toNumber(order.height);
    if (lengthValue && widthValue && heightValue) {
      const volumeCm3 = toCm3(lengthValue, widthValue, heightValue, order.dimensionUnit);
      const volumetricWeight = volumeCm3 / 5000;
      updateOrder(index, { weight: volumetricWeight.toFixed(2) });
    }
  }

  function toCm3(
    length: number,
    width: number,
    height: number,
    unit: OrderDraft["dimensionUnit"]
  ) {
    if (unit === "m") {
      return length * width * height * 1_000_000;
    }
    if (unit === "mm") {
      return (length * width * height) / 1_000;
    }
    return length * width * height;
  }

  function calcCbm(order: OrderDraft) {
    const lengthValue = toNumber(order.length);
    const widthValue = toNumber(order.width);
    const heightValue = toNumber(order.height);
    if (!lengthValue || !widthValue || !heightValue || !order.totalCartons) return null;
    const volumeCm3 = toCm3(lengthValue, widthValue, heightValue, order.dimensionUnit);
    const cbm = (volumeCm3 / 1_000_000) * order.totalCartons;
    return cbm;
  }

  async function buildCartons(totalCartons: number) {
    const serials: string[] = [];
    for (let i = 0; i < totalCartons; i += 1) {
      const result = await getNextCartonSerial();
      if ("error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return null;
      }
      serials.push(result.serial);
    }
    return serials;
  }

  async function handleSaveOrder(orderIndex: number) {
    const order = orders[orderIndex];
    if (!order) return null;
    if (!shippingMark.trim()) {
      toast.error("Shipping mark is required", {
        className: "bg-red-600 text-white border-red-600",
      });
      return null;
    }

    if (!order.totalCartons || order.totalCartons < 1) {
      toast.error("Total cartons must be at least 1", {
        className: "bg-red-600 text-white border-red-600",
      });
      return null;
    }

    if (!order.itemDescription.trim()) {
      toast.error("Item description is required", {
        className: "bg-red-600 text-white border-red-600",
      });
      return null;
    }

    setSavingOrderIndex(orderIndex);
    const serials = await buildCartons(order.totalCartons);
    if (!serials) {
      setSavingOrderIndex(null);
      return null;
    }

    const orderPayload = {
      shipping_mark: shippingMark.trim(),
      destination_country: order.destinationCountry,
      total_cartons: order.totalCartons,
      item_description: order.itemDescription.trim(),
    };

    let serialIndex = 0;
    const cartonPayload = Array.from({ length: order.totalCartons }).map(() => {
      const serial = serials[serialIndex];
      serialIndex += 1;
      return {
        carton_serial_number: serial,
        weight: toNumber(order.weight),
        length: toNumber(order.length),
        width: toNumber(order.width),
        height: toNumber(order.height),
        dimension_unit: order.dimensionUnit,
        carton_index: serialIndex,
      };
    });

    const result = await createOrderWithCartons(orderPayload, cartonPayload);
    setSavingOrderIndex(null);
    if ("error" in result) {
      toast.error(result.error, {
        className: "bg-red-600 text-white border-red-600",
      });
      return null;
    }

    toast.success("Order saved successfully", {
      className: "bg-green-400 text-white border-green-400",
    });
    onOrderSaved?.();
    const printable = cartonPayload.map((carton) => ({
      serial: carton.carton_serial_number,
      weight: order.weight,
      length: order.length,
      width: order.width,
      height: order.height,
      itemDescription: order.itemDescription,
      destinationCountry: order.destinationCountry,
    }));
    return printable;
  }

  async function handleGeneratePrint(orderIndex: number) {
    const order = orders[orderIndex];
    if (!order) return;
    const cartonsToPrint = await handleSaveOrder(orderIndex);
    if (!cartonsToPrint) return;
    const pdf = new jsPDF({ unit: "mm", format: [101, 152] });
    
    // Generate carton sticker pages (existing functionality)
    for (let i = 0; i < cartonsToPrint.length; i += 1) {
      const carton = cartonsToPrint[i];
      if (i > 0) pdf.addPage();

      pdf.setLineWidth(0.2);
      pdf.rect(6, 6, 89, 140);
      if (logoDataUrl && logoSize) {
        const maxLogoWidth = 60;
        const maxLogoHeight = 16;
        const scale = Math.min(
          maxLogoWidth / logoSize.width,
          maxLogoHeight / logoSize.height
        );
        const logoWidth = logoSize.width * scale;
        const logoHeight = logoSize.height * scale;
        const logoX = (101 - logoWidth) / 2;
        const logoY = 10;
        pdf.addImage(logoDataUrl, "PNG", logoX, logoY, logoWidth, logoHeight);
      }

      const startY = 30;
      const boxLeft = 10;
      const boxWidth = 81;
      const rowHeight = 14;
      pdf.setFontSize(9);
      pdf.rect(boxLeft, startY, boxWidth, rowHeight);
      pdf.text("Item Description:", boxLeft + 2, startY + 6);
      pdf.text(carton.itemDescription || "-", boxLeft + 2, startY + 11);

      pdf.rect(boxLeft, startY + rowHeight, boxWidth, rowHeight);
      pdf.text("Shipping Mark:", boxLeft + 2, startY + rowHeight + 6);
      pdf.text(shippingMark || "-", boxLeft + 2, startY + rowHeight + 11);

      pdf.rect(boxLeft, startY + rowHeight * 2, boxWidth, rowHeight);
      pdf.text("Carton Serial No:", boxLeft + 2, startY + rowHeight * 2 + 6);
      pdf.text(carton.serial || "-", boxLeft + 2, startY + rowHeight * 2 + 11);

      pdf.rect(boxLeft, startY + rowHeight * 3, boxWidth / 2, rowHeight);
      pdf.rect(boxLeft + boxWidth / 2, startY + rowHeight * 3, boxWidth / 2, rowHeight);
      pdf.text("TotalWeight:", boxLeft + 2, startY + rowHeight * 3 + 6);
      pdf.text(carton.weight || "-", boxLeft + 2, startY + rowHeight * 3 + 11);
      pdf.text("Dimensions:", boxLeft + boxWidth / 2 + 2, startY + rowHeight * 3 + 6);
      pdf.text(
        `${carton.length || "-"} x ${carton.width || "-"} x ${carton.height || "-"}`,
        boxLeft + boxWidth / 2 + 2,
        startY + rowHeight * 3 + 11
      );

      pdf.rect(boxLeft, startY + rowHeight * 4, boxWidth, rowHeight);
      pdf.text("Destination Country:", boxLeft + 2, startY + rowHeight * 4 + 6);
      pdf.text(carton.destinationCountry || "-", boxLeft + 2, startY + rowHeight * 4 + 11);

      pdf.rect(boxLeft, startY + rowHeight * 5, boxWidth, rowHeight);
      pdf.text("Total Cartons:", boxLeft + 2, startY + rowHeight * 5 + 6);
      pdf.text(`${cartonsToPrint.length}-${i + 1}`, boxLeft + 2, startY + rowHeight * 5 + 11);

      const qrPayload = JSON.stringify({
        shipping_mark: shippingMark,
        carton_serial_number: carton.serial,
        weight: carton.weight,
        length: carton.length,
        width: carton.width,
        height: carton.height,
        destination_country: carton.destinationCountry,
        total_cartons: cartonsToPrint.length,
        item_description: carton.itemDescription,
      });
      const qrDataUrl = await QRCode.toDataURL(qrPayload);
      pdf.addImage(qrDataUrl, "PNG", 30, 120, 40, 40);
    }

    // Calculate order totals
    const totalWeight = cartonsToPrint.reduce((sum, carton) => {
      const weight = toNumber(carton.weight);
      return sum + (weight || 0);
    }, 0);

    const totalCbm = cartonsToPrint.reduce((sum, carton) => {
      const length = toNumber(carton.length);
      const width = toNumber(carton.width);
      const height = toNumber(carton.height);
      if (!length || !width || !height) return sum;
      const volumeCm3 = toCm3(length, width, height, order.dimensionUnit);
      const cbm = volumeCm3 / 1_000_000;
      return sum + cbm;
    }, 0);

    const orderDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Add Order Summary Page (same format as stickers)
    pdf.addPage([101, 152], 'mm');
    pdf.setLineWidth(0.2);
    pdf.rect(6, 6, 89, 140);
    
    if (logoDataUrl && logoSize) {
      const maxLogoWidth = 60;
      const maxLogoHeight = 16;
      const scale = Math.min(
        maxLogoWidth / logoSize.width,
        maxLogoHeight / logoSize.height
      );
      const logoWidth = logoSize.width * scale;
      const logoHeight = logoSize.height * scale;
      const logoX = (101 - logoWidth) / 2;
      const logoY = 10;
      pdf.addImage(logoDataUrl, "PNG", logoX, logoY, logoWidth, logoHeight);
    }

    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    pdf.text("ORDER SUMMARY", 50, 35, { align: 'center' });
    
    pdf.setFontSize(9);
    pdf.setFont(undefined, 'normal');
    const summaryStartY = 45;
    const summaryBoxLeft = 10;
    const summaryBoxWidth = 81;
    const summaryRowHeight = 12;
    let currentY = summaryStartY;

    // Product Description
    pdf.rect(summaryBoxLeft, currentY, summaryBoxWidth, summaryRowHeight);
    pdf.text("Product Description:", summaryBoxLeft + 2, currentY + 5);
    pdf.text(order.itemDescription || "-", summaryBoxLeft + 2, currentY + 9);
    currentY += summaryRowHeight;

    // Shipping Mark
    pdf.rect(summaryBoxLeft, currentY, summaryBoxWidth, summaryRowHeight);
    pdf.text("Shipping Mark:", summaryBoxLeft + 2, currentY + 5);
    pdf.text(shippingMark || "-", summaryBoxLeft + 2, currentY + 9);
    currentY += summaryRowHeight;

    // Total Number of Cartons
    pdf.rect(summaryBoxLeft, currentY, summaryBoxWidth, summaryRowHeight);
    pdf.text("Total Number of Cartons:", summaryBoxLeft + 2, currentY + 5);
    pdf.text(cartonsToPrint.length.toString(), summaryBoxLeft + 2, currentY + 9);
    currentY += summaryRowHeight;

    // Total Weight
    pdf.rect(summaryBoxLeft, currentY, summaryBoxWidth, summaryRowHeight);
    pdf.text("Total Weight:", summaryBoxLeft + 2, currentY + 5);
    pdf.text(`${totalWeight.toFixed(2)} kg`, summaryBoxLeft + 2, currentY + 9);
    currentY += summaryRowHeight;

    // CBM
    pdf.rect(summaryBoxLeft, currentY, summaryBoxWidth, summaryRowHeight);
    pdf.text("CBM:", summaryBoxLeft + 2, currentY + 5);
    pdf.text(totalCbm.toFixed(3), summaryBoxLeft + 2, currentY + 9);
    currentY += summaryRowHeight;

    // Order Date
    pdf.rect(summaryBoxLeft, currentY, summaryBoxWidth, summaryRowHeight);
    pdf.text("Order Date:", summaryBoxLeft + 2, currentY + 5);
    pdf.text(orderDate, summaryBoxLeft + 2, currentY + 9);

    // Add Terms & Signature Page (A4 size)
    pdf.addPage('a4', 'portrait');
    const a4Width = 210;
    const a4Height = 297;
    const margin = 15;
    const topSectionHeight = 140; // Top half for terms
    const bottomSectionStartY = topSectionHeight + 10;

    // Top Half: Terms & Conditions Header
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text("TERMS & CONDITIONS", a4Width / 2, margin + 8, { align: 'center' });
    
    pdf.setLineWidth(0.5);
    pdf.line(margin, margin + 12, a4Width - margin, margin + 12);
    
    // Terms content area
    const termsStartY = margin + 20;
    const termsEndY = topSectionHeight;
    const colWidth = (a4Width - 2 * margin) / 3;
    const colSpacing = 5;
    const lineHeight = 5;
    const sectionSpacing = 3;

    pdf.setFontSize(9);
    pdf.setFont(undefined, 'normal');

    // English Terms Column
    let englishY = termsStartY;
    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(10);
    pdf.text("ENGLISH", margin + colWidth / 2, englishY, { align: 'center' });
    englishY += 8;
    pdf.setLineWidth(0.3);
    pdf.line(margin, englishY, margin + colWidth - colSpacing, englishY);
    englishY += 5;
    
    pdf.setFontSize(8);
    pdf.setFont(undefined, 'normal');
    const englishTerms = [
      "1. All shipments are subject to inspection.",
      "2. Carrier not responsible for damage due to improper packaging.",
      "3. Insurance coverage must be arranged separately.",
      "4. Delivery times are estimates, not guaranteed.",
      "5. Customs duties and taxes are recipient's responsibility.",
      "6. Claims must be filed within 30 days of delivery.",
      "7. Shipper responsible for accurate documentation."
    ];
    englishTerms.forEach(term => {
      if (englishY < termsEndY - 5) {
        pdf.text(term, margin + 2, englishY, { maxWidth: colWidth - colSpacing - 4 });
        englishY += lineHeight + 1;
      }
    });

    // Urdu Terms Column - Using HTML for proper Unicode rendering
    let urduY = termsStartY;
    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(10);
    pdf.text("URDU", margin + colWidth + colSpacing + colWidth / 2, urduY, { align: 'center' });
    urduY += 8;
    pdf.line(margin + colWidth + colSpacing, urduY, margin + 2 * colWidth - colSpacing, urduY);
    urduY += 5;
    
    pdf.setFontSize(8);
    pdf.setFont(undefined, 'normal');
    const urduTerms = [
      "1. تمام شپمنٹس معائنہ کے تابع ہیں۔",
      "2. کیریئر غلط پیکیجنگ کی وجہ سے نقصان کا ذمہ دار نہیں ہے۔",
      "3. انشورنس کوریج الگ سے ترتیب دی جانی چاہیے۔",
      "4. ڈیلیوری کے اوقات تخمینے ہیں، ضمانت نہیں۔",
      "5. کسٹم ڈیوٹیز اور ٹیکس وصول کنندہ کی ذمہ داری ہیں۔",
      "6. دعوے ڈیلیوری کے 30 دنوں کے اندر دائر کرنے چاہئیں۔",
      "7. بھیجنے والا درست دستاویزات کا ذمہ دار ہے۔"
    ];
    
    // Render Urdu text using canvas for proper Unicode support
    const urduCanvas = document.createElement('canvas');
    const urduCtx = urduCanvas.getContext('2d');
    if (urduCtx) {
      urduCanvas.width = (colWidth - colSpacing - 4) * 3.779527559; // Convert mm to pixels
      urduCanvas.height = (termsEndY - urduY) * 3.779527559;
      urduCtx.fillStyle = 'white';
      urduCtx.fillRect(0, 0, urduCanvas.width, urduCanvas.height);
      urduCtx.fillStyle = 'black';
      urduCtx.font = '10px Arial Unicode MS, Noto Sans Arabic, Arial, sans-serif';
      urduCtx.textAlign = 'right';
      urduCtx.textBaseline = 'top';
      let urduTextY = 0;
      urduTerms.forEach(term => {
        const lines = term.split('\n');
        lines.forEach(line => {
          urduCtx.fillText(line, urduCanvas.width - 5, urduTextY);
          urduTextY += 12;
        });
        urduTextY += 2;
      });
      const urduDataUrl = urduCanvas.toDataURL('image/png');
      pdf.addImage(urduDataUrl, 'PNG', margin + colWidth + colSpacing + 2, urduY, colWidth - colSpacing - 4, (termsEndY - urduY));
    } else {
      // Fallback: render as text
      urduTerms.forEach(term => {
        if (urduY < termsEndY - 5) {
          pdf.text(term, margin + colWidth + colSpacing + 2, urduY, { maxWidth: colWidth - colSpacing - 4 });
          urduY += lineHeight + 1;
        }
      });
    }

    // Chinese Terms Column - Using HTML for proper Unicode rendering
    let chineseY = termsStartY;
    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(10);
    pdf.text("CHINESE", margin + 2 * colWidth + 2 * colSpacing + colWidth / 2, chineseY, { align: 'center' });
    chineseY += 8;
    pdf.line(margin + 2 * colWidth + 2 * colSpacing, chineseY, a4Width - margin, chineseY);
    chineseY += 5;
    
    pdf.setFontSize(8);
    pdf.setFont(undefined, 'normal');
    const chineseTerms = [
      "1. 所有货物均需接受检查。",
      "2. 承运人不承担因包装不当造成的损坏责任。",
      "3. 保险范围必须单独安排。",
      "4. 交货时间仅为估计，不保证。",
      "5. 关税和税费由收件人承担。",
      "6. 索赔必须在交货后30天内提出。",
      "7. 发货人负责提供准确的文件。"
    ];
    
    // Render Chinese text using canvas for proper Unicode support
    const chineseCanvas = document.createElement('canvas');
    const chineseCtx = chineseCanvas.getContext('2d');
    if (chineseCtx) {
      chineseCanvas.width = (colWidth - colSpacing - 4) * 3.779527559; // Convert mm to pixels
      chineseCanvas.height = (termsEndY - chineseY) * 3.779527559;
      chineseCtx.fillStyle = 'white';
      chineseCtx.fillRect(0, 0, chineseCanvas.width, chineseCanvas.height);
      chineseCtx.fillStyle = 'black';
      chineseCtx.font = '10px Arial Unicode MS, Noto Sans SC, Microsoft YaHei, Arial, sans-serif';
      chineseCtx.textAlign = 'left';
      chineseCtx.textBaseline = 'top';
      let chineseTextY = 0;
      chineseTerms.forEach(term => {
        const lines = term.split('\n');
        lines.forEach(line => {
          chineseCtx.fillText(line, 5, chineseTextY);
          chineseTextY += 12;
        });
        chineseTextY += 2;
      });
      const chineseDataUrl = chineseCanvas.toDataURL('image/png');
      pdf.addImage(chineseDataUrl, 'PNG', margin + 2 * colWidth + 2 * colSpacing + 2, chineseY, colWidth - colSpacing - 4, (termsEndY - chineseY));
    } else {
      // Fallback: render as text
      chineseTerms.forEach(term => {
        if (chineseY < termsEndY - 5) {
          pdf.text(term, margin + 2 * colWidth + 2 * colSpacing + 2, chineseY, { maxWidth: colWidth - colSpacing - 4 });
          chineseY += lineHeight + 1;
        }
      });
    }

    // Divider line between sections
    pdf.setLineWidth(0.8);
    pdf.line(margin, bottomSectionStartY - 5, a4Width - margin, bottomSectionStartY - 5);

    // Bottom Half: Signature Section
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text("SIGNATURE SECTION", a4Width / 2, bottomSectionStartY + 8, { align: 'center' });
    
    pdf.setLineWidth(0.3);
    const sigBoxWidth = (a4Width - 2 * margin - 10) / 2;
    const sigBoxHeight = 50;
    let sigY = bottomSectionStartY + 20;

    // Shipper Signature Box (Left)
    pdf.rect(margin, sigY, sigBoxWidth, sigBoxHeight);
    pdf.setFontSize(9);
    pdf.setFont(undefined, 'bold');
    pdf.text("SHIPPER", margin + sigBoxWidth / 2, sigY + 6, { align: 'center' });
    // Shipper subtitle with proper Unicode rendering using canvas
    const shipperSubtitleCanvas = document.createElement('canvas');
    const shipperSubtitleCtx = shipperSubtitleCanvas.getContext('2d');
    if (shipperSubtitleCtx) {
      shipperSubtitleCanvas.width = sigBoxWidth * 3.779527559;
      shipperSubtitleCanvas.height = 8 * 3.779527559;
      shipperSubtitleCtx.fillStyle = 'white';
      shipperSubtitleCtx.fillRect(0, 0, shipperSubtitleCanvas.width, shipperSubtitleCanvas.height);
      shipperSubtitleCtx.fillStyle = 'black';
      shipperSubtitleCtx.font = '7px Arial Unicode MS, Noto Sans SC, Noto Sans Arabic, Arial, sans-serif';
      shipperSubtitleCtx.textAlign = 'center';
      shipperSubtitleCtx.textBaseline = 'middle';
      shipperSubtitleCtx.fillText('发货人 / بھیجنے والا', shipperSubtitleCanvas.width / 2, shipperSubtitleCanvas.height / 2);
      const shipperSubtitleDataUrl = shipperSubtitleCanvas.toDataURL('image/png');
      pdf.addImage(shipperSubtitleDataUrl, 'PNG', margin, sigY + 8, sigBoxWidth, 8);
    } else {
      pdf.setFontSize(7);
      pdf.text("发货人 / بھیجنے والا", margin + sigBoxWidth / 2, sigY + 10, { align: 'center' });
    }
    
    pdf.setFontSize(8);
    pdf.setFont(undefined, 'normal');
    // Signature, Name, Date labels with proper Unicode using canvas
    const labelTexts = [
      { text: 'Signature / 签名 / دستخط:', y: sigY + 18 },
      { text: 'Name / 姓名 / نام:', y: sigY + 28 },
      { text: 'Date / 日期 / تاریخ:', y: sigY + 38 }
    ];
    
    labelTexts.forEach(({ text, y }) => {
      const labelCanvas = document.createElement('canvas');
      const labelCtx = labelCanvas.getContext('2d');
      if (labelCtx) {
        labelCanvas.width = (sigBoxWidth - 10) * 3.779527559;
        labelCanvas.height = 8 * 3.779527559;
        labelCtx.fillStyle = 'white';
        labelCtx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
        labelCtx.fillStyle = 'black';
        labelCtx.font = '8px Arial Unicode MS, Noto Sans SC, Noto Sans Arabic, Arial, sans-serif';
        labelCtx.textAlign = 'left';
        labelCtx.textBaseline = 'middle';
        labelCtx.fillText(text, 5, labelCanvas.height / 2);
        const labelDataUrl = labelCanvas.toDataURL('image/png');
        pdf.addImage(labelDataUrl, 'PNG', margin + 5, y - 4, sigBoxWidth - 10, 8);
      } else {
        pdf.text(text, margin + 5, y);
      }
    });
    
    pdf.line(margin + 5, sigY + 20, margin + sigBoxWidth - 5, sigY + 20);
    pdf.line(margin + 5, sigY + 30, margin + sigBoxWidth - 5, sigY + 30);
    pdf.line(margin + 5, sigY + 40, margin + sigBoxWidth - 5, sigY + 40);

    // Receiver Signature Box (Right)
    pdf.rect(margin + sigBoxWidth + 10, sigY, sigBoxWidth, sigBoxHeight);
    pdf.setFontSize(9);
    pdf.setFont(undefined, 'bold');
    pdf.text("RECEIVER", margin + sigBoxWidth + 10 + sigBoxWidth / 2, sigY + 6, { align: 'center' });
    // Receiver subtitle with proper Unicode rendering using canvas
    const receiverSubtitleCanvas = document.createElement('canvas');
    const receiverSubtitleCtx = receiverSubtitleCanvas.getContext('2d');
    if (receiverSubtitleCtx) {
      receiverSubtitleCanvas.width = sigBoxWidth * 3.779527559;
      receiverSubtitleCanvas.height = 8 * 3.779527559;
      receiverSubtitleCtx.fillStyle = 'white';
      receiverSubtitleCtx.fillRect(0, 0, receiverSubtitleCanvas.width, receiverSubtitleCanvas.height);
      receiverSubtitleCtx.fillStyle = 'black';
      receiverSubtitleCtx.font = '7px Arial Unicode MS, Noto Sans SC, Noto Sans Arabic, Arial, sans-serif';
      receiverSubtitleCtx.textAlign = 'center';
      receiverSubtitleCtx.textBaseline = 'middle';
      receiverSubtitleCtx.fillText('收货人 / وصول کنندہ', receiverSubtitleCanvas.width / 2, receiverSubtitleCanvas.height / 2);
      const receiverSubtitleDataUrl = receiverSubtitleCanvas.toDataURL('image/png');
      pdf.addImage(receiverSubtitleDataUrl, 'PNG', margin + sigBoxWidth + 10, sigY + 8, sigBoxWidth, 8);
    } else {
      pdf.setFontSize(7);
      pdf.text("收货人 / وصول کنندہ", margin + sigBoxWidth + 10 + sigBoxWidth / 2, sigY + 10, { align: 'center' });
    }
    
    pdf.setFontSize(8);
    pdf.setFont(undefined, 'normal');
    // Render labels for receiver using canvas
    labelTexts.forEach(({ text, y }) => {
      const labelCanvas = document.createElement('canvas');
      const labelCtx = labelCanvas.getContext('2d');
      if (labelCtx) {
        labelCanvas.width = (sigBoxWidth - 10) * 3.779527559;
        labelCanvas.height = 8 * 3.779527559;
        labelCtx.fillStyle = 'white';
        labelCtx.fillRect(0, 0, labelCanvas.width, labelCanvas.height);
        labelCtx.fillStyle = 'black';
        labelCtx.font = '8px Arial Unicode MS, Noto Sans SC, Noto Sans Arabic, Arial, sans-serif';
        labelCtx.textAlign = 'left';
        labelCtx.textBaseline = 'middle';
        labelCtx.fillText(text, 5, labelCanvas.height / 2);
        const labelDataUrl = labelCanvas.toDataURL('image/png');
        pdf.addImage(labelDataUrl, 'PNG', margin + sigBoxWidth + 15, y - 4, sigBoxWidth - 10, 8);
      } else {
        pdf.text(text, margin + sigBoxWidth + 15, y);
      }
    });
    
    pdf.line(margin + sigBoxWidth + 15, sigY + 20, margin + 2 * sigBoxWidth + 5, sigY + 20);
    pdf.line(margin + sigBoxWidth + 15, sigY + 30, margin + 2 * sigBoxWidth + 5, sigY + 30);
    pdf.line(margin + sigBoxWidth + 15, sigY + 40, margin + 2 * sigBoxWidth + 5, sigY + 40);

    toast.success("Order successfully added and prints downloaded", {
      className: "bg-green-400 text-white border-green-400",
    });
    pdf.save(`logistix-order-${Date.now()}.pdf`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book a New Order</DialogTitle>
          <DialogDescription>
            Create one order and add cartons inside the same modal.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="shipping-mark">Shipping Mark</Label>
              <Input
                id="shipping-mark"
                value={shippingMark}
                onChange={(event) => setShippingMark(event.target.value)}
                placeholder="Enter shipping mark"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-primary-dark">Sub-Orders</h3>
              <p className="text-xs text-secondary-muted">Serial numbers are system-generated.</p>
            </div>
            <Button variant="outline" size="sm" onClick={addSubOrder} disabled={isPending}>
              <Plus className="h-4 w-4" /> Add Order
            </Button>
          </div>

          <div className="space-y-4">
            {orders.map((order, index) => (
              <Card key={`order-${index}`} className="border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-secondary-muted">
                    Carton Serial Number: Auto-generated
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <Label>Item Description</Label>
                    <Input
                      value={order.itemDescription}
                      onChange={(event) => updateOrder(index, { itemDescription: event.target.value })}
                      placeholder="Describe the shipment"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Destination Country</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                      value={order.destinationCountry}
                      onChange={(event) => updateOrder(index, { destinationCountry: event.target.value })}
                    >
                      {DESTINATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Total Cartons</Label>
                    <Input
                      type="number"
                      min={1}
                      value={order.totalCartons}
                      onChange={(event) => handleTotalCartonsChange(index, event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Total Weight</Label>
                    <Input
                      value={order.weight}
                      onChange={(event) => updateOrder(index, { weight: event.target.value })}
                      placeholder="kg"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Dimensions</Label>
                    <div className="grid gap-2 md:grid-cols-[140px_1fr_1fr_1fr]">
                      <select
                        className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                        value={order.dimensionUnit}
                        onChange={(event) =>
                          updateOrder(index, {
                            dimensionUnit: event.target.value as OrderDraft["dimensionUnit"],
                          })
                        }
                      >
                        <option value="cm">cm</option>
                        <option value="m">m</option>
                        <option value="mm">mm</option>
                      </select>
                      <Input
                        value={order.length}
                        onChange={(event) => updateOrder(index, { length: event.target.value })}
                        onBlur={() => handleWeightAuto(index)}
                        placeholder={`Length (${order.dimensionUnit})`}
                      />
                      <Input
                        value={order.width}
                        onChange={(event) => updateOrder(index, { width: event.target.value })}
                        onBlur={() => handleWeightAuto(index)}
                        placeholder={`Width (${order.dimensionUnit})`}
                      />
                      <Input
                        value={order.height}
                        onChange={(event) => updateOrder(index, { height: event.target.value })}
                        onBlur={() => handleWeightAuto(index)}
                        placeholder={`Height (${order.dimensionUnit})`}
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2 text-xs text-secondary-muted">
                    CBM: {calcCbm(order)?.toFixed(3) ?? "-"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-end pt-2">
                  
                  <Button
                    type="button"
                    onClick={() => handleGeneratePrint(index)}
                    disabled={isPending || savingOrderIndex === index}
                  >
                    Generate Print
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
