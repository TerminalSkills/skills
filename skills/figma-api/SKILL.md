---
name: figma-api
description: >-
  Interact with the Figma REST API to read design files, export assets,
  extract components, and pull design tokens programmatically. Use when tasks
  involve automating design handoff, syncing design tokens to code, exporting
  icons/images from Figma, or building integrations between Figma and
  development pipelines.
license: Apache-2.0
compatibility: "Node.js 16+ or any HTTP client"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["figma", "api", "design-tokens", "export", "components"]
---

# Figma API

The Figma REST API exposes design files as structured JSON. Every frame, component, text node, and style is addressable. Authentication uses personal access tokens or OAuth2.

## Authentication

```bash
# .env — Figma personal access token from account settings.
FIGMA_TOKEN=figd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FIGMA_FILE_KEY=abc123DEFghiJKL
```

## Reading a File

```typescript
// src/figma/get-file.ts — Fetch the full Figma file tree.
// Returns a nested document structure with pages, frames, and nodes.
const FIGMA_BASE = "https://api.figma.com/v1";

export async function getFigmaFile(fileKey: string, token: string) {
  const res = await fetch(`${FIGMA_BASE}/files/${fileKey}`, {
    headers: { "X-Figma-Token": token },
  });
  if (!res.ok) throw new Error(`Figma API ${res.status}: ${res.statusText}`);
  return res.json();
}
```

## Exporting Assets

```typescript
// src/figma/export-assets.ts — Export specific nodes as PNG/SVG/PDF.
// Pass node IDs (from the file tree) and desired format.
export async function exportNodes(
  fileKey: string,
  nodeIds: string[],
  format: "png" | "svg" | "pdf",
  token: string
) {
  const ids = nodeIds.join(",");
  const res = await fetch(
    `${FIGMA_BASE}/images/${fileKey}?ids=${ids}&format=${format}&scale=2`,
    { headers: { "X-Figma-Token": token } }
  );
  const data = await res.json();
  return data.images; // { nodeId: downloadUrl }
}
```

## Extracting Design Tokens

```typescript
// src/figma/extract-tokens.ts — Walk the Figma file tree and pull
// color styles, text styles, and spacing values into a tokens object.
interface DesignTokens {
  colors: Record<string, string>;
  typography: Record<string, { fontFamily: string; fontSize: number; fontWeight: number }>;
  spacing: Record<string, number>;
}

export function extractTokens(figmaFile: any): DesignTokens {
  const tokens: DesignTokens = { colors: {}, typography: {}, spacing: {} };
  const styles = figmaFile.styles || {};

  function walkNode(node: any) {
    // Extract fill colors from nodes that reference a style
    if (node.styles?.fill && node.fills?.[0]?.color) {
      const c = node.fills[0].color;
      const hex = rgbaToHex(c.r, c.g, c.b, c.a);
      const styleName = styles[node.styles.fill]?.name || node.name;
      tokens.colors[styleName] = hex;
    }

    // Extract text styles
    if (node.type === "TEXT" && node.style) {
      const s = node.style;
      const styleName = styles[node.styles?.text]?.name || node.name;
      tokens.typography[styleName] = {
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
      };
    }

    if (node.children) node.children.forEach(walkNode);
  }

  walkNode(figmaFile.document);
  return tokens;
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(a) : ""}`;
}
```

## Listing Components

```typescript
// src/figma/list-components.ts — Get all published components in a file.
// Useful for building component inventories or icon libraries.
export async function getComponents(fileKey: string, token: string) {
  const res = await fetch(`${FIGMA_BASE}/files/${fileKey}/components`, {
    headers: { "X-Figma-Token": token },
  });
  const data = await res.json();
  return data.meta.components.map((c: any) => ({
    key: c.key,
    name: c.name,
    description: c.description,
    containingFrame: c.containing_frame?.name,
  }));
}
```

## Webhooks

```typescript
// src/figma/webhook.ts — Register a webhook to get notified on file changes.
// Figma sends POST requests when files are updated, comments are added, etc.
export async function createWebhook(
  teamId: string,
  endpoint: string,
  token: string
) {
  const res = await fetch(`${FIGMA_BASE}/v2/webhooks`, {
    method: "POST",
    headers: {
      "X-Figma-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "FILE_UPDATE",
      team_id: teamId,
      endpoint,
      passcode: "my-secret-passcode",
    }),
  });
  return res.json();
}
```
