---
title: Build a Design System with Tokens
slug: build-design-system-with-tokens
description: Extract design tokens from Figma, generate CSS custom properties and Tailwind CSS themes, and build a consistent design system that stays in sync between design and code.
skills:
  - figma-api
  - chromajs
  - tailwindcss
category: design
tags:
  - design-tokens
  - figma
  - tailwind
  - theming
  - css
  - design-system
---

# Build a Design System with Tokens

Lena is the design engineer at a startup that just hit 15 developers. The Figma file has 47 shades of blue, three slightly different border radiuses, and nobody agrees on spacing. She's going to fix it: extract tokens from Figma, validate them, generate Tailwind and CSS configs, and set up a pipeline so design changes propagate to code automatically.

## Step 1 — Pull Design Tokens from Figma

First, Lena connects to the Figma API and walks the file tree to extract every color style, text style, and spacing value the designers have defined. The tokens come out as structured JSON.

```typescript
// src/tokens/extract.ts — Connect to Figma API and extract all design tokens.
// Walks the document tree to find color fills, text styles, and component spacing.
const FIGMA_BASE = "https://api.figma.com/v1";

interface ColorToken {
  name: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
}

interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | null;
  letterSpacing: number;
}

interface DesignTokens {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: { name: string; value: number }[];
}

export async function extractTokensFromFigma(
  fileKey: string,
  token: string
): Promise<DesignTokens> {
  const res = await fetch(`${FIGMA_BASE}/files/${fileKey}?geometry=paths`, {
    headers: { "X-Figma-Token": token },
  });
  const file = await res.json();

  const styleRes = await fetch(`${FIGMA_BASE}/files/${fileKey}/styles`, {
    headers: { "X-Figma-Token": token },
  });
  const stylesData = await styleRes.json();
  const styleMap = new Map(
    stylesData.meta.styles.map((s: any) => [s.node_id, s])
  );

  const tokens: DesignTokens = { colors: [], typography: [], spacing: [] };
  const seenColors = new Set<string>();
  const seenType = new Set<string>();

  function walkNode(node: any) {
    // Extract colors from fill styles
    if (node.fills?.[0]?.type === "SOLID" && node.styles?.fill) {
      const style = styleMap.get(node.styles.fill);
      const c = node.fills[0].color;
      const hex = rgbToHex(c.r, c.g, c.b);

      if (style && !seenColors.has(style.name)) {
        seenColors.add(style.name);
        tokens.colors.push({
          name: style.name,
          hex,
          rgb: {
            r: Math.round(c.r * 255),
            g: Math.round(c.g * 255),
            b: Math.round(c.b * 255),
          },
        });
      }
    }

    // Extract text styles
    if (node.type === "TEXT" && node.style && node.styles?.text) {
      const style = styleMap.get(node.styles.text);
      if (style && !seenType.has(style.name)) {
        seenType.add(style.name);
        tokens.typography.push({
          name: style.name,
          fontFamily: node.style.fontFamily,
          fontSize: node.style.fontSize,
          fontWeight: node.style.fontWeight,
          lineHeight: node.style.lineHeightPx || null,
          letterSpacing: node.style.letterSpacing || 0,
        });
      }
    }

    // Extract spacing from auto-layout frames
    if (node.type === "FRAME" && node.layoutMode && node.name.toLowerCase().includes("spacing")) {
      tokens.spacing.push({
        name: node.name,
        value: node.itemSpacing || 0,
      });
    }

    if (node.children) node.children.forEach(walkNode);
  }

  walkNode(file.document);
  return tokens;
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
```

## Step 2 — Validate and Normalize Colors

Figma files accumulate color drift over time. Lena uses chroma.js to validate contrast ratios, deduplicate near-identical colors, and generate consistent shade scales from the base palette.

```typescript
// src/tokens/validate-colors.ts — Validate extracted colors for accessibility,
// merge near-duplicates, and generate shade scales using chroma.js.
import chroma from "chroma-js";

interface ColorToken {
  name: string;
  hex: string;
  rgb: { r: number; g: number; b: number };
}

interface ValidatedColor extends ColorToken {
  contrastOnWhite: number;
  contrastOnBlack: number;
  passesAA: boolean;
  shades: Record<string, string>;
}

export function validateAndExpandColors(colors: ColorToken[]): ValidatedColor[] {
  // Deduplicate colors that are perceptually identical
  const unique = deduplicateColors(colors);

  return unique.map((color) => {
    const c = chroma(color.hex);

    // Check WCAG contrast against white and black backgrounds
    const contrastOnWhite = chroma.contrast(color.hex, "#ffffff");
    const contrastOnBlack = chroma.contrast(color.hex, "#000000");

    // Generate a 10-step shade scale from the base color
    const shades = generateShadeScale(color.hex);

    return {
      ...color,
      contrastOnWhite: Math.round(contrastOnWhite * 100) / 100,
      contrastOnBlack: Math.round(contrastOnBlack * 100) / 100,
      passesAA: contrastOnWhite >= 4.5 || contrastOnBlack >= 4.5,
      shades,
    };
  });
}

function deduplicateColors(colors: ColorToken[]): ColorToken[] {
  const result: ColorToken[] = [];

  for (const color of colors) {
    const isDuplicate = result.some((existing) => {
      const distance = chroma.deltaE(existing.hex, color.hex);
      return distance < 3; // perceptually indistinguishable
    });

    if (!isDuplicate) result.push(color);
  }

  return result;
}

function generateShadeScale(baseHex: string): Record<string, string> {
  const scale = chroma
    .scale(["#ffffff", baseHex, "#000000"])
    .mode("lab")
    .colors(11);

  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const shades: Record<string, string> = {};
  steps.forEach((step, i) => {
    shades[step.toString()] = scale[i];
  });

  return shades;
}
```

## Step 3 — Generate Tailwind CSS Configuration

Now Lena transforms the validated tokens into a Tailwind config. Colors become the theme palette, typography becomes font size presets, and spacing maps directly to the spacing scale.

```typescript
// src/tokens/generate-tailwind.ts — Transform design tokens into a Tailwind CSS
// configuration file with colors, typography, and spacing scales.
import fs from "fs";

interface ValidatedColor {
  name: string;
  hex: string;
  shades: Record<string, string>;
}

interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | null;
  letterSpacing: number;
}

interface DesignTokens {
  colors: ValidatedColor[];
  typography: TypographyToken[];
  spacing: { name: string; value: number }[];
}

export function generateTailwindConfig(tokens: DesignTokens, outputPath: string) {
  // Convert color tokens to Tailwind color object
  const colors: Record<string, Record<string, string> | string> = {};
  for (const color of tokens.colors) {
    const key = slugify(color.name);
    if (Object.keys(color.shades).length > 0) {
      colors[key] = { ...color.shades, DEFAULT: color.hex };
    } else {
      colors[key] = color.hex;
    }
  }

  // Convert typography to fontSize entries
  const fontSize: Record<string, [string, Record<string, string>]> = {};
  for (const t of tokens.typography) {
    const key = slugify(t.name);
    fontSize[key] = [
      `${t.fontSize / 16}rem`,
      {
        lineHeight: t.lineHeight ? `${t.lineHeight / 16}rem` : "1.5",
        fontWeight: t.fontWeight.toString(),
        letterSpacing: t.letterSpacing ? `${t.letterSpacing}em` : "0",
      },
    ];
  }

  // Convert spacing tokens
  const spacing: Record<string, string> = {};
  for (const s of tokens.spacing) {
    const key = slugify(s.name).replace("spacing-", "");
    spacing[key] = `${s.value / 16}rem`;
  }

  const config = `// tailwind.config.ts — Auto-generated from Figma design tokens.
// DO NOT EDIT MANUALLY. Run \`npm run sync-tokens\` to regenerate.
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 6).replace(/"/g, "'")},
      fontSize: ${JSON.stringify(fontSize, null, 6).replace(/"/g, "'")},
      spacing: ${JSON.stringify(spacing, null, 6).replace(/"/g, "'")},
    },
  },
  plugins: [],
} satisfies Config;
`;

  fs.writeFileSync(outputPath, config);
  console.log(`Tailwind config written to ${outputPath}`);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
```

## Step 4 — Generate CSS Custom Properties

Not everything uses Tailwind. Lena also generates vanilla CSS custom properties so the tokens work in any context — emails, third-party widgets, Storybook.

```typescript
// src/tokens/generate-css.ts — Generate CSS custom properties from design tokens.
// Outputs a :root block with all colors, fonts, and spacing as CSS variables.
import fs from "fs";

interface ValidatedColor {
  name: string;
  hex: string;
  shades: Record<string, string>;
}

interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number | null;
}

export function generateCssVariables(
  colors: ValidatedColor[],
  typography: TypographyToken[],
  outputPath: string
) {
  const lines: string[] = [
    "/* design-tokens.css — Auto-generated from Figma. Do not edit. */",
    ":root {",
  ];

  // Color tokens with shade scales
  lines.push("  /* Colors */");
  for (const color of colors) {
    const prefix = slugify(color.name);
    lines.push(`  --color-${prefix}: ${color.hex};`);
    for (const [shade, value] of Object.entries(color.shades)) {
      lines.push(`  --color-${prefix}-${shade}: ${value};`);
    }
  }

  // Typography tokens
  lines.push("");
  lines.push("  /* Typography */");
  for (const t of typography) {
    const prefix = slugify(t.name);
    lines.push(`  --font-${prefix}-family: '${t.fontFamily}', sans-serif;`);
    lines.push(`  --font-${prefix}-size: ${t.fontSize / 16}rem;`);
    if (t.lineHeight) {
      lines.push(`  --font-${prefix}-line-height: ${t.lineHeight / 16}rem;`);
    }
  }

  lines.push("}");
  lines.push("");

  fs.writeFileSync(outputPath, lines.join("\n"));
  console.log(`CSS variables written to ${outputPath}`);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
```

## Step 5 — Set Up the Sync Pipeline

Lena creates a CLI command that runs the full pipeline: pull from Figma, validate, generate configs. She adds it to the CI so tokens stay in sync whenever the Figma file changes.

```typescript
// src/tokens/sync.ts — CLI entry point that orchestrates the full token pipeline.
// Pulls from Figma, validates colors, and generates Tailwind + CSS outputs.
import { extractTokensFromFigma } from "./extract";
import { validateAndExpandColors } from "./validate-colors";
import { generateTailwindConfig } from "./generate-tailwind";
import { generateCssVariables } from "./generate-css";

async function syncTokens() {
  const fileKey = process.env.FIGMA_FILE_KEY!;
  const token = process.env.FIGMA_TOKEN!;

  if (!fileKey || !token) {
    console.error("Set FIGMA_FILE_KEY and FIGMA_TOKEN environment variables");
    process.exit(1);
  }

  console.log("Pulling tokens from Figma...");
  const rawTokens = await extractTokensFromFigma(fileKey, token);
  console.log(
    `Found ${rawTokens.colors.length} colors, ` +
    `${rawTokens.typography.length} text styles, ` +
    `${rawTokens.spacing.length} spacing values`
  );

  console.log("Validating and expanding colors...");
  const validatedColors = validateAndExpandColors(rawTokens.colors);

  const failedContrast = validatedColors.filter((c) => !c.passesAA);
  if (failedContrast.length > 0) {
    console.warn(`⚠ ${failedContrast.length} colors fail WCAG AA contrast:`);
    failedContrast.forEach((c) =>
      console.warn(`  - ${c.name} (${c.hex}): white=${c.contrastOnWhite}, black=${c.contrastOnBlack}`)
    );
  }

  console.log("Generating Tailwind config...");
  generateTailwindConfig(
    { colors: validatedColors, typography: rawTokens.typography, spacing: rawTokens.spacing },
    "tailwind.config.ts"
  );

  console.log("Generating CSS custom properties...");
  generateCssVariables(validatedColors, rawTokens.typography, "src/styles/design-tokens.css");

  console.log("✅ Token sync complete");
}

syncTokens().catch(console.error);
```

```json
// package.json — Add the sync-tokens script so anyone can run it.
{
  "scripts": {
    "sync-tokens": "tsx src/tokens/sync.ts",
    "sync-tokens:ci": "tsx src/tokens/sync.ts && git diff --exit-code tailwind.config.ts src/styles/design-tokens.css"
  }
}
```

The CI script (`sync-tokens:ci`) runs the sync and fails the build if the generated files don't match what's committed — catching cases where someone updated Figma but forgot to regenerate. Lena also sets up a Figma webhook that triggers the pipeline automatically, so the team rarely has to think about it at all.
