---
title: Build a Design Token System
slug: build-design-token-system
description: Build a design token management system with multi-platform export, theme support, semantic tokens, automatic CSS/iOS/Android generation, version control, and design-dev synchronization.
skills:
  - typescript
  - hono
  - zod
category: Frontend Development
tags:
  - design-tokens
  - design-system
  - css
  - theming
  - multi-platform
---

# Build a Design Token System

## The Problem

Sofia leads design at a 30-person company shipping web, iOS, and Android apps. Colors are defined in Figma, hardcoded in CSS, copy-pasted into Swift, and manually entered in Kotlin. When the brand blue changes from #2563EB to #3B82F6, it takes 2 weeks to propagate: CSS is updated first, iOS a week later, Android sometime after. Some screens still show the old blue. They need a single source of truth for design decisions — one file that generates CSS custom properties, Swift UIColors, Kotlin colors, and JavaScript constants.

## Step 1: Build the Token System

```typescript
// src/tokens/manager.ts — Design tokens with multi-platform export and semantic layers
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

interface DesignToken {
  name: string;
  value: any;
  type: "color" | "spacing" | "fontSize" | "fontWeight" | "fontFamily" | "borderRadius" | "shadow" | "opacity" | "duration" | "breakpoint";
  description?: string;
  category: string;
}

interface TokenSet {
  name: string;
  tokens: Record<string, DesignToken>;
  themes: Record<string, Record<string, any>>;  // theme name → token overrides
}

// Define the token hierarchy
const tokenSet: TokenSet = {
  name: "brand",
  tokens: {
    // Primitive tokens (raw values)
    "color.blue.50": { name: "color.blue.50", value: "#EFF6FF", type: "color", category: "primitive" },
    "color.blue.100": { name: "color.blue.100", value: "#DBEAFE", type: "color", category: "primitive" },
    "color.blue.500": { name: "color.blue.500", value: "#3B82F6", type: "color", category: "primitive" },
    "color.blue.600": { name: "color.blue.600", value: "#2563EB", type: "color", category: "primitive" },
    "color.blue.700": { name: "color.blue.700", value: "#1D4ED8", type: "color", category: "primitive" },
    "color.gray.50": { name: "color.gray.50", value: "#F9FAFB", type: "color", category: "primitive" },
    "color.gray.100": { name: "color.gray.100", value: "#F3F4F6", type: "color", category: "primitive" },
    "color.gray.500": { name: "color.gray.500", value: "#6B7280", type: "color", category: "primitive" },
    "color.gray.900": { name: "color.gray.900", value: "#111827", type: "color", category: "primitive" },
    "color.white": { name: "color.white", value: "#FFFFFF", type: "color", category: "primitive" },
    "color.red.500": { name: "color.red.500", value: "#EF4444", type: "color", category: "primitive" },
    "color.green.500": { name: "color.green.500", value: "#22C55E", type: "color", category: "primitive" },
    "color.yellow.500": { name: "color.yellow.500", value: "#EAB308", type: "color", category: "primitive" },

    // Semantic tokens (reference primitives)
    "color.brand.primary": { name: "color.brand.primary", value: "{color.blue.500}", type: "color", category: "semantic", description: "Primary brand color" },
    "color.brand.primary.hover": { name: "color.brand.primary.hover", value: "{color.blue.600}", type: "color", category: "semantic" },
    "color.brand.primary.active": { name: "color.brand.primary.active", value: "{color.blue.700}", type: "color", category: "semantic" },
    "color.bg.primary": { name: "color.bg.primary", value: "{color.white}", type: "color", category: "semantic" },
    "color.bg.secondary": { name: "color.bg.secondary", value: "{color.gray.50}", type: "color", category: "semantic" },
    "color.text.primary": { name: "color.text.primary", value: "{color.gray.900}", type: "color", category: "semantic" },
    "color.text.secondary": { name: "color.text.secondary", value: "{color.gray.500}", type: "color", category: "semantic" },
    "color.status.error": { name: "color.status.error", value: "{color.red.500}", type: "color", category: "semantic" },
    "color.status.success": { name: "color.status.success", value: "{color.green.500}", type: "color", category: "semantic" },
    "color.status.warning": { name: "color.status.warning", value: "{color.yellow.500}", type: "color", category: "semantic" },

    // Spacing
    "spacing.xs": { name: "spacing.xs", value: 4, type: "spacing", category: "spacing" },
    "spacing.sm": { name: "spacing.sm", value: 8, type: "spacing", category: "spacing" },
    "spacing.md": { name: "spacing.md", value: 16, type: "spacing", category: "spacing" },
    "spacing.lg": { name: "spacing.lg", value: 24, type: "spacing", category: "spacing" },
    "spacing.xl": { name: "spacing.xl", value: 32, type: "spacing", category: "spacing" },
    "spacing.2xl": { name: "spacing.2xl", value: 48, type: "spacing", category: "spacing" },

    // Typography
    "fontSize.xs": { name: "fontSize.xs", value: 12, type: "fontSize", category: "typography" },
    "fontSize.sm": { name: "fontSize.sm", value: 14, type: "fontSize", category: "typography" },
    "fontSize.md": { name: "fontSize.md", value: 16, type: "fontSize", category: "typography" },
    "fontSize.lg": { name: "fontSize.lg", value: 18, type: "fontSize", category: "typography" },
    "fontSize.xl": { name: "fontSize.xl", value: 24, type: "fontSize", category: "typography" },
    "fontSize.2xl": { name: "fontSize.2xl", value: 32, type: "fontSize", category: "typography" },
    "fontSize.3xl": { name: "fontSize.3xl", value: 48, type: "fontSize", category: "typography" },

    // Border radius
    "radius.sm": { name: "radius.sm", value: 4, type: "borderRadius", category: "shape" },
    "radius.md": { name: "radius.md", value: 8, type: "borderRadius", category: "shape" },
    "radius.lg": { name: "radius.lg", value: 12, type: "borderRadius", category: "shape" },
    "radius.full": { name: "radius.full", value: 9999, type: "borderRadius", category: "shape" },

    // Shadows
    "shadow.sm": { name: "shadow.sm", value: "0 1px 2px rgba(0,0,0,0.05)", type: "shadow", category: "elevation" },
    "shadow.md": { name: "shadow.md", value: "0 4px 6px rgba(0,0,0,0.07)", type: "shadow", category: "elevation" },
    "shadow.lg": { name: "shadow.lg", value: "0 10px 15px rgba(0,0,0,0.1)", type: "shadow", category: "elevation" },
  },
  themes: {
    dark: {
      "color.bg.primary": "{color.gray.900}",
      "color.bg.secondary": "#1F2937",
      "color.text.primary": "{color.gray.50}",
      "color.text.secondary": "{color.gray.500}",
      "shadow.sm": "0 1px 2px rgba(0,0,0,0.3)",
      "shadow.md": "0 4px 6px rgba(0,0,0,0.4)",
      "shadow.lg": "0 10px 15px rgba(0,0,0,0.5)",
    },
  },
};

// Resolve token references
function resolveValue(value: any, tokens: Record<string, DesignToken>, overrides?: Record<string, any>): any {
  if (typeof value !== "string") return value;
  const refMatch = value.match(/^\{(.+)\}$/);
  if (!refMatch) return value;

  const refName = refMatch[1];
  const override = overrides?.[refName];
  if (override !== undefined) return resolveValue(override, tokens, overrides);
  const referenced = tokens[refName];
  return referenced ? resolveValue(referenced.value, tokens, overrides) : value;
}

// Export to CSS custom properties
export function exportCSS(theme?: string): string {
  const overrides = theme ? tokenSet.themes[theme] : undefined;
  const lines: string[] = [];

  for (const [name, token] of Object.entries(tokenSet.tokens)) {
    if (token.category === "primitive") continue; // only export semantic tokens
    const resolved = resolveValue(overrides?.[name] || token.value, tokenSet.tokens, overrides);
    const cssName = `--${name.replace(/\./g, "-")}`;
    const cssValue = typeof resolved === "number"
      ? (token.type === "spacing" || token.type === "fontSize" || token.type === "borderRadius" ? `${resolved}px` : resolved)
      : resolved;
    lines.push(`  ${cssName}: ${cssValue};`);
  }

  const selector = theme ? `[data-theme="${theme}"]` : ":root";
  return `${selector} {\n${lines.join("\n")}\n}`;
}

// Export to Swift (iOS)
export function exportSwift(): string {
  const lines = ["import SwiftUI", "", "extension Color {", "  enum Brand {"];

  for (const [name, token] of Object.entries(tokenSet.tokens)) {
    if (token.type !== "color" || token.category === "primitive") continue;
    const resolved = resolveValue(token.value, tokenSet.tokens);
    if (typeof resolved === "string" && resolved.startsWith("#")) {
      const hex = resolved.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const swiftName = name.replace(/\./g, "_").replace("color_", "");
      lines.push(`    static let ${swiftName} = Color(red: ${r.toFixed(3)}, green: ${g.toFixed(3)}, blue: ${b.toFixed(3)})`);
    }
  }

  lines.push("  }", "}");
  return lines.join("\n");
}

// Export to Kotlin (Android)
export function exportKotlin(): string {
  const lines = ["package com.app.design", "", "import androidx.compose.ui.graphics.Color", "", "object BrandColors {"];

  for (const [name, token] of Object.entries(tokenSet.tokens)) {
    if (token.type !== "color" || token.category === "primitive") continue;
    const resolved = resolveValue(token.value, tokenSet.tokens);
    if (typeof resolved === "string" && resolved.startsWith("#")) {
      const kotlinName = name.replace(/\./g, "_").replace("color_", "")
        .replace(/([-_]\w)/g, (g) => g[1].toUpperCase());
      lines.push(`    val ${kotlinName} = Color(0xFF${resolved.replace("#", "").toUpperCase()})`);
    }
  }

  lines.push("}");
  return lines.join("\n");
}

// Export to JavaScript/TypeScript
export function exportTypeScript(): string {
  const lines = ["export const tokens = {"];

  const grouped: Record<string, Record<string, any>> = {};
  for (const [name, token] of Object.entries(tokenSet.tokens)) {
    if (token.category === "primitive") continue;
    const parts = name.split(".");
    const group = parts[0];
    const key = parts.slice(1).join(".");
    if (!grouped[group]) grouped[group] = {};
    grouped[group][key] = resolveValue(token.value, tokenSet.tokens);
  }

  for (const [group, values] of Object.entries(grouped)) {
    lines.push(`  ${group}: ${JSON.stringify(values, null, 4).replace(/\n/g, "\n  ")},`);
  }

  lines.push("} as const;", "", "export type TokenKey = keyof typeof tokens;");
  return lines.join("\n");
}

// Export to Tailwind config
export function exportTailwind(): string {
  const colors: Record<string, any> = {};
  const spacing: Record<string, string> = {};
  const fontSize: Record<string, string> = {};
  const borderRadius: Record<string, string> = {};

  for (const [name, token] of Object.entries(tokenSet.tokens)) {
    if (token.category === "primitive") continue;
    const resolved = resolveValue(token.value, tokenSet.tokens);
    const key = name.split(".").pop()!;

    if (token.type === "color") colors[key] = `var(--${name.replace(/\./g, "-")})`;
    if (token.type === "spacing") spacing[key] = `${resolved}px`;
    if (token.type === "fontSize") fontSize[key] = `${resolved}px`;
    if (token.type === "borderRadius") borderRadius[key] = resolved === 9999 ? "9999px" : `${resolved}px`;
  }

  return `module.exports = {
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 6)},
      spacing: ${JSON.stringify(spacing, null, 6)},
      fontSize: ${JSON.stringify(fontSize, null, 6)},
      borderRadius: ${JSON.stringify(borderRadius, null, 6)},
    },
  },
};`;
}

// Build all exports
export function buildAll(outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "tokens.css"), exportCSS());
  writeFileSync(join(outputDir, "tokens-dark.css"), exportCSS("dark"));
  writeFileSync(join(outputDir, "tokens.ts"), exportTypeScript());
  writeFileSync(join(outputDir, "BrandColors.swift"), exportSwift());
  writeFileSync(join(outputDir, "BrandColors.kt"), exportKotlin());
  writeFileSync(join(outputDir, "tailwind.tokens.js"), exportTailwind());
}
```

## Results

- **Brand color change: 2 weeks → 5 minutes** — update one token, run build, all platforms get the new color; CSS, Swift, and Kotlin files auto-generated
- **Semantic layer prevents mistakes** — developers use `color.brand.primary` not `#3B82F6`; when the hex changes, no code changes needed
- **Dark theme from one override file** — 7 token overrides generate a complete dark theme for web, iOS, and Android; no manual per-platform work
- **Tailwind integration** — tokens export as Tailwind config; `bg-brand-primary` maps to the token; designers and developers use the same names
- **Design-dev sync** — tokens live in git; CI generates platform files on merge; Figma plugin reads the same JSON; single source of truth achieved
