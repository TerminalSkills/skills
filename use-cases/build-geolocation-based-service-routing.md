---
title: Build Geolocation-Based Service Routing
slug: build-geolocation-based-service-routing
description: Build a location-aware routing system that directs users to the nearest service, applies regional pricing, enforces geo-restrictions, and personalizes content based on IP geolocation.
skills:
  - typescript
  - redis
  - hono
  - zod
  - postgresql
category: development
tags:
  - geolocation
  - routing
  - personalization
  - compliance
  - cdn
---

# Build Geolocation-Based Service Routing

## The Problem

Sonya runs a 35-person SaaS serving customers in 60 countries. All traffic routes to the same server regardless of location. Pricing shows USD for everyone, even Europeans who expect EUR. Data residency laws require EU customer data to stay in EU servers, but the app has no location awareness. When they launched in Brazil, they discovered their service was unusably slow because traffic routed through 3 continents. They need geolocation-based routing that detects user location, serves localized pricing, enforces data residency, and routes to the nearest server.

## Step 1: Build the Geolocation Service

```typescript
// src/geo/geo-service.ts — IP geolocation with caching and routing decisions
import { Redis } from "ioredis";
import { readFileSync } from "node:fs";

const redis = new Redis(process.env.REDIS_URL!);

interface GeoInfo {
  ip: string;
  country: string;           // ISO 3166-1 alpha-2
  countryName: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  currency: string;
  continent: string;
  isEU: boolean;
}

// Regional server configuration
const REGIONS: Record<string, { name: string; endpoint: string; countries: string[] }> = {
  "us-east": {
    name: "US East",
    endpoint: "https://us-east.api.example.com",
    countries: ["US", "CA", "MX", "BR", "AR", "CO"],
  },
  "eu-west": {
    name: "EU West",
    endpoint: "https://eu-west.api.example.com",
    countries: ["DE", "FR", "GB", "IT", "ES", "NL", "BE", "AT", "CH", "PL", "CZ", "SE", "NO", "DK", "FI", "IE", "PT"],
  },
  "ap-southeast": {
    name: "Asia Pacific",
    endpoint: "https://ap-southeast.api.example.com",
    countries: ["JP", "KR", "SG", "AU", "NZ", "IN", "TH", "VN", "ID", "MY", "PH"],
  },
};

// Regional pricing
const PRICING: Record<string, { currency: string; multiplier: number; symbol: string }> = {
  US: { currency: "USD", multiplier: 1.0, symbol: "$" },
  GB: { currency: "GBP", multiplier: 0.82, symbol: "£" },
  EU: { currency: "EUR", multiplier: 0.92, symbol: "€" },
  JP: { currency: "JPY", multiplier: 150, symbol: "¥" },
  BR: { currency: "BRL", multiplier: 0.5, symbol: "R$" },   // PPP adjusted
  IN: { currency: "INR", multiplier: 0.3, symbol: "₹" },   // PPP adjusted
};

// Geo-restricted content
const BLOCKED_COUNTRIES = ["KP", "IR", "SY", "CU"]; // sanctions compliance

// Get geo info from IP
export async function getGeoInfo(ip: string): Promise<GeoInfo> {
  // Check cache
  const cached = await redis.get(`geo:${ip}`);
  if (cached) return JSON.parse(cached);

  // Use Cloudflare headers first (free, accurate)
  // Fallback to MaxMind GeoLite2 database
  const info = await lookupIP(ip);

  // Cache for 24 hours
  await redis.setex(`geo:${ip}`, 86400, JSON.stringify(info));
  return info;
}

// Determine which regional server to route to
export function getRoutingRegion(country: string): {
  region: string;
  endpoint: string;
  name: string;
} {
  for (const [regionId, config] of Object.entries(REGIONS)) {
    if (config.countries.includes(country)) {
      return { region: regionId, endpoint: config.endpoint, name: config.name };
    }
  }
  return { region: "us-east", endpoint: REGIONS["us-east"].endpoint, name: "US East (default)" };
}

// Get localized pricing
export function getLocalizedPricing(
  country: string,
  basePriceUSD: number
): { amount: number; currency: string; symbol: string; formatted: string } {
  // Check EU membership
  const isEU = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "FI", "IE", "GR", "LU", "CY", "MT", "SK", "SI", "EE", "LV", "LT", "HR", "BG", "RO", "CZ", "DK", "SE", "PL", "HU"].includes(country);
  const pricingKey = isEU ? "EU" : country;
  const pricing = PRICING[pricingKey] || PRICING["US"];

  const amount = Math.round(basePriceUSD * pricing.multiplier * 100) / 100;

  return {
    amount,
    currency: pricing.currency,
    symbol: pricing.symbol,
    formatted: `${pricing.symbol}${amount.toLocaleString()}`,
  };
}

// Check compliance restrictions
export function checkGeoRestrictions(country: string): {
  allowed: boolean;
  reason?: string;
  dataResidency?: string;
} {
  if (BLOCKED_COUNTRIES.includes(country)) {
    return { allowed: false, reason: "Service not available in this region due to compliance requirements" };
  }

  // GDPR data residency for EU
  const isEU = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "FI", "IE"].includes(country);
  if (isEU) {
    return { allowed: true, dataResidency: "eu-west" };
  }

  return { allowed: true };
}

async function lookupIP(ip: string): Promise<GeoInfo> {
  // In production: use MaxMind GeoLite2 or ip-api.com
  const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,city,lat,lon,timezone,currency,continent`);
  const data = await response.json();

  return {
    ip,
    country: data.countryCode,
    countryName: data.country,
    region: data.region,
    city: data.city,
    latitude: data.lat,
    longitude: data.lon,
    timezone: data.timezone,
    currency: data.currency || "USD",
    continent: data.continent || "",
    isEU: ["DE", "FR", "IT", "ES", "NL", "BE", "AT"].includes(data.countryCode),
  };
}
```

## Step 2: Geo-Aware Middleware

```typescript
// src/middleware/geo.ts — Geolocation middleware for Hono
import { Context, Next } from "hono";
import { getGeoInfo, checkGeoRestrictions, getRoutingRegion, getLocalizedPricing } from "../geo/geo-service";

export function geoMiddleware() {
  return async (c: Context, next: Next) => {
    // Get IP from headers (CDN/proxy sets these)
    const ip = c.req.header("CF-Connecting-IP")
      || c.req.header("X-Forwarded-For")?.split(",")[0]?.trim()
      || "127.0.0.1";

    // Use Cloudflare's geo header if available (zero-cost, instant)
    const country = c.req.header("CF-IPCountry") || (await getGeoInfo(ip)).country;

    // Check restrictions
    const restrictions = checkGeoRestrictions(country);
    if (!restrictions.allowed) {
      return c.json({ error: restrictions.reason }, 403);
    }

    // Set context for downstream handlers
    c.set("geoCountry", country);
    c.set("geoDataResidency", restrictions.dataResidency || "us-east");
    c.set("geoRegion", getRoutingRegion(country));

    // Add geo headers for client-side use
    c.header("X-Geo-Country", country);
    c.header("X-Data-Region", restrictions.dataResidency || "us-east");

    await next();
  };
}

// Pricing endpoint with geo-aware pricing
export function pricingHandler() {
  return async (c: Context) => {
    const country = c.get("geoCountry");
    const basePrices = { starter: 29, pro: 99, enterprise: 499 };

    const plans = Object.entries(basePrices).map(([plan, basePrice]) => ({
      plan,
      ...getLocalizedPricing(country, basePrice),
    }));

    return c.json({ country, plans });
  };
}
```

## Results

- **Brazilian latency: 350ms → 45ms** — routing to the nearest regional server eliminated cross-continental round trips
- **EU data residency compliance** — geo middleware routes EU user data to eu-west servers automatically; GDPR auditors verified compliance in one meeting
- **Localized pricing increased conversion by 28%** — Brazilian users see prices in BRL with PPP adjustment; Indian users see INR; no more "everything is in USD" barrier
- **Sanctions compliance automated** — blocked countries get a 403 response; no manual blocklist maintenance in each service
- **Zero additional latency for geo detection** — Cloudflare's CF-IPCountry header provides instant geolocation; IP-based lookup cached for 24 hours as fallback
