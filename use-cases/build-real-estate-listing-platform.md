---
title: "Build a Real Estate Listing Platform"
description: "Launch a Zillow competitor for your city or niche. Property listings with photos and maps, advanced search filters, a map view with clustering, saved searches with email alerts, and a contact-agent form with scheduled viewing requests."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "6 hours"
tags: [real-estate, listings, maps, search, email-alerts, proptech]
---

# Build a Real Estate Listing Platform

Zillow charges agents $500/month. Realtor.com is slow and cluttered. You know your local market better than any algorithm.

**Build the go-to listing platform for your city or niche** — luxury condos, beachfront properties, commercial spaces. Own the vertical.

## Who This Is For

A proptech startup, real estate agency, or developer who wants to build a focused listing marketplace for a specific city, region, or property type.

## What You'll Build

- 🏠 Property listings — photos, maps, full details
- 🔍 Advanced search — location, price, type, amenities, size
- 🗺️ Map view — Mapbox with marker clustering
- 💾 Saved searches + new listing email alerts via Resend
- 📞 Contact agent form + scheduled viewing requests

## Prerequisites

- Mapbox account (free tier — 50k loads/month)
- Resend account for email alerts
- PostgreSQL database (PostGIS extension for geo queries)
- S3 or Cloudflare R2 for photo storage

---

## Step 1: Database Schema

```prisma
// schema.prisma
model Property {
  id           String   @id @default(cuid())
  slug         String   @unique
  title        String
  description  String
  type         String   // "apartment" | "house" | "condo" | "commercial" | "land"
  status       String   @default("active") // active | pending | sold | rented
  price        Float
  pricePerSqft Float?
  bedrooms     Int?
  bathrooms    Float?
  areaSqft     Int?
  lotSqft      Int?
  yearBuilt    Int?
  parking      Int?
  photos       String[] // S3 URLs
  amenities    String[] // ["gym", "pool", "doorman", "balcony", ...]
  // Address
  address      String
  city         String
  state        String
  zipCode      String
  lat          Float
  lng          Float
  // Agent
  agentId      String
  agent        Agent    @relation(fields: [agentId], references: [id])
  viewingRequests ViewingRequest[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Agent {
  id         String     @id @default(cuid())
  name       String
  email      String     @unique
  phone      String
  bio        String?
  photoUrl   String?
  license    String?
  properties Property[]
  createdAt  DateTime   @default(now())
}

model SavedSearch {
  id         String   @id @default(cuid())
  email      String
  name       String   // "3BR in Downtown"
  city       String?
  minPrice   Float?
  maxPrice   Float?
  type       String?
  minBeds    Int?
  amenities  String[]
  active     Boolean  @default(true)
  lastAlerted DateTime?
  createdAt  DateTime @default(now())
}

model ViewingRequest {
  id          String   @id @default(cuid())
  propertyId  String
  name        String
  email       String
  phone       String?
  message     String?
  preferredAt DateTime?
  status      String   @default("pending") // pending | confirmed | cancelled
  property    Property @relation(fields: [propertyId], references: [id])
  createdAt   DateTime @default(now())
}
```

```bash
npx prisma migrate dev --name init
```

---

## Step 2: Property Search with Filters

```typescript
// lib/search.ts
import { prisma } from './prisma';

export interface SearchFilters {
  city?: string;
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  minArea?: number;
  amenities?: string[];
  lat?: number;
  lng?: number;
  radiusMiles?: number;
  page?: number;
  limit?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'price_per_sqft';
}

export async function searchProperties(filters: SearchFilters) {
  const { page = 1, limit = 20, sortBy = 'newest' } = filters;

  const orderBy = {
    price_asc: { price: 'asc' as const },
    price_desc: { price: 'desc' as const },
    newest: { createdAt: 'desc' as const },
    price_per_sqft: { pricePerSqft: 'asc' as const },
  }[sortBy];

  const where: any = {
    status: 'active',
    ...(filters.city && { city: { contains: filters.city, mode: 'insensitive' } }),
    ...(filters.type && { type: filters.type }),
    ...(filters.minPrice !== undefined && { price: { gte: filters.minPrice } }),
    ...(filters.maxPrice !== undefined && { price: { lte: filters.maxPrice } }),
    ...(filters.minBeds !== undefined && { bedrooms: { gte: filters.minBeds } }),
    ...(filters.minBaths !== undefined && { bathrooms: { gte: filters.minBaths } }),
    ...(filters.minArea !== undefined && { areaSqft: { gte: filters.minArea } }),
    ...(filters.amenities?.length && { amenities: { hasEvery: filters.amenities } }),
  };

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { agent: { select: { name: true, phone: true, email: true, photoUrl: true } } },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.property.count({ where }),
  ]);

  return { properties, total, page, pages: Math.ceil(total / limit) };
}

// For map view — lightweight, no pagination
export async function getMapPins(city: string) {
  return prisma.property.findMany({
    where: { status: 'active', city: { contains: city, mode: 'insensitive' } },
    select: { id: true, lat: true, lng: true, price: true, type: true, bedrooms: true, slug: true }
  });
}
```

---

## Step 3: Property Detail Page Data

```typescript
// lib/properties.ts
import { prisma } from './prisma';

export async function getPropertyBySlug(slug: string) {
  return prisma.property.findUnique({
    where: { slug },
    include: {
      agent: true,
      viewingRequests: {
        where: { status: 'confirmed' },
        select: { preferredAt: true }
      }
    }
  });
}

export async function getSimilarProperties(property: { city: string; type: string; price: number; id: string }) {
  return prisma.property.findMany({
    where: {
      city: property.city,
      type: property.type,
      status: 'active',
      price: { gte: property.price * 0.8, lte: property.price * 1.2 },
      id: { not: property.id }
    },
    take: 4,
    orderBy: { createdAt: 'desc' }
  });
}
```

---

## Step 4: Viewing Request + Agent Notification

```typescript
// lib/viewing.ts
import { prisma } from './prisma';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function submitViewingRequest(input: {
  propertyId: string; name: string; email: string;
  phone?: string; message?: string; preferredAt?: Date;
}) {
  const request = await prisma.viewingRequest.create({ data: input });

  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    include: { agent: true }
  });

  if (property) {
    // Notify agent
    await resend.emails.send({
      from: 'listings@yourplatform.com',
      to: property.agent.email,
      subject: `New viewing request — ${property.title}`,
      html: `
        <h3>New Viewing Request</h3>
        <p><strong>Property:</strong> ${property.title}</p>
        <p><strong>From:</strong> ${input.name} (${input.email})</p>
        ${input.phone ? `<p><strong>Phone:</strong> ${input.phone}</p>` : ''}
        ${input.preferredAt ? `<p><strong>Preferred time:</strong> ${input.preferredAt.toLocaleString()}</p>` : ''}
        ${input.message ? `<p><strong>Message:</strong> ${input.message}</p>` : ''}
        <a href="${process.env.APP_URL}/agent/requests/${request.id}">Respond to request</a>
      `,
    });

    // Confirm to buyer
    await resend.emails.send({
      from: 'listings@yourplatform.com',
      to: input.email,
      subject: `Viewing request received — ${property.title}`,
      html: `<p>Hi ${input.name}, your request to view <strong>${property.title}</strong> has been sent to the agent. They'll contact you within 24 hours.</p>`,
    });
  }

  return request.id;
}
```

---

## Step 5: Saved Searches + Email Alerts

```typescript
// lib/saved-searches.ts
import { prisma } from './prisma';
import { Resend } from 'resend';
import { searchProperties } from './search';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function createSavedSearch(email: string, name: string, filters: Record<string, any>) {
  return prisma.savedSearch.create({
    data: { email, name, city: filters.city, minPrice: filters.minPrice, maxPrice: filters.maxPrice, type: filters.type, minBeds: filters.minBeds, amenities: filters.amenities ?? [] }
  });
}

// Run this daily via cron
export async function sendNewListingAlerts() {
  const savedSearches = await prisma.savedSearch.findMany({ where: { active: true } });

  for (const saved of savedSearches) {
    const since = saved.lastAlerted ?? new Date(Date.now() - 24 * 3600 * 1000);

    const results = await prisma.property.findMany({
      where: {
        status: 'active',
        createdAt: { gte: since },
        ...(saved.city && { city: { contains: saved.city, mode: 'insensitive' } }),
        ...(saved.type && { type: saved.type }),
        ...(saved.minPrice !== undefined && { price: { gte: saved.minPrice } }),
        ...(saved.maxPrice !== undefined && { price: { lte: saved.maxPrice } }),
        ...(saved.minBeds !== undefined && { bedrooms: { gte: saved.minBeds } }),
      },
      take: 5,
    });

    if (results.length === 0) continue;

    const listingHtml = results.map(p =>
      `<li><a href="${process.env.APP_URL}/listings/${p.slug}">${p.title}</a> — $${p.price.toLocaleString()} | ${p.bedrooms ?? 'N/A'}BR | ${p.city}</li>`
    ).join('');

    await resend.emails.send({
      from: 'alerts@yourplatform.com',
      to: saved.email,
      subject: `${results.length} new listing${results.length > 1 ? 's' : ''} matching "${saved.name}"`,
      html: `<p>New properties matching your saved search:</p><ul>${listingHtml}</ul><p><a href="${process.env.APP_URL}/search">View all results</a></p>`,
    });

    await prisma.savedSearch.update({ where: { id: saved.id }, data: { lastAlerted: new Date() } });
  }
}
```

---

## Map View (Mapbox + React)

```typescript
// components/PropertyMap.tsx
import Map, { Marker, Popup } from 'react-map-gl';
import { useState } from 'react';

export function PropertyMap({ pins }: { pins: any[] }) {
  const [selected, setSelected] = useState<any>(null);

  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -73.935242, latitude: 40.730610, zoom: 12 }}
      style={{ width: '100%', height: 500 }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
    >
      {pins.map(pin => (
        <Marker key={pin.id} longitude={pin.lng} latitude={pin.lat} onClick={() => setSelected(pin)}>
          <div className="price-pin">${(pin.price / 1000).toFixed(0)}K</div>
        </Marker>
      ))}
      {selected && (
        <Popup longitude={selected.lng} latitude={selected.lat} onClose={() => setSelected(null)}>
          <a href={`/listings/${selected.slug}`}>${selected.price.toLocaleString()} · {selected.bedrooms}BR</a>
        </Popup>
      )}
    </Map>
  );
}
```

---

## Next Steps

- Add Mapbox cluster layer for cities with 1000+ listings
- Integrate IDX/MLS data feeds for automatic listing import
- Build an agent dashboard for managing their listings
- Add mortgage calculator widget (monthly payment estimator)
- Implement virtual tour support via Matterport embed
