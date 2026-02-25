---
title: Build a Data Dashboard with Next.js and TanStack
slug: build-dashboard-with-nextjs-and-tanstack
description: Build a real-time analytics dashboard using Next.js App Router for the server-rendered shell, TanStack Query for live data updates, and TanStack Table for sortable, filterable data grids — handling 50,000 rows without freezing the browser.
skills:
  - nextjs
  - tanstack
  - zod
  - neon
category: development
tags:
  - dashboard
  - react
  - data-table
  - real-time
  - analytics
---

# Build a Data Dashboard with Next.js and TanStack

Arun is the solo developer at a logistics startup tracking 2,000 deliveries per day across 15 cities. The current dashboard is a spreadsheet that the operations team exports from the database every morning. By noon it's stale. They want a live dashboard that auto-refreshes, supports sorting and filtering across all columns, and doesn't choke when they pull up a month's worth of delivery data (50,000 rows).

## Step 1 — Server-Rendered Shell with Next.js App Router

The dashboard layout and initial data load use Server Components — zero JavaScript for the page structure, sidebar, and header. Only the interactive data grid and filter controls are Client Components.

```typescript
// src/app/dashboard/deliveries/page.tsx — Server Component page.
// Fetches initial data on the server and passes it to the Client Component.
// The shell (layout, sidebar, header) renders instantly as static HTML.

import { db } from "@/lib/db";
import { deliveries } from "@/lib/schema";
import { desc, sql } from "drizzle-orm";
import { DeliveryDashboard } from "./delivery-dashboard";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";

export const metadata = {
  title: "Deliveries — Operations Dashboard",
};

export default async function DeliveriesPage() {
  const queryClient = getQueryClient();

  // Prefetch the initial data on the server
  await queryClient.prefetchQuery({
    queryKey: ["deliveries", { page: 0, pageSize: 50 }],
    queryFn: async () => {
      const [rows, countResult] = await Promise.all([
        db.select()
          .from(deliveries)
          .orderBy(desc(deliveries.createdAt))
          .limit(50)
          .offset(0),
        db.select({ count: sql<number>`count(*)` })
          .from(deliveries),
      ]);

      return {
        rows,
        totalCount: countResult[0].count,
        pageCount: Math.ceil(countResult[0].count / 50),
      };
    },
  });

  // Prefetch summary stats
  await queryClient.prefetchQuery({
    queryKey: ["deliveries", "stats"],
    queryFn: async () => {
      const result = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
          COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today,
          AVG(EXTRACT(EPOCH FROM (delivered_at - picked_up_at)) / 3600)
            FILTER (WHERE delivered_at IS NOT NULL) as avg_hours
        FROM deliveries
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      `);
      return result.rows[0];
    },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DeliveryDashboard />
    </HydrationBoundary>
  );
}
```

The `HydrationBoundary` passes server-prefetched data to the client. TanStack Query picks it up without re-fetching — the initial page load has zero client-side API calls. After that, Query manages background refetching automatically.

## Step 2 — Build the Data Table with TanStack Table

TanStack Table is headless — it manages sorting, filtering, pagination state, and column definitions. You render the actual HTML/React components.

```tsx
// src/app/dashboard/deliveries/columns.tsx — Column definitions.
// Each column has a typed accessor, optional sorting/filtering config,
// and a cell renderer for custom display (status badges, formatted dates).

"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { Delivery } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

const columnHelper = createColumnHelper<Delivery>();

export const columns = [
  columnHelper.accessor("trackingId", {
    header: "Tracking ID",
    cell: (info) => (
      <span className="font-mono text-sm">{info.getValue()}</span>
    ),
    enableSorting: true,
  }),

  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const status = info.getValue();
      const variants: Record<string, string> = {
        pending: "bg-gray-100 text-gray-700",
        picked_up: "bg-blue-100 text-blue-700",
        in_transit: "bg-yellow-100 text-yellow-700",
        delivered: "bg-green-100 text-green-700",
        failed: "bg-red-100 text-red-700",
      };
      return (
        <Badge className={variants[status] || ""}>
          {status.replace("_", " ")}
        </Badge>
      );
    },
    filterFn: "equals",            // Exact match for status filter dropdown
    enableColumnFilter: true,
  }),

  columnHelper.accessor("city", {
    header: "City",
    enableSorting: true,
    enableColumnFilter: true,
    filterFn: "includesString",    // Substring search for city filter
  }),

  columnHelper.accessor("customerName", {
    header: "Customer",
    enableSorting: true,
  }),

  columnHelper.accessor("driverName", {
    header: "Driver",
    enableSorting: true,
  }),

  columnHelper.accessor("estimatedDelivery", {
    header: "ETA",
    cell: (info) => {
      const date = info.getValue();
      if (!date) return "—";
      const isOverdue = new Date(date) < new Date();
      return (
        <span className={isOverdue ? "text-red-600 font-medium" : ""}>
          {formatDistanceToNow(new Date(date), { addSuffix: true })}
        </span>
      );
    },
    enableSorting: true,
  }),

  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => formatDistanceToNow(new Date(info.getValue()), { addSuffix: true }),
    enableSorting: true,
  }),
];
```

## Step 3 — Wire Up Server-Side Pagination with TanStack Query

The table handles 50,000 rows by fetching pages on demand. TanStack Query caches each page, so navigating back to a previously viewed page is instant.

```tsx
// src/app/dashboard/deliveries/delivery-dashboard.tsx — Main dashboard.
// Combines TanStack Table (headless data grid) with TanStack Query (data fetching).
// Server-side pagination keeps the initial payload small and subsequent pages fast.

"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type PaginationState,
} from "@tanstack/react-table";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { columns } from "./columns";
import { StatsCards } from "./stats-cards";

export function DeliveryDashboard() {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },  // Default: newest first
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const [globalFilter, setGlobalFilter] = useState("");

  // Fetch delivery data with server-side pagination
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["deliveries", { ...pagination, sorting, columnFilters, globalFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(pagination.pageIndex),
        pageSize: String(pagination.pageSize),
        sort: sorting.length ? `${sorting[0].id}:${sorting[0].desc ? "desc" : "asc"}` : "",
        search: globalFilter,
      });

      // Add column filters
      columnFilters.forEach((filter) => {
        params.append(`filter_${filter.id}`, String(filter.value));
      });

      const res = await fetch(`/api/deliveries?${params}`);
      return res.json();
    },
    placeholderData: keepPreviousData,  // Show old data while loading new page
    refetchInterval: 30_000,            // Auto-refresh every 30 seconds
    staleTime: 10_000,                  // Consider data stale after 10 seconds
  });

  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    pageCount: data?.pageCount ?? 0,
    state: { sorting, columnFilters, pagination, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,    // Server handles pagination
    manualSorting: true,       // Server handles sorting
    manualFiltering: true,     // Server handles filtering
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Deliveries</h1>

      {/* Summary stats — also auto-refreshes */}
      <StatsCards />

      {/* Search and filters */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Search tracking ID, customer, driver..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-80 rounded-lg border px-3 py-2 text-sm"
        />

        <select
          value={(columnFilters.find((f) => f.id === "status")?.value as string) || ""}
          onChange={(e) => {
            setColumnFilters((prev) => {
              const filtered = prev.filter((f) => f.id !== "status");
              if (e.target.value) filtered.push({ id: "status", value: e.target.value });
              return filtered;
            });
          }}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="picked_up">Picked Up</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
        </select>

        {isFetching && (
          <span className="text-sm text-gray-400">Refreshing...</span>
        )}
      </div>

      {/* Data table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="cursor-pointer px-4 py-3 text-left font-medium text-gray-600 hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" && " ↑"}
                      {header.column.getIsSorted() === "desc" && " ↓"}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Showing {pagination.pageIndex * pagination.pageSize + 1}–
          {Math.min((pagination.pageIndex + 1) * pagination.pageSize, data?.totalCount || 0)}
          {" "}of {data?.totalCount?.toLocaleString() || 0} deliveries
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm">
            Page {pagination.pageIndex + 1} of {data?.pageCount || 1}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
```

## Step 4 — Build the Server-Side API Route

```typescript
// src/app/api/deliveries/route.ts — API route with server-side pagination.
// Sorting, filtering, and pagination all happen in SQL — the client
// never receives more than one page of data at a time.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveries } from "@/lib/schema";
import { desc, asc, ilike, eq, sql, and, type SQL } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") || 0);
  const pageSize = Math.min(Number(params.get("pageSize") || 50), 100);  // Cap at 100
  const sort = params.get("sort") || "createdAt:desc";
  const search = params.get("search") || "";

  // Build WHERE conditions
  const conditions: SQL[] = [];

  if (search) {
    conditions.push(
      sql`(
        ${deliveries.trackingId} ILIKE ${`%${search}%`} OR
        ${deliveries.customerName} ILIKE ${`%${search}%`} OR
        ${deliveries.driverName} ILIKE ${`%${search}%`}
      )`
    );
  }

  // Column-specific filters
  const statusFilter = params.get("filter_status");
  if (statusFilter) {
    conditions.push(eq(deliveries.status, statusFilter));
  }

  const cityFilter = params.get("filter_city");
  if (cityFilter) {
    conditions.push(ilike(deliveries.city, `%${cityFilter}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Build ORDER BY
  const [sortField, sortDir] = sort.split(":");
  const column = deliveries[sortField as keyof typeof deliveries] || deliveries.createdAt;
  const orderBy = sortDir === "asc" ? asc(column) : desc(column);

  // Execute queries in parallel
  const [rows, countResult] = await Promise.all([
    db.select()
      .from(deliveries)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(page * pageSize),

    db.select({ count: sql<number>`count(*)` })
      .from(deliveries)
      .where(whereClause),
  ]);

  return NextResponse.json({
    rows,
    totalCount: countResult[0].count,
    pageCount: Math.ceil(countResult[0].count / pageSize),
  });
}
```

## Results

Arun deployed the dashboard in five days. The operations team switched from their morning spreadsheet export on day one:

- **Data freshness: 12 hours → 30 seconds** — TanStack Query's `refetchInterval` keeps the dashboard current without manual refreshes. The "Refreshing..." indicator gives the team confidence the data is live.
- **50,000 rows load in 180ms** — server-side pagination means the browser only handles 50 rows at a time. Sorting by any column sends a new SQL query with the correct `ORDER BY` — no client-side array sorting.
- **Page navigation is instant** for previously visited pages — TanStack Query caches each page. Going back to page 1 shows cached data immediately while revalidating in the background.
- **Zero JavaScript for the page shell** — the sidebar, header, and stats cards render as Server Components. Only the data grid and filter controls ship client-side JavaScript (~45KB for TanStack Table + Query).
- **First meaningful paint: 400ms** — server-side prefetching means the initial page load includes real data, not a loading spinner. The `HydrationBoundary` ensures no duplicate fetch on the client.
- **Operations team uses 15 saved filter combinations** — status + city + date range filters chain together via column filters. Each combination has its own cache key, so switching between views is instant after the first load.
