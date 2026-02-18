---
name: maps-geolocation
description: >-
  Build location-based features with mapping APIs. Use when a user asks to
  integrate Google Maps, Mapbox, or Leaflet, implement geocoding and reverse
  geocoding, calculate routes and distances, build store locators, add
  interactive maps to web apps, implement geofencing, work with GeoJSON, build
  delivery tracking systems, optimize routes for fleets, display heatmaps,
  implement address autocomplete, or build any location-aware application.
  Covers Google Maps Platform, Mapbox, Leaflet, and OpenStreetMap/Nominatim.
license: Apache-2.0
compatibility: Any language with HTTP client; JS/TS for frontend map rendering
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - maps
    - geolocation
    - google-maps
    - mapbox
    - leaflet
---

# Maps & Geolocation

## Overview

Build location-based applications using mapping and geolocation APIs. This skill covers four major platforms — Google Maps Platform, Mapbox, Leaflet (open-source), and OpenStreetMap/Nominatim (free) — for geocoding, routing, interactive maps, geofencing, heatmaps, store locators, fleet tracking, and address autocomplete. Choose based on budget: Google Maps for full-featured commercial use, Mapbox for custom styling, Leaflet+OSM for zero-cost self-hosted solutions.

## Instructions

### Step 1: Platform Selection & Setup

**Google Maps Platform** ($200/month free credit):
```bash
# Enable: Maps JS API, Geocoding API, Directions API, Places API, Distance Matrix API
export GOOGLE_MAPS_API_KEY="AIzaSy..."
```

**Mapbox** (50,000 free map loads/month):
```bash
export MAPBOX_ACCESS_TOKEN="pk.eyJ1..."
```

**Leaflet + OpenStreetMap** (completely free, no API key):
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9/dist/leaflet.js"></script>
```

**Nominatim** (free geocoding, 1 req/sec rate limit, no key needed).

### Step 2: Geocoding & Reverse Geocoding

```typescript
// Google Geocoding
async function geocode(address: string) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`
  );
  const data = await res.json();
  const r = data.results[0];
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address };
}

// Nominatim (free, no key — requires User-Agent header per TOS)
async function nominatimGeocode(query: string) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
    { headers: { "User-Agent": "MyApp/1.0 (contact@myapp.com)" } }
  );
  return res.json();
}

// Batch geocoding with rate limiting
async function batchGeocode(addresses: string[], delayMs = 100) {
  const results = [];
  for (const addr of addresses) {
    try { results.push({ address: addr, ...await geocode(addr) }); }
    catch (err) { results.push({ address: addr, lat: null, lng: null, error: err.message }); }
    await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}
```

### Step 3: Interactive Maps

**Leaflet + OpenStreetMap (free):**
```javascript
const map = L.map("map").setView([48.8566, 2.3522], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

L.marker([48.8584, 2.2945]).addTo(map)
  .bindPopup("<b>Eiffel Tower</b><br>Paris, France").openPopup();

// Load GeoJSON layer
fetch("/data/zones.geojson").then(r => r.json()).then(data => {
  L.geoJSON(data, {
    style: { color: "#ef4444", weight: 2, fillOpacity: 0.1 },
    onEachFeature: (feature, layer) => layer.bindPopup(feature.properties.name),
  }).addTo(map);
});
```

**Mapbox GL JS** (vector tiles, custom styles):
```javascript
mapboxgl.accessToken = "pk.eyJ1...";
const map = new mapboxgl.Map({
  container: "map", style: "mapbox://styles/mapbox/streets-v12",
  center: [2.3522, 48.8566], zoom: 12,
});
new mapboxgl.Marker({ color: "#ef4444" })
  .setLngLat([2.2945, 48.8584])
  .setPopup(new mapboxgl.Popup().setHTML("<h3>Eiffel Tower</h3>"))
  .addTo(map);
map.addControl(new mapboxgl.NavigationControl());
```

### Step 4: Routing & Distance Matrix

```typescript
// Google Directions
async function getRoute(origin: string, destination: string, mode = "driving") {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${API_KEY}`
  );
  const data = await res.json();
  const leg = data.routes[0].legs[0];
  return { distance: leg.distance.text, duration: leg.duration.text, polyline: data.routes[0].overview_polyline.points };
}

// Distance Matrix (many-to-many)
async function distanceMatrix(origins: string[], destinations: string[]) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins.map(encodeURIComponent).join("|")}&destinations=${destinations.map(encodeURIComponent).join("|")}&key=${API_KEY}`
  );
  return res.json();
}

// OSRM (free, no key)
async function osrmRoute(coords: [number, number][]) {
  const wp = coords.map(c => c.join(",")).join(";");
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${wp}?overview=full&geometries=geojson`);
  const data = await res.json();
  return { distance: data.routes[0].distance, duration: data.routes[0].duration, geometry: data.routes[0].geometry };
}
```

### Step 5: Geofencing & Utilities

```typescript
// Haversine distance (meters)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Point-in-polygon check
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Circular geofence check
function isInRadius(point: [number, number], center: [number, number], radiusMeters: number): boolean {
  return haversineDistance(point[0], point[1], center[0], center[1]) <= radiusMeters;
}
```

### Step 6: Store Locator & Route Optimization

**Nearby search with PostGIS:**
```sql
SELECT id, name, address, lat, lng,
  ST_DistanceSphere(ST_MakePoint(lng, lat), ST_MakePoint($1, $2)) AS distance_meters
FROM stores
WHERE ST_DWithin(ST_MakePoint(lng, lat)::geography, ST_MakePoint($1, $2)::geography, $3)
ORDER BY distance_meters LIMIT $4;
```

**Route optimization** (Google Directions with waypoint reordering):
```typescript
async function optimizeRoute(origin: string, destination: string, waypoints: string[]) {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&waypoints=optimize:true|${waypoints.map(encodeURIComponent).join("|")}&key=${API_KEY}`
  );
  const route = (await res.json()).routes[0];
  return {
    optimizedOrder: route.waypoint_order,
    totalDistance: route.legs.reduce((s: number, l: any) => s + l.distance.value, 0),
    totalDuration: route.legs.reduce((s: number, l: any) => s + l.duration.value, 0),
  };
}
```

## Examples

### Example 1: Store locator with address search for a coffee chain

**User prompt:** "Build a store locator for our coffee shops. The user types an address, we geocode it, find the 5 nearest stores within 10km from our PostgreSQL database, and display them on a Leaflet map with distance labels."

The agent will create a geocoding function using Google Geocoding API (or Nominatim for free) to convert the user's address input to coordinates. It will write a PostGIS SQL query using `ST_DWithin` to find the 5 nearest stores within 10,000 meters, returning name, address, coordinates, and distance. On the frontend, it will initialize a Leaflet map centered on the searched location, add a marker for each store with a popup showing name, address, and distance in km, and fit the map bounds to show all results.

### Example 2: Delivery fleet route optimization with geofence alerts

**User prompt:** "Optimize the delivery route for a driver starting from our Berlin warehouse with 6 drop-off addresses, then set up a 200m geofence around each stop that logs arrival timestamps."

The agent will call the Google Directions API with `waypoints=optimize:true` to reorder the 6 stops for minimum travel time, returning the optimal sequence, total distance, and estimated duration. It will then create a geofence monitor with a 200-meter circular zone around each stop using the haversine distance function, checking incoming GPS coordinates against each fence and logging enter/exit events with timestamps to track delivery progress.

## Guidelines

- **Choose the right platform for cost** — Google Maps charges per API call after $200/month free credit; Mapbox offers 50,000 free map loads; Leaflet + OSM + Nominatim is entirely free but rate-limited to 1 request/second.
- **Always include attribution** — OpenStreetMap requires visible attribution on rendered maps; Mapbox and Google have their own attribution requirements that must not be removed.
- **Rate-limit geocoding requests** — add delays between batch geocoding calls (100ms+ for Google, 1 second for Nominatim) to avoid hitting rate limits and getting blocked.
- **Close GeoJSON polygon rings** — the first and last coordinate in a polygon must be identical; omitting this causes rendering failures and invalid geometry errors across all platforms.
- **Cache geocoding results** — store lat/lng in your database after the first lookup to avoid repeated API calls for the same addresses, which both saves cost and improves response times.
- **Validate coordinate order** — Google Maps uses `{lat, lng}` objects, Mapbox and GeoJSON use `[lng, lat]` arrays; mixing these up is the most common source of misplaced markers.
