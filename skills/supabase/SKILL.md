---
name: supabase
description: >-
  Supabase is an open-source backend platform built on Postgres, with auth,
  realtime, storage and edge functions. Use when someone asks to "set up
  Supabase", "add authentication", "create a real-time app", "set up row-level
  security", "configure Supabase storage", "write edge functions", or "migrate
  from Firebase to Supabase". Covers the CLI, migrations, RLS schema design,
  auth flows, realtime subscriptions, storage policies and edge functions.
license: Apache-2.0
compatibility: "supabase-js v2, Supabase CLI 2.x (Docker for local development); any framework (Next.js, React, Vue, SvelteKit, Flutter)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/supabase/supabase
  tags: "supabase, postgres, authentication, realtime, baas"
---

# Supabase

## Overview

This skill helps AI agents build full-stack applications on Supabase: Postgres schema design with Row Level Security (RLS), authentication flows (email, OAuth, magic links), realtime subscriptions, file storage with access policies, and edge functions. Checked against the Supabase docs, CLI 2.122.0 and `@supabase/supabase-js` 2.118.

## Instructions

### Step 1: CLI and project setup

Install the CLI per project (`npm install -g supabase` is not a supported install method) or with Homebrew:

```bash
npm install -D supabase                  # then run it as: npx supabase <command>
brew install supabase/tap/supabase       # macOS and Linux alternative

npx supabase init                        # creates supabase/config.toml
npx supabase start                       # local stack in Docker; prints local URL and keys
npx supabase login                       # opens the browser
npx supabase link --project-ref abcdefghijklmnopqrst   # 20-letter ref from the dashboard URL
```

API keys: use the **publishable** key (`sb_publishable_...`) in anything you ship and the **secret** key (`sb_secret_...`) only on servers and edge functions. The old `anon` and `service_role` JWT keys still work but are being deprecated by the end of 2026.

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Browser client: publishable key, RLS enforced
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

// Server-only client: secret key bypasses RLS. Never import this in client code.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } }
);
```

For server-rendered frameworks (Next.js, SvelteKit, Remix) add `@supabase/ssr`, which stores the session in cookies. On the server verify the caller with `supabase.auth.getClaims()` or `getUser()`, never with `getSession()` alone.

### Step 2: Schema, migrations and RLS

Put every schema change in a migration file, test it locally, then push it:

```bash
npx supabase migration new create_profiles_and_projects   # supabase/migrations/<timestamp>_...sql
npx supabase db reset                                     # rebuild the local database from migrations
npx supabase db push                                      # apply to the linked remote project
```

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
  created_at timestamptz default now()
);
create index projects_owner_id_idx on public.projects (owner_id);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

-- Wrap auth.uid() in a select so Postgres evaluates it once per query, not per row
create policy "Profiles are public" on public.profiles for select using (true);
create policy "Users update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Public projects are visible" on public.projects for select using (is_public);
create policy "Owners read own projects" on public.projects for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners create projects" on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owners update projects" on public.projects for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners delete projects" on public.projects for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Auto-create a profile on signup. SECURITY DEFINER functions must pin search_path.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)),  -- OAuth sign-ups send no username
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### Step 3: Authentication

```typescript
// Sign up (with email confirmation on, the user must confirm before a session exists)
const { data, error } = await supabase.auth.signUp({
  email: 'maria.lopez@northwind.example',
  password: process.env.TEST_USER_PASSWORD!,
  options: { data: { username: 'marialopez', full_name: 'Maria Lopez' } },
});

await supabase.auth.signInWithPassword({ email: 'maria.lopez@northwind.example', password });

// OAuth (GitHub, Google, ...): add the provider and redirect URL in the dashboard first
await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: { redirectTo: 'http://localhost:3000/auth/callback' },
});

// Magic link
await supabase.auth.signInWithOtp({
  email: 'maria.lopez@northwind.example',
  options: { emailRedirectTo: 'http://localhost:3000/auth/callback' },
});

const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') console.log('Signed in:', session?.user.id);
});
// subscription.unsubscribe() on cleanup
```

### Step 4: Data access

```typescript
const { data: project, error } = await supabase.from('projects')
  .insert({ name: 'Website redesign', owner_id: user.id }).select().single();

const { data: projects } = await supabase.from('projects')
  .select('*, owner:profiles!owner_id(username, avatar_url)')
  .eq('is_public', true).order('created_at', { ascending: false }).range(0, 9);

await supabase.from('projects').update({ name: 'Website redesign v2' }).eq('id', project.id).select().single();
await supabase.from('projects').delete().eq('id', project.id);
await supabase.from('profiles').upsert({ id: user.id, username: 'marialopez' }).select().single();
await supabase.rpc('get_project_stats', { project_id: project.id });   // Postgres function
```

Every call returns `{ data, error }` and does not throw: check `error`. Generate types with `npx supabase gen types typescript --linked > lib/database.types.ts` and pass `createClient<Database>(...)`.

### Step 5: Realtime

Tables must be in the `supabase_realtime` publication, and RLS is applied to the events each client receives:

```sql
alter publication supabase_realtime add table public.projects;
```

```typescript
const channel = supabase.channel('project-changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'projects', filter: `owner_id=eq.${user.id}` },
    (payload) => console.log(payload.eventType, payload.new))
  .subscribe();

const room = supabase.channel('room-1');          // presence: who is online
room.on('presence', { event: 'sync' }, () => {
  console.log('Online:', Object.keys(room.presenceState()).length);
}).subscribe(async (status) => {
  if (status === 'SUBSCRIBED') await room.track({ user_id: user.id });
});

supabase.removeChannel(channel);                  // on unmount
```

Delete events cannot be filtered and RLS is not applied to them.

### Step 6: Storage

```sql
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

create policy "Users upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);
create policy "Anyone views avatars" on storage.objects for select using (bucket_id = 'avatars');
```

```typescript
await supabase.storage.from('avatars').upload(`${user.id}/avatar.png`, file, { upsert: true });
const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(`${user.id}/avatar.png`);
await supabase.storage.from('avatars').list(user.id, { limit: 100 });
await supabase.storage.from('avatars').remove([`${user.id}/avatar.png`]);
```

`upsert: true` also needs an `update` policy on `storage.objects`. For private buckets use `createSignedUrl(path, 3600)`.

### Step 7: Edge functions

```bash
npx supabase functions new send-welcome-email    # supabase/functions/send-welcome-email/index.ts
npx supabase functions serve                   # serves all functions; needs Docker
npx supabase secrets set RESEND_API_KEY=...      # value from your shell, not typed into the repo
npx supabase functions deploy send-welcome-email
```

Functions run on Deno. The generated template wraps the handler in `withSupabase` from `@supabase/server`, which checks the caller (`auth: 'user' | 'secret' | 'publishable' | 'none'`) and gives you a client on `ctx`:

```typescript
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    // ctx.supabase is scoped to the caller's RLS; ctx.supabaseAdmin bypasses it
    const { data: profile } = await ctx.supabase.from("profiles")
      .select("full_name").eq("id", ctx.userClaims?.id).single();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Northwind <welcome@mail.northwind.example>",
        to: ctx.userClaims?.email,
        subject: "Welcome to Northwind",
        html: `<h1>Welcome, ${profile?.full_name ?? "there"}!</h1>`,
      }),
    });
    return Response.json({ sent: res.ok }, { status: res.ok ? 200 : 502 });
  }),
};
```

`SUPABASE_URL` and the keys are available inside functions automatically. For webhooks and cron calls use `auth: 'secret'` or `'none'` with a signature check, and set `verify_jwt = false` for that function in `config.toml`.

## Examples

### Example 1: Project management app with realtime updates

**User prompt:** "Set up a Supabase backend for a project management app where users can create projects, invite members, and see changes in real time."

The agent runs `supabase init` and `supabase migration new`, creates `profiles`, `projects` and `project_members` with foreign keys, enables RLS with owner/member policies, adds the signup trigger, adds `projects` to the `supabase_realtime` publication, subscribes the dashboard to changes filtered by `owner_id`, and applies it locally with `supabase db reset` before `supabase db push`.

### Example 2: Avatar uploads

**User prompt:** "Add profile picture uploads to my Supabase app. Users should only be able to upload their own avatar but anyone can view them."

The agent creates a public `avatars` bucket, adds the insert policy on `(storage.foldername(name))[1] = auth.uid()::text` and an open select policy, uploads to `${user.id}/avatar.png`, then saves `getPublicUrl()` into `profiles.avatar_url`.

## Guidelines

- Enable RLS on every table in an exposed schema: without policies a table is open to anyone holding the publishable key.
- Never trust user IDs sent by the client; use `auth.uid()` in policies. Never base authorization on `user_metadata`, which users can edit.
- Keep the secret key (and legacy `service_role`) on the server; if it leaks, rotate it in the dashboard.
- `security definer` functions must set `search_path = ''` and use schema-qualified names.
- Index columns used in RLS policies and filters; wrap `auth.uid()` in `(select ...)`.
- All schema changes go through migrations; use `supabase db push`, not manual edits to production.
- Unsubscribe realtime channels and auth listeners when a component unmounts.
