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

Use entirely free and open-source tools: Leaflet with OpenStreetMap for maps, OSRM for routing and ETAs, WebSockets for real-time updates, Redis for location caching, and PostgreSQL for storage. The architecture ingests GPS, broadcasts to the right clients, evaluates geofences on every update, and refreshes ETAs every 30 seconds.

## Step-by-Step Walkthrough

### Step 1: Define the Database Schema

```sql
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, phone TEXT,
  status TEXT DEFAULT 'offline', -- offline, idle, to_restaurant, delivering
  current_lat DOUBLE PRECISION, current_lng DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, address TEXT,
  lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  geofence_radius INT DEFAULT 200 -- meters
);
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT, customer_address TEXT,
  customer_lat DOUBLE PRECISION, customer_lng DOUBLE PRECISION,
  restaurant_id UUID REFERENCES restaurants(id),
  driver_id UUID REFERENCES drivers(id),
  status TEXT DEFAULT 'pending',
  tracking_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  eta_minutes INT,
  created_at TIMESTAMPTZ DEFAULT now(), delivered_at TIMESTAMPTZ
);
CREATE TABLE location_history (
  id BIGSERIAL PRIMARY KEY, driver_id UUID REFERENCES drivers(id),
  lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  speed REAL, recorded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_loc_history_driver ON location_history(driver_id, recorded_at DESC);
```

### Step 2: Build the WebSocket Server

The server handles three client types: drivers sending GPS updates, dispatchers viewing all activity, and customers tracking a single order.

```typescript
// server.ts -- WebSocket hub for real-time location streaming
import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const redis = createClient();
await redis.connect();

const dispatchers = new Set<WebSocket>();
const customerSockets = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const role = url.searchParams.get("role");
  const token = url.searchParams.get("token");

  if (role === "dispatcher") {
    dispatchers.add(ws);
    ws.on("close", () => dispatchers.delete(ws));
    sendAllDriverPositions(ws);
  }
  if (role === "customer" && token) {
    if (!customerSockets.has(token)) customerSockets.set(token, new Set());
    customerSockets.get(token)!.add(ws);
    ws.on("close", () => customerSockets.get(token)?.delete(ws));
  }
  if (role === "driver") {
    const driverId = url.searchParams.get("driverId");
    ws.on("message", async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "location")
        await handleDriverLocation(driverId!, msg.lat, msg.lng, msg.speed);
    });
  }
});
```

### Step 3: Handle Driver Location Updates

Each GPS ping flows through a pipeline: cache in Redis, persist to history (throttled to every 5th update), update the driver record, broadcast to dispatchers and customers, then evaluate geofences.

```typescript
async function handleDriverLocation(
  driverId: string, lat: number, lng: number, speed: number
) {
  // Cache in Redis for fast real-time lookups
  await redis.hSet(`driver:${driverId}`, {
    lat: String(lat), lng: String(lng),
    speed: String(speed), ts: String(Date.now()),
  });

  // Persist every 5th update to reduce DB writes by 80%
  const counter = await redis.incr(`driver:${driverId}:counter`);
  if (counter % 5 === 0) {
    await db.query(
      "INSERT INTO location_history (driver_id,lat,lng,speed) VALUES ($1,$2,$3,$4)",
      [driverId, lat, lng, speed]
    );
  }

  await db.query(
    "UPDATE drivers SET current_lat=$1, current_lng=$2, updated_at=now() WHERE id=$3",
    [lat, lng, driverId]
  );

  // Broadcast to all dispatcher dashboards
  const payload = JSON.stringify({ type: "driver_pos", driverId, lat, lng, speed });
  dispatchers.forEach(ws => ws.readyState === WebSocket.OPEN && ws.send(payload));

  // Broadcast to customers tracking this driver's orders
  const orders = await db.query(
    "SELECT tracking_token FROM orders WHERE driver_id=$1 AND status NOT IN ('delivered','pending')",
    [driverId]
  );
  for (const order of orders.rows) {
    const sockets = customerSockets.get(order.tracking_token);
    if (sockets?.size) {
      const msg = JSON.stringify({ type: "driver_pos", lat, lng });
      sockets.forEach(ws => ws.readyState === WebSocket.OPEN && ws.send(msg));
    }
  }

  await checkGeofences(driverId, lat, lng);
}
```

### Step 4: Build the Geofence Engine

Use the Haversine formula for distance and track enter/exit state per driver per fence so events fire only on transitions.

```typescript
const driverFenceState = new Map<string, Map<string, boolean>>();

// Haversine: distance in meters between two GPS coordinates
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2
    + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function checkGeofences(driverId: string, lat: number, lng: number) {
  if (!driverFenceState.has(driverId)) driverFenceState.set(driverId, new Map());
  const state = driverFenceState.get(driverId)!;

  const orders = await db.query(
    `SELECT o.id, o.status, o.tracking_token, o.customer_lat, o.customer_lng,
            r.lat AS r_lat, r.lng AS r_lng, r.geofence_radius
     FROM orders o JOIN restaurants r ON o.restaurant_id = r.id
     WHERE o.driver_id = $1 AND o.status IN ('assigned','to_restaurant','picked_up')`,
    [driverId]
  );

  for (const order of orders.rows) {
    // Restaurant geofence: auto-update status when driver arrives
    const distR = haversine(lat, lng, order.r_lat, order.r_lng);
    const rKey = `restaurant:${order.id}`;
    const atRestaurant = distR <= order.geofence_radius;
    if (atRestaurant && !(state.get(rKey) ?? false) && order.status === "assigned") {
      await db.query("UPDATE orders SET status='driver_at_restaurant' WHERE id=$1", [order.id]);
      notifyCustomer(order.tracking_token, {
        type: "status", status: "driver_at_restaurant",
        message: "Driver arrived at restaurant",
      });
    }
    state.set(rKey, atRestaurant);

    // Customer geofence (100m): send "driver nearby" alert
    if (order.status === "picked_up" && order.customer_lat) {
      const distC = haversine(lat, lng, order.customer_lat, order.customer_lng);
      const cKey = `customer:${order.id}`;
      const isNear = distC <= 100;
      if (isNear && !(state.get(cKey) ?? false)) {
        await db.query("UPDATE orders SET status='driver_nearby' WHERE id=$1", [order.id]);
        notifyCustomer(order.tracking_token, {
          type: "status", status: "driver_nearby", message: "Driver is nearby!",
        });
      }
      state.set(cKey, isNear);
    }
  }
}
```

### Step 5: Implement ETA Calculation

```typescript
async function calculateETA(
  driverLat: number, driverLng: number, destLat: number, destLng: number
): Promise<number> {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/` +
    `${driverLng},${driverLat};${destLng},${destLat}?overview=full&geometries=geojson`
  );
  const data = await res.json();
  return data.code === "Ok" ? Math.ceil(data.routes[0].duration / 60) : -1;
}

// Refresh ETAs for all active orders every 30 seconds
setInterval(async () => {
  const activeOrders = await db.query(
    `SELECT o.id, o.tracking_token, o.customer_lat, o.customer_lng, o.status,
            d.current_lat, d.current_lng, r.lat AS r_lat, r.lng AS r_lng
     FROM orders o JOIN drivers d ON o.driver_id = d.id
     LEFT JOIN restaurants r ON o.restaurant_id = r.id
     WHERE o.status IN ('assigned','driver_at_restaurant','picked_up')
       AND d.current_lat IS NOT NULL`
  );
  for (const order of activeOrders.rows) {
    const [destLat, destLng] = order.status === "assigned"
      ? [order.r_lat, order.r_lng]
      : [order.customer_lat, order.customer_lng];
    const eta = await calculateETA(order.current_lat, order.current_lng, destLat, destLng);
    if (eta > 0) {
      await db.query("UPDATE orders SET eta_minutes=$1 WHERE id=$2", [eta, order.id]);
      notifyCustomer(order.tracking_token, { type: "eta", minutes: eta });
    }
    await new Promise(r => setTimeout(r, 200)); // Throttle OSRM requests
  }
}, 30_000);
```

### Step 6: Add Multi-Stop Route Optimization

```typescript
async function optimizeDeliveryRoute(
  driverLat: number, driverLng: number,
  stops: { lat: number; lng: number; orderId: string }[]
) {
  const coords = [[driverLng, driverLat], ...stops.map(s => [s.lng, s.lat])];
  const waypoints = coords.map(c => c.join(",")).join(";");

  const res = await fetch(
    `https://router.project-osrm.org/trip/v1/driving/${waypoints}` +
    `?source=first&roundtrip=false&geometries=geojson`
  );
  const data = await res.json();
  if (data.code !== "Ok") return null;

  return {
    optimizedOrder: data.waypoints.slice(1).map(
      (w: any) => stops[w.waypoint_index - 1].orderId
    ),
    totalDistance: data.trips[0].distance,  // meters
    totalDuration: data.trips[0].duration,  // seconds
    geometry: data.trips[0].geometry,       // GeoJSON for map overlay
  };
}
```

### Step 7: Build the Customer Tracking Page

```html
<!DOCTYPE html>
<html>
<head>
  <title>Track Your Order</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9/dist/leaflet.css" />
  <style>
    #map { width: 100%; height: 70vh; }
    #eta { padding: 16px; font-size: 1.4em; text-align: center; background: #f0fdf4; }
    #status { padding: 12px; text-align: center; font-weight: bold; }
  </style>
</head>
<body>
  <div id="status">Connecting...</div>
  <div id="eta"></div>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9/dist/leaflet.js"></script>
  <script>
    const TOKEN = new URLSearchParams(location.search).get("t");
    const map = L.map("map").setView([0, 0], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    let driverMarker = null, routeLine = null;
    const ws = new WebSocket(`wss://${location.host}/ws?role=customer&token=${TOKEN}`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "driver_pos") {
        const pos = [msg.lat, msg.lng];
        if (!driverMarker) { driverMarker = L.marker(pos).addTo(map); map.setView(pos, 15); }
        else driverMarker.setLatLng(pos);
      }
      if (msg.type === "eta")
        document.getElementById("eta").textContent = `Estimated arrival: ${msg.minutes} min`;
      if (msg.type === "status") {
        document.getElementById("status").textContent = msg.message;
        if (msg.status === "driver_nearby")
          document.getElementById("status").style.background = "#dcfce7";
      }
      if (msg.type === "route") {
        if (routeLine) map.removeLayer(routeLine);
        routeLine = L.geoJSON(msg.geometry, {
          style: { color: "#3b82f6", weight: 4, opacity: 0.7 },
        }).addTo(map);
        map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
      }
    };
  </script>
</body>
</html>
```

### Step 8: Plan the Dispatcher Dashboard

The dispatcher dashboard connects with `role=dispatcher` to receive all driver updates. Color-coded markers (green=idle, yellow=en-route, blue=delivering) and red restaurant pins give full fleet visibility. Clicking a driver shows their assigned orders, route overlay, and status.

## Real-World Example

Nina's team deploys this for Denver, Boulder, and Fort Collins. During a Friday dinner rush with 80 concurrent deliveries:

1. **Driver Carlos** picks up 3 orders from Pasta Palace. The route optimizer sequences his stops to avoid backtracking across downtown, saving 12 minutes versus manual dispatch.

2. **Customer tracking** links go out via SMS. A customer watches Carlos move along I-25, ETA ticking from 18 to 3 minutes. When he enters the 100-meter geofence, the status flips to "Driver nearby" before he buzzes the intercom.

3. **Dispatcher Maria** sees Carlos's yellow marker turn blue automatically. She spots idle drivers in Boulder and reassigns orders to balance the load.

The stack runs on a single 4-core server handling 200 drivers at 5-second GPS intervals. Total mapping API cost: zero.
