---
name: maps-geolocation
description: >-
  Build location-based features with mapping APIs. Use when a user asks to
  integrate Google Maps, Mapbox, or Leaflet, implement geocoding and reverse
  geocoding, calculate routes and distances, build store locators, add
  interactive maps to web apps, implement geofencing, work with GeoJSON,
  build delivery tracking systems, optimize routes for fleets, display
  heatmaps, implement address autocomplete, or build any location-aware
  application. Covers Google Maps Platform, Mapbox, Leaflet, and
  OpenStreetMap/Nominatim.
license: Apache-2.0
compatibility: "Any language with HTTP client; JS/TS for frontend map rendering"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: geolocation
  tags: ["maps", "geolocation", "google-maps", "mapbox", "leaflet", "geocoding", "routing"]
---

# Maps & Geolocation

## Overview

Build location-based applications using mapping and geolocation APIs. This skill covers four major platforms — Google Maps Platform, Mapbox, Leaflet (open-source), and OpenStreetMap/Nominatim (free) — for geocoding, routing, interactive maps, geofencing, heatmaps, store locators, fleet tracking, and address autocomplete. Choose based on budget: Google Maps for full-featured commercial use, Mapbox for custom styling, Leaflet+OSM for zero-cost self-hosted solutions.

## Instructions

### Step 1: Platform Selection & Setup

**Google Maps Platform** (pay-per-use, $200/month free credit):
```bash
# Get API key: https://console.cloud.google.com/apis/credentials
# Enable: Maps JavaScript API, Geocoding API, Directions API, Places API, Distance Matrix API
export GOOGLE_MAPS_API_KEY="AIzaSy..."
```

**Mapbox** (50,000 free map loads/month):
```bash
# Get token: https://account.mapbox.com/access-tokens/
export MAPBOX_ACCESS_TOKEN="pk.eyJ1..."
```

**Leaflet + OpenStreetMap** (completely free, no API key):
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9/dist/leaflet.js"></script>
```

**Nominatim** (free geocoding, rate-limited to 1 req/sec):
```bash
# No API key needed
curl "https://nominatim.openstreetmap.org/search?q=Berlin&format=json&limit=1"
```

### Step 2: Geocoding & Reverse Geocoding

Convert addresses to coordinates and back.

**Google Geocoding API:**
```typescript
async function geocode(address: string) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
  );
  const data = await res.json();
  if (data.status !== "OK") throw new Error(`Geocoding failed: ${data.status}`);
  
  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formatted: result.formatted_address,
    placeId: result.place_id,
    components: result.address_components,
  };
}

// Reverse geocoding
async function reverseGeocode(lat: number, lng: number) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
  );
  const data = await res.json();
  return data.results[0]?.formatted_address;
}
```

**Mapbox Geocoding:**
```typescript
async function mapboxGeocode(query: string) {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5`
  );
  const data = await res.json();
  return data.features.map((f: any) => ({
    name: f.place_name,
    lng: f.center[0],
    lat: f.center[1],
    type: f.place_type[0],
  }));
}
```

**Nominatim (free, no key):**
```typescript
async function nominatimGeocode(query: string) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
    { headers: { "User-Agent": "MyApp/1.0 (contact@myapp.com)" } }  // Required by Nominatim TOS
  );
  return res.json();
}

async function nominatimReverse(lat: number, lng: number) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
    { headers: { "User-Agent": "MyApp/1.0" } }
  );
  return res.json();
}
```

**Batch geocoding** (for large datasets):
```typescript
async function batchGeocode(addresses: string[], delayMs = 100) {
  const results = [];
  for (const addr of addresses) {
    try {
      const result = await geocode(addr);
      results.push({ address: addr, ...result, error: null });
    } catch (err) {
      results.push({ address: addr, lat: null, lng: null, error: err.message });
    }
    await new Promise(r => setTimeout(r, delayMs));  // Rate limiting
  }
  return results;
}
```

### Step 3: Interactive Maps — Frontend

**Google Maps JavaScript API:**
```html
<div id="map" style="width:100%; height:500px;"></div>
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&callback=initMap" async defer></script>
<script>
function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 48.8566, lng: 2.3522 },
    zoom: 12,
    mapTypeControl: true,
    streetViewControl: false,
  });

  // Add marker
  const marker = new google.maps.Marker({
    position: { lat: 48.8584, lng: 2.2945 },
    map,
    title: "Eiffel Tower",
    icon: {
      url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    },
  });

  // Info window on click
  const infoWindow = new google.maps.InfoWindow({
    content: "<h3>Eiffel Tower</h3><p>Paris, France</p>",
  });
  marker.addListener("click", () => infoWindow.open(map, marker));

  // Draw a circle (radius in meters)
  new google.maps.Circle({
    map,
    center: { lat: 48.8566, lng: 2.3522 },
    radius: 2000,
    strokeColor: "#3b82f6",
    fillColor: "#3b82f6",
    fillOpacity: 0.15,
  });
}
</script>
```

**Leaflet + OpenStreetMap (free):**
```html
<div id="map" style="width:100%; height:500px;"></div>
<script>
const map = L.map("map").setView([48.8566, 2.3522], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

// Marker with popup
L.marker([48.8584, 2.2945])
  .addTo(map)
  .bindPopup("<b>Eiffel Tower</b><br>Paris, France")
  .openPopup();

// Circle
L.circle([48.8566, 2.3522], {
  radius: 2000,
  color: "#3b82f6",
  fillOpacity: 0.15,
}).addTo(map);

// GeoJSON layer
fetch("/data/zones.geojson")
  .then(r => r.json())
  .then(data => {
    L.geoJSON(data, {
      style: { color: "#ef4444", weight: 2, fillOpacity: 0.1 },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(feature.properties.name);
      },
    }).addTo(map);
  });
</script>
```

**Mapbox GL JS (vector tiles, custom styles):**
```html
<link href="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v3.0.0/mapbox-gl.js"></script>
<div id="map" style="width:100%; height:500px;"></div>
<script>
mapboxgl.accessToken = "pk.eyJ1...";
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [2.3522, 48.8566],
  zoom: 12,
});

// Marker
new mapboxgl.Marker({ color: "#ef4444" })
  .setLngLat([2.2945, 48.8584])
  .setPopup(new mapboxgl.Popup().setHTML("<h3>Eiffel Tower</h3>"))
  .addTo(map);

// Add GeoJSON source + layer after load
map.on("load", () => {
  map.addSource("zones", {
    type: "geojson",
    data: "/data/zones.geojson",
  });
  map.addLayer({
    id: "zones-fill",
    type: "fill",
    source: "zones",
    paint: { "fill-color": "#3b82f6", "fill-opacity": 0.2 },
  });
  map.addLayer({
    id: "zones-border",
    type: "line",
    source: "zones",
    paint: { "line-color": "#3b82f6", "line-width": 2 },
  });
});

// Navigation controls
map.addControl(new mapboxgl.NavigationControl());
map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }));
</script>
```

### Step 4: Routing & Directions

**Google Directions API:**
```typescript
async function getRoute(origin: string, destination: string, mode = "driving") {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?` +
    `origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}` +
    `&mode=${mode}&alternatives=true&key=${GOOGLE_MAPS_API_KEY}`
  );
  const data = await res.json();
  if (data.status !== "OK") throw new Error(data.status);
  
  return data.routes.map((route: any) => ({
    summary: route.summary,
    distance: route.legs[0].distance.text,
    duration: route.legs[0].duration.text,
    durationSeconds: route.legs[0].duration.value,
    steps: route.legs[0].steps.map((s: any) => ({
      instruction: s.html_instructions.replace(/<[^>]*>/g, ""),
      distance: s.distance.text,
      duration: s.duration.text,
    })),
    polyline: route.overview_polyline.points,
  }));
}
```

**Google Distance Matrix** (many-to-many distances):
```typescript
async function distanceMatrix(origins: string[], destinations: string[]) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/distancematrix/json?` +
    `origins=${origins.map(encodeURIComponent).join("|")}` +
    `&destinations=${destinations.map(encodeURIComponent).join("|")}` +
    `&key=${GOOGLE_MAPS_API_KEY}`
  );
  const data = await res.json();
  
  const matrix: any[][] = [];
  data.rows.forEach((row: any, i: number) => {
    matrix[i] = row.elements.map((el: any, j: number) => ({
      origin: data.origin_addresses[i],
      destination: data.destination_addresses[j],
      distance: el.distance?.text,
      distanceMeters: el.distance?.value,
      duration: el.duration?.text,
      durationSeconds: el.duration?.value,
    }));
  });
  return matrix;
}
```

**Mapbox Directions:**
```typescript
async function mapboxRoute(coords: [number, number][]) {
  // coords = [[lng, lat], [lng, lat], ...]
  const waypoints = coords.map(c => c.join(",")).join(";");
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?` +
    `geometries=geojson&steps=true&overview=full&access_token=${MAPBOX_TOKEN}`
  );
  const data = await res.json();
  return data.routes[0];
}
```

**OSRM (free, self-hosted or public demo):**
```typescript
async function osrmRoute(coords: [number, number][]) {
  const waypoints = coords.map(c => c.join(",")).join(";");
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=true`
  );
  const data = await res.json();
  return {
    distance: data.routes[0].distance,  // meters
    duration: data.routes[0].duration,  // seconds
    geometry: data.routes[0].geometry,
  };
}
```

### Step 5: Places & Address Autocomplete

**Google Places Autocomplete:**
```html
<input id="address" type="text" placeholder="Start typing an address..." style="width:400px; padding:8px;">
<script>
function initAutocomplete() {
  const input = document.getElementById("address");
  const autocomplete = new google.maps.places.Autocomplete(input, {
    types: ["address"],
    componentRestrictions: { country: ["us", "de", "fr"] },
    fields: ["place_id", "geometry", "formatted_address", "address_components"],
  });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    console.log("Selected:", place.formatted_address);
    console.log("Coords:", place.geometry.location.lat(), place.geometry.location.lng());
    console.log("Components:", place.address_components);
  });
}
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=places&callback=initAutocomplete" async defer></script>
```

**Google Places Nearby Search:**
```typescript
async function nearbySearch(lat: number, lng: number, type: string, radius = 5000) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
    `location=${lat},${lng}&radius=${radius}&type=${type}&key=${GOOGLE_MAPS_API_KEY}`
  );
  const data = await res.json();
  return data.results.map((p: any) => ({
    name: p.name,
    address: p.vicinity,
    lat: p.geometry.location.lat,
    lng: p.geometry.location.lng,
    rating: p.rating,
    totalRatings: p.user_ratings_total,
    placeId: p.place_id,
    types: p.types,
    openNow: p.opening_hours?.open_now,
  }));
}

// Example: find restaurants near a location
const restaurants = await nearbySearch(48.8566, 2.3522, "restaurant", 1000);
```

**Mapbox Geocoding with autocomplete:**
```typescript
async function mapboxAutocomplete(query: string, proximity?: [number, number]) {
  let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
    `autocomplete=true&limit=5&access_token=${MAPBOX_TOKEN}`;
  if (proximity) url += `&proximity=${proximity.join(",")}`;
  
  const res = await fetch(url);
  const data = await res.json();
  return data.features;
}
```

### Step 6: Geofencing

Detect when a point enters or exits a defined area.

**Point-in-polygon check:**
```typescript
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Haversine distance (meters)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Circular geofence
function isInRadius(point: [number, number], center: [number, number], radiusMeters: number): boolean {
  return haversineDistance(point[0], point[1], center[0], center[1]) <= radiusMeters;
}
```

**Geofence monitoring system:**
```typescript
interface Geofence {
  id: string;
  name: string;
  type: "circle" | "polygon";
  center?: [number, number];
  radius?: number;
  polygon?: [number, number][];
}

class GeofenceMonitor {
  private fences: Geofence[] = [];
  private states: Map<string, Map<string, boolean>> = new Map(); // entityId → fenceId → inside

  addFence(fence: Geofence) {
    this.fences.push(fence);
  }

  checkPosition(entityId: string, lat: number, lng: number) {
    if (!this.states.has(entityId)) this.states.set(entityId, new Map());
    const entityState = this.states.get(entityId)!;
    const events: { type: "enter" | "exit"; fence: Geofence }[] = [];

    for (const fence of this.fences) {
      let inside = false;
      if (fence.type === "circle") {
        inside = isInRadius([lat, lng], fence.center!, fence.radius!);
      } else {
        inside = pointInPolygon([lat, lng], fence.polygon!);
      }

      const wasInside = entityState.get(fence.id) ?? false;
      if (inside && !wasInside) events.push({ type: "enter", fence });
      if (!inside && wasInside) events.push({ type: "exit", fence });
      entityState.set(fence.id, inside);
    }
    return events;
  }
}

// Usage
const monitor = new GeofenceMonitor();
monitor.addFence({
  id: "office",
  name: "Office Zone",
  type: "circle",
  center: [48.8566, 2.3522],
  radius: 200,
});

const events = monitor.checkPosition("driver-1", 48.8570, 2.3530);
events.forEach(e => console.log(`Driver entered ${e.fence.name}`));
```

### Step 7: Heatmaps & Data Visualization

**Google Maps Heatmap:**
```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=visualization&callback=initMap" async defer></script>
<script>
function initMap() {
  const map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 48.8566, lng: 2.3522 },
    zoom: 13,
  });

  const heatmapData = [
    { location: new google.maps.LatLng(48.8584, 2.2945), weight: 10 },
    { location: new google.maps.LatLng(48.8606, 2.3376), weight: 8 },
    { location: new google.maps.LatLng(48.8530, 2.3499), weight: 6 },
    // ... hundreds/thousands of data points
  ];

  new google.maps.visualization.HeatmapLayer({
    data: heatmapData,
    map,
    radius: 40,
    opacity: 0.7,
    gradient: [
      "rgba(0, 255, 255, 0)",
      "rgba(0, 255, 255, 1)",
      "rgba(0, 191, 255, 1)",
      "rgba(0, 127, 255, 1)",
      "rgba(0, 63, 255, 1)",
      "rgba(0, 0, 255, 1)",
      "rgba(0, 0, 223, 1)",
      "rgba(0, 0, 191, 1)",
      "rgba(0, 0, 159, 1)",
      "rgba(63, 0, 91, 1)",
      "rgba(127, 0, 63, 1)",
      "rgba(191, 0, 31, 1)",
      "rgba(255, 0, 0, 1)",
    ],
  });
}
</script>
```

**Leaflet heatmap:**
```html
<script src="https://unpkg.com/leaflet.heat/dist/leaflet-heat.js"></script>
<script>
const heat = L.heatLayer([
  [48.8584, 2.2945, 1.0],  // [lat, lng, intensity]
  [48.8606, 2.3376, 0.8],
  [48.8530, 2.3499, 0.6],
], { radius: 25, blur: 15, maxZoom: 17 }).addTo(map);
</script>
```

**Marker clustering** (for large datasets):
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster/dist/MarkerCluster.css" />
<script src="https://unpkg.com/leaflet.markercluster/dist/leaflet.markercluster.js"></script>
<script>
const markers = L.markerClusterGroup();

locations.forEach(loc => {
  markers.addLayer(
    L.marker([loc.lat, loc.lng]).bindPopup(loc.name)
  );
});

map.addLayer(markers);
</script>
```

### Step 8: Store Locator

**Full store locator backend:**
```typescript
interface Store {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  hours?: string;
  tags?: string[];
}

// Find stores within radius using Haversine SQL (PostgreSQL + PostGIS)
const FIND_NEARBY_SQL = `
  SELECT id, name, address, lat, lng, phone, hours,
    ST_DistanceSphere(
      ST_MakePoint(lng, lat),
      ST_MakePoint($1, $2)
    ) AS distance_meters
  FROM stores
  WHERE ST_DWithin(
    ST_MakePoint(lng, lat)::geography,
    ST_MakePoint($1, $2)::geography,
    $3  -- radius in meters
  )
  ORDER BY distance_meters
  LIMIT $4;
`;

// Without PostGIS — Haversine approximation
const FIND_NEARBY_APPROX = `
  SELECT *, (
    6371000 * acos(
      cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2))
      + sin(radians($1)) * sin(radians(lat))
    )
  ) AS distance_meters
  FROM stores
  HAVING distance_meters < $3
  ORDER BY distance_meters
  LIMIT $4;
`;

// API endpoint
app.get("/api/stores/nearby", async (req, res) => {
  const { lat, lng, radius = 10000, limit = 20 } = req.query;
  const stores = await db.query(FIND_NEARBY_SQL, [
    parseFloat(lng as string),
    parseFloat(lat as string),
    parseInt(radius as string),
    parseInt(limit as string),
  ]);
  res.json(stores.rows);
});
```

### Step 9: GeoJSON Operations

**Create and manipulate GeoJSON:**
```typescript
// Point
const point = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [2.3522, 48.8566] },
  properties: { name: "Paris", population: 2161000 },
};

// Polygon (delivery zone)
const zone = {
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [[
      [2.30, 48.83], [2.40, 48.83], [2.40, 48.88],
      [2.30, 48.88], [2.30, 48.83],  // Close the ring
    ]],
  },
  properties: { name: "Central Paris", fee: 5.0 },
};

// FeatureCollection
const collection = {
  type: "FeatureCollection",
  features: [point, zone],
};

// With Turf.js for advanced operations
import * as turf from "@turf/turf";

// Buffer around a point (5km radius)
const buffered = turf.buffer(point, 5, { units: "kilometers" });

// Centroid of polygon
const centroid = turf.centroid(zone);

// Area of polygon (m²)
const area = turf.area(zone);

// Check if point is inside polygon
const isInside = turf.booleanPointInPolygon(
  turf.point([2.35, 48.85]),
  zone
);

// Bounding box
const bbox = turf.bbox(collection);  // [minLng, minLat, maxLng, maxLat]
```

### Step 10: Fleet Tracking & Route Optimization

**Real-time tracking with WebSocket:**
```typescript
// Server (Express + ws)
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });
const drivers: Map<string, { lat: number; lng: number; updatedAt: Date }> = new Map();

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    
    if (msg.type === "location_update") {
      drivers.set(msg.driverId, {
        lat: msg.lat,
        lng: msg.lng,
        updatedAt: new Date(),
      });
      // Broadcast to all dashboard clients
      wss.clients.forEach(client => {
        client.send(JSON.stringify({
          type: "driver_position",
          driverId: msg.driverId,
          lat: msg.lat,
          lng: msg.lng,
        }));
      });
    }
  });
});
```

**Route optimization** (Travelling Salesman approximation):
```typescript
// Google Routes API — optimized waypoint order
async function optimizeRoute(origin: string, destination: string, waypoints: string[]) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?` +
    `origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&waypoints=optimize:true|${waypoints.map(encodeURIComponent).join("|")}` +
    `&key=${GOOGLE_MAPS_API_KEY}`
  );
  const data = await res.json();
  const route = data.routes[0];
  
  return {
    optimizedOrder: route.waypoint_order,
    totalDistance: route.legs.reduce((s: number, l: any) => s + l.distance.value, 0),
    totalDuration: route.legs.reduce((s: number, l: any) => s + l.duration.value, 0),
    legs: route.legs.map((l: any) => ({
      from: l.start_address,
      to: l.end_address,
      distance: l.distance.text,
      duration: l.duration.text,
    })),
  };
}

// Example: optimize delivery route with 8 stops
const optimized = await optimizeRoute(
  "Warehouse, Berlin",
  "Warehouse, Berlin",  // Return to start
  [
    "Alexanderplatz, Berlin",
    "Potsdamer Platz, Berlin",
    "Charlottenburg, Berlin",
    "Kreuzberg, Berlin",
    "Prenzlauer Berg, Berlin",
    "Friedrichshain, Berlin",
    "Schöneberg, Berlin",
    "Neukölln, Berlin",
  ]
);
console.log("Optimal order:", optimized.optimizedOrder);
console.log("Total:", optimized.totalDistance / 1000, "km,", optimized.totalDuration / 60, "min");
```

**Mapbox Optimization API:**
```typescript
async function mapboxOptimize(coords: [number, number][]) {
  const waypoints = coords.map(c => c.join(",")).join(";");
  const res = await fetch(
    `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${waypoints}?` +
    `roundtrip=true&source=first&destination=last&access_token=${MAPBOX_TOKEN}`
  );
  const data = await res.json();
  return {
    waypoints: data.waypoints.map((w: any) => w.waypoint_index),
    distance: data.trips[0].distance,
    duration: data.trips[0].duration,
    geometry: data.trips[0].geometry,
  };
}
```
