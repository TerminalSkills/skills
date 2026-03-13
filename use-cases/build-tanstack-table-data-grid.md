---
title: Build a TanStack Table Data Grid
slug: build-tanstack-table-data-grid
description: >-
  Build a feature-rich data table with TanStack Table — sorting, filtering,
  pagination, column resizing, row selection, and virtual scrolling for
  handling thousands of rows in admin dashboards.
skills:
  - tanstack-table
  - tanstack
  - tailwindcss
category: development
tags:
  - data-table
  - tanstack
  - react
  - dashboard
  - ui
---

# Build a TanStack Table Data Grid

Ida's admin dashboard displays user lists, orders, and logs — thousands of rows with sorting, filtering, and pagination. She tried AG Grid ($900/year) and custom table components (unmaintainable). TanStack Table is headless: it handles the logic (sorting, filtering, pagination, selection) while she controls every pixel of rendering. Zero styling opinions, full control, and it handles 100,000 rows with virtual scrolling.

## Step 1: Basic Table Setup

```tsx
// src/components/DataTable.tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { useState } from "react";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  pageSize?: number;
}

export function DataTable<T>({ data, columns, pageSize = 20 }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div>
      {/* Global search */}
      <input
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Search all columns..."
        className="px-4 py-2 border rounded mb-4 w-64"
      />

      {/* Selection actions */}
      {Object.keys(rowSelection).length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded flex items-center gap-4">
          <span className="text-sm">{Object.keys(rowSelection).length} selected</span>
          <button className="text-sm text-blue-600">Export Selected</button>
          <button className="text-sm text-red-600">Delete Selected</button>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer select-none hover:bg-gray-100"
                    style={{ width: header.getSize() }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
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
                  <td key={cell.id} className="px-4 py-3 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-gray-600">
          Showing {table.getState().pagination.pageIndex * pageSize + 1} to{" "}
          {Math.min((table.getState().pagination.pageIndex + 1) * pageSize, table.getFilteredRowModel().rows.length)}{" "}
          of {table.getFilteredRowModel().rows.length}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
```

## Step 2: Define Columns with Custom Cells

```tsx
// src/pages/users/columns.tsx
import { createColumnHelper } from "@tanstack/react-table";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  status: "active" | "suspended" | "banned";
  createdAt: string;
  lastActiveAt: string;
}

const columnHelper = createColumnHelper<User>();

export const userColumns = [
  columnHelper.display({
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
    size: 40,
  }),

  columnHelper.accessor("name", {
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium">
          {row.original.name.charAt(0)}
        </div>
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-gray-500">{row.original.email}</p>
        </div>
      </div>
    ),
    size: 250,
  }),

  columnHelper.accessor("role", {
    header: "Role",
    cell: ({ getValue }) => {
      const role = getValue();
      const colors = { admin: "bg-purple-100 text-purple-700", editor: "bg-blue-100 text-blue-700", viewer: "bg-gray-100 text-gray-700" };
      return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[role]}`}>{role}</span>;
    },
    filterFn: "equals",
  }),

  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue();
      const colors = { active: "bg-green-100 text-green-700", suspended: "bg-yellow-100 text-yellow-700", banned: "bg-red-100 text-red-700" };
      return <span className={`px-2 py-0.5 rounded text-xs ${colors[status]}`}>{status}</span>;
    },
  }),

  columnHelper.accessor("createdAt", {
    header: "Joined",
    cell: ({ getValue }) => new Date(getValue()).toLocaleDateString(),
    sortingFn: "datetime",
  }),

  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex gap-2">
        <button className="text-blue-600 text-sm hover:underline">Edit</button>
        <button className="text-red-600 text-sm hover:underline">Delete</button>
      </div>
    ),
    size: 120,
  }),
];
```

## Step 3: Column Filters

```tsx
// src/components/ColumnFilter.tsx
import { Column } from "@tanstack/react-table";

export function ColumnFilter<T>({ column }: { column: Column<T, unknown> }) {
  const filterValue = column.getFilterValue();

  if (column.id === "role" || column.id === "status") {
    const options = column.id === "role"
      ? ["admin", "editor", "viewer"]
      : ["active", "suspended", "banned"];

    return (
      <select
        value={(filterValue as string) || ""}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
        className="text-xs px-2 py-1 border rounded w-full mt-1"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      value={(filterValue as string) || ""}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="Filter..."
      className="text-xs px-2 py-1 border rounded w-full mt-1"
    />
  );
}
```

## Summary

Ida has a full-featured data grid without paying for a commercial component. Sorting, filtering (global and per-column), pagination, and row selection work out of the box. Custom cell renderers show avatars, colored badges, and action buttons. The table is type-safe: column accessors are checked against the data type, so typos in field names are caught at compile time. For 100K+ rows, she adds `@tanstack/react-virtual` for virtualized rendering — only visible rows are in the DOM. The headless approach means the table looks exactly like her design system, not a third-party widget.
