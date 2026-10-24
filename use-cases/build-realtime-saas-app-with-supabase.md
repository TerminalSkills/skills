---
title: "Build a Real-Time SaaS Application with Supabase"
slug: build-realtime-saas-app-with-supabase
description: "Build a multi-tenant SaaS application with Supabase: Postgres with Row-Level Security, magic-link and Google sign-in, real-time task updates with presence, and private file storage, without running your own backend."
skills: [supabase, auth-system-setup, database-schema-designer]
category: development
tags: [supabase, saas, realtime, authentication, postgres, baas]
---

# Build a Real-Time SaaS Application with Supabase

## The Problem

Marta is a solo developer building a project management tool for freelancers. She has a working React frontend: the UI is designed, the components are built, the routing works. What she does not have is a backend.

She needs user authentication, a database with access control so users only see their own workspaces, real-time updates when team members change tasks, and file storage for attachments. Building that with Node.js and Express means writing auth middleware, REST endpoints, a WebSocket server, upload handling and the deployment of all of it. For a solo developer that is weeks of backend work before any product feature.

## The Solution

Use **supabase** for the whole backend: Postgres with Row-Level Security (RLS), Auth, Realtime and Storage. Use **database-schema-designer** for the multi-tenant model (every row belongs to a workspace, and membership decides access) and **auth-system-setup** for the sign-in flow (magic link first, Google as an alternative, session refresh on the server). Ask your agent to follow the three skills and it can produce the files below. The SQL here was run against a real Postgres 16 with stand-ins for the Supabase schemas, and the TypeScript was type-checked against current `@supabase/supabase-js` and `@supabase/ssr`.

## Step-by-Step Walkthrough

### Step 1: Start a local project and create the schema

```console
$ npm install -D supabase
$ npx supabase init && npx supabase start
$ npx supabase migration new create_schema
```

Put the following in the new file under `supabase/migrations/`. The key decision is to repeat `workspace_id` on every child table, so each policy is a single membership check instead of a chain of joins, and so Realtime can filter on it:

```sql
create schema if not exists private;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text, avatar_url text
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null, owner_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role text not null check (role in ('owner', 'admin', 'member')),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade, name text not null
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'done')),
  position integer not null default 0
);
create index on public.tasks (workspace_id, project_id);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id),
  content text not null, created_at timestamptz not null default now()
);
create index on public.comments (workspace_id, task_id);
```

Row-Level Security must be switched on for every table in an exposed schema; a table without it is readable by anyone holding the public key. Add a second migration:

```sql
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
create function private.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members
    where workspace_id = ws and user_id = (select auth.uid()));
$$;
create function private.shares_workspace(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = (select auth.uid()) and b.user_id = other);
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid), private.shares_workspace(uuid) to authenticated;
revoke execute on function private.is_member(uuid), private.shares_workspace(uuid) from public, anon;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_workspace(id));
create policy workspaces_select on public.workspaces for select to authenticated
  using (private.is_member(id) or owner_id = (select auth.uid()));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy members_select on public.workspace_members for select to authenticated
  using (private.is_member(workspace_id));
create policy projects_all on public.projects for all to authenticated
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy tasks_all on public.tasks for all to authenticated
  using (private.is_member(workspace_id)) with check (private.is_member(workspace_id));
create policy comments_select on public.comments for select to authenticated
  using (private.is_member(workspace_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (private.is_member(workspace_id) and author_id = (select auth.uid()));
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select auth.uid()));
```

Two details matter here. The helper functions are `security definer` in a `private` schema that the API does not expose; without them, a `workspace_members` policy that reads `workspace_members` fails with infinite recursion. And policies call `(select auth.uid())` rather than `auth.uid()`, which lets Postgres evaluate it once per query instead of once per row.

Finally, the triggers that create the profile and the owner membership. Never base authorization on `raw_user_meta_data`: signed-in users can edit it, so it is used here only for display names.

```sql
-- Profile row for every new auth user (Google fills full_name/avatar_url, magic links do not)
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
-- Creator becomes the owner member of a new workspace
create function private.handle_new_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
create trigger on_workspace_created after insert on public.workspaces
  for each row execute function private.handle_new_workspace();
```

Apply everything with `npx supabase db reset`. Before shipping, test each policy with a workspace member, a member of another workspace and an anonymous request.

### Step 2: Sign in with magic links and Google

Install the packages and set the two public variables. Supabase now calls the browser key the publishable key:

```console
$ npm install @supabase/supabase-js @supabase/ssr
$ npx supabase status
```

Put the API URL and publishable key from the status output into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then create `lib/supabase/client.ts` with `createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)` from `@supabase/ssr`.

The server client (`lib/supabase/server.ts`), the `updateSession` helper and the `proxy.ts` that calls it on every request are the code from Supabase's own Next.js example (`examples/auth/nextjs` in the `supabase/supabase` repository). On Next.js 15 and earlier the file is named `middleware.ts` and exports `middleware`; a `proxy.ts` is never called there and users get signed out. Server code decides who the user is with `supabase.auth.getClaims()`, which verifies the JWT, not with `getSession()`, which only reads the cookie.

Both sign-in methods return to one route that trades the code for a session:

```typescript
// app/auth/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/dashboard`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
```

The login buttons call `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })` and `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`, both pointing at `${window.location.origin}/auth/callback`.

Allow the callback URL in `supabase/config.toml` for local development (`additional_redirect_urls = ["http://127.0.0.1:3000/auth/callback"]`) and in the dashboard under Authentication > URL Configuration for production. For Google, enable the provider with your OAuth client ID and a secret read from the environment (`secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"` in `config.toml`). Magic links are rate limited per user, and Supabase's built-in email sender is only meant for testing, so configure your own SMTP provider before launch.

### Step 3: Build the real-time task board

Realtime only streams tables that are in the `supabase_realtime` publication. Add a migration:

```sql
alter publication supabase_realtime add table public.tasks, public.comments;
alter table public.tasks replica identity full;
```

`replica identity full` lets DELETE events carry the old row so the `workspace_id` filter can match them. Postgres Changes respects your RLS policies for INSERT and UPDATE, but not for DELETE, so never keep secrets in columns of a row that can be deleted. The Supabase docs recommend Broadcast instead of Postgres Changes beyond roughly 3,000 concurrent subscribers on the same changes, far above what an MVP needs.

```typescript
// components/board.tsx
"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Task = { id: string; title: string; status: string; position: number };
const supabase = createClient();
export function useBoard(workspaceId: string, projectId: string, me: { id: string; name: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  useEffect(() => {
    supabase.from("tasks").select("id,title,status,position")
      .eq("project_id", projectId).order("position")
      .then(({ data }) => setTasks((data as Task[]) ?? []));
    const channel = supabase.channel(`board:${projectId}`, { config: { presence: { key: me.id } } });
    channel
      .on("postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setTasks((t) => t.filter((x) => x.id !== (payload.old as Task).id));
          } else {
            const row = payload.new as Task;
            setTasks((t) => [...t.filter((x) => x.id !== row.id), row]);
          }
        })
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.values(channel.presenceState()).flat().map((p: any) => p.name));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ name: me.name });
      });

    return () => { void supabase.removeChannel(channel); };
  }, [workspaceId, projectId, me.id, me.name]);
  async function moveTask(id: string, status: string, position: number) {
    const before = tasks;
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, status, position } : x)));
    const { error } = await supabase.from("tasks").update({ status, position }).eq("id", id);
    if (error) setTasks(before);
  }
  return { tasks, online, moveTask };
}
```

Drag-and-drop (for example `@dnd-kit/core`) just calls `moveTask` on drop, which updates the UI optimistically and rolls back if RLS refuses the write. Presence is ephemeral state held by Realtime, so showing who is on the board writes nothing to the database.

### Step 4: Add private file attachments

The bucket is private, limited to 10 MB and to image and PDF types. Storage policies are ordinary RLS on `storage.objects`, keyed on the first folder of the path (`{workspace_id}/{project_id}/{task_id}/{filename}`), which is the workspace id:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
create policy attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'task-attachments' and exists (
    select 1 from public.workspace_members m
    where m.workspace_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid())));
create policy attachments_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'task-attachments' and exists (
    select 1 from public.workspace_members m
    where m.workspace_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid())));
create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'task-attachments' and owner_id = (select auth.uid())::text);
```

```typescript
// components/attach.ts
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
export async function attach(ws: string, project: string, task: string, file: File) {
  const path = `${ws}/${project}/${task}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error } = await supabase.storage.from("task-attachments").upload(path, file);
  if (error) throw error;          // too big or wrong type: the bucket limits reject it
  return path;
}
```

Uploading needs only the INSERT policy. If you later allow overwriting with `upsert: true`, add SELECT and UPDATE policies too. Show images through short-lived URLs from `createSignedUrl(path, 3600)` so a leaked link stops working.

### Step 5: Configure for production

- **Environments**: one Supabase project per environment. `npx supabase link --project-ref <ref>` then `npx supabase db push` applies the migrations; `npx supabase db diff` generates a migration from changes made locally. Run `db push` from CI on merge to main.
- **Auth URLs**: set the production Site URL and an exact list of redirect URLs; no wildcards for the production domain.
- **Keys**: only the publishable key goes to the browser. The service-role (secret) key bypasses RLS and stays on the server.
- **Email**: custom SMTP and a branded magic-link template.
- **Plan**: the Free plan pauses projects after a week of inactivity, so use Pro for anything customers depend on.

## Real-World Example

Marta ships the backend for her MVP in days instead of building and hosting her own API. She starts on the Free plan (at the time of writing: 50,000 monthly active users, 500 MB database, 1 GB storage, 200 concurrent Realtime connections) and moves to Pro (from $25 a month) before launch to avoid project pausing and to get more headroom. Magic links mean no password reset flow to maintain, the Kanban board updates live for every member, and Presence shows who is looking at it. Because access control lives in RLS policies, the attachments need no upload-permission code in her app, and she spends the saved weeks on product features.

## Related Skills

- [supabase](/skills/supabase) - project setup, RLS, auth, Realtime and Storage
- [auth-system-setup](/skills/auth-system-setup) - sign-in flow and session design
- [database-schema-designer](/skills/database-schema-designer) - multi-tenant data model
