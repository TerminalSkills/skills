---
title: Build a Vue Dashboard with Nuxt
slug: build-vue-dashboard-with-nuxt
description: >-
  Build a production admin dashboard with Nuxt 3 — server routes, composables
  for shared state, auto-imported components, data fetching with suspense,
  and middleware for authentication.
skills:
  - vue
  - tailwindcss
  - drizzle-orm
category: development
tags:
  - vue
  - nuxt
  - dashboard
  - fullstack
  - typescript
---

# Build a Vue Dashboard with Nuxt

Mila's team uses Vue and needs an admin dashboard. Nuxt 3 gives her file-based routing, server API routes, auto-imports (no more import statements for every component and composable), and built-in data fetching with suspense. The developer experience is unmatched: create a file in `server/api/` and you have an endpoint, create a file in `composables/` and it's available everywhere.

## Step 1: Project Setup

```bash
npx nuxi@latest init admin-dashboard
cd admin-dashboard
npx nuxi module add @nuxtjs/tailwindcss
npm install drizzle-orm @libsql/client zod h3-zod
```

## Step 2: Server API Routes

```typescript
// server/api/users/index.get.ts
import { db } from "~/server/utils/db";
import { users } from "~/server/db/schema";
import { desc, like, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const search = String(query.search || "");
  const limit = 20;
  const offset = (page - 1) * limit;

  const where = search ? like(users.name, `%${search}%`) : undefined;

  const [data, [{ count }]] = await Promise.all([
    db.query.users.findMany({
      where,
      orderBy: [desc(users.createdAt)],
      limit,
      offset,
    }),
    db.select({ count: sql<number>`count(*)` }).from(users).where(where),
  ]);

  return {
    users: data,
    pagination: { page, limit, total: Number(count), pages: Math.ceil(Number(count) / limit) },
  };
});
```

```typescript
// server/api/users/[id].patch.ts
import { z } from "zod";
import { db } from "~/server/utils/db";
import { users } from "~/server/db/schema";
import { eq } from "drizzle-orm";

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["user", "admin", "editor"]).optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
});

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const body = await readValidatedBody(event, UpdateUserSchema.parse);

  const [updated] = await db.update(users)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(users.id, id!))
    .returning();

  if (!updated) throw createError({ statusCode: 404, message: "User not found" });
  return updated;
});
```

## Step 3: Composables for Shared State

```typescript
// composables/useUsers.ts
export function useUsers() {
  const search = ref("");
  const page = ref(1);

  const { data, pending, refresh } = useFetch("/api/users", {
    query: { search, page },
    watch: [search, page],
  });

  const updateUser = async (id: string, updates: Record<string, unknown>) => {
    await $fetch(`/api/users/${id}`, { method: "PATCH", body: updates });
    await refresh();
  };

  const deleteUser = async (id: string) => {
    await $fetch(`/api/users/${id}`, { method: "DELETE" });
    await refresh();
  };

  return {
    users: computed(() => data.value?.users || []),
    pagination: computed(() => data.value?.pagination),
    loading: pending,
    search,
    page,
    refresh,
    updateUser,
    deleteUser,
  };
}
```

```typescript
// composables/useAuth.ts
export function useAuth() {
  const user = useState<User | null>("auth-user", () => null);

  const login = async (email: string, password: string) => {
    const result = await $fetch("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    user.value = result.user;
    navigateTo("/dashboard");
  };

  const logout = async () => {
    await $fetch("/api/auth/logout", { method: "POST" });
    user.value = null;
    navigateTo("/login");
  };

  return { user: readonly(user), login, logout, isAuthenticated: computed(() => !!user.value) };
}
```

## Step 4: Dashboard Page with Auto-Imported Components

```vue
<!-- pages/dashboard/users.vue -->
<script setup lang="ts">
// No imports needed — useUsers is auto-imported from composables/
const { users, pagination, loading, search, page, updateUser, deleteUser } = useUsers();

const editingUser = ref<string | null>(null);

definePageMeta({
  middleware: "auth",
  layout: "dashboard",
});
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">Users</h1>
      <input
        v-model="search"
        placeholder="Search users..."
        class="px-4 py-2 border rounded-lg w-64"
      />
    </div>

    <!-- Auto-imported DataTable component from components/ -->
    <DataTable :loading="loading">
      <template #header>
        <th class="px-4 py-3 text-left">Name</th>
        <th class="px-4 py-3 text-left">Email</th>
        <th class="px-4 py-3 text-left">Role</th>
        <th class="px-4 py-3 text-left">Status</th>
        <th class="px-4 py-3 text-right">Actions</th>
      </template>

      <template #body>
        <tr v-for="user in users" :key="user.id" class="border-t hover:bg-gray-50">
          <td class="px-4 py-3 font-medium">{{ user.name }}</td>
          <td class="px-4 py-3 text-gray-600">{{ user.email }}</td>
          <td class="px-4 py-3">
            <RoleBadge :role="user.role" />
          </td>
          <td class="px-4 py-3">
            <StatusBadge :status="user.status" />
          </td>
          <td class="px-4 py-3 text-right space-x-2">
            <button @click="editingUser = user.id" class="text-blue-600 hover:underline">
              Edit
            </button>
            <button @click="deleteUser(user.id)" class="text-red-600 hover:underline">
              Delete
            </button>
          </td>
        </tr>
      </template>
    </DataTable>

    <!-- Pagination -->
    <Pagination
      v-if="pagination"
      :current="pagination.page"
      :total="pagination.pages"
      @update="page = $event"
      class="mt-4"
    />

    <!-- Edit modal -->
    <UserEditModal
      v-if="editingUser"
      :user-id="editingUser"
      @close="editingUser = null"
      @save="(updates) => { updateUser(editingUser!, updates); editingUser = null; }"
    />
  </div>
</template>
```

## Step 5: Auth Middleware

```typescript
// middleware/auth.ts
export default defineNuxtRouteMiddleware(async (to) => {
  const { user } = useAuth();

  if (!user.value) {
    // Try to restore session
    try {
      const session = await $fetch("/api/auth/session");
      user.value = session.user;
    } catch {
      return navigateTo(`/login?redirect=${to.fullPath}`);
    }
  }
});
```

## Summary

Mila's team ships dashboard features in hours. Nuxt auto-imports mean zero boilerplate — create a composable, it's available everywhere; create a component, it's ready to use in templates. Server routes are just files in `server/api/` with full TypeScript support. `useFetch` handles loading states, caching, and reactivity automatically — change the search query and the table re-fetches. Vue's template syntax with `v-for`, `v-if`, and `v-model` makes the dashboard UI readable even for designers. The auth middleware protects routes declaratively with one line in `definePageMeta`.
