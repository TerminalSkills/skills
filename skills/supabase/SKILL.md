---
name: supabase
description: >-
  Build applications with Supabase as the backend — Postgres database, authentication,
  real-time subscriptions, storage, and edge functions. Use when someone asks to "set up
  Supabase", "add authentication", "create a real-time app", "set up row-level security",
  "configure Supabase storage", "write edge functions", or "migrate from Firebase to Supabase".
  Covers project setup, schema design with RLS, auth flows, real-time subscriptions,
  file storage, and edge functions.
license: Apache-2.0
compatibility: "Supabase JS v2+, any framework (Next.js, React, Vue, SvelteKit, Flutter)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["supabase", "postgres", "authentication", "realtime", "baas", "edge-functions"]
---

# Supabase

## Overview

This skill helps AI agents build full-stack applications using Supabase as the backend platform. It covers Postgres database design with Row-Level Security, authentication flows (email, OAuth, magic links), real-time subscriptions, file storage with access policies, and edge functions for server-side logic.

## Instructions

### Step 1: Project Setup

Initialize a Supabase project and configure the client:

```bash
# Install CLI
npm install -g supabase

# Init local project
supabase init

# Start local development
supabase start

# Link to remote project
supabase link --project-ref your-project-ref
```

Client setup:

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Browser client (uses anon key, RLS enforced)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server client (uses service role key, bypasses RLS)
// NEVER expose this in client-side code
import { createClient as createServerClient } from '@supabase/supabase-js';
export const supabaseAdmin = createServerClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

### Step 2: Database Schema with Row-Level Security

Always design tables with RLS from the start:

```sql
-- Create tables
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table public.projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.project_members (
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text check (role in ('viewer', 'editor', 'admin')) default 'viewer',
  joined_at timestamptz default now(),
  primary key (project_id, user_id)
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;

-- Profiles: users can read any profile, update only their own
create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Projects: public projects visible to all, private only to members
create policy "Public projects are viewable by everyone"
  on public.projects for select
  using (is_public = true);

create policy "Project members can view private projects"
  on public.projects for select
  using (
    exists (
      select 1 from public.project_members
      where project_id = projects.id and user_id = auth.uid()
    )
  );

create policy "Owners can view own projects"
  on public.projects for select
  using (owner_id = auth.uid());

create policy "Authenticated users can create projects"
  on public.projects for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update projects"
  on public.projects for update
  using (owner_id = auth.uid());

create policy "Owners can delete projects"
  on public.projects for delete
  using (owner_id = auth.uid());

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated_at trigger
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure public.update_updated_at();
```

### Step 3: Authentication

```typescript
// Sign up with email
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
  options: {
    data: { username: 'johndoe', full_name: 'John Doe' }
  }
});

// Sign in with email
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password'
});

// OAuth (Google, GitHub, etc.)
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: { redirectTo: 'http://localhost:3000/auth/callback' }
});

// Magic link
const { data, error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com',
  options: { emailRedirectTo: 'http://localhost:3000/auth/callback' }
});

// Auth state listener
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') console.log('User signed in:', session?.user.id);
  if (event === 'SIGNED_OUT') console.log('User signed out');
  if (event === 'TOKEN_REFRESHED') console.log('Token refreshed');
});

// Server-side auth (Next.js App Router)
// app/auth/callback/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL('/', request.url));
}
```

### Step 4: CRUD Operations

```typescript
// Insert
const { data, error } = await supabase
  .from('projects')
  .insert({ name: 'My Project', description: 'A new project', owner_id: user.id })
  .select()
  .single();

// Select with filters and joins
const { data, error } = await supabase
  .from('projects')
  .select(`
    *,
    owner:profiles!owner_id(username, avatar_url),
    members:project_members(
      user:profiles(username, avatar_url),
      role
    )
  `)
  .eq('is_public', true)
  .order('created_at', { ascending: false })
  .range(0, 9);

// Update
const { data, error } = await supabase
  .from('projects')
  .update({ name: 'Updated Name' })
  .eq('id', projectId)
  .select()
  .single();

// Delete
const { error } = await supabase
  .from('projects')
  .delete()
  .eq('id', projectId);

// Upsert
const { data, error } = await supabase
  .from('profiles')
  .upsert({ id: user.id, username: 'newname', full_name: 'New Name' })
  .select()
  .single();

// RPC (call database functions)
const { data, error } = await supabase.rpc('get_project_stats', {
  project_id: projectId
});
```

### Step 5: Real-Time Subscriptions

```typescript
// Subscribe to table changes
const channel = supabase
  .channel('project-changes')
  .on(
    'postgres_changes',
    {
      event: '*', // INSERT, UPDATE, DELETE, or *
      schema: 'public',
      table: 'projects',
      filter: 'owner_id=eq.' + user.id
    },
    (payload) => {
      console.log('Change:', payload.eventType, payload.new, payload.old);
    }
  )
  .subscribe();

// Presence (who's online)
const presenceChannel = supabase.channel('room-1');
presenceChannel
  .on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState();
    console.log('Online users:', Object.keys(state).length);
  })
  .on('presence', { event: 'join' }, ({ key, newPresences }) => {
    console.log('Joined:', newPresences);
  })
  .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    console.log('Left:', leftPresences);
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ user_id: user.id, username: user.username });
    }
  });

// Broadcast (ephemeral messages, no persistence)
const broadcastChannel = supabase.channel('cursor-positions');
broadcastChannel
  .on('broadcast', { event: 'cursor' }, ({ payload }) => {
    console.log('Cursor moved:', payload);
  })
  .subscribe();

broadcastChannel.send({
  type: 'broadcast',
  event: 'cursor',
  payload: { x: 100, y: 200, user_id: user.id }
});

// Cleanup
supabase.removeChannel(channel);
```

### Step 6: File Storage

```sql
-- Create storage bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

-- Storage policies
create policy "Users can upload own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
```

```typescript
// Upload file
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${user.id}/avatar.png`, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: 'image/png'
  });

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl(`${user.id}/avatar.png`);

// Download
const { data, error } = await supabase.storage
  .from('avatars')
  .download(`${user.id}/avatar.png`);

// List files
const { data, error } = await supabase.storage
  .from('avatars')
  .list(user.id, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

// Delete
const { error } = await supabase.storage
  .from('avatars')
  .remove([`${user.id}/avatar.png`]);
```

### Step 7: Edge Functions

```typescript
// supabase/functions/send-welcome-email/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { record } = await req.json();

  // Use service role to access data
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', record.id)
    .single();

  // Send email via Resend, SendGrid, etc.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'welcome@example.com',
      to: record.email,
      subject: 'Welcome!',
      html: `<h1>Welcome, ${profile?.full_name}!</h1>`,
    }),
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

```bash
# Deploy edge function
supabase functions deploy send-welcome-email

# Set secrets
supabase secrets set RESEND_API_KEY=re_xxxxx

# Invoke locally
supabase functions serve send-welcome-email
curl -X POST http://localhost:54321/functions/v1/send-welcome-email \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"record": {"id": "xxx", "email": "test@example.com"}}'
```

### Database Migrations

```bash
# Create migration
supabase migration new create_projects_table

# Edit: supabase/migrations/20240101000000_create_projects_table.sql
# Then apply:
supabase db push

# Pull remote schema changes
supabase db pull

# Reset local database
supabase db reset

# Diff local vs remote
supabase db diff
```

## Best Practices

- Always enable RLS on every table — a table without RLS is publicly accessible via the anon key
- Use `auth.uid()` in RLS policies, never trust client-provided user IDs
- Use `security definer` functions for operations that need elevated access
- Create database triggers for auto-populating profiles, updated_at, etc.
- Use migrations for all schema changes — never modify production schema manually
- Keep the service role key server-side only — never expose in client bundles
- Use `select()` after insert/update to get the resulting row
- Add proper indexes for columns used in RLS policies and frequent queries
- Use Supabase CLI for local development — test RLS policies before deploying
- Unsubscribe from real-time channels on component unmount to prevent memory leaks
