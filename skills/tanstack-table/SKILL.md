---
name: tanstack-table
description: >-
  Build powerful data tables with TanStack Table — headless, framework-agnostic
  table library. Use when someone asks to "build a data table", "TanStack Table",
  "sortable table", "filterable data grid", "paginated table", "React table",
  or "headless table library". Covers sorting, filtering, pagination, column
  resizing, row selection, and virtualization.
license: Apache-2.0
compatibility: "React, Vue, Svelte, Solid, vanilla JS. TypeScript."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["table", "data-grid", "tanstack", "react", "sorting"]
---

# TanStack Table

## Overview

TanStack Table is a headless table library — it handles the logic (sorting, filtering, pagination, grouping, column visibility) and you handle the rendering. No predefined styles or markup, full control over how the table looks. Works with React, Vue, Svelte, Solid, or vanilla JS. The standard for building custom data tables that don't look like every other Material UI table.

## When to Use

- Displaying tabular data with sorting, filtering, and pagination
- Need full control over table styling (not a pre-styled component)
- Server-side pagination and filtering
- Complex tables with column resizing, reordering, and pinning
- Row selection and bulk actions
- Large datasets with virtualized rendering

## Instructions

### Setup

```bash
npm install @tanstack/react-table
```

### Basic Table

```tsx
// components/DataTable.tsx — Sortable, filterable table
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { useState } from "react";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  joinedAt: string;
}

const columns: ColumnDef<User>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: (info) => <span className="font-medium">{info.getValue<string>()}</span>,
  },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "role", header: "Role" },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) => (
      <span className={info.getValue() === "active" ? "text-green-600" : "text-gray-400"}>
        {info.getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: "joinedAt",
    header: "Joined",
    cell: (info) => new Date(info.getValue<string>()).toLocaleDateString(),
  },
];

export function UsersTable({ data }: { data: User[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div>
      {/* Search */}
      <input
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Search all columns..."
        className="mb-4 p-2 border rounded"
      />

      {/* Table */}
      <table className="w-full border-collapse">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="text-left p-3 border-b cursor-pointer hover:bg-gray-50"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="p-3 border-b">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex items-center gap-2 mt-4">
        <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </button>
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </span>
        <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </button>
      </div>
    </div>
  );
}
```

### Server-Side Pagination

```tsx
// components/ServerTable.tsx — Fetch data per page from API
const table = useReactTable({
  data: serverData.rows,
  columns,
  pageCount: serverData.pageCount,
  state: { sorting, pagination },
  onSortingChange: setSorting,
  onPaginationChange: setPagination,
  getCoreRowModel: getCoreRowModel(),
  manualPagination: true,   // Server handles pagination
  manualSorting: true,      // Server handles sorting
});

// Fetch when pagination/sorting changes
useEffect(() => {
  fetchData({
    page: pagination.pageIndex,
    pageSize: pagination.pageSize,
    sortBy: sorting[0]?.id,
    sortDir: sorting[0]?.desc ? "desc" : "asc",
  });
}, [pagination, sorting]);
```

### Row Selection

```tsx
const [rowSelection, setRowSelection] = useState({});

const columns: ColumnDef<User>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <input type="checkbox" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />
    ),
    cell: ({ row }) => (
      <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
    ),
  },
  // ... other columns
];

// Get selected rows
const selectedUsers = table.getSelectedRowModel().rows.map((r) => r.original);
```

## Examples

### Example 1: Admin data table with CRUD

**User prompt:** "Build an admin table for managing users — sort, filter, paginate, and bulk delete."

The agent will create a TanStack Table with all features, row selection for bulk actions, and a search input.

### Example 2: Server-side paginated table

**User prompt:** "My API returns paginated data. Build a table that fetches page by page."

The agent will set up manual pagination/sorting, fetch data on state change, and handle loading states.

## Guidelines

- **Headless = you own the markup** — style however you want
- **`getCoreRowModel` is required** — always include it
- **Add models for features** — `getSortedRowModel`, `getFilteredRowModel`, etc.
- **`manualPagination` for server-side** — table tracks state, you fetch data
- **`ColumnDef` for type safety** — `accessorKey` maps to data fields
- **`flexRender` for cell rendering** — renders header and cell components
- **Row selection with `getToggleSelectedHandler`** — works with checkboxes
- **Column visibility** — `table.getColumn("email")?.toggleVisibility(false)`
- **Virtualization** — combine with `@tanstack/react-virtual` for 100K+ rows
- **No styles included** — use Tailwind, CSS, or any styling solution
