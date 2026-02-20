---
name: "fly-machines"
description: "Deploy and manage containers on Fly.io using the Machines API for serverless container orchestration"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "containers"
  tags: ["fly.io", "containers", "machines", "api", "serverless", "orchestration"]
---

# Fly Machines

Deploy and manage containers on Fly.io using the Machines API for serverless container orchestration, auto-scaling, and global distribution.

## Overview

Fly Machines provide:

- **Serverless containers** with sub-second startup times
- **Global distribution** across 34+ regions worldwide
- **Auto-scaling** from zero to handle traffic spikes
- **Machines API** for programmatic container management

## Instructions

### Step 1: Setup

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh
flyctl auth login
flyctl apps create my-machines-app
```

### Step 2: Machines API Client

```typescript
// fly-client.ts
export class FlyMachinesClient {
  private apiToken: string;
  private baseUrl = 'https://api.machines.dev';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async createMachine(appName: string, config: any) {
    const response = await fetch(`${this.baseUrl}/v1/apps/${appName}/machines`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config }),
    });

    return response.json();
  }

  async listMachines(appName: string) {
    const response = await fetch(`${this.baseUrl}/v1/apps/${appName}/machines`, {
      headers: { 'Authorization': `Bearer ${this.apiToken}` },
    });

    return response.json();
  }
}
```

### Step 3: Auto-scaling

```typescript
// auto-scaler.ts
export class AutoScaler {
  private client: FlyMachinesClient;

  async scaleApp(appName: string, targetCount: number) {
    const machines = await this.client.listMachines(appName);
    const currentCount = machines.filter(m => m.state !== 'destroyed').length;
    
    if (targetCount > currentCount) {
      // Scale up
      for (let i = 0; i < targetCount - currentCount; i++) {
        await this.client.createMachine(appName, {
          image: 'nginx:alpine',
          guest: { cpus: 1, memory_mb: 256 }
        });
      }
    }
  }
}
```

### Step 4: Deploy

```bash
flyctl deploy
flyctl status
```

## Guidelines

- **Use auto-destroy** for ephemeral workloads to minimize costs
- **Monitor machine states** and handle state transitions properly
- **Use appropriate machine sizes** - match resources to workload requirements