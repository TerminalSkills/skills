---
name: leaflet
description: >-
  Builds interactive maps with Leaflet.js, the open-source JavaScript library that shows tile maps with markers, popups and vector shapes. Use when a user asks to create map-based applications, add markers and popups, draw shapes, handle geolocation, or integrate tile layers in web applications.
license: Apache-2.0
compatibility: "Leaflet 1.9.4 in any modern browser. The React examples need react-leaflet 5 with React 19 (react-leaflet 4 with React 18)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["maps", "open-source", "geospatial", "markers", "layers"]
  repository: https://github.com/Leaflet/Leaflet
---
# Leaflet — Lightweight Open-Source Maps

## Overview

Leaflet is a lightweight open-source JavaScript library for interactive maps: raster tile layers, markers, popups, vector shapes, GeoJSON and map events, with clustering and other features added by plugins. It has no API key of its own — the tiles come from a provider you choose, such as OpenStreetMap. In React it is used through react-leaflet, which wraps the same Leaflet objects in components.

The stable release is 1.9.4 (May 2023) and it is what `npm install leaflet` installs. Leaflet 2.0 is still an alpha (2.0.0-alpha.1, August 2025): it is ESM-only and drops the global `L` and the factory functions (`L.marker(latlng)` becomes `new Marker(latlng)`), while react-leaflet 5 and plugins written for the global `L` still require 1.9. Use 1.9.4 unless the user asks for 2.0.

## Instructions

### Installation

```bash
npm install leaflet
npm install -D @types/leaflet                      # TypeScript types (Leaflet 1.9 ships none)

# React 19
npm install react-leaflet react-leaflet-cluster    # react-leaflet 5, cluster 4

# React 18 (the unpinned command above fails there with ERESOLVE)
npm install react-leaflet@4 react-leaflet-cluster@3
```

Without a build step, load the pinned CDN files as in Example 1. The map container needs an explicit height and `leaflet.css` must be loaded: without the height the map is invisible, without the CSS the tiles are scattered over the page.

### Plain JavaScript

```js
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const map = L.map("map").setView([52.3738, 4.888], 13);   // id of a <div> with a height

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

L.marker([52.3738, 4.888]).addTo(map).bindPopup("<b>Amsterdam HQ</b><br>Herengracht 182");
L.circle([52.3738, 4.888], { radius: 1500, color: "#2563eb" }).addTo(map);   // radius in metres
L.polygon([[52.38, 4.87], [52.38, 4.91], [52.36, 4.9]]).addTo(map);

map.on("click", (e) => console.log(e.latlng.lat, e.latlng.lng));
```

Coordinates are `[latitude, longitude]` everywhere in Leaflet. GeoJSON files use `[longitude, latitude]`; `L.geoJSON(data)` converts them, so do not swap GeoJSON coordinates by hand.

### React Integration

```tsx
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";          // required since cluster 3.0
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

const osm = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

type Store = { id: string; name: string; address: string; hours: string; lat: number; lng: number };

export default function StoreMap({ stores }: { stores: Store[] }) {
  return (
    <MapContainer center={[40.75, -73.98]} zoom={12}
                  style={{ height: "100vh", width: "100%" }}>
      <TileLayer {...osm} />

      {/* Cluster markers when zoomed out */}
      <MarkerClusterGroup chunkedLoading>
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
function DeliveryZones({ zones, version }: { zones: GeoJSON.FeatureCollection; version: number }) {
  return (
    <MapContainer center={[40.75, -73.98]} zoom={11} style={{ height: 480 }}>
      <TileLayer {...osm} />
      <GeoJSON
        key={version}   /* `data` is read once; change the key to draw new data */
        data={zones}
        style={(feature) => ({
          fillColor: feature?.properties.active ? "#22c55e" : "#ef4444",
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

`MapContainer` props other than `children` are read only when the map is created: changing `center` or `zoom` later does nothing. Move the map from a child component with `useMap()` (`map.setView`, `map.flyTo`, `map.fitBounds`).

### Custom Icons and Controls

```tsx
import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

// Custom marker icon — pass it as <Marker icon={storeIcon} />
const storeIcon = new L.Icon({
  iconUrl: "/icons/store-pin.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],     // the pixel of the image that sits on the coordinate
  popupAnchor: [0, -32],
});

// Custom map control (e.g., "Locate Me" button) placed in Leaflet's top-right corner
function LocateControl() {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Without this a click on the button is also a click on the map
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current);
  }, []);
  return (
    <div className="leaflet-top leaflet-right">
      <div ref={ref} className="leaflet-control leaflet-bar">
        <a href="#" role="button" title="My location"
           onClick={(e) => { e.preventDefault(); map.locate({ setView: true, maxZoom: 16 }); }}>
          ◎
        </a>
      </div>
    </div>
  );
}

// Map events: any Leaflet event name works as a key
function ClickToPin({ onPin }: { onPin: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click: (e) => onPin(e.latlng),
    locationerror: (e) => console.warn("Location unavailable:", e.message),
  });
  return null;
}
```

`useMap`, `useMapEvents` and `useMapEvent` work only in components rendered inside `<MapContainer>`.

### Default marker icon with bundlers

The blue default marker works in the dev server and turns into a broken image after a production build, because the bundler rewrites the image URL that Leaflet reads from its CSS. Import the images once, before the first map renders:

```ts
// leaflet-icons.ts
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });
```

### Next.js

Leaflet touches `window` when it is imported, so the map must not render on the server. Put the map in its own file and load it from a Client Component:

```tsx
"use client";
import dynamic from "next/dynamic";

const StoreMap = dynamic(() => import("./StoreMap"), { ssr: false, loading: () => <p>Loading map…</p> });
```

`ssr: false` is rejected inside a Server Component, so the file that calls `dynamic` needs `"use client"`; the imported file must `export default` the map component.

## Examples

### Example 1: Office locations on a plain HTML page

**User request:** "Put our three offices on a map on the contact page. It's a static site, no build step."

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <style>#map { height: 420px; }</style>
</head>
<body>
  <div id="map"></div>
  <script>
    const offices = [
      { name: "Amsterdam HQ", address: "Herengracht 182", lat: 52.3738, lng: 4.8880 },
      { name: "Amsterdam Noord", address: "Asterweg 20", lat: 52.3925, lng: 4.9012 },
      { name: "Utrecht", address: "Oudegracht 112", lat: 52.0907, lng: 5.1214 },
    ];

    const map = L.map("map");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const markers = offices.map((o) =>
      L.marker([o.lat, o.lng]).bindPopup(`<b>${o.name}</b><br>${o.address}`)
    );
    const group = L.featureGroup(markers).addTo(map);
    map.fitBounds(group.getBounds(), { padding: [30, 30] });
  </script>
</body>
</html>
```

Result: a 420 px map zoomed so that all three markers fit (zoom 10 on a desktop-width page), with "© OpenStreetMap contributors" in the corner. Clicking a marker opens a popup with the office name in bold and its address. The `integrity` values are the ones published on the Leaflet download page for 1.9.4; the browser refuses the files if they are changed.

### Example 2: Click to drop a pin, with a "my location" button

**User request:** "In our React app, let people click the map to mark where the pothole is, and add a button that jumps to their own position."

```tsx
import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leaflet-icons";                    // the default-icon fix above
// osm, LocateControl and ClickToPin are the snippets from the Instructions

export default function ReportMap() {
  const [pins, setPins] = useState<L.LatLng[]>([]);
  return (
    <MapContainer center={[40.75, -73.98]} zoom={12} style={{ height: 480 }}>
      <TileLayer {...osm} />
      <LocateControl />
      <ClickToPin onPin={(latlng) => setPins((prev) => [...prev, latlng])} />
      {pins.map((p, i) => (
        <Marker key={i} position={p}>
          <Popup>Pothole {i + 1}: {p.lat.toFixed(5)}, {p.lng.toFixed(5)}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

Result: each click on the map adds a marker at that point; a click on the ◎ button in the top-right corner does not add one. The button asks the browser for the position and recentres the map on it, zooming in to 16 at most; when the user refuses or the browser cannot find a position, the `locationerror` handler logs `Location unavailable: Geolocation error: …` and the map stays where it was.

## Guidelines

1. **Tile provider** — `tile.openstreetmap.org` needs no key but is a donated service with no SLA: visible attribution is mandatory, the URL is `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (the old `{s}.` subdomains are not needed), and heavy or commercial traffic can be blocked without notice. For production traffic or custom styling use a tile provider with a plan (Stadia Maps, MapTiler, Mapbox) or host tiles yourself
2. **Marker clustering** — Use `react-leaflet-cluster` (or `leaflet.markercluster` without React) for 100+ markers; import its two CSS files, otherwise the clusters are unstyled
3. **GeoJSON for regions** — Use GeoJSON layers for boundaries, zones, and polygons; style dynamically based on data, and change the `key` when the data changes
4. **Lazy load** — Leaflet is about 42 KB of JavaScript gzipped plus its CSS; lazy load the map component when the map is below the fold
5. **SSR compatibility** — Leaflet requires `window`; in Next.js load the map with `dynamic(..., { ssr: false })` from a Client Component
6. **No offline tile downloads from OpenStreetMap** — the tile usage policy forbids bulk downloading, prefetching and "download for offline" features; normal browser caching is fine. Offline maps need a provider that allows it or your own tiles
7. **Geolocation** — `map.locate()` works only on HTTPS pages (and `localhost`) and only after the user grants permission; always handle `locationerror`
8. **Escape popup content** — `bindPopup` with a string inserts HTML, so user-supplied names must be escaped or passed as a DOM node; in react-leaflet, `<Popup>` children are ordinary React nodes and are safe
9. **When not to use Leaflet** — it draws raster tiles and SVG/Canvas overlays; for vector tiles, map rotation, 3D terrain or tens of thousands of animated points use a WebGL library such as MapLibre GL JS
