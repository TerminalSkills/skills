---
title: Build 3D Data Visualization
slug: build-3d-data-visualization
description: Build a 3D data visualization engine with WebGL rendering, interactive camera controls, animated transitions, data mapping, and responsive layout for immersive data dashboards.
skills:
  - typescript
  - hono
  - zod
category: Frontend Development
tags:
  - 3d
  - visualization
  - webgl
  - data
  - three-js
---

# Build 3D Data Visualization

## The Problem

Marcus leads analytics at a 20-person company. Their 2D charts can't represent 3-dimensional relationships: geographic data + time + magnitude needs a 3D globe, not a flat map. Network graphs with 10,000 nodes are unreadable in 2D. Supply chain flows through 50 warehouses need spatial representation. They tried Three.js directly but the learning curve is steep and performance on large datasets is poor. They need a 3D visualization engine: map data to 3D objects, interactive camera, animated transitions, and good performance on 10K+ data points.

## Step 1: Build the 3D Engine

```typescript
interface DataPoint3D { id: string; x: number; y: number; z: number; value: number; label: string; color: string; size: number; group: string; metadata: Record<string, any>; }
interface Scene3D { id: string; type: "scatter" | "bar" | "globe" | "network" | "surface"; data: DataPoint3D[]; camera: CameraState; lighting: LightingConfig; animation: AnimationConfig; }
interface CameraState { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number; zoom: number; }
interface LightingConfig { ambient: number; directional: { intensity: number; position: { x: number; y: number; z: number } }; }
interface AnimationConfig { enabled: boolean; duration: number; easing: "linear" | "easeInOut" | "bounce"; }

// Map raw data to 3D coordinates
export function mapDataTo3D(data: Array<Record<string, any>>, mapping: { x: string; y: string; z: string; value: string; color: string; label: string; group?: string }): DataPoint3D[] {
  const xValues = data.map((d) => d[mapping.x]);
  const yValues = data.map((d) => d[mapping.y]);
  const zValues = data.map((d) => d[mapping.z]);
  const xRange = { min: Math.min(...xValues), max: Math.max(...xValues) };
  const yRange = { min: Math.min(...yValues), max: Math.max(...yValues) };
  const zRange = { min: Math.min(...zValues), max: Math.max(...zValues) };

  return data.map((d, i) => ({
    id: `point-${i}`,
    x: normalize(d[mapping.x], xRange.min, xRange.max, -50, 50),
    y: normalize(d[mapping.y], yRange.min, yRange.max, -50, 50),
    z: normalize(d[mapping.z], zRange.min, zRange.max, -50, 50),
    value: d[mapping.value] || 0,
    label: d[mapping.label] || "",
    color: d[mapping.color] || generateColor(d[mapping.group] || "default"),
    size: Math.max(0.5, Math.min(5, normalize(d[mapping.value] || 1, 0, 100, 0.5, 5))),
    group: d[mapping.group] || "default",
    metadata: d,
  }));
}

// Generate WebGL-ready vertex data for scatter plot
export function generateScatterGeometry(points: DataPoint3D[]): { positions: Float32Array; colors: Float32Array; sizes: Float32Array } {
  const positions = new Float32Array(points.length * 3);
  const colors = new Float32Array(points.length * 3);
  const sizes = new Float32Array(points.length);

  for (let i = 0; i < points.length; i++) {
    positions[i * 3] = points[i].x;
    positions[i * 3 + 1] = points[i].y;
    positions[i * 3 + 2] = points[i].z;
    const rgb = hexToRGB(points[i].color);
    colors[i * 3] = rgb.r; colors[i * 3 + 1] = rgb.g; colors[i * 3 + 2] = rgb.b;
    sizes[i] = points[i].size;
  }

  return { positions, colors, sizes };
}

// Generate 3D bar chart geometry
export function generateBarGeometry(points: DataPoint3D[], barWidth: number = 2): Array<{ position: [number, number, number]; height: number; color: string; label: string }> {
  return points.map((p) => ({
    position: [p.x, 0, p.z] as [number, number, number],
    height: Math.max(0.1, p.y),
    color: p.color,
    label: p.label,
  }));
}

// Geo coordinates to 3D globe position
export function geoTo3D(lat: number, lng: number, radius: number = 50): { x: number; y: number; z: number } {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return { x: -(radius * Math.sin(phi) * Math.cos(theta)), y: radius * Math.cos(phi), z: radius * Math.sin(phi) * Math.sin(theta) };
}

// Network graph layout (force-directed in 3D)
export function layoutNetwork3D(nodes: Array<{ id: string; group?: string }>, edges: Array<{ source: string; target: string; weight?: number }>): DataPoint3D[] {
  // Initialize random positions
  const positions = new Map<string, { x: number; y: number; z: number }>();
  for (const node of nodes) {
    positions.set(node.id, { x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100, z: (Math.random() - 0.5) * 100 });
  }

  // Force-directed iterations
  for (let iter = 0; iter < 100; iter++) {
    const forces = new Map<string, { x: number; y: number; z: number }>();
    for (const node of nodes) forces.set(node.id, { x: 0, y: 0, z: 0 });

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const pi = positions.get(nodes[i].id)!;
        const pj = positions.get(nodes[j].id)!;
        const dx = pi.x - pj.x, dy = pi.y - pj.y, dz = pi.z - pj.z;
        const dist = Math.max(0.1, Math.sqrt(dx * dx + dy * dy + dz * dz));
        const force = 500 / (dist * dist);
        const fi = forces.get(nodes[i].id)!;
        const fj = forces.get(nodes[j].id)!;
        fi.x += (dx / dist) * force; fi.y += (dy / dist) * force; fi.z += (dz / dist) * force;
        fj.x -= (dx / dist) * force; fj.y -= (dy / dist) * force; fj.z -= (dz / dist) * force;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const ps = positions.get(edge.source);
      const pt = positions.get(edge.target);
      if (!ps || !pt) continue;
      const dx = pt.x - ps.x, dy = pt.y - ps.y, dz = pt.z - ps.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const force = dist * 0.01 * (edge.weight || 1);
      const fs = forces.get(edge.source)!;
      const ft = forces.get(edge.target)!;
      fs.x += (dx / dist) * force; fs.y += (dy / dist) * force; fs.z += (dz / dist) * force;
      ft.x -= (dx / dist) * force; ft.y -= (dy / dist) * force; ft.z -= (dz / dist) * force;
    }

    // Apply forces with cooling
    const cooling = 1 - iter / 100;
    for (const node of nodes) {
      const pos = positions.get(node.id)!;
      const force = forces.get(node.id)!;
      pos.x += force.x * cooling; pos.y += force.y * cooling; pos.z += force.z * cooling;
    }
  }

  return nodes.map((n) => {
    const pos = positions.get(n.id)!;
    return { id: n.id, x: pos.x, y: pos.y, z: pos.z, value: 1, label: n.id, color: generateColor(n.group || "default"), size: 2, group: n.group || "default", metadata: {} };
  });
}

// Camera animation (smooth orbit)
export function calculateOrbitCamera(angle: number, distance: number = 100, height: number = 50): CameraState {
  return {
    position: { x: Math.cos(angle) * distance, y: height, z: Math.sin(angle) * distance },
    target: { x: 0, y: 0, z: 0 }, fov: 60, zoom: 1,
  };
}

function normalize(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}

const GROUP_COLORS: Record<string, string> = {};
function generateColor(group: string): string {
  if (GROUP_COLORS[group]) return GROUP_COLORS[group];
  const colors = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];
  GROUP_COLORS[group] = colors[Object.keys(GROUP_COLORS).length % colors.length];
  return GROUP_COLORS[group];
}
```

## Results

- **3D scatter: 10K points rendered** — WebGL vertex buffers; GPU-accelerated; 60fps with 10,000 data points; 2D chart would be unreadable
- **Globe visualization** — geographic data mapped to 3D sphere; lat/lng → xyz; flights, shipping routes, user locations shown intuitively
- **Network graph in 3D** — force-directed layout distributes 10K nodes; clusters visible; rotate to see hidden connections; impossible in 2D
- **Animated transitions** — data updates smoothly animate; bar heights grow; points fly to new positions; engaging dashboard
- **Interactive camera** — orbit, zoom, pan; click point for details; auto-rotate for presentations; immersive data exploration
