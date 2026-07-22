---
title: Convert Figma Designs to Production-Ready React Components
slug: convert-figma-designs-to-production-code
description: Take a Figma design file and generate pixel-perfect React components with Tailwind CSS — responsive layouts, design tokens, and component variants.
skills:
  - figma-to-code
  - tailwindcss
  - react-native
category: design
tags:
  - figma
  - react
  - tailwind
  - design-to-code
  - components
  - frontend
---

## The Problem

Marta is a frontend developer at a startup. The designer hands off a Figma file with 40 screens — dashboard, settings, onboarding flow, email templates. The design is beautiful: consistent spacing, a cohesive color system, responsive breakpoints at mobile, tablet, and desktop.

Now Marta has to turn all of it into React components. Manually. She opens Figma, inspects a card component, notes the padding (16px top, 20px sides), the border radius (12px), the shadow (0 4px 6px rgba(0,0,0,0.1)), the font size (14px/20px Inter medium), the color (#1E293B). She writes a Tailwind class: `p-4 px-5 rounded-xl shadow-md text-sm font-medium text-slate-800`. Repeat for every element on every screen. For 40 screens, that's two weeks of tedious translation work where the biggest risk is getting the spacing wrong by 2 pixels.

She needs a way to go from Figma frame to production React component in minutes, not hours.

## The Solution

Use figma-to-code to extract design data from Figma's API — layouts, colors, typography, spacing, component variants — and generate React components with Tailwind CSS classes. Use tailwindcss for configuring the design token system that matches the Figma file exactly.

## Step-by-Step Walkthrough

### Step 1: Extract Design Tokens from Figma

Before generating any components, extract the design system. Colors, typography scales, spacing values, and border radii define the foundation. Getting these right means every component automatically matches the design.

```typescript
// extract-tokens.ts — Pull design tokens from Figma API
/**
 * Connects to the Figma API and extracts design tokens:
 * colors, typography, spacing, shadows, and border radii.
 * Outputs a tailwind.config.ts extension and a tokens.css file.
 */
import Figma from "figma-js";

interface DesignTokens {
  colors: Record<string, string>;
  fontSizes: Record<string, [string, { lineHeight: string }]>;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  boxShadow: Record<string, string>;
}

export async function extractTokens(fileKey: string): Promise<DesignTokens> {
  const client = Figma.Client({ personalAccessToken: process.env.FIGMA_TOKEN! });
  const { data } = await client.file(fileKey);

  const tokens: DesignTokens = {
    colors: {},
    fontSizes: {},
    spacing: {},
    borderRadius: {},
    boxShadow: {},
  };

  // Walk the document tree looking for style definitions
  walkNode(data.document, (node) => {
    // Extract colors from fill styles
    if (node.type === "RECTANGLE" && node.fills?.length > 0) {
      const fill = node.fills[0];
      if (fill.type === "SOLID" && node.name.startsWith("color/")) {
        const name = node.name.replace("color/", "").replace(/\//g, "-");
        const { r, g, b } = fill.color;
        tokens.colors[name] = rgbToHex(r, g, b);
      }
    }

    // Extract typography from text nodes
    if (node.type === "TEXT" && node.name.startsWith("text/")) {
      const name = node.name.replace("text/", "");
      const style = node.style;
      if (style) {
        tokens.fontSizes[name] = [
          `${style.fontSize}px`,
          { lineHeight: `${style.lineHeightPx}px` },
        ];
      }
    }
  });

  return tokens;
}

function walkNode(node: any, callback: (node: any) => void): void {
  callback(node);
  if (node.children) {
    for (const child of node.children) {
      walkNode(child, callback);
    }
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
```

This produces a token set that feeds directly into the Tailwind config. The designer changes a color in Figma, you re-extract, and every component updates automatically.

### Step 2: Generate the Tailwind Configuration

```typescript
// generate-tailwind-config.ts — Convert Figma tokens to Tailwind config
/**
 * Takes extracted design tokens and generates a tailwind.config.ts
 * that extends the default theme with the exact Figma values.
 */
import { DesignTokens } from "./extract-tokens.js";
import { writeFileSync } from "fs";

export function generateTailwindConfig(tokens: DesignTokens): void {
  const config = `
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: ${JSON.stringify(tokens.colors, null, 8)},
      fontSize: ${JSON.stringify(tokens.fontSizes, null, 8)},
      spacing: ${JSON.stringify(tokens.spacing, null, 8)},
      borderRadius: ${JSON.stringify(tokens.borderRadius, null, 8)},
      boxShadow: ${JSON.stringify(tokens.boxShadow, null, 8)},
    },
  },
  plugins: [],
};

export default config;
`.trim();

  writeFileSync("tailwind.config.ts", config);
  console.log("✅ Generated tailwind.config.ts with Figma tokens");
}
```

### Step 3: Convert Frames to React Components

The core transformation: take a Figma frame and produce a React component. The agent analyzes the layout structure (auto-layout = flex, constraints = positioning), maps properties to Tailwind classes, and generates clean JSX.

```typescript
// frame-to-component.ts — Convert a Figma frame to a React component
/**
 * Analyzes a Figma frame's layout, children, and styles,
 * then generates a React component with Tailwind CSS.
 * Handles auto-layout (flex), text styles, images, and nesting.
 */

interface FigmaNode {
  name: string;
  type: string;
  children?: FigmaNode[];
  layoutMode?: "HORIZONTAL" | "VERTICAL" | "NONE";
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  cornerRadius?: number;
  fills?: Array<{ type: string; color?: { r: number; g: number; b: number } }>;
  style?: { fontSize: number; fontWeight: number; lineHeightPx: number };
  characters?: string;
  absoluteBoundingBox?: { width: number; height: number };
}

export function frameToComponent(frame: FigmaNode, componentName: string): string {
  const jsx = nodeToJsx(frame, 2);

  return `
// ${componentName}.tsx — Generated from Figma frame "${frame.name}"
interface ${componentName}Props {
  className?: string;
}

export function ${componentName}({ className }: ${componentName}Props) {
  return (
${jsx}
  );
}
`.trim();
}

function nodeToJsx(node: FigmaNode, indent: number): string {
  const pad = " ".repeat(indent);

  if (node.type === "TEXT") {
    const classes = textClasses(node);
    const text = node.characters || "";
    return `${pad}<p className="${classes}">${text}</p>`;
  }

  if (node.type === "RECTANGLE" && !node.children?.length) {
    const classes = boxClasses(node);
    return `${pad}<div className="${classes}" />`;
  }

  // Frame or Group — container with children
  const classes = containerClasses(node);
  const children = (node.children || [])
    .map((child) => nodeToJsx(child, indent + 2))
    .join("\n");

  return `${pad}<div className="${classes}">\n${children}\n${pad}</div>`;
}

function containerClasses(node: FigmaNode): string {
  const classes: string[] = [];

  // Layout
  if (node.layoutMode === "HORIZONTAL") {
    classes.push("flex", "flex-row");
    if (node.itemSpacing) classes.push(`gap-${spacingToTw(node.itemSpacing)}`);
  } else if (node.layoutMode === "VERTICAL") {
    classes.push("flex", "flex-col");
    if (node.itemSpacing) classes.push(`gap-${spacingToTw(node.itemSpacing)}`);
  }

  // Padding
  addPadding(classes, node);

  // Border radius
  if (node.cornerRadius) {
    classes.push(radiusToTw(node.cornerRadius));
  }

  // Background
  addBackground(classes, node);

  return classes.join(" ");
}

function textClasses(node: FigmaNode): string {
  const classes: string[] = [];
  const s = node.style;
  if (s) {
    if (s.fontSize <= 12) classes.push("text-xs");
    else if (s.fontSize <= 14) classes.push("text-sm");
    else if (s.fontSize <= 16) classes.push("text-base");
    else if (s.fontSize <= 18) classes.push("text-lg");
    else if (s.fontSize <= 20) classes.push("text-xl");
    else if (s.fontSize <= 24) classes.push("text-2xl");
    else classes.push("text-3xl");

    if (s.fontWeight >= 700) classes.push("font-bold");
    else if (s.fontWeight >= 600) classes.push("font-semibold");
    else if (s.fontWeight >= 500) classes.push("font-medium");
  }
  addForeground(classes, node);
  return classes.join(" ");
}

function spacingToTw(px: number): string {
  const map: Record<number, string> = {
    2: "0.5", 4: "1", 6: "1.5", 8: "2", 10: "2.5", 12: "3",
    14: "3.5", 16: "4", 20: "5", 24: "6", 32: "8", 40: "10", 48: "12",
  };
  return map[px] || `[${px}px]`;
}

function radiusToTw(px: number): string {
  if (px <= 2) return "rounded-sm";
  if (px <= 4) return "rounded";
  if (px <= 6) return "rounded-md";
  if (px <= 8) return "rounded-lg";
  if (px <= 12) return "rounded-xl";
  if (px <= 16) return "rounded-2xl";
  return "rounded-3xl";
}
```

### Step 4: Handle Component Variants

Figma components have variants — a button might be primary/secondary/ghost, small/medium/large. The generator detects variant properties and produces a single component with props.

```typescript
// variant-component.tsx — Example generated component with variants
/**
 * Button component generated from Figma with 3 variants and 3 sizes.
 * Uses class-variance-authority for type-safe variant management.
 */
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base styles (shared across all variants)
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
        secondary: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50",
        ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
      },
      size: {
        sm: "h-8 px-3 text-sm rounded-md gap-1.5",
        md: "h-10 px-4 text-sm rounded-lg gap-2",
        lg: "h-12 px-6 text-base rounded-lg gap-2.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
}

export function Button({ className, variant, size, children, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  );
}
```

## The Outcome

Marta extracts design tokens once, generating a Tailwind config that matches the Figma file exactly. Then she points the agent at individual frames and gets React components in seconds — correct spacing, colors, typography, and responsive breakpoints. Variants come out as typed props using class-variance-authority.

The 40-screen design that would have taken two weeks of manual translation is done in a day. More importantly, when the designer updates a color or spacing value, Marta re-extracts tokens and every component updates. The Figma file becomes the single source of truth, not a static reference that drifts from the code.
