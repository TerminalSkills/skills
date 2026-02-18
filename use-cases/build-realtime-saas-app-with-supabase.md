---
title: "Build a Real-Time SaaS Application with Supabase"
slug: build-realtime-saas-app-with-supabase
description: "Build a multi-tenant SaaS application with Supabase — Postgres with Row-Level Security, authentication, real-time subscriptions, and file storage — without managing any backend infrastructure."
skills: [supabase, auth-system-setup, database-schema-designer]
category: development
tags: [supabase, saas, realtime, authentication, postgres, baas]
---

# Build a Real-Time SaaS Application with Supabase

## The Problem

Marta is a solo developer building a project management tool for freelancers. She has a working React frontend but needs a backend — user authentication, a database with proper access control, real-time updates when team members change tasks, and file storage for attachments. She considered building a Node.js API with Express and PostgreSQL, but that means writing auth middleware, designing API routes, setting up WebSocket servers, managing file uploads, and deploying/maintaining everything. For a solo developer, that is 4-6 weeks of backend work before building any actual product features.

She needs a backend that handles auth, database, real-time, and storage out of the box — so she can focus on the product, not the plumbing.

## The Solution

Use **supabase** for the entire backend — Postgres database with Row-Level Security, built-in authentication, real-time subscriptions, and file storage. Use **auth-system-setup** for designing the auth flow (magic links + Google OAuth), and **database-schema-designer** for the multi-tenant data model.

## Step-by-Step Walkthrough

### 1. Design the multi-tenant database schema

```text
I'm building a project management SaaS for freelancers. I need a multi-tenant schema where each user can create workspaces, invite members, and manage projects with tasks. The schema should support: workspaces (owned by a user, members with roles), projects (belong to a workspace), tasks (belong to a project, assigned to a member, have status and priority), and comments (on tasks, real-time). Design the Supabase schema with proper Row-Level Security so users can only access their own workspaces and data. Use Postgres best practices.
```

The agent designs the schema:

```text
Multi-tenant schema created:

Tables:
  workspaces         → id, name, owner_id, created_at
  workspace_members   → workspace_id, user_id, role (owner/admin/member)
  projects           → id, workspace_id, name, description, status
  tasks              → id, project_id, title, description, status, priority,
                        assignee_id, due_date, position (for drag-drop ordering)
  comments           → id, task_id, author_id, content, created_at

Row-Level Security policies:
  workspaces:
    SELECT → user is a member of the workspace
    INSERT → any authenticated user (they become owner)
    UPDATE/DELETE → only workspace owner or admin

  tasks:
    SELECT → user is a member of the task's workspace
    INSERT → members with 'member' or higher role
    UPDATE → assignee can update status; admins can update anything
    DELETE → admins and owners only

  comments:
    SELECT → workspace members
    INSERT → workspace members
    UPDATE/DELETE → comment author only

Triggers:
  → Auto-add creator as workspace owner on workspace INSERT
  → Auto-update tasks.updated_at on any change
  → Notify real-time channel on comment INSERT

Migration file: supabase/migrations/20260218_create_schema.sql (247 lines)
```

### 2. Set up authentication with magic links and Google OAuth

```text
Configure Supabase auth for my app. I want two sign-in methods: magic link (passwordless email) as the primary method, and Google OAuth as an alternative. After sign-up, auto-create a user profile with their name and avatar from the auth metadata. Set up the auth callback handler for my Next.js app. Show me the complete login page component with both methods.
```

The agent implements auth:

```text
Authentication configured:

  Magic link flow:
    1. User enters email → supabase.auth.signInWithOtp()
    2. User clicks link in email → redirects to /auth/callback
    3. Callback exchanges code for session
    4. Redirect to /dashboard

  Google OAuth flow:
    1. User clicks "Sign in with Google"
    2. supabase.auth.signInWithOAuth({ provider: 'google' })
    3. Google consent screen → redirect to /auth/callback
    4. Same callback handler as magic link

  Auto-profile creation:
    Database trigger on auth.users INSERT:
    → Creates profiles row with id, email, full_name, avatar_url
    → Pulls name/avatar from Google metadata or email prefix

  Files created:
    app/auth/callback/route.ts     — OAuth callback handler
    app/login/page.tsx             — Login page with both methods
    lib/supabase-browser.ts        — Browser client
    lib/supabase-server.ts         — Server client (App Router)
    middleware.ts                   — Session refresh on every request
```

### 3. Build the real-time task board

```text
Create a real-time Kanban task board component. It should: load tasks for a project grouped by status (todo, in_progress, review, done), support drag-and-drop between columns (update status and position), show real-time updates when another team member moves a task or adds a comment, and display an avatar of who's currently viewing the board using Supabase Presence. When a task moves, all connected users should see it move instantly.
```

The agent builds the real-time board:

```text
Real-time Kanban board implemented:

  Components:
    TaskBoard          → Main board, subscribes to real-time changes
    TaskColumn         → Single column (todo/in_progress/review/done)
    TaskCard           → Draggable task card with title, assignee, priority
    OnlineAvatars      → Shows who's viewing via Presence

  Real-time subscriptions:
    Channel: project-{id}
    Events:
      postgres_changes on tasks table (filtered by project_id)
        → INSERT: new task appears in correct column
        → UPDATE: task moves between columns smoothly
        → DELETE: task fades out

    Presence:
      → Track { user_id, name, avatar } on subscribe
      → Show colored avatars of online users in header
      → "Dani is viewing" indicator

  Drag-and-drop:
    Using @dnd-kit/core for drag-drop
    On drop: update task status + position via supabase.from('tasks').update()
    RLS ensures only workspace members can move tasks
    Optimistic UI: move card immediately, revert if update fails

  Files:
    components/task-board.tsx      — 186 lines
    components/task-column.tsx     — 54 lines
    components/task-card.tsx       — 72 lines
    components/online-avatars.tsx  — 43 lines
```

### 4. Add file attachments with storage

```text
Add file attachment support to tasks. Users should be able to upload files (images, PDFs, documents) up to 10MB per file. Store files in a Supabase storage bucket organized by workspace/project/task. Show image previews inline in the task detail view. Only workspace members should be able to view and upload files. Add drag-and-drop upload to the task detail panel.
```

The agent configures storage:

```text
File storage configured:

  Bucket: task-attachments (private)

  Storage policies:
    SELECT → workspace members (join through tasks → projects → workspace_members)
    INSERT → workspace members, max 10MB, allowed types: image/*, application/pdf,
             application/msword, text/*
    DELETE → file uploader or workspace admin

  Folder structure: {workspace_id}/{project_id}/{task_id}/{filename}

  Components:
    FileUploader       → Drag-and-drop zone, progress bar, validates size/type
    AttachmentList     → Shows uploaded files with icons by type
    ImagePreview       → Inline preview for images, lightbox on click

  Upload flow:
    1. User drops file on task detail panel
    2. Client validates size (< 10MB) and type
    3. Upload to supabase.storage with path workspace/project/task/filename
    4. Insert attachment record in attachments table
    5. Other users see new attachment via real-time subscription
```

### 5. Deploy and configure for production

```text
Prepare this Supabase project for production. Set up: environment-specific configs (dev/staging/prod), database migrations workflow using Supabase CLI, proper CORS and redirect URLs, email templates for magic links, and rate limiting on edge functions. Also create a seed script that populates a demo workspace with sample data for new users.
```

The agent configures production:

```text
Production setup complete:

  Environments:
    .env.local          → Local dev (supabase start)
    .env.staging        → Staging project
    .env.production     → Production project

  Migration workflow:
    supabase db diff → generates migration from local changes
    supabase db push → applies to linked project
    CI: runs supabase db push on merge to main

  Email templates:
    Customized magic link email with app branding
    Confirm signup email
    Password reset email (fallback if added later)

  Security:
    CORS: only allow app domain + localhost in dev
    Redirect URLs: explicit whitelist (no wildcards in prod)
    Rate limiting: 100 req/min per IP on edge functions
    RLS: verified all 14 policies with test queries

  Seed script:
    supabase/seed.sql creates:
    → Demo workspace "Getting Started"
    → 3 sample projects with 12 tasks across all statuses
    → 2 sample comments
    → Runs on supabase db reset
```

## Real-World Example

A solo developer wants to build a project management SaaS for freelancers. Instead of spending 6 weeks building a Node.js backend with auth, database, WebSocket server, and file storage separately, she uses Supabase:

1. She asks the agent to design a multi-tenant schema — it creates 5 tables with 14 RLS policies, ensuring users can only access their own workspace data
2. Auth is configured with magic links and Google OAuth — users can sign in without passwords, profiles are auto-created from metadata
3. A real-time Kanban board shows task changes instantly across connected clients — when one user moves a task, everyone sees it move. Presence shows who's online
4. File attachments work with drag-and-drop upload, image previews, and storage policies that enforce workspace-level access
5. Production deployment is automated with migrations in CI, environment configs, and branded email templates

Total backend development time: 2 days instead of 6 weeks. Zero servers to maintain. She launches an MVP and gets her first 10 paying users while a competitor is still configuring their Express middleware.
