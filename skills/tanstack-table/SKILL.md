---
name: tanstack-table
description: >-
  TanStack Table is a headless table library for React, Vue, Svelte, Solid,
  Angular and Lit that handles sorting, filtering, pagination, row selection
  and column state while you write the markup. Use when someone asks to "build
  a data table", "TanStack Table", "sortable table", "filterable data grid",
  "paginated table", "server-side pagination", "React table", or "headless
  table library", or when migrating code from v8 `useReactTable`.
license: Apache-2.0
compatibility: "React 18+ (also Vue 3.2+, Svelte 5, Solid, Angular 19+, Lit 3). TypeScript recommended."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/TanStack/table
  tags: ["table", "data-grid", "tanstack", "react", "sorting"]
---

# TanStack Table

## Overview

TanStack Table is a headless table library: it manages table state and logic (sorting, filtering, pagination, selection, visibility, pinning, grouping) and you render every element yourself, so there are no built-in styles. The current release is v9 (`@tanstack/react-table` 9.3.x, October 2026), which changed the API from v8: features are opt-in and declared in `tableFeatures(...)`, the hook is `useTable` (not `useReactTable`), and rendering uses `table.FlexRender`. v8 (`8.21.3`) still works if a project is pinned to it; check `package.json` before writing code, because the two APIs do not mix.

## Instructions

### Setup

```bash
npm install @tanstack/react-table        # v9; use @tanstack/react-table@8 to stay on v8
```

Other adapters: `@tanstack/vue-table`, `@tanstack/svelte-table` (Svelte 5), `@tanstack/solid-table`, `@tanstack/angular-table`, `@tanstack/lit-table`.

### The v9 model

1. Declare `features = tableFeatures({ ... })` once at module scope. Register each feature you use (`rowSortingFeature`, `columnFilteringFeature`, `globalFilteringFeature`, `rowPaginationFeature`, `rowSelectionFeature`, `columnVisibilityFeature`, `columnResizingFeature`, `columnPinningFeature`, `columnOrderingFeature`, `rowExpandingFeature`, `columnGroupingFeature`).
2. For client-side work also register the row model factory in the same object: `sortedRowModel: createSortedRowModel()`, `filteredRowModel: createFilteredRowModel()`, `paginatedRowModel: createPaginatedRowModel()`. The core row model is automatic. Sorting needs `sortFns`; filtering needs the filter functions you name in `filterFns` (for example `filterFns: { includesString: filterFn_includesString }`).
3. Type columns as `ColumnDef<typeof features, Row>`.
4. Call `useTable({ features, columns, data, ... }, selector)`. Table state is only re-read in components through the optional selector (second argument); `(state) => state` subscribes to all of it, then read `table.state.pagination` and so on.
5. Render with `<table.FlexRender header={header} />` and `<table.FlexRender cell={cell} />`.

### Client-side table with search, sorting, pagination and selection

This code type-checks against 9.3.1 and renders with `react-dom/server`.

```tsx
import { useState } from "react";
import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  joinedAt: string;
}

// v9: declare the features (and client-side row models) this table uses
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
  filterFns: { includesString: filterFn_includesString },
});

const columns: ColumnDef<typeof features, User>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        aria-label="Select all rows on this page"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        aria-label={`Select ${row.original.name}`}
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "role", header: "Role" },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) => (
      <span style={{ color: info.getValue() === "active" ? "green" : "gray" }}>
        {info.getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: "joinedAt",
    header: "Joined",
    cell: (info) => new Date(info.getValue<string>()).toLocaleDateString("en-US"),
  },
];

export function UsersTable({ data }: { data: User[] }) {
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useTable(
    {
      features,
      columns,
      data, // keep this reference stable (state, query result, module constant)
      getRowId: (row) => String(row.id), // selection state is keyed by row id
      globalFilterFn: "includesString",
      state: { globalFilter },
      onGlobalFilterChange: setGlobalFilter,
      initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    },
    // selector: the slices that should re-render this component
    (state) => state,
  );

  return (
    <div>
      <input
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Search all columns..."
      />
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{ cursor: header.column.getCanSort() ? "pointer" : undefined }}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td key={cell.id}>
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
        Previous
      </button>
      <span>
        Page {table.state.pagination.pageIndex + 1} of {table.getPageCount()}
      </span>
      <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
        Next
      </button>
      <p>{Object.keys(table.state.rowSelection).length} selected</p>
    </div>
  );
}
```

### Server-side pagination and sorting

Register the features without row models, set the `manual*` options, pass the server's total as `rowCount`, and put the pagination and sorting state in the query key. The backend does the slicing and sorting.

```tsx
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";

interface Order { id: string; customer: string; total: number }
interface OrdersPage { rows: Order[]; rowCount: number }

// no row models: the server already sorted and paginated
const features = tableFeatures({ rowPaginationFeature, rowSortingFeature });

const columns: ColumnDef<typeof features, Order>[] = [
  { accessorKey: "id", header: "Order" },
  { accessorKey: "customer", header: "Customer" },
  { accessorKey: "total", header: "Total" },
];

async function fetchOrders(p: PaginationState, s: SortingState): Promise<OrdersPage> {
  const qs = new URLSearchParams({
    page: String(p.pageIndex + 1),
    limit: String(p.pageSize),
    sort: s[0]?.id ?? "id",
    order: s[0]?.desc ? "desc" : "asc",
  });
  const res = await fetch(`/api/orders?${qs}`);
  if (!res.ok) throw new Error(`Orders request failed: ${res.status}`);
  return res.json();
}

export function OrdersTable() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);

  const { data } = useQuery({
    queryKey: ["orders", pagination, sorting],
    queryFn: () => fetchOrders(pagination, sorting),
    placeholderData: keepPreviousData,
  });

  const table = useTable(
    {
      features,
      columns,
      data: data?.rows ?? [],
      rowCount: data?.rowCount, // total rows on the server; page count is derived
      manualPagination: true,
      manualSorting: true,
      state: { pagination, sorting },
      onPaginationChange: setPagination,
      onSortingChange: setSorting,
    },
    (state) => state,
  );
  return <div>{/* render headers and rows as in UsersTable */}Page {table.state.pagination.pageIndex + 1} of {table.getPageCount()}</div>;
}
```

For server filtering, add the filtering features, set `manualFiltering: true`, and reset `pageIndex` to 0 in the filter change handler.

### State you own

Default: let the table keep its state and set `initialState`. To read state elsewhere, either pass `state` plus `onXChange` (the v8 pattern, still supported) or create an external atom with `useCreateAtom` from `@tanstack/react-store` and pass it as `atoms: { rowSelection: rowSelectionAtom }`.

### Column visibility and virtualization

Register `columnVisibilityFeature`, then `table.getColumn("email")?.toggleVisibility(false)`. For 10,000+ rows on one page, render `table.getRowModel().rows` through `@tanstack/react-virtual`; virtualization does not replace server-side pagination when the full dataset is too big to load.

## Examples

### Example 1: Admin users table

**User:** "Build an admin table for users with search, sortable columns, 10 per page and checkboxes for bulk delete."

Use the client-side table above. Read the chosen users with `table.getSelectedRowModel().rows.map((r) => r.original)` and send their `id` values to the delete endpoint. Because `getRowId` returns the database id, `table.state.rowSelection` is already a map of ids that survives sorting and filtering.

### Example 2: Orders table over a paginated API

**User:** "My API returns 20 orders per page. Build a table that fetches page by page and sorts on the server."

Use `OrdersTable` above. Changing the page or a column header changes the state, which changes the query key, which refetches; `keepPreviousData` keeps the old rows visible meanwhile. The API answers `{ rows, rowCount }` for `GET /api/orders?page=2&limit=20&sort=total&order=desc`.

## Guidelines

- Do not copy v8 snippets (`useReactTable`, `getCoreRowModel()`, `getSortedRowModel()`, `flexRender(...)`) into a v9 project; they are replaced by `useTable`, `tableFeatures` slots and `table.FlexRender`. Check the installed version first.
- A feature that is not registered has no APIs and no state: if `getCanSort` or `table.state.rowSelection` is missing, register the feature.
- Row models are type-checked slots: add `paginatedRowModel` only after `rowPaginationFeature`, and `globalFilteringFeature` only after `columnFilteringFeature`.
- Keep `data` and `columns` referentially stable (module constant, state, query result). A new array on every render causes render loops.
- Row ids default to the row index. Set `getRowId` before using row selection with sortable or server-paged data.
- With `manualPagination`, `getSelectedRowModel()` only contains rows on the current page; the selection state can still hold ids from other pages.
- Filter and sort on the same side as pagination. Client-side filtering of a single server page silently hides matching rows on other pages.
