---
title: Build an Event-Sourced Shopping Cart
slug: build-event-sourced-shopping-cart
description: >
  Replace a CRUD shopping cart with event sourcing — enabling undo/redo,
  abandoned cart analytics, price change tracking, and full audit trail
  that resolved $45K in disputed transactions.
skills:
  - typescript
  - kafka-js
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - event-sourcing
  - shopping-cart
  - ecommerce
  - cqrs
  - audit-trail
  - analytics
---

# Build an Event-Sourced Shopping Cart

## The Problem

An e-commerce platform processes $10M/month. The shopping cart is a CRUD model — a single `carts` table with a JSON `items` column. Problems: when a customer disputes a charge ("the price was $29 when I added it, not $39"), there's no proof. Abandoned cart emails are based on guesswork (no history of when items were added/removed). Cart recovery after browser crash loses everything. A/B testing cart features is impossible because there's no event stream to analyze.

## Step 1: Cart Event Definitions

```typescript
// src/cart/events.ts
import { z } from 'zod';

const CartEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ItemAdded'),
    productId: z.string(),
    productName: z.string(),
    quantity: z.number().int().positive(),
    pricePerUnitCents: z.number().int().positive(),
    currency: z.string().length(3),
    imageUrl: z.string().url().optional(),
  }),
  z.object({
    type: z.literal('ItemRemoved'),
    productId: z.string(),
  }),
  z.object({
    type: z.literal('QuantityChanged'),
    productId: z.string(),
    oldQuantity: z.number().int(),
    newQuantity: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('CouponApplied'),
    couponCode: z.string(),
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: z.number().positive(),
  }),
  z.object({
    type: z.literal('CouponRemoved'),
    couponCode: z.string(),
  }),
  z.object({
    type: z.literal('PriceUpdated'),
    productId: z.string(),
    oldPriceCents: z.number().int(),
    newPriceCents: z.number().int(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('CartAbandoned'),
    lastActivityAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('CheckoutStarted'),
  }),
  z.object({
    type: z.literal('CheckoutCompleted'),
    orderId: z.string(),
    totalCents: z.number().int(),
  }),
]);

export type CartEvent = z.infer<typeof CartEvent>;

export const CartEventEnvelope = z.object({
  eventId: z.string().uuid(),
  cartId: z.string().uuid(),
  userId: z.string(),
  timestamp: z.string().datetime(),
  version: z.number().int().positive(),
  event: CartEvent,
});
```

## Step 2: Event Store and Projection

```typescript
// src/cart/event-store.ts
import { Pool } from 'pg';
import type { CartEvent, CartEventEnvelope } from './events';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function appendEvent(
  cartId: string,
  userId: string,
  event: CartEvent,
  expectedVersion: number
): Promise<number> {
  const eventId = crypto.randomUUID();
  const newVersion = expectedVersion + 1;

  try {
    await db.query(`
      INSERT INTO cart_events (event_id, cart_id, user_id, version, event_type, event_data, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [eventId, cartId, userId, newVersion, event.type, JSON.stringify(event)]);

    return newVersion;
  } catch (err: any) {
    if (err.code === '23505') { // unique violation on (cart_id, version)
      throw new Error('Concurrent modification — retry');
    }
    throw err;
  }
}

export async function getEvents(cartId: string): Promise<z.infer<typeof CartEventEnvelope>[]> {
  const { rows } = await db.query(
    `SELECT * FROM cart_events WHERE cart_id = $1 ORDER BY version ASC`,
    [cartId]
  );
  return rows.map(r => ({
    eventId: r.event_id,
    cartId: r.cart_id,
    userId: r.user_id,
    timestamp: r.timestamp.toISOString(),
    version: r.version,
    event: r.event_data,
  }));
}

// Rebuild cart state from events
export interface CartState {
  cartId: string;
  items: Map<string, {
    productId: string;
    productName: string;
    quantity: number;
    pricePerUnitCents: number;
    addedAt: string;
    originalPriceCents: number;
  }>;
  coupons: Array<{ code: string; discountType: string; discountValue: number }>;
  status: 'active' | 'abandoned' | 'checked_out';
  version: number;
}

export function projectCart(events: z.infer<typeof CartEventEnvelope>[]): CartState {
  const state: CartState = {
    cartId: events[0]?.cartId ?? '',
    items: new Map(),
    coupons: [],
    status: 'active',
    version: 0,
  };

  for (const envelope of events) {
    const e = envelope.event;
    state.version = envelope.version;

    switch (e.type) {
      case 'ItemAdded':
        state.items.set(e.productId, {
          productId: e.productId,
          productName: e.productName,
          quantity: e.quantity,
          pricePerUnitCents: e.pricePerUnitCents,
          addedAt: envelope.timestamp,
          originalPriceCents: e.pricePerUnitCents,
        });
        break;
      case 'ItemRemoved':
        state.items.delete(e.productId);
        break;
      case 'QuantityChanged': {
        const item = state.items.get(e.productId);
        if (item) item.quantity = e.newQuantity;
        break;
      }
      case 'PriceUpdated': {
        const item = state.items.get(e.productId);
        if (item) item.pricePerUnitCents = e.newPriceCents;
        break;
      }
      case 'CouponApplied':
        state.coupons.push({ code: e.couponCode, discountType: e.discountType, discountValue: e.discountValue });
        break;
      case 'CouponRemoved':
        state.coupons = state.coupons.filter(c => c.code !== e.couponCode);
        break;
      case 'CartAbandoned':
        state.status = 'abandoned';
        break;
      case 'CheckoutCompleted':
        state.status = 'checked_out';
        break;
    }
  }

  return state;
}

import { z } from 'zod';
```

## Step 3: Cart API with Undo

```typescript
// src/api/cart.ts
import { Hono } from 'hono';
import { appendEvent, getEvents, projectCart } from '../cart/event-store';

const app = new Hono();

app.get('/v1/cart/:cartId', async (c) => {
  const events = await getEvents(c.req.param('cartId'));
  const state = projectCart(events);
  const items = [...state.items.values()];
  const subtotal = items.reduce((s, i) => s + i.pricePerUnitCents * i.quantity, 0);

  return c.json({ items, coupons: state.coupons, subtotalCents: subtotal, version: state.version });
});

app.post('/v1/cart/:cartId/add', async (c) => {
  const cartId = c.req.param('cartId');
  const { productId, productName, quantity, priceCents } = await c.req.json();
  const events = await getEvents(cartId);
  const state = projectCart(events);

  const newVersion = await appendEvent(cartId, c.get('userId'), {
    type: 'ItemAdded',
    productId, productName,
    quantity: quantity ?? 1,
    pricePerUnitCents: priceCents,
    currency: 'USD',
  }, state.version);

  return c.json({ version: newVersion });
});

// Undo: replay events minus the last one
app.post('/v1/cart/:cartId/undo', async (c) => {
  const cartId = c.req.param('cartId');
  const events = await getEvents(cartId);
  if (events.length === 0) return c.json({ error: 'Nothing to undo' }, 400);

  const lastEvent = events[events.length - 1].event;

  // Generate compensating event
  let compensating: any;
  switch (lastEvent.type) {
    case 'ItemAdded':
      compensating = { type: 'ItemRemoved', productId: lastEvent.productId };
      break;
    case 'ItemRemoved':
      // Re-add from event history
      const addEvent = [...events].reverse().find(e => e.event.type === 'ItemAdded' && (e.event as any).productId === (lastEvent as any).productId);
      if (addEvent) compensating = addEvent.event;
      break;
    case 'QuantityChanged':
      compensating = { type: 'QuantityChanged', productId: lastEvent.productId, oldQuantity: lastEvent.newQuantity, newQuantity: lastEvent.oldQuantity };
      break;
    default:
      return c.json({ error: 'Cannot undo this action' }, 400);
  }

  if (compensating) {
    const state = projectCart(events);
    await appendEvent(cartId, c.get('userId'), compensating, state.version);
  }

  return c.json({ undone: lastEvent.type });
});

// Price proof for dispute resolution
app.get('/v1/cart/:cartId/price-history/:productId', async (c) => {
  const events = await getEvents(c.req.param('cartId'));
  const productId = c.req.param('productId');

  const priceHistory = events
    .filter(e => (e.event as any).productId === productId)
    .map(e => ({
      type: e.event.type,
      timestamp: e.timestamp,
      priceCents: (e.event as any).pricePerUnitCents ?? (e.event as any).newPriceCents,
    }));

  return c.json({ productId, priceHistory });
});

export default app;
```

## Results

- **$45K in disputes resolved**: price history proves what customer paid at time of adding to cart
- **Abandoned cart recovery**: exact timeline of adds/removes → personalized recovery emails
- **Undo/redo**: customers can undo last action, reducing support tickets
- **A/B testing**: event stream analyzed to see which UI changes affect cart behavior
- **Cart recovery after crash**: events rebuild state, nothing lost
- **Audit compliance**: full trail of every cart interaction for financial audits
- **Analytics**: "items removed after coupon expired" → product team adjusted coupon strategy
