---
name: caprover
category: Cloud & Infrastructure
tags: [self-hosted, paas, deployment, docker, one-click, heroku-alternative]
version: 1.0.0
author: terminal-skills
---

# CapRover — Self-Hosted PaaS with One-Click Apps

You are an expert in CapRover, the open-source PaaS that turns any Linux server into a Heroku-like platform with automatic HTTPS, one-click app deployment, and Docker-based containerization. You help developers deploy applications, configure custom domains, and manage the CapRover cluster.

## Core Capabilities

### Installation

```bash
# Prerequisites: Ubuntu 20.04+, Docker installed, ports 80/443/3000 open

# Install CapRover
docker run -p 80:80 -p 443:443 -p 3000:3000 \
  -e ACCEPTED_TERMS=true \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /captain:/captain \
  caprover/caprover

# Install CLI
npm install -g caprover

# Set up server (interactive)
caprover serversetup
# → Enter: IP address, root domain (*.apps.myserver.com), email for SSL, password

# Login
caprover login
# → URL: https://captain.apps.myserver.com
```

### Deploy Applications

Deploy via CLI, Git, or Dockerfile:

```bash
# Method 1: CLI deploy from current directory
caprover deploy -a my-api

# Method 2: Deploy with a captain-definition file
cat > captain-definition << 'EOF'
{
  "schemaVersion": 2,
  "dockerfilePath": "./Dockerfile"
}
EOF
caprover deploy -a my-api
```

```json
// captain-definition — Deployment configuration
// Option A: Dockerfile-based
{
  "schemaVersion": 2,
  "dockerfilePath": "./Dockerfile"
}

// Option B: Image-based (pre-built)
{
  "schemaVersion": 2,
  "imageName": "ghcr.io/myorg/my-api:v1.2.3"
}

// Option C: Docker Compose (multi-container)
{
  "schemaVersion": 2,
  "dockerComposeFileLocation": "./docker-compose.yml"
}
```

### One-Click Apps

Deploy popular software instantly through the web UI:

```markdown
## Available One-Click Apps (examples)
- **Databases**: PostgreSQL, MySQL, MongoDB, Redis, MariaDB
- **CMS**: WordPress, Ghost, Strapi, Directus
- **DevOps**: GitLab, Drone CI, Jenkins, Portainer
- **Monitoring**: Grafana, Prometheus, Uptime Kuma, Plausible
- **Communication**: Mattermost, Rocket.Chat, n8n
- **Storage**: MinIO, Nextcloud, Filebrowser
- **Analytics**: Matomo, PostHog, Umami
```

### API for Automation

```typescript
// scripts/caprover-api.ts — CapRover API client
const CAPROVER_URL = "https://captain.apps.myserver.com";

async function caproverApi(path: string, data?: any) {
  const token = process.env.CAPROVER_TOKEN!;
  const response = await fetch(`${CAPROVER_URL}/api/v2${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "x-captain-auth": token,
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (result.status !== 100) throw new Error(result.description);
  return result.data;
}

// Create a new app
async function createApp(appName: string) {
  return caproverApi("/user/apps/appDefinitions/register", {
    appName,
    hasPersistentData: false,
  });
}

// Update environment variables
async function setEnvVars(appName: string, envVars: { key: string; value: string }[]) {
  return caproverApi("/user/apps/appDefinitions/update", {
    appName,
    envVars,
  });
}

// Enable SSL for app
async function enableSsl(appName: string) {
  return caproverApi("/user/apps/appDefinitions/enablecustomdomainssl", {
    appName,
    customDomain: `${appName}.apps.myserver.com`,
  });
}

// Scale app
async function scaleApp(appName: string, instanceCount: number) {
  return caproverApi("/user/apps/appDefinitions/update", {
    appName,
    instanceCount,
  });
}

// Add custom domain
async function addCustomDomain(appName: string, domain: string) {
  return caproverApi("/user/apps/appDefinitions/customdomain", {
    appName,
    customDomain: domain,
  });
}
```

### Persistent Storage

Configure volumes for stateful applications:

```bash
# Via CLI or captain-definition, define persistent directories
# In CapRover dashboard: App → App Configs → Persistent Directories

# Example persistent paths:
# /app/uploads    → Store user-uploaded files
# /app/data       → Application data directory
# /var/log/app    → Log files
```

### Multi-Server Cluster

Scale beyond a single server:

```bash
# On the main server: get join token
# Dashboard → Cluster → Add Worker Node

# On the worker server:
docker swarm join --token SWMTKN-xxx manager-ip:2377

# CapRover automatically distributes containers across nodes
# Use placement constraints for specific workloads:
# Dashboard → App → App Configs → Node Placement
```

## Best Practices

1. **Wildcard DNS first** — Point `*.apps.yourdomain.com` to your server IP before installation; SSL won't work without it
2. **Use captain-definition** — Version the deployment config with your code; don't rely on dashboard settings
3. **Enable HTTPS everywhere** — CapRover auto-provisions Let's Encrypt certificates; click "Enable HTTPS" for each app
4. **Persistent data for databases** — Always configure persistent directories for databases; container restarts lose data otherwise
5. **Resource limits** — Set memory limits per app in the dashboard to prevent one app from consuming all server resources
6. **Use one-click apps for infra** — Don't manually configure PostgreSQL or Redis; use the one-click templates
7. **Automated backups** — CapRover doesn't back up automatically; set up cron jobs for database dumps and volume backups
8. **Monitor with built-in NetData** — CapRover includes NetData for server monitoring; access at captain URL + port 19999
