---
name: mapbox
category: Data Visualization
tags: [maps, geospatial, location, geocoding, navigation, gl]
version: 1.0.0
author: terminal-skills
---

# Mapbox — Custom Interactive Maps

You are an expert in Mapbox, the platform for custom interactive maps, geocoding, navigation, and geospatial data visualization. You help developers build location-aware applications with custom map styles, markers, layers, 3D terrain, route planning, and real-time location tracking using Mapbox GL JS and the Mapbox APIs.

## Core Capabilities

### Basic Map

```typescript
// React integration with react-map-gl
import Map, { Marker, Popup, NavigationControl, Source, Layer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

function StoreLocator() {
  const [selectedStore, setSelectedStore] = useState(null);

  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -73.98, latitude: 40.75, zoom: 12 }}
      style={{ width: "100%", height: "100vh" }}
      mapStyle="mapbox://styles/mapbox/light-v11"
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
    <Map mapboxAccessToken={TOKEN} mapStyle="mapbox://styles/mapbox/dark-v11"
         initialViewState={{ longitude: -73.98, latitude: 40.75, zoom: 11 }}>
      <Source type="geojson" data={geojson}>
        <Layer
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
// Geocoding API — address to coordinates
const geocode = async (address: string) => {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${TOKEN}`
  );
  const data = await res.json();
  const [lng, lat] = data.features[0].center;
  return { lng, lat, place_name: data.features[0].place_name };
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

## Installation

```bash
npm install mapbox-gl react-map-gl
# Get access token at https://account.mapbox.com/
```

## Best Practices

1. **Custom map styles** — Use Mapbox Studio to create branded map styles; match your app's design language
2. **Clustering for markers** — Use `cluster` property on GeoJSON sources when displaying 100+ points; prevents visual clutter
3. **react-map-gl for React** — Use the official React wrapper; it handles lifecycle, state sync, and TypeScript types
4. **Lazy load maps** — Maps are heavy (~200KB); lazy load the map component; show a placeholder during load
5. **Tile-based layers** — For large datasets (10K+ points), use vector tiles instead of GeoJSON; much better performance
6. **Geocoding with autocomplete** — Use the Geocoding API with the `autocomplete=true` parameter for search-as-you-type address input
7. **3D terrain** — Enable terrain with `map.setTerrain({ source: "mapbox-dem" })` for topographic visualizations
8. **Rate limits** — Mapbox has generous free tiers (50K loads/month for GL JS); monitor usage to avoid surprise bills
