---
title: Build an MVP Backend with PocketBase
slug: build-mvp-backend-with-pocketbase
description: Ship a full backend for a SaaS MVP in a single afternoon using PocketBase — authentication, real-time data, file uploads, and API rules — deployed as one binary with zero infrastructure.
skills:
  - pocketbase
  - cloudflare-workers
category: development
tags:
  - mvp
  - backend
  - real-time
  - authentication
  - rapid-prototyping
---

# Build an MVP Backend with PocketBase

Lena is a solo founder validating a collaborative mood board app. She's burned three weeks on her last project setting up PostgreSQL, Redis, authentication, file storage, and WebSocket infrastructure — and that project never found a single paying customer. This time she wants the backend running by end of day so she can spend the rest of the week on the actual product: the UI that makes designers switch from Pinterest.

## Step 1 — Define Collections and API Rules

PocketBase generates a full REST API from collection definitions. Each collection gets CRUD endpoints automatically. API rules control who can read, create, update, and delete records — without writing a single line of middleware.

```javascript
// pb_migrations/1708300000_create_collections.js — Initial schema migration.
// PocketBase auto-generates migrations when you change collections in the admin UI,
// but writing them manually keeps the schema in version control.

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // Boards collection — the core entity
  const boards = new Collection({
    name: "boards",
    type: "base",
    fields: [
      { name: "title", type: "text", required: true, min: 1, max: 200 },
      { name: "description", type: "text", max: 2000 },
      {
        name: "owner",
        type: "relation",
        required: true,
        options: { collectionId: "_pb_users_auth_", maxSelect: 1 },
      },
      {
        name: "collaborators",
        type: "relation",
        options: { collectionId: "_pb_users_auth_", maxSelect: 50 },
      },
      {
        name: "visibility",
        type: "select",
        required: true,
        options: { values: ["private", "team", "public"] },
      },
      { name: "cover", type: "file", options: { maxSelect: 1, maxSize: 5242880 } },
    ],
    // API rules: who can do what
    listRule: '@request.auth.id = owner || @request.auth.id ?= collaborators || visibility = "public"',
    viewRule: '@request.auth.id = owner || @request.auth.id ?= collaborators || visibility = "public"',
    createRule: "@request.auth.id != ''",              // Any authenticated user
    updateRule: "@request.auth.id = owner",            // Only the owner
    deleteRule: "@request.auth.id = owner",
  });
  app.save(boards);

  // Pins collection — images/links added to boards
  const pins = new Collection({
    name: "pins",
    type: "base",
    fields: [
      {
        name: "board",
        type: "relation",
        required: true,
        options: { collectionId: boards.id, maxSelect: 1, cascadeDelete: true },
      },
      { name: "type", type: "select", required: true, options: { values: ["image", "link", "note"] } },
      { name: "title", type: "text", max: 300 },
      { name: "url", type: "url" },
      { name: "note", type: "editor" },               // Rich text for note-type pins
      {
        name: "image",
        type: "file",
        options: { maxSelect: 1, maxSize: 10485760, thumbs: ["200x200", "400x400"] },
      },
      { name: "position_x", type: "number" },          // Canvas position for freeform layout
      { name: "position_y", type: "number" },
      { name: "color", type: "text", max: 7 },         // Hex color label
      { name: "added_by", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", maxSelect: 1 } },
    ],
    // Access tied to parent board permissions
    listRule: '@request.auth.id = board.owner || @request.auth.id ?= board.collaborators || board.visibility = "public"',
    viewRule: '@request.auth.id = board.owner || @request.auth.id ?= board.collaborators || board.visibility = "public"',
    createRule: "@request.auth.id = board.owner || @request.auth.id ?= board.collaborators",
    updateRule: "@request.auth.id = board.owner || @request.auth.id = added_by",
    deleteRule: "@request.auth.id = board.owner || @request.auth.id = added_by",
  });
  app.save(pins);
}, (app) => {
  // Rollback
  app.delete(app.findCollectionByNameOrId("pins"));
  app.delete(app.findCollectionByNameOrId("boards"));
});
```

The `?=` operator in API rules is PocketBase's "contains" check for relation arrays. `@request.auth.id ?= collaborators` means "the authenticated user's ID is in the collaborators list." This single line replaces what would be a many-to-many join table, a middleware check, and 30 lines of SQL in a traditional setup.

## Step 2 — Add Authentication with OAuth2

PocketBase handles email/password auth out of the box. Adding Google and GitHub OAuth2 takes five minutes — no Passport.js, no callback URLs to debug, no session store.

```javascript
// pb_hooks/auth_hooks.js — Custom hooks that run during auth events.
// PocketBase hooks use JavaScript (not Go) since v0.23+.

/// <reference path="../pb_data/types.d.ts" />

// After a new user registers, create their default board
onRecordCreateRequest((e) => {
  // This runs after successful user creation (email or OAuth2)
}, "users");

onRecordAfterCreateSuccess((e) => {
  const user = e.record;

  // Create a default "My First Board" for every new user
  const boards = e.app.findCollectionByNameOrId("boards");
  const board = new Record(boards);
  board.set("title", "My First Board");
  board.set("description", "Start pinning things you love ✨");
  board.set("owner", user.id);
  board.set("visibility", "private");
  e.app.save(board);
}, "users");

// Rate limit login attempts (prevent brute force)
onRecordAuthRequest((e) => {
  // PocketBase handles rate limiting internally,
  // but we can add custom logic here:
  // e.g., log failed attempts, send alerts after 10 failures
}, "users");
```

```typescript
// Frontend: src/lib/pocketbase.ts — Client SDK setup.
// The authStore persists the JWT token in localStorage automatically.
// After login, every subsequent request includes the auth header.

import PocketBase from "pocketbase";

export const pb = new PocketBase("https://api.moodboard.app");

// Type-safe collection helpers
export type Board = {
  id: string;
  title: string;
  description: string;
  owner: string;
  collaborators: string[];
  visibility: "private" | "team" | "public";
  cover: string;
  created: string;
  updated: string;
};

export type Pin = {
  id: string;
  board: string;
  type: "image" | "link" | "note";
  title: string;
  url: string;
  note: string;
  image: string;
  position_x: number;
  position_y: number;
  color: string;
  added_by: string;
};

// Auth helpers
export async function loginWithGoogle() {
  return pb.collection("users").authWithOAuth2({ provider: "google" });
}

export async function loginWithEmail(email: string, password: string) {
  return pb.collection("users").authWithPassword(email, password);
}

export function logout() {
  pb.authStore.clear();
}

export function isLoggedIn() {
  return pb.authStore.isValid;
}
```

## Step 3 — Build Real-Time Collaboration

When a collaborator adds a pin, every other viewer sees it appear instantly. PocketBase's real-time subscriptions use Server-Sent Events — no WebSocket server to manage, no Redis pub/sub to configure.

```typescript
// src/hooks/useBoardPins.ts — Real-time pin subscription.
// Subscribe once when the component mounts. Every create/update/delete
// on the pins collection (filtered by board) triggers the callback.

import { useEffect, useState, useCallback } from "react";
import { pb, type Pin } from "@/lib/pocketbase";

export function useBoardPins(boardId: string) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initial fetch
  useEffect(() => {
    async function loadPins() {
      const result = await pb.collection("pins").getFullList<Pin>({
        filter: `board = "${boardId}"`,
        sort: "-created",
        expand: "added_by",         // Include user info in one request
      });
      setPins(result);
      setIsLoading(false);
    }
    loadPins();
  }, [boardId]);

  // Real-time subscription
  useEffect(() => {
    const unsubscribe = pb.collection("pins").subscribe<Pin>("*", (event) => {
      // Only process events for this board
      if (event.record.board !== boardId) return;

      switch (event.action) {
        case "create":
          setPins((prev) => [event.record, ...prev]);
          break;
        case "update":
          setPins((prev) =>
            prev.map((pin) =>
              pin.id === event.record.id ? event.record : pin
            )
          );
          break;
        case "delete":
          setPins((prev) =>
            prev.filter((pin) => pin.id !== event.record.id)
          );
          break;
      }
    });

    // Cleanup subscription on unmount
    return () => {
      unsubscribe.then((unsub) => unsub());
    };
  }, [boardId]);

  // Optimistic pin creation
  const addPin = useCallback(
    async (data: Partial<Pin>, imageFile?: File) => {
      const formData = new FormData();
      formData.append("board", boardId);
      formData.append("added_by", pb.authStore.record!.id);
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) formData.append(key, String(value));
      });
      if (imageFile) formData.append("image", imageFile);

      // The real-time subscription will add it to state automatically
      return pb.collection("pins").create(formData);
    },
    [boardId]
  );

  return { pins, isLoading, addPin };
}
```

The subscription callback receives only events for records that pass the collection's API rules. If a user isn't a collaborator on the board, they won't receive real-time updates for that board's pins — access control is enforced server-side, not just on the initial fetch.

## Step 4 — File Uploads with Auto-Generated Thumbnails

PocketBase handles file storage and generates thumbnails automatically from the `thumbs` field option. No sharp/ImageMagick setup, no S3 bucket, no CDN configuration.

```typescript
// src/components/PinUploader.tsx — Drag-and-drop image upload.
// Files go directly to PocketBase, which stores them on disk
// and generates the thumbnail sizes defined in the collection schema.

import { useState, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import { useBoardPins } from "@/hooks/useBoardPins";

export function PinUploader({ boardId }: { boardId: string }) {
  const { addPin } = useBoardPins(boardId);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );

      // Upload all dropped images in parallel
      await Promise.all(
        files.map((file) =>
          addPin(
            {
              type: "image",
              title: file.name.replace(/\.[^.]+$/, ""),  // Filename without extension
              position_x: Math.random() * 800,            // Random position on canvas
              position_y: Math.random() * 600,
            },
            file
          )
        )
      );
    },
    [addPin]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      className={`border-2 border-dashed rounded-xl p-8 transition-colors ${
        isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"
      }`}
    >
      Drop images here
    </div>
  );
}

// Thumbnail URL helper — PocketBase generates thumbs on first request
export function getPinImageUrl(pin: { id: string; image: string; collectionId: string }, thumb?: string) {
  if (!pin.image) return null;
  return pb.files.getURL(pin, pin.image, { thumb: thumb || "400x400" });
}
```

## Step 5 — Deploy as a Single Binary

```dockerfile
# Dockerfile — PocketBase deployment.
# The entire backend is a 30MB binary + a data directory.
# No Node.js, no Python, no runtime dependencies.

FROM alpine:3.19

ARG PB_VERSION=0.25.0

RUN apk add --no-cache ca-certificates wget unzip && \
    wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" && \
    unzip pocketbase_*.zip -d /pb && \
    rm pocketbase_*.zip

COPY pb_migrations/ /pb/pb_migrations/
COPY pb_hooks/ /pb/pb_hooks/

EXPOSE 8090
VOLUME /pb/pb_data

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
```

```yaml
# docker-compose.yml — Production deployment with Caddy reverse proxy.
# Caddy handles HTTPS automatically (Let's Encrypt).
# PocketBase data persists in a Docker volume.

services:
  pocketbase:
    build: .
    restart: unless-stopped
    volumes:
      - pb_data:/pb/pb_data     # Database + uploaded files persist here
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8090/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - pocketbase

volumes:
  pb_data:
  caddy_data:
```

```
# Caddyfile — Reverse proxy with automatic HTTPS.

api.moodboard.app {
    reverse_proxy pocketbase:8090
}
```

The entire production stack is two containers: PocketBase (30MB) and Caddy (40MB). Total memory usage under load: ~50MB. Compare that to a typical stack of Node.js + PostgreSQL + Redis + Nginx consuming 500MB+ idle.

## Results

Lena had the backend running by 3 PM on day one. She spent the rest of the week building the drag-and-drop canvas UI — the part that actually differentiates her product:

- **Backend setup time: 4 hours** instead of the 3 weeks she spent on her previous project's backend. Collections, auth, file uploads, real-time, and deployment — all done in one sitting.
- **Monthly hosting cost: $5** on a basic VPS — PocketBase, Caddy, and the SQLite database use under 100MB of RAM. No managed database fees, no Redis instance, no S3 bucket.
- **Real-time collaboration works out of the box** — no WebSocket server to debug, no connection state to manage. SSE subscriptions reconnect automatically on network interruptions.
- **API response time: 2-8ms** for most queries — SQLite is faster than network-bound PostgreSQL for read-heavy workloads at this scale.
- **Zero DevOps ongoing** — no database backups to configure (PocketBase has a built-in backup API), no SSL renewals (Caddy auto-renews), no dependency updates for auth libraries.
- **First 50 beta users onboarded** in week two. The OAuth2 setup (Google + GitHub) took 10 minutes total, and users started collaborating on boards within minutes of signing up.
