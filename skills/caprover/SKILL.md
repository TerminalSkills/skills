---
name: caprover
description: Expert guidance for CapRover, the open-source PaaS that turns any Linux server into a Heroku-like platform with automatic HTTPS, one-click app deployment, and Docker-based containerization. Helps developers deploy applications, configure custom domains, and manage the CapRover cluster.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/caprover/caprover
  tags: "self-hosted, paas, deployment, docker, one-click"
---

# CapRover — Self-Hosted PaaS with One-Click Apps


## Overview


CapRover, the open-source PaaS that turns any Linux server into a Heroku-like platform with automatic HTTPS, one-click app deployment, and Docker-based containerization. Helps developers deploy applications, configure custom domains, and manage the CapRover cluster.


## Instructions

### Installation

```bash
# Prerequisites: Docker installed (CapRover is tested on Ubuntu 24.04 + Docker 25+), ports 80/443/3000 open

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

`captain-definition` is plain JSON (no comments) and requires `schemaVersion: 2`. Build from a Dockerfile:

```json
{
  "schemaVersion": 2,
  "dockerfilePath": "./Dockerfile"
}
```

Deploy a pre-built image:

```json
{
  "schemaVersion": 2,
  "imageName": "ghcr.io/myorg/my-api:v1.2.3"
}
```

Use a built-in template (`node`, `php`, `python-django`, `ruby-rack`; format `LANGUAGE/VERSION`):

```json
{
  "schemaVersion": 2,
  "templateId": "node/24"
}
```

The CLI also deploys a prebuilt image directly with `caprover deploy --imageName IMAGE`. There is no
Docker Compose option in `captain-definition`; run multi-container stacks as separate apps or
one-click apps. For monorepos, keep one file per app (e.g. `captain-definition-backend`) and set
its path in the app's Deployment tab; the Docker build context stays the project root.

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

// Update environment variables (the update call is applied as a full app definition:
// read the current one with GET /user/apps/appDefinitions/ and send back its fields too,
// otherwise omitted settings such as instanceCount or volumes can be reset)
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
# 1. Dashboard → Cluster: set up a Docker registry (managed by CapRover or a 3rd party)
#    and set it as the default push registry, then redeploy existing apps
# 2. Dashboard → Cluster → Nodes: enter the CapRover IP, the new node IP, the root SSH key
#    and the node type (worker), then "Join Cluster". Plain `docker swarm join` also works.
# 3. Open between nodes: 2377/tcp, 7946/tcp+udp, 4789/udp (996/tcp only for external registry access)

# CapRover distributes non-persistent apps across nodes; apps with Persistent Data stay on one node
# Use placement constraints for specific workloads:
# Dashboard → App → App Configs → Node Placement
```


## Examples


### Example 1: Deploying a Node.js API and React frontend as two apps

**User request:**

```
I have a Node.js API in ./api and a React frontend in ./web, each with its own Dockerfile.
Deploy both to our CapRover server as separate apps.
```

The agent creates one `captain-definition` per directory (`{"schemaVersion": 2, "dockerfilePath": "./Dockerfile"}`),
registers both apps on the dashboard (or via the API's `register` call), runs `caprover deploy -a api-service`
from `./api` and `caprover deploy -a web-frontend` from `./web`, points the frontend's env var
(e.g. `REACT_APP_API_URL`) at the API's internal address (`srv-captain--api-service`), and confirms both
are reachable over HTTPS at their `*.apps.yourdomain.com` subdomains.

### Example 2: Diagnosing a failed deploy

**User request:**

```
caprover deploy just failed on api-service with "Build failed" in the CLI output.
```

The agent asks for the build logs (Dashboard → App → Deployment → "View App Build Logs" — the
CLI itself has no `logs` subcommand), checks for the usual causes — a missing or misnamed
`captain-definition`, a Dockerfile that fails outside CI (e.g. relying on local env files),
or a memory-limited build on a small droplet — fixes the root cause, and redeploys with
`caprover deploy -a api-service`.


## Guidelines

1. **Wildcard DNS first** — Point `*.apps.yourdomain.com` to your server IP before installation; SSL won't work without it
2. **Use captain-definition** — Version the deployment config with your code; don't rely on dashboard settings
3. **Enable HTTPS everywhere** — CapRover auto-provisions Let's Encrypt certificates; click "Enable HTTPS" for each app
4. **Persistent data for databases** — Always configure persistent directories for databases; container restarts lose data otherwise
5. **Resource limits** — Set memory limits per app in the dashboard to prevent one app from consuming all server resources
6. **Use one-click apps for infra** — Don't manually configure PostgreSQL or Redis; use the one-click templates
7. **Automated backups** — CapRover doesn't back up automatically; set up cron jobs for database dumps and volume backups
8. **Monitoring is opt-in** — CapRover can run NetData (and GoAccess for per-app traffic) from the dashboard's Monitoring section; enable it there rather than installing your own
