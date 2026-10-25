---
name: mapbox
description: >-
  Mapbox is a platform for interactive web maps, geocoding and routing; Mapbox GL JS (v3) renders the maps in the browser. Use when a user asks to create interactive maps, add custom layers, implement geocoding, build navigation features, or visualize geospatial data with Mapbox.
license: Apache-2.0
compatibility: "A Mapbox account for an access token; Mapbox GL JS 3.x, react-map-gl 8.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/mapbox/mapbox-gl-js
  category: data-ai
  tags: "maps, geospatial, location, geocoding, navigation"
---
# Mapbox — Custom Interactive Maps

## Overview

Mapbox provides custom interactive maps, geocoding, routing and geospatial data visualization. Mapbox GL JS renders vector maps in the browser (current major version 3, 3.33.0 at the time of writing); `react-map-gl` is the React wrapper (8.x); the REST APIs (Geocoding, Directions) are called with the same access token.

## Instructions

### Install and token

```bash
npm install mapbox-gl react-map-gl
```

Create a public access token (starts with `pk.`) at https://account.mapbox.com/ and keep it in an environment variable (`NEXT_PUBLIC_MAPBOX_TOKEN`). Restrict it to your site's URLs in the account page. Secret tokens (`sk.`) must never reach the browser. Without React: `import mapboxgl from "mapbox-gl"`, set `mapboxgl.accessToken`, and `new mapboxgl.Map({ container, style, center: [lng, lat], zoom })`.

### Basic Map

```typescript
// react-map-gl v8: import from the /mapbox entry point (plain "react-map-gl" no longer works)
import Map, { Marker, Popup, NavigationControl, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useState } from "react";

function StoreLocator() {
  const [selectedStore, setSelectedStore] = useState(null);

  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -73.98, latitude: 40.75, zoom: 12 }}
      style={{ width: "100%", height: "100vh" }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
    >
      <NavigationControl position="top-right" />

      {stores.map((store) => (
        <Marker
          key={store.id}
          longitude={store.lng}
          latitude={store.lat}
          onClick={() => setSelectedStore(store)}
        >
          <div className="store-pin">📍</div>
        </Marker>
      ))}

      {selectedStore && (
        <Popup
          longitude={selectedStore.lng}
          latitude={selectedStore.lat}
          onClose={() => setSelectedStore(null)}
        >
          <h3>{selectedStore.name}</h3>
          <p>{selectedStore.address}</p>
          <p>Open: {selectedStore.hours}</p>
        </Popup>
      )}
    </Map>
  );
}
```

### Data Layers

```typescript
// Heatmap layer for density visualization
function DeliveryHeatmap({ deliveries }) {
  const geojson = {
    type: "FeatureCollection",
    features: deliveries.map((d) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [d.lng, d.lat] },
      properties: { weight: d.orderCount },
    })),
  };

  return (
    <Map mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN} mapStyle="mapbox://styles/mapbox/streets-v12"
         initialViewState={{ longitude: -73.98, latitude: 40.75, zoom: 11 }}>
      <Source type="geojson" data={geojson}>
        <Layer
          id="deliveries-heat"
          type="heatmap"
          paint={{
            "heatmap-weight": ["get", "weight"],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 5, 15, 30],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(0,0,255,0)", 0.2, "blue", 0.4, "cyan",
              0.6, "lime", 0.8, "yellow", 1, "red",
            ],
          }}
        />
      </Source>
    </Map>
  );
}
```

### Geocoding and Directions

```typescript
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Geocoding API v6 — address to coordinates (v5 still answers but is the previous version)
const geocode = async (address: string) => {
  const res = await fetch(
    `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(address)}&limit=1&access_token=${TOKEN}`
  );
  const data = await res.json();
  const feature = data.features[0];
  const [lng, lat] = feature.geometry.coordinates;
  return { lng, lat, place_name: feature.properties.full_address };
};

// Directions API — route between two points
const getRoute = async (start: [number, number], end: [number, number]) => {
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${start.join(",")};${end.join(",")}?geometries=geojson&access_token=${TOKEN}`
  );
  const data = await res.json();
  return {
    route: data.routes[0].geometry,       // GeoJSON LineString
    duration: data.routes[0].duration,     // seconds
    distance: data.routes[0].distance,     // meters
  };
};
```

## Examples

### Example 1: Store locator for a bakery chain

> "Show our 12 bakeries on a map and open the address when someone clicks a pin."

Use the `StoreLocator` component above with `stores` loaded from your API (`{ id, name, lng, lat, address, hours }`). Put `NEXT_PUBLIC_MAPBOX_TOKEN=pk...` in `.env.local`. Result: a full-screen street map centered on Manhattan with 12 pins; clicking one opens a popup with name, address and opening hours. Import `mapbox-gl/dist/mapbox-gl.css` once or the popup and controls render unstyled.

### Example 2: Type an address, draw the driving route

> "Let a customer enter their address and show the route from our depot."

```typescript
const depot: [number, number] = [-73.9857, 40.7484];
const home = await geocode("350 5th Ave, New York, NY");
const { route, duration } = await getRoute(depot, [home.lng, home.lat]);
console.log(`${Math.round(duration / 60)} min by car`);
// <Source type="geojson" data={{ type: "Feature", geometry: route, properties: {} }}>
//   <Layer id="route" type="line" paint={{ "line-color": "#2563eb", "line-width": 5 }} />
// </Source>
```

Result: the console prints the drive time and the blue line follows the roads between the two points.

## Guidelines

1. **Custom map styles** — Use Mapbox Studio to create branded map styles; match your app's design language
2. **Clustering for markers** — Use `cluster` property on GeoJSON sources when displaying 100+ points; prevents visual clutter
3. **react-map-gl for React** — Use the official React wrapper; it handles lifecycle, state sync, and TypeScript types
4. **Lazy load maps** — Maps are heavy (mapbox-gl 3.33 is ~1.9 MB minified, ~520 KB gzipped); lazy load the map component; show a placeholder during load
5. **Tile-based layers** — For large datasets (10K+ points), use vector tiles instead of GeoJSON; much better performance
6. **Geocoding with autocomplete** — Geocoding v6 returns autocomplete-style matches by default (`autocomplete=true`); keep it for search-as-you-type and set `autocomplete=false` for exact lookups address input
7. **3D terrain** — see item 10 for the required DEM source; use `map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 })`
8. **Billing** — Map loads, geocoding requests and directions are metered with monthly free tiers; check https://www.mapbox.com/pricing and watch usage. Geocoding results may only be stored if the request sets `permanent=true` (v6 takes it as a query parameter, not a separate endpoint; permanent geocoding needs a payment method on file or an enterprise contract); do not store results from default (temporary) requests.
9. **Coordinates are `[longitude, latitude]`** in GeoJSON, Mapbox GL and the APIs, the reverse of what most people write.
10. **Terrain** needs a `raster-dem` source first: `map.addSource("mapbox-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 })`, then `setTerrain`, both inside `map.on("style.load", …)`.
11. **No POI data in Geocoding v6**; use the Search Box API for places of interest.
