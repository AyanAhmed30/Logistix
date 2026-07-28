"use client";

import { useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { logout } from "@/app/actions/auth";

type Props = {
  children: ReactNode;
  className?: string;
};

export function SignOutForm({ children, className }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const submittedRef = useRef(false);

  function handleSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSigningOut(true);
  }

  return (
    <>
      {signingOut ? (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-8 py-6 shadow-lg border border-slate-200">
            <Loader2 className="h-8 w-8 animate-spin text-[#017e84]" aria-hidden />
            <p className="text-sm font-medium text-primary-dark">Signing Out…</p>
          </div>
        </div>
      ) : null}
      <form action={logout} className={className} onSubmit={handleSubmit}>
        {children}
      </form>
    </>
  );
}
