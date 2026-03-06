---
name: leaflet
description: >-
  Build interactive maps with Leaflet.js. Use when a user asks to create map-based applications, add markers and popups, draw shapes, handle geolocation, or integrate tile layers in web applications.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["maps", "open-source", "geospatial", "markers", "layers"]
---
# Leaflet — Lightweight Open-Source Maps

## Overview

You are an expert in Leaflet, the lightweight open-source JavaScript library for interactive maps. You help developers build map-based applications using OpenStreetMap tiles (free, no API key), custom markers, GeoJSON layers, clustering, and React integration via react-leaflet.

## Instructions

### React Integration

```tsx
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";

function StoreMap({ stores }) {
  return (
    <MapContainer center={[40.75, -73.98]} zoom={12}
                  style={{ height: "100vh", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      {/* Cluster markers when zoomed out */}
      <MarkerClusterGroup>
        {stores.map((store) => (
          <Marker key={store.id} position={[store.lat, store.lng]}>
            <Popup>
              <h3>{store.name}</h3>
              <p>{store.address}</p>
              <p>Hours: {store.hours}</p>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

// GeoJSON boundaries (neighborhoods, delivery zones)
function DeliveryZones({ zones }) {
  return (
    <MapContainer center={[40.75, -73.98]} zoom={11}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <GeoJSON
        data={zones}
        style={(feature) => ({
          fillColor: feature.properties.active ? "#22c55e" : "#ef4444",
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0.3,
        })}
        onEachFeature={(feature, layer) => {
          layer.bindPopup(`
            <b>${feature.properties.name}</b><br/>
            Orders: ${feature.properties.orderCount}<br/>
            Avg delivery: ${feature.properties.avgDeliveryMin} min
          `);
        }}
      />
    </MapContainer>
  );
}
```

### Custom Icons and Controls

```tsx
import L from "leaflet";

// Custom marker icon
const storeIcon = new L.Icon({
  iconUrl: "/icons/store-pin.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Custom map control (e.g., "Locate Me" button)
function LocateControl() {
  const map = useMap();
  return (
    <button
      className="leaflet-control"
      onClick={() => map.locate({ setView: true, maxZoom: 16 })}
    >
      📍 My Location
    </button>
  );
}
```

## Installation

```bash
npm install leaflet react-leaflet
npm install react-leaflet-cluster      # Marker clustering
npm install @types/leaflet             # TypeScript types
```

## Examples

**Example 1: User asks to set up leaflet**

User: "Help me set up leaflet for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure leaflet
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with leaflet**

User: "Create a dashboard using leaflet"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Free tiles** — Use OpenStreetMap tiles (no API key, no cost); switch to Mapbox/Stadia for custom styling
2. **Marker clustering** — Use `react-leaflet-cluster` for 100+ markers; prevents visual clutter and improves performance
3. **GeoJSON for regions** — Use GeoJSON layers for boundaries, zones, and polygons; style dynamically based on data
4. **Lazy load** — Leaflet CSS and JS are ~40KB; lazy load the map component for better initial page load
5. **SSR compatibility** — Leaflet requires `window`; use `dynamic(() => import("./Map"), { ssr: false })` in Next.js
6. **Tile caching** — Use service workers to cache map tiles for offline support in PWAs
7. **Event handling** — Use `useMapEvents` hook for click, zoom, move events; build interactive experiences
8. **Lightweight alternative** — At 42KB (gzipped), Leaflet is 5x smaller than Mapbox GL JS; choose Leaflet when you don't need 3D or custom styles
