---
name: "cloudflare-pages"
description: "Deploy full-stack applications on Cloudflare Pages with Workers, KV storage, and global edge distribution"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "hosting"
  tags: ["cloudflare", "pages", "workers", "edge", "jamstack", "serverless"]
---

# Cloudflare Pages

Deploy full-stack applications on Cloudflare Pages with integrated Workers for serverless functions, KV storage for data persistence, and global edge distribution.

## Overview

Cloudflare Pages provides:

- **Git-based deployments** with automatic builds from GitHub/GitLab
- **Global edge network** with 275+ locations worldwide
- **Integrated Workers** for serverless backend functionality
- **KV storage** for edge data persistence
- **Zero cold starts** with V8 isolate technology
- **Custom domains** with free SSL certificates

## Instructions

### Step 1: Project Setup

```bash
mkdir my-cf-app && cd my-cf-app
npm init -y
mkdir -p functions/api
mkdir public
```

### Step 2: Pages Function

```javascript
// functions/api/hello.js
export async function onRequestGet(context) {
  const { request, env } = context;
  const country = request.cf?.country || 'Unknown';
  
  return Response.json({
    message: `Hello from ${country}!`,
    timestamp: new Date().toISOString(),
    rayId: request.headers.get('CF-Ray')
  });
}
```

### Step 3: KV Storage

```javascript  
// functions/api/data.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const data = await request.json();
  
  // Store in KV
  await env.MY_KV.put(`data_${Date.now()}`, JSON.stringify(data));
  
  return Response.json({ success: true });
}
```

### Step 4: Deploy

```bash
# Connect to Git repository via Cloudflare Dashboard
# Configure build settings and environment variables
```

## Guidelines

- **Leverage global network** - Cloudflare has 275+ edge locations worldwide
- **Use KV for persistence** - Perfect for configuration, user data, and caching
- **Handle errors gracefully** - Always provide fallbacks and error handling