---
name: "vercel-edge-functions"
description: "Deploy serverless edge functions on Vercel with middleware, API routes, and geolocation features"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "serverless"
  tags: ["vercel", "edge", "serverless", "middleware", "api", "geolocation"]
---

# Vercel Edge Functions

Deploy serverless edge functions on Vercel with support for middleware, API routes, geolocation, and global distribution.

## Overview

Vercel Edge Functions run on the Edge Runtime using Web APIs, providing:

- **Global edge deployment** with sub-100ms cold starts
- **Middleware support** for request/response modification
- **Geolocation data** from request headers
- **Streaming responses** for real-time applications
- **TypeScript support** with native compilation
- **Zero configuration** deployment

Perfect for authentication, A/B testing, redirects, content personalization, and API proxying.

## Instructions

### Step 1: Project Setup

Initialize a new Vercel project or add edge functions to existing one.

```bash
# Create new Next.js project (recommended for Edge Functions)
npx create-next-app@latest my-edge-app
cd my-edge-app

# Or initialize in existing project
npm init -y
npm install @vercel/edge

# Install Vercel CLI
npm install -g vercel
```

### Step 2: Basic Edge Function

Create a simple edge function with geolocation.

```typescript
// app/api/hello/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const country = request.geo?.country || 'Unknown';
  const city = request.geo?.city || 'Unknown';
  const ip = request.ip;
  
  return NextResponse.json({
    message: `Hello from ${city}, ${country}!`,
    timestamp: new Date().toISOString(),
    ip,
    headers: Object.fromEntries(request.headers.entries())
  });
}
```

### Step 3: Middleware Implementation

Create middleware for request interception.

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const country = request.geo?.country || 'US';
  
  // Geographic redirect
  if (request.nextUrl.pathname === '/' && country !== 'US') {
    const url = request.nextUrl.clone();
    url.pathname = `/${country.toLowerCase()}`;
    return NextResponse.redirect(url);
  }
  
  // Add geo headers
  const response = NextResponse.next();
  response.headers.set('x-country', country);
  return response;
}

export const config = {
  matcher: ['/', '/api/:path*']
};
```

### Step 4: Advanced Features

Implement authentication and A/B testing.

```typescript
// app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

export const runtime = 'edge';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  
  // Simple validation
  if (email && password === 'secret') {
    const token = await new SignJWT({ email })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET);
    
    const response = NextResponse.json({ success: true });
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: true,
      maxAge: 86400
    });
    
    return response;
  }
  
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
```

### Step 5: Deploy and Monitor

Deploy your edge functions to Vercel.

```bash
# Deploy to Vercel
vercel deploy

# View logs
vercel logs

# Environment variables
vercel env add JWT_SECRET production
```

## Guidelines

- **Keep functions lightweight** - Edge functions have memory and execution time limits
- **Use Web APIs only** - Node.js APIs are not available in Edge Runtime
- **Handle errors gracefully** - Always provide fallbacks for network failures
- **Cache strategically** - Use appropriate cache headers for static responses
- **Test geolocation** - Test with different locations using VPN or Vercel's testing tools
- **Monitor performance** - Track response times and error rates
- **Security first** - Validate inputs and sanitize outputs