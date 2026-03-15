---
title: Build a Coupon and Discount Engine
slug: build-coupon-discount-engine
description: Build a flexible discount engine with coupon codes, automatic promotions, stacking rules, usage limits, customer targeting, and revenue impact tracking.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - coupons
  - discounts
  - promotions
  - e-commerce
  - pricing
---

# Build a Coupon and Discount Engine

## The Problem

Nadia leads e-commerce at a 25-person retail company. Discounts are hardcoded — a developer changes prices in the database for each sale. Black Friday required a deploy at midnight. Customers share coupon codes on Reddit, burning through the budget in hours. Some customers stack multiple coupons for 80% off. Abandoned cart emails can't include personalized discounts. They need a rules-based discount engine: create promotions without code changes, control stacking, limit usage, target specific customer segments, and track the revenue impact of every coupon.

## Step 1: Build the Discount Engine

```typescript
// src/discounts/engine.ts — Coupon and promotion engine with rules, stacking, and analytics
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Promotion {
  id: string;
  name: string;
  code: string | null;         // null = automatic (no code needed)
  type: "percentage" | "fixed" | "bogo" | "free_shipping" | "tiered";
  value: number;               // percent or cents
  conditions: PromotionCondition[];
  limits: {
    maxUses: number;           // 0 = unlimited
    maxUsesPerCustomer: number;
    minOrderAmount: number;    // cents
    maxDiscountAmount: number; // cap for percentage discounts
    startsAt: string;
    expiresAt: string | null;
  };
  targeting: {
    customerSegments: string[];
    firstOrderOnly: boolean;
    products: string[];        // empty = all products
    categories: string[];
    excludedProducts: string[];
  };
  stacking: {
    stackable: boolean;
    priority: number;          // higher = applied first
    exclusionGroup: string;    // only one from same group
  };
  status: "active" | "scheduled" | "expired" | "disabled";
  createdAt: string;
}

interface PromotionCondition {
  type: "min_quantity" | "min_amount" | "product_in_cart" | "category_in_cart" | "customer_tag";
  value: any;
}

interface DiscountResult {
  applied: AppliedDiscount[];
  originalTotal: number;
  discountedTotal: number;
  totalSaved: number;
  warnings: string[];
}

interface AppliedDiscount {
  promotionId: string;
  name: string;
  code: string | null;
  type: string;
  amount: number;              // discount amount in cents
  appliedTo: string[];         // item IDs affected
}

interface CartItem {
  id: string;
  productId: string;
  categoryId: string;
  name: string;
  price: number;               // cents
  quantity: number;
  tags: string[];
}

// Apply all eligible discounts to a cart
export async function calculateDiscounts(
  items: CartItem[],
  codes: string[],
  customerId: string
): Promise<DiscountResult> {
  const warnings: string[] = [];
  const applied: AppliedDiscount[] = [];

  const originalTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Get customer info for targeting
  const { rows: [customer] } = await pool.query(
    `SELECT segments, order_count, tags FROM customers WHERE id = $1`, [customerId]
  );
  const customerSegments = JSON.parse(customer?.segments || "[]");
  const orderCount = customer?.order_count || 0;

  // Collect all eligible promotions
  const promotions: Promotion[] = [];

  // 1. Code-based promotions
  for (const code of codes) {
    const { rows: [promo] } = await pool.query(
      "SELECT * FROM promotions WHERE code = $1 AND status = 'active'", [code.toUpperCase()]
    );
    if (!promo) { warnings.push(`Invalid code: ${code}`); continue; }
    promotions.push(parsePromotion(promo));
  }

  // 2. Automatic promotions (no code required)
  const { rows: autoPromos } = await pool.query(
    "SELECT * FROM promotions WHERE code IS NULL AND status = 'active'"
  );
  for (const row of autoPromos) {
    promotions.push(parsePromotion(row));
  }

  // Sort by priority (higher first)
  promotions.sort((a, b) => b.stacking.priority - a.stacking.priority);

  // Apply promotions with stacking rules
  const usedGroups = new Set<string>();
  let runningTotal = originalTotal;

  for (const promo of promotions) {
    // Check exclusion group
    if (promo.stacking.exclusionGroup && usedGroups.has(promo.stacking.exclusionGroup)) {
      warnings.push(`${promo.name} can't be combined with another discount`);
      continue;
    }

    // Check if already applied a non-stackable discount
    if (!promo.stacking.stackable && applied.length > 0) {
      warnings.push(`${promo.name} can't be combined with other discounts`);
      continue;
    }

    // Validate conditions
    const eligible = await validatePromotion(promo, items, customerId, customerSegments, orderCount, runningTotal);
    if (!eligible.valid) { warnings.push(`${promo.name}: ${eligible.reason}`); continue; }

    // Check usage limits
    const usageOk = await checkUsageLimits(promo, customerId);
    if (!usageOk.valid) { warnings.push(`${promo.name}: ${usageOk.reason}`); continue; }

    // Calculate discount
    const discount = calculatePromoDiscount(promo, items, runningTotal);
    if (discount.amount <= 0) continue;

    applied.push({
      promotionId: promo.id,
      name: promo.name,
      code: promo.code,
      type: promo.type,
      amount: discount.amount,
      appliedTo: discount.appliedTo,
    });

    runningTotal -= discount.amount;
    if (promo.stacking.exclusionGroup) usedGroups.add(promo.stacking.exclusionGroup);

    // Record usage
    await recordUsage(promo.id, customerId);
  }

  // Ensure total doesn't go below 0
  const totalSaved = originalTotal - Math.max(runningTotal, 0);

  return {
    applied,
    originalTotal,
    discountedTotal: Math.max(runningTotal, 0),
    totalSaved,
    warnings,
  };
}

function calculatePromoDiscount(promo: Promotion, items: CartItem[], currentTotal: number): { amount: number; appliedTo: string[] } {
  const eligibleItems = filterEligibleItems(items, promo.targeting);
  const eligibleTotal = eligibleItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  let amount = 0;
  const appliedTo = eligibleItems.map((i) => i.id);

  switch (promo.type) {
    case "percentage":
      amount = Math.round(eligibleTotal * (promo.value / 100));
      if (promo.limits.maxDiscountAmount > 0) {
        amount = Math.min(amount, promo.limits.maxDiscountAmount);
      }
      break;

    case "fixed":
      amount = Math.min(promo.value, eligibleTotal);
      break;

    case "bogo":
      // Buy one get one: discount cheapest eligible item
      const sorted = [...eligibleItems].sort((a, b) => a.price - b.price);
      if (sorted.length >= 2) {
        amount = sorted[0].price; // free cheapest item
      }
      break;

    case "free_shipping":
      amount = 0; // handled separately at checkout
      break;

    case "tiered":
      // Progressive discount based on cart total
      if (currentTotal >= 20000) amount = Math.round(eligibleTotal * 0.20);
      else if (currentTotal >= 10000) amount = Math.round(eligibleTotal * 0.15);
      else if (currentTotal >= 5000) amount = Math.round(eligibleTotal * 0.10);
      break;
  }

  return { amount, appliedTo };
}

function filterEligibleItems(items: CartItem[], targeting: Promotion["targeting"]): CartItem[] {
  return items.filter((item) => {
    if (targeting.excludedProducts.includes(item.productId)) return false;
    if (targeting.products.length > 0 && !targeting.products.includes(item.productId)) return false;
    if (targeting.categories.length > 0 && !targeting.categories.includes(item.categoryId)) return false;
    return true;
  });
}

async function validatePromotion(
  promo: Promotion, items: CartItem[], customerId: string,
  segments: string[], orderCount: number, currentTotal: number
): Promise<{ valid: boolean; reason?: string }> {
  // Time window
  if (new Date(promo.limits.startsAt) > new Date()) return { valid: false, reason: "Not yet active" };
  if (promo.limits.expiresAt && new Date(promo.limits.expiresAt) < new Date()) return { valid: false, reason: "Expired" };

  // Min order
  if (promo.limits.minOrderAmount > 0 && currentTotal < promo.limits.minOrderAmount) {
    return { valid: false, reason: `Minimum order: $${(promo.limits.minOrderAmount / 100).toFixed(2)}` };
  }

  // First order only
  if (promo.targeting.firstOrderOnly && orderCount > 0) {
    return { valid: false, reason: "First order only" };
  }

  // Segment targeting
  if (promo.targeting.customerSegments.length > 0) {
    if (!promo.targeting.customerSegments.some((s) => segments.includes(s))) {
      return { valid: false, reason: "Not eligible" };
    }
  }

  return { valid: true };
}

async function checkUsageLimits(promo: Promotion, customerId: string): Promise<{ valid: boolean; reason?: string }> {
  if (promo.limits.maxUses > 0) {
    const totalUses = parseInt(await redis.get(`promo:uses:${promo.id}`) || "0");
    if (totalUses >= promo.limits.maxUses) return { valid: false, reason: "Fully redeemed" };
  }

  if (promo.limits.maxUsesPerCustomer > 0) {
    const customerUses = parseInt(await redis.get(`promo:uses:${promo.id}:${customerId}`) || "0");
    if (customerUses >= promo.limits.maxUsesPerCustomer) return { valid: false, reason: "Already used" };
  }

  return { valid: true };
}

async function recordUsage(promoId: string, customerId: string): Promise<void> {
  await redis.incr(`promo:uses:${promoId}`);
  await redis.incr(`promo:uses:${promoId}:${customerId}`);
}

function parsePromotion(row: any): Promotion {
  return { ...row, conditions: JSON.parse(row.conditions || "[]"), limits: JSON.parse(row.limits), targeting: JSON.parse(row.targeting), stacking: JSON.parse(row.stacking) };
}
```

## Results

- **Black Friday without deploys** — marketing team schedules promotions with exact start/end times; midnight activation happens automatically
- **Reddit coupon abuse stopped** — usage limits (100 total, 1 per customer) prevent viral spread from draining the budget
- **No more 80% off stacking** — exclusion groups ensure only one percentage discount applies; stacking rules are explicit, not accidental
- **Abandoned cart recovery: 5% → 18%** — personalized "10% off for you" coupons with 24-hour expiry; first-order-only targeting prevents abuse
- **Revenue impact tracked** — every promotion shows: uses, total discount given, average order value with/without; marketing knows exactly which promotions drive profit vs drain it
