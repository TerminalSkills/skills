---
name: zeabur
category: Cloud & Infrastructure
tags: [paas, deployment, serverless, edge, docker, one-click]
version: 1.0.0
author: terminal-skills
---

# Zeabur — Modern Cloud Deployment Platform

You are an expert in Zeabur, the cloud deployment platform that auto-detects frameworks, builds and deploys applications with zero configuration, and provides managed services like databases and message queues. You help developers deploy full-stack applications with automatic scaling and one-click marketplace services.

## Core Capabilities

### CLI Deployment

```bash
# Install Zeabur CLI
npm install -g zeabur

# Login
zeabur auth login

# Deploy from current directory (auto-detects framework)
zeabur deploy

# Deploy with specific settings
zeabur deploy --name my-api --region hkg  # Hong Kong region

# Environment variables
zeabur env set DATABASE_URL "postgres://..."
zeabur env set NODE_ENV production
zeabur env list

# Manage domains
zeabur domain add api.myapp.com
zeabur domain list
```

### Project Configuration

```toml
# zeabur.toml — Optional project configuration
[build]
# Override auto-detected build command
command = "npm run build"
output = "dist"

[runtime]
# Override start command
command = "node dist/server.js"

[env]
# Default environment variables (overridden by dashboard/CLI)
NODE_ENV = "production"
PORT = "3000"

[scaling]
min_instances = 1
max_instances = 5

[health_check]
path = "/health"
interval = "30s"
```

### Framework Auto-Detection

Zeabur automatically detects and configures:

```markdown
## Supported Frameworks (auto-detected, zero config)
- **Node.js**: Next.js, Nuxt, Remix, Express, Fastify, Hono, NestJS
- **Python**: Django, Flask, FastAPI, Streamlit
- **Go**: Gin, Echo, Fiber, standard net/http
- **Rust**: Actix, Axum, Rocket
- **Java**: Spring Boot, Quarkus
- **PHP**: Laravel, Symfony
- **Ruby**: Rails, Sinatra
- **Static**: React, Vue, Svelte, Astro, Hugo, Gatsby

## How it works:
1. Push code to GitHub or deploy via CLI
2. Zeabur detects the framework from package.json/requirements.txt/go.mod/etc.
3. Builds using the appropriate buildpack (Nixpacks)
4. Deploys to an isolated container with auto-scaling
5. Provisions a subdomain with SSL (*.zeabur.app)
```

### Marketplace Services

Deploy managed services alongside your application:

```typescript
// Available marketplace services (one-click deploy via dashboard or API)
const services = {
  databases: [
    "PostgreSQL",    // Managed Postgres with automatic backups
    "MySQL",         // Managed MySQL/MariaDB
    "MongoDB",       // Managed MongoDB
    "Redis",         // Managed Redis for caching
  ],
  messaging: [
    "RabbitMQ",      // Message broker
    "Kafka",         // Event streaming (via Redpanda)
  ],
  search: [
    "Meilisearch",   // Full-text search engine
    "Elasticsearch",
  ],
  tools: [
    "MinIO",         // S3-compatible object storage
    "n8n",           // Workflow automation
    "Umami",         // Web analytics
    "Plausible",     // Privacy-focused analytics
    "Ghost",         // Blog/CMS
    "Strapi",        // Headless CMS
  ],
};

// Services are deployed in the same project
// Connection strings are auto-injected as environment variables
// Example: DATABASE_URL is automatically available after adding PostgreSQL
```

### Git Integration

```yaml
# Automatic deployment on push
# Configure in Zeabur dashboard:
# 1. Connect GitHub/GitLab account
# 2. Select repository
# 3. Choose branch for auto-deploy
# 4. Zeabur creates a webhook that triggers deployment on push

# Branch-based environments:
# - main → production (api.myapp.com)
# - develop → staging (staging-api.myapp.com)
# - PR branches → preview deployments (pr-123-api.zeabur.app)
```

### API Integration

```typescript
// scripts/zeabur-api.ts — Zeabur API for automation
const ZEABUR_API = "https://gateway.zeabur.com/graphql";
const ZEABUR_TOKEN = process.env.ZEABUR_TOKEN!;

async function zeaburQuery(query: string, variables?: Record<string, any>) {
  const response = await fetch(ZEABUR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ZEABUR_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  if (result.errors) throw new Error(result.errors[0].message);
  return result.data;
}

// List all services in a project
async function listServices(projectId: string) {
  return zeaburQuery(`
    query ($projectId: ObjectID!) {
      project(_id: $projectId) {
        services {
          _id
          name
          status
          domains { domain }
        }
      }
    }
  `, { projectId });
}

// Restart a service
async function restartService(serviceId: string) {
  return zeaburQuery(`
    mutation ($serviceId: ObjectID!) {
      restartService(_id: $serviceId)
    }
  `, { serviceId });
}
```

## Best Practices

1. **Let auto-detection work** — Don't add config unless Zeabur gets it wrong; framework detection handles 90% of cases
2. **Use marketplace for databases** — Don't containerize your own Postgres; Zeabur's managed services handle backups and scaling
3. **Branch-based environments** — Map branches to environments (main→prod, develop→staging) for consistent deployment workflows
4. **Environment variable injection** — Marketplace services auto-inject connection strings; reference them by the standard variable names
5. **Custom domains early** — Add your domain and point DNS before going live; Zeabur handles SSL automatically
6. **Monitor build logs** — Check build logs when auto-detection fails; override with `zeabur.toml` if needed
7. **Use regions strategically** — Deploy close to your users; Zeabur supports multiple regions including Asia
8. **Scale based on traffic** — Configure auto-scaling with min/max instances; pay only for what you use
