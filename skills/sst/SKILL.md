---
name: sst
description: >-
  Builds and deploys full-stack applications on AWS with SST (v3 and later, built on Pulumi), defining Lambda functions, API Gateway routes, DynamoDB tables, S3 buckets and Next.js, Remix or Astro sites in sst.config.ts. Use when the user wants to deploy a serverless app to AWS, run sst dev, link resources into functions, manage secrets, or set up per-PR preview stages. Trigger words: sst, serverless stack, sst dev, sst deploy, aws lambda, sst ion, resource linking.
license: Apache-2.0
compatibility: "Node.js (for the npm package) and AWS credentials; macOS, Linux or WSL"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["sst", "serverless", "aws", "lambda", "full-stack"]
  repository: https://github.com/sst/sst
---

# SST

## Overview

SST is a framework for building full-stack apps on your own AWS account. Infrastructure is declared in a TypeScript `sst.config.ts` using components such as `sst.aws.Function`, `sst.aws.ApiGatewayV2`, `sst.aws.Dynamo`, `sst.aws.Bucket` and `sst.aws.Nextjs`. A `link` property gives a function or site IAM permissions and typed access to a resource through the `Resource` object. `sst dev` runs your functions live against real AWS.

This skill covers SST v3 and later (npm `sst` 4.x at the time of writing). The old v2 "Serverless Stack" constructs (`Api`, `Table`, `Stack`, `packages/core` templates) do not exist any more; the v2 to v3 migration guide is at https://sst.dev/docs/migrate-from-v2.

## Instructions

1. **Install and initialise.** In a JS project run `npm install sst`, then `npx sst init`. In a Next.js, Remix, Astro or SvelteKit project it detects the framework and adds SST in drop-in mode. Add `--yes` to skip the confirmation.
2. **Write `sst.config.ts`.** It has `app()` (name, `home: "aws"`, `removal`, `protect`) and `run()` (the resources). Do not import provider packages in this file; the globals `sst`, `$app` and `$dev` are available.
3. **Link resources.** `link: [table]` on a Function or frontend injects the resource and grants IAM permission. Read it in code with `import { Resource } from "sst"` and `Resource.Notes.name`. On frontends the links exist only on the server side.
4. **Develop.** `npx sst dev` deploys your resources, runs functions live on your machine and starts the frontend dev server in its own tab. The `Nextjs`, `Remix` and `Astro` sites are not deployed by `sst dev`. `sst dev --mode=basic` gives the old single-process behaviour (it only deploys the app and runs functions); start the frontend in a second terminal by wrapping its command, for example `sst dev next dev`, so it loads the linked resources.
5. **Preview changes.** `sst diff --stage production` lists what a deploy would create, change or delete.
6. **Deploy.** `sst deploy --stage production`. Without `--stage`, the personal stage (your username, stored in `.sst/stage`) is used. If you pass a stage in CI, use `--stage` or `SST_STAGE`.
7. **Secrets.** Declare `new sst.Secret("StripeKey")` (name starts with a capital letter, letters and digits only), link it, then `sst secret set StripeKey sk_live_51Nx --stage production`. Without `sst dev` running, redeploy to apply it. `sst secret set Name value --fallback` sets a value used by every stage that has none, which suits PR stages.
8. **Remove.** `sst remove --stage pr-42` deletes a stage. What is actually deleted depends on `removal` in the app config.

## Examples

### Example 1: Notes API on API Gateway with DynamoDB

The user says: "Create a REST API on AWS with a DynamoDB table using SST."

```typescript
/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return {
      name: "notes-api",
      home: "aws",
      removal: input.stage === "production" ? "retain" : "remove",
      protect: input.stage === "production",
    };
  },
  async run() {
    const table = new sst.aws.Dynamo("Notes", {
      fields: { userId: "string", noteId: "string" },
      primaryIndex: { hashKey: "userId", rangeKey: "noteId" },
    });
    const api = new sst.aws.ApiGatewayV2("NotesApi");
    api.route("GET /notes/{userId}", { handler: "src/list.handler", link: [table] });
    api.route("POST /notes", { handler: "src/create.handler", link: [table] });
    return { url: api.url };
  },
});
```

```typescript
// src/list.ts
import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function handler(event: { pathParameters: { userId: string } }) {
  const out = await db.send(new QueryCommand({
    TableName: Resource.Notes.name,
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": event.pathParameters.userId },
  }));
  return { statusCode: 200, body: JSON.stringify(out.Items) };
}
```

Install the SDK packages with `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb`. `npx sst dev` prints the API URL under `url`; each request runs your handler locally with the real table.

### Example 2: Next.js with a preview environment per pull request

The user says: "Deploy my Next.js app on AWS, and give every PR its own environment."

```typescript
async run() {
  const uploads = new sst.aws.Bucket("Uploads");
  const web = new sst.aws.Nextjs("Web", { link: [uploads] });
  return { url: web.url };
}
```

```console
$ npx sst deploy --stage pr-42
$ npx sst remove --stage pr-42
```

A CI job runs the first command when the PR opens or updates and the second when it closes. Set `removal: "remove"` for non-production stages (as in Example 1); with the default `"retain"`, S3 buckets and DynamoDB tables of a removed PR stage stay behind in AWS and keep costing money.

## Guidelines

- The default `removal` is `"retain"`: `sst remove` and deleted components keep buckets and tables. Set `removal: "remove"` for dev and PR stages and `protect: true` for production so `sst remove` refuses to run there.
- Changing the stage deploys a second, separate copy of the app. Always pass `--stage` in CI.
- Use `link` instead of hand-written IAM; never hardcode table names or ARNs.
- Secrets are encrypted in an S3 bucket in your account and bundled into the functions that link them. Never put them in `.env` files that are committed.
- Function runtime defaults to `nodejs24.x` on x86_64; set `runtime` or `architecture: "arm64"` only when needed.
- State lives in the `home` provider; if a deploy was killed, `sst unlock` releases the lock.
- SST has no Python or Rust first-class support (community only). Docs: https://sst.dev/docs
