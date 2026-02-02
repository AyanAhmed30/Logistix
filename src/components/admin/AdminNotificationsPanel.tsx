"use client";

import { useEffect, useState } from "react";
import { getAdminNotifications } from "@/app/actions/orders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Notification = {
  id: string;
  username: string;
  shipping_mark: string;
  total_cartons: number;
  created_at: string;
};

export function AdminNotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    getAdminNotifications()
      .then((result) => {
        if (!isMounted) return;
        if ("error" in result) {
          setError(result.error ?? "Unable to load notifications");
          setNotifications([]);
        } else {
          setError(null);
          setNotifications(result.notifications as Notification[]);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Loading notifications...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Unable to load notifications: {error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (notifications.length === 0) {
    return (
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>No new order notifications yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-white border shadow-sm">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Latest orders placed by users.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="rounded-lg border border-slate-100 bg-slate-50/60 p-3"
          >
            <div className="text-sm font-semibold text-primary-dark">
              New order from {notification.username}
            </div>
            <div className="text-xs text-secondary-muted font-mono">
              UUID: {notification.id}
            </div>
            <div className="text-xs text-secondary-muted">
              Shipping Mark: {notification.shipping_mark} • Total Cartons:{" "}
              {notification.total_cartons}
            </div>
            <div className="text-xs text-secondary-muted">
              {new Date(notification.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
