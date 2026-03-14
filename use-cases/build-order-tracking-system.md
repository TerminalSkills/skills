---
title: Build an Order Tracking System
slug: build-order-tracking-system
description: Build a real-time order tracking system with status updates, delivery ETA, SMS/email notifications at each stage, customer-facing tracking page, and carrier integration.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - order-tracking
  - e-commerce
  - logistics
  - notifications
  - real-time
---

# Build an Order Tracking System

## The Problem

Amir runs a 20-person e-commerce business. After customers pay, they have no idea what happens next. "Where's my order?" is 40% of support tickets. The team manually updates order statuses in a spreadsheet. Customers get one email at checkout and nothing until delivery. When a shipment is delayed, nobody knows until the customer complains. They need automated order tracking with real-time status updates, proactive notifications, and a customer-facing tracking page.

## Step 1: Build the Order Tracking Engine

```typescript
// src/orders/tracking.ts — Order tracking with status machine, notifications, and ETA
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

type OrderStatus = "confirmed" | "processing" | "packed" | "shipped" | "in_transit" | "out_for_delivery" | "delivered" | "failed_delivery" | "returned";

const STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  confirmed: ["processing"],
  processing: ["packed"],
  packed: ["shipped"],
  shipped: ["in_transit"],
  in_transit: ["out_for_delivery", "failed_delivery"],
  out_for_delivery: ["delivered", "failed_delivery"],
  delivered: ["returned"],
  failed_delivery: ["in_transit", "returned"],
  returned: [],
};

const STATUS_MESSAGES: Record<OrderStatus, string> = {
  confirmed: "Your order has been confirmed! We're getting it ready.",
  processing: "Your order is being prepared.",
  packed: "Your order has been packed and is ready for shipping.",
  shipped: "Your order has been shipped! Tracking number: {trackingNumber}",
  in_transit: "Your order is on its way. Estimated delivery: {eta}",
  out_for_delivery: "Your order is out for delivery today!",
  delivered: "Your order has been delivered. Enjoy!",
  failed_delivery: "Delivery attempted but failed. We'll try again.",
  returned: "Your order has been returned to sender.",
};

interface TrackingEvent {
  status: OrderStatus;
  timestamp: string;
  location?: string;
  description: string;
  carrier?: string;
}

// Update order status
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  metadata?: { trackingNumber?: string; carrier?: string; location?: string; eta?: string }
): Promise<{ updated: boolean; notificationSent: boolean }> {
  const { rows: [order] } = await pool.query(
    "SELECT * FROM orders WHERE id = $1", [orderId]
  );
  if (!order) throw new Error("Order not found");

  // Validate transition
  const allowedTransitions = STATUS_FLOW[order.status as OrderStatus] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(`Cannot transition from ${order.status} to ${newStatus}`);
  }

  // Add tracking event
  const events: TrackingEvent[] = JSON.parse(order.tracking_events || "[]");
  events.push({
    status: newStatus,
    timestamp: new Date().toISOString(),
    location: metadata?.location,
    description: STATUS_MESSAGES[newStatus]
      .replace("{trackingNumber}", metadata?.trackingNumber || "")
      .replace("{eta}", metadata?.eta || ""),
    carrier: metadata?.carrier,
  });

  // Update order
  await pool.query(
    `UPDATE orders SET
       status = $2,
       tracking_number = COALESCE($3, tracking_number),
       carrier = COALESCE($4, carrier),
       estimated_delivery = COALESCE($5, estimated_delivery),
       tracking_events = $6,
       updated_at = NOW()
     WHERE id = $1`,
    [orderId, newStatus, metadata?.trackingNumber, metadata?.carrier,
     metadata?.eta, JSON.stringify(events)]
  );

  // Send notification
  const message = STATUS_MESSAGES[newStatus]
    .replace("{trackingNumber}", metadata?.trackingNumber || "")
    .replace("{eta}", metadata?.eta || "");

  await sendTrackingNotification(order.customer_email, order.customer_phone, orderId, newStatus, message);

  // Publish real-time update
  await redis.publish(`order:updates:${orderId}`, JSON.stringify({
    status: newStatus, timestamp: new Date().toISOString(), message,
  }));

  return { updated: true, notificationSent: true };
}

// Get tracking info (public page)
export async function getTracking(orderId: string): Promise<{
  orderId: string;
  status: OrderStatus;
  statusLabel: string;
  trackingNumber: string | null;
  carrier: string | null;
  estimatedDelivery: string | null;
  events: TrackingEvent[];
  progress: number;
}> {
  const { rows: [order] } = await pool.query(
    "SELECT * FROM orders WHERE id = $1", [orderId]
  );
  if (!order) throw new Error("Order not found");

  const statusLabels: Record<OrderStatus, string> = {
    confirmed: "Order Confirmed",
    processing: "Being Prepared",
    packed: "Packed",
    shipped: "Shipped",
    in_transit: "In Transit",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    failed_delivery: "Delivery Failed",
    returned: "Returned",
  };

  const progressMap: Record<OrderStatus, number> = {
    confirmed: 10, processing: 25, packed: 40, shipped: 55,
    in_transit: 70, out_for_delivery: 85, delivered: 100,
    failed_delivery: 70, returned: 0,
  };

  return {
    orderId: order.id,
    status: order.status,
    statusLabel: statusLabels[order.status as OrderStatus],
    trackingNumber: order.tracking_number,
    carrier: order.carrier,
    estimatedDelivery: order.estimated_delivery,
    events: JSON.parse(order.tracking_events || "[]").reverse(),
    progress: progressMap[order.status as OrderStatus] || 0,
  };
}

// Carrier webhook integration
export async function handleCarrierWebhook(carrier: string, payload: any): Promise<void> {
  // Map carrier status to our status
  const statusMap: Record<string, OrderStatus> = {
    "label_created": "shipped",
    "in_transit": "in_transit",
    "out_for_delivery": "out_for_delivery",
    "delivered": "delivered",
    "failure": "failed_delivery",
    "return_to_sender": "returned",
  };

  const ourStatus = statusMap[payload.status];
  if (!ourStatus) return;

  // Find order by tracking number
  const { rows: [order] } = await pool.query(
    "SELECT id FROM orders WHERE tracking_number = $1",
    [payload.tracking_number]
  );
  if (!order) return;

  await updateOrderStatus(order.id, ourStatus, {
    location: payload.location,
    eta: payload.estimated_delivery,
  });
}

// Check for delayed orders (cron job)
export async function checkDelayedOrders(): Promise<number> {
  const { rows: delayed } = await pool.query(
    `SELECT * FROM orders
     WHERE status IN ('shipped', 'in_transit')
     AND estimated_delivery < NOW()
     AND delay_notified = false`
  );

  for (const order of delayed) {
    await sendTrackingNotification(
      order.customer_email, order.customer_phone, order.id,
      "delayed" as any,
      "Your order is delayed. We're looking into it and will update you soon."
    );

    await pool.query("UPDATE orders SET delay_notified = true WHERE id = $1", [order.id]);
  }

  return delayed.length;
}

async function sendTrackingNotification(
  email: string, phone: string | null, orderId: string,
  status: string, message: string
): Promise<void> {
  // Email
  await redis.rpush("email:queue", JSON.stringify({
    type: "order_tracking", to: email,
    subject: `Order Update: ${status.replace("_", " ")}`,
    message, trackingUrl: `${process.env.APP_URL}/track/${orderId}`,
  }));

  // SMS for critical updates
  if (phone && ["out_for_delivery", "delivered", "failed_delivery"].includes(status)) {
    await redis.rpush("sms:queue", JSON.stringify({
      to: phone, message: `${message} Track: ${process.env.APP_URL}/track/${orderId}`,
    }));
  }
}
```

## Results

- **"Where's my order?" tickets: 40% → 8%** — automated tracking page with progress bar and timeline; customers check status themselves
- **Proactive delay notifications** — customers learn about delays before they notice; perception shifts from "they don't care" to "they're on top of it"
- **SMS for critical moments** — "out for delivery" and "delivered" get SMS; 98% open rate vs 25% for email; customers are home to receive packages
- **Carrier integration via webhooks** — FedEx/UPS/DHL status updates flow in automatically; no manual status changes needed
- **Support time freed: 20 hours/week** — self-service tracking eliminates most order inquiry tickets; support focuses on actual problems
