---
name: northflank
category: Cloud & Infrastructure
tags: [paas, deployment, kubernetes, docker, ci-cd, managed-services]
version: 1.0.0
author: terminal-skills
---

# Northflank — Full-Stack Cloud Platform

You are an expert in Northflank, the cloud platform that combines PaaS simplicity with Kubernetes power for deploying applications, databases, and jobs. You help developers configure build pipelines, deploy services, manage databases, and set up CI/CD workflows with Northflank's Infrastructure as Code and API.

## Core Capabilities

### Project Configuration

```json
// northflank.json — Infrastructure as Code
{
  "apiVersion": "v1",
  "spec": {
    "kind": "Workflow",
    "spec": {
      "type": "sequential",
      "steps": [
        {
          "kind": "BuildService",
          "spec": {
            "name": "api-build",
            "billing": { "deploymentPlan": "nf-compute-20" },
            "vcsData": {
              "projectUrl": "https://github.com/myorg/my-api",
              "projectType": "github",
              "projectBranch": "main"
            },
            "buildConfiguration": {
              "pathIgnoreRules": ["node_modules", ".git", "*.md"],
              "isAllowList": false
            },
            "buildpack": {
              "builder": "NIXPACKS"
            }
          }
        },
        {
          "kind": "DeploymentService",
          "spec": {
            "name": "api",
            "billing": { "deploymentPlan": "nf-compute-20" },
            "deployment": {
              "instances": 2,
              "docker": {
                "configType": "default"
              },
              "internal": {
                "id": "api-build",
                "branch": "main",
                "buildSHA": "latest"
              }
            },
            "ports": [
              {
                "name": "http",
                "internalPort": 3000,
                "public": true,
                "protocol": "HTTP",
                "domains": ["api.myapp.com"]
              }
            ],
            "healthChecks": [
              {
                "protocol": "HTTP",
                "path": "/health",
                "port": 3000,
                "initialDelaySeconds": 10,
                "periodSeconds": 30
              }
            ],
            "runtimeEnvironment": {
              "NODE_ENV": "production",
              "DATABASE_URL": "${database.main-db.HOST}"
            }
          }
        },
        {
          "kind": "Addon",
          "spec": {
            "name": "main-db",
            "type": "postgresql",
            "version": "16",
            "billing": { "deploymentPlan": "nf-compute-20", "storageClass": "ssd", "storage": 10240 },
            "typeSpecificFields": {
              "postgresDatabase": "myapp"
            },
            "backups": {
              "enabled": true,
              "schedule": "0 3 * * *"
            }
          }
        }
      ]
    }
  }
}
```

### CLI Operations

```bash
# Install Northflank CLI
npm install -g @northflank/cli

# Login
northflank login

# Create a project
northflank create project my-app --region europe-west

# Deploy from Git
northflank create service my-app/api \
  --git-url https://github.com/myorg/my-api \
  --branch main \
  --port 3000 \
  --instances 2 \
  --plan nf-compute-20

# Add a database
northflank create addon my-app/main-db \
  --type postgresql \
  --version 16 \
  --plan nf-compute-20 \
  --storage 10240

# Manage secrets
northflank create secret my-app/api-secrets \
  --data '{"API_KEY": "sk-xxx", "JWT_SECRET": "xxx"}'

# Link secret group to a service
northflank link secret my-app/api --secret-group api-secrets

# View logs
northflank logs my-app/api --follow

# Scale service
northflank scale my-app/api --instances 5
```

### Build Pipelines

```yaml
# Northflank supports multiple build strategies:
# 1. Nixpacks (auto-detect, default)
# 2. Dockerfile
# 3. Buildpacks (Heroku/Cloud Native)
# 4. Pre-built Docker images

# Pipeline: Build → Test → Deploy
# Configure in dashboard or via API:
# 1. Source: GitHub/GitLab/Bitbucket webhook
# 2. Build: Nixpacks or Dockerfile
# 3. Preview: Auto-deploy PR branches
# 4. Production: Deploy on merge to main
```

### Jobs and Cron

```bash
# Create a cron job
northflank create job my-app/daily-report \
  --type cron \
  --schedule "0 8 * * *" \
  --git-url https://github.com/myorg/my-api \
  --branch main \
  --run-command "node scripts/daily-report.js" \
  --plan nf-compute-10

# Create a manual job (triggered via API or dashboard)
northflank create job my-app/db-migrate \
  --type manual \
  --run-command "npx prisma migrate deploy"
```

## Best Practices

1. **Use Infrastructure as Code** — Define services in `northflank.json`; version with your repo for reproducible environments
2. **Managed addons for databases** — Don't self-manage Postgres/Redis/MongoDB; use Northflank addons with automatic backups
3. **Secret groups for credentials** — Group secrets by service; link them to deployments without hardcoding values
4. **Preview environments for PRs** — Enable branch-based previews; each PR gets its own URL and database
5. **Health checks on every service** — Required for zero-downtime deployments and automatic restart on failure
6. **Use build caching** — Northflank caches Docker layers and dependencies; structure your Dockerfile for optimal caching
7. **Jobs for migrations** — Run database migrations as manual jobs, not in the application startup sequence
8. **Monitor build logs** — Check build logs when deployments fail; most issues are dependency installation or build command errors
