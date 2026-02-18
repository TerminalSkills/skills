---
title: Build a Delivery Tracking System with Maps
slug: build-delivery-tracking-with-maps
description: "Build a real-time delivery tracking system with live driver positions, optimized multi-stop routing, geofence alerts, and ETA calculations using Google Maps, Mapbox, and WebSockets."
category: geolocation
skills: [maps-geolocation]
tags: [maps, geolocation, websocket, realtime, routing, delivery]
---

# Build a Delivery Tracking System with Maps

Nina runs engineering at a food delivery startup operating in three cities. Customers complain they can't see where their order is, dispatchers have no visibility into driver locations, and route planning is done manually. Nina needs a real-time delivery tracking system — live driver positions on a map, optimized routes for multi-stop deliveries, geofence alerts when drivers arrive at restaurants or customers, and an ETA engine.

## Prompt

```text
I need to build a delivery tracking system for our food delivery platform. We have ~200 active drivers, ~50 restaurants, and serve 3 cities. Here's what I need:

1. **Real-time driver tracking**: Drivers send GPS updates every 5 seconds from the mobile app. Show their live position on a map dashboard for dispatchers. Use WebSockets for low-latency updates. Store the last 24 hours of location history.

2. **Customer-facing tracking**: When a customer places an order, they get a tracking page showing the driver's live position on a map, the route from restaurant to their address, and a live ETA that updates as the driver moves.

3. **Route optimization**: When a driver has multiple deliveries, optimize the stop order to minimize total distance/time. Use Google Directions API with waypoint optimization.

4. **Geofencing**: Define geofences around each restaurant (200m radius) and each delivery address (100m radius). Trigger events when a driver enters — auto-update order status to "Driver arrived at restaurant" or "Driver nearby".

5. **ETA calculation**: Calculate initial ETA when order is assigned, then update every 30 seconds based on driver's actual position and remaining route.

6. **Dispatcher dashboard**: Interactive map showing all active drivers (color-coded by status: idle=green, en-route-to-restaurant=yellow, delivering=blue), restaurant locations, and active orders. Click a driver to see their current route and assigned orders.

Use Leaflet with OpenStreetMap (free) for maps, OSRM for routing, WebSocket for real-time, and Node.js backend. No Google Maps billing.

Give me the full backend architecture, WebSocket handler, geofence engine, and frontend map components.
```

## Agent Response

```text
Here's the complete system. I'll use Leaflet + OpenStreetMap (zero cost), OSRM for routing (free public API or self-hosted), and WebSocket for real-time.

## Architecture

driver-app → WebSocket → Node.js server → Redis (location cache)
                                        → PostgreSQL (history, orders)
                                        → WebSocket → dispatcher dashboard
                                        → WebSocket → customer tracking page
                                        → OSRM API → routes & ETAs

## Database Schema (PostgreSQL)

CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'offline', -- offline, idle, to_restaurant, delivering
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geofence_radius INT DEFAULT 200 -- meters
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  customer_address TEXT,
  customer_lat DOUBLE PRECISION,
  customer_lng DOUBLE PRECISION,
  restaurant_id UUID REFERENCES restaurants(id),
  driver_id UUID REFERENCES drivers(id),
  status TEXT DEFAULT 'pending', -- pending, assigned, driver_at_restaurant, picked_up, driver_nearby, delivered
  tracking_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  eta_minutes INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE TABLE location_history (
  id BIGSERIAL PRIMARY KEY,
  driver_id UUID REFERENCES drivers(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed REAL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_location_history_driver_time ON location_history(driver_id, recorded_at DESC);

-- Auto-delete history older than 24 hours (pg_cron or application-level)

## WebSocket Server (server.ts)

import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const redis = createClient();
await redis.connect();

// Connected clients by role
const dispatchers = new Set<WebSocket>();
const customerSockets = new Map<string, Set<WebSocket>>(); // trackingToken → sockets

wss.on("connection", (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const role = url.searchParams.get("role"); // driver, dispatcher, customer
  const token = url.searchParams.get("token"); // tracking token for customers

  if (role === "dispatcher") {
    dispatchers.add(ws);
    ws.on("close", () => dispatchers.delete(ws));
    // Send current state of all drivers
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
      if (msg.type === "location") {
        await handleDriverLocation(driverId!, msg.lat, msg.lng, msg.speed);
      }
    });
  }
});

async function handleDriverLocation(driverId: string, lat: number, lng: number, speed: number) {
  // Update Redis (fast reads for real-time)
  await redis.hSet(`driver:${driverId}`, { lat: String(lat), lng: String(lng), speed: String(speed), ts: String(Date.now()) });

  // Store in history (every 5th update to reduce DB writes)
  const counter = await redis.incr(`driver:${driverId}:counter`);
  if (counter % 5 === 0) {
    await db.query(
      "INSERT INTO location_history (driver_id, lat, lng, speed) VALUES ($1, $2, $3, $4)",
      [driverId, lat, lng, speed]
    );
  }

  // Update driver record
  await db.query(
    "UPDATE drivers SET current_lat=$1, current_lng=$2, updated_at=now() WHERE id=$3",
    [lat, lng, driverId]
  );

  // Broadcast to dispatchers
  const payload = JSON.stringify({ type: "driver_pos", driverId, lat, lng, speed });
  dispatchers.forEach(ws => ws.readyState === WebSocket.OPEN && ws.send(payload));

  // Broadcast to customers tracking this driver
  const orders = await db.query(
    "SELECT tracking_token, customer_lat, customer_lng, restaurant_id FROM orders WHERE driver_id=$1 AND status NOT IN ('delivered', 'pending')",
    [driverId]
  );
  for (const order of orders.rows) {
    const sockets = customerSockets.get(order.tracking_token);
    if (sockets?.size) {
      const msg = JSON.stringify({ type: "driver_pos", lat, lng });
      sockets.forEach(ws => ws.readyState === WebSocket.OPEN && ws.send(msg));
    }
  }

  // Check geofences
  await checkGeofences(driverId, lat, lng);
}

## Geofence Engine

const driverFenceState = new Map<string, Map<string, boolean>>();

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function checkGeofences(driverId: string, lat: number, lng: number) {
  if (!driverFenceState.has(driverId)) driverFenceState.set(driverId, new Map());
  const state = driverFenceState.get(driverId)!;

  // Check restaurant geofences for active orders
  const orders = await db.query(
    `SELECT o.id, o.status, o.tracking_token, o.customer_lat, o.customer_lng,
            r.lat as r_lat, r.lng as r_lng, r.geofence_radius, r.name as r_name
     FROM orders o JOIN restaurants r ON o.restaurant_id = r.id
     WHERE o.driver_id = $1 AND o.status IN ('assigned', 'to_restaurant', 'picked_up')`,
    [driverId]
  );

  for (const order of orders.rows) {
    // Restaurant geofence
    const distToRestaurant = haversine(lat, lng, order.r_lat, order.r_lng);
    const restaurantKey = `restaurant:${order.id}`;
    const wasAtRestaurant = state.get(restaurantKey) ?? false;
    const atRestaurant = distToRestaurant <= order.geofence_radius;

    if (atRestaurant && !wasAtRestaurant && order.status === 'assigned') {
      await db.query("UPDATE orders SET status='driver_at_restaurant' WHERE id=$1", [order.id]);
      notifyCustomer(order.tracking_token, { type: "status", status: "driver_at_restaurant", message: "Driver arrived at restaurant" });
    }
    state.set(restaurantKey, atRestaurant);

    // Customer geofence (100m)
    if (order.status === 'picked_up' && order.customer_lat) {
      const distToCustomer = haversine(lat, lng, order.customer_lat, order.customer_lng);
      const customerKey = `customer:${order.id}`;
      const wasNearCustomer = state.get(customerKey) ?? false;
      const nearCustomer = distToCustomer <= 100;

      if (nearCustomer && !wasNearCustomer) {
        await db.query("UPDATE orders SET status='driver_nearby' WHERE id=$1", [order.id]);
        notifyCustomer(order.tracking_token, { type: "status", status: "driver_nearby", message: "Driver is nearby!" });
      }
      state.set(customerKey, nearCustomer);
    }
  }
}

function notifyCustomer(token: string, data: any) {
  const sockets = customerSockets.get(token);
  if (sockets) {
    const msg = JSON.stringify(data);
    sockets.forEach(ws => ws.readyState === WebSocket.OPEN && ws.send(msg));
  }
}

## ETA Engine

async function calculateETA(driverLat: number, driverLng: number, destLat: number, destLng: number): Promise<number> {
  // OSRM free routing
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${destLng},${destLat}?overview=full&geometries=geojson`
  );
  const data = await res.json();
  if (data.code !== "Ok") return -1;
  
  return Math.ceil(data.routes[0].duration / 60); // minutes
}

// Update ETAs every 30 seconds
setInterval(async () => {
  const activeOrders = await db.query(
    `SELECT o.id, o.tracking_token, o.customer_lat, o.customer_lng, o.status,
            d.current_lat, d.current_lng, r.lat as r_lat, r.lng as r_lng
     FROM orders o
     JOIN drivers d ON o.driver_id = d.id
     LEFT JOIN restaurants r ON o.restaurant_id = r.id
     WHERE o.status IN ('assigned', 'driver_at_restaurant', 'picked_up')
       AND d.current_lat IS NOT NULL`
  );

  for (const order of activeOrders.rows) {
    let destLat, destLng;
    if (order.status === 'assigned') {
      destLat = order.r_lat; destLng = order.r_lng; // ETA to restaurant
    } else {
      destLat = order.customer_lat; destLng = order.customer_lng; // ETA to customer
    }

    const eta = await calculateETA(order.current_lat, order.current_lng, destLat, destLng);
    if (eta > 0) {
      await db.query("UPDATE orders SET eta_minutes=$1 WHERE id=$2", [eta, order.id]);
      notifyCustomer(order.tracking_token, { type: "eta", minutes: eta });
    }

    // Rate limit OSRM calls
    await new Promise(r => setTimeout(r, 200));
  }
}, 30000);

## Route Optimization (multi-stop)

async function optimizeDeliveryRoute(driverLat: number, driverLng: number, stops: {lat: number, lng: number, orderId: string}[]) {
  // Build waypoints: driver → stop1 → stop2 → ... → stopN
  const coords = [
    [driverLng, driverLat],
    ...stops.map(s => [s.lng, s.lat]),
  ];
  
  const waypoints = coords.map(c => c.join(",")).join(";");
  const res = await fetch(
    `https://router.project-osrm.org/trip/v1/driving/${waypoints}?source=first&roundtrip=false&geometries=geojson`
  );
  const data = await res.json();

  if (data.code !== "Ok") return null;

  return {
    optimizedOrder: data.waypoints.slice(1).map((w: any) => stops[w.waypoint_index - 1].orderId),
    totalDistance: data.trips[0].distance, // meters
    totalDuration: data.trips[0].duration, // seconds
    geometry: data.trips[0].geometry,
  };
}

## Customer Tracking Page (Leaflet)

<!-- tracking.html -->
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

    const driverIcon = L.divIcon({
      html: "🛵",
      className: "driver-icon",
      iconSize: [30, 30],
    });
    
    let driverMarker = null;
    let routeLine = null;

    const ws = new WebSocket(`wss://${location.host}/ws?role=customer&token=${TOKEN}`);
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "driver_pos") {
        const pos = [msg.lat, msg.lng];
        if (!driverMarker) {
          driverMarker = L.marker(pos, { icon: driverIcon }).addTo(map);
          map.setView(pos, 15);
        } else {
          driverMarker.setLatLng(pos);
        }
      }

      if (msg.type === "eta") {
        document.getElementById("eta").textContent = `Estimated arrival: ${msg.minutes} min`;
      }

      if (msg.type === "status") {
        document.getElementById("status").textContent = msg.message;
        if (msg.status === "driver_nearby") {
          document.getElementById("status").style.background = "#dcfce7";
        }
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

## Dispatcher Dashboard (Leaflet)

The dispatcher sees all drivers color-coded, restaurants as markers, and can click any driver to see their route and assigned orders. Same Leaflet setup but with:
- Green markers for idle drivers
- Yellow for en-route-to-restaurant
- Blue for delivering
- Red pins for restaurants
- Click handler to show driver info panel with assigned orders and route overlay

The WebSocket connection uses `role=dispatcher` and receives all driver position updates to move markers in real-time.

---

That's the complete system: WebSocket-based real-time tracking, OSRM-powered routing and ETAs (zero cost), geofence engine for automatic status updates, route optimization for multi-stop deliveries, customer tracking page, and dispatcher dashboard. All built on free/open-source tools — no Google Maps billing.
```

Skills used: `maps-geolocation`, `websocket-builder`
