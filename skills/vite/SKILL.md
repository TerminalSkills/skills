---
name: vite
description: >-
  Assists with configuring and using Vite as a frontend build tool for modern web applications.
  Use when setting up dev servers, optimizing production builds, configuring plugins, migrating
  from Webpack or CRA, or building component libraries. Trigger words: vite, build tool, HMR,
  hot module replacement, vite config, rollup, bundling.
license: Apache-2.0
compatibility: "Requires Node.js 20.19+ or 22.12+ (Vite 8)"
metadata:
  author: terminal-skills
  version: "1.2.0"
  repository: https://github.com/vitejs/vite
  category: development
  tags: ["vite", "build-tool", "bundler", "frontend", "hmr"]
---

# Vite

## Overview

Vite is a next-generation frontend build tool providing instant dev server startup via native ES modules and production builds bundled by Rolldown (since Vite 8; earlier versions used Rollup and esbuild). It supports React, Vue, Svelte, and vanilla TypeScript projects with advanced bundling strategies, plugin extensibility, and library mode.

## Instructions

- To start a project run `npm create vite@latest` (or `npm create vite@latest storefront -- --template react-ts`). Vite 8 needs Node.js 20.19+ or 22.12+.
- When setting up a project, create `vite.config.ts` with the appropriate framework plugin (`@vitejs/plugin-react`, `@vitejs/plugin-vue`), configure `resolve.alias` with `@` mapping to `src/`, and set environment variables with `VITE_` prefix in `.env`, `.env.local` or `.env.[mode]` files (restart the dev server after editing them). Add `vite-env.d.ts` with an `ImportMetaEnv` interface for typed variables.
- When configuring the dev server, set up API proxying with `server.proxy`, enable HTTPS with `@vitejs/plugin-basic-ssl`, and use `server.watch` polling for containers or VMs.
- When optimizing builds, split vendor code with `build.rolldownOptions.output.codeSplitting` (Vite 8; the object form of `manualChunks` was removed and the function form is deprecated; on Vite 7 and older use `build.rollupOptions.output.manualChunks`). CSS code splitting is on by default. `build.target` defaults to `'baseline-widely-available'` (Chrome 111, Edge 111, Firefox 114, Safari 16.4).
- When creating plugins, use the Rollup-compatible plugin API with `resolveId`, `load`, and `transform` hooks, and leverage virtual modules with the `virtual:` prefix.
- When building libraries, configure `build.lib` with entry point and output formats (es, cjs, umd), externalize peer dependencies, and use `vite-plugin-dts` for TypeScript declaration generation. Default formats are `es` and `umd` for one entry, `es` and `cjs` for several; AMD and SystemJS output was removed in Vite 8.
- When upgrading to Vite 8: rename `build.rollupOptions` to `build.rolldownOptions`, expect Oxc instead of esbuild for transforms and minification (`esbuild` options are auto-converted to `oxc` but deprecated), and Lightning CSS for CSS minification. If a default import from a CommonJS package changes behavior, set `legacy.inconsistentCjsInterop: true` temporarily.
- When migrating from Webpack, replace `webpack.config.js` with `vite.config.ts`, swap loaders for Vite plugins, and update `REACT_APP_*` env vars to `VITE_*`. Create React App is no longer maintained, so this is the usual path off it.
- When integrating testing, use Vitest, which shares the Vite config (recent Vitest versions need Node 22.12+).

A typical dev setup with an alias and an API proxy:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
```

Typed environment variables (`src/vite-env.d.ts`), read with `import.meta.env.VITE_API_URL`:

```ts
interface ImportMetaEnv {
  readonly VITE_API_URL: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

## Examples

### Example 1: Migrate a Create React App project to Vite

**User request:** "Convert my CRA project to use Vite instead"

**Actions:**
1. Install Vite and `@vitejs/plugin-react`, remove react-scripts
2. Create `vite.config.ts` with React plugin and path aliases
3. Rename `REACT_APP_*` environment variables to `VITE_*`
4. Update `index.html` to reference the entry module directly

**Output:** A Vite-powered React project with faster dev startup and HMR.

### Example 2: Configure optimized production build

**User request:** "Set up Vite build with vendor chunk splitting and source maps for Sentry"

**Actions:**
1. Configure `build.rolldownOptions.output.codeSplitting` with a group `{ test: /node_modules/, name: 'vendor' }`
2. Enable `build.sourcemap` for error monitoring integration
3. Set `build.target` appropriate to browser support requirements
4. Add `build.assetsInlineLimit` tuning for small asset optimization

**Config:**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ test: /node_modules/, name: 'vendor' }] } },
    },
  },
})
```

**Output:** `npm run build` writes `dist/assets/vendor-3f9a1c2b.js` plus `.map` files. An optimized production build configuration with proper chunk splitting and debugging support.

## Guidelines

- Always use `import.meta.env.VITE_*` for client-exposed env vars, never `process.env`. `VITE_*` values end up in the browser bundle: never put API keys in them.
- Configure `resolve.alias` with `@` prefix mapping to `src/` for clean imports.
- Split vendor chunks manually when default chunking produces too many small files.
- Use `build.target: "esnext"` for modern-only apps, `@vitejs/plugin-legacy` for browsers older than the default target.
- Native decorators are not supported by the Vite 8 transform yet; use a Babel or SWC plugin.
- `build.sourcemap` is off by default; enable it for error monitoring tools, and do not serve the maps publicly if the source is private.
- Keep `vite.config.ts` clean by extracting complex plugin configs into separate files.
- Use `optimizeDeps.include` to pre-bundle problematic dependencies that break during dev.
