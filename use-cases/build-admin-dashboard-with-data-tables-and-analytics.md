---
title: Build an Admin Dashboard with Data Tables and Analytics
slug: build-admin-dashboard-with-data-tables-and-analytics
description: Create an internal admin dashboard using TanStack Table for data management, SWR for data fetching, Valtio for state, and Umami for usage tracking.
skills:
  - tanstack-table
  - swr
  - valtio
  - umami
category: development
tags:
  - admin
  - dashboard
  - data-table
  - react
  - analytics
---

## The Problem

Lena's ops team manages 50,000 customers through a clunky internal tool — a page that loads all customers at once (10-second load time), has no search or filtering, and requires a page refresh to see updates. They've asked engineering for sorting, server-side search, bulk actions (deactivate, export), and some way to know which dashboard features the team actually uses so they can prioritize improvements.

## The Solution

Build an admin dashboard with TanStack Table for powerful data tables (server-side sorting, filtering, pagination), SWR for efficient data fetching with caching and background revalidation, Valtio for simple shared state (selected filters, sidebar state, user preferences), and Umami to track which features the ops team uses most.

## Step-by-Step Walkthrough

### Step 1: Dashboard State with Valtio

```typescript
// store/dashboard.ts — Shared dashboard state
import { proxy } from "valtio";

export const dashboardState = proxy({
  sidebar: { open: true, activeSection: "customers" as string },
  filters: {
    status: "all" as "all" | "active" | "inactive" | "suspended",
    plan: "all" as "all" | "free" | "pro" | "enterprise",
    dateRange: "30d" as "7d" | "30d" | "90d" | "all",
  },
  selectedIds: new Set<string>(),
  bulkAction: null as "deactivate" | "export" | "email" | null,
});

export function setFilter(key: keyof typeof dashboardState.filters, value: string) {
  (dashboardState.filters as any)[key] = value;
}

export function toggleSelected(id: string) {
  if (dashboardState.selectedIds.has(id)) {
    dashboardState.selectedIds.delete(id);
  } else {
    dashboardState.selectedIds.add(id);
  }
}

export function selectAll(ids: string[]) {
  ids.forEach((id) => dashboardState.selectedIds.add(id));
}

export function clearSelection() {
  dashboardState.selectedIds.clear();
}
```

### Step 2: Data Fetching with SWR

```typescript
// hooks/useCustomers.ts — Server-side paginated data
import useSWR from "swr";
import { useSnapshot } from "valtio";
import { dashboardState } from "@/store/dashboard";

interface CustomersResponse {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

export function useCustomers(page: number, pageSize: number, sortBy?: string, sortDir?: string) {
  const snap = useSnapshot(dashboardState);

  // Build query string from filters
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(sortBy && { sortBy, sortDir: sortDir || "asc" }),
    ...(snap.filters.status !== "all" && { status: snap.filters.status }),
    ...(snap.filters.plan !== "all" && { plan: snap.filters.plan }),
    ...(snap.filters.dateRange !== "all" && { dateRange: snap.filters.dateRange }),
  });

  const { data, error, isLoading, mutate } = useSWR<CustomersResponse>(
    `/api/admin/customers?${params}`,
    {
      keepPreviousData: true,  // Show old data while loading new page
      revalidateOnFocus: false, // Don't refetch on tab focus for admin
    }
  );

  return { data, error, isLoading, mutate };
}
```

### Step 3: Data Table with TanStack Table

```tsx
// components/CustomersTable.tsx — Full-featured admin table
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  PaginationState,
} from "@tanstack/react-table";
import { useState } from "react";
import { useSnapshot } from "valtio";
import { useCustomers } from "@/hooks/useCustomers";
import { dashboardState, toggleSelected, selectAll, clearSelection } from "@/store/dashboard";

const columns: ColumnDef<Customer>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={(e) => {
          table.toggleAllPageRowsSelected(e.target.checked);
          if (e.target.checked) {
            selectAll(table.getRowModel().rows.map((r) => r.original.id));
          } else {
            clearSelection();
          }
        }}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={() => toggleSelected(row.original.id)}
      />
    ),
  },
  {
    accessorKey: "name",
    header: "Customer",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="text-sm text-gray-500">{row.original.email}</div>
      </div>
    ),
  },
  { accessorKey: "plan", header: "Plan" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue<string>();
      const colors = { active: "bg-green-100 text-green-800", inactive: "bg-gray-100", suspended: "bg-red-100 text-red-800" };
      return <span className={`px-2 py-1 rounded-full text-xs ${colors[status]}`}>{status}</span>;
    },
  },
  { accessorKey: "mrr", header: "MRR", cell: ({ getValue }) => `$${getValue<number>().toFixed(2)}` },
  { accessorKey: "createdAt", header: "Joined", cell: ({ getValue }) => new Date(getValue<string>()).toLocaleDateString() },
];

export function CustomersTable() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const sortField = sorting[0]?.id;
  const sortDir = sorting[0]?.desc ? "desc" : "asc";

  const { data, isLoading } = useCustomers(
    pagination.pageIndex + 1,
    pagination.pageSize,
    sortField,
    sortDir,
  );

  const table = useReactTable({
    data: data?.customers ?? [],
    columns,
    pageCount: data ? Math.ceil(data.total / data.pageSize) : -1,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-500">
          {data?.total ?? 0} customers
        </span>
        <BulkActions />
      </div>

      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} onClick={h.column.getToggleSortingHandler()} className="text-left p-3 cursor-pointer">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: " ↑", desc: " ↓" }[h.column.getIsSorted() as string] ?? ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50 border-b">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="p-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between items-center mt-4">
        <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          ← Previous
        </button>
        <span>Page {pagination.pageIndex + 1} of {table.getPageCount()}</span>
        <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next →
        </button>
      </div>
    </div>
  );
}
```

### Step 4: Track Feature Usage with Umami

```tsx
// Track which admin features are actually used
function BulkActions() {
  const snap = useSnapshot(dashboardState);
  const selectedCount = snap.selectedIds.size;

  const handleBulkAction = (action: string) => {
    umami.track("admin-bulk-action", { action, count: selectedCount });
    // Execute action...
  };

  return (
    <div className="flex gap-2">
      <button
        disabled={selectedCount === 0}
        onClick={() => handleBulkAction("export")}
      >
        Export ({selectedCount})
      </button>
      <button
        disabled={selectedCount === 0}
        onClick={() => handleBulkAction("deactivate")}
        className="text-red-600"
      >
        Deactivate
      </button>
    </div>
  );
}
```

## The Outcome

Lena's ops team goes from a 10-second page load to instant pagination — the table fetches 25 rows at a time with server-side sorting and filtering. SWR caches pages so navigating back is instant. Bulk actions let them deactivate 200 churned accounts in one click instead of one-by-one. Valtio keeps filter state synchronized across the sidebar and table without prop drilling. Umami shows that the team uses the "export" bulk action 12 times per day (justify building a scheduled export feature next) and the "suspended" filter 3x more than "inactive" (rename the filter to be more prominent). Dashboard load time: 200ms. Time saved per ops team member: 45 minutes per day.
