---
title: "Migrate from Firebase to Supabase and Cut Costs by 60%"
slug: migrate-firebase-to-supabase
description: "Migrate a production application from Firebase to Supabase — move authentication, Firestore data to Postgres, storage buckets, and real-time listeners while maintaining zero downtime."
skills: [supabase, data-migration, database-schema-designer]
category: development
tags: [supabase, firebase, migration, postgres, database, cost-optimization]
---

# Migrate from Firebase to Supabase and Cut Costs by 60%

## The Problem

Leo runs a project management SaaS with 8,000 monthly active users on Firebase. The bill hit $1,400 last month and it's climbing fast — Firestore charges per read, and one viral day last quarter caused a $600 spike from a single dashboard page that triggered cascading reads across collections.

The cost isn't even the worst part. Every time the team needs to answer "show me all projects where user X is assigned," they hit Firestore's biggest limitation: no JOINs. So they denormalize everything — user data lives in 3 different places, and when someone updates their avatar, a background function has to propagate it everywhere. They pay $200/month for Algolia on the side because Firestore can't do full-text search. And every architectural decision feels permanent because of vendor lock-in.

Leo wants to move to Supabase — Postgres gives them JOINs, full-text search, and predictable pricing — but they can't afford downtime. The app has paying customers who use it all day.

## The Solution

Using the **supabase**, **data-migration**, and **database-schema-designer** skills, the agent plans and executes a zero-downtime migration: redesigns the schema from denormalized Firestore documents to clean relational tables, migrates 363,000 records, converts auth and real-time listeners, and runs both systems in parallel before cutting over.

## Step-by-Step Walkthrough

### Step 1: Audit Firebase and Design the Postgres Schema

First, Leo describes the current Firestore structure to the agent — five collections with nested subcollections, embedded arrays, and duplicated data everywhere. The agent maps each Firestore path to a proper relational table:

| Firestore Path | Postgres Table | What Changes |
|---|---|---|
| `users/{uid}` | `profiles` | Direct mapping, becomes source of truth |
| `workspaces/{id}` | `workspaces` + `workspace_members` | Members array → join table (queryable both directions) |
| `workspaces/.../projects/{id}` | `projects` + `project_assignees` + `project_tags` | Embedded arrays → normalized tables |
| `.../tasks/{id}` | `tasks` | Flat table with FK to project |
| `tasks[].comments` | `comments` | Embedded array → separate table (paginated, sortable) |

The schema eliminates all three copies of user data. "Find all workspaces for user X" goes from a client-side filter on every workspace document to a single SQL query on the join table. Full-text search on task titles comes free with a `pg_trgm` index — no more Algolia.

The agent generates the migration file with 8 tables, 14 RLS policies, and 8 indexes:

```sql
-- supabase/migrations/20260218_initial_schema.sql

-- Members as a proper join table — queryable in both directions
create table workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- Comments as a separate table — paginated, sortable, countable
create table comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  author_id uuid references profiles(id),
  body text not null,
  created_at timestamptz default now()
);

-- Full-text search on tasks — replaces the $200/mo Algolia subscription
create index tasks_search_idx on tasks
  using gin (to_tsvector('english', title || ' ' || coalesce(description, '')));
```

### Step 2: Migrate 363,000 Records in 8 Minutes

The agent builds a migration script that exports from Firestore in batches of 500 (to avoid memory issues) and imports into Supabase in batches of 1,000. Collections are migrated in FK-dependency order so foreign keys never point to missing records:

```typescript
// scripts/migrate-firebase-to-supabase.ts

// Phase 1: Export from Firestore in dependency order
const migrationOrder = [
  { collection: 'users', table: 'profiles', count: 8_000 },
  { collection: 'workspaces', table: 'workspaces', count: 2_100 },
  // Members extracted from workspace.members array → join table rows
  { derived: 'workspace_members', count: 9_400 },
  { collection: 'projects', table: 'projects', count: 14_000 },
  { derived: 'project_assignees', count: 22_000 },
  { collection: 'tasks', table: 'tasks', count: 89_000 },
  // Comments extracted from embedded task.comments array
  { derived: 'comments', count: 241_000 },
];

// Phase 2: Transform types
// Firestore Timestamp → ISO string → Postgres timestamptz
// Firestore doc references → UUID lookup from ID map
// Embedded arrays → separate rows in join tables

// Phase 3: Bulk upsert with service role key (bypasses RLS)
// Idempotent — safe to re-run if it fails halfway
for (const step of migrationOrder) {
  const records = await exportFromFirestore(step);
  const transformed = transformRecords(records, step);
  await bulkUpsert(supabase, step.table, transformed);
  console.log(`[${step.table}] ${transformed.length} records ✓`);
}
```

The full migration takes about 8 minutes. Failed records get logged to `migration-errors.json` but the script keeps going — no single bad record stops the whole migration.

### Step 3: Handle Three Types of Auth Users

Auth migration is the trickiest part because Firebase doesn't export password hashes. The agent plans three paths:

**OAuth users (2,400) and magic link users (400)** get the smoothest ride — they sign in with Google or magic link on the new app, Supabase creates their auth record, and a database trigger matches them to their existing profile by email. They notice nothing.

**Email/password users (5,200)** need a one-time password reset. The agent imports their records via `supabase.auth.admin.createUser()` with temporary passwords, then shows a "We've upgraded our platform — set your new password" screen on first login. A magic link email handles the reset.

```typescript
// Import Firebase Auth users to Supabase
for (const fbUser of firebaseUsers) {
  await supabase.auth.admin.createUser({
    email: fbUser.email,
    email_confirm: fbUser.emailVerified,
    user_metadata: {
      firebase_uid: fbUser.uid,  // Keep for reference during migration
      display_name: fbUser.displayName,
      avatar_url: fbUser.photoURL,
    },
  });
}
```

The timeline: import auth records in week 1 (no user impact), switch login in week 2, send reminder emails in week 3, disable Firebase Auth in week 4. About 15% of email users need a support nudge to complete the reset.

### Step 4: Convert Real-Time Listeners

The app uses Firestore `onSnapshot` in four places. The agent converts each one to Supabase real-time subscriptions. Here's the task list listener — the biggest change:

**Before (Firestore):** one call loads data AND subscribes to changes:

```javascript
onSnapshot(
  query(collection(db, 'workspaces', wsId, 'projects', projId, 'tasks'),
    orderBy('position')),
  (snapshot) => {
    setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  }
);
```

**After (Supabase):** initial load and real-time are separate, which is actually cleaner:

```javascript
// Load current data
const { data } = await supabase
  .from('tasks')
  .select('*, assignee:profiles(name, avatar)')  // JOINs! No more denormalization
  .eq('project_id', projId)
  .order('position');
setTasks(data);

// Subscribe to changes — filter at the database level, not client-side
supabase.channel(`tasks:${projId}`)
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'tasks',
      filter: `project_id=eq.${projId}` },
    (payload) => {
      if (payload.eventType === 'INSERT') addTask(payload.new);
      if (payload.eventType === 'UPDATE') updateTask(payload.new);
      if (payload.eventType === 'DELETE') removeTask(payload.old.id);
    })
  .subscribe();
```

Notice the `select('*, assignee:profiles(name, avatar)')` — that JOIN replaces the entire denormalization pattern. No more background functions propagating avatar changes.

### Step 5: Parallel Run and Cutover

The agent sets up a two-week parallel run: all writes go to Supabase (primary) and Firebase (secondary), all reads come from Supabase only. A daily consistency checker at 3 AM compares record counts and samples 100 random records per table for field-level comparison, reporting discrepancies to Slack.

After 7 consecutive days of clean checks, Leo runs the cutover checklist:

- All consistency checks green for 7+ days
- Supabase error rate below 0.1%
- Real-time subscriptions verified in staging
- Rollback plan tested (switch reads back to Firebase)
- Support team briefed on the password reset FAQ
- Firebase billing alert set to catch unexpected charges

One week after cutover, the dual-write code gets removed. The Firebase project gets archived — not deleted — for 90 days, just in case.

## Real-World Example

Leo's monthly bill drops from $1,600 (Firebase + Algolia) to $75 (Supabase Pro) — a 95% reduction. The $200/month Algolia subscription disappears entirely because Postgres full-text search handles it natively.

But the money is almost secondary to what changes day-to-day. Queries that required reading entire Firestore collections now run as single SQL statements. The team stops maintaining three copies of user data. "Find all projects tagged 'urgent' where user X is assigned" — a query that required client-side gymnastics on Firebase — becomes a two-table JOIN that returns in 12ms.

The migration takes 3 weeks end-to-end, with zero downtime. The 8,000 users don't notice the switch — except that the dashboard loads faster.
