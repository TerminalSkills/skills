---
name: firebase
description: >-
  Build apps with Firebase — Google's BaaS platform. Use when a user asks to
  add authentication, use a real-time database, store files, deploy hosting,
  send push notifications, or use Cloud Functions. Covers Auth, Firestore,
  Storage, Hosting, Cloud Functions, and FCM.
license: Apache-2.0
compatibility: 'Web (JavaScript), iOS, Android, Flutter, Node.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - firebase
    - google
    - baas
    - auth
    - firestore
    - hosting
---

# Firebase

## Overview

Firebase is Google's Backend-as-a-Service providing authentication, Firestore (NoSQL database), Cloud Storage, hosting, Cloud Functions (serverless), and push notifications. Widely used for MVPs and mobile apps.

## Instructions

### Step 1: Setup

```bash
npm install firebase         # Client SDK
npm install firebase-admin   # Server SDK
npm install -g firebase-tools
firebase login
firebase init
```

```typescript
// lib/firebase.ts — Client SDK initialization
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: 'myapp.firebaseapp.com',
  projectId: 'myapp',
  storageBucket: 'myapp.appspot.com',
})

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
```

### Step 2: Authentication

```typescript
// lib/auth.ts — Firebase Auth with email and Google
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'

// Email signup
await createUserWithEmailAndPassword(auth, email, password)

// Google login
const provider = new GoogleAuthProvider()
const result = await signInWithPopup(auth, provider)
const user = result.user
```

### Step 3: Firestore Database

```typescript
// lib/db.ts — Firestore CRUD operations
import { collection, doc, addDoc, getDoc, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore'

// Create
await addDoc(collection(db, 'posts'), { title: 'Hello', author: userId, createdAt: new Date() })

// Read with filter
const q = query(collection(db, 'posts'), where('author', '==', userId), orderBy('createdAt', 'desc'))
const snapshot = await getDocs(q)
const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

// Real-time listener
onSnapshot(q, (snapshot) => {
  const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  updateUI(posts)
})
```

### Step 4: Cloud Functions

```typescript
// functions/src/index.ts — Serverless functions
import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'

export const api = onRequest(async (req, res) => {
  res.json({ message: 'Hello from Firebase Functions' })
})

export const onPostCreated = onDocumentCreated('posts/{postId}', async (event) => {
  const post = event.data?.data()
  console.log('New post:', post?.title)
  // Send notification, update counters, etc.
})
```

### Step 5: Deploy

```bash
firebase deploy              # deploy everything
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

## Guidelines

- Firestore pricing is per read/write/delete — optimize queries to minimize reads. Use `.limit()` and avoid full collection scans.
- Security Rules are mandatory for production — never leave Firestore in test mode. Define per-collection read/write rules.
- Use Firebase Admin SDK (server-side) for privileged operations — it bypasses security rules.
- Firebase Hosting is free for 10GB storage and 360MB/day transfer — great for static sites.
- Consider Supabase or Appwrite as open-source alternatives if vendor lock-in is a concern.
