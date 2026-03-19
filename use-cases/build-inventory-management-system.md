---
title: Build an Inventory Management System with Low-Stock Alerts and Supplier Orders
slug: build-inventory-management-system
description: Build a custom inventory management system — SKU tracking with variants, multi-location stock movements, automated low-stock email alerts, auto-generated purchase orders, and inventory reports — replacing off-the-shelf tools with something tailored to your warehouse.
skills:
  - prisma
  - resend
category: operations
tags:
  - inventory
  - warehouse
  - stock-management
  - purchase-orders
  - alerts
  - reporting
---

# Build an Inventory Management System with Low-Stock Alerts and Supplier Orders

Fatima runs an online pet supply store. She has 500 SKUs, 2 warehouses (Berlin and Warsaw), and a team of 8 people managing stock. She uses a spreadsheet and WhatsApp. Last month she oversold 200 units of a dog food SKU because nobody updated the sheet after the Warsaw warehouse shipped an order. She needs real stock levels, movement history, and automated reorder triggers — without paying $300/month for Shopify Inventory Plus or Cin7.

## Step 1 — Data Model: Products, Variants, Locations, Movements

```prisma
// prisma/schema.prisma — Inventory management system data model.

model Product {
  id          String    @id @default(cuid())
  name        String
  sku         String    @unique  // Base SKU (e.g., "DOG-FOOD-SALMON")
  description String?
  imageUrl    String?
  category    String?
  supplierId  String?
  supplier    Supplier? @relation(fields: [supplierId], references: [id])
  variants    Variant[]
  createdAt   DateTime  @default(now())
}

model Variant {
  id             String          @id @default(cuid())
  productId      String
  product        Product         @relation(fields: [productId], references: [id])
  sku            String          @unique  // Full variant SKU (e.g., "DOG-FOOD-SALMON-5KG")
  name           String          // "5kg", "10kg", "Large/Red"
  barcode        String?
  costPrice      Int             // cents
  salePrice      Int             // cents
  reorderPoint   Int             @default(10) // Alert when stock drops below this
  reorderQty     Int             @default(50) // Suggested PO quantity
  stockByLocation VariantStock[]
  movements      StockMovement[]
  purchaseItems  PurchaseOrderItem[]
}

model Location {
  id       String         @id @default(cuid())
  name     String         @unique  // "Berlin Warehouse", "Warsaw Warehouse"
  address  String?
  stock    VariantStock[]
}

model VariantStock {
  variantId  String
  variant    Variant  @relation(fields: [variantId], references: [id])
  locationId String
  location   Location @relation(fields: [locationId], references: [id])
  quantity   Int      @default(0)

  @@id([variantId, locationId])
}

model StockMovement {
  id         String   @id @default(cuid())
  variantId  String
  variant    Variant  @relation(fields: [variantId], references: [id])
  locationId String
  type       String   // "receive" | "ship" | "adjust" | "transfer_in" | "transfer_out"
  quantity   Int      // positive = stock increase, negative = decrease
  reference  String?  // Order ID, PO number, etc.
  note       String?
  userId     String
  createdAt  DateTime @default(now())
}

model Supplier {
  id       String    @id @default(cuid())
  name     String
  email    String
  phone    String?
  leadDays Int       @default(7) // Typical delivery time in days
  products Product[]
  purchaseOrders PurchaseOrder[]
}

model PurchaseOrder {
  id          String              @id @default(cuid())
  supplierId  String
  supplier    Supplier            @relation(fields: [supplierId], references: [id])
  status      String              @default("draft") // "draft" | "sent" | "received" | "cancelled"
  items       PurchaseOrderItem[]
  totalCents  Int                 @default(0)
  sentAt      DateTime?
  expectedAt  DateTime?
  receivedAt  DateTime?
  createdAt   DateTime            @default(now())
}

model PurchaseOrderItem {
  id              String        @id @default(cuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])
  variantId       String
  variant         Variant       @relation(fields: [variantId], references: [id])
  quantity        Int
  unitCost        Int           // cents at time of order
  receivedQty     Int           @default(0)
}
```

## Step 2 — Stock Movement Engine (Atomic Updates)

```typescript
// src/lib/inventory.ts — All stock changes go through this module.
// Uses Prisma transactions to keep VariantStock and StockMovement in sync.
// Never update stock directly — always use these functions.

import { db } from "@/lib/db";
import { checkAndAlertLowStock } from "./alerts";

interface MovementParams {
  variantId: string;
  locationId: string;
  type: "receive" | "ship" | "adjust" | "transfer_in" | "transfer_out";
  quantity: number;   // Always positive; type determines direction
  reference?: string;
  note?: string;
  userId: string;
}

export async function recordMovement(params: MovementParams) {
  const delta = ["receive", "transfer_in"].includes(params.type)
    ? params.quantity
    : -params.quantity;

  return db.$transaction(async (tx) => {
    // Update stock level (upsert in case this location/variant combo is new)
    const updated = await tx.variantStock.upsert({
      where: { variantId_locationId: { variantId: params.variantId, locationId: params.locationId } },
      create: {
        variantId: params.variantId,
        locationId: params.locationId,
        quantity: Math.max(0, delta),
      },
      update: { quantity: { increment: delta } },
    });

    // Guard against negative stock
    if (updated.quantity < 0) {
      throw new Error(`Insufficient stock: would result in ${updated.quantity} units`);
    }

    // Record the movement for audit trail
    const movement = await tx.stockMovement.create({
      data: {
        variantId: params.variantId,
        locationId: params.locationId,
        type: params.type,
        quantity: delta,
        reference: params.reference,
        note: params.note,
        userId: params.userId,
      },
    });

    return { updated, movement };
  }).then(async (result) => {
    // After successful transaction, check if reorder alert is needed
    await checkAndAlertLowStock(params.variantId);
    return result;
  });
}

export async function transferStock(params: {
  variantId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  userId: string;
  reference?: string;
}) {
  // Transfer is two movements in one transaction
  return db.$transaction(async (tx) => {
    // Decrement source
    const source = await tx.variantStock.update({
      where: { variantId_locationId: { variantId: params.variantId, locationId: params.fromLocationId } },
      data: { quantity: { decrement: params.quantity } },
    });

    if (source.quantity < 0) throw new Error("Insufficient stock at source location");

    // Increment destination
    await tx.variantStock.upsert({
      where: { variantId_locationId: { variantId: params.variantId, locationId: params.toLocationId } },
      create: { variantId: params.variantId, locationId: params.toLocationId, quantity: params.quantity },
      update: { quantity: { increment: params.quantity } },
    });

    // Two movement records
    await tx.stockMovement.createMany({
      data: [
        { variantId: params.variantId, locationId: params.fromLocationId, type: "transfer_out", quantity: -params.quantity, reference: params.reference, userId: params.userId },
        { variantId: params.variantId, locationId: params.toLocationId, type: "transfer_in", quantity: params.quantity, reference: params.reference, userId: params.userId },
      ],
    });
  });
}

export async function getTotalStock(variantId: string): Promise<number> {
  const result = await db.variantStock.aggregate({
    where: { variantId },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}
```

## Step 3 — Low-Stock Alerts and Auto-Generate Purchase Orders

```typescript
// src/lib/alerts.ts — Check reorder point and send alert or auto-create PO.

import { Resend } from "resend";
import { db } from "@/lib/db";
import { LowStockAlertEmail } from "@/emails/LowStockAlertEmail";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function checkAndAlertLowStock(variantId: string) {
  const variant = await db.variant.findUniqueOrThrow({
    where: { id: variantId },
    include: {
      product: { include: { supplier: true } },
      stockByLocation: { include: { location: true } },
    },
  });

  const totalStock = variant.stockByLocation.reduce((sum, s) => sum + s.quantity, 0);

  if (totalStock > variant.reorderPoint) return; // Still above threshold, nothing to do

  // Check if there's already an open PO for this variant
  const openPO = await db.purchaseOrderItem.findFirst({
    where: {
      variantId,
      purchaseOrder: { status: { in: ["draft", "sent"] } },
    },
  });

  if (openPO) return; // Already have a pending order

  // Auto-create a purchase order if supplier is configured
  if (variant.product.supplier) {
    const po = await autoCreatePurchaseOrder(variant, variant.product.supplier);
    await sendLowStockAlert(variant, totalStock, po.id);
  } else {
    await sendLowStockAlert(variant, totalStock, null);
  }
}

async function autoCreatePurchaseOrder(variant: any, supplier: any) {
  return db.purchaseOrder.create({
    data: {
      supplierId: supplier.id,
      status: "draft",
      expectedAt: new Date(Date.now() + supplier.leadDays * 86400000),
      items: {
        create: [{
          variantId: variant.id,
          quantity: variant.reorderQty,
          unitCost: variant.costPrice,
        }],
      },
      totalCents: variant.reorderQty * variant.costPrice,
    },
  });
}

async function sendLowStockAlert(variant: any, currentStock: number, poId: string | null) {
  const recipients = await db.user.findMany({
    where: { role: { in: ["admin", "warehouse_manager"] } },
    select: { email: true, name: true },
  });

  await resend.batch.send(
    recipients.map((r) => ({
      from: "inventory@your-store.com",
      to: r.email,
      subject: `⚠️ Low stock: ${variant.product.name} — ${variant.name} (${currentStock} units left)`,
      react: LowStockAlertEmail({
        variantName: `${variant.product.name} — ${variant.name}`,
        sku: variant.sku,
        currentStock,
        reorderPoint: variant.reorderPoint,
        reorderQty: variant.reorderQty,
        poId,
        appUrl: process.env.NEXT_PUBLIC_APP_URL!,
      }),
    }))
  );
}
```

## Step 4 — Inventory Reports: Turnover, Dead Stock, Valuation

```typescript
// src/lib/reports.ts — Inventory analytics and reports.

import { db } from "@/lib/db";

export async function getInventoryValuation() {
  const variants = await db.variant.findMany({
    include: {
      stockByLocation: true,
    },
  });

  return variants.map((v) => {
    const totalQty = v.stockByLocation.reduce((sum, s) => sum + s.quantity, 0);
    return {
      sku: v.sku,
      name: v.name,
      totalQty,
      costPrice: v.costPrice,
      totalValue: totalQty * v.costPrice,
      saleValue: totalQty * v.salePrice,
    };
  });
}

export async function getDeadStock(inactiveDays = 90) {
  // SKUs with no outbound movements in the last N days and stock > 0
  const cutoff = new Date(Date.now() - inactiveDays * 86400000);

  const activeVariantIds = await db.stockMovement.findMany({
    where: { type: "ship", createdAt: { gte: cutoff } },
    select: { variantId: true },
    distinct: ["variantId"],
  });

  const activeIds = new Set(activeVariantIds.map((m) => m.variantId));

  const allVariants = await db.variant.findMany({
    include: { stockByLocation: true, product: true },
  });

  return allVariants.filter((v) => {
    const totalQty = v.stockByLocation.reduce((s, l) => s + l.quantity, 0);
    return totalQty > 0 && !activeIds.has(v.id);
  }).map((v) => ({
    sku: v.sku,
    productName: v.product.name,
    variantName: v.name,
    totalQty: v.stockByLocation.reduce((s, l) => s + l.quantity, 0),
    deadValueCents: v.stockByLocation.reduce((s, l) => s + l.quantity, 0) * v.costPrice,
  }));
}

export async function getStockTurnoverRate(variantId: string, days = 30) {
  const cutoff = new Date(Date.now() - days * 86400000);

  const [shipped, avgStock] = await Promise.all([
    db.stockMovement.aggregate({
      where: { variantId, type: "ship", createdAt: { gte: cutoff } },
      _sum: { quantity: true },
    }),
    db.variantStock.aggregate({
      where: { variantId },
      _avg: { quantity: true },
    }),
  ]);

  const unitsSold = Math.abs(shipped._sum.quantity ?? 0);
  const avg = avgStock._avg.quantity ?? 0;
  if (avg === 0) return 0;

  const annualizedSold = (unitsSold / days) * 365;
  return annualizedSold / avg; // Turnover rate: higher = faster-moving
}
```

## Step 5 — Receive Purchase Order: Bulk Stock Update

```typescript
// src/app/api/purchase-orders/[poId]/receive/route.ts
// Mark items as received — updates stock and closes the PO.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordMovement } from "@/lib/inventory";

export async function POST(
  req: Request,
  { params }: { params: { poId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { locationId, items }: { locationId: string; items: { itemId: string; receivedQty: number }[] } = await req.json();

  const po = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: params.poId },
    include: { items: { include: { variant: true } } },
  });

  // Record received stock for each item
  for (const received of items) {
    const item = po.items.find((i) => i.id === received.itemId);
    if (!item || received.receivedQty <= 0) continue;

    await db.purchaseOrderItem.update({
      where: { id: received.itemId },
      data: { receivedQty: { increment: received.receivedQty } },
    });

    await recordMovement({
      variantId: item.variantId,
      locationId,
      type: "receive",
      quantity: received.receivedQty,
      reference: `PO-${po.id}`,
      userId: session.user.id,
    });
  }

  // Check if all items fully received → close the PO
  const updatedPO = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: params.poId },
    include: { items: true },
  });

  const allReceived = updatedPO.items.every((i) => i.receivedQty >= i.quantity);
  if (allReceived) {
    await db.purchaseOrder.update({
      where: { id: params.poId },
      data: { status: "received", receivedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, fullyReceived: allReceived });
}
```

## Results

Fatima deployed the system in week 1 and migrated all 500 SKUs from the spreadsheet in day 2.

- **Overselling dropped to 0** — the stock movement engine uses database transactions. Concurrent orders can't both decrement below zero. The spreadsheet race condition is gone.
- **Reorder alerts** fire within seconds of a stock drop below the threshold. Fatima's team gets an email with a draft PO already created — one click to review and send to the supplier.
- **Dead stock report** revealed €8,400 worth of slow-moving SKUs (cat toys that hadn't shipped in 120 days). She ran a clearance sale; sold 60% within 2 weeks.
- **Transfer tracking** — the Berlin→Warsaw transfers that used to be WhatsApp messages are now logged movements with timestamps. Stock discrepancies dropped from 12/month to 1/month.
- **Monthly valuation** — Fatima exports inventory value every month for the accountant. What used to be a 3-hour manual count is now a 10-second CSV download.
- **Cost: ~$30/month** (database + hosting). Previous tool: $290/month for a system with fewer features and no multi-location support.
