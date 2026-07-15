import type { Metadata } from "next";
import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthSessionGuard } from "@/components/auth/AuthSessionGuard";
import { AppRuntimeGuards } from "@/components/error/AppRuntimeGuards";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logistix Express Private Limited",
  description: "Logistix Express Private Limited",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="app-shell">
          {children}
        </div>
        <Suspense fallback={null}>
          <AuthSessionGuard />
        </Suspense>
        <AppRuntimeGuards />
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
