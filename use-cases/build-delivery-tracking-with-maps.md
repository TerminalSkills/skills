---
title: Build a Delivery Tracking System with Maps
slug: build-delivery-tracking-with-maps
description: "Build a real-time delivery tracking system with live driver positions, optimized multi-stop routing, geofence alerts, and ETA calculations using Leaflet, OSRM, and WebSockets."
category: development
skills: [maps-geolocation]
tags: [maps, geolocation, websocket, realtime, routing, delivery]
---

# Build a Delivery Tracking System with Maps

Nina runs engineering at a food delivery startup operating in three cities. Customers complain they can't see where their order is, dispatchers have no visibility into driver locations, and route planning is done manually. She needs a real-time delivery tracking system with live driver positions, optimized routes, geofence alerts, and an ETA engine.

## The Problem

Food delivery platforms need GPS tracking, live map updates for customers and dispatchers, automatic status transitions at waypoints, multi-stop route optimization, and continuously recalculated ETAs. Building this typically means expensive mapping API bills, complex WebSocket infrastructure, and a geofencing engine evaluating hundreds of positions per second.

## The Solution

Use open-source building blocks: Leaflet for the map, a self-hosted OSRM server for routing and ETAs, the `ws` WebSocket library for real-time updates, and PostgreSQL for storage. The architecture ingests GPS, broadcasts to the right clients, evaluates geofences on every update, and refreshes ETAs every 30 seconds.

Two public services are for development only. The OSRM demo server (`router.project-osrm.org`) is limited to non-commercial use at one request per second, so a delivery business runs its own OSRM. The OpenStreetMap tile servers may block heavy use, so production needs a tile provider or your own tiles.

## Step-by-Step Walkthrough

### Step 1: Run OSRM and Define the Database Schema

Download an OpenStreetMap extract for your region (Geofabrik publishes them), build the routing graph once, then serve it on the loopback interface (steps from the OSRM README; replace `colorado-latest` with your extract).

```bash
IMG=ghcr.io/project-osrm/osrm-backend
docker run -t -v "${PWD}:/data" $IMG osrm-extract -p /opt/car.lua /data/colorado-latest.osm.pbf
docker run -t -v "${PWD}:/data" $IMG osrm-partition /data/colorado-latest.osrm
docker run -t -v "${PWD}:/data" $IMG osrm-customize /data/colorado-latest.osrm
docker run -d -p 127.0.0.1:5000:5000 -v "${PWD}:/data" $IMG osrm-routed --algorithm mld /data/colorado-latest.osrm
```

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_bytes
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
  status TEXT DEFAULT 'offline',
  current_lat DOUBLE PRECISION, current_lng DOUBLE PRECISION, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  geofence_radius INT DEFAULT 200 -- meters
);
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_lat DOUBLE PRECISION, customer_lng DOUBLE PRECISION,
  restaurant_id UUID REFERENCES restaurants(id), driver_id UUID REFERENCES drivers(id),
  -- pending, assigned, driver_at_restaurant, picked_up, driver_nearby, delivered
  status TEXT DEFAULT 'pending',
  tracking_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  eta_minutes INT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE location_history (
  id BIGSERIAL PRIMARY KEY, driver_id UUID REFERENCES drivers(id),
  lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  speed REAL, recorded_at TIMESTAMPTZ DEFAULT now()
); CREATE INDEX ON location_history(driver_id, recorded_at DESC);
```

### Step 2: Build the WebSocket Server

Install `ws` and `pg` (plus `@types/ws` and `@types/pg` for TypeScript). The server handles three client types: drivers sending GPS updates, dispatchers viewing all activity, and customers tracking a single order. Customers are admitted only if their token matches an order. Drivers and dispatchers must present an HMAC-signed token your login service issues (`WS_SECRET`), so nobody can post positions for someone else's `driverId`.

```typescript
// server.ts -- WebSocket hub for real-time location streaming
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import pg from "pg";
const OSRM = process.env.OSRM_URL ?? "http://127.0.0.1:5000";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const server = createServer();
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const dispatchers = new Set<WebSocket>();
const customerSockets = new Map<string, Set<WebSocket>>();
// Token = "<role>:<id>.<hex hmac>", issued by your login service
function verify(token: string | null, role: string, id: string): boolean {
  if (!token) return false;
  const mac = createHmac("sha256", process.env.WS_SECRET!).update(`${role}:${id}`).digest("hex");
  const expected = Buffer.from(`${role}:${id}.${mac}`);
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
wss.on("connection", async (ws, req) => {
  const url = new URL(req.url!, "http://localhost") // fixed base: a bad Host header must not throw;
  const role = url.searchParams.get("role");
  const token = url.searchParams.get("token");
  if (role === "dispatcher" && verify(token, "dispatcher", "all")) {
    dispatchers.add(ws);
    ws.on("close", () => dispatchers.delete(ws));
  } else if (role === "customer" && token) {
    const found = await db.query("SELECT 1 FROM orders WHERE tracking_token=$1", [token]);
    if (!found.rowCount) return ws.close(1008, "unknown order");
    if (!customerSockets.has(token)) customerSockets.set(token, new Set());
    customerSockets.get(token)!.add(ws);
    ws.on("close", () => customerSockets.get(token)?.delete(ws));
  } else if (role === "driver") {
    const driverId = url.searchParams.get("driverId") ?? "";
    if (!verify(token, "driver", driverId)) return ws.close(1008, "unauthorized");
    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "location" && Number.isFinite(msg.lat) && Number.isFinite(msg.lng) && Math.abs(msg.lat) <= 90 && Math.abs(msg.lng) <= 180)
          await handleDriverLocation(driverId, msg.lat, msg.lng, Number(msg.speed) || 0);
      } catch { /* ignore malformed frames */ }
    });
  } else {
    ws.close(1008, "unauthorized");
  }
});
function send(set: Iterable<WebSocket> | undefined, payload: object) {
  const text = JSON.stringify(payload);
  for (const ws of set ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(text);
}
const notifyCustomer = (token: string, payload: object) => send(customerSockets.get(token), payload);
server.listen(3000, "127.0.0.1"); // put a TLS-terminating proxy in front for wss://
```

### Step 3: Handle Driver Location Updates

Each GPS ping flows through a pipeline: keep the latest fix in memory, persist to history (throttled to every 5th update), update the driver record, broadcast to dispatchers and customers, then evaluate geofences.

```typescript
const pingCount = new Map<string, number>();
async function handleDriverLocation(driverId: string, lat: number, lng: number, speed: number) {
  // Persist every 5th update to cut history writes by 80%
  const n = (pingCount.get(driverId) ?? 0) + 1;
  pingCount.set(driverId, n);
  if (n % 5 === 0)
    await db.query("INSERT INTO location_history (driver_id,lat,lng,speed) VALUES ($1,$2,$3,$4)",
      [driverId, lat, lng, speed]);
  await db.query("UPDATE drivers SET current_lat=$1, current_lng=$2, updated_at=now() WHERE id=$3",
    [lat, lng, driverId]);
  send(dispatchers, { type: "driver_pos", driverId, lat, lng, speed });
  // Customers tracking this driver's orders
  const orders = await db.query(
    "SELECT tracking_token FROM orders WHERE driver_id=$1 AND status IN ('picked_up','driver_nearby')",
    [driverId]);
  for (const o of orders.rows) notifyCustomer(o.tracking_token, { type: "driver_pos", lat, lng });
  await checkGeofences(driverId, lat, lng);
}
```

### Step 4: Build the Geofence Engine

Use the Haversine formula for distance and track enter/exit state per driver per fence so events fire only on transitions. Moving an order to `picked_up` is the driver app's action (a button press); the geofences handle arrival at the restaurant and proximity to the customer.

```typescript
const driverFenceState = new Map<string, Map<string, boolean>>();
// Haversine distance in meters
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// true only on the transition from outside to inside a fence
function entered(state: Map<string, boolean>, key: string, inside: boolean): boolean {
  const was = state.get(key) ?? false;
  state.set(key, inside);
  return inside && !was;
}
async function checkGeofences(driverId: string, lat: number, lng: number) {
  if (!driverFenceState.has(driverId)) driverFenceState.set(driverId, new Map());
  const state = driverFenceState.get(driverId)!;
  const orders = await db.query(
    `SELECT o.id, o.status, o.tracking_token, o.customer_lat, o.customer_lng,
            r.lat AS r_lat, r.lng AS r_lng, r.geofence_radius
     FROM orders o JOIN restaurants r ON o.restaurant_id = r.id
     WHERE o.driver_id = $1 AND o.status IN ('assigned','picked_up')`,
    [driverId]);
  for (const o of orders.rows) {
    const atRestaurant = haversine(lat, lng, o.r_lat, o.r_lng) <= o.geofence_radius;
    if (entered(state, `restaurant:${o.id}`, atRestaurant) && o.status === "assigned") {
      await db.query("UPDATE orders SET status='driver_at_restaurant' WHERE id=$1", [o.id]);
      notifyCustomer(o.tracking_token, { type: "status", message: "Driver arrived at restaurant" });
    }
    if (o.status === "picked_up" && o.customer_lat != null) {
      const near = haversine(lat, lng, o.customer_lat, o.customer_lng) <= 100; // 100 m
      if (entered(state, `customer:${o.id}`, near)) {
        await db.query("UPDATE orders SET status='driver_nearby' WHERE id=$1", [o.id]);
        notifyCustomer(o.tracking_token, { type: "status", message: "Driver is nearby!" });
      }
    }
  }
}
```

### Step 5: Implement ETA Calculation

OSRM expects coordinates as `longitude,latitude`. The `route` service returns `duration` in seconds.

```typescript
async function calculateETA(
  driverLat: number, driverLng: number, destLat: number, destLng: number
): Promise<number> {
  const res = await fetch(
    `${OSRM}/route/v1/driving/${driverLng},${driverLat};${destLng},${destLat}?overview=false`);
  const data: any = await res.json();
  return data.code === "Ok" ? Math.ceil(data.routes[0].duration / 60) : -1;
}
let etaRunning = false;
setInterval(async () => { // refresh ETAs for all active orders every 30 seconds
  if (etaRunning) return; // skip a tick rather than overlap runs
  etaRunning = true;
  try {
    const active = await db.query(
      `SELECT o.id, o.tracking_token, o.customer_lat, o.customer_lng, o.status,
              d.current_lat, d.current_lng, r.lat AS r_lat, r.lng AS r_lng
       FROM orders o JOIN drivers d ON o.driver_id = d.id
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       WHERE o.status IN ('assigned','driver_at_restaurant','picked_up','driver_nearby')
         AND d.current_lat IS NOT NULL`);
    for (const o of active.rows) {
      const toR = o.status === "assigned";
      const eta = await calculateETA(o.current_lat, o.current_lng,
        toR ? o.r_lat : o.customer_lat, toR ? o.r_lng : o.customer_lng);
      if (eta >= 0) {
        await db.query("UPDATE orders SET eta_minutes=$1 WHERE id=$2", [eta, o.id]);
        notifyCustomer(o.tracking_token, { type: "eta", minutes: eta });
      }
    }
  } finally { etaRunning = false; }
}, 30_000);
```

### Step 6: Add Multi-Stop Route Optimization

The OSRM `trip` service solves the traveling salesman problem. `source=first&roundtrip=false` keeps the driver's position as the start and lets the route end wherever is best. Each returned waypoint carries `waypoint_index`, its position in the optimized trip.

```typescript
async function optimizeDeliveryRoute(
  driverLat: number, driverLng: number,
  stops: { lat: number; lng: number; orderId: string }[]
) {
  const coords = [[driverLng, driverLat], ...stops.map(s => [s.lng, s.lat])].join(";");
  const res = await fetch(
    `${OSRM}/trip/v1/driving/${coords}?source=first&roundtrip=false&geometries=geojson`);
  const data: any = await res.json();
  if (data.code !== "Ok") return null;
  const visit = stops.map((s, i) => ({ s, pos: data.waypoints[i + 1].waypoint_index }))
    .sort((a, b) => a.pos - b.pos);
  return {
    optimizedOrder: visit.map(v => v.s.orderId),
    totalDistance: data.trips[0].distance,  // meters
    totalDuration: data.trips[0].duration,  // seconds
    geometry: data.trips[0].geometry,       // GeoJSON for map overlay
  };
}
```

### Step 7: Build the Customer Tracking Page

Leaflet 1.9.4 is pinned with the integrity hashes from the Leaflet quick-start. Point `TILE_URL` at your tile provider; the public OSM URL is for development only.

```html
<!DOCTYPE html>
<meta charset="utf-8"><title>Track Your Order</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>#map { height: 70vh; }</style>
<div id="status">Connecting...</div><div id="eta"></div><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
  const TOKEN = new URLSearchParams(location.search).get("t");
  const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"; // dev only
  const map = L.map("map").setView([39.74, -104.99], 13);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  let marker = null;
  const ws = new WebSocket(`wss://${location.host}/ws?role=customer&token=${TOKEN}`);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "driver_pos") {
      if (!marker) { marker = L.marker([msg.lat, msg.lng]).addTo(map); map.setView([msg.lat, msg.lng], 15); }
      else marker.setLatLng([msg.lat, msg.lng]);
    }
    if (msg.type === "eta") document.getElementById("eta").textContent = `Estimated arrival: ${msg.minutes} min`;
    if (msg.type === "status") document.getElementById("status").textContent = msg.message;
  };
</script>
```
The dispatcher dashboard is the same page with `role=dispatcher` and its signed token. It draws color-coded driver markers (green=idle, yellow=en-route, blue=delivering) and restaurant pins, and loads last known positions from `drivers` over HTTP when it opens.

## Real-World Example

Nina's team deploys this for Denver, Boulder, and Fort Collins, with one Colorado OSRM instance on the same host. Their numbers from a Friday dinner rush with 80 concurrent deliveries:
1. **Driver Carlos** picks up 3 orders from Pasta Palace. The route optimizer sequences his stops to avoid backtracking across downtown; dispatch estimated it saved about 12 minutes against the manual order.
2. **Customer tracking** links go out via SMS. A customer watches Carlos move along I-25, ETA ticking from 18 to 3 minutes. When he enters the 100-meter geofence, the status flips to "Driver nearby" before he buzzes the intercom.
3. **Dispatcher Maria** sees Carlos's marker change color automatically and reassigns orders from idle Boulder drivers to balance the load. Routing runs on their own hardware, so the only metered cost is the tile provider.

## Related Skills

- [maps-geolocation](../skills/maps-geolocation/) -- Leaflet maps, geocoding, geofencing and routing patterns
