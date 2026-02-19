---
name: mapbox
description: >-
  Add interactive maps with Mapbox. Use when a user asks to add a map to an
  app, display location data, build a store locator, add geocoding, calculate
  routes, create custom map styles, or build map-based visualizations.
license: Apache-2.0
compatibility: 'JavaScript, React, React Native, iOS, Android'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags:
    - mapbox
    - maps
    - geolocation
    - geocoding
    - visualization
---

# Mapbox

## Overview

Mapbox provides customizable maps, geocoding, routing, and location data. Used by Uber, Strava, and Instacart. This skill covers Mapbox GL JS for web maps, React integration, markers, layers, geocoding, and directions.

## Instructions

### Step 1: React Integration

```bash
npm install mapbox-gl react-map-gl
```

```tsx
// components/Map.tsx — Interactive map with React
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

export function StoreLocator({ stores }) {
  const [selected, setSelected] = useState(null)
  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -73.98, latitude: 40.75, zoom: 12 }}
      style={{ width: '100%', height: '500px' }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
    >
      <NavigationControl position="top-right" />
      {stores.map(store => (
        <Marker key={store.id} longitude={store.lng} latitude={store.lat} onClick={() => setSelected(store)} />
      ))}
      {selected && (
        <Popup longitude={selected.lng} latitude={selected.lat} onClose={() => setSelected(null)}>
          <h3>{selected.name}</h3><p>{selected.address}</p>
        </Popup>
      )}
    </Map>
  )
}
```

### Step 2: Geocoding

```typescript
// lib/geocode.ts — Convert addresses to coordinates
const response = await fetch(
  `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}`
)
const data = await response.json()
const [longitude, latitude] = data.features[0].center
```

### Step 3: Directions

```typescript
// lib/directions.ts — Calculate route between two points
const response = await fetch(
  `https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`
)
const route = await response.json()
const distance = route.routes[0].distance    // meters
const duration = route.routes[0].duration    // seconds
const geometry = route.routes[0].geometry    // GeoJSON LineString
```

## Guidelines

- Free tier: 50K map loads/month, 100K geocoding requests/month.
- Use `react-map-gl` for React apps — it wraps Mapbox GL JS with React components.
- Custom styles can be created in Mapbox Studio (WYSIWYG editor).
- For open-source alternative, consider Leaflet with OpenStreetMap tiles.
