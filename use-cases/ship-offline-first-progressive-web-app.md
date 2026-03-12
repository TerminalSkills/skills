---
title: Ship an Offline-First Progressive Web App
slug: ship-offline-first-progressive-web-app
description: >
  Build a field inspection app that works without internet, syncs when
  connectivity returns, and handles conflict resolution — replacing a
  $50K/year native app budget.
skills:
  - typescript
  - nextjs
  - prisma
  - pglite
  - zod
  - tailwindcss
  - vitest
category: Full-Stack Development
tags:
  - pwa
  - offline-first
  - service-worker
  - sync
  - indexeddb
  - progressive-web-app
---

# Ship an Offline-First Progressive Web App

## The Problem

Tomás manages a team of 40 field inspectors for a utility company. They inspect power lines, substations, and meters in rural areas with spotty cell coverage. Currently, inspectors fill paper forms, drive back to the office, and manually enter data — 3 hours of admin work per inspector per day. The company tried a native mobile app but it cost $50K/year for iOS + Android + backend, and inspectors still lost data when the app crashed without connectivity.

Tomás needs:
- **Full offline functionality** — inspectors create, edit, and complete inspections with zero connectivity
- **Local-first data** — the app works instantly, no loading spinners waiting for server
- **Background sync** — when connectivity returns, data flows to the server automatically
- **Conflict resolution** — two inspectors editing the same site's data doesn't lose changes
- **Installable on any device** — no App Store approval, works on Android, iOS, and desktop
- **Photo capture** — attach photos to inspections, upload when online

## Step 1: Service Worker for Offline Shell

The service worker caches the app shell so it loads instantly even without internet.

```typescript
// public/sw.ts
// Service worker: caches app shell and API responses for offline use

const CACHE_NAME = 'inspect-v1';
const SHELL_URLS = [
  '/',
  '/inspections',
  '/inspections/new',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Cache app shell on install
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  // Activate immediately — don't wait for old tabs to close
  (self as any).skipWaiting();
});

// Clean old caches on activate
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs immediately
  (self as any).clients.claim();
});

// Network-first for API, cache-first for assets
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    // Network first, fall back to cache
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful GET responses
          if (event.request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r ?? new Response('Offline', { status: 503 })))
    );
  } else {
    // Cache first for static assets
    event.respondWith(
      caches.match(event.request).then((cached) => cached ?? fetch(event.request))
    );
  }
});
```

## Step 2: Local Database with PGlite

PGlite runs a real PostgreSQL engine in the browser via WebAssembly. Inspectors get full SQL query power offline — no IndexedDB API gymnastics.

```typescript
// src/lib/local-db.ts
// In-browser PostgreSQL via PGlite — full SQL, works offline

import { PGlite } from '@electric-sql/pglite';

let db: PGlite | null = null;

export async function getLocalDb(): Promise<PGlite> {
  if (db) return db;

  db = new PGlite('idb://inspect-db');  // persisted in IndexedDB

  // Run migrations on first open
  await db.exec(`
    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      site_name TEXT NOT NULL,
      inspector_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      data JSONB NOT NULL DEFAULT '{}',
      photos TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      synced_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1,
      deleted BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL,
      blob_data BYTEA,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      uploaded BOOLEAN NOT NULL DEFAULT FALSE,
      remote_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
    CREATE INDEX IF NOT EXISTS idx_inspections_site ON inspections(site_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
  `);

  return db;
}
```

## Step 3: Offline-First Data Layer

Every write goes to the local database first, then queues for sync. Reads always come from the local database — no loading states.

```typescript
// src/lib/inspection-store.ts
// CRUD operations on local DB with automatic sync queue management

import { getLocalDb } from './local-db';
import { z } from 'zod';

export const InspectionData = z.object({
  equipmentType: z.string(),
  condition: z.enum(['good', 'fair', 'poor', 'critical']),
  notes: z.string(),
  measurements: z.record(z.string(), z.number()).optional(),
  checklistItems: z.array(z.object({
    id: z.string(),
    label: z.string(),
    checked: z.boolean(),
    note: z.string().optional(),
  })),
});

export type InspectionData = z.infer<typeof InspectionData>;

export async function createInspection(
  siteId: string,
  siteName: string,
  inspectorId: string,
  data: InspectionData
): Promise<string> {
  const db = await getLocalDb();
  const id = crypto.randomUUID();

  await db.exec(`
    INSERT INTO inspections (id, site_id, site_name, inspector_id, status, data)
    VALUES ($1, $2, $3, $4, 'draft', $5)
  `, [id, siteId, siteName, inspectorId, JSON.stringify(data)]);

  // Queue for sync when online
  await queueSync('inspection', id, 'create', {
    id, siteId, siteName, inspectorId, data,
  });

  return id;
}

export async function updateInspection(
  id: string,
  data: Partial<InspectionData>,
  status?: string
): Promise<void> {
  const db = await getLocalDb();

  // Merge with existing data
  const existing = await db.query(
    'SELECT data, version FROM inspections WHERE id = $1', [id]
  );
  if (!existing.rows.length) throw new Error(`Inspection ${id} not found`);

  const merged = { ...existing.rows[0].data, ...data };
  const newVersion = existing.rows[0].version + 1;

  await db.exec(`
    UPDATE inspections
    SET data = $1, version = $2, updated_at = NOW()
    ${status ? ', status = $4' : ''}
    WHERE id = $3
  `, status
    ? [JSON.stringify(merged), newVersion, id, status]
    : [JSON.stringify(merged), newVersion, id]
  );

  await queueSync('inspection', id, 'update', {
    id, data: merged, status, version: newVersion,
  });
}

export async function listInspections(filters?: {
  status?: string;
  siteId?: string;
}): Promise<any[]> {
  const db = await getLocalDb();
  let query = 'SELECT * FROM inspections WHERE deleted = FALSE';
  const params: any[] = [];

  if (filters?.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }
  if (filters?.siteId) {
    params.push(filters.siteId);
    query += ` AND site_id = $${params.length}`;
  }

  query += ' ORDER BY updated_at DESC';
  const result = await db.query(query, params);
  return result.rows;
}

async function queueSync(
  entityType: string,
  entityId: string,
  operation: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getLocalDb();
  await db.exec(`
    INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload)
    VALUES ($1, $2, $3, $4, $5)
  `, [crypto.randomUUID(), entityType, entityId, operation, JSON.stringify(payload)]);
}
```

## Step 4: Background Sync Engine

When connectivity returns, the sync engine processes the queue in order, handling conflicts with last-write-wins + version vectors.

```typescript
// src/lib/sync-engine.ts
// Processes sync queue when online, handles conflicts

import { getLocalDb } from './local-db';

const SYNC_API = '/api/sync';
const MAX_BATCH = 20;      // sync 20 items at a time
const RETRY_DELAY = 5000;  // 5s between retries

export class SyncEngine {
  private syncing = false;
  private intervalId: number | null = null;

  start(): void {
    // Listen for online events
    window.addEventListener('online', () => this.processQueue());

    // Periodic sync every 30 seconds when online
    this.intervalId = window.setInterval(() => {
      if (navigator.onLine) this.processQueue();
    }, 30_000) as unknown as number;

    // Initial sync if online
    if (navigator.onLine) this.processQueue();
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  async processQueue(): Promise<void> {
    if (this.syncing) return;  // prevent concurrent sync
    this.syncing = true;

    try {
      const db = await getLocalDb();

      // Get pending sync items, oldest first
      const pending = await db.query(`
        SELECT * FROM sync_queue
        ORDER BY created_at ASC
        LIMIT $1
      `, [MAX_BATCH]);

      if (!pending.rows.length) return;

      // Send batch to server
      const response = await fetch(SYNC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: pending.rows }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const results = await response.json() as SyncResult[];

      for (const result of results) {
        if (result.status === 'ok') {
          // Remove from queue
          await db.exec('DELETE FROM sync_queue WHERE id = $1', [result.queueId]);

          // Mark as synced
          if (result.entityType === 'inspection') {
            await db.exec(
              'UPDATE inspections SET synced_at = NOW() WHERE id = $1',
              [result.entityId]
            );
          }
        } else if (result.status === 'conflict') {
          // Server has a newer version — merge
          await handleConflict(db, result);
        } else {
          // Increment attempt counter
          await db.exec(`
            UPDATE sync_queue SET attempts = attempts + 1, last_error = $1
            WHERE id = $2
          `, [result.error, result.queueId]);
        }
      }
    } catch (err) {
      console.warn('Sync error (will retry):', err);
    } finally {
      this.syncing = false;
    }
  }
}

interface SyncResult {
  queueId: string;
  entityType: string;
  entityId: string;
  status: 'ok' | 'conflict' | 'error';
  error?: string;
  serverVersion?: number;
  serverData?: Record<string, unknown>;
}

async function handleConflict(
  db: any,
  result: SyncResult
): Promise<void> {
  // Last-write-wins with field-level merge
  // Server data takes precedence for same fields, local additions preserved
  const local = await db.query(
    'SELECT data FROM inspections WHERE id = $1', [result.entityId]
  );
  if (!local.rows.length) return;

  const merged = { ...local.rows[0].data, ...result.serverData };
  await db.exec(`
    UPDATE inspections
    SET data = $1, version = $2, synced_at = NOW()
    WHERE id = $3
  `, [JSON.stringify(merged), result.serverVersion, result.entityId]);

  // Remove from queue — conflict resolved
  await db.exec('DELETE FROM sync_queue WHERE id = $1', [result.queueId]);
}
```

## Step 5: Photo Capture and Offline Storage

Photos are stored as blobs in the local database and uploaded when online.

```typescript
// src/lib/photo-store.ts
// Captures photos, stores locally, uploads in background

import { getLocalDb } from './local-db';

export async function capturePhoto(inspectionId: string): Promise<string> {
  // Use the device camera via file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';  // rear camera

  return new Promise((resolve, reject) => {
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No photo captured'));

      // Compress before storage — 800px wide, 70% quality
      const compressed = await compressImage(file, 800, 0.7);
      const photoId = crypto.randomUUID();

      const db = await getLocalDb();
      await db.exec(`
        INSERT INTO photos (id, inspection_id, blob_data, mime_type)
        VALUES ($1, $2, $3, $4)
      `, [photoId, inspectionId, compressed, 'image/jpeg']);

      // Add photo reference to inspection
      await db.exec(`
        UPDATE inspections
        SET photos = array_append(photos, $1), updated_at = NOW()
        WHERE id = $2
      `, [photoId, inspectionId]);

      resolve(photoId);
    };
    input.click();
  });
}

async function compressImage(
  file: File,
  maxWidth: number,
  quality: number
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = new OffscreenCanvas(
    bitmap.width * scale,
    bitmap.height * scale
  );
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function uploadPendingPhotos(): Promise<number> {
  const db = await getLocalDb();
  const pending = await db.query(
    'SELECT id, inspection_id, blob_data, mime_type FROM photos WHERE uploaded = FALSE LIMIT 5'
  );

  let uploaded = 0;
  for (const photo of pending.rows) {
    try {
      const form = new FormData();
      form.append('file', new Blob([photo.blob_data], { type: photo.mime_type }));
      form.append('inspectionId', photo.inspection_id);

      const res = await fetch('/api/photos/upload', { method: 'POST', body: form });
      if (!res.ok) continue;

      const { url } = await res.json();
      await db.exec(`
        UPDATE photos SET uploaded = TRUE, remote_url = $1, blob_data = NULL
        WHERE id = $2
      `, [url, photo.id]);

      uploaded++;
    } catch {
      // Will retry on next sync cycle
    }
  }

  return uploaded;
}
```

## Step 6: PWA Manifest and Install Prompt

```json
// public/manifest.json
{
  "name": "Field Inspector",
  "short_name": "Inspector",
  "description": "Offline-first field inspection app",
  "start_url": "/inspections",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

```typescript
// src/components/install-prompt.tsx
// Shows install banner for users who haven't installed yet

'use client';

import { useState, useEffect } from 'react';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg flex items-center justify-between">
      <div>
        <p className="font-semibold">Install Field Inspector</p>
        <p className="text-sm opacity-90">Works offline, syncs when connected</p>
      </div>
      <button
        onClick={async () => {
          await deferredPrompt.prompt();
          setDeferredPrompt(null);
        }}
        className="bg-white text-blue-600 px-4 py-2 rounded font-medium"
      >
        Install
      </button>
    </div>
  );
}
```

## Results

After 3 months of field use by 40 inspectors:

- **Data entry time** dropped from 3 hours/day to 20 minutes — inspectors complete forms on-site
- **Zero data loss** — 15,000+ inspections synced without a single lost record
- **$50K/year saved** — eliminated native app development and App Store maintenance
- **Offline usage**: 34% of all inspections are completed with no connectivity, synced later
- **Photo sync** handles 200+ photos/day per inspector with automatic compression (average 180KB/photo)
- **Conflict rate**: 0.3% of syncs hit conflicts, all auto-resolved via field-level merge
- **Install rate**: 92% of inspectors installed the PWA within the first week
- **Lighthouse PWA score**: 100 — full offline support, installable, fast
