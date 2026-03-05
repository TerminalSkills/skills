---
title: Build a SaaS Backend with Firebase Auth and Hasura GraphQL
slug: build-saas-backend-with-firebase-and-hasura
description: Combine Firebase Authentication for user management with Hasura's instant GraphQL API on PostgreSQL to build a production SaaS backend with real-time subscriptions, row-level security, and event-driven workflows — without writing backend CRUD code.
skills:
- firebase
- hasura
category: development
tags:
- saas
- baas
- graphql
- auth
- real-time
---

# Build a SaaS Backend with Firebase Auth and Hasura GraphQL

## The Problem

Marta is building a project management SaaS. She needs user authentication, a database with real-time updates, role-based access control, and webhooks for integrations — the standard SaaS backend. Writing all of this from scratch with Express or FastAPI would take weeks. Instead, she combines Firebase for authentication (battle-tested, supports Google/GitHub/email login out of the box) with Hasura for the API layer (instant GraphQL over PostgreSQL, no CRUD code needed).

## The Solution

Use the skills listed above to implement an automated workflow. Install the required skills:

```bash
npx terminal-skills install firebase hasura
```

## Step-by-Step Walkthrough

### Step 1: Set Up Firebase Authentication

Firebase handles the entire auth flow — sign-up, login, password reset, OAuth providers, email verification. Marta doesn't write a single line of auth server code.

```typescript
// src/lib/auth.ts — Firebase auth client
import { initializeApp } from "firebase/app";
import {
  getAuth, signInWithPopup, GoogleAuthProvider,
  GithubAuthProvider, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, onAuthStateChanged,
  sendPasswordResetEmail, User
} from "firebase/auth";

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
});

const auth = getAuth(app);

// Multiple auth providers — each is 2-3 lines
export const signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signInGithub = () => signInWithPopup(auth, new GithubAuthProvider());
export const signInEmail = (e: string, p: string) => signInWithEmailAndPassword(auth, e, p);
export const signUpEmail = (e: string, p: string) => createUserWithEmailAndPassword(auth, e, p);
export const resetPassword = (e: string) => sendPasswordResetEmail(auth, e);
export const logout = () => auth.signOut();

// Get JWT token for Hasura requests
export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

// Auth state hook for React
export function onAuthChange(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}
```

### Step 2: Connect Firebase JWT to Hasura

Hasura validates Firebase JWTs to identify users. Every GraphQL request includes the user's role and ID, which Hasura uses for row-level security.

```yaml
# docker-compose.yml — Hasura with Firebase JWT verification
version: "3.6"
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  hasura:
    image: hasura/graphql-engine:v2.42.0
    ports:
      - "8080:8080"
    environment:
      HASURA_GRAPHQL_DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/postgres
      HASURA_GRAPHQL_ADMIN_SECRET: ${HASURA_ADMIN_SECRET}
      HASURA_GRAPHQL_ENABLE_CONSOLE: "true"
      # Firebase JWT configuration — tells Hasura how to verify tokens
      HASURA_GRAPHQL_JWT_SECRET: |
        {
          "type": "RS256",
          "jwk_url": "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
          "audience": "${FIREBASE_PROJECT_ID}",
          "issuer": "https://securetoken.google.com/${FIREBASE_PROJECT_ID}",
          "claims_map": {
            "x-hasura-user-id": {"path": "$.sub"},
            "x-hasura-default-role": "user",
            "x-hasura-allowed-roles": ["user", "admin"]
          }
        }
    depends_on:
      - postgres

volumes:
  pgdata:
```

### Step 3: Define the Database Schema and Permissions

```sql
-- migrations/001_initial_schema.sql
-- Project management tables with proper indexes

CREATE TABLE users (
  id TEXT PRIMARY KEY,                    -- Firebase UID
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member',    -- member, admin, owner
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'free',      -- free, pro, enterprise
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',    -- viewer, member, admin
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- active, archived, completed
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',    -- todo, in_progress, review, done
  priority TEXT NOT NULL DEFAULT 'medium',-- low, medium, high, urgent
  assignee_id TEXT REFERENCES users(id),
  due_date DATE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
```

Hasura permissions ensure users only see data in their workspaces:

```yaml
# metadata/tables/public_tasks.yaml — Row-level security
table:
  name: tasks
  schema: public

# Users can only read tasks in workspaces they belong to
select_permissions:
  - role: user
    permission:
      columns: [id, project_id, title, description, status, priority, assignee_id, due_date, created_by, created_at]
      filter:
        project:                           # Follow the relationship
          workspace:
            workspace_members:
              user_id: { _eq: X-Hasura-User-Id }

# Users can create tasks in projects they have access to
insert_permissions:
  - role: user
    permission:
      columns: [project_id, title, description, status, priority, assignee_id, due_date]
      set:
        created_by: X-Hasura-User-Id       # Auto-set creator
      check:
        project:
          workspace:
            workspace_members:
              user_id: { _eq: X-Hasura-User-Id }

# Users can update tasks they created or are assigned to
update_permissions:
  - role: user
    permission:
      columns: [title, description, status, priority, assignee_id, due_date]
      filter:
        _or:
          - created_by: { _eq: X-Hasura-User-Id }
          - assignee_id: { _eq: X-Hasura-User-Id }
```

### Step 4: Build the Frontend with Real-Time Updates

```typescript
// src/hooks/useTasks.ts — Real-time task board with GraphQL subscriptions
import { useSubscription, useMutation, gql } from "@apollo/client";

const SUBSCRIBE_TASKS = gql`
  subscription TaskBoard($projectId: uuid!) {
    tasks(
      where: { project_id: { _eq: $projectId } }
      order_by: { updated_at: desc }
    ) {
      id
      title
      status
      priority
      due_date
      assignee {
        name
        avatar_url
      }
    }
  }
`;

const UPDATE_TASK_STATUS = gql`
  mutation MoveTask($taskId: uuid!, $status: String!) {
    update_tasks_by_pk(
      pk_columns: { id: $taskId }
      _set: { status: $status, updated_at: "now()" }
    ) {
      id
      status
    }
  }
`;

export function useTaskBoard(projectId: string) {
  // Real-time subscription — tasks update instantly across all clients
  const { data, loading } = useSubscription(SUBSCRIBE_TASKS, {
    variables: { projectId },
  });

  const [moveTask] = useMutation(UPDATE_TASK_STATUS);

  // Group tasks by status for kanban board
  const columns = {
    todo: data?.tasks.filter((t: any) => t.status === "todo") ?? [],
    in_progress: data?.tasks.filter((t: any) => t.status === "in_progress") ?? [],
    review: data?.tasks.filter((t: any) => t.status === "review") ?? [],
    done: data?.tasks.filter((t: any) => t.status === "done") ?? [],
  };

  return {
    columns,
    loading,
    moveTask: (taskId: string, status: string) =>
      moveTask({ variables: { taskId, status } }),
  };
}
```

### Step 5: Event-Driven Workflows with Hasura Triggers

```yaml
# metadata/tables/public_tasks.yaml — Event trigger for notifications
event_triggers:
  - name: on_task_assigned
    definition:
      update:
        columns: [assignee_id]
    retry_conf:
      num_retries: 3
      interval_sec: 10
    webhook: ${WEBHOOK_BASE_URL}/webhooks/task-assigned
```

```typescript
// webhooks/task-assigned.ts — Send notification when task is assigned
export default async function handler(req: Request) {
  const { event } = await req.json();
  const { old: oldTask, new: newTask } = event.data;

  // Only notify when assignee changes and new assignee exists
  if (newTask.assignee_id && newTask.assignee_id !== oldTask?.assignee_id) {
    // Fetch assignee details via Hasura admin
    const assignee = await fetchUser(newTask.assignee_id);
    const assigner = await fetchUser(event.session_variables["x-hasura-user-id"]);

    await sendEmail({
      to: assignee.email,
      subject: `New task assigned: ${newTask.title}`,
      html: `<p>${assigner.name} assigned you a task: <strong>${newTask.title}</strong></p>`,
    });

    // Also send Slack notification if workspace has it configured
    await sendSlackNotification(newTask.project_id, {
      text: `📋 ${assigner.name} assigned "${newTask.title}" to ${assignee.name}`,
    });
  }

  return Response.json({ success: true });
}
```


## Real-World Example

Marta ships the MVP in 10 days instead of the estimated 6 weeks. Firebase handles auth for 500 beta users with zero custom backend code — Google login, GitHub login, email/password, and password reset all work out of the box. She didn't write a single auth endpoint.

Hasura eliminated all CRUD API code. The 5 database tables generated 40+ GraphQL operations automatically — queries, mutations, subscriptions, aggregations, all with filtering, sorting, and pagination. The row-level security rules ensure workspace isolation without any middleware.

The real-time subscriptions changed how the product feels. When one team member moves a task on the kanban board, every other team member sees it move instantly — no refresh needed. This feature alone became the top-mentioned item in user feedback during the first week.

The event trigger system handles 15 different notification scenarios (task assigned, status changed, due date approaching, comment added) without any polling or cron jobs. Hasura fires webhooks the instant data changes, keeping notifications under 2-second delivery time.

Total infrastructure cost: $0 (Firebase free tier covers 50K auth operations/month; Hasura runs on a $20/month Render instance with managed PostgreSQL). The team estimates they saved $15-20K in engineering time compared to building auth, API, real-time, and webhooks from scratch.

## Related Skills

- [firebase](../skills/firebase/) -- Google's BaaS platform for auth, Firestore database, storage, and hosting
- [hasura](../skills/hasura/) -- Instant GraphQL API over PostgreSQL with real-time subscriptions and authorization
