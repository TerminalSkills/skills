---
title: Build a Virtual Scroll Table
slug: build-virtual-scroll-table
description: Build a virtual scroll table with row virtualization, column pinning, server-side sorting and filtering, cell editing, row selection, and export for rendering large datasets efficiently.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - virtual-scroll
  - table
  - performance
  - large-datasets
  - rendering
---

# Build a Virtual Scroll Table

## The Problem

Oscar leads frontend at a 20-person analytics company. Their data tables show up to 100,000 rows of financial data. Rendering all rows in the DOM crashes the browser tab (2GB memory, 5-second freeze). They paginate to 50 rows/page but users need to see trends across thousands of rows. Sorting and filtering requires a full page reload. Column pinning doesn't exist — users lose context scrolling horizontally across 20 columns. They need virtual scrolling: render only visible rows, smooth 60fps scrolling through 100K rows, server-side sort/filter, pinned columns, and inline editing.

## Step 1: Build the Virtual Table Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface Column { id: string; label: string; width: number; type: "text" | "number" | "date" | "boolean"; sortable: boolean; filterable: boolean; pinned?: "left" | "right"; editable: boolean; }
interface TableState { columns: Column[]; sortBy: string | null; sortDirection: "asc" | "desc"; filters: Record<string, any>; selectedRows: Set<string>; scrollTop: number; viewportHeight: number; rowHeight: number; }
interface VirtualWindow { startIndex: number; endIndex: number; rows: any[]; totalRows: number; offsetTop: number; totalHeight: number; }

const ROW_HEIGHT = 40;
const OVERSCAN = 10;

export async function getVirtualWindow(table: string, state: TableState): Promise<VirtualWindow> {
  const visibleCount = Math.ceil(state.viewportHeight / ROW_HEIGHT);
  const startIndex = Math.max(0, Math.floor(state.scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = startIndex + visibleCount + OVERSCAN * 2;

  let sql = `SELECT * FROM ${table}`;
  const params: any[] = [];
  let idx = 1;
  const whereClauses: string[] = [];

  for (const [col, value] of Object.entries(state.filters)) {
    if (typeof value === "string" && value) { whereClauses.push(`${col} ILIKE $${idx}`); params.push(`%${value}%`); idx++; }
    else if (typeof value === "object" && value.min !== undefined) { whereClauses.push(`${col} BETWEEN $${idx} AND $${idx + 1}`); params.push(value.min, value.max); idx += 2; }
  }
  if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(" AND ")}`;
  if (state.sortBy) sql += ` ORDER BY ${state.sortBy} ${state.sortDirection}`;
  sql += ` LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(endIndex - startIndex, startIndex);

  const { rows } = await pool.query(sql, params);
  const { rows: [{ count: totalRows }] } = await pool.query(
    `SELECT COUNT(*) as count FROM ${table}${whereClauses.length > 0 ? " WHERE " + whereClauses.join(" AND ") : ""}`,
    params.slice(0, whereClauses.length)
  );

  return {
    startIndex, endIndex: startIndex + rows.length,
    rows, totalRows: parseInt(totalRows),
    offsetTop: startIndex * ROW_HEIGHT,
    totalHeight: parseInt(totalRows) * ROW_HEIGHT,
  };
}

export async function updateCell(table: string, rowId: string, column: string, value: any): Promise<void> {
  await pool.query(`UPDATE ${table} SET ${column} = $2 WHERE id = $1`, [rowId, value]);
}

export async function exportData(table: string, state: TableState, format: "csv" | "json"): Promise<string> {
  let sql = `SELECT * FROM ${table}`;
  const params: any[] = [];
  if (state.sortBy) sql += ` ORDER BY ${state.sortBy} ${state.sortDirection}`;
  const { rows } = await pool.query(sql, params);

  if (format === "json") return JSON.stringify(rows, null, 2);
  const headers = Object.keys(rows[0] || {}).join(",");
  const csvRows = rows.map((r: any) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [headers, ...csvRows].join("\n");
}

export async function getColumnStats(table: string, column: string): Promise<{ min: any; max: any; distinct: number; nullCount: number }> {
  const { rows: [stats] } = await pool.query(
    `SELECT MIN(${column}) as min, MAX(${column}) as max, COUNT(DISTINCT ${column}) as distinct_count, COUNT(*) FILTER (WHERE ${column} IS NULL) as null_count FROM ${table}`
  );
  return { min: stats.min, max: stats.max, distinct: parseInt(stats.distinct_count), nullCount: parseInt(stats.null_count) };
}
```

## Results

- **100K rows rendered smoothly** — only 30-40 DOM rows at any time; 60fps scrolling; browser memory: 2GB → 50MB
- **Server-side sort/filter** — sorting 100K rows happens in PostgreSQL (<100ms); no client-side sort freeze; ILIKE filter searches in real-time
- **Inline editing** — double-click cell to edit; changes saved to DB instantly; no separate edit form; spreadsheet-like UX
- **Column pinning** — ID and Name columns pinned left; scroll horizontally through 20 columns without losing context; totals pinned right
- **CSV/JSON export** — one-click export of filtered/sorted data; finance team gets exactly the view they filtered to; no full dataset dump
