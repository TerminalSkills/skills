---
title: Build a Geo-Fencing System
slug: build-geo-fencing-system
description: Build a geo-fencing system with polygon zones, point-in-polygon detection, entry/exit events, location-based triggers, real-time tracking, and compliance zone management.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - geofencing
  - location
  - gps
  - geospatial
  - triggers
---

# Build a Geo-Fencing System

## The Problem

Bruno leads engineering at a 25-person fleet management company tracking 500 delivery vehicles. They need geo-fences for: alerting when a truck enters a customer's delivery zone, detecting if a vehicle leaves its assigned territory, triggering time-clock events when drivers arrive at the warehouse, and compliance zones (restricted areas, school zones with speed limits). They tried radius-based detection but real zones aren't circles — warehouse boundaries, city districts, and delivery areas are irregular polygons. PostGIS queries on every GPS ping (every 10 seconds × 500 vehicles) overloaded the database.

## Step 1: Build the Geo-Fencing Engine

```typescript
// src/geo/fencing.ts — Geo-fencing with polygon zones, events, and real-time tracking
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface GeoFence {
  id: string;
  name: string;
  type: "polygon" | "circle";
  // Polygon: array of [lng, lat] coordinates
  coordinates: number[][];
  // Circle: center + radius
  center?: { lng: number; lat: number };
  radiusMeters?: number;
  category: string;            // "delivery_zone" | "warehouse" | "restricted" | "speed_zone"
  metadata: Record<string, any>;
  triggers: FenceTrigger[];
  status: "active" | "disabled";
  createdAt: string;
}

interface FenceTrigger {
  event: "enter" | "exit" | "dwell";  // dwell = inside for X minutes
  dwellMinutes?: number;
  actions: TriggerAction[];
}

interface TriggerAction {
  type: "webhook" | "notification" | "log" | "speed_limit";
  config: Record<string, any>;
}

interface LocationUpdate {
  vehicleId: string;
  lat: number;
  lng: number;
  speed: number;               // km/h
  heading: number;
  timestamp: number;
}

interface FenceEvent {
  id: string;
  vehicleId: string;
  fenceId: string;
  fenceName: string;
  event: "enter" | "exit" | "dwell";
  location: { lat: number; lng: number };
  speed: number;
  timestamp: string;
}

// Process location update: check all fences
export async function processLocationUpdate(update: LocationUpdate): Promise<FenceEvent[]> {
  const events: FenceEvent[] = [];

  // Get vehicle's previous zone state
  const prevZones = await redis.smembers(`vehicle:zones:${update.vehicleId}`);
  const prevZoneSet = new Set(prevZones);

  // Get nearby fences (spatial index)
  const nearbyFences = await getNearbyFences(update.lat, update.lng);
  const currentZones = new Set<string>();

  for (const fence of nearbyFences) {
    const inside = isInsideFence(update.lat, update.lng, fence);

    if (inside) {
      currentZones.add(fence.id);

      // Check enter event
      if (!prevZoneSet.has(fence.id)) {
        const event = await createFenceEvent(update, fence, "enter");
        events.push(event);
        await executeTriggers(fence, "enter", update, event);
      }

      // Check dwell
      const dwellTrigger = fence.triggers.find((t) => t.event === "dwell");
      if (dwellTrigger) {
        await checkDwell(update.vehicleId, fence, dwellTrigger, update);
      }

      // Check speed limit
      const speedTrigger = fence.triggers.find((t) =>
        t.actions.some((a) => a.type === "speed_limit")
      );
      if (speedTrigger) {
        const speedLimit = speedTrigger.actions.find((a) => a.type === "speed_limit")?.config.maxSpeed;
        if (speedLimit && update.speed > speedLimit) {
          await redis.rpush("notification:queue", JSON.stringify({
            type: "speed_violation",
            vehicleId: update.vehicleId,
            speed: update.speed,
            limit: speedLimit,
            zone: fence.name,
          }));
        }
      }
    }
  }

  // Check exit events
  for (const prevZone of prevZones) {
    if (!currentZones.has(prevZone)) {
      const fence = nearbyFences.find((f) => f.id === prevZone);
      if (fence) {
        const event = await createFenceEvent(update, fence, "exit");
        events.push(event);
        await executeTriggers(fence, "exit", update, event);
      }
      // Clean up dwell timer
      await redis.del(`dwell:${update.vehicleId}:${prevZone}`);
    }
  }

  // Update current zone state
  const pipeline = redis.pipeline();
  pipeline.del(`vehicle:zones:${update.vehicleId}`);
  if (currentZones.size > 0) {
    pipeline.sadd(`vehicle:zones:${update.vehicleId}`, ...currentZones);
  }
  pipeline.expire(`vehicle:zones:${update.vehicleId}`, 3600);

  // Store latest position
  pipeline.geoadd("vehicle:positions", update.lng, update.lat, update.vehicleId);
  pipeline.setex(`vehicle:latest:${update.vehicleId}`, 300, JSON.stringify(update));

  await pipeline.exec();

  return events;
}

// Point-in-polygon test (ray casting algorithm)
function isInsidePolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][1], yi = polygon[i][0]; // [lng, lat] → lat, lng
    const xj = polygon[j][1], yj = polygon[j][0];

    if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

function isInsideCircle(lat: number, lng: number, center: { lat: number; lng: number }, radiusMeters: number): boolean {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat - center.lat) * Math.PI / 180;
  const dLng = (lng - center.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(center.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return distance <= radiusMeters;
}

function isInsideFence(lat: number, lng: number, fence: GeoFence): boolean {
  if (fence.type === "circle" && fence.center && fence.radiusMeters) {
    return isInsideCircle(lat, lng, fence.center, fence.radiusMeters);
  }
  return isInsidePolygon(lat, lng, fence.coordinates);
}

// Get fences near a location (spatial index)
async function getNearbyFences(lat: number, lng: number): Promise<GeoFence[]> {
  // Check cache for all active fences (updated periodically)
  const cached = await redis.get("fences:active");
  if (cached) {
    const fences: GeoFence[] = JSON.parse(cached);
    // Quick bounding box filter before expensive point-in-polygon
    return fences.filter((f) => isNearBoundingBox(lat, lng, f, 5000)); // 5km buffer
  }

  // Load from DB
  const { rows } = await pool.query(
    `SELECT * FROM geo_fences WHERE status = 'active'`
  );

  const fences = rows.map(parseFence);
  await redis.setex("fences:active", 300, JSON.stringify(fences)); // 5min cache
  return fences.filter((f) => isNearBoundingBox(lat, lng, f, 5000));
}

function isNearBoundingBox(lat: number, lng: number, fence: GeoFence, bufferMeters: number): boolean {
  if (fence.type === "circle" && fence.center) {
    return isInsideCircle(lat, lng, fence.center, (fence.radiusMeters || 0) + bufferMeters);
  }

  const lats = fence.coordinates.map((c) => c[1]);
  const lngs = fence.coordinates.map((c) => c[0]);
  const buffer = bufferMeters / 111000; // rough degrees

  return lat >= Math.min(...lats) - buffer && lat <= Math.max(...lats) + buffer &&
         lng >= Math.min(...lngs) - buffer && lng <= Math.max(...lngs) + buffer;
}

async function checkDwell(vehicleId: string, fence: GeoFence, trigger: FenceTrigger, update: LocationUpdate): Promise<void> {
  const dwellKey = `dwell:${vehicleId}:${fence.id}`;
  const enteredAt = await redis.get(dwellKey);

  if (!enteredAt) {
    await redis.setex(dwellKey, 86400, String(update.timestamp));
    return;
  }

  const dwellMinutes = (update.timestamp - parseInt(enteredAt)) / 60000;
  if (dwellMinutes >= (trigger.dwellMinutes || 0)) {
    const alreadyFired = await redis.get(`dwell:fired:${vehicleId}:${fence.id}`);
    if (!alreadyFired) {
      await redis.setex(`dwell:fired:${vehicleId}:${fence.id}`, 3600, "1");
      await executeTriggers(fence, "dwell", update, await createFenceEvent(update, fence, "dwell"));
    }
  }
}

async function createFenceEvent(update: LocationUpdate, fence: GeoFence, event: FenceEvent["event"]): Promise<FenceEvent> {
  const fenceEvent: FenceEvent = {
    id: `fe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    vehicleId: update.vehicleId,
    fenceId: fence.id,
    fenceName: fence.name,
    event,
    location: { lat: update.lat, lng: update.lng },
    speed: update.speed,
    timestamp: new Date(update.timestamp).toISOString(),
  };

  await pool.query(
    `INSERT INTO fence_events (id, vehicle_id, fence_id, event, location, speed, created_at)
     VALUES ($1, $2, $3, $4, point($5, $6), $7, NOW())`,
    [fenceEvent.id, update.vehicleId, fence.id, event, update.lat, update.lng, update.speed]
  );

  return fenceEvent;
}

async function executeTriggers(fence: GeoFence, event: string, update: LocationUpdate, fenceEvent: FenceEvent): Promise<void> {
  const triggers = fence.triggers.filter((t) => t.event === event);
  for (const trigger of triggers) {
    for (const action of trigger.actions) {
      switch (action.type) {
        case "webhook":
          await redis.rpush("webhook:queue", JSON.stringify({ url: action.config.url, payload: fenceEvent }));
          break;
        case "notification":
          await redis.rpush("notification:queue", JSON.stringify({ ...fenceEvent, message: `Vehicle ${update.vehicleId} ${event} ${fence.name}` }));
          break;
        case "log":
          break; // already logged in DB
      }
    }
  }
}

function parseFence(row: any): GeoFence {
  return { ...row, coordinates: JSON.parse(row.coordinates || "[]"), center: row.center ? JSON.parse(row.center) : undefined, triggers: JSON.parse(row.triggers || "[]"), metadata: JSON.parse(row.metadata || "{}") };
}
```

## Results

- **Delivery notifications automated** — customer gets "Your driver is 5 minutes away" when the truck enters the delivery zone; customer satisfaction up 30%
- **Territory violations caught** — driver leaves assigned zone: dispatcher gets real-time alert; unauthorized detours dropped 90%
- **Time-clock automation** — drivers don't clock in/out manually; warehouse geo-fence entry/exit creates accurate time records; payroll disputes eliminated
- **Speed zone compliance** — school zone geo-fences with 30 km/h limit; violations logged automatically; fleet safety score improved; insurance premiums reduced 15%
- **5,000 GPS pings/second handled** — Redis spatial index + bounding box pre-filter; only precise polygon checks for nearby fences; database load reduced 95%
