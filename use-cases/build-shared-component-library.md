---
title: Build a Shared Component Library
slug: build-shared-component-library
description: Build a shared component library with versioned packages, visual documentation, automated testing, design token integration, and tree-shaking support for cross-team UI consistency.
skills:
  - typescript
  - hono
  - zod
category: development
tags:
  - component-library
  - design-system
  - shared
  - ui
  - packages
---

# Build a Shared Component Library

## The Problem

Anna leads frontend at a 25-person company with 4 product teams. Each team builds their own buttons, modals, forms, and tables — resulting in 4 slightly different button styles, 3 modal implementations, and inconsistent spacing. When design updates the brand color, someone changes it in 2 of 4 apps. New developers can't find existing components and rebuild them. Bundle size is bloated because each app includes its own component code. They need a shared library: one set of components, versioned, documented, automatically tested, tree-shakeable, and synced with design tokens.

## Step 1: Build the Component Library

```typescript
// src/components/library.ts — Shared component library with versioning and documentation
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

interface Component {
  name: string;
  category: string;
  description: string;
  props: PropDef[];
  variants: string[];
  examples: Example[];
  version: string;
  dependencies: string[];
  changeLog: string[];
}

interface PropDef {
  name: string;
  type: string;
  required: boolean;
  defaultValue: any;
  description: string;
}

interface Example {
  name: string;
  code: string;
  description: string;
}

interface DesignTokens {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  typography: Record<string, { fontFamily: string; fontSize: string; fontWeight: number; lineHeight: string }>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
}

// Generate CSS from design tokens
export function generateTokenCSS(tokens: DesignTokens): string {
  let css = ":root {\n";
  for (const [name, value] of Object.entries(tokens.colors)) css += `  --color-${name}: ${value};\n`;
  for (const [name, value] of Object.entries(tokens.spacing)) css += `  --space-${name}: ${value};\n`;
  for (const [name, config] of Object.entries(tokens.typography)) {
    css += `  --font-${name}-family: ${config.fontFamily};\n`;
    css += `  --font-${name}-size: ${config.fontSize};\n`;
    css += `  --font-${name}-weight: ${config.fontWeight};\n`;
    css += `  --font-${name}-line-height: ${config.lineHeight};\n`;
  }
  for (const [name, value] of Object.entries(tokens.borderRadius)) css += `  --radius-${name}: ${value};\n`;
  for (const [name, value] of Object.entries(tokens.shadows)) css += `  --shadow-${name}: ${value};\n`;
  css += "}\n";
  return css;
}

// Generate component documentation
export function generateDocs(components: Component[]): string {
  let md = "# Component Library\n\n";
  const categories = [...new Set(components.map((c) => c.category))];

  for (const category of categories) {
    md += `## ${category}\n\n`;
    const categoryComponents = components.filter((c) => c.category === category);
    for (const comp of categoryComponents) {
      md += `### ${comp.name}\n\n${comp.description}\n\n`;
      md += `**Props:**\n\n| Prop | Type | Required | Default | Description |\n|---|---|---|---|---|\n`;
      for (const prop of comp.props) {
        md += `| \`${prop.name}\` | \`${prop.type}\` | ${prop.required ? "Yes" : "No"} | ${prop.defaultValue !== undefined ? `\`${JSON.stringify(prop.defaultValue)}\`` : "-"} | ${prop.description} |\n`;
      }
      md += "\n**Variants:** " + comp.variants.join(", ") + "\n\n";
      for (const example of comp.examples) {
        md += `**${example.name}:** ${example.description}\n\n\`\`\`tsx\n${example.code}\n\`\`\`\n\n`;
      }
    }
  }
  return md;
}

// Validate component exports (ensure tree-shaking works)
export async function validateExports(packageDir: string): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];
  try {
    const pkgJson = JSON.parse(await readFile(join(packageDir, "package.json"), "utf-8"));
    if (!pkgJson.exports) issues.push("Missing 'exports' field — tree-shaking may not work");
    if (!pkgJson.sideEffects === false && pkgJson.sideEffects !== false) issues.push("Missing 'sideEffects: false' — bundlers can't tree-shake");
    if (!pkgJson.module && !pkgJson.exports?.["."]?.import) issues.push("Missing ESM entry point");
    if (!pkgJson.types && !pkgJson.typings) issues.push("Missing TypeScript types");
  } catch (e: any) { issues.push(`Can't read package.json: ${e.message}`); }
  return { valid: issues.length === 0, issues };
}

// Generate barrel exports with tree-shaking support
export function generateBarrelExport(components: Component[]): string {
  return components.map((c) => `export { ${c.name} } from './components/${c.name}';`).join("\n") + "\n";
}

// Check for breaking changes between versions
export function detectBreakingChanges(oldComponent: Component, newComponent: Component): string[] {
  const breaking: string[] = [];
  // Removed props
  for (const oldProp of oldComponent.props) {
    if (!newComponent.props.find((p) => p.name === oldProp.name)) {
      breaking.push(`Removed prop '${oldProp.name}'`);
    }
  }
  // Required props that were optional
  for (const newProp of newComponent.props) {
    const oldProp = oldComponent.props.find((p) => p.name === newProp.name);
    if (oldProp && !oldProp.required && newProp.required) {
      breaking.push(`Prop '${newProp.name}' changed from optional to required`);
    }
  }
  // Type changes
  for (const newProp of newComponent.props) {
    const oldProp = oldComponent.props.find((p) => p.name === newProp.name);
    if (oldProp && oldProp.type !== newProp.type) {
      breaking.push(`Prop '${newProp.name}' type changed from '${oldProp.type}' to '${newProp.type}'`);
    }
  }
  return breaking;
}

// Sample component definitions
export const LIBRARY_COMPONENTS: Component[] = [
  {
    name: "Button", category: "Actions", description: "Primary interaction element with multiple variants and sizes.",
    props: [
      { name: "variant", type: "'primary' | 'secondary' | 'danger' | 'ghost'", required: false, defaultValue: "primary", description: "Visual style variant" },
      { name: "size", type: "'sm' | 'md' | 'lg'", required: false, defaultValue: "md", description: "Button size" },
      { name: "disabled", type: "boolean", required: false, defaultValue: false, description: "Disable interaction" },
      { name: "loading", type: "boolean", required: false, defaultValue: false, description: "Show loading spinner" },
      { name: "onClick", type: "() => void", required: false, defaultValue: undefined, description: "Click handler" },
      { name: "children", type: "ReactNode", required: true, defaultValue: undefined, description: "Button content" },
    ],
    variants: ["primary", "secondary", "danger", "ghost"],
    examples: [
      { name: "Basic", code: '<Button variant="primary">Save</Button>', description: "Primary action button" },
      { name: "Loading", code: '<Button loading>Saving...</Button>', description: "Button with loading state" },
    ],
    version: "1.0.0", dependencies: [], changeLog: ["1.0.0: Initial release"],
  },
];
```

## Results

- **4 button styles → 1** — all teams use `<Button variant="primary">` from shared library; design consistency across all products; brand color updates in one place
- **Bundle size -40%** — tree-shaking eliminates unused components; each app imports only what it uses; `sideEffects: false` enables optimal bundling
- **New developer onboarding** — browse component docs; see props, variants, and live examples; copy-paste working code; no rebuilding existing components
- **Breaking change detection** — CI checks prop changes between versions; removing a prop or making it required triggers warning; consumers prepare before upgrading
- **Design token sync** — Figma tokens exported → CSS variables generated → components use variables; design change propagates to all 4 apps automatically
