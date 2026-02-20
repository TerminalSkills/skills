---
name: "supabase-edge-functions"
description: "Build serverless Edge Functions on Supabase using Deno runtime with built-in database access and authentication"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "serverless"
  tags: ["supabase", "edge-functions", "deno", "serverless", "database", "auth"]
---

# Supabase Edge Functions

Build serverless Edge Functions on Supabase using Deno runtime with built-in database access, authentication integration, and global edge distribution.

## Overview

Supabase Edge Functions provide:

- **Deno runtime** with TypeScript-first development
- **Built-in database access** to your Supabase PostgreSQL database
- **Authentication integration** with Supabase Auth
- **Global edge deployment** with low latency worldwide

## Instructions

### Step 1: Setup

```bash
supabase init my-project
cd my-project
supabase functions new hello-world
```

### Step 2: Basic Function

```typescript
// supabase/functions/hello-world/index.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  return new Response(
    JSON.stringify({
      message: 'Hello from Supabase Edge Functions!',
      user: user?.email || 'anonymous',
      timestamp: new Date().toISOString()
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

### Step 3: Database Integration

```typescript
// supabase/functions/users/index.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .limit(10);

    return Response.json({ data, error });
  }

  return new Response('Method not allowed', { status: 405 });
});
```

### Step 4: Deploy

```bash
supabase functions deploy hello-world
supabase functions logs hello-world
```

## Guidelines

- **Use TypeScript** for better development experience
- **Leverage Supabase client** for database access with automatic auth context
- **Handle CORS properly** for client-side requests
- **Test locally** using `supabase functions serve`