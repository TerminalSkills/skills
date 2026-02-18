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

Leo runs a SaaS app with 8,000 monthly active users on Firebase. The app uses Firestore for data, Firebase Auth for login, Cloud Storage for file uploads, and real-time listeners for live updates. The Firebase bill has grown to $1,400/month and climbing — Firestore reads are the main cost driver at 12 million reads/month, most of them from inefficient queries that read entire collections when they need a few documents. Firebase pricing is unpredictable: one viral day last quarter caused a $600 spike from a single dashboard page that triggered cascading reads.

Beyond cost, the team hits Firestore limitations daily: no JOIN queries (they denormalize everything and maintain 3 copies of user data), no full-text search (they pay $200/month for Algolia on the side), and vendor lock-in makes every architectural decision feel permanent. They want to migrate to Supabase — Postgres gives them JOINs, full-text search, and predictable pricing — but they cannot afford downtime during the switch.

## The Solution

Use **supabase** for the target platform, **data-migration** to move Firestore documents to Postgres tables with proper relational schema, and **database-schema-designer** to convert the denormalized Firestore structure into a normalized relational model.

## Step-by-Step Walkthrough

### 1. Audit Firebase usage and design the Postgres schema

```text
Here's my Firestore structure:

- users/{uid}: { name, email, avatar, plan, createdAt }
- workspaces/{id}: { name, ownerId, members: [uid], settings: {...} }
- workspaces/{id}/projects/{id}: { name, status, assignedTo: [uid], tags: [...] }
- workspaces/{id}/projects/{id}/tasks/{id}: { title, status, assigneeId, dueDate, description, comments: [{authorId, text, createdAt}] }

The problems: members array in workspaces limits queries, comments embedded in tasks can't be paginated, user data is duplicated in tasks for display. We have 8,000 users, 2,100 workspaces, 14,000 projects, 89,000 tasks.

Design a normalized Postgres schema for Supabase that fixes these issues. Map every Firestore path to a table.
```

The agent designs the migration:

```text
Firestore → Postgres schema mapping:

  users/{uid}                        → profiles (id, email, name, avatar, plan)
  workspaces/{id}                    → workspaces (id, name, owner_id)
  workspaces/{id}.members            → workspace_members (workspace_id, user_id, role)
  workspaces/{id}/projects/{id}      → projects (id, workspace_id, name, status)
  projects ← assignedTo              → project_assignees (project_id, user_id)
  projects ← tags                    → project_tags (project_id, tag) + tags table
  .../tasks/{id}                     → tasks (id, project_id, title, status, assignee_id, due_date, description)
  tasks ← comments                   → comments (id, task_id, author_id, text, created_at)

  Improvements over Firestore:
    ✓ Members are a join table — query "all workspaces for user X" is one SQL query
    ✓ Comments are a separate table — paginated, sortable, countable
    ✓ User data referenced by FK — no denormalization, no stale copies
    ✓ Tags are normalized — "find all projects tagged 'urgent'" is a simple query
    ✓ Full-text search on tasks.title + tasks.description via pg_trgm

  RLS policies: 14 policies covering all access patterns
  Indexes: 8 indexes for common query patterns

  Migration file: supabase/migrations/20260218_initial_schema.sql
```

### 2. Export Firestore data and transform for Postgres

```text
Write a migration script that exports all Firestore data and imports it into Supabase Postgres. Handle these complexities: Firestore timestamps → Postgres timestamptz, Firestore document references → UUID foreign keys, embedded arrays → join tables, nested subcollections → flat tables with foreign keys. Export in batches of 500 to avoid memory issues. Log progress and errors. Use the Firebase Admin SDK for export and Supabase JS client for import.
```

The agent builds the migration pipeline:

```text
Migration script created: scripts/migrate-firebase-to-supabase.ts

  Phase 1 — Export from Firestore:
    Batch size: 500 documents per query
    Collections exported in order (respecting FK dependencies):
      1. users → profiles (8,000 records)
      2. workspaces + members → workspaces + workspace_members (2,100 + 9,400)
      3. projects + assignees + tags → 3 tables (14,000 + 22,000 + 31,000)
      4. tasks → tasks (89,000)
      5. tasks.comments → comments (241,000)

  Phase 2 — Transform:
    Firestore Timestamp → ISO 8601 string → Postgres timestamptz
    Firestore doc ref paths → UUID lookup from Phase 1 ID map
    Embedded arrays → separate rows in join tables
    Nested subcollections → flat tables with parent FK

  Phase 3 — Import to Supabase:
    Uses supabase-js with service role key (bypasses RLS)
    Bulk upsert in batches of 1000
    Idempotent — safe to re-run on failure

  Progress output:
    [1/5] Migrating users... 8,000/8,000 ✓ (12s)
    [2/5] Migrating workspaces... 2,100/2,100 ✓ (4s)
           Members... 9,400/9,400 ✓ (8s)
    [3/5] Migrating projects... 14,000/14,000 ✓ (18s)
    [4/5] Migrating tasks... 89,000/89,000 ✓ (2m 14s)
    [5/5] Migrating comments... 241,000/241,000 ✓ (4m 32s)

  Error handling:
    Failed records logged to migration-errors.json
    Script continues on individual record failures
    Summary: 363,500 migrated, 0 failed

  Estimated total time: ~8 minutes for full migration
```

### 3. Migrate authentication

```text
Migrate Firebase Auth users to Supabase Auth. We have 8,000 users — 5,200 use email/password, 2,400 use Google OAuth, and 400 use magic links. For email/password users, we can't migrate password hashes (Firebase doesn't export them), so plan a password reset flow. For OAuth users, migration should be seamless — they just sign in with Google again and match by email. Create the migration plan with exact steps.
```

The agent plans auth migration:

```text
Auth migration plan:

  OAuth users (2,400 + 400 magic link):
    → No action needed during migration
    → User signs in with Google/magic link on new app
    → Supabase creates auth.users record
    → Trigger matches to existing profiles row by email
    → Seamless experience — user notices nothing

  Email/password users (5,200):
    → Import user records to Supabase Auth via Admin API
    → Set temporary random passwords (users can't login with old password)
    → On first login attempt: show "We've upgraded our platform" message
    → User clicks "Set new password" → sends magic link to email
    → After setting password, normal login works going forward

  Migration script: scripts/migrate-auth.ts
    Uses supabase.auth.admin.createUser() for each Firebase user
    Maps Firebase UID → Supabase UUID in profiles table
    Preserves: email, email_verified, created_at, user_metadata

  Timeline:
    Week 1: Import all auth records (background, no user impact)
    Week 2: Switch login to Supabase, show password reset for email users
    Week 3: Send reminder email to users who haven't set new password
    Week 4: Disable Firebase Auth

  Expected friction: ~15% of email users need support nudge to reset password
```

### 4. Switch real-time listeners and update the client

```text
Our app uses Firestore onSnapshot listeners in 4 places: task list (live task updates), comments (new comments appear instantly), workspace members (online status), and notifications. Replace all 4 with Supabase real-time subscriptions. Show me the before/after code for the task list listener and the comments listener.
```

The agent converts real-time code:

```text
Real-time migration — before/after:

  Task list listener:
    BEFORE (Firestore):
      onSnapshot(
        query(collection(db, 'workspaces', wsId, 'projects', projId, 'tasks'),
          orderBy('position')),
        (snapshot) => {
          const tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setTasks(tasks);
        }
      );

    AFTER (Supabase):
      // Initial load
      const { data } = await supabase
        .from('tasks')
        .select('*, assignee:profiles(name, avatar)')
        .eq('project_id', projId)
        .order('position');
      setTasks(data);

      // Real-time updates
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

  Key differences:
    ✓ Supabase: initial load is a normal query, real-time is separate subscription
    ✓ Supabase: filter at subscription level (no client-side filtering)
    ✓ Supabase: payload includes old and new values (easier diffing)
    ✗ Firestore onSnapshot gives full snapshot; Supabase gives individual changes

  All 4 listeners migrated:
    tasks          → postgres_changes with project_id filter
    comments       → postgres_changes with task_id filter
    online status  → Supabase Presence (track/untrack)
    notifications  → postgres_changes with user_id filter
```

### 5. Run parallel for 2 weeks, then cut over

```text
Create a parallel-run plan where both Firebase and Supabase run simultaneously for 2 weeks. Writes should go to both systems, reads should come from Supabase. This lets us verify data consistency before fully cutting over. Include a consistency checker that compares records between both systems daily. At the end, create a cutover checklist.
```

The agent creates the cutover plan:

```text
Parallel run plan:

  Week 1-2: Dual-write mode
    → All writes go to Supabase (primary) + Firebase (secondary)
    → All reads come from Supabase only
    → Consistency checker runs daily at 3 AM:
      Compares record counts per table/collection
      Samples 100 random records per table for field-level comparison
      Reports discrepancies to Slack #migration channel

  Daily consistency report:
    profiles ↔ users:           8,000 ↔ 8,000 ✓
    workspaces:                 2,100 ↔ 2,100 ✓
    tasks:                     89,247 ↔ 89,243 ⚠️ (4 tasks created during migration)
    comments:                 241,892 ↔ 241,890 ⚠️ (2 delta, within threshold)

  Cutover checklist:
    □ All consistency checks passing for 7+ consecutive days
    □ Supabase error rate < 0.1% for 7 days
    □ All 8,000 users have Supabase auth records
    □ Real-time subscriptions verified in staging
    □ Rollback plan tested (switch reads back to Firebase)
    □ DNS/CDN cache cleared
    □ Firebase billing alert set (should drop to near-zero)
    □ Team notified, support team briefed on FAQ
    □ Remove dual-write code (deploy after 1 week stable)
    □ Archive Firebase project (don't delete for 90 days)

  Cost projection after migration:
    Firebase: $1,400/mo → $0/mo
    Supabase Pro: $25/mo + ~$50 compute = ~$75/mo
    Algolia (no longer needed): $200/mo → $0/mo
    Total savings: $1,525/mo → 60% cost reduction
```

## Real-World Example

A SaaS founder is paying $1,400/month for Firebase with 8,000 users and watching the bill climb. Firestore read costs are unpredictable, and the lack of JOINs means maintaining 3 copies of user data across collections. They also pay $200/month for Algolia because Firestore has no full-text search.

1. They ask the agent to design a normalized Postgres schema — it maps 5 Firestore collections to 8 relational tables, eliminating all data duplication and adding full-text search built-in
2. The migration script exports 363,000 Firestore documents and imports them into Supabase in 8 minutes, preserving all relationships
3. Auth migration handles 3 login methods — OAuth users migrate seamlessly, email users get a one-time password reset flow
4. Real-time listeners are converted from Firestore onSnapshot to Supabase postgres_changes with cleaner filtering
5. A 2-week parallel run validates consistency before cutover
6. Monthly cost drops from $1,600 (Firebase + Algolia) to $75 (Supabase Pro) — a 95% reduction. Query performance improves because Postgres JOINs replace client-side data stitching
