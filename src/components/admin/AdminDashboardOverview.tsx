"use client";

import { useEffect, useState } from "react";
import { getDashboardStats } from "@/app/actions/dashboard";
import { getAllConsoles } from "@/app/actions/consoles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package,
  Container,
  Users,
  TrendingUp,
  AlertCircle,
  Boxes,
  CheckCircle2,
  XCircle,
  FileText,
} from "lucide-react";

type DashboardStats = {
  totalUsers: number;
  totalOrders: number;
  assignedOrdersCount: number;
  unassignedOrdersCount: number;
  totalCbm: number;
  totalConsoles: number;
  activeConsoles: number;
  readyForLoadingConsoles: number;
  totalCartons: number;
  cartonsInConsoles: number;
  remainingCartons: number;
  cbmInConsoles: number;
};

type Console = {
  id: string;
  console_number: string;
  total_cartons: number;
  total_cbm: number;
  max_cbm: number;
};

// Circular Progress Component
function CircularProgress({
  percentage,
  size = 120,
  strokeWidth = 8,
  color = "text-primary-dark",
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        className="transform -rotate-90"
        width={size}
        height={size}
        style={{ position: "absolute" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${color} transition-all duration-500`}
        />
      </svg>
      <div className="text-center">
        <div className={`text-2xl font-bold ${color}`}>{percentage.toFixed(0)}%</div>
      </div>
    </div>
  );
}

export function AdminDashboardOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [consoles, setConsoles] = useState<Console[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      const [statsResult, consolesResult] = await Promise.all([
        getDashboardStats(),
        getAllConsoles(),
      ]);

      if (!isMounted) return;

      if ("error" in statsResult) {
        // Handle error if needed
      } else {
        setStats(statsResult.stats);
      }
      
      if ("error" in consolesResult) {
        // Handle error if needed
      } else {
        setConsoles(consolesResult.consoles as Console[]);
      }
      setIsLoading(false);
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Console statistics
  const emptyConsoles = consoles.filter((c) => c.total_cbm === 0).length;
  const consolesWithOrders = consoles.filter((c) => c.total_cbm > 0).length;
  const totalConsoleCbm = consoles.reduce((sum, c) => sum + c.total_cbm, 0);

  // Calculate percentages
  const ordersAssignedPercent =
    stats && stats.totalOrders > 0
      ? (stats.assignedOrdersCount / stats.totalOrders) * 100
      : 0;
  const cartonsAssignedPercent =
    stats && stats.totalCartons > 0
      ? (stats.cartonsInConsoles / stats.totalCartons) * 100
      : 0;
  const cbmAssignedPercent =
    stats && stats.totalCbm > 0 ? (stats.cbmInConsoles / stats.totalCbm) * 100 : 0;

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 bg-slate-200 rounded w-64 animate-pulse"></div>
          <div className="h-4 bg-slate-200 rounded w-96 mt-2 animate-pulse"></div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="bg-white border shadow-sm animate-pulse">
              <CardHeader>
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-3 bg-slate-200 rounded w-1/2 mt-2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-slate-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary-dark">Dashboard Overview</h1>
        <p className="text-secondary-muted mt-1">
          Comprehensive system statistics and status at a glance
        </p>
      </div>

      {/* Top Statistics Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Total Active Users */}
        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Active Users</CardTitle>
            <Users className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">{stats.totalUsers}</div>
            <p className="text-xs text-secondary-muted mt-1">User profiles in system</p>
          </CardContent>
        </Card>

        {/* Total Orders */}
        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">{stats.totalOrders}</div>
            <p className="text-xs text-secondary-muted mt-1">All orders in system</p>
          </CardContent>
        </Card>

        {/* Total CBM */}
        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total CBM</CardTitle>
            <TrendingUp className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">{stats.totalCbm.toFixed(3)}</div>
            <p className="text-xs text-secondary-muted mt-1">Cubic meters across all orders</p>
          </CardContent>
        </Card>

        {/* Total Consoles */}
        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Consoles</CardTitle>
            <Container className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">{stats.totalConsoles}</div>
            <p className="text-xs text-secondary-muted mt-1">All consoles</p>
          </CardContent>
        </Card>

        {/* Ready for Loading */}
        <Card className="bg-white border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready for Loading</CardTitle>
            <FileText className="h-5 w-5 text-primary-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary-dark">{stats.readyForLoadingConsoles || 0}</div>
            <p className="text-xs text-secondary-muted mt-1">Consoles ready</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Overview Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Orders Overview
            </CardTitle>
            <CardDescription>Distribution of orders across the system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Total Orders</p>
                  <p className="text-xs text-secondary-muted">All orders in system</p>
                </div>
              </div>
              <div className="text-2xl font-bold text-primary-dark">{stats.totalOrders}</div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Assigned to Consoles</span>
                </div>
                <span className="text-lg font-semibold">{stats.assignedOrdersCount}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all duration-500"
                  style={{ width: `${ordersAssignedPercent}%` }}
                ></div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm">Unassigned Orders</span>
                </div>
                <span className="text-lg font-semibold">{stats.unassignedOrdersCount}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-orange-500 h-full transition-all duration-500"
                  style={{
                    width: `${stats.totalOrders > 0 ? (stats.unassignedOrdersCount / stats.totalOrders) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-center">
                <CircularProgress
                  percentage={ordersAssignedPercent}
                  size={100}
                  strokeWidth={6}
                  color="text-green-600"
                />
              </div>
              <p className="text-center text-sm text-secondary-muted mt-2">
                {ordersAssignedPercent.toFixed(1)}% Orders Assigned
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Console Overview Section */}
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Container className="h-5 w-5" />
              Console Overview
            </CardTitle>
            <CardDescription>Console status and order assignment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-100">
                  <Container className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Total Consoles</p>
                  <p className="text-xs text-secondary-muted">All consoles</p>
                </div>
              </div>
              <div className="text-2xl font-bold text-primary-dark">{stats.totalConsoles}</div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Container className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">Active Consoles</span>
                </div>
                <span className="text-lg font-semibold">{stats.activeConsoles || stats.totalConsoles}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-500"
                  style={{
                    width: `${stats.totalConsoles > 0 ? ((stats.activeConsoles || stats.totalConsoles) / stats.totalConsoles) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">Ready for Loading</span>
                </div>
                <span className="text-lg font-semibold">{stats.readyForLoadingConsoles || 0}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-purple-500 h-full transition-all duration-500"
                  style={{
                    width: `${stats.totalConsoles > 0 ? ((stats.readyForLoadingConsoles || 0) / stats.totalConsoles) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Orders in Consoles</span>
                </div>
                <span className="text-lg font-semibold">{stats.assignedOrdersCount}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all duration-500"
                  style={{
                    width: `${stats.totalOrders > 0 ? (stats.assignedOrdersCount / stats.totalOrders) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm">Remaining Orders</span>
                </div>
                <span className="text-lg font-semibold">{stats.unassignedOrdersCount}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-orange-500 h-full transition-all duration-500"
                  style={{
                    width: `${stats.totalOrders > 0 ? (stats.unassignedOrdersCount / stats.totalOrders) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="pt-4 border-t space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-secondary-muted">Console Status Distribution</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-gray-400"></div>
                  <span className="text-sm">Empty</span>
                </div>
                <span className="text-lg font-semibold">{emptyConsoles}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-400"></div>
                  <span className="text-sm">Has Orders</span>
                </div>
                <span className="text-lg font-semibold">{consolesWithOrders}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Carton Overview Section */}
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            Carton Overview
          </CardTitle>
          <CardDescription>Carton distribution and assignment status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Total Cartons */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100">
                    <Boxes className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Total Cartons</p>
                    <p className="text-xs text-secondary-muted">All orders</p>
                  </div>
                </div>
              </div>
              <div className="text-3xl font-bold text-primary-dark">{stats.totalCartons}</div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className="bg-purple-500 h-full rounded-full" style={{ width: "100%" }}></div>
              </div>
            </div>

            {/* Cartons in Consoles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">In Consoles</p>
                    <p className="text-xs text-secondary-muted">Assigned cartons</p>
                  </div>
                </div>
              </div>
              <div className="text-3xl font-bold text-green-600">{stats.cartonsInConsoles}</div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${cartonsAssignedPercent}%` }}
                ></div>
              </div>
              <p className="text-xs text-secondary-muted text-center">
                {cartonsAssignedPercent.toFixed(1)}% assigned
              </p>
            </div>

            {/* Remaining Cartons */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100">
                    <XCircle className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Remaining</p>
                    <p className="text-xs text-secondary-muted">Unassigned cartons</p>
                  </div>
                </div>
              </div>
              <div className="text-3xl font-bold text-orange-600">{stats.remainingCartons}</div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-orange-500 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.totalCartons > 0 ? (stats.remainingCartons / stats.totalCartons) * 100 : 0}%`,
                  }}
                ></div>
              </div>
              <p className="text-xs text-secondary-muted text-center">
                {stats.totalCartons > 0
                  ? ((stats.remainingCartons / stats.totalCartons) * 100).toFixed(1)
                  : 0}
                % remaining
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total CBM and Additional Stats */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Total CBM in Consoles */}
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Total CBM in Consoles</CardTitle>
            <CardDescription>CBM calculated from assigned orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary-dark">{totalConsoleCbm.toFixed(3)}</div>
                  <div className="text-sm text-secondary-muted mt-1">CBM</div>
                </div>
              </div>
              <div className="space-y-2 text-center">
                <div className="flex items-center justify-between px-4">
                  <span className="text-sm text-secondary-muted">Total Consoles</span>
                  <span className="text-sm font-medium">
                    {stats.totalConsoles}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4">
                  <span className="text-sm text-secondary-muted">Consoles with Orders</span>
                  <span className="text-sm font-medium">
                    {consolesWithOrders}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CBM Distribution */}
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">CBM Distribution</CardTitle>
            <CardDescription>CBM allocation across orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">CBM in Consoles</span>
                  </div>
                  <span className="text-lg font-semibold">{stats.cbmInConsoles.toFixed(3)}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-green-500 h-full transition-all duration-500"
                    style={{ width: `${cbmAssignedPercent}%` }}
                  ></div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-orange-600" />
                    <span className="text-sm">Remaining CBM</span>
                  </div>
                  <span className="text-lg font-semibold">
                    {(stats.totalCbm - stats.cbmInConsoles).toFixed(3)}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-orange-500 h-full transition-all duration-500"
                    style={{
                      width: `${stats.totalCbm > 0 ? ((stats.totalCbm - stats.cbmInConsoles) / stats.totalCbm) * 100 : 0}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-center">
                  <CircularProgress
                    percentage={cbmAssignedPercent}
                    size={100}
                    strokeWidth={6}
                    color="text-green-600"
                  />
                </div>
                <p className="text-center text-sm text-secondary-muted mt-2">
                  {cbmAssignedPercent.toFixed(1)}% CBM Assigned
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Insights */}
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Quick Insights
          </CardTitle>
          <CardDescription>System status and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {stats.unassignedOrdersCount === 0 && stats.totalOrders > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-green-50 border border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-900">All Orders Assigned</p>
                  <p className="text-xs text-green-700 mt-1">
                    All {stats.totalOrders} orders have been successfully assigned to consoles.
                  </p>
                </div>
              </div>
            )}

            {stats.unassignedOrdersCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 border border-yellow-200">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-900">Pending Assignments</p>
                  <p className="text-xs text-yellow-700 mt-1">
                    {stats.unassignedOrdersCount} order{stats.unassignedOrdersCount !== 1 ? "s" : ""}{" "}
                    waiting to be assigned to consoles.
                  </p>
                </div>
              </div>
            )}

            {stats.totalConsoles === 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900">No Consoles Created</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Create your first console to start assigning orders.
                  </p>
                </div>
              </div>
            )}


            {stats.totalUsers === 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-purple-50 border border-purple-200">
                <Users className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-purple-900">No Active Users</p>
                  <p className="text-xs text-purple-700 mt-1">
                    No user accounts have been created yet.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
