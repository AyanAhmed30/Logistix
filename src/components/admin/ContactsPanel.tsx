"use client";

import { useState } from "react";
import { ContactsListView } from "@/components/admin/contacts/ContactsListView";
import { ContactFormView } from "@/components/admin/contacts/ContactFormView";

type View = { mode: "list" } | { mode: "form"; contactId: string | null };

export function ContactsPanel() {
  const [view, setView] = useState<View>({ mode: "list" });
  const [refreshToken, setRefreshToken] = useState(0);

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
