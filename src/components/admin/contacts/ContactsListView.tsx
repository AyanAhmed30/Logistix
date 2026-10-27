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
  getContactsPage,
  type ContactWithRelations,
  type ContactsSourceCounts,
} from "@/app/actions/contacts";
import {
  getCachedContactsList,
  peekContactsClientCache,
  peekContactsSourceCounts,
  rememberContactsSourceCounts,
} from "@/lib/contacts-client-cache";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ContactDateRangeFilter } from "@/components/admin/contacts/ContactDateRangeFilter";
import {
  formatContactDateRangeLabel,
  toContactDateRangeQuery,
  type ContactDateRangeValue,
} from "@/lib/contact-date-range";

type Props = {
  onNewContact: () => void;
  onOpenContact: (contactId: string) => void;
  refreshToken: number;
  onListLoaded?: () => void;
};

const PAGE_SIZE = 40;

type TypeFilter = "all" | "person" | "company";
type SourceFilter = "all" | "mobile_app" | "manual";

function isMobileAppContact(c: ContactWithRelations): boolean {
  return Boolean(c.mobile_registered_at) || c.source === "mobile_app";
}

/** Display contact Added time in Pakistan business timezone. */
function formatContactAddedAt(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function ContactsListView({
  onNewContact,
  onOpenContact,
  refreshToken,
  onListLoaded,
}: Props) {
  const { switchVersion, organizationId } = useAdminOrganization();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [dateRange, setDateRange] = useState<ContactDateRangeValue | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [page, setPage] = useState(1);

  const dateQuery = useMemo(
    () => (dateRange ? toContactDateRangeQuery(dateRange) : null),
    [dateRange]
  );

  const needle = debouncedSearch.trim();
  const createdAtGte = dateQuery?.createdAtGte ?? null;
  const createdAtLt = dateQuery?.createdAtLt ?? null;
  // Source counts depend on access + search + date only (not type / source / page).
  const countsKey = `${organizationId ?? "none"}:${switchVersion}:${refreshToken}:${needle}:${createdAtGte ?? ""}:${createdAtLt ?? ""}`;
  const pageKey = `${countsKey}:${typeFilter}:${sourceFilter}:${page}`;

  const cached = peekContactsClientCache(pageKey);
  const cachedPage = cached && "contacts" in cached ? cached : null;

  const [contacts, setContacts] = useState<ContactWithRelations[]>(
    cachedPage?.contacts ?? []
  );
  const [totalCount, setTotalCount] = useState(cachedPage?.totalCount ?? 0);
  const [sourceCounts, setSourceCounts] = useState<ContactsSourceCounts>(
    () => peekContactsSourceCounts(countsKey) ?? { all: 0, mobile: 0, manual: 0 }
  );
  const [loading, setLoading] = useState(!cachedPage);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const knownCounts = peekContactsSourceCounts(countsKey);
    if (knownCounts) setSourceCounts(knownCounts);

    // Paint any cached page immediately, then revalidate if it has expired.
    const existing = peekContactsClientCache(pageKey);
    if (existing && "contacts" in existing) {
      setContacts(existing.contacts);
      setTotalCount(existing.totalCount ?? existing.contacts.length);
      setLoading(false);
      setLoadError(null);
    } else {
      setLoading(true);
    }

    getCachedContactsList(
      pageKey,
      () =>
        getContactsPage({
          search: needle || undefined,
          createdAtGte,
          createdAtLt,
          page,
          pageSize: PAGE_SIZE,
          companyType: typeFilter,
          source: sourceFilter,
          includeSourceCounts: !knownCounts,
        }),
      { force: retryToken > 0 && !existing }
    ).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        toast.error(res.error);
        if (!existing) {
          setContacts([]);
          setTotalCount(0);
          setLoadError(res.error);
        }
      } else if ("contacts" in res && res.contacts) {
        setContacts(res.contacts);
        setTotalCount(res.totalCount ?? res.contacts.length);
        setLoadError(null);
        if (res.sourceCounts) {
          rememberContactsSourceCounts(countsKey, res.sourceCounts);
          setSourceCounts(res.sourceCounts);
        }
      }
      setLoading(false);
      onListLoaded?.();
    });

    return () => {
      cancelled = true;
    };
  }, [
    countsKey,
    pageKey,
    needle,
    createdAtGte,
    createdAtLt,
    page,
    typeFilter,
    sourceFilter,
    retryToken,
    onListLoaded,
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = contacts;
  const showingFrom = totalCount === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + contacts.length, totalCount);

  // Rows can disappear between loads (deletes) — step back to the last real page.
  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

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
            placeholder="Search by name, Customer ID, or phone…"
            className="pl-9 h-9 bg-slate-50 border-slate-200"
          />
        </div>

        <ContactDateRangeFilter
          value={dateRange}
          onChange={(next) => {
            setDateRange(next);
            setPage(1);
          }}
        />

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
          <Select
            value={sourceFilter}
            onValueChange={(value) => {
              setSourceFilter(value as SourceFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[200px] bg-slate-50 border-slate-200">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All ({sourceCounts.all})
              </SelectItem>
              <SelectItem value="mobile_app">
                Mobile App Customers ({sourceCounts.mobile})
              </SelectItem>
              <SelectItem value="manual">
                Manual / CRM Contacts ({sourceCounts.manual})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 ml-auto text-xs text-secondary-muted">
          <span>
            {showingFrom}-{showingTo} / {totalCount}
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

      {dateRange ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-violet-100 bg-violet-50/70 px-3 py-2 text-sm">
          <span className="font-semibold text-violet-900">
            {formatContactDateRangeLabel(dateRange)}
          </span>
          <span className="text-violet-800">
            Total Contacts:{" "}
            <span className="font-semibold tabular-nums">{totalCount}</span>
          </span>
          {debouncedSearch.trim() ? (
            <span className="text-xs text-violet-700/80">
              (with search “{debouncedSearch.trim()}”)
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Table */}
      <div
        className={`bg-white border rounded-lg overflow-hidden transition-opacity ${
          loading && contacts.length > 0 ? "opacity-60" : ""
        }`}
        aria-busy={loading}
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="w-10"></TableHead>
              <TableHead className="font-semibold text-primary-dark w-[100px]">
                Customer ID
              </TableHead>
              <TableHead className="font-semibold text-primary-dark">Name</TableHead>
              <TableHead className="font-semibold text-primary-dark">Phone</TableHead>
              <TableHead className="font-semibold text-primary-dark">Tags</TableHead>
              <TableHead className="font-semibold text-primary-dark whitespace-nowrap">
                Added
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-secondary-muted">
                  Loading contacts…
                </TableCell>
              </TableRow>
            ) : loadError && paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-secondary-muted">
                    <p className="text-sm font-medium">Couldn&apos;t load contacts.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRetryToken((n) => n + 1)}
                    >
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-secondary-muted">
                    <UserRound className="h-10 w-10 text-slate-300" />
                    <p className="text-sm font-medium">
                      {dateRange || debouncedSearch.trim()
                        ? "No contacts match these filters"
                        : "No contacts yet"}
                    </p>
                    <p className="text-xs">
                      {dateRange || debouncedSearch.trim() ? (
                        <>Try clearing the date range or search, or adjust filters.</>
                      ) : (
                        <>
                          Click the{" "}
                          <span className="font-semibold text-violet-600">New</span> button
                          to create your first contact.
                        </>
                      )}
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
                    <div className="flex flex-col gap-0.5">
                      <span>{contact.name}</span>
                      {isMobileAppContact(contact) ? (
                        <span className="inline-flex w-fit rounded px-1.5 py-0.5 text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-100">
                          Mobile App Customer
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-secondary-muted">
                    {contact.phone || "—"}
                  </TableCell>
                  <TableCell>
                    <ContactTagsCell contact={contact} />
                  </TableCell>
                  <TableCell className="text-sm text-secondary-muted whitespace-nowrap">
                    {formatContactAddedAt(contact.created_at)}
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

const LEAD_SOURCE_VALUES = new Set(["meta", "linkedin", "whatsapp", "others"]);

function leadSourceDisplayTags(contact: ContactWithRelations) {
  const fromTags = (contact.tags || []).filter((tag) => {
    const name = String(tag.name || "").trim().toLowerCase();
    if (!name || name === "legacy lead") return false;
    return name.startsWith("lead source:");
  });

  if (fromTags.length) return fromTags;

  const source = String(contact.source || "").trim();
  if (source && LEAD_SOURCE_VALUES.has(source.toLowerCase())) {
    return [
      {
        id: `source-${contact.id}`,
        name: `Lead Source: ${source}`,
        color:
          source.toLowerCase() === "whatsapp"
            ? "#25D366"
            : source.toLowerCase() === "meta"
              ? "#1877F2"
              : source.toLowerCase() === "linkedin"
                ? "#0A66C2"
                : "#6B7280",
      },
    ];
  }

  return [];
}

function ContactTagsCell({ contact }: { contact: ContactWithRelations }) {
  const tags = leadSourceDisplayTags(contact);
  if (!tags.length) {
    return <span className="text-secondary-muted text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 max-w-[220px]">
      {tags.slice(0, 2).map((tag) => (
        <span
          key={tag.id}
          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium truncate max-w-[160px]"
          style={{
            backgroundColor: `${tag.color}20`,
            color: tag.color,
          }}
          title={tag.name}
        >
          {tag.name}
        </span>
      ))}
      {tags.length > 2 && (
        <span className="text-[10px] text-secondary-muted">+{tags.length - 2}</span>
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
