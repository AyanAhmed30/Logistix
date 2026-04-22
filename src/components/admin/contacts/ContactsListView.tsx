"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Building2,
  UserRound,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getContacts,
  type ContactWithRelations,
} from "@/app/actions/contacts";

type Props = {
  onNewContact: () => void;
  onOpenContact: (contactId: string) => void;
  refreshToken: number;
};

const PAGE_SIZE = 40;

export function ContactsListView({ onNewContact, onOpenContact, refreshToken }: Props) {
  const [contacts, setContacts] = useState<ContactWithRelations[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
    });
    getContacts().then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        toast.error(res.error);
        setContacts([]);
      } else if ("contacts" in res && res.contacts) {
        setContacts(res.contacts);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((c) => {
      const hay =
        `${c.name} ${c.company_name || ""} ${c.email || ""} ${c.phone || ""} ${c.country || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [contacts, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const showingFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + PAGE_SIZE, filtered.length);

  function gotoPage(next: number) {
    setPage(Math.max(1, Math.min(totalPages, next)));
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onNewContact}
          className="h-9 px-4 bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New
        </Button>

        <div className="flex items-center gap-2 text-sm font-semibold text-primary-dark">
          <span>Contacts</span>
        </div>

        <div className="flex-1 min-w-[240px] max-w-xl relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-muted pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search…"
            className="pl-9 h-9 bg-slate-50 border-slate-200"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto text-xs text-secondary-muted">
          <span>
            {showingFrom}-{showingTo} / {filtered.length}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => gotoPage(currentPage - 1)}
              className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => gotoPage(currentPage + 1)}
              className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
              disabled={currentPage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="w-10"></TableHead>
              <TableHead className="font-semibold text-primary-dark">Name</TableHead>
              <TableHead className="font-semibold text-primary-dark">Email</TableHead>
              <TableHead className="font-semibold text-primary-dark">Phone</TableHead>
              <TableHead className="font-semibold text-primary-dark text-center w-28">
                Activities
              </TableHead>
              <TableHead className="font-semibold text-primary-dark">Country</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-secondary-muted">
                  Loading contacts…
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-secondary-muted">
                    <UserRound className="h-10 w-10 text-slate-300" />
                    <p className="text-sm font-medium">No contacts yet</p>
                    <p className="text-xs">
                      Click the{" "}
                      <span className="font-semibold text-violet-600">New</span> button to
                      create your first contact.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((contact) => (
                <TableRow
                  key={contact.id}
                  className="cursor-pointer hover:bg-slate-50/80"
                  onClick={() => onOpenContact(contact.id)}
                >
                  <TableCell className="w-10">
                    <ContactAvatar contact={contact} />
                  </TableCell>
                  <TableCell className="font-medium text-primary-dark">
                    {contact.name}
                  </TableCell>
                  <TableCell className="text-secondary-muted">
                    {contact.email || "—"}
                  </TableCell>
                  <TableCell className="text-secondary-muted">
                    {contact.phone || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Clock className="h-4 w-4 text-slate-300 inline-block" />
                  </TableCell>
                  <TableCell className="text-secondary-muted">
                    {contact.country || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ContactAvatar({ contact }: { contact: ContactWithRelations }) {
  const isCompany = contact.company_type === "company";
  const letter = (contact.name || "?").trim().charAt(0).toUpperCase();

  const palette = [
    { bg: "bg-violet-100", fg: "text-violet-700" },
    { bg: "bg-sky-100", fg: "text-sky-700" },
    { bg: "bg-emerald-100", fg: "text-emerald-700" },
    { bg: "bg-amber-100", fg: "text-amber-700" },
    { bg: "bg-rose-100", fg: "text-rose-700" },
  ];
  const idx = Math.abs(
    Array.from(contact.id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  ) % palette.length;
  const c = palette[idx];

  return (
    <div
      className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-semibold ${c.bg} ${c.fg}`}
      title={isCompany ? "Company" : "Individual"}
    >
      {isCompany ? <Building2 className="h-4 w-4" /> : letter || "?"}
    </div>
  );
}
