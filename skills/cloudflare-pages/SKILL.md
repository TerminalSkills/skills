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
- **Preview deployments** for every pull request
- **Analytics and monitoring** built-in

Perfect for JAMstack applications, SPAs, static sites with dynamic functionality, and global content delivery.

## Instructions

### Step 1: Project Setup

Initialize a static site project compatible with Cloudflare Pages.

```bash
# Create a new static site (choose your framework)
# React with Vite
npm create vite@latest my-cf-app -- --template react-ts
cd my-cf-app

# Or Next.js static export
npx create-next-app@latest my-cf-app
cd my-cf-app
# Add to next.config.js: output: 'export', trailingSlash: true

# Or vanilla HTML/JS
mkdir my-cf-app
cd my-cf-app
npm init -y

# Install Wrangler CLI for local development
npm install -g wrangler
npm install -D @cloudflare/workers-types
```

### Step 2: Create Pages Functions

Create serverless functions using Pages Functions (built on Workers).

```javascript
// functions/api/hello.js
export async function onRequestGet(context) {
  const { request, env, params } = context;
  
  // Extract client information
  const country = request.cf?.country || 'Unknown';
  const city = request.cf?.city || 'Unknown';
  const ip = request.headers.get('CF-Connecting-IP');
  
  return Response.json({
    message: `Hello from ${city}, ${country}!`,
    timestamp: new Date().toISOString(),
    ip,
    rayId: request.headers.get('CF-Ray')
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const data = await request.json();
    
    // Store in KV (if KV binding is configured)
    if (env.MY_KV) {
      const key = `user_data_${Date.now()}`;
      await env.MY_KV.put(key, JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
        country: request.cf?.country
      }));
    }
    
    return Response.json({ 
      success: true, 
      message: 'Data stored successfully' 
    });
    
  } catch (error) {
    return Response.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
```

### Step 3: Advanced Functions with Middleware

Implement middleware and advanced routing patterns.

```typescript
// functions/_middleware.ts
interface Env {
  MY_KV: KVNamespace;
  API_TOKEN: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next, env } = context;
  
  // Add CORS headers
  const response = await next();
  
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  return response;
};
```

```typescript
// functions/api/auth/[action].ts
interface Env {
  AUTH_KV: KVNamespace;
  JWT_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const action = params.action as string;
  
  switch (action) {
    case 'login':
      return handleLogin(request, env);
    case 'register':
      return handleRegister(request, env);
    case 'verify':
      return handleVerify(request, env);
    default:
      return new Response('Not Found', { status: 404 });
  }
};

async function handleLogin(request: Request, env: Env) {
  try {
    const { email, password } = await request.json();
    
    // Get user from KV
    const userKey = `user:${email}`;
    const userData = await env.AUTH_KV.get(userKey, { type: 'json' });
    
    if (!userData || userData.password !== password) {
      return Response.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Create session token (simplified)
    const sessionToken = generateToken(email);
    const sessionKey = `session:${sessionToken}`;
    
    await env.AUTH_KV.put(sessionKey, JSON.stringify({
      email,
      loginTime: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    }), { expirationTtl: 86400 });
    
    return Response.json({
      success: true,
      token: sessionToken,
      user: { email: userData.email, name: userData.name }
    });
    
  } catch (error) {
    return Response.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}

function generateToken(email: string): string {
  // Simple token generation (use proper JWT in production)
  return btoa(`${email}:${Date.now()}:${Math.random()}`);
}
```

### Step 4: KV Storage Operations

Implement data persistence using Cloudflare KV.

```typescript
// functions/api/data/[...path].ts
interface Env {
  DATA_KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  const path = (params.path as string[]).join('/');
  
  try {
    const data = await env.DATA_KV.get(path, { type: 'json' });
    
    if (!data) {
      return Response.json(
        { error: 'Data not found' },
        { status: 404 }
      );
    }
    
    return Response.json(data);
    
  } catch (error) {
    return Response.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const path = (params.path as string[]).join('/');
  
  try {
    const data = await request.json();
    
    // Add metadata
    const enrichedData = {
      ...data,
      updatedAt: new Date().toISOString(),
      version: Date.now()
    };
    
    await env.DATA_KV.put(path, JSON.stringify(enrichedData));
    
    return Response.json({
      success: true,
      path,
      version: enrichedData.version
    });
    
  } catch (error) {
    return Response.json(
      { error: 'Failed to save data' },
      { status: 500 }
    );
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  const path = (params.path as string[]).join('/');
  
  try {
    await env.DATA_KV.delete(path);
    
    return Response.json({
      success: true,
      message: `Deleted ${path}`
    });
    
  } catch (error) {
    return Response.json(
      { error: 'Failed to delete data' },
      { status: 500 }
    );
  }
};
```

### Step 5: Real-time Features

Implement real-time functionality using Durable Objects or external services.

```typescript
// functions/api/websocket.ts
export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  
  // Upgrade to WebSocket
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }
  
  const [client, server] = Object.values(new WebSocketPair());
  
  // Handle WebSocket connection
  server.accept();
  
  server.addEventListener('message', event => {
    const message = JSON.parse(event.data as string);
    
    // Echo message with timestamp
    server.send(JSON.stringify({
      ...message,
      timestamp: new Date().toISOString(),
      echo: true
    }));
  });
  
  server.addEventListener('close', () => {
    console.log('WebSocket connection closed');
  });
  
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
};
```

### Step 6: Image Optimization

Implement image processing and optimization.

```typescript
// functions/api/images/[...path].ts
export const onRequestGet: PagesFunction = async (context) => {
  const { request, params } = context;
  const path = (params.path as string[]).join('/');
  
  // Parse query parameters
  const url = new URL(request.url);
  const width = parseInt(url.searchParams.get('w') || '800');
  const height = parseInt(url.searchParams.get('h') || '600');
  const quality = parseInt(url.searchParams.get('q') || '85');
  const format = url.searchParams.get('f') || 'jpeg';
  
  try {
    // Fetch original image
    const originalResponse = await fetch(`https://source.unsplash.com/${path}`);
    
    if (!originalResponse.ok) {
      return new Response('Image not found', { status: 404 });
    }
    
    // Use Cloudflare's Image Resizing (requires paid plan)
    const resizeUrl = new URL('/cdn-cgi/image/', request.url);
    resizeUrl.searchParams.set('width', width.toString());
    resizeUrl.searchParams.set('height', height.toString());
    resizeUrl.searchParams.set('quality', quality.toString());
    resizeUrl.searchParams.set('format', format);
    resizeUrl.searchParams.set('url', originalResponse.url);
    
    const resizedResponse = await fetch(resizeUrl.toString());
    
    return new Response(resizedResponse.body, {
      headers: {
        'Content-Type': `image/${format}`,
        'Cache-Control': 'public, max-age=31536000',
        'X-Processed-By': 'cloudflare-images'
      }
    });
    
  } catch (error) {
    return new Response('Image processing failed', { status: 500 });
  }
};
```

### Step 7: Configuration and Deployment

Set up configuration files for deployment.

```toml
# wrangler.toml
name = "my-cf-pages-app"
compatibility_date = "2024-02-01"

[env.production]
kv_namespaces = [
  { binding = "MY_KV", id = "your-kv-id", preview_id = "your-preview-kv-id" },
  { binding = "AUTH_KV", id = "your-auth-kv-id", preview_id = "your-auth-preview-kv-id" }
]

[env.production.vars]
API_URL = "https://api.example.com"
JWT_SECRET = "your-jwt-secret"
```

```json
// package.json
{
  "scripts": {
    "build": "vite build",
    "preview": "wrangler pages dev dist",
    "deploy": "wrangler pages deploy dist",
    "dev": "wrangler pages dev --local --port 3000 -- npm run build:watch"
  }
}
```

### Step 8: Analytics and Monitoring

Implement analytics and error tracking.

```typescript
// functions/api/analytics/[event].ts
interface Env {
  ANALYTICS_KV: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const eventType = params.event as string;
  
  try {
    const eventData = await request.json();
    
    // Create analytics record
    const analyticsRecord = {
      event: eventType,
      data: eventData,
      timestamp: Date.now(),
      country: request.cf?.country,
      city: request.cf?.city,
      userAgent: request.headers.get('User-Agent')?.substring(0, 200),
      ip: request.headers.get('CF-Connecting-IP'),
      rayId: request.headers.get('CF-Ray')
    };
    
    // Store with time-based key for easy querying
    const key = `analytics:${eventType}:${Date.now()}`;
    await env.ANALYTICS_KV.put(key, JSON.stringify(analyticsRecord), {
      expirationTtl: 30 * 24 * 60 * 60 // 30 days
    });
    
    // Also store daily aggregate
    const dateKey = `daily:${eventType}:${new Date().toISOString().slice(0, 10)}`;
    const dailyData = await env.ANALYTICS_KV.get(dateKey, { type: 'json' }) || { count: 0 };
    dailyData.count += 1;
    await env.ANALYTICS_KV.put(dateKey, JSON.stringify(dailyData));
    
    return Response.json({ success: true });
    
  } catch (error) {
    console.error('Analytics error:', error);
    return Response.json({ success: false }, { status: 500 });
  }
};
```

### Step 9: Deploy and Configure

Deploy your application to Cloudflare Pages.

```bash
# Create KV namespaces
wrangler kv:namespace create "MY_KV"
wrangler kv:namespace create "MY_KV" --preview

# Deploy static assets
npm run build
wrangler pages deploy dist

# Or connect to Git repository via Cloudflare Dashboard
# 1. Go to Cloudflare Dashboard > Pages
# 2. Connect your Git repository
# 3. Configure build settings
# 4. Set environment variables and KV bindings
```

## Guidelines

- **Leverage global network** - Cloudflare has 275+ edge locations worldwide
- **Use KV for persistence** - Perfect for configuration, user data, and caching
- **Optimize for edge** - Keep functions lightweight and fast
- **Monitor performance** - Use Cloudflare Analytics and Real User Monitoring
- **Handle errors gracefully** - Always provide fallbacks and error handling
- **Cache strategically** - Use appropriate cache headers and Cloudflare's caching
- **Security first** - Use security headers and validate inputs
- **Cost awareness** - Monitor KV operations and function invocations
- **Test thoroughly** - Use preview deployments for testing
- **Version control** - Use Git-based deployments for better collaboration