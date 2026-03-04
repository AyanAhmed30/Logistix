"use client";

import { useEffect, useState } from "react";
import { getScannedCartonsForUser, deleteCartonScan } from "@/app/actions/orders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

type ScanRow = {
  id: string;
  carton_serial_number: string;
  scanned_at: string;
  cartons: {
    id: string;
    weight: number | null;
    length: number | null;
    width: number | null;
    height: number | null;
    dimension_unit: "cm" | "m" | "mm" | null;
    carton_index: number;
    created_at: string;
  } | null;
  orders: {
    id: string;
    shipping_mark: string;
    destination_country: string;
    total_cartons: number;
    item_description: string | null;
    created_at: string;
  } | null;
};

export function UserScannedStickersPanel() {
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchScans = async () => {
      setIsLoading(true);
      const result = await getScannedCartonsForUser();

      if (!isMounted) return;

      if ("error" in result) {
        setError(result.error ?? "Unable to load scanned stickers");
        setScans([]);
      } else {
        setError(null);
        setScans((result.scans as ScanRow[]) || []);
      }

      setIsLoading(false);
    };

    fetchScans();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    const result = await deleteCartonScan(id);
    if ("error" in result) {
      toast.error(result.error ?? "Unable to delete scanned sticker");
    } else {
      setScans((prev) => prev.filter((scan) => scan.id !== id));
      toast.success("Scanned sticker deleted");
    }
    setDeletingId(null);
  }

  if (isLoading) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Scanned Stickers</CardTitle>
          <CardDescription>Loading scanned stickers...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Scanned Stickers</CardTitle>
          <CardDescription>Unable to load scanned stickers: {error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!scans.length) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Scanned Stickers</CardTitle>
          <CardDescription>No stickers have been scanned yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-white border shadow-sm">
      <CardHeader>
        <CardTitle>Scanned Stickers</CardTitle>
        <CardDescription>
          Every time a barcode is scanned from any device, the corresponding carton appears here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scanned At</TableHead>
                <TableHead>Carton Serial</TableHead>
                <TableHead>Shipping Mark</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Item Description</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.map((scan) => {
                const order = scan.orders;
                const carton = scan.cartons;

                const scannedAt = new Date(scan.scanned_at).toLocaleString();
                const weight =
                  carton && carton.weight != null
                    ? `${carton.weight} kg`
                    : "-";
                const hasDimensions =
                  carton &&
                  carton.length != null &&
                  carton.width != null &&
                  carton.height != null;
                const dimensions = hasDimensions
                  ? `${carton.length} x ${carton.width} x ${carton.height} ${carton.dimension_unit || "cm"}`
                  : "-";

                return (
                  <TableRow key={scan.id}>
                    <TableCell>{scannedAt}</TableCell>
                    <TableCell>{scan.carton_serial_number}</TableCell>
                    <TableCell>{order?.shipping_mark ?? "-"}</TableCell>
                    <TableCell>{order?.destination_country ?? "-"}</TableCell>
                    <TableCell>{order?.item_description ?? "-"}</TableCell>
                    <TableCell>{weight}</TableCell>
                    <TableCell>{dimensions}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleDelete(scan.id)}
                        disabled={deletingId === scan.id}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

