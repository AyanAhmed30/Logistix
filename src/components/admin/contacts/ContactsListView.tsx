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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Building2,
  UserRound,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  getContacts,
  type ContactWithRelations,
} from "@/app/actions/contacts";
import {
  getCachedContactsList,
  peekContactsClientCache,
} from "@/lib/contacts-client-cache";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { ModuleLoadingOverlay } from "@/components/ui/ModuleLoadingOverlay";

type Props = {
  onNewContact: () => void;
  onOpenContact: (contactId: string) => void;
  refreshToken: number;
  onListLoaded?: () => void;
};

const PAGE_SIZE = 40;

type TypeFilter = "all" | "person" | "company";

export function ContactsListView({
  onNewContact,
  onOpenContact,
  refreshToken,
  onListLoaded,
}: Props) {
  const { switchVersion } = useAdminOrganization();
  const cacheKey = `${switchVersion}:${refreshToken}`;
  const cached = peekContactsClientCache(cacheKey);
  const initialContacts =
    cached && "contacts" in cached && cached.contacts ? cached.contacts : [];

  const [contacts, setContacts] = useState<ContactWithRelations[]>(initialContacts);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(initialContacts.length === 0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const key = `${switchVersion}:${refreshToken}`;
    const existing = peekContactsClientCache(key);
    const hasCache =
      existing && "contacts" in existing && Array.isArray(existing.contacts);

    if (hasCache) {
      setContacts(existing.contacts);
      setLoading(false);
      onListLoaded?.();
    } else {
      setLoading(true);
    }

    // Always refetch when cache had no Customer IDs (peek already dropped those).
    getCachedContactsList(key, () => getContacts(), { force: !hasCache }).then(
      (res) => {
        if (cancelled) return;
        if ("error" in res && res.error) {
          toast.error(res.error);
          if (!hasCache) setContacts([]);
        } else if ("contacts" in res && res.contacts) {
          setContacts(res.contacts);
        }
        setLoading(false);
        onListLoaded?.();
      }
    );

    return () => {
      cancelled = true;
    };
  }, [refreshToken, switchVersion, onListLoaded]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (typeFilter !== "all" && c.company_type !== typeFilter) return false;
      if (!needle) return true;
      const tagNames = (c.tags || []).map((t) => t.name).join(" ");
      const hay =
        `${c.lead_id_formatted || ""} ${c.name} ${c.company_name || ""} ${c.email || ""} ${c.phone || ""} ${c.country || ""} ${tagNames}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [contacts, search, typeFilter]);

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
      {loading && contacts.length === 0 ? (
        <ModuleLoadingOverlay label="Contacts" />
      ) : null}
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
            placeholder="Search contacts…"
            className="pl-9 h-9 bg-slate-50 border-slate-200"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-secondary-muted shrink-0" aria-hidden />
          <Select
            value={typeFilter}
            onValueChange={(value) => {
              setTypeFilter(value as TypeFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[140px] bg-slate-50 border-slate-200">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="person">Individuals</SelectItem>
              <SelectItem value="company">Companies</SelectItem>
            </SelectContent>
          </Select>
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
              <TableHead className="font-semibold text-primary-dark w-[100px]">
                Customer ID
              </TableHead>
              <TableHead className="font-semibold text-primary-dark">Name</TableHead>
              <TableHead className="font-semibold text-primary-dark">Email</TableHead>
              <TableHead className="font-semibold text-primary-dark">Phone</TableHead>
              <TableHead className="font-semibold text-primary-dark">Tags</TableHead>
              <TableHead className="font-semibold text-primary-dark">Country</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-secondary-muted">
                  Loading contacts…
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
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
                  <TableCell className="font-mono text-sm text-secondary-muted">
                    {contact.lead_id_formatted || "—"}
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
                  <TableCell>
                    <ContactTagsCell tags={contact.tags} />
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

function ContactTagsCell({
  tags,
}: {
  tags?: ContactWithRelations["tags"];
}) {
  if (!tags?.length) {
    return <span className="text-secondary-muted text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 max-w-[200px]">
      {tags.slice(0, 3).map((tag) => (
        <span
          key={tag.id}
          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium truncate max-w-[90px]"
          style={{
            backgroundColor: `${tag.color}20`,
            color: tag.color,
          }}
          title={tag.name}
        >
          {tag.name}
        </span>
      ))}
      {tags.length > 3 && (
        <span className="text-[10px] text-secondary-muted">+{tags.length - 3}</span>
      )}
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
