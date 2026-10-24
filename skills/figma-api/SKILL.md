---
name: figma-api
description: >-
  The Figma REST API returns design files as JSON and renders nodes to images. Use it to read
  files, export icons and images, list published components, extract color and text styles as
  design tokens, and receive webhooks when files change. Use when the user asks to automate
  design handoff, sync Figma styles to code, export assets from Figma in a script or CI job,
  or integrate Figma with a build pipeline. Trigger words: figma api, figma token, figma export,
  design tokens, figma webhook.
license: Apache-2.0
compatibility: "Node.js 22.18+ (examples run as TypeScript with node file.ts; fetch is built in) or any HTTP client; a Figma account with a personal access token"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  repository: "https://github.com/figma/rest-api-spec"
  tags: ["figma", "api", "design-tokens", "export", "components"]
---

# Figma API

## Overview

The Figma REST API (base URL `https://api.figma.com`) exposes every file as a tree of nodes in JSON, renders nodes to PNG, JPG, SVG or PDF, lists published components and styles, and manages comments and webhooks. This skill covers the read-oriented workflows used for developer handoff: fetch a file, extract styles into tokens, export assets, and react to changes. The machine-readable contract is the OpenAPI spec in the `figma/rest-api-spec` repository.

## Instructions

**Authentication.** Send the token in the `X-Figma-Token` header. Create a personal access token in Figma under Settings, Security, "Generate new token"; you choose an expiration and scopes, and the value is shown once. Scopes needed here: `file_content:read` (file JSON and image rendering), `library_content:read` (published components and styles), `webhooks:write` and `webhooks:read`. The older `files:read` scope still works but is deprecated and broad. For organization automation such as CI use a plan access token (Organization and Enterprise plans); for apps acting on behalf of other users use an OAuth app, which sends an `Authorization: Bearer` header carrying the OAuth access token. Keep the token in an environment variable, never in code or in the repository.

```bash
export FIGMA_TOKEN="figd_..."                     # personal access token, scopes above
export FIGMA_WEBHOOK_PASSCODE="$(openssl rand -hex 16)"
```

**File key and node ids.** The key is the part of the file URL after `/design/` (or `/file/`): `https://www.figma.com/design/hP3kQw8mZxT2nVbR4cYdLs/Icons?node-id=12-34` (key `hP3kQw8mZxT2nVbR4cYdLs`). In the URL a node id is written `12-34`; the API wants `12:34`.

**Endpoints used here:**

| Task | Request |
| --- | --- |
| File JSON | `GET /v1/files/:key` with optional `ids`, `depth`, `geometry=paths`, `version` |
| Subset of a file | `GET /v1/files/:key/nodes?ids=12:34,56:78` |
| Render images | `GET /v1/images/:key?ids=...&format=png\|jpg\|svg\|pdf&scale=0.01-4` |
| Published components | `GET /v1/files/:key/components` (main file key, not a branch) |
| Published styles | `GET /v1/files/:key/styles` |
| Webhooks | `POST /v2/webhooks`, `GET /v2/webhooks?context=team&context_id=...` |

Variables (`/v1/files/:key/variables/local`) are available only to full members of Enterprise organizations.

**Rate limits.** Limits depend on the seat type, the endpoint tier and the plan of the file. `GET file`, `GET file nodes` and `GET images` are Tier 1: on a View or Collab seat only about 20 requests per month, on a Dev or Full seat a per-minute budget of 10 (Starter), 15 (Professional) or 20 (Organization, Enterprise) requests. Limits follow the plan the file lives in, and Figma's own example cites a Starter-plan file limited to 6 requests per month, so cache hard. A limited request returns HTTP 429 with `Retry-After` (seconds), `X-Figma-Plan-Tier`, `X-Figma-Rate-Limit-Type` and `X-Figma-Upgrade-Link` headers. Fetch large files once, use `ids` and `depth` to narrow requests, and cache results.

## Examples

### Example 1: Pull color and text styles into a tokens object

**User request:** "Read our design system file and give me the color and typography tokens as JSON"

```typescript
// src/figma/client.ts — authenticated GET helper with 429 handling.
const FIGMA_BASE = process.env.FIGMA_API_BASE ?? 'https://api.figma.com';

export async function figmaGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error('Set FIGMA_TOKEN (a personal access token with file_content:read)');
  const url = new URL(path, FIGMA_BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'X-Figma-Token': token } });
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') ?? '30');
      if (wait > 120) throw new Error(`Rate limited for ${wait}s (${res.headers.get('X-Figma-Rate-Limit-Type')}); try later or use a seat with a higher limit`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Figma API ${res.status} on ${url.pathname}: ${await res.text()}`);
    return (await res.json()) as T;
  }
  throw new Error(`Figma API still rate limited after retries: ${url.pathname}`);
}
```

```typescript
// src/figma/tokens.ts — collect color and text styles from a file response.
interface FileResponse {
  document: any;
  styles: Record<string, { name: string; styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID' }>;
}

export interface DesignTokens {
  colors: Record<string, string>;
  typography: Record<string, { fontFamily: string; fontSize: number; fontWeight: number; lineHeightPx?: number }>;
}

const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');

function paintToHex(paint: { color: { r: number; g: number; b: number }; opacity?: number }): string {
  const { r, g, b } = paint.color;
  const opacity = paint.opacity ?? 1;       // transparency lives on the paint, not in color.a
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${opacity < 1 ? toHex(opacity) : ''}`;
}

export function extractTokens(file: FileResponse): DesignTokens {
  const tokens: DesignTokens = { colors: {}, typography: {} };

  function walk(node: any) {
    const fillStyleId = node.styles?.fill;
    const fill = node.fills?.[0];
    if (fillStyleId && fill?.type === 'SOLID' && file.styles[fillStyleId]) {
      tokens.colors[file.styles[fillStyleId].name] = paintToHex(fill);
    }
    const textStyleId = node.styles?.text;
    if (node.type === 'TEXT' && textStyleId && file.styles[textStyleId] && node.style) {
      const { fontFamily, fontSize, fontWeight, lineHeightPx } = node.style;
      tokens.typography[file.styles[textStyleId].name] = { fontFamily, fontSize, fontWeight, lineHeightPx };
    }
    node.children?.forEach(walk);
  }

  walk(file.document);
  return tokens;
}
```

```typescript
import { figmaGet } from './src/figma/client.ts';
import { extractTokens } from './src/figma/tokens.ts';

const file = await figmaGet<any>('/v1/files/hP3kQw8mZxT2nVbR4cYdLs', { geometry: 'paths' });
console.log(JSON.stringify(extractTokens(file), null, 2));
```

**Result:** only nodes that use a named style are collected, so output looks like `{"colors":{"Brand/Primary":"#0066ff"},"typography":{"Body/Strong":{"fontFamily":"Inter","fontSize":16,"fontWeight":600,"lineHeightPx":24}}}`. A paint with opacity below 1 gets an 8-digit hex (`#0066ff80`). Gradient and image fills are skipped because only `SOLID` paints have a `color`.

### Example 2: Export icons as SVG for a build step

**User request:** "Export frames 12:34 and 12:35 from the icon file as SVG into assets/icons"

```typescript
// src/figma/export-assets.ts — render nodes and download the files.
import { mkdir, writeFile } from 'node:fs/promises';
import { figmaGet } from './client.ts';

export async function exportNodes(
  fileKey: string,
  nodeIds: string[],             // ids look like "12:34"
  format: 'png' | 'svg' | 'jpg' | 'pdf',
  outDir: string,
  scale = 2,                     // 0.01 to 4; ignored for svg and pdf
): Promise<string[]> {
  const params: Record<string, string> = { ids: nodeIds.join(','), format };
  if (format === 'png' || format === 'jpg') params.scale = String(scale);
  const { images } = await figmaGet<{ images: Record<string, string | null> }>(`/v1/images/${fileKey}`, params);

  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const [nodeId, url] of Object.entries(images)) {
    if (!url) { console.warn(`Figma could not render node ${nodeId}`); continue; } // null = render failed
    const res = await fetch(url);          // pre-signed URL, no token header; expires after 30 days
    if (!res.ok) throw new Error(`Download failed for ${nodeId}: ${res.status}`);
    const file = `${outDir}/${nodeId.replace(':', '-')}.${format}`;
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    written.push(file);
  }
  return written;
}
```

```typescript
import { exportNodes } from './src/figma/export-assets.ts';

console.log(await exportNodes('hP3kQw8mZxT2nVbR4cYdLs', ['12:34', '12:35'], 'svg', 'assets/icons'));
```

**Result:** `assets/icons/12-34.svg` and `assets/icons/12-35.svg`. The `images` map holds `null` for a node Figma could not render (wrong id, empty node), which the code reports instead of failing. The returned URLs expire after 30 days, so download them in the same run.

### Example 3: List components and subscribe to file updates

**User request:** "Inventory the published components, and call my server when the design system file changes"

```typescript
// src/figma/components.ts — published components of a library file (main file key, not a branch).
import { figmaGet } from './client.ts';

export async function listComponents(fileKey: string) {
  const data = await figmaGet<{ meta: { components: any[] } }>(`/v1/files/${fileKey}/components`);
  return data.meta.components.map((c) => ({
    key: c.key,
    nodeId: c.node_id,
    name: c.name,
    description: c.description,
    frame: c.containing_frame?.name,
  }));
}
```

```typescript
// src/figma/webhook.ts — create a file-update webhook and verify deliveries.
import { timingSafeEqual } from 'node:crypto';

export async function createWebhook(teamId: string, endpoint: string) {
  const res = await fetch(new URL('/v2/webhooks', process.env.FIGMA_API_BASE ?? 'https://api.figma.com'), {
    method: 'POST',
    headers: { 'X-Figma-Token': process.env.FIGMA_TOKEN ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: 'FILE_UPDATE',
      context: 'team',              // "team", "project" (folder) or "file"
      context_id: teamId,
      endpoint,                     // public HTTPS URL, max 2048 chars
      passcode: process.env.FIGMA_WEBHOOK_PASSCODE, // max 100 chars; Figma echoes it in every payload
      description: 'Sync design tokens on file update',
    }),
  });
  if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Call this with the parsed JSON body of each POST Figma sends to your endpoint.
export function isFromFigma(payload: { passcode?: string }): boolean {
  const expected = Buffer.from(process.env.FIGMA_WEBHOOK_PASSCODE ?? '');
  const got = Buffer.from(payload.passcode ?? '');
  return expected.length > 0 && got.length === expected.length && timingSafeEqual(got, expected);
}
```

**Result:** `listComponents` returns entries such as `{ key: 'abc', nodeId: '3:4', name: 'Button', frame: 'Buttons' }`. The webhook is created with `PING` sent to your endpoint right away. `FILE_UPDATE` fires after about 30 minutes without edits in a file, with a JSON body containing `event_type`, `file_key`, `file_name`, `passcode`, `timestamp` and `webhook_id`; reject deliveries whose `passcode` does not match.

## Guidelines

- Webhook event types are `PING`, `FILE_UPDATE`, `FILE_VERSION_UPDATE`, `FILE_DELETE`, `LIBRARY_PUBLISH`, `FILE_COMMENT` and `DEV_MODE_STATUS_UPDATE`. Contexts are `team`, `project` (a folder) and `file`; limits are 20 per team, 5 per folder, 3 per file. Webhooks are managed only through the API, and the endpoint must be public HTTPS.
- Styles are only attached to nodes that actually use them; unstyled colors do not appear in a token export. Prefer Variables (Enterprise) when the design system is built on them.
- `GET /v1/files/:key` on a big file can be many megabytes and counts against a Tier 1 limit; pass `ids`, `depth` or use `/nodes` where you can.
- A `403` usually means the token lacks the scope or the account cannot open that file; a `404` means a wrong file key, or a branch key where a main key is required.
- Treat tokens as secrets: keep them in CI secrets, give them the smallest scopes and a short expiration, and revoke at once any token you did not create.
- Do not poll files for changes; subscribe with a webhook instead.
- Write endpoints (comments, variables, dev resources) change shared team files; confirm with the user before posting or deleting.
