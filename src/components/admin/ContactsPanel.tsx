"use client";

import { useEffect, useState } from "react";
import { ContactsListView } from "@/components/admin/contacts/ContactsListView";
import { ContactFormView } from "@/components/admin/contacts/ContactFormView";

type View = { mode: "list" } | { mode: "form"; contactId: string | null };

export type ContactsPanelInitialPayload = {
  contactId?: string | null;
  /** Monotonically-changing token so the same payload can be applied twice. */
  token?: number;
};

export function ContactsPanel({
  initialPayload,
}: {
  initialPayload?: ContactsPanelInitialPayload;
} = {}) {
  const [view, setView] = useState<View>({ mode: "list" });
  const [refreshToken, setRefreshToken] = useState(0);

  // Honour external "open this contact" requests (e.g. clicking the
  // customer link on a quotation).
  useEffect(() => {
    if (!initialPayload) return;
    if (initialPayload.contactId) {
      setView({ mode: "form", contactId: initialPayload.contactId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPayload?.token]);

  if (view.mode === "list") {
    return (
      <ContactsListView
        refreshToken={refreshToken}
        onNewContact={() => setView({ mode: "form", contactId: null })}
        onOpenContact={(contactId) => setView({ mode: "form", contactId })}
      />
    );
  }

  return (
    <ContactFormView
      contactId={view.contactId}
      onBack={() => {
        setRefreshToken((n) => n + 1);
        setView({ mode: "list" });
      }}
      onSaved={(id) => {
        setRefreshToken((n) => n + 1);
        setView({ mode: "form", contactId: id });
      }}
    />
  );
}
