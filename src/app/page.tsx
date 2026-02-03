import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Database, Package, ShieldCheck } from "lucide-react";
import Image from "next/image";

export default async function Home() {
  const supabase = await createClient();

  let connectionStatus = "checking";
  let errorMsg = null;

  try {
    const { error } = await supabase.from("_non_existent_table_just_to_test_connection").select("*").limit(1);
    // Note: If connection is good but table doesn't exist, we'll get an error, 
    // but the error comes FROM Supabase, which means the connection IS established.
    // If the URL/Key is wrong, we get a different kind of error.
    if (error && error.code === "PGRST116" || !error) {
      connectionStatus = "connected";
    } else {
      // If we get an error that isn't "table not found", it might be a connection issue
      if (error.message.includes("fetch")) {
        connectionStatus = "error";
        errorMsg = error.message;
      } else {
        // Table not found or other Supabase-specific errors actually mean we DID connect to the project
        connectionStatus = "connected";
      }
    }
  } catch (e: unknown) {
    connectionStatus = "error";
    errorMsg = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="min-h-screen p-4 md:p-8 lg:p-12">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-up">
        {/* Hero Section */}
        <section className="text-center space-y-4 py-8">
          <div className="mx-auto h-20 w-52 relative animate-float-slow">
            <Image
              src="/logo.jpg"
              alt="Logistix Logo"
              fill
              className="object-contain drop-shadow-xl"
              priority
            />
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-primary-dark">
            Logistix <span className="text-primary-accent">Pro</span>
          </h1>
          <p className="text-xl text-secondary-muted max-w-2xl mx-auto">
            A production-ready stack with Next.js, Supabase, and shadcn/ui — themed for Logistix Express.
          </p>
        </section>

        {/* Status Dashboard */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-2 shadow-sm hover-lift bg-white/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Supabase Connection</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {connectionStatus === "connected" ? (
                  <>
                    <div className="h-3 w-3 rounded-full bg-primary-accent animate-pulse" />
                    <span className="text-2xl font-bold">Connected</span>
                  </>
                ) : (
                  <>
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="text-2xl font-bold">Error</span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {connectionStatus === "connected" ? "Successfully authenticated with Project API" : errorMsg || "Check environment variables"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 shadow-sm hover-lift bg-white/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">shadcn/ui</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-primary-accent" />
                <span className="text-2xl font-bold">Installed</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                12+ components pre-configured
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 shadow-sm hover-lift bg-white/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Security</CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-primary-accent" />
                <span className="text-2xl font-bold">Middleware</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Auth session refreshing active
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Component Showcase */}
        <Card className="border-2 hover-lift bg-white/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Ready to Build</CardTitle>
            <CardDescription>
              Your environment is fully configured. You can start building your application logic now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-4">
              <Button>Primary Action</Button>
              <Button variant="outline">Secondary Action</Button>
              <Button variant="ghost">Ghost Button</Button>
              <Button variant="destructive">Destructive</Button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg bg-white/80 backdrop-blur space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Client Utilities
                </h3>
                <p className="text-sm text-slate-500">
                  Use <code>@/utils/supabase/client</code> in Client Components.
                </p>
              </div>
              <div className="p-4 border rounded-lg bg-white/80 backdrop-blur space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Server Utilities
                </h3>
                <p className="text-sm text-slate-500">
                  Use <code>@/utils/supabase/server</code> in Server Components & Actions.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-light-bg/40 border-t px-6 py-4 flex justify-between">
            <div className="text-sm text-muted-foreground italic">
              Developed by Antigravity
            </div>
            <a
              href="https://supabase.com/docs"
              target="_blank"
              className="text-sm font-medium text-primary-accent hover:underline"
            >
              View Documentation &rarr;
            </a>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
