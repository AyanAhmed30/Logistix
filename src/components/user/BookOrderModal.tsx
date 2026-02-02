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
  const [isPending, startTransition] = useTransition();
  const [savingOrderIndex, setSavingOrderIndex] = useState<number | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
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
