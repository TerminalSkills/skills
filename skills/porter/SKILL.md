---
name: porter
description: Expert guidance for Porter, the platform that provides a Heroku-like experience on your own AWS, GCP, or Azure account. Helps developers deploy applications on managed Kubernetes clusters provisioned in their own cloud accounts, with the simplicity of `git push` deployment and the control of owning your infrastructure.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - paas
  - kubernetes
  - aws
  - gcp
  - azure
---

# Porter — PaaS on Your Own Cloud


## Overview

You are an expert in Porter, the platform that provides a Heroku-like experience on your own AWS, GCP, or Azure account. You help developers deploy applications on managed Kubernetes clusters provisioned in their own cloud accounts, with the simplicity of `git push` deployment and the control of owning your infrastructure.

## Instructions

### Getting Started

```bash
# Porter provisions a Kubernetes cluster in YOUR cloud account
# 1. Sign up at dashboard.porter.run
# 2. Connect your AWS/GCP/Azure account
# 3. Porter creates a managed EKS/GKE/AKS cluster
# 4. Deploy apps through the dashboard or CLI

# Install Porter CLI
brew install porter-dev/porter/porter

# Login
porter auth login

# Set context
porter config set-project --project <project-id>
porter config set-cluster --cluster <cluster-id>
```

### Application Deployment

```yaml
# porter.yaml — Application configuration
version: v2

apps:
  api:
    build:
      method: pack                 # pack (buildpacks) | docker | registry
      context: .
      builder: heroku/builder:22
    
    services:
      web:
        type: web
        port: 3000
        cpus: 0.5
        memory: 512Mi
        replicas:
          min: 2
          max: 10
        autoscaling:
          enabled: true
          targetCPU: 60
          targetMemory: 70
        health_check:
          enabled: true
          path: /health
        domains:
          - name: api.myapp.com

      worker:
        type: worker
        cpus: 1
        memory: 1Gi
        replicas:
          min: 1
          max: 5
        command: "node dist/worker.js"

      cron:
        type: job
        cpus: 0.25
        memory: 256Mi
        command: "node dist/cron/daily-report.js"
        schedule: "0 8 * * *"
        timeout: 300

    env:
      NODE_ENV: production
      # Secrets managed via Porter dashboard or CLI
      DATABASE_URL:
        secret: true
      REDIS_URL:
        secret: true

    predeploy:
      - "npx prisma migrate deploy"
```

### CLI Deployment

```bash
# Deploy from current directory
porter app update api

# Deploy a specific service
porter app update api --service web

# Run a one-off command (like Heroku run)
porter app run api -- npm run seed

# View logs
porter app logs api --service web --follow

# Scale a service
porter app update api --service web --replicas 5

# Set environment variables
porter app env set api DATABASE_URL=postgres://...
porter app env set api --secret API_KEY=sk-xxx

# List apps
porter app list

# Get app status
porter app get api
```

### Database Addons

```bash
# Deploy managed databases (provisioned in your cloud account)
porter addon create postgresql \
  --name main-db \
  --version 16 \
  --plan db.t4g.medium \
  --storage 50

# Porter provisions RDS/Cloud SQL/Azure Database in YOUR account
# Connection strings auto-injected into linked apps

porter addon create redis \
  --name cache \
  --version 7 \
  --plan cache.t4g.micro

# Link addon to app
porter app env set api DATABASE_URL=$(porter addon get main-db --connection-string)
```

### Preview Environments

```yaml
# porter.yaml — Preview environment configuration
version: v2

previews:
  enabled: true
  # Every PR gets its own environment with isolated database
  apps:
    api:
      build:
        method: pack
      services:
        web:
          type: web
          port: 3000
          cpus: 0.25
          memory: 256Mi
          replicas:
            min: 1
            max: 1
      predeploy:
        - "npx prisma migrate deploy"
        - "npx prisma db seed"

  addons:
    - type: postgresql
      name: preview-db
      plan: db.t4g.micro
```

### GitHub Actions Integration

```yaml
# .github/workflows/deploy.yml
name: Deploy to Porter
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Porter
        uses: porter-dev/porter-cli-action@v0.1.0
        with:
          command: app update api
        env:
          PORTER_TOKEN: ${{ secrets.PORTER_TOKEN }}
          PORTER_PROJECT: ${{ secrets.PORTER_PROJECT }}
          PORTER_CLUSTER: ${{ secrets.PORTER_CLUSTER }}
```


## Examples

### Example 1

**User request:** "Help me set up Porter"

The agent follows the instructions above to configure Porter with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Porter configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Your cloud, Porter's UX** — Infrastructure runs in your AWS/GCP/Azure account; you own the data and the bill
2. **Use porter.yaml** — Define services, scaling, and env vars in code; avoid dashboard-only configuration
3. **Predeploy for migrations** — Run database migrations in the `predeploy` step; they execute before the new version goes live
4. **Preview environments for PRs** — Each PR gets isolated resources including databases; reviewers test real deployments
5. **Autoscaling with CPU targets** — Set `targetCPU: 60` for web services; Porter handles HPA configuration on Kubernetes
6. **Secrets through CLI/dashboard** — Mark sensitive values with `secret: true`; they're stored as Kubernetes secrets
7. **One-off commands with `app run`** — Use for database seeding, REPL access, or debugging; runs in the same environment as your app
8. **Monitor cloud costs** — Porter creates real cloud resources (EKS, RDS, EC2); monitor your cloud bill directly
