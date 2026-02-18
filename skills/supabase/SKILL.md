---
name: supabase
description: >-
  Build applications with Supabase as the backend — Postgres database,
  authentication, real-time subscriptions, storage, and edge functions. Use when
  someone asks to "set up Supabase", "add authentication", "create a real-time
  app", "set up row-level security", "configure Supabase storage", "write edge
  functions", or "migrate from Firebase to Supabase". Covers project setup,
  schema design with RLS, auth flows, real-time subscriptions, file storage, and
  edge functions.
license: Apache-2.0
compatibility: 'Supabase JS v2+, any framework (Next.js, React, Vue, SvelteKit, Flutter)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - supabase
    - postgres
    - authentication
    - realtime
    - baas
---

# Supabase

## Overview

This skill helps AI agents build full-stack applications using Supabase as the backend platform. It covers Postgres database design with Row-Level Security, authentication flows (email, OAuth, magic links), real-time subscriptions, file storage with access policies, and edge functions for server-side logic.

## Instructions

### Step 1: Project Setup

```bash
npm install -g supabase
supabase init          # Init local project
supabase start         # Start local development
supabase link --project-ref your-project-ref
```

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Browser client (anon key, RLS enforced)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server client (service role key, bypasses RLS — NEVER expose in client code)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

### Step 2: Database Schema with Row-Level Security

```sql
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

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;

-- Profiles: anyone can read, only owner can update
create policy "Public profiles" on public.profiles for select using (true);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);

-- Projects: public visible to all, private only to owner/members
create policy "Public projects visible" on public.projects for select using (is_public = true);
create policy "Owners see own projects" on public.projects for select using (owner_id = auth.uid());
create policy "Owners create projects" on public.projects for insert with check (auth.uid() = owner_id);
create policy "Owners update projects" on public.projects for update using (owner_id = auth.uid());
create policy "Owners delete projects" on public.projects for delete using (owner_id = auth.uid());

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### Step 3: Authentication

```typescript
// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com', password: 'secure-password',
  options: { data: { username: 'johndoe', full_name: 'John Doe' } }
});

// Sign in
await supabase.auth.signInWithPassword({ email: 'user@example.com', password: 'secure-password' });

// OAuth (GitHub, Google, etc.)
await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: { redirectTo: 'http://localhost:3000/auth/callback' }
});

// Magic link
await supabase.auth.signInWithOtp({
  email: 'user@example.com',
  options: { emailRedirectTo: 'http://localhost:3000/auth/callback' }
});

// Auth state listener
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') console.log('Signed in:', session?.user.id);
});
```

### Step 4: CRUD Operations

```typescript
// Insert
const { data } = await supabase.from('projects')
  .insert({ name: 'My Project', owner_id: user.id }).select().single();

// Select with joins
const { data } = await supabase.from('projects')
  .select(`*, owner:profiles!owner_id(username, avatar_url)`)
  .eq('is_public', true).order('created_at', { ascending: false }).range(0, 9);

// Update
await supabase.from('projects').update({ name: 'Updated' }).eq('id', projectId).select().single();

// Delete
await supabase.from('projects').delete().eq('id', projectId);

// Upsert
await supabase.from('profiles').upsert({ id: user.id, username: 'newname' }).select().single();

// RPC (database functions)
await supabase.rpc('get_project_stats', { project_id: projectId });
```

### Step 5: Real-Time Subscriptions

```typescript
// Subscribe to table changes
const channel = supabase.channel('project-changes')
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'projects', filter: 'owner_id=eq.' + user.id
  }, (payload) => console.log('Change:', payload.eventType, payload.new))
  .subscribe();

// Presence (who's online)
const presence = supabase.channel('room-1');
presence.on('presence', { event: 'sync' }, () => {
  console.log('Online:', Object.keys(presence.presenceState()).length);
}).subscribe(async (status) => {
  if (status === 'SUBSCRIBED') await presence.track({ user_id: user.id });
});

// Cleanup
supabase.removeChannel(channel);
```

### Step 6: File Storage

```sql
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

create policy "Users upload own avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Anyone views avatars" on storage.objects for select using (bucket_id = 'avatars');
```

```typescript
// Upload
await supabase.storage.from('avatars').upload(`${user.id}/avatar.png`, file, { upsert: true });

// Get public URL
const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(`${user.id}/avatar.png`);

// Download / List / Delete
await supabase.storage.from('avatars').download(`${user.id}/avatar.png`);
await supabase.storage.from('avatars').list(user.id, { limit: 100 });
await supabase.storage.from('avatars').remove([`${user.id}/avatar.png`]);
```

### Step 7: Edge Functions

```typescript
// supabase/functions/send-welcome-email/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { record } = await req.json();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', record.id).single();

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'welcome@example.com', to: record.email, subject: 'Welcome!', html: `<h1>Welcome, ${profile?.full_name}!</h1>` }),
  });
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
});
```

```bash
supabase functions deploy send-welcome-email
supabase secrets set RESEND_API_KEY=re_xxxxx
```

## Examples

### Example 1: Build a project management app with real-time updates
**User prompt:** "Set up a Supabase backend for a project management app where users can create projects, invite members, and see changes in real time."

The agent will:
1. Create `profiles`, `projects`, and `project_members` tables with proper foreign keys
2. Enable RLS on all tables with policies: owners manage projects, members get read access, public projects visible to everyone
3. Add a database trigger to auto-create a profile when a user signs up via `auth.users`
4. Set up real-time subscriptions on the `projects` table filtered by `owner_id` so the dashboard updates instantly
5. Configure authentication with email/password and GitHub OAuth sign-in

### Example 2: Add avatar uploads with storage policies
**User prompt:** "Add profile picture uploads to my Supabase app. Users should only be able to upload their own avatar but anyone can view them."

The agent will:
1. Create a public `avatars` storage bucket
2. Add storage policies: insert/update restricted to `auth.uid()::text = (storage.foldername(name))[1]`, select open to all
3. Implement the upload using `supabase.storage.from('avatars').upload()` with the user ID as the folder path
4. Get the public URL with `getPublicUrl()` and update the user's `profiles.avatar_url` field

## Guidelines

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
