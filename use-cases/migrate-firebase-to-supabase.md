---
title: "Migrate from Firebase to Supabase and Cut Costs by 60%"
slug: migrate-firebase-to-supabase
description: "Migrate a production application from Firebase to Supabase: move Firebase Auth users with their password hashes, Firestore data to Postgres, and real-time listeners, while running both systems in parallel."
skills: [supabase, data-migration, database-schema-designer]
category: development
tags: [supabase, firebase, migration, postgres, database, cost-optimization]
---

# Migrate from Firebase to Supabase and Cut Costs by 60%

## The Problem

Leo runs a project management SaaS with 8,000 monthly active users on Firebase. The bill hit $1,400 last month and it is climbing: Firestore charges per read, and one viral day a single dashboard page triggered cascading reads across collections and added $600.

The cost is not even the worst part. Every time the team needs to answer "show me all projects where user X is assigned," they hit Firestore's biggest limitation: no JOINs. So they denormalize everything. User data lives in 3 places, and when someone updates their avatar a background function has to propagate it. They pay $200/month for Algolia on the side because Firestore has no full-text search, and every architectural decision feels permanent because of vendor lock-in.

Leo wants Postgres (JOINs, full-text search, SQL) on Supabase, but the app has paying customers who use it all day, so there can be no downtime.

## The Solution

Using the **supabase**, **data-migration** and **database-schema-designer** skills, the agent redesigns the schema from denormalized Firestore documents into relational tables, copies the data in dependency order with idempotent upserts, imports Firebase Auth users together with their password hashes, converts the real-time listeners, and runs both systems in parallel before cutting over.

## Step-by-Step Walkthrough

### Step 1: Audit Firebase and Design the Postgres Schema

Leo describes the Firestore structure: five collections with nested subcollections, embedded arrays and duplicated data. The agent maps each path to a table:

| Firestore Path | Postgres Table | What Changes |
|---|---|---|
| `users/{uid}` | `profiles` | Keyed by the Supabase auth user id, keeps `firebase_uid` |
| `workspaces/{id}` | `workspaces` + `workspace_members` | Members array becomes a join table (queryable both directions) |
| `workspaces/{id}/projects/{id}` | `projects` | Flat table with FK to workspace |
| `.../tasks/{id}` | `tasks` | Flat table with FK to project, assignee is a FK |
| `tasks[].comments` | `comments` | Embedded array becomes a separate table (paginated, sortable) |

The three copies of user data collapse into `profiles`. "Find all workspaces for user X" becomes a query on the join table, and full-text search comes from a GIN index on a `tsvector`, so Algolia can go. Row Level Security matters from day one: every table in the `public` schema is reachable through the API, so enable RLS on each (a table with RLS and no policy returns nothing to API clients) and add the read policies your app needs (two shown below as the pattern). Firestore document ids are kept as `text` primary keys, which makes the copy idempotent.

```sql
-- supabase/migrations/20261025_initial_schema.sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  firebase_uid text unique,
  name         text,
  avatar_url   text
);

-- Copy the Firebase identity across when an auth user is created (import or first sign-in)
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, firebase_uid, name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'firebase_uid',
          new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create table workspaces (
  id text primary key, name text not null, created_at timestamptz default now()
);

-- Members as a join table: queryable in both directions
create table workspace_members (
  workspace_id text references workspaces(id) on delete cascade,
  user_id      uuid references profiles(id) on delete cascade,
  role         text not null default 'member',
  primary key (workspace_id, user_id)
);

create table projects (
  id text primary key, workspace_id text references workspaces(id) on delete cascade, name text not null
);

create table tasks (
  id text primary key, project_id text references projects(id) on delete cascade,
  title text not null, description text, position int not null default 0,
  assignee_id uuid references profiles(id)
);

-- Comments as their own table: paginated, sortable, countable
create table comments (
  id text primary key, task_id text references tasks(id) on delete cascade,
  author_id uuid references profiles(id), body text not null, created_at timestamptz default now()
);

-- Full-text search replaces the external search service
create index tasks_search_idx on tasks
  using gin (to_tsvector('english', title || ' ' || coalesce(description, '')));
create index tasks_project_idx on tasks (project_id, position);

-- RLS: every table is exposed through the API, so every table needs it
alter table profiles enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table comments enable row level security;
create policy "profiles readable" on profiles for select to authenticated using (true); -- the assignee JOIN in Step 4 needs it
create policy "see own memberships" on workspace_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy "members read tasks" on tasks for select to authenticated using (
  exists (select 1 from projects p join workspace_members m on m.workspace_id = p.workspace_id
          where p.id = tasks.project_id and m.user_id = (select auth.uid())));

-- Realtime: postgres_changes only fires for tables in this publication
alter publication supabase_realtime add table tasks;
```

### Step 2: Move Firebase Auth Users With Their Passwords

Firebase does export password hashes: they are scrypt hashes (a modified scrypt), and Supabase Auth can verify that format natively. Nobody has to reset a password. In the Firebase console open Authentication, Users, the three-dot menu, Password hash parameters, and save `base64_signer_key`, `base64_salt_separator`, `rounds` and `mem_cost`. Then `admin.createUser` takes a `password_hash` in the form `$fbscrypt$v=1,n=<mem_cost>,r=<rounds>,p=1,ss=<salt separator>,sk=<signer key>$<user salt>$<user hash>`; the first two parameters map onto `n` and `r` exactly as the Supabase Auth test suite uses them.

```typescript
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createClient } from '@supabase/supabase-js';

initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS!) });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Firebase console > Authentication > Users > ⋮ > Password hash parameters
const { SIGNER_KEY, SALT_SEPARATOR, ROUNDS, MEM_COST } = process.env as Record<string, string>;
const b64 = (s: string) => Buffer.from(s, 'base64').toString('base64'); // web-safe -> standard base64

// Supabase Auth verifies this format natively; the hash is replaced by a bcrypt one when the user next sets a password
export const fbscrypt = (salt: string, hash: string) =>
  `$fbscrypt$v=1,n=${MEM_COST},r=${ROUNDS},p=1,ss=${b64(SALT_SEPARATOR)},sk=${b64(SIGNER_KEY)}$${b64(salt)}$${b64(hash)}`;

async function main() {
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!u.email) continue; // phone/anonymous users need their own handling
      const { error } = await supabase.auth.admin.createUser({
        email: u.email,
        email_confirm: u.emailVerified,
        password_hash: u.passwordHash && u.passwordSalt ? fbscrypt(u.passwordSalt, u.passwordHash) : undefined,
        user_metadata: { firebase_uid: u.uid, display_name: u.displayName, avatar_url: u.photoURL },
      });
      if (error) console.error(u.uid, error.message); // log and continue; rerun is safe for already-created users
    }
    pageToken = page.pageToken;
  } while (pageToken);
}
if (require.main === module) main();
```

Users who signed in with Google or a magic link have no hash. They are created with a confirmed email, and when they next sign in through Google, Supabase Auth links the new identity to the existing user because the verified email matches. The `handle_new_user` trigger from Step 1 creates each user's profile with their `firebase_uid`. Phone and anonymous users have no email and need their own handling. The community [`firebase-to-supabase`](https://github.com/supabase-community/firebase-to-supabase) tools are an alternative; their password-verifying middleware is still marked work in progress, so the `password_hash` route above is the simpler one.

Timeline: import auth users in week 1 (no user impact), switch login in week 2, disable Firebase Auth in week 4.

### Step 3: Copy the Firestore Data

Run this after the auth import, because it needs the profiles. Collections are copied in dependency order, in pages of 500, with upserts, so a failed run can simply be started again.

```typescript
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS!) });
const db = getFirestore();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); // service role bypasses RLS

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : v ?? null);

// Read a collection (or collection group) in pages of 500 and hand each page to `map`
async function copy(query: FirebaseFirestore.Query, table: string, map: (id: string, d: DocumentData, path: string) => object[], onConflict = 'id') {
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = query.orderBy('__name__').limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const rows = snap.docs.flatMap((d) => map(d.id, d.data(), d.ref.path));
    const { error } = await supabase.from(table).upsert(rows, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    last = snap.docs[snap.docs.length - 1];
    console.log(`${table}: +${rows.length}`);
  }
}

// Firebase uid -> Supabase user id, from the profiles created during the auth migration
async function loadUidMap() {
  const map = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('profiles').select('id, firebase_uid').range(from, from + 999);
    if (error) throw error;
    data.forEach((p) => map.set(p.firebase_uid, p.id));
    if (data.length < 1000) return map;
  }
}

async function main() {
  const uid = await loadUidMap();
  // Parents first so foreign keys always resolve. Document ids are kept as text primary keys.
  await copy(db.collection('workspaces'), 'workspaces', (id, d) => [{ id, name: d.name, created_at: iso(d.createdAt) }]);
  // Embedded members array -> join table rows
  await copy(db.collection('workspaces'), 'workspace_members', (id, d) =>
    (d.members ?? []).filter((m: { uid: string }) => uid.has(m.uid))
      .map((m: { uid: string; role?: string }) => ({ workspace_id: id, user_id: uid.get(m.uid), role: m.role ?? 'member' })),
    'workspace_id,user_id');
  await copy(db.collectionGroup('projects'), 'projects', (id, d, path) => [{ id, workspace_id: path.split('/')[1], name: d.name }]);
  await copy(db.collectionGroup('tasks'), 'tasks', (id, d, path) => [{
    id, project_id: path.split('/')[3], title: d.title, description: d.description ?? null,
    position: d.position ?? 0, assignee_id: uid.get(d.assigneeUid) ?? null,
  }]);
  // Embedded task.comments array -> comments table (the array index keeps ids stable, so reruns are safe)
  await copy(db.collectionGroup('tasks'), 'comments', (id, d) =>
    (d.comments ?? []).map((c: { authorUid: string; body: string; createdAt: unknown }, i: number) => ({
      id: `${id}_${i}`, task_id: id, author_id: uid.get(c.authorUid) ?? null, body: c.body, created_at: iso(c.createdAt),
    })));
}
if (require.main === module) main();
```

The service role key bypasses RLS: keep it in the migration environment only, never in a client.

### Step 4: Convert Real-Time Listeners

The app used Firestore `onSnapshot` in four places. In Supabase, loading and subscribing are separate calls. The table must be in the `supabase_realtime` publication (done at the end of the schema) and RLS policies apply to what each user receives. For `DELETE` events `payload.old` carries only the primary key unless you set `replica identity full` on the table.

```typescript
// Load current data
const { data } = await supabase
  .from('tasks')
  .select('*, assignee:profiles(name, avatar_url)') // a JOIN replaces the denormalized copy
  .eq('project_id', projId)
  .order('position');
setTasks(data ?? []);

// Subscribe to changes, filtered in the database
const channel = supabase.channel(`tasks:${projId}`)
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projId}` },
    (payload) => {
      if (payload.eventType === 'INSERT') addTask(payload.new);
      if (payload.eventType === 'UPDATE') updateTask(payload.new);
      if (payload.eventType === 'DELETE') removeTask(payload.old.id as string);
    })
  .subscribe();
// on unmount: supabase.removeChannel(channel)
```

The `select('*, assignee:profiles(...)')` JOIN replaces the whole denormalization pattern: no background function propagates avatar changes.

### Step 5: Parallel Run and Cutover

Write to Supabase and Firebase for two weeks, read only from Supabase. A nightly consistency job compares record counts and a random sample of records per table, and posts discrepancies to Slack. Cut over when:

- Consistency checks have been green for 7+ days
- The Supabase error rate is low and real-time subscriptions are verified in staging
- The rollback plan (switch reads back to Firebase) has been tested
- A billing alert is set on the Firebase project

Storage buckets follow the same pattern: the Supabase guide on migrating Firebase Storage files covers copying files and keeping their paths. One week after cutover remove the dual-write code, and archive the Firebase project for 90 days before deleting it.

## Real-World Example

Leo's team replaces Firebase plus Algolia with one Supabase project. The Algolia subscription disappears because Postgres full-text search covers it, and the monthly bill drops by about 60 percent (Leo's figures, yours depend on plan, compute size and traffic). Queries that needed client-side gymnastics, such as "all projects tagged urgent where user X is assigned", become a two-table JOIN. The migration takes three weeks end to end without downtime, and email/password users sign in with the passwords they already had.

## Related Skills

- [supabase](/skills/supabase) for Auth, RLS, Realtime and the client library
- [data-migration](/skills/data-migration) for ordering, idempotent copies and consistency checks
- [database-schema-designer](/skills/database-schema-designer) for turning documents into relational tables
