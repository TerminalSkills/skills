---
name: pulumi
description: >-
  Assists with defining and managing cloud infrastructure using Pulumi with TypeScript, Python,
  Go, or C#. Use when provisioning AWS, GCP, Azure, or Kubernetes resources with real programming
  languages instead of HCL. Trigger words: pulumi, infrastructure as code, iac, pulumi up,
  pulumi stack, cloud infrastructure, component resource.
license: Apache-2.0
compatibility: "Pulumi CLI 3.x and a language runtime (Node.js, Python, Go, .NET, Java) or YAML; a cloud account for real providers"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/pulumi/pulumi
  tags: "pulumi, infrastructure-as-code, cloud, devops, multi-cloud"
---

# Pulumi

## Overview

Pulumi enables defining and managing cloud infrastructure using real programming languages (TypeScript, Python, Go, C#) instead of domain-specific languages. It supports 150+ cloud providers and allows using loops, conditionals, classes, and packages to build reusable, testable infrastructure components.

## Instructions

1. **Install the CLI** with a package manager: `brew install pulumi/tap/pulumi` (macOS/Linux), `choco install pulumi` or `winget install --exact --id Pulumi.Pulumi` (Windows). Or download a release tarball from `github.com/pulumi/pulumi/releases` and check it against the `pulumi-<version>-checksums.txt` file in the same release (`sha256sum -c`) before extracting. Current release: 3.272 (October 2026).
2. **Pick a backend**: `pulumi login` uses Pulumi Cloud (CI sets `PULUMI_ACCESS_TOKEN`); `pulumi login file://~/.pulumi-state` keeps state in a local directory; `pulumi login s3://my-team-pulumi-state` uses a bucket. Local and bucket backends encrypt secrets with a passphrase: set `PULUMI_CONFIG_PASSPHRASE` (or `PULUMI_CONFIG_PASSPHRASE_FILE`) in non-interactive runs.
3. **Scaffold**: `pulumi new aws-typescript` (also `aws-python`, `aws-go`, `azure-typescript`, `gcp-python`, `kubernetes-typescript`, `typescript`...). Then `pulumi install` to fetch dependencies and plugins if the template did not already, and `pulumi stack init dev`.
4. **Preview, deploy, inspect**: `pulumi preview --diff`, `pulumi up` (add `--yes` only in CI), `pulumi stack output`, `pulumi destroy`. `pulumi refresh` syncs state with the real cloud; `pulumi import` adopts existing resources; `pulumi up --target <urn>` limits an update.
5. **Resources and outputs**: declare resources with `new aws.s3.Bucket("assets", {...})`. A property of another resource is an `Output<T>`, not a plain value: transform it with `.apply()` or the `pulumi.interpolate` tagged template. Passing an output as another resource's input creates the dependency automatically. A secret stays secret through `apply`.
6. **Config and secrets**: `pulumi config set aws:region eu-west-1`, `pulumi config set --secret dbPassword ...`, read with `config.requireSecret("dbPassword")`. Secrets are stored encrypted in `Pulumi.<stack>.yaml`; `pulumi stack output --show-secrets` reveals them. Prefer Pulumi ESC environments (`pulumi env`) or OIDC for cloud credentials rather than long-lived keys.
7. **Stacks**: one stack per environment (`dev`, `staging`, `prod`) with per-stack config. Share values with `new pulumi.StackReference("my-org/network/prod")` and `.getOutput("vpcId")`.
8. **Component resources**: extend `pulumi.ComponentResource`, call `super("org:module:Type", name, {}, opts)`, create children with `{ parent: this }`, and finish with `this.registerOutputs({...})`.
9. **Policy (CrossGuard)**: write a policy pack with `@pulumi/policy` (or the Python package) and run it as `pulumi preview --policy-pack ./policy` or `pulumi up --policy-pack ./policy`.
10. **Unit tests**: `pulumi.runtime.setMocks({ newResource, call }, project, stack, dryRun)` before importing the code under test, then assert on resource outputs with Vitest, Jest or pytest. No cloud calls are made.

## Examples

### Example 1: Stack with secret config and a reusable component

**User request:** "Start a Pulumi TypeScript project for the billing service with a dev stack and a secret DB password"

```bash
mkdir billing-infra && cd billing-infra
pulumi new aws-typescript --name billing-infra --stack dev --yes   # also creates the dev stack and installs @pulumi/aws
pulumi config set --secret dbPassword "correct-horse-battery-staple"
pulumi up --yes
pulumi stack output
```

```typescript
// site.ts
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export class StaticSite extends pulumi.ComponentResource {
  public readonly bucketName: pulumi.Output<string>;
  constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
    super("billing:web:StaticSite", name, {}, opts);
    const bucket = new aws.s3.Bucket(`${name}-assets`, {}, { parent: this });
    this.bucketName = bucket.bucket;
    this.registerOutputs({ bucketName: this.bucketName });
  }
}

```

```typescript
// index.ts (replaces the generated one)
import * as pulumi from "@pulumi/pulumi";
import { StaticSite } from "./site";

const config = new pulumi.Config();
const dbPassword = config.requireSecret("dbPassword");
const site = new StaticSite("portal");

export const bucketName = site.bucketName;
export const passwordLength = dbPassword.apply((p) => p.length); // output stays a secret
```

**Result:** `pulumi preview` lists the stack, the component and its child bucket as creates; after `pulumi up` the outputs show `bucketName` and `passwordLength  [secret]`. (The component and secret-config flow were run against a local backend with the random provider; the AWS bucket needs real credentials.)

### Example 2: Share a network stack and enforce policy

**User request:** "The api stack needs the VPC from the network stack, and CI must block public buckets"

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const network = new pulumi.StackReference("acme-platform/network/prod");
const vpcId = network.getOutput("vpcId");
const sg = new aws.ec2.SecurityGroup("api-sg", { vpcId, description: "api tier" });
```

```bash
pulumi preview --diff --policy-pack ../policies/s3-private
```

**Result:** the preview fails with the policy violation message before anything is deployed.

### Example 3: Unit-test a component without a cloud

```typescript
import * as pulumi from "@pulumi/pulumi";

pulumi.runtime.setMocks(
  {
    newResource: (args) => ({ id: `${args.name}_id`, state: { ...args.inputs, bucket: args.name } }), // provider-computed outputs are absent from inputs
    call: (args) => args.inputs,
  },
  "billing-infra", "dev", false,
);

describe("StaticSite", () => {
  it("exposes a bucket name", async () => {
    const { StaticSite } = await import("./site"); // import AFTER setMocks
    const site = new StaticSite("portal");
    const name = await new Promise<string>((res) => site.bucketName.apply(res));
    expect(name).toContain("portal");
  });
});
```

## Guidelines

- Treat `Output<T>` as a promise-like value: never use it in string templates or `if` directly; use `apply`, `interpolate` or `pulumi.all([...])`.
- Never hardcode credentials; use `config set --secret`, ESC or OIDC. Do not commit passphrases. Back up the passphrase or key: losing it makes encrypted config unrecoverable.
- Read the preview before every `pulumi up`; look for `replace` and `delete` on stateful resources (databases, buckets). Protect them with `{ protect: true }` or `retainOnDelete`.
- Do not rename a resource in code without an `aliases` entry, or Pulumi deletes and recreates it.
- Name resources so they stay unique across stacks; let Pulumi auto-name physical resources (it appends a random suffix) unless a fixed name is required.
- Commit `Pulumi.yaml` and `Pulumi.<stack>.yaml`; never commit `node_modules` or local state directories that contain secrets.
- Export outputs that other stacks or apps consume (URLs, ARNs, IDs), not everything.
- Use `pulumi destroy` and `pulumi stack rm` only on stacks you mean to remove; `stack rm` on a stack with resources needs `--force` and orphans them.
