---
title: Build a Server-Rendered App with Nuxt and Supabase
slug: build-ssr-app-with-nuxt-and-supabase
description: Build a server-rendered Vue.js application with Nuxt 3 and Supabase for authentication and real-time data. Create a notes app with SSR, auth, CRUD, and real-time updates.
skills:
  - nuxt
  - supabase
  - vue
category: use-cases
tags:
  - vue
  - ssr
  - supabase
  - auth
  - realtime
  - fullstack
---

# Build a Server-Rendered App with Nuxt and Supabase

This walkthrough builds a notes application using Nuxt 3 for server-side rendering and Supabase for authentication, database, and real-time subscriptions. You'll get a fully rendered, SEO-friendly app with user auth and live updates — no backend code to maintain.

## Why Nuxt + Supabase?

Nuxt provides SSR, file-based routing, and auto-imports. Supabase provides a PostgreSQL database, authentication, real-time subscriptions, and storage — all accessible via a client SDK. Together, they let you build full-stack apps without writing or deploying a separate backend.

## Step 1: Project Setup

```bash
# Terminal — create Nuxt project with Supabase module
npx nuxi@latest init notes-app
cd notes-app
npm install @nuxtjs/supabase
npm run dev
```

## Step 2: Configuration

```typescript
// nuxt.config.ts — configure Nuxt with Supabase module
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/supabase'],
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      include: ['/notes(/*)?', '/profile'],
      exclude: ['/', '/about'],
    },
  },
  runtimeConfig: {
    public: {
      appName: 'Notes App',
    },
  },
})
```

```ini
# .env — Supabase credentials (from your Supabase project dashboard)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

## Step 3: Supabase Database Setup

Create the notes table in your Supabase dashboard SQL editor:

```sql
-- Supabase SQL Editor — create notes table with RLS
create table notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text default '',
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table notes enable row level security;

-- Users can only read their own notes (and public notes)
create policy "Users can read own notes"
  on notes for select
  using (auth.uid() = user_id or is_public = true);

-- Users can only insert their own notes
create policy "Users can insert own notes"
  on notes for insert
  with check (auth.uid() = user_id);

-- Users can only update their own notes
create policy "Users can update own notes"
  on notes for update
  using (auth.uid() = user_id);

-- Users can only delete their own notes
create policy "Users can delete own notes"
  on notes for delete
  using (auth.uid() = user_id);

-- Enable realtime
alter publication supabase_realtime add table notes;
```

## Step 4: Authentication Pages

```vue
<!-- pages/login.vue — login page with email/password and OAuth -->
<script setup lang="ts">
const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function signInWithEmail() {
  loading.value = true
  error.value = ''
  const { error: err } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })
  if (err) error.value = err.message
  else navigateTo('/notes')
  loading.value = false
}

async function signInWithGitHub() {
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${window.location.origin}/confirm` },
  })
}
</script>

<template>
  <div class="auth-page">
    <h1>Login</h1>
    <form @submit.prevent="signInWithEmail">
      <input v-model="email" type="email" placeholder="Email" required />
      <input v-model="password" type="password" placeholder="Password" required />
      <button type="submit" :disabled="loading">{{ loading ? 'Signing in...' : 'Sign In' }}</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
    <hr />
    <button @click="signInWithGitHub">Sign in with GitHub</button>
    <p>Don't have an account? <NuxtLink to="/register">Register</NuxtLink></p>
  </div>
</template>
```

```vue
<!-- pages/register.vue — registration page -->
<script setup lang="ts">
const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const loading = ref(false)
const message = ref('')

async function signUp() {
  loading.value = true
  const { error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
  })
  if (error) message.value = error.message
  else message.value = 'Check your email for a confirmation link.'
  loading.value = false
}
</script>

<template>
  <div class="auth-page">
    <h1>Register</h1>
    <form @submit.prevent="signUp">
      <input v-model="email" type="email" placeholder="Email" required />
      <input v-model="password" type="password" placeholder="Password (min 6 chars)" minlength="6" required />
      <button type="submit" :disabled="loading">Register</button>
    </form>
    <p>{{ message }}</p>
    <p>Already have an account? <NuxtLink to="/login">Login</NuxtLink></p>
  </div>
</template>
```

```vue
<!-- pages/confirm.vue — OAuth callback handler -->
<script setup lang="ts">
const user = useSupabaseUser()
watch(user, () => {
  if (user.value) navigateTo('/notes')
}, { immediate: true })
</script>

<template>
  <p>Confirming your account...</p>
</template>
```

## Step 5: Notes Composable

```typescript
// composables/useNotes.ts — reusable notes data layer
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Note {
  id: string
  title: string
  content: string
  is_public: boolean
  created_at: string
  updated_at: string
}

export function useNotes() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const notes = useState<Note[]>('notes', () => [])
  const loading = ref(false)

  async function fetchNotes() {
    loading.value = true
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.value!.id)
      .order('updated_at', { ascending: false })
    if (!error && data) notes.value = data
    loading.value = false
  }

  async function createNote(title: string) {
    const { data, error } = await supabase
      .from('notes')
      .insert({ title, user_id: user.value!.id })
      .select()
      .single()
    if (!error && data) notes.value.unshift(data)
    return { data, error }
  }

  async function updateNote(id: string, updates: Partial<Note>) {
    const { error } = await supabase
      .from('notes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      const idx = notes.value.findIndex((n) => n.id === id)
      if (idx >= 0) Object.assign(notes.value[idx], updates)
    }
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (!error) notes.value = notes.value.filter((n) => n.id !== id)
  }

  return { notes: readonly(notes), loading, fetchNotes, createNote, updateNote, deleteNote }
}
```

## Step 6: Notes Pages

```vue
<!-- pages/notes/index.vue — notes list with real-time updates -->
<script setup lang="ts">
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { notes, loading, fetchNotes, createNote, deleteNote } = useNotes()
const newTitle = ref('')

await fetchNotes()

// Real-time subscription
let channel: ReturnType<typeof supabase.channel>
onMounted(() => {
  channel = supabase
    .channel('notes-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'notes',
      filter: `user_id=eq.${user.value!.id}`,
    }, () => {
      fetchNotes()  // Refresh on any change
    })
    .subscribe()
})

onUnmounted(() => {
  channel?.unsubscribe()
})

async function handleCreate() {
  if (!newTitle.value.trim()) return
  await createNote(newTitle.value.trim())
  newTitle.value = ''
}
</script>

<template>
  <div>
    <h1>My Notes</h1>

    <form @submit.prevent="handleCreate" class="create-form">
      <input v-model="newTitle" placeholder="New note title..." required />
      <button type="submit">Create</button>
    </form>

    <p v-if="loading">Loading...</p>

    <div v-for="note in notes" :key="note.id" class="note-card">
      <NuxtLink :to="`/notes/${note.id}`">
        <h2>{{ note.title }}</h2>
      </NuxtLink>
      <p>{{ note.content?.slice(0, 100) || 'No content yet' }}</p>
      <div class="note-meta">
        <span>{{ new Date(note.updated_at).toLocaleDateString() }}</span>
        <span v-if="note.is_public" class="badge">Public</span>
        <button @click="deleteNote(note.id)">Delete</button>
      </div>
    </div>

    <p v-if="!loading && notes.length === 0">No notes yet. Create your first one!</p>
  </div>
</template>
```

```vue
<!-- pages/notes/[id].vue — note editor page -->
<script setup lang="ts">
const route = useRoute()
const supabase = useSupabaseClient()
const { updateNote } = useNotes()
const saving = ref(false)

const { data: note } = await useFetch(`/api/notes/${route.params.id}`)

if (!note.value) {
  throw createError({ statusCode: 404, message: 'Note not found' })
}

const title = ref(note.value.title)
const content = ref(note.value.content)
const isPublic = ref(note.value.is_public)

// Auto-save with debounce
let saveTimeout: NodeJS.Timeout
function autoSave() {
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    saving.value = true
    await updateNote(note.value!.id, {
      title: title.value,
      content: content.value,
      is_public: isPublic.value,
    })
    saving.value = false
  }, 1000)
}

watch([title, content, isPublic], autoSave)

useHead({ title: () => title.value })
</script>

<template>
  <div class="note-editor">
    <div class="toolbar">
      <NuxtLink to="/notes">← Back</NuxtLink>
      <span v-if="saving" class="save-indicator">Saving...</span>
      <span v-else class="save-indicator">Saved</span>
    </div>
    <input v-model="title" class="title-input" placeholder="Note title" />
    <label>
      <input type="checkbox" v-model="isPublic" /> Make public
    </label>
    <textarea v-model="content" class="content-editor" placeholder="Start writing..."></textarea>
  </div>
</template>
```

## Step 7: Server API Route

```typescript
// server/api/notes/[id].get.ts — server-side note fetch for SSR
import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const client = await serverSupabaseClient(event)

  const { data, error } = await client
    .from('notes')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, message: 'Note not found' })
  }

  return data
})
```

## Step 8: Layout

```vue
<!-- layouts/default.vue — app layout with nav -->
<script setup lang="ts">
const supabase = useSupabaseClient()
const user = useSupabaseUser()

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/login')
}
</script>

<template>
  <div class="app">
    <header>
      <nav>
        <NuxtLink to="/">Home</NuxtLink>
        <template v-if="user">
          <NuxtLink to="/notes">Notes</NuxtLink>
          <span>{{ user.email }}</span>
          <button @click="signOut">Sign Out</button>
        </template>
        <template v-else>
          <NuxtLink to="/login">Login</NuxtLink>
        </template>
      </nav>
    </header>
    <main><slot /></main>
  </div>
</template>
```

## Step 9: Run and Deploy

```bash
# Terminal — development
npm run dev

# Build for production (Node.js server)
npm run build
node .output/server/index.mjs

# Or deploy to Vercel/Netlify/Cloudflare
npx nuxi build --preset=vercel
```

## What You've Built

A server-rendered notes application with email and OAuth authentication, real-time data sync across browser tabs, auto-saving editor, and row-level security on the database. Supabase handles all the backend infrastructure — auth, database, real-time — while Nuxt provides SSR for fast first loads and SEO. The app works without JavaScript on initial render and progressively enhances with Vue's reactivity.
