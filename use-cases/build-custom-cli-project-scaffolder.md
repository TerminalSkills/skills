---
title: Build a Custom CLI Project Scaffolder
slug: build-custom-cli-project-scaffolder
description: Build an interactive CLI tool that scaffolds new projects from templates with prompts, file generation, git init, and dependency installation — standardizing how your team starts new services.
skills:
  - typescript
  - zod
  - vitest
category: Developer Experience
tags:
  - cli
  - scaffolding
  - templates
  - developer-tools
  - code-generation
---

# Build a Custom CLI Project Scaffolder

## The Problem

Tomas leads platform engineering at a 60-person fintech. Every new microservice starts with 2-3 hours of boilerplate: copying from an existing service, ripping out business logic, updating configs, fixing import paths. The resulting services are inconsistent — some use different linting configs, others skip health checks, and a few have outdated Docker configurations. When the team mandated mTLS last quarter, they had to patch 14 services individually because none shared a common base. A scaffolding CLI would enforce standards while saving 200+ engineer-hours per quarter.

## Step 1: Build the CLI Framework with Interactive Prompts

The CLI collects project requirements through an interactive flow: service name, type, features to include. Each answer shapes which template files get generated.

```typescript
// src/cli.ts — Interactive CLI entry point with prompt-driven configuration
import { intro, outro, text, select, multiselect, confirm, spinner } from "@clack/prompts";
import { z } from "zod";
import { generateProject } from "./generator";

// Validated project configuration schema
const ProjectConfigSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, "Must be lowercase kebab-case"),
  type: z.enum(["api", "worker", "gateway", "fullstack"]),
  features: z.array(z.string()),
  database: z.enum(["postgres", "none"]).optional(),
  auth: z.boolean(),
  docker: z.boolean(),
  cicd: z.enum(["github-actions", "gitlab-ci", "none"]),
  outputDir: z.string(),
});

type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export async function run() {
  intro("🏗️  Project Scaffolder — New Service Setup");

  const name = await text({
    message: "Service name (kebab-case):",
    placeholder: "payment-processor",
    validate: (value) => {
      if (!/^[a-z][a-z0-9-]*$/.test(value)) return "Must be lowercase kebab-case (a-z, 0-9, -)";
    },
  });
  if (typeof name === "symbol") process.exit(0);

  const type = await select({
    message: "Service type:",
    options: [
      { value: "api",       label: "REST API",       hint: "Hono + Zod + OpenAPI" },
      { value: "worker",    label: "Background Worker", hint: "BullMQ + Redis" },
      { value: "gateway",   label: "API Gateway",    hint: "Routing + rate limiting + auth" },
      { value: "fullstack", label: "Full-Stack App",  hint: "Next.js + API routes" },
    ],
  });
  if (typeof type === "symbol") process.exit(0);

  const features = await multiselect({
    message: "Include features:",
    options: [
      { value: "health-check",  label: "Health check endpoint", hint: "/health + /ready" },
      { value: "opentelemetry", label: "OpenTelemetry tracing", hint: "Distributed tracing" },
      { value: "error-tracking", label: "Error tracking",       hint: "Sentry integration" },
      { value: "rate-limiting", label: "Rate limiting",         hint: "Redis-based" },
      { value: "caching",      label: "Redis caching",          hint: "Cache layer" },
      { value: "testing",      label: "Test setup",             hint: "Vitest + fixtures" },
    ],
    required: false,
  });
  if (typeof features === "symbol") process.exit(0);

  const database = ["api", "fullstack"].includes(type as string)
    ? await select({
        message: "Database:",
        options: [
          { value: "postgres", label: "PostgreSQL", hint: "Drizzle ORM + migrations" },
          { value: "none",     label: "None" },
        ],
      })
    : "none";

  const auth = await confirm({ message: "Include authentication?" });
  if (typeof auth === "symbol") process.exit(0);

  const docker = await confirm({ message: "Include Dockerfile + compose?" });
  if (typeof docker === "symbol") process.exit(0);

  const cicd = await select({
    message: "CI/CD pipeline:",
    options: [
      { value: "github-actions", label: "GitHub Actions" },
      { value: "gitlab-ci",      label: "GitLab CI" },
      { value: "none",           label: "None" },
    ],
  });
  if (typeof cicd === "symbol") process.exit(0);

  const config = ProjectConfigSchema.parse({
    name,
    type,
    features,
    database,
    auth,
    docker,
    cicd,
    outputDir: `./${name}`,
  });

  const s = spinner();
  s.start("Generating project...");

  const result = await generateProject(config);

  s.stop(`Created ${result.filesCreated} files in ${config.outputDir}/`);

  outro(`
    Next steps:
      cd ${config.name}
      npm install
      cp .env.example .env
      npm run dev
  `);
}
```

## Step 2: Build the Template Engine

Templates use EJS-style markers for conditional sections and variable interpolation. Each template file maps to an output path, and features toggle which files get included.

```typescript
// src/generator.ts — Template-based file generation engine
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

interface GeneratorResult {
  filesCreated: number;
  outputDir: string;
}

interface ProjectConfig {
  name: string;
  type: string;
  features: string[];
  database?: string;
  auth: boolean;
  docker: boolean;
  cicd: string;
  outputDir: string;
}

// Template registry — maps config options to file generators
const FILE_GENERATORS: Array<{
  condition: (config: ProjectConfig) => boolean;
  files: (config: ProjectConfig) => Array<{ path: string; content: string }>;
}> = [
  // Always included: base project files
  {
    condition: () => true,
    files: (config) => [
      {
        path: "package.json",
        content: generatePackageJson(config),
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            outDir: "dist",
            rootDir: "src",
            declaration: true,
            sourceMap: true,
            esModuleInterop: true,
            skipLibCheck: true,
          },
          include: ["src/**/*"],
        }, null, 2),
      },
      {
        path: ".env.example",
        content: generateEnvExample(config),
      },
      {
        path: ".gitignore",
        content: "node_modules/\ndist/\n.env\n*.log\ncoverage/\n",
      },
      {
        path: "README.md",
        content: generateReadme(config),
      },
    ],
  },

  // API server entry point
  {
    condition: (c) => ["api", "gateway"].includes(c.type),
    files: (config) => [
      {
        path: "src/index.ts",
        content: generateApiEntry(config),
      },
      {
        path: "src/routes/index.ts",
        content: `// ${config.name} routes\nimport { Hono } from "hono";\n\nconst app = new Hono();\n\napp.get("/", (c) => c.json({ service: "${config.name}", status: "ok" }));\n\nexport default app;\n`,
      },
    ],
  },

  // Health check endpoint
  {
    condition: (c) => c.features.includes("health-check"),
    files: (config) => [
      {
        path: "src/routes/health.ts",
        content: `// Health check endpoints for load balancer and readiness probes
import { Hono } from "hono";
${config.database === "postgres" ? 'import { pool } from "../db";\n' : ""}
const health = new Hono();

// Liveness probe — is the process running?
health.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// Readiness probe — can the service handle requests?
health.get("/ready", async (c) => {
  const checks: Record<string, boolean> = {};
  
  ${config.database === "postgres" ? `try {
    await pool.query("SELECT 1");
    checks.database = true;
  } catch {
    checks.database = false;
  }` : ""}

  const ready = Object.values(checks).every(Boolean);
  return c.json({ ready, checks }, ready ? 200 : 503);
});

export default health;
`,
      },
    ],
  },

  // Database setup
  {
    condition: (c) => c.database === "postgres",
    files: (config) => [
      {
        path: "src/db/index.ts",
        content: `// Database connection pool
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);
`,
      },
      {
        path: "src/db/schema.ts",
        content: `// Drizzle ORM schema — add your tables here
import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const examples = pgTable("examples", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
`,
      },
      {
        path: "drizzle.config.ts",
        content: `import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
`,
      },
    ],
  },

  // Docker support
  {
    condition: (c) => c.docker,
    files: (config) => [
      {
        path: "Dockerfile",
        content: `# Multi-stage build for ${config.name}
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
`,
      },
      {
        path: "docker-compose.yml",
        content: generateDockerCompose(config),
      },
    ],
  },

  // GitHub Actions CI
  {
    condition: (c) => c.cicd === "github-actions",
    files: (config) => [
      {
        path: ".github/workflows/ci.yml",
        content: `name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    ${config.database === "postgres" ? `services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5` : ""}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
        ${config.database === "postgres" ? `env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test` : ""}
`,
      },
    ],
  },

  // Test setup
  {
    condition: (c) => c.features.includes("testing"),
    files: (config) => [
      {
        path: "vitest.config.ts",
        content: `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["node_modules/", "dist/", "**/*.config.*"],
    },
  },
});
`,
      },
      {
        path: "src/__tests__/example.test.ts",
        content: `import { describe, it, expect } from "vitest";

describe("${config.name}", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });
});
`,
      },
    ],
  },
];

export async function generateProject(config: ProjectConfig): Promise<GeneratorResult> {
  let filesCreated = 0;

  for (const generator of FILE_GENERATORS) {
    if (!generator.condition(config)) continue;

    const files = generator.files(config);
    for (const file of files) {
      const fullPath = join(config.outputDir, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, "utf-8");
      filesCreated++;
    }
  }

  // Initialize git repo
  execSync("git init", { cwd: config.outputDir, stdio: "ignore" });
  filesCreated++; // count .git

  return { filesCreated, outputDir: config.outputDir };
}

function generatePackageJson(config: ProjectConfig): string {
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {
    typescript: "^5.5.0",
    "@types/node": "^22.0.0",
  };

  if (["api", "gateway"].includes(config.type)) {
    deps.hono = "^4.0.0";
    deps.zod = "^3.23.0";
  }
  if (config.database === "postgres") {
    deps["drizzle-orm"] = "^0.33.0";
    deps.pg = "^8.12.0";
    devDeps["drizzle-kit"] = "^0.24.0";
    devDeps["@types/pg"] = "^8.11.0";
  }
  if (config.features.includes("testing")) {
    devDeps.vitest = "^2.0.0";
  }
  if (config.features.includes("opentelemetry")) {
    deps["@opentelemetry/api"] = "^1.9.0";
    deps["@opentelemetry/sdk-node"] = "^0.52.0";
  }

  return JSON.stringify({
    name: config.name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "tsx watch src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
      lint: "tsc --noEmit",
      ...(config.features.includes("testing") ? { test: "vitest run", "test:watch": "vitest" } : {}),
      ...(config.database === "postgres" ? { "db:push": "drizzle-kit push", "db:generate": "drizzle-kit generate" } : {}),
    },
    dependencies: deps,
    devDependencies: devDeps,
  }, null, 2);
}

function generateEnvExample(config: ProjectConfig): string {
  const lines = [`# ${config.name} environment variables`, "NODE_ENV=development", "PORT=3000"];
  if (config.database === "postgres") lines.push("DATABASE_URL=postgresql://user:pass@localhost:5432/" + config.name);
  if (config.features.includes("caching") || config.features.includes("rate-limiting")) lines.push("REDIS_URL=redis://localhost:6379");
  if (config.features.includes("error-tracking")) lines.push("SENTRY_DSN=");
  if (config.auth) lines.push("JWT_SECRET=change-me-in-production");
  return lines.join("\n") + "\n";
}

function generateReadme(config: ProjectConfig): string {
  return `# ${config.name}\n\n## Setup\n\n\`\`\`bash\nnpm install\ncp .env.example .env\nnpm run dev\n\`\`\`\n\n## Scripts\n\n- \`npm run dev\` — Development with hot reload\n- \`npm run build\` — TypeScript compilation\n- \`npm test\` — Run tests\n`;
}

function generateApiEntry(config: ProjectConfig): string {
  return `// ${config.name} — API server entry point
import { Hono } from "hono";
import { logger } from "hono/logger";
import routes from "./routes/index";
${config.features.includes("health-check") ? 'import health from "./routes/health";\n' : ""}

const app = new Hono();

app.use("*", logger());
${config.features.includes("health-check") ? 'app.route("/", health);\n' : ""}
app.route("/api", routes);

const port = Number(process.env.PORT || 3000);
console.log(\`\${\"${config.name}\"} listening on :\${port}\`);

export default { port, fetch: app.fetch };
`;
}

function generateDockerCompose(config: ProjectConfig): string {
  const services: Record<string, any> = {
    app: {
      build: ".",
      ports: ["3000:3000"],
      env_file: ".env",
      depends_on: [] as string[],
    },
  };
  if (config.database === "postgres") {
    services.postgres = { image: "postgres:16-alpine", environment: { POSTGRES_DB: config.name, POSTGRES_USER: "app", POSTGRES_PASSWORD: "password" }, ports: ["5432:5432"], volumes: ["pgdata:/var/lib/postgresql/data"] };
    services.app.depends_on.push("postgres");
  }
  if (config.features.includes("caching") || config.features.includes("rate-limiting")) {
    services.redis = { image: "redis:7-alpine", ports: ["6379:6379"] };
    services.app.depends_on.push("redis");
  }
  // Simplified YAML output
  let yaml = "services:\n";
  for (const [name, svc] of Object.entries(services)) {
    yaml += `  ${name}:\n`;
    for (const [k, v] of Object.entries(svc as Record<string, any>)) {
      if (Array.isArray(v)) {
        if (v.length === 0) continue;
        yaml += `    ${k}:\n`;
        v.forEach((item: string) => { yaml += `      - ${item}\n`; });
      } else if (typeof v === "object") {
        yaml += `    ${k}:\n`;
        Object.entries(v).forEach(([ek, ev]) => { yaml += `      ${ek}: ${ev}\n`; });
      } else {
        yaml += `    ${k}: ${v}\n`;
      }
    }
  }
  if (config.database === "postgres") yaml += "\nvolumes:\n  pgdata:\n";
  return yaml;
}
```

## Results

After deploying the scaffolder across the engineering team:

- **New service setup dropped from 2-3 hours to 8 minutes** — interactive prompts guide choices, all boilerplate is generated and configured
- **100% consistency across 14 services** — every service has health checks, tracing, Docker configs, and CI pipelines from the same templates
- **mTLS rollout took 1 day instead of 2 weeks** — updated the template, re-scaffolded affected services, diffed the changes
- **Engineer satisfaction (internal survey) improved 42%** — "starting a new service" went from most-dreaded task to "just run the CLI"
- **Template maintenance cost: ~2 hours/month** — when standards change (new Node version, updated Drizzle config), one template update propagates to all future services
