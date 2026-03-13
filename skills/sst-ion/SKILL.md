---
name: sst-ion
description: >-
   You are an expert in SST (Ion), the framework for building full-stack
  serverless applications on AWS. You help developers deploy Next.js, Remix,
  Astro, and API services with infrastructure-as-code defined in TypeScript,
  automatic IAM permissions, live Lambda debugging, secrets management, and
  zero-config deployments — replacing CDK/Terraform complexity with a
  developer-friendly abstraction over AWS services.
category: Cloud & Serverless
tags: [aws, infrastructure, iac, serverless, typescript, next, deployment]
version: 1.0.0
author: terminal-skills
---

# SST (Ion) — Full-Stack Serverless Framework

You are an expert in SST (Ion), the framework for building full-stack serverless applications on AWS. You help developers deploy Next.js, Remix, Astro, and API services with infrastructure-as-code defined in TypeScript, automatic IAM permissions, live Lambda debugging, secrets management, and zero-config deployments — replacing CDK/Terraform complexity with a developer-friendly abstraction over AWS services.

## Core Capabilities

### Infrastructure as Code

```typescript
// sst.config.ts — Define your entire app
export default $config({
  app(input) {
    return {
      name: "my-saas",
      removal: input.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: { aws: { region: "us-east-1" } },
    };
  },
  async run() {
    // Database
    const db = new sst.aws.Postgres("MyDB", { scaling: { min: "0.5 ACU", max: "4 ACU" } });

    // S3 bucket for uploads
    const bucket = new sst.aws.Bucket("Uploads", {
      access: "public",
      cors: { allowOrigins: ["*"], allowMethods: ["GET", "PUT"] },
    });

    // Secrets
    const stripeKey = new sst.Secret("StripeKey");
    const openaiKey = new sst.Secret("OpenAIKey");

    // API
    const api = new sst.aws.Function("Api", {
      handler: "packages/api/src/handler.handler",
      link: [db, bucket, stripeKey],      // Auto-grants IAM permissions
      url: true,                          // Creates function URL
    });

    // Cron job
    new sst.aws.Cron("DailyReport", {
      schedule: "rate(1 day)",
      job: {
        handler: "packages/api/src/cron/daily-report.handler",
        link: [db],
        timeout: "5 minutes",
      },
    });

    // Queue
    const queue = new sst.aws.Queue("EmailQueue", {
      consumer: {
        handler: "packages/api/src/queue/email.handler",
        link: [db],
      },
    });

    // Next.js frontend
    const site = new sst.aws.Nextjs("Web", {
      path: "packages/web",
      link: [api, bucket, stripeKey],
      environment: { NEXT_PUBLIC_API_URL: api.url },
      domain: {
        name: "app.example.com",
        dns: sst.aws.dns(),
      },
    });

    return { api: api.url, site: site.url };
  },
});
```

### Using Linked Resources

```typescript
// packages/api/src/handler.ts — Access linked resources type-safely
import { Resource } from "sst";

export async function handler(event) {
  // Resource bindings — type-safe, auto-permissioned
  const dbUrl = Resource.MyDB.url;          // RDS connection string
  const bucketName = Resource.Uploads.name; // S3 bucket name
  const stripeKey = Resource.StripeKey.value; // Secret value

  // Upload to S3 (IAM permissions auto-granted by `link`)
  await s3.putObject({
    Bucket: Resource.Uploads.name,
    Key: `uploads/${event.fileName}`,
    Body: event.fileBuffer,
  });
}
```

## Installation

```bash
# Install SST
curl -fsSL https://sst.dev/install | bash

# Create new project
sst init

# Development (live Lambda debugging)
sst dev

# Deploy
sst deploy --stage production

# Set secrets
sst secret set StripeKey sk_live_...
```

## Best Practices

1. **Link for permissions** — Use `link: [resource]` instead of manual IAM policies; SST auto-grants minimal permissions
2. **Resource bindings** — Access linked resources via `Resource.Name.property`; fully typed, no env var juggling
3. **Stages for environments** — Use `--stage dev/staging/prod`; each stage gets isolated resources
4. **Live debugging** — Use `sst dev` for real-time Lambda debugging; edit code, test instantly, see logs
5. **Secrets management** — Use `sst.Secret` for API keys; encrypted, per-stage, accessible via `Resource`
6. **Domain configuration** — Use `domain` property on sites; SST handles SSL certificates and DNS records
7. **Monorepo structure** — Use `packages/` directory; separate api, web, shared code; SST links them automatically
8. **Removal policy** — Set `removal: "retain"` in production; prevents accidental deletion of databases and buckets
