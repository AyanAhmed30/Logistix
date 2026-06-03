import { Input } from "@/components/ui/input";
import type {
  LoadingInstructionSortKey,
  LoadingInstructionStatusFilter,
} from "@/lib/loading-instruction-progress";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: LoadingInstructionStatusFilter;
  onStatusFilterChange: (v: LoadingInstructionStatusFilter) => void;
  sort: LoadingInstructionSortKey;
  onSortChange: (v: LoadingInstructionSortKey) => void;
};

export function LoadingInstructionFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sort,
  onSortChange,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-end">
      <div className="flex-1 min-w-[200px]">
        <label className="text-xs font-medium text-secondary-muted block mb-1">
          Search order, shipping mark, console, or carton
        </label>
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-white"
        />
      </div>
      <div className="min-w-[160px]">
        <label className="text-xs font-medium text-secondary-muted block mb-1">Filter status</label>
        <select
          className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
          value={statusFilter}
          onChange={(e) =>
            onStatusFilterChange(e.target.value as LoadingInstructionStatusFilter)
          }
        >
          <option value="all">All</option>
          <option value="fully_loaded">Fully Loaded</option>
          <option value="partially_loaded">Partially Loaded</option>
          <option value="waiting">Waiting for Loading</option>
          <option value="has_inward">Has Inward</option>
          <option value="has_outward">Has Outward</option>
          <option value="has_re_inward">Has Re-Inward</option>
        </select>
      </div>
      <div className="min-w-[160px]">
        <label className="text-xs font-medium text-secondary-muted block mb-1">Sort by</label>
        <select
          className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as LoadingInstructionSortKey)}
        >
          <option value="latest_activity">Latest activity</option>
          <option value="oldest_activity">Oldest activity</option>
          <option value="most_loaded">Most loaded</option>
          <option value="most_re_inward">Most re-inward</option>
        </select>
      </div>
    </div>
  );
}
