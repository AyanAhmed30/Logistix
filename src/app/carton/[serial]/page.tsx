import { getCartonBySerial } from "@/app/actions/orders";
import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ serial: string }>;
};

export default async function CartonDetailsPage({ params }: Props) {
  const { serial } = await params;
  const result = await getCartonBySerial(serial);

  if ("error" in result || !result.carton) {
    notFound();
  }

  const carton = result.carton;
  // orders is returned as an array from Supabase, but we expect a single order
  const ordersData = carton.orders as unknown;
  const ordersArray = Array.isArray(ordersData) ? ordersData : ordersData ? [ordersData] : null;
  const order = ordersArray && ordersArray.length > 0 ? (ordersArray[0] as {
    id: string;
    shipping_mark: string;
    item_description: string | null;
    destination_country: string;
    total_cartons: number;
    created_at: string;
    username: string;
  }) : null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDimensions = () => {
    if (!carton.length || !carton.width || !carton.height) {
      return "N/A";
    }
    const unit = carton.dimension_unit || "cm";
    return `${carton.length} x ${carton.width} x ${carton.height} ${unit}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Carton Details</h1>
          <p className="text-gray-600">Scanned from barcode</p>
        </div>

        <Card className="p-6 shadow-lg">
          <div className="space-y-6">
            {/* Carton Serial Number - Prominent */}
            <div className="border-b pb-4">
              <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Carton Serial Number
              </label>
              <p className="text-2xl font-bold text-primary mt-1">{carton.carton_serial_number}</p>
            </div>

            {/* Order Information */}
            {order && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">
                  Order Information
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      Shipping Mark
                    </label>
                    <p className="text-gray-900 mt-1">{order.shipping_mark || "N/A"}</p>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      Destination Country
                    </label>
                    <p className="text-gray-900 mt-1">{order.destination_country || "N/A"}</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      Item Description
                    </label>
                    <p className="text-gray-900 mt-1">
                      {order.item_description || carton.item_description || "N/A"}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      Total Cartons in Order
                    </label>
                    <p className="text-gray-900 mt-1">{order.total_cartons || "N/A"}</p>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      Order Date
                    </label>
                    <p className="text-gray-900 mt-1">{formatDate(order.created_at)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Carton Specifications */}
            <div className="space-y-4 border-t pt-4">
              <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">
                Carton Specifications
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Weight
                  </label>
                  <p className="text-gray-900 mt-1">
                    {carton.weight ? `${carton.weight} kg` : "N/A"}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Dimensions
                  </label>
                  <p className="text-gray-900 mt-1">{formatDimensions()}</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Carton Index
                  </label>
                  <p className="text-gray-900 mt-1">{carton.carton_index || "N/A"}</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Created At
                  </label>
                  <p className="text-gray-900 mt-1">{formatDate(carton.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t pt-4 text-center text-sm text-gray-500">
              <p>Logistix Logistics Management System</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
