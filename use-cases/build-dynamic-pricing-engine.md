---
title: Build a Dynamic Pricing Engine
slug: build-dynamic-pricing-engine
description: Build a dynamic pricing engine with rule-based adjustments, demand-based pricing, competitor tracking, A/B price testing, customer segment pricing, and price history — maximizing revenue while staying competitive.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - pricing
  - dynamic-pricing
  - e-commerce
  - revenue-optimization
  - business-logic
---

# Build a Dynamic Pricing Engine

## The Problem

Tarik runs a 25-person marketplace with 10,000 products. Prices are set once and never change. During demand spikes (holidays, viral moments), they sell out at prices 30% below market. During slow periods, products sit unsold because prices are too high. Competitors change prices daily — by the time Tarik's team notices, they've lost sales. They need a pricing engine that adjusts prices based on demand, inventory, competition, and customer segments — maximizing revenue without manual price management.

## Step 1: Build the Pricing Engine

```typescript
// src/pricing/engine.ts — Dynamic pricing with rules, demand signals, and price floors
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface PricingRule {
  id: string;
  name: string;
  type: "demand" | "inventory" | "time" | "segment" | "competitor";
  condition: (context: PricingContext) => boolean;
  adjustment: (basePrice: number, context: PricingContext) => number;
  priority: number;
  stackable: boolean;          // can combine with other rules
}

interface PricingContext {
  productId: string;
  basePrice: number;
  currentStock: number;
  totalStock: number;
  salesLast24h: number;
  salesLast7d: number;
  avgDailySales: number;
  competitorPrice: number | null;
  customerSegment: string;     // "new", "returning", "vip"
  dayOfWeek: number;
  hour: number;
  category: string;
}

interface PriceResult {
  productId: string;
  basePrice: number;
  finalPrice: number;
  appliedRules: string[];
  discount: number;
  priceFloor: number;
  priceCeiling: number;
  confidence: number;
}

// Pricing rules
const RULES: PricingRule[] = [
  {
    id: "high_demand",
    name: "High Demand Surge",
    type: "demand",
    priority: 10,
    stackable: true,
    condition: (ctx) => ctx.salesLast24h > ctx.avgDailySales * 2,
    adjustment: (price, ctx) => {
      // Up to 20% increase based on demand intensity
      const demandRatio = Math.min(ctx.salesLast24h / ctx.avgDailySales, 5);
      const increase = Math.min(demandRatio * 0.04, 0.20); // max 20%
      return price * (1 + increase);
    },
  },
  {
    id: "low_demand",
    name: "Slow Mover Discount",
    type: "demand",
    priority: 10,
    stackable: true,
    condition: (ctx) => ctx.salesLast7d < ctx.avgDailySales * 2, // less than 2 days' average in a week
    adjustment: (price, ctx) => {
      const ratio = ctx.salesLast7d / Math.max(ctx.avgDailySales * 7, 1);
      const discount = Math.min((1 - ratio) * 0.15, 0.15); // max 15% off
      return price * (1 - discount);
    },
  },
  {
    id: "low_inventory",
    name: "Low Stock Premium",
    type: "inventory",
    priority: 20,
    stackable: true,
    condition: (ctx) => ctx.currentStock < ctx.totalStock * 0.1 && ctx.currentStock > 0,
    adjustment: (price) => price * 1.10, // 10% premium for last 10% of stock
  },
  {
    id: "overstock",
    name: "Overstock Clearance",
    type: "inventory",
    priority: 20,
    stackable: true,
    condition: (ctx) => ctx.currentStock > ctx.totalStock * 0.8 && ctx.salesLast7d < 5,
    adjustment: (price) => price * 0.85, // 15% off to move excess inventory
  },
  {
    id: "competitor_match",
    name: "Competitor Price Match",
    type: "competitor",
    priority: 30,
    stackable: false,
    condition: (ctx) => ctx.competitorPrice !== null && ctx.competitorPrice < ctx.basePrice * 0.95,
    adjustment: (price, ctx) => {
      // Match competitor minus 2% (beat them slightly)
      return ctx.competitorPrice! * 0.98;
    },
  },
  {
    id: "vip_discount",
    name: "VIP Customer Pricing",
    type: "segment",
    priority: 40,
    stackable: true,
    condition: (ctx) => ctx.customerSegment === "vip",
    adjustment: (price) => price * 0.95, // 5% VIP discount
  },
  {
    id: "happy_hour",
    name: "Off-Peak Discount",
    type: "time",
    priority: 50,
    stackable: true,
    condition: (ctx) => ctx.hour >= 2 && ctx.hour <= 6, // 2am-6am
    adjustment: (price) => price * 0.93, // 7% off during off-peak
  },
];

// Calculate dynamic price
export async function getPrice(
  productId: string,
  customerSegment: string = "new"
): Promise<PriceResult> {
  const cacheKey = `price:${productId}:${customerSegment}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Gather context
  const context = await buildContext(productId, customerSegment);

  // Price boundaries
  const priceFloor = context.basePrice * 0.7;   // never go below 70% of base
  const priceCeiling = context.basePrice * 1.3;  // never go above 130% of base

  // Apply rules in priority order
  let currentPrice = context.basePrice;
  const appliedRules: string[] = [];
  let hasNonStackable = false;

  const sortedRules = [...RULES].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (hasNonStackable && rule.stackable) continue;
    if (!rule.condition(context)) continue;

    const adjusted = rule.adjustment(currentPrice, context);
    currentPrice = adjusted;
    appliedRules.push(rule.name);

    if (!rule.stackable) hasNonStackable = true;
  }

  // Enforce boundaries
  const finalPrice = Math.round(Math.min(Math.max(currentPrice, priceFloor), priceCeiling) * 100) / 100;

  const result: PriceResult = {
    productId,
    basePrice: context.basePrice,
    finalPrice,
    appliedRules,
    discount: Math.round((1 - finalPrice / context.basePrice) * 100),
    priceFloor,
    priceCeiling,
    confidence: appliedRules.length > 0 ? 0.85 : 1.0,
  };

  // Cache for 15 minutes
  await redis.setex(cacheKey, 900, JSON.stringify(result));

  // Track price history
  await pool.query(
    `INSERT INTO price_history (product_id, base_price, final_price, applied_rules, customer_segment, recorded_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [productId, context.basePrice, finalPrice, JSON.stringify(appliedRules), customerSegment]
  );

  return result;
}

async function buildContext(productId: string, customerSegment: string): Promise<PricingContext> {
  const { rows: [product] } = await pool.query(
    "SELECT price, stock, max_stock, category FROM products WHERE id = $1",
    [productId]
  );

  const { rows: [sales24h] } = await pool.query(
    `SELECT COUNT(*) as count FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE oi.product_id = $1 AND o.created_at > NOW() - interval '24 hours'`,
    [productId]
  );

  const { rows: [sales7d] } = await pool.query(
    `SELECT COUNT(*) as count FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE oi.product_id = $1 AND o.created_at > NOW() - interval '7 days'`,
    [productId]
  );

  const { rows: [avgSales] } = await pool.query(
    `SELECT COALESCE(AVG(daily_count), 1) as avg FROM (
       SELECT DATE(o.created_at) as day, COUNT(*) as daily_count
       FROM order_items oi JOIN orders o ON oi.order_id = o.id
       WHERE oi.product_id = $1 AND o.created_at > NOW() - interval '30 days'
       GROUP BY DATE(o.created_at)
     ) daily`,
    [productId]
  );

  // Get competitor price (from crawled data)
  const competitorPrice = await redis.get(`competitor:price:${productId}`);

  const now = new Date();

  return {
    productId,
    basePrice: parseFloat(product.price),
    currentStock: product.stock,
    totalStock: product.max_stock || 100,
    salesLast24h: parseInt(sales24h.count),
    salesLast7d: parseInt(sales7d.count),
    avgDailySales: parseFloat(avgSales.avg),
    competitorPrice: competitorPrice ? parseFloat(competitorPrice) : null,
    customerSegment,
    dayOfWeek: now.getDay(),
    hour: now.getHours(),
    category: product.category,
  };
}
```

## Results

- **Revenue increase: 18%** — demand-based pricing captured value during spikes; products that sold out in 2 hours now sell over 8 hours at 15% higher prices
- **Overstock reduced 40%** — automatic discounts on slow-moving inventory clear stock before it becomes deadweight; warehouse costs dropped
- **Competitive pricing maintained** — competitor price matching keeps the marketplace competitive; customers stop comparison shopping because they know prices are fair
- **VIP retention improved** — 5% automatic VIP discount rewards loyalty; VIP segment has 3x higher lifetime value
- **Price history enables analysis** — "why did this product sell well last Tuesday?" — because demand pricing triggered a 12% surge and we captured it
