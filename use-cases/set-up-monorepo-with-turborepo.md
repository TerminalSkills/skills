---
title: Set Up a Monorepo with Turborepo
slug: set-up-monorepo-with-turborepo
description: Structure a multi-app TypeScript monorepo with Turborepo, shared packages, and a CI pipeline that only builds what changed — cutting CI time from 25 minutes to under 4 minutes.
skills:
  - turborepo
  - vite
  - github-actions
category: development
tags:
  - monorepo
  - ci-cd
  - typescript
  - build-tools
  - dx
---

# Set Up a Monorepo with Turborepo

Nik runs platform engineering at a 40-person SaaS company with three frontend apps (customer dashboard, admin panel, marketing site), two API services, and a growing collection of shared packages. Each app lives in its own repo. Duplicated utility code, mismatched TypeScript configs, and incompatible component library versions cause at least two bugs per sprint. He wants a monorepo that shares code safely, builds only what changed, and doesn't turn CI into a 45-minute bottleneck.

## Step 1 — Structure the Monorepo with pnpm Workspaces

The directory structure separates applications from shared packages. Applications import from shared packages via workspace dependencies, and Turborepo manages the build order.

```yaml
# pnpm-workspace.yaml — Declare workspace package locations.
# pnpm resolves workspace:* dependencies automatically.

packages:
  - "apps/*"
  - "packages/*"
```

```
monorepo/
├── apps/
│   ├── web/              # Customer dashboard (Next.js)
│   ├── admin/            # Admin panel (Vite + React)
│   └── marketing/        # Marketing site (Astro)
├── packages/
│   ├── ui/               # Shared React component library
│   ├── db/               # Prisma schema and client
│   ├── auth/             # Authentication utilities
│   ├── tsconfig/         # Shared TypeScript configs
│   └── eslint-config/    # Shared ESLint presets
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

```json
// turbo.json — Pipeline definition.
// The ^ prefix in dependsOn means "run this task in dependency packages first".
// So building @app/web first builds @repo/ui and @repo/db that it imports.
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "globalEnv": ["NODE_ENV", "CI"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"],
      "env": ["NEXT_PUBLIC_*", "VITE_*"]
    },
    "dev": {
      "dependsOn": ["^build"],
      "persistent": true,
      "cache": false
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "env": ["DATABASE_URL"]
    },
    "lint": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

The `outputs` arrays are critical for caching correctness. When Turborepo hits a cache match, it restores these directories from cache instead of running the task. An incorrect `outputs` definition means either stale builds (missing files) or cache misses (listing files that change on every run).

## Step 2 — Build the Shared UI Package

The UI package exports React components that both the dashboard and admin panel consume. It builds with Vite in library mode, producing both ESM and CJS outputs with TypeScript declarations.

```json
// packages/ui/package.json — Shared component library.
// "exports" field tells Node and bundlers exactly where to find each format.
{
  "name": "@repo/ui",
  "version": "0.0.0",
  "private": true,
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./styles.css": "./dist/style.css"
  },
  "scripts": {
    "build": "vite build && tsc --emitDeclarationOnly",
    "dev": "vite build --watch",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/tsconfig": "workspace:*",
    "vite": "^6.0.0",
    "react": "^19.0.0"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0"
  }
}
```

```typescript
// packages/ui/src/components/Button.tsx — Example shared component.
// Exported from the package index, consumed by both apps.

import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-blue-600 text-white hover:bg-blue-700",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        ghost: "hover:bg-gray-100",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonVariants({ variant, size, className })}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
      {children}
    </button>
  )
);
Button.displayName = "Button";
```

## Step 3 — Configure the Shared Database Package

The database package wraps Prisma and exports a typed client that both API services and the Next.js app use. Schema changes propagate to all consumers automatically.

```typescript
// packages/db/src/index.ts — Prisma client singleton.
// Re-exports the generated client so consumers import from @repo/db,
// not directly from @prisma/client (which would create multiple instances).

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Reuse client in development to avoid exhausting database connections
// during Next.js hot reloads (each reload creates a new module scope)
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Re-export types so consumers don't need @prisma/client as a dependency
export type { User, Post, Comment, Team } from "@prisma/client";
export { Prisma } from "@prisma/client";
```

## Step 4 — Set Up CI with Turborepo Remote Cache

The CI pipeline uses Turborepo's remote cache to share build artifacts between PR runs. If the `@repo/ui` package hasn't changed since the last push, CI skips its build entirely and restores the cached output.

```yaml
# .github/workflows/ci.yml — Monorepo CI with Turborepo caching.
# turbo prune creates a minimal workspace for Docker builds.

name: CI
on:
  push:
    branches: [main]
  pull_request:

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # Need parent commit for change detection

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      # Run all checks in parallel — Turborepo handles the dependency graph
      - name: Lint, typecheck, test, build
        run: pnpm turbo run lint typecheck test build

      # Print cache hit summary for debugging slow CI
      - name: Build summary
        run: pnpm turbo run build --summarize | tail -20

  # Deploy only changed apps
  deploy-web:
    needs: check
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm install --frozen-lockfile

      # turbo prune generates a minimal package.json + lockfile
      # for just @app/web and its workspace dependencies
      - name: Prune for web app
        run: pnpm turbo prune @app/web --docker

      # The pruned output is a minimal workspace — perfect for Docker COPY
      - name: Build Docker image
        run: |
          docker build -f apps/web/Dockerfile \
            --build-arg TURBO_TOKEN=$TURBO_TOKEN \
            --build-arg TURBO_TEAM=$TURBO_TEAM \
            -t web:${{ github.sha }} \
            out/
```

```dockerfile
# apps/web/Dockerfile — Multi-stage build using pruned monorepo.
# Stage 1 installs deps from the pruned lockfile (only @app/web's deps).
# Stage 2 builds with Turborepo cache. Stage 3 is the minimal runtime.

FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY pruned/json/ .
COPY pruned/pnpm-lock.yaml .
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/ .
COPY pruned/full/ .
ARG TURBO_TOKEN
ARG TURBO_TEAM
RUN pnpm turbo run build --filter=@app/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

The `turbo prune --docker` command is the key optimization. Instead of copying the entire monorepo (with all apps and packages) into Docker, it produces a minimal subset: only the files needed by `@app/web` and its transitive dependencies. This slashes Docker build context from ~500MB to ~50MB.

## Results

Nik's team completed the migration over three weeks, moving one repo per week into the monorepo:

- **CI time: 25 minutes → 3.5 minutes** — Turborepo's remote cache means most packages hit cache. A typical PR that touches one app rebuilds only that app; shared packages are restored from cache in seconds.
- **Cross-app bugs: 2 per sprint → 0** — shared packages (`@repo/ui`, `@repo/db`, `@repo/auth`) guarantee all apps use the same version. Changing a component in `@repo/ui` immediately shows type errors in any app that uses it incorrectly.
- **Duplicate code: ~12,000 lines removed** — utility functions, API clients, TypeScript configs, and ESLint rules consolidated into shared packages.
- **New developer setup: 4 repos + README hunting → `pnpm install && pnpm dev`** — one command starts all services with hot reload.
- **Docker image size: 1.2GB → 180MB** — `turbo prune` produces minimal images. Build time dropped from 12 minutes to 2 minutes.
- **Dependency sync**: upgrading React across all three apps is now a single PR instead of three coordinated PRs across three repos.
