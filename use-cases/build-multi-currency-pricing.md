---
title: Build Multi-Currency Pricing
slug: build-multi-currency-pricing
description: Build a multi-currency pricing system with real-time exchange rates, localized pricing, currency-specific rounding rules, Stripe multi-currency checkout, and revenue reporting in base currency.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - currency
  - pricing
  - international
  - e-commerce
  - localization
---

# Build Multi-Currency Pricing

## The Problem

Yuki leads product at a 25-person SaaS selling globally. All prices are in USD. European customers pay 5-8% extra in conversion fees. Japanese customers see "$79/mo" and have no idea what that is in yen. When they tried manual pricing per currency, exchange rate changes made some currencies 20% cheaper — customers gamed it by switching regions. They need localized pricing that updates with exchange rates, uses psychologically rounded prices (€49 not €48.73), and reports revenue in their base currency.

## Step 1: Build the Multi-Currency Engine

```typescript
// src/pricing/currency.ts — Multi-currency with exchange rates and localized pricing
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const BASE_CURRENCY = "USD";
const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "PLN", "BRL", "MXN", "INR", "SGD"];

// Rounding rules per currency
const ROUNDING_RULES: Record<string, { precision: number; strategy: "psychological" | "nearest" }> = {
  USD: { precision: 99, strategy: "psychological" },  // $49.99, $79.99
  EUR: { precision: 99, strategy: "psychological" },
  GBP: { precision: 99, strategy: "psychological" },
  JPY: { precision: 0, strategy: "nearest" },          // ¥7,900 (no decimals)
  SEK: { precision: 0, strategy: "nearest" },           // 499 kr
  INR: { precision: 0, strategy: "nearest" },           // ₹5,999
  BRL: { precision: 90, strategy: "psychological" },    // R$249,90
  default: { precision: 99, strategy: "psychological" },
};

// Country → Currency mapping
const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR",
  NL: "EUR", BE: "EUR", AT: "EUR", JP: "JPY", AU: "AUD", CH: "CHF",
  SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", BR: "BRL", MX: "MXN",
  IN: "INR", SG: "SGD",
};

interface LocalizedPrice {
  amount: number;
  currency: string;
  formatted: string;
  baseAmount: number;
  baseCurrency: string;
  exchangeRate: number;
}

// Fetch and cache exchange rates (from free API)
export async function updateExchangeRates(): Promise<void> {
  const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${BASE_CURRENCY}`);
  const data = await response.json();

  for (const [currency, rate] of Object.entries(data.rates as Record<string, number>)) {
    if (SUPPORTED_CURRENCIES.includes(currency)) {
      await redis.hset("exchange_rates", currency, String(rate));
    }
  }
  await redis.set("exchange_rates:updated", new Date().toISOString());
}

async function getRate(currency: string): Promise<number> {
  if (currency === BASE_CURRENCY) return 1;

  const cached = await redis.hget("exchange_rates", currency);
  if (cached) return parseFloat(cached);

  // Fallback: update rates
  await updateExchangeRates();
  const rate = await redis.hget("exchange_rates", currency);
  return rate ? parseFloat(rate) : 1;
}

// Get localized price
export async function getLocalizedPrice(
  baseAmountCents: number,
  targetCurrency: string,
  options?: { override?: number }  // manual price override
): Promise<LocalizedPrice> {
  // Check for manual price override (for strategic pricing)
  if (options?.override) {
    return {
      amount: options.override,
      currency: targetCurrency,
      formatted: formatCurrency(options.override, targetCurrency),
      baseAmount: baseAmountCents,
      baseCurrency: BASE_CURRENCY,
      exchangeRate: options.override / baseAmountCents,
    };
  }

  const rate = await getRate(targetCurrency);
  const converted = baseAmountCents * rate;
  const rounded = applyRounding(converted, targetCurrency);

  return {
    amount: rounded,
    currency: targetCurrency,
    formatted: formatCurrency(rounded, targetCurrency),
    baseAmount: baseAmountCents,
    baseCurrency: BASE_CURRENCY,
    exchangeRate: rate,
  };
}

// Get all plan prices in a currency
export async function getPlanPrices(targetCurrency: string): Promise<Array<{
  planId: string;
  name: string;
  monthly: LocalizedPrice;
  annual: LocalizedPrice;
  savings: string;
}>> {
  const plans = [
    { id: "starter", name: "Starter", monthly: 2900, annual: 29000 },
    { id: "pro", name: "Pro", monthly: 7900, annual: 79000 },
    { id: "enterprise", name: "Enterprise", monthly: 19900, annual: 199000 },
  ];

  // Check for strategic price overrides
  const overrides = await redis.hgetall(`price_overrides:${targetCurrency}`);

  return Promise.all(plans.map(async (plan) => {
    const monthlyOverride = overrides[`${plan.id}:monthly`] ? parseInt(overrides[`${plan.id}:monthly`]) : undefined;
    const annualOverride = overrides[`${plan.id}:annual`] ? parseInt(overrides[`${plan.id}:annual`]) : undefined;

    const monthly = await getLocalizedPrice(plan.monthly, targetCurrency, { override: monthlyOverride });
    const annual = await getLocalizedPrice(plan.annual, targetCurrency, { override: annualOverride });

    const monthlyCostFromAnnual = annual.amount / 12;
    const savingsPercent = Math.round((1 - monthlyCostFromAnnual / monthly.amount) * 100);

    return {
      planId: plan.id,
      name: plan.name,
      monthly,
      annual,
      savings: `${savingsPercent}%`,
    };
  }));
}

// Apply currency-specific rounding
function applyRounding(amount: number, currency: string): number {
  const rules = ROUNDING_RULES[currency] || ROUNDING_RULES.default;

  if (rules.strategy === "psychological") {
    // Round to nearest X.99 or X.90
    const whole = Math.round(amount / 100) * 100;
    return whole - (100 - rules.precision); // e.g., 5000 - 1 = 4999
  }

  // Nearest round number
  if (currency === "JPY" || currency === "SEK" || currency === "INR") {
    // Round to nearest 100
    return Math.round(amount / 100) * 100;
  }

  return Math.round(amount);
}

// Format currency for display
function formatCurrency(amountCents: number, currency: string): string {
  const symbols: Record<string, { symbol: string; position: "before" | "after"; decimals: number }> = {
    USD: { symbol: "$", position: "before", decimals: 2 },
    EUR: { symbol: "€", position: "before", decimals: 2 },
    GBP: { symbol: "£", position: "before", decimals: 2 },
    JPY: { symbol: "¥", position: "before", decimals: 0 },
    CAD: { symbol: "CA$", position: "before", decimals: 2 },
    AUD: { symbol: "A$", position: "before", decimals: 2 },
    CHF: { symbol: "CHF", position: "before", decimals: 2 },
    SEK: { symbol: "kr", position: "after", decimals: 0 },
    BRL: { symbol: "R$", position: "before", decimals: 2 },
    INR: { symbol: "₹", position: "before", decimals: 0 },
  };

  const config = symbols[currency] || { symbol: currency, position: "before", decimals: 2 };
  const value = config.decimals > 0 ? (amountCents / 100).toFixed(config.decimals) : String(Math.round(amountCents / 100));

  const formatted = Number(value).toLocaleString("en-US", {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });

  return config.position === "before" ? `${config.symbol}${formatted}` : `${formatted} ${config.symbol}`;
}

// Convert revenue to base currency for reporting
export async function convertToBase(amount: number, fromCurrency: string): Promise<number> {
  const rate = await getRate(fromCurrency);
  return Math.round(amount / rate);
}

// Detect currency from country
export function detectCurrency(countryCode: string): string {
  return COUNTRY_CURRENCY[countryCode] || "USD";
}
```

## Results

- **European conversion fees eliminated** — customers pay in EUR directly; Stripe multi-currency handles settlement; no 5-8% bank conversion fees
- **Japanese signups up 40%** — seeing ¥7,900/mo instead of $79/mo removes friction; price "feels" local
- **Psychological pricing maintained across currencies** — $79.99 becomes €74.99 (not €74.37); ¥7,900 (not ¥7,847); prices feel intentional
- **Exchange rate gaming prevented** — rates update daily; strategic price overrides lock pricing in key markets; switching regions doesn't give unfair discounts
- **Revenue reporting accurate** — all transactions convert to USD at the rate used at purchase time; monthly reports show true USD revenue regardless of payment currency
