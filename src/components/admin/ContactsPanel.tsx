"use client";

import { useEffect, useRef, useState } from "react";
import { ContactsListView } from "@/components/admin/contacts/ContactsListView";
import { ContactFormView } from "@/components/admin/contacts/ContactFormView";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

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
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [view, setView] = useState<View>({ mode: "list" });
  const [refreshToken, setRefreshToken] = useState(0);
  const skipFirstSwitch = useRef(true);

  // Honour external "open this contact" requests (e.g. clicking the
  // customer link on a quotation).
  useEffect(() => {
    if (!initialPayload) return;
    if (initialPayload.contactId) {
      setView({ mode: "form", contactId: initialPayload.contactId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPayload?.token]);

  // Organization switch → back to list and refetch scoped contacts.
  useEffect(() => {
    if (skipFirstSwitch.current) {
      skipFirstSwitch.current = false;
      return;
    }
    setView({ mode: "list" });
    setRefreshToken((n) => n + 1);
  }, [switchVersion]);

  if (isAdminContext) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-secondary-muted">
        Select a company from the header switcher to view and manage Contacts for
        that organization.
      </div>
    );
  }

  return (
    <>
      {/* Keep list mounted (hidden on form) so saves refresh data without a full panel reload. */}
      <div className={view.mode === "list" ? "" : "hidden"} aria-hidden={view.mode !== "list"}>
        <ContactsListView
          key={switchVersion}
          refreshToken={refreshToken}
          onNewContact={() => setView({ mode: "form", contactId: null })}
          onOpenContact={(contactId) => setView({ mode: "form", contactId })}
        />
      </div>

      {view.mode === "form" ? (
        <ContactFormView
          key={`${switchVersion}-${view.contactId || "new"}`}
          contactId={view.contactId}
          onBack={() => {
            setView({ mode: "list" });
          }}
          onSaved={() => {
            setRefreshToken((n) => n + 1);
          }}
        />
      ) : null}
    </>
  );
}
