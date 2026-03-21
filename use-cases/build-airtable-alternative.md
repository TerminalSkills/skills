---
title: "Build a Self-Hosted Airtable Alternative"
description: "Create a flexible data management app with multiple field types, views (grid/kanban/calendar), shareable forms, automations, and auto-generated REST APIs — without the $20/user/month Airtable bill."
skills: [prisma, nextjs]
difficulty: intermediate
time_estimate: "16 hours"
tags: [database, no-code, forms, views, api, self-hosted]
---

# Build a Self-Hosted Airtable Alternative

## The Problem

Your ops team is managing projects in Airtable. It's great — until you hit 10 users and the bill jumps to $200/month. The data is yours. The logic is simple. You could own this.

## Who This Is For

**Persona:** An ops manager at a 15-person company. You use Airtable for project tracking, vendor management, and onboarding checklists. Your team loves the UI but not the price. You want all the same features, hosted on your own infrastructure, with custom branding.

## What You'll Build

- Dynamic tables with 8+ field types
- Views: grid, kanban, gallery, calendar
- Shareable forms that write directly to tables
- Row-level automations (trigger on create/update)
- Auto-generated REST API for every table
- Role-based access: owner, editor, viewer

---

## Architecture

```
Next.js App (App Router)
├── /tables/[id]     — Grid/Kanban/Calendar view
├── /forms/[id]      — Public shareable form
└── /api/tables/[id] — Auto-generated REST API

Prisma + PostgreSQL
├── Table (metadata, schema definition)
├── Column (field type, config)
├── Row (record data as JSON)
└── Automation (trigger + action config)
```

---

## Step 1: Dynamic Schema with Prisma

Instead of one table per user table, store data in a flexible EAV-adjacent model:

```prisma
// schema.prisma
model Table {
  id          String   @id @default(cuid())
  name        String
  description String?
  workspaceId String
  columns     Column[]
  rows        Row[]
  views       View[]
  automations Automation[]
  createdAt   DateTime @default(now())
}

model Column {
  id       String @id @default(cuid())
  tableId  String
  table    Table  @relation(fields: [tableId], references: [id], onDelete: Cascade)
  name     String
  type     String // text|number|select|multiselect|date|checkbox|url|relation|file
  config   Json   @default("{}") // options for select, relation target, etc.
  position Int
}

model Row {
  id        String   @id @default(cuid())
  tableId   String
  table     Table    @relation(fields: [tableId], references: [id], onDelete: Cascade)
  data      Json     @default("{}") // { columnId: value }
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model View {
  id      String @id @default(cuid())
  tableId String
  table   Table  @relation(fields: [tableId], references: [id], onDelete: Cascade)
  name    String
  type    String // grid|kanban|calendar|gallery
  config  Json   @default("{}") // groupBy, sortBy, filters, hiddenColumns
}
```

---

## Step 2: Grid View Component

```typescript
// components/views/GridView.tsx
'use client'
import { useState } from 'react'
import { Column, Row } from '@prisma/client'

export function GridView({ columns, rows, tableId }: {
  columns: Column[]
  rows: Row[]
  tableId: string
}) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null)

  async function updateCell(rowId: string, columnId: string, value: unknown) {
    await fetch(`/api/tables/${tableId}/rows/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId, value })
    })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.id} className="border px-3 py-2 text-left text-sm font-medium bg-gray-50">
                <ColumnHeader column={col} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-gray-50">
              {columns.map(col => (
                <td
                  key={col.id}
                  className="border px-3 py-2 text-sm cursor-pointer"
                  onClick={() => setEditingCell({ rowId: row.id, colId: col.id })}
                >
                  {editingCell?.rowId === row.id && editingCell?.colId === col.id ? (
                    <CellEditor
                      column={col}
                      value={(row.data as any)[col.id]}
                      onSave={(val) => {
                        updateCell(row.id, col.id, val)
                        setEditingCell(null)
                      }}
                    />
                  ) : (
                    <CellRenderer column={col} value={(row.data as any)[col.id]} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## Step 3: Auto-Generated REST API

Every table automatically gets a REST API:

```typescript
// app/api/tables/[tableId]/rows/route.ts
import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: { tableId: string } }) {
  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') ?? 100)
  const offset = Number(searchParams.get('offset') ?? 0)
  const filterCol = searchParams.get('filterBy')
  const filterVal = searchParams.get('filterValue')

  const rows = await prisma.row.findMany({
    where: {
      tableId: params.tableId,
      ...(filterCol && filterVal
        ? { data: { path: [filterCol], equals: filterVal } }
        : {})
    },
    skip: offset,
    take: limit,
    orderBy: { createdAt: 'desc' }
  })

  return Response.json({ rows, total: rows.length, offset, limit })
}

export async function POST(req: NextRequest, { params }: { params: { tableId: string } }) {
  const body = await req.json()
  const row = await prisma.row.create({
    data: { tableId: params.tableId, data: body }
  })
  // Trigger automations
  await triggerAutomations(params.tableId, 'row.created', row)
  return Response.json(row, { status: 201 })
}
```

---

## Step 4: Shareable Forms

```typescript
// app/forms/[formId]/page.tsx
export default async function FormPage({ params }: { params: { formId: string } }) {
  const form = await prisma.view.findUnique({
    where: { id: params.formId, type: 'form' },
    include: { table: { include: { columns: { orderBy: { position: 'asc' } } } } }
  })
  if (!form) return <div>Form not found</div>

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold mb-6">{(form.config as any).title}</h1>
      <FormRenderer
        columns={form.table.columns}
        tableId={form.table.id}
        successMessage={(form.config as any).successMessage}
      />
    </div>
  )
}
```

---

## Step 5: Automations

```typescript
// lib/automations.ts
export async function triggerAutomations(tableId: string, event: string, data: any) {
  const automations = await prisma.automation.findMany({
    where: { tableId, trigger: { path: ['event'], equals: event }, enabled: true }
  })

  for (const automation of automations) {
    const action = automation.action as any
    if (action.type === 'send_email') {
      await sendEmail({ to: resolveTemplate(action.to, data), subject: action.subject, body: action.body })
    } else if (action.type === 'webhook') {
      await fetch(action.url, { method: 'POST', body: JSON.stringify(data) })
    } else if (action.type === 'create_row') {
      await prisma.row.create({ data: { tableId: action.targetTableId, data: action.rowData } })
    }
  }
}
```

---

## Field Type Reference

| Type | Storage | UI Component |
|------|---------|-------------|
| text | string | Input |
| number | number | Number input |
| select | string | Dropdown |
| multiselect | string[] | Tag picker |
| date | ISO string | Date picker |
| checkbox | boolean | Toggle |
| relation | string (row ID) | Record picker |
| file | URL string | File uploader |

---

## Cost Comparison

| Users | Airtable Pro | Your Platform |
|-------|-------------|---------------|
| 5 | $100/mo | ~$10/mo |
| 20 | $400/mo | ~$10/mo |
| 50 | $1,000/mo | ~$20/mo |

---

## Next Steps

1. Add a kanban drag-and-drop view with `@dnd-kit`
2. Build calendar view for date fields
3. Add CSV import/export
4. Implement row comments and activity history
5. Add field-level permissions
