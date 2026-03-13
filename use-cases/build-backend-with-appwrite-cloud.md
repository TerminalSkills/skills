---
title: Build a Backend with Appwrite Cloud
slug: build-backend-with-appwrite-cloud
description: >-
  Build a complete app backend with Appwrite — authentication, database,
  file storage, real-time subscriptions, and serverless functions without
  managing servers or writing API endpoints.
skills:
  - appwrite
  - tailwindcss
category: development
tags:
  - appwrite
  - baas
  - serverless
  - backend
  - fullstack
---

# Build a Backend with Appwrite Cloud

Jorge is a frontend developer building a project management app. He doesn't want to write API endpoints, manage a database, or set up file storage. Appwrite gives him a complete backend through SDK calls: authentication, a document database, file storage with image transformations, real-time subscriptions, and serverless functions. He focuses on the UI while Appwrite handles the infrastructure.

## Step 1: Set Up Appwrite SDK

```bash
npm install appwrite
```

```typescript
// src/lib/appwrite.ts
import { Client, Account, Databases, Storage, Functions, ID, Query } from "appwrite";

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);
export { client, ID, Query };

// Database and collection IDs
export const DB = {
  id: "main",
  collections: {
    projects: "projects",
    tasks: "tasks",
    comments: "comments",
  },
} as const;
```

## Step 2: Authentication

```typescript
// src/lib/auth.ts
import { account, ID } from "./appwrite";

export async function signUp(email: string, password: string, name: string) {
  const user = await account.create(ID.unique(), email, password, name);
  await account.createEmailPasswordSession(email, password);
  return user;
}

export async function signIn(email: string, password: string) {
  return account.createEmailPasswordSession(email, password);
}

export async function signInWithGoogle() {
  account.createOAuth2Session("google", `${window.location.origin}/dashboard`, `${window.location.origin}/login`);
}

export async function signOut() {
  await account.deleteSession("current");
}

export async function getCurrentUser() {
  try {
    return await account.get();
  } catch {
    return null;
  }
}
```

## Step 3: Database Operations (CRUD)

```typescript
// src/lib/projects.ts
import { databases, DB, ID, Query } from "./appwrite";

interface Project {
  name: string;
  description: string;
  status: "active" | "archived";
  ownerId: string;
  memberIds: string[];
}

export async function createProject(data: Omit<Project, "ownerId" | "memberIds">, userId: string) {
  return databases.createDocument(DB.id, DB.collections.projects, ID.unique(), {
    ...data,
    ownerId: userId,
    memberIds: [userId],
    createdAt: new Date().toISOString(),
  });
}

export async function getProjects(userId: string) {
  return databases.listDocuments(DB.id, DB.collections.projects, [
    Query.contains("memberIds", [userId]),
    Query.orderDesc("$createdAt"),
    Query.limit(50),
  ]);
}

export async function getProject(projectId: string) {
  return databases.getDocument(DB.id, DB.collections.projects, projectId);
}

export async function updateProject(projectId: string, data: Partial<Project>) {
  return databases.updateDocument(DB.id, DB.collections.projects, projectId, data);
}

export async function deleteProject(projectId: string) {
  // Delete all tasks in project first
  const tasks = await databases.listDocuments(DB.id, DB.collections.tasks, [
    Query.equal("projectId", projectId),
  ]);
  await Promise.all(tasks.documents.map((t) => databases.deleteDocument(DB.id, DB.collections.tasks, t.$id)));
  await databases.deleteDocument(DB.id, DB.collections.projects, projectId);
}
```

## Step 4: File Storage with Image Previews

```typescript
// src/lib/files.ts
import { storage, ID } from "./appwrite";

const BUCKET_ID = "attachments";

export async function uploadFile(file: File) {
  return storage.createFile(BUCKET_ID, ID.unique(), file);
}

export function getFilePreview(fileId: string, width = 400, height = 300) {
  return storage.getFilePreview(BUCKET_ID, fileId, width, height, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "webp");
}

export function getFileDownload(fileId: string) {
  return storage.getFileDownload(BUCKET_ID, fileId);
}

export async function deleteFile(fileId: string) {
  return storage.deleteFile(BUCKET_ID, fileId);
}
```

## Step 5: Real-Time Subscriptions

```typescript
// src/hooks/useRealtimeTasks.ts
import { useState, useEffect } from "react";
import { client, databases, DB, Query } from "@/lib/appwrite";

export function useRealtimeTasks(projectId: string) {
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    // Initial fetch
    databases.listDocuments(DB.id, DB.collections.tasks, [
      Query.equal("projectId", projectId),
      Query.orderAsc("position"),
    ]).then((res) => setTasks(res.documents));

    // Subscribe to real-time changes
    const unsubscribe = client.subscribe(
      `databases.${DB.id}.collections.${DB.collections.tasks}.documents`,
      (response) => {
        const doc = response.payload as any;
        if (doc.projectId !== projectId) return;

        if (response.events.includes("databases.*.collections.*.documents.*.create")) {
          setTasks((prev) => [...prev, doc]);
        }
        if (response.events.includes("databases.*.collections.*.documents.*.update")) {
          setTasks((prev) => prev.map((t) => (t.$id === doc.$id ? doc : t)));
        }
        if (response.events.includes("databases.*.collections.*.documents.*.delete")) {
          setTasks((prev) => prev.filter((t) => t.$id !== doc.$id));
        }
      }
    );

    return () => unsubscribe();
  }, [projectId]);

  return tasks;
}
```

## Step 6: Serverless Function for Notifications

```typescript
// functions/send-notification/src/main.ts
import { Client, Databases, Users } from "node-appwrite";

export default async ({ req, res, log }: any) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT!)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

  const { taskId, assigneeId, message } = JSON.parse(req.body);

  const users = new Users(client);
  const user = await users.get(assigneeId);

  // Send email notification via Appwrite messaging
  log(`Notifying ${user.email}: ${message}`);

  // Or use external service
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "tasks@myapp.com",
      to: user.email,
      subject: "New task assigned",
      html: `<p>${message}</p>`,
    }),
  });

  return res.json({ success: true });
};
```

## Summary

Jorge built a complete project management app without writing a single API endpoint. Appwrite handles auth (email + Google OAuth), the document database (with queries and pagination), file storage (with automatic image transformations to WebP), real-time subscriptions (tasks update live across all connected clients), and serverless functions (for sending notifications). The entire backend is managed through the Appwrite console or CLI, with permissions set per collection. He went from zero to deployed in 3 days, spending all his time on the React UI instead of infrastructure.
