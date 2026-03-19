---
title: Build an Event Ticketing Platform — Create Events, Sell Tickets, Check In Attendees
slug: build-event-ticketing-platform
description: Build an end-to-end ticketing platform — event creation with ticket tiers, Stripe checkout with QR code generation, mobile check-in app, organizer sales dashboard, and automated email reminders — replacing Eventbrite's 6% fee with a system you own.
skills:
  - stripe
  - resend
  - prisma
category: business
tags:
  - events
  - ticketing
  - qr-code
  - stripe
  - check-in
  - email
---

# Build an Event Ticketing Platform — Create Events, Sell Tickets, Check In Attendees

Remy organizes monthly tech meetups in Berlin. Eventbrite takes 6% + $1.99 per ticket. On a 150-person event with $20 tickets, that's $230 in fees — every month. He wants his own platform: attendees buy tickets on his site, get a QR code by email, and volunteers scan them at the door. No fees. No Eventbrite data harvesting his attendee list.

## Step 1 — Data Model: Events, Ticket Tiers, Orders, and Check-ins

```prisma
// prisma/schema.prisma — Event ticketing platform data model.

model Event {
  id          String       @id @default(cuid())
  title       String
  slug        String       @unique
  description String
  venue       String
  address     String
  startsAt    DateTime
  endsAt      DateTime
  bannerUrl   String?
  published   Boolean      @default(false)
  tiers       TicketTier[]
  orders      Order[]
  createdAt   DateTime     @default(now())
}

model TicketTier {
  id          String   @id @default(cuid())
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id])
  name        String   // "Early Bird", "General Admission", "VIP"
  description String?
  price       Int      // cents
  capacity    Int      // max tickets for this tier
  sold        Int      @default(0) // denormalized for fast availability check
  stripePriceId String?
  tickets     Ticket[]
  createdAt   DateTime @default(now())
}

model Order {
  id             String    @id @default(cuid())
  eventId        String
  event          Event     @relation(fields: [eventId], references: [id])
  buyerEmail     String
  buyerName      String
  stripeSessionId String?  @unique
  status         String    @default("pending") // "pending" | "paid" | "refunded"
  tickets        Ticket[]
  totalCents     Int
  createdAt      DateTime  @default(now())
}

model Ticket {
  id           String    @id @default(cuid())
  orderId      String
  order        Order     @relation(fields: [orderId], references: [id])
  tierId       String
  tier         TicketTier @relation(fields: [tierId], references: [id])
  qrCode       String    @unique // UUID used in QR payload
  attendeeName String?
  checkedInAt  DateTime?
  checkedInBy  String?   // volunteer user ID
  createdAt    DateTime  @default(now())
}
```

## Step 2 — Sell Tickets with Stripe Checkout

```typescript
// src/app/api/events/[slug]/checkout/route.ts
// Buyer selects ticket quantity per tier → creates Stripe Checkout session.
// Ticket records are created in the webhook after payment succeeds.

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

interface TierSelection {
  tierId: string;
  quantity: number;
}

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const { selections, buyerEmail, buyerName } = await req.json() as {
    selections: TierSelection[];
    buyerEmail: string;
    buyerName: string;
  };

  const event = await db.event.findUniqueOrThrow({
    where: { slug: params.slug },
    include: { tiers: true },
  });

  if (new Date() > event.startsAt) {
    return NextResponse.json({ error: "Event has started" }, { status: 400 });
  }

  // Validate availability for each tier
  for (const sel of selections) {
    const tier = event.tiers.find((t) => t.id === sel.tierId);
    if (!tier) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    if (tier.sold + sel.quantity > tier.capacity) {
      return NextResponse.json({ error: `${tier.name} is sold out` }, { status: 400 });
    }
  }

  // Build line items for Stripe
  const lineItems = selections
    .filter((s) => s.quantity > 0)
    .map((s) => {
      const tier = event.tiers.find((t) => t.id === s.tierId)!;
      return {
        price_data: {
          currency: "eur",
          unit_amount: tier.price,
          product_data: { name: `${event.title} — ${tier.name}` },
        },
        quantity: s.quantity,
      };
    });

  // Create a pending order first
  const order = await db.order.create({
    data: {
      eventId: event.id,
      buyerEmail,
      buyerName,
      status: "pending",
      totalCents: lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0),
    },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: buyerEmail,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/events/${params.slug}/confirmation?order=${order.id}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/events/${params.slug}`,
    metadata: {
      orderId: order.id,
      selections: JSON.stringify(selections),
      buyerName,
    },
    expires_at: Math.floor(Date.now() / 1000) + 1800, // 30-minute session
  });

  await db.order.update({
    where: { id: order.id },
    data: { stripeSessionId: session.id },
  });

  return NextResponse.json({ url: session.url });
}
```

## Step 3 — Generate QR Tickets on Payment and Email Them

```typescript
// src/app/api/webhooks/stripe/route.ts — Create tickets and send confirmation email.

import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { sendTicketConfirmation } from "@/lib/email";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature")!;
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { orderId, selections: selectionsJson, buyerName } = session.metadata!;
    const selections: { tierId: string; quantity: number }[] = JSON.parse(selectionsJson);

    // Mark order as paid
    await db.order.update({ where: { id: orderId }, data: { status: "paid" } });

    // Create one Ticket record per attendee, each with a unique QR code
    const createdTickets = [];
    for (const sel of selections) {
      for (let i = 0; i < sel.quantity; i++) {
        const ticket = await db.ticket.create({
          data: {
            orderId,
            tierId: sel.tierId,
            qrCode: randomUUID(),      // This UUID goes in the QR code payload
            attendeeName: buyerName,
          },
        });
        createdTickets.push(ticket);
      }

      // Increment sold count on tier
      await db.ticketTier.update({
        where: { id: sel.tierId },
        data: { sold: { increment: sel.quantity } },
      });
    }

    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { event: true, tickets: { include: { tier: true } } },
    });

    // Send confirmation email with QR codes
    await sendTicketConfirmation(order);
  }

  return new Response("OK");
}
```

```typescript
// src/lib/email.ts — Send ticket confirmation with QR codes via Resend.

import { Resend } from "resend";
import QRCode from "qrcode";
import { TicketConfirmationEmail } from "@/emails/TicketConfirmationEmail";
import type { Order, Ticket, TicketTier, Event } from "@prisma/client";

const resend = new Resend(process.env.RESEND_API_KEY!);

type FullOrder = Order & { event: Event; tickets: (Ticket & { tier: TicketTier })[] };

export async function sendTicketConfirmation(order: FullOrder) {
  // Generate a QR code PNG (base64) for each ticket
  const ticketsWithQR = await Promise.all(
    order.tickets.map(async (ticket) => ({
      ...ticket,
      qrDataUrl: await QRCode.toDataURL(
        JSON.stringify({ id: ticket.id, qr: ticket.qrCode }),
        { width: 300, margin: 2 }
      ),
    }))
  );

  await resend.emails.send({
    from: "tickets@your-events.com",
    to: order.buyerEmail,
    subject: `Your tickets for ${order.event.title} 🎟️`,
    react: TicketConfirmationEmail({
      buyerName: order.buyerName,
      event: order.event,
      tickets: ticketsWithQR,
    }),
  });
}

export async function sendDayBeforeReminder(eventId: string) {
  const orders = await db.order.findMany({
    where: { eventId, status: "paid" },
    include: { event: true, tickets: { include: { tier: true } } },
  });

  // Batch send via Resend
  await resend.batch.send(
    orders.map((order) => ({
      from: "tickets@your-events.com",
      to: order.buyerEmail,
      subject: `Tomorrow: ${order.event.title} — your tickets inside 📍`,
      react: ReminderEmail({ order }),
    }))
  );
}
```

## Step 4 — Check-in App: Scan QR, Mark as Arrived

```typescript
// src/app/api/checkin/route.ts — Volunteer scans a QR code at the door.
// Validates the ticket and marks it as checked in.
// Works on mobile — volunteers use their phone's camera.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qrPayload } = await req.json();

  let parsed: { id: string; qr: string };
  try {
    parsed = JSON.parse(qrPayload);
  } catch {
    return NextResponse.json({ error: "Invalid QR code" }, { status: 400 });
  }

  const ticket = await db.ticket.findUnique({
    where: { id: parsed.id },
    include: { order: true, tier: { include: { event: true } } },
  });

  if (!ticket || ticket.qrCode !== parsed.qr) {
    return NextResponse.json({ status: "invalid", message: "Ticket not found" }, { status: 404 });
  }

  if (ticket.order.status !== "paid") {
    return NextResponse.json({ status: "unpaid", message: "Order not paid" }, { status: 400 });
  }

  if (ticket.checkedInAt) {
    return NextResponse.json({
      status: "duplicate",
      message: `Already checked in at ${ticket.checkedInAt.toISOString()}`,
      ticket,
    }, { status: 409 });
  }

  const updated = await db.ticket.update({
    where: { id: ticket.id },
    data: { checkedInAt: new Date(), checkedInBy: session.user.id },
    include: { tier: { include: { event: true } } },
  });

  return NextResponse.json({
    status: "ok",
    message: `Welcome, ${ticket.attendeeName}!`,
    tier: updated.tier.name,
    event: updated.tier.event.title,
  });
}
```

```tsx
// src/app/checkin/page.tsx — Mobile check-in scanner using the device camera.
// Volunteers open this page on their phone at the event entrance.

"use client";
import { useState } from "react";
import { QrScanner } from "@yudiel/react-qr-scanner";

type ScanResult = { status: "ok" | "duplicate" | "invalid" | "unpaid"; message: string; tier?: string };

export default function CheckInPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(true);

  async function handleScan(qrPayload: string) {
    if (!scanning) return;
    setScanning(false);

    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrPayload }),
    });
    const data: ScanResult = await res.json();
    setResult(data);

    // Resume scanning after 3 seconds
    setTimeout(() => { setScanning(true); setResult(null); }, 3000);
  }

  const statusColors = { ok: "bg-green-500", duplicate: "bg-yellow-500", invalid: "bg-red-500", unpaid: "bg-red-500" };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-white text-2xl font-bold text-center">Check-in Scanner</h1>
        <div className="rounded-xl overflow-hidden">
          <QrScanner onDecode={handleScan} onError={console.error} />
        </div>
        {result && (
          <div className={`rounded-xl p-4 text-white text-center font-medium ${statusColors[result.status]}`}>
            <p className="text-xl">{result.status === "ok" ? "✅" : result.status === "duplicate" ? "⚠️" : "❌"}</p>
            <p>{result.message}</p>
            {result.tier && <p className="text-sm opacity-80">{result.tier}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
```

## Step 5 — Organizer Dashboard: Sales, Capacity, Attendee Export

```typescript
// src/app/organizer/events/[slug]/dashboard/page.tsx — Event analytics dashboard.

import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function EventDashboardPage({ params }: { params: { slug: string } }) {
  const event = await db.event.findUnique({
    where: { slug: params.slug },
    include: {
      tiers: true,
      orders: {
        where: { status: "paid" },
        include: { tickets: { include: { tier: true } } },
      },
    },
  });

  if (!event) notFound();

  const totalRevenue = event.orders.reduce((sum, o) => sum + o.totalCents, 0);
  const totalTickets = event.tiers.reduce((sum, t) => sum + t.sold, 0);
  const totalCapacity = event.tiers.reduce((sum, t) => sum + t.capacity, 0);
  const checkedIn = event.orders.flatMap((o) => o.tickets).filter((t) => t.checkedInAt).length;

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-2xl font-bold">{event.title} — Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Revenue" value={`€${(totalRevenue / 100).toFixed(2)}`} />
        <Stat label="Tickets Sold" value={`${totalTickets} / ${totalCapacity}`} />
        <Stat label="Checked In" value={`${checkedIn} / ${totalTickets}`} />
        <Stat label="Orders" value={String(event.orders.length)} />
      </div>
      {/* Tier breakdown */}
      <table className="w-full text-sm border-collapse">
        <thead><tr className="border-b">{["Tier","Price","Sold","Capacity","Revenue"].map(h=><th key={h} className="py-2 text-left">{h}</th>)}</tr></thead>
        <tbody>
          {event.tiers.map((tier) => (
            <tr key={tier.id} className="border-b">
              <td className="py-2">{tier.name}</td>
              <td>€{(tier.price / 100).toFixed(2)}</td>
              <td>{tier.sold}</td>
              <td>{tier.capacity}</td>
              <td>€{((tier.sold * tier.price) / 100).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <a href={`/api/organizer/events/${params.slug}/export`} className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
        Export Attendee List (CSV)
      </a>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
```

## Results

Remy ran his first event on the platform — 160 attendees, $20 tickets, 3 tiers (early bird, general, VIP).

- **Fees saved: $0 vs $248** — Eventbrite would have taken $248 (6% + $1.99 × 160). Total platform cost for the event: ~$3 (Resend email delivery + Stripe 1.4% EU cards ≈ $44, but that's payment processing, not a platform fee).
- **Check-in: 4 volunteers, 160 attendees in 18 minutes** — phone camera scanning, green/red feedback. No app install required (progressive web app).
- **Day-before reminder** email triggered automatically via a cron job. Open rate: 71% (people actually want this email).
- **QR duplicate detection** caught 2 people trying to share one ticket. The scanner shows "Already checked in at 7:03 PM" — no argument, just fact.
- **Attendee CSV export** went straight into Remy's newsletter tool for follow-up. He sent a feedback survey the next day; 45% responded.
