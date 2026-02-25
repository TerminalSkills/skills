---
title: Migrate a Webpack Project to Vite for Faster Builds
slug: migrate-webpack-to-vite-for-faster-builds
description: Convert a React + Webpack application to Vite, cutting dev server startup from 45 seconds to under 1 second and production builds from 4 minutes to 40 seconds — while preserving all existing functionality.
skills:
  - vite
  - trpc
category: development
tags:
  - build-tools
  - vite
  - webpack
  - migration
  - performance
---

# Migrate a Webpack Project to Vite for Faster Builds

Kai leads frontend at a 30-person fintech company. Their React dashboard has grown to 1,200 components across 180,000 lines of TypeScript. The Webpack dev server takes 45 seconds to start, HMR updates take 3-8 seconds, and production builds run for 4 minutes in CI. Developers have started keeping a browser tab open to Twitter while waiting for rebuilds. He wants to migrate to Vite without breaking the app or disrupting the team's sprint.

## Step 1 — Audit the Webpack Configuration

Before touching any code, map every Webpack feature the project actually uses. Most projects use 20% of their Webpack config — the rest is cargo-culted from Stack Overflow answers circa 2019.

```typescript
// scripts/audit-webpack-config.ts — Analyze webpack config dependencies.
// Categorizes each loader/plugin as "has Vite equivalent", "needs workaround",
// or "can be dropped". Run this first to estimate migration effort.

import * as fs from "fs";
import * as path from "path";

interface ConfigAudit {
  loaders: { name: string; viteEquivalent: string; effort: "drop-in" | "config" | "plugin" | "custom" }[];
  plugins: { name: string; viteEquivalent: string; effort: "drop-in" | "config" | "plugin" | "custom" }[];
  envVars: string[];
  aliases: Record<string, string>;
  proxyRoutes: string[];
}

function auditWebpackConfig(configPath: string): ConfigAudit {
  const config = require(configPath);
  const resolved = typeof config === "function" ? config({}, { mode: "development" }) : config;

  // Extract all loaders from module.rules
  const loaders = (resolved.module?.rules || []).flatMap((rule: any) => {
    const uses = Array.isArray(rule.use) ? rule.use : [rule.use].filter(Boolean);
    return uses.map((use: any) => {
      const name = typeof use === "string" ? use : use.loader;
      return mapLoaderToVite(name);
    });
  });

  // Extract environment variables from DefinePlugin
  const definePlugin = resolved.plugins?.find(
    (p: any) => p.constructor.name === "DefinePlugin"
  );
  const envVars = definePlugin
    ? Object.keys(definePlugin.definitions).filter((k) => k.startsWith("process.env."))
    : [];

  // Extract aliases
  const aliases = resolved.resolve?.alias || {};

  // Extract dev server proxy routes
  const proxyRoutes = Object.keys(resolved.devServer?.proxy || {});

  return { loaders, plugins: mapPlugins(resolved.plugins), envVars, aliases, proxyRoutes };
}
```

Common findings: `babel-loader` and `ts-loader` are unnecessary (Vite uses esbuild), `css-loader` + `style-loader` are built-in, `file-loader` and `url-loader` are handled natively. The audit typically reveals that 60-70% of the Webpack config has zero-config Vite equivalents.

## Step 2 — Create the Vite Configuration

The Vite config replaces 200+ lines of Webpack configuration with ~40 lines. Most features that required loaders and plugins in Webpack are built into Vite.

```typescript
// vite.config.ts — Complete Vite configuration replacing webpack.config.js.
// Each section maps to a specific Webpack feature, commented with the original
// Webpack equivalent for the team's reference during the transition.

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";  // Replaces @svgr/webpack
import path from "path";

export default defineConfig(({ mode }) => {
  // Load .env files (replaces dotenv-webpack)
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react({
        // Uses SWC by default — faster than babel-loader + @babel/preset-react
        // If you need specific Babel plugins, add them here:
        // babel: { plugins: ["babel-plugin-styled-components"] },
      }),
      svgr({
        // import { ReactComponent as Logo } from "./logo.svg" still works
        svgrOptions: { icon: true },
      }),
    ],

    resolve: {
      alias: {
        // Replaces resolve.alias in webpack.config.js
        "@": path.resolve(__dirname, "src"),
        "@components": path.resolve(__dirname, "src/components"),
        "@hooks": path.resolve(__dirname, "src/hooks"),
        "@utils": path.resolve(__dirname, "src/utils"),
        "@assets": path.resolve(__dirname, "src/assets"),
      },
    },

    server: {
      port: 3000,  // Match the old Webpack dev server port
      proxy: {
        // Replaces devServer.proxy — same route mapping
        "/api": {
          target: env.API_URL || "http://localhost:8080",
          changeOrigin: true,
          // Rewrite /api/users → /users on the backend
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/ws": {
          target: env.WS_URL || "ws://localhost:8080",
          ws: true,  // WebSocket proxy
        },
      },
    },

    build: {
      sourcemap: true,  // Keep source maps for error monitoring (Sentry)
      rollupOptions: {
        output: {
          // Replaces splitChunks in Webpack — explicit vendor chunk splitting
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "class-variance-authority"],
            "vendor-charts": ["recharts", "d3-scale", "d3-shape"],
            "vendor-dates": ["date-fns", "date-fns-tz"],
          },
        },
      },
      // Target modern browsers only — drops IE11 polyfills (saves ~40KB)
      target: "es2020",
      // Warn if any chunk exceeds 500KB (was 1MB in Webpack)
      chunkSizeWarningLimit: 500,
    },

    // Replaces DefinePlugin for compile-time constants
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },

    css: {
      modules: {
        // Matches the CSS Modules naming convention from css-loader
        localsConvention: "camelCaseOnly",
      },
      preprocessorOptions: {
        scss: {
          // Replaces sass-loader's additionalData option
          additionalData: `@use "@/styles/variables" as *;`,
        },
      },
    },
  };
});
```

The `manualChunks` configuration is the most important optimization decision. Grouping vendors by update frequency means React (changes quarterly) doesn't invalidate the charts bundle (changes weekly) when upgraded.

## Step 3 — Migrate Environment Variables

Webpack projects typically use `process.env.REACT_APP_*` (Create React App convention) or `process.env.NODE_ENV` via DefinePlugin. Vite uses `import.meta.env.VITE_*` instead.

```typescript
// scripts/migrate-env-vars.ts — Automated environment variable migration.
// Scans all source files and replaces process.env.REACT_APP_* with
// import.meta.env.VITE_* references. Also updates .env files.

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

async function migrateEnvVars(srcDir: string) {
  const files = await glob(`${srcDir}/**/*.{ts,tsx,js,jsx}`, {
    ignore: ["**/node_modules/**", "**/dist/**"],
  });

  const replacements: Record<string, string> = {
    "process.env.NODE_ENV": "import.meta.env.MODE",
    "process.env.PUBLIC_URL": "import.meta.env.BASE_URL",
  };

  let totalReplacements = 0;

  for (const file of files) {
    let content = fs.readFileSync(file, "utf-8");
    let fileChanged = false;

    // Replace REACT_APP_* → VITE_* pattern
    const reactAppPattern = /process\.env\.REACT_APP_(\w+)/g;
    content = content.replace(reactAppPattern, (match, varName) => {
      fileChanged = true;
      totalReplacements++;
      return `import.meta.env.VITE_${varName}`;
    });

    // Replace known mappings
    for (const [old, replacement] of Object.entries(replacements)) {
      if (content.includes(old)) {
        content = content.replaceAll(old, replacement);
        fileChanged = true;
        totalReplacements++;
      }
    }

    if (fileChanged) {
      fs.writeFileSync(file, content);
      console.log(`  Updated: ${path.relative(srcDir, file)}`);
    }
  }

  // Migrate .env files
  for (const envFile of [".env", ".env.local", ".env.development", ".env.production"]) {
    const envPath = path.join(srcDir, "..", envFile);
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, "utf-8");
      envContent = envContent.replace(/^REACT_APP_/gm, "VITE_");
      fs.writeFileSync(envPath, envContent);
      console.log(`  Migrated: ${envFile}`);
    }
  }

  console.log(`\nTotal replacements: ${totalReplacements} across ${files.length} files`);
}
```

The migration script handles the mechanical find-and-replace, but there's one subtlety worth knowing: `process.env.NODE_ENV` in Webpack is replaced at build time with the literal string `"production"` or `"development"`. In Vite, `import.meta.env.MODE` does the same thing but also supports custom modes like `"staging"`.

## Step 4 — Handle Edge Cases and Common Gotchas

Every Webpack-to-Vite migration hits a handful of friction points. These are the patterns that break and their fixes.

```typescript
// src/utils/dynamic-imports.ts — Fix dynamic imports that use variables.
// Webpack's require.context() doesn't exist in Vite.
// Vite uses import.meta.glob() instead, which is statically analyzable.

// BEFORE (Webpack) — require.context for loading all icons dynamically:
// const iconContext = require.context("./icons", false, /\.svg$/);
// const icons = iconContext.keys().map(iconContext);

// AFTER (Vite) — import.meta.glob with eager loading:
const iconModules = import.meta.glob<{ default: string }>(
  "./icons/*.svg",
  { eager: true }
);

// Transform into a lookup map: { "arrow-left": "/src/icons/arrow-left.svg" }
export const icons = Object.fromEntries(
  Object.entries(iconModules).map(([path, module]) => {
    const name = path.split("/").pop()?.replace(".svg", "") || "";
    return [name, module.default];
  })
);
```

```typescript
// src/env.d.ts — TypeScript declarations for Vite environment variables.
// Without this file, import.meta.env.VITE_* has type `string | undefined`.
// This gives the team autocomplete and type safety for env vars.

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_POSTHOG_KEY: string;
  readonly VITE_STRIPE_PUBLIC_KEY: string;
  readonly VITE_FEATURE_NEW_DASHBOARD: string;  // "true" | "false"
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

```typescript
// vite.config.ts addition — Handle CommonJS dependencies that break in dev.
// Some older npm packages don't ship ESM. Vite pre-bundles them with esbuild,
// but occasionally one slips through. Force-include problematic packages.

export default defineConfig({
  optimizeDeps: {
    include: [
      "lodash-es",            // Some lodash imports use CJS internally
      "react-pdf",            // PDF.js worker has CJS dependencies
      "xlsx",                 // SheetJS is CommonJS only
    ],
    exclude: [
      "@ffmpeg/ffmpeg",       // Has its own WASM loading — pre-bundling breaks it
    ],
  },
});
```

The `optimizeDeps.include` list is the most common source of "it works in Webpack but breaks in Vite" issues. When a dependency throws `Uncaught SyntaxError: The requested module does not provide an export named 'default'`, adding it to this list usually fixes it.

## Step 5 — Update CI Pipeline and Verify Production Build

```yaml
# .github/workflows/ci.yml — Updated CI pipeline for Vite.
# Key change: build command and output directory.

name: CI
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"
      - run: npm ci
      - run: npm run build        # vite build (was: webpack --mode production)
      - run: npm run test          # vitest (was: jest)

      # Bundle size check — catch regressions before merge
      - name: Check bundle size
        run: |
          TOTAL=$(du -sb dist/assets/*.js | awk '{sum+=$1} END {print sum}')
          MAX=$((2 * 1024 * 1024))  # 2MB JS budget
          if [ "$TOTAL" -gt "$MAX" ]; then
            echo "::error::JS bundle exceeds 2MB budget: $(($TOTAL / 1024))KB"
            exit 1
          fi
          echo "Bundle size: $(($TOTAL / 1024))KB ✓"
```

## Results

Kai ran the migration across two sprints, converting the project incrementally (Vite and Webpack ran in parallel for one week as a safety net):

- **Dev server startup: 45 seconds → 800ms** — Vite serves source files as native ES modules, skipping the bundling step entirely. First page load in dev takes ~2 seconds as Vite pre-bundles dependencies on demand.
- **HMR updates: 3-8 seconds → 50-150ms** — editing a component reflects in the browser before the developer's eyes move from the editor to the browser.
- **Production build: 4 minutes → 38 seconds** — esbuild handles TypeScript transpilation 20-100x faster than Babel. Rollup's tree-shaking also produces slightly smaller bundles.
- **Bundle size: 2.8MB → 2.1MB** — better tree-shaking and dropping IE11 polyfills saved 700KB. The `manualChunks` split improved cache hit rates by 35%.
- **CI pipeline: 6 minutes → 2.5 minutes** — faster builds plus Vitest (which shares Vite's config) replacing Jest cut total CI time.
- **Webpack config removed: 247 lines → 42 lines** of Vite config. Four loader packages and six plugins uninstalled from `devDependencies`.
