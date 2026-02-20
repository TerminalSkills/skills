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

### Step 2: Create Edge Function API Route

Create API routes that run on the Edge Runtime.

```typescript
// app/api/edge-example/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Enable Edge Runtime
export const runtime = 'edge';

export async function GET(request: NextRequest) {
  // Extract geolocation data
  const country = request.geo?.country || 'Unknown';
  const region = request.geo?.region || 'Unknown';
  const city = request.geo?.city || 'Unknown';
  
  // Get request info
  const userAgent = request.headers.get('user-agent');
  const ip = request.ip || request.headers.get('x-forwarded-for');
  
  // Create personalized response
  const response = {
    message: `Hello from ${city}, ${country}!`,
    location: { country, region, city },
    timestamp: new Date().toISOString(),
    ip: ip?.split(',')[0], // Handle comma-separated IPs
    userAgent: userAgent?.substring(0, 100) // Truncate for security
  };
  
  // Return JSON with CORS headers
  return NextResponse.json(response, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'public, max-age=0, s-maxage=60'
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Process data at the edge
    const processedData = {
      ...body,
      processedAt: new Date().toISOString(),
      location: request.geo,
      edgeProcessed: true
    };
    
    return NextResponse.json({
      success: true,
      data: processedData
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }
}
```

### Step 3: Implement Middleware

Create middleware for request interception and modification.

```typescript
// middleware.ts (in project root)
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Get user's location
  const country = request.geo?.country || 'US';
  const region = request.geo?.region || '';
  
  // Redirect based on location
  if (request.nextUrl.pathname === '/') {
    return redirectBasedOnLocation(request, country);
  }
  
  // A/B testing
  if (request.nextUrl.pathname.startsWith('/experiment')) {
    return handleABTesting(request);
  }
  
  // Authentication check
  if (request.nextUrl.pathname.startsWith('/protected')) {
    return checkAuthentication(request);
  }
  
  // Add geo headers to all requests
  const response = NextResponse.next();
  response.headers.set('x-user-country', country);
  response.headers.set('x-user-region', region);
  response.headers.set('x-edge-processed', 'true');
  
  return response;
}

function redirectBasedOnLocation(request: NextRequest, country: string) {
  // Redirect based on country
  const countryRoutes = {
    'GB': '/uk',
    'DE': '/de',
    'FR': '/fr',
    'JP': '/jp'
  };
  
  const targetRoute = countryRoutes[country as keyof typeof countryRoutes];
  
  if (targetRoute) {
    return NextResponse.redirect(
      new URL(targetRoute, request.url)
    );
  }
  
  return NextResponse.next();
}

function handleABTesting(request: NextRequest) {
  // Get or set experiment cookie
  let variant = request.cookies.get('experiment_variant')?.value;
  
  if (!variant) {
    // Assign variant based on IP hash for consistency
    const ip = request.ip || '0.0.0.0';
    const hash = simpleHash(ip);
    variant = hash % 2 === 0 ? 'A' : 'B';
  }
  
  // Rewrite to variant-specific route
  const url = request.nextUrl.clone();
  url.pathname = `/experiment/${variant}${url.pathname.replace('/experiment', '')}`;
  
  const response = NextResponse.rewrite(url);
  response.cookies.set('experiment_variant', variant, {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    httpOnly: true,
    sameSite: 'lax'
  });
  
  return response;
}

function checkAuthentication(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  
  if (!token || !isValidToken(token)) {
    return NextResponse.redirect(
      new URL('/login', request.url)
    );
  }
  
  return NextResponse.next();
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function isValidToken(token: string): boolean {
  // Implement token validation logic
  // This is a simplified example
  return token.length > 10;
}

// Configure which paths middleware runs on
export const config = {
  matcher: [
    '/',
    '/experiment/:path*',
    '/protected/:path*',
    '/api/:path*'
  ]
};
```

### Step 4: Advanced Edge Functions

Implement more complex edge functions for real-world use cases.

```typescript
// app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

export const runtime = 'edge';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-key'
);

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    
    // Validate credentials (simplified)
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }
    
    // In production, verify against database
    const isValid = await verifyCredentials(email, password);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Create JWT token
    const token = await new SignJWT({ 
      email, 
      iat: Math.floor(Date.now() / 1000),
      location: request.geo 
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET);
    
    // Set secure cookie
    const response = NextResponse.json({ 
      success: true, 
      user: { email } 
    });
    
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/'
    });
    
    return response;
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

async function verifyCredentials(email: string, password: string): Promise<boolean> {
  // Implement your authentication logic
  // This could call an external API, database, etc.
  return email.includes('@') && password.length >= 6;
}
```

### Step 5: Streaming and Real-time

Implement streaming responses for real-time data.

```typescript
// app/api/stream/route.ts
export const runtime = 'edge';

export async function GET() {
  // Create streaming response
  const stream = new ReadableStream({
    start(controller) {
      let counter = 0;
      
      const interval = setInterval(() => {
        const data = {
          timestamp: new Date().toISOString(),
          counter: ++counter,
          message: `Stream update #${counter}`
        };
        
        // Send Server-Sent Events format
        const chunk = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(chunk));
        
        // Close after 10 messages
        if (counter >= 10) {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
```

### Step 6: Image Processing at Edge

Process images on-the-fly using Edge Functions.

```typescript
// app/api/image/[...slug]/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string[] } }
) {
  try {
    const [width, height, ...pathSegments] = params.slug;
    const imagePath = pathSegments.join('/');
    
    // Validate dimensions
    const w = parseInt(width) || 800;
    const h = parseInt(height) || 600;
    
    if (w > 2000 || h > 2000) {
      return new Response('Dimensions too large', { status: 400 });
    }
    
    // Get original image
    const originalUrl = `https://source.unsplash.com/${imagePath}`;
    const response = await fetch(originalUrl);
    
    if (!response.ok) {
      return new Response('Image not found', { status: 404 });
    }
    
    // For more advanced processing, you'd use a service like Cloudinary
    // or implement WebAssembly-based image processing
    
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'X-Processed-At-Edge': 'true'
      }
    });
    
  } catch (error) {
    return new Response('Image processing failed', { status: 500 });
  }
}
```

### Step 7: Deploy and Monitor

Deploy your edge functions and set up monitoring.

```bash
# Deploy to Vercel
vercel deploy

# Deploy to production
vercel --prod

# Check function logs
vercel logs

# Monitor performance in Vercel dashboard
# Visit: https://vercel.com/dashboard
```

```typescript
// Add monitoring to your edge functions
export async function GET(request: NextRequest) {
  const start = Date.now();
  
  try {
    // Your function logic here
    const result = await processRequest(request);
    
    // Log performance metrics
    console.log({
      duration: Date.now() - start,
      country: request.geo?.country,
      path: request.nextUrl.pathname,
      success: true
    });
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error({
      duration: Date.now() - start,
      error: error.message,
      path: request.nextUrl.pathname,
      success: false
    });
    
    throw error;
  }
}
```

## Guidelines

- **Keep functions lightweight** - Edge functions have memory and execution time limits
- **Use Web APIs only** - Node.js APIs are not available in Edge Runtime
- **Handle errors gracefully** - Always provide fallbacks for network failures
- **Cache strategically** - Use appropriate cache headers for static responses
- **Minimize dependencies** - Fewer dependencies mean faster cold starts
- **Test geolocation** - Test with different locations using VPN or Vercel's testing tools
- **Monitor performance** - Track response times and error rates
- **Security first** - Validate inputs and sanitize outputs
- **Consider costs** - Monitor function invocations and execution time
- **Use TypeScript** - Better development experience and type safety