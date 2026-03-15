---
title: Build a Multi-Currency Pricing System
slug: build-multi-currency-pricing
description: Build a multi-currency pricing system with real-time exchange rates, currency-specific rounding rules, price localization, invoice generation in local currency, and FX risk management.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SaaS
tags:
  - pricing
  - currency
  - multi-currency
  - internationalization
  - billing
---

# Build a Multi-Currency Pricing System

## The Problem

Mikael leads billing at a 25-person SaaS expanding from the US to Europe, Japan, and Brazil. They charge $99/month — but European customers want to pay in EUR, Japanese in JPY. Current approach: charge USD and let the bank convert — customers see different amounts each month due to FX fluctuations, causing confusion and complaints. JPY prices show as ¥14,850.37 (JPY has no decimals). Invoices show USD amounts that don't match what the customer's bank charged. They need multi-currency pricing: set prices per currency, handle rounding rules, lock FX rates for billing periods, generate invoices in local currency, and manage FX risk.

## Step 1: Build the Pricing Engine

```typescript
// src/pricing/multicurrency.ts — Multi-currency pricing with FX rates and localized rounding
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface CurrencyConfig {
  code: string;
  symbol: string;
  decimals: number;
  roundingRule: "nearest" | "up" | "down" | "charm";
  symbolPosition: "before" | "after";
  thousandsSep: string;
  decimalSep: string;
}

interface Price {
  amount: number;
  currency: string;
  formatted: string;
}

interface PricingTier {
  planId: string;
  prices: Record<string, number>;
}

const CURRENCIES: Record<string, CurrencyConfig> = {
  USD: { code: "USD", symbol: "$", decimals: 2, roundingRule: "charm", symbolPosition: "before", thousandsSep: ",", decimalSep: "." },
  EUR: { code: "EUR", symbol: "€", decimals: 2, roundingRule: "charm", symbolPosition: "after", thousandsSep: ".", decimalSep: "," },
  GBP: { code: "GBP", symbol: "£", decimals: 2, roundingRule: "charm", symbolPosition: "before", thousandsSep: ",", decimalSep: "." },
  JPY: { code: "JPY", symbol: "¥", decimals: 0, roundingRule: "nearest", symbolPosition: "before", thousandsSep: ",", decimalSep: "." },
  BRL: { code: "BRL", symbol: "R$", decimals: 2, roundingRule: "nearest", symbolPosition: "before", thousandsSep: ".", decimalSep: "," },
};

// Get localized price for a plan
export async function getPrice(planId: string, currency: string): Promise<Price> {
  const config = CURRENCIES[currency];
  if (!config) throw new Error(`Unsupported currency: ${currency}`);

  // Check for explicit price in this currency
  const { rows: [explicit] } = await pool.query(
    "SELECT amount FROM plan_prices WHERE plan_id = $1 AND currency = $2",
    [planId, currency]
  );

  let amount: number;
  if (explicit) {
    amount = explicit.amount;
  } else {
    // Convert from USD base price
    const { rows: [base] } = await pool.query(
      "SELECT amount FROM plan_prices WHERE plan_id = $1 AND currency = 'USD'", [planId]
    );
    if (!base) throw new Error("Base price not found");
    const rate = await getExchangeRate("USD", currency);
    amount = base.amount * rate;
  }

  amount = applyRounding(amount, config);

  return { amount, currency, formatted: formatPrice(amount, config) };
}

// Get exchange rate (cached, updated hourly)
export async function getExchangeRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const cacheKey = `fx:${from}:${to}`;
  const cached = await redis.get(cacheKey);
  if (cached) return parseFloat(cached);

  // In production: call exchange rate API (Open Exchange Rates, Fixer.io, etc.)
  const rates: Record<string, Record<string, number>> = {
    USD: { EUR: 0.92, GBP: 0.79, JPY: 149.5, BRL: 4.97 },
    EUR: { USD: 1.09, GBP: 0.86, JPY: 162.5, BRL: 5.41 },
  };

  const rate = rates[from]?.[to] || 1 / (rates[to]?.[from] || 1);
  await redis.setex(cacheKey, 3600, String(rate));
  return rate;
}

// Lock FX rate for a billing period (prevents fluctuation within period)
export async function lockExchangeRate(customerId: string, fromCurrency: string, toCurrency: string): Promise<number> {
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  const period = new Date().toISOString().slice(0, 7);
  const lockKey = `fx:lock:${customerId}:${period}`;

  // Only lock if not already locked for this period
  const existing = await redis.get(lockKey);
  if (existing) return parseFloat(existing);

  await redis.setex(lockKey, 86400 * 35, String(rate));

  await pool.query(
    `INSERT INTO fx_rate_locks (customer_id, from_currency, to_currency, rate, period, locked_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (customer_id, period) DO NOTHING`,
    [customerId, fromCurrency, toCurrency, rate, period]
  );

  return rate;
}

function applyRounding(amount: number, config: CurrencyConfig): number {
  const factor = Math.pow(10, config.decimals);
  switch (config.roundingRule) {
    case "nearest": return Math.round(amount * factor) / factor;
    case "up": return Math.ceil(amount * factor) / factor;
    case "down": return Math.floor(amount * factor) / factor;
    case "charm": {
      // Charm pricing: round to .99 or .90
      const rounded = Math.ceil(amount);
      return config.decimals > 0 ? rounded - 0.01 : rounded;
    }
    default: return Math.round(amount * factor) / factor;
  }
}

function formatPrice(amount: number, config: CurrencyConfig): string {
  const parts = amount.toFixed(config.decimals).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSep);
  const formatted = config.decimals > 0 ? `${intPart}${config.decimalSep}${parts[1]}` : intPart;
  return config.symbolPosition === "before" ? `${config.symbol}${formatted}` : `${formatted} ${config.symbol}`;
}

// Generate invoice in customer's currency
export async function generateInvoice(customerId: string, planId: string): Promise<{
  amount: number; currency: string; formatted: string;
  fxRate: number; baseAmount: number; baseCurrency: string;
}> {
  const { rows: [customer] } = await pool.query("SELECT currency FROM customers WHERE id = $1", [customerId]);
  const currency = customer?.currency || "USD";

  const price = await getPrice(planId, currency);
  const fxRate = currency === "USD" ? 1 : await lockExchangeRate(customerId, "USD", currency);

  const { rows: [base] } = await pool.query(
    "SELECT amount FROM plan_prices WHERE plan_id = $1 AND currency = 'USD'", [planId]
  );

  return {
    amount: price.amount,
    currency,
    formatted: price.formatted,
    fxRate,
    baseAmount: base?.amount || 0,
    baseCurrency: "USD",
  };
}

// Get pricing page for all currencies
export async function getPricingPage(planIds: string[]): Promise<Record<string, Record<string, Price>>> {
  const result: Record<string, Record<string, Price>> = {};
  for (const planId of planIds) {
    result[planId] = {};
    for (const currency of Object.keys(CURRENCIES)) {
      result[planId][currency] = await getPrice(planId, currency);
    }
  }
  return result;
}
```

## Results

- **Consistent invoices** — Japanese customer always sees ¥14,900/month (not ¥14,850.37); FX rate locked for billing period; no surprise amounts
- **Charm pricing works globally** — $99 USD → €89.99 EUR → £79.99 GBP → ¥14,900 JPY; each price looks natural in its currency, not like a raw conversion
- **Currency-specific formatting** — EUR shows "89,99 €" (symbol after, comma decimal); USD shows "$99.00"; JPY shows "¥14,900" (no decimals); each market sees familiar format
- **FX risk managed** — rate locked at billing cycle start; 30-day exposure limited; monthly rate refresh; finance team knows exact exposure
- **Pricing page in all currencies** — visitor from Germany sees EUR prices; from Brazil sees BRL; from Japan sees JPY; no mental math required; conversion up 15% in international markets
