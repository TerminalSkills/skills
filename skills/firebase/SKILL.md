---
name: firebase
description: Expert guidance for Firebase, Google's platform for building and scaling web and mobile applications. Helps developers set up authentication, Firestore/Realtime Database, Cloud Functions, hosting, storage, and analytics using Firebase's SDK and CLI.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
  - baas
  - google
  - realtime-database
  - auth
  - hosting
---

# Firebase — Google's Backend-as-a-Service


## Overview


Firebase, Google's platform for building and scaling web and mobile applications. Helps developers set up authentication, Firestore/Realtime Database, Cloud Functions, hosting, storage, and analytics using Firebase's SDK and CLI.


## Instructions

### Project Setup

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and initialize
firebase login
firebase init
# Select: Firestore, Functions, Hosting, Storage, Emulators

# Start local development with emulators
firebase emulators:start
```

For agent-driven Firebase work, install Google's official Firebase agent skills bundle — keeps patterns current with Firebase product changes:

```bash
npx -y skills add firebase/agent-skills -y
```

Set the active project for the CLI before running commands:

```bash
npx -y firebase-tools@latest use --add <PROJECT_ID>
```

### Authentication

```typescript
// src/lib/auth.ts — Firebase Authentication
import { initializeApp } from "firebase/app";
import {
  getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, onAuthStateChanged, signOut, User
} from "firebase/auth";

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

const auth = getAuth(app);

// Google sign-in
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

// Email/password sign-up
export async function signUp(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

// Email/password sign-in
export async function signIn(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

// Auth state listener
export function onAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  await signOut(auth);
}
```

### Firestore (Document Database)

```typescript
// src/lib/firestore.ts — Firestore CRUD operations
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, writeBatch, Timestamp
} from "firebase/firestore";

const db = getFirestore();

// Create a document
async function createPost(userId: string, data: { title: string; content: string }) {
  const ref = await addDoc(collection(db, "posts"), {
    ...data,
    authorId: userId,
    createdAt: serverTimestamp(),
    likes: 0,
    published: false,
  });
  return ref.id;
}

// Read a document
async function getPost(postId: string) {
  const snap = await getDoc(doc(db, "posts", postId));
  if (!snap.exists()) throw new Error("Post not found");
  return { id: snap.id, ...snap.data() };
}

// Query documents
async function getPublishedPosts(limitCount = 20) {
  const q = query(
    collection(db, "posts"),
    where("published", "==", true),
    orderBy("createdAt", "desc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Real-time listener
function onPostsChange(callback: (posts: any[]) => void) {
  const q = query(collection(db, "posts"), where("published", "==", true), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(posts);
  });
}

// Batch writes (atomic)
async function publishMultiplePosts(postIds: string[]) {
  const batch = writeBatch(db);
  for (const id of postIds) {
    batch.update(doc(db, "posts", id), {
      published: true,
      publishedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}
```

### Security Rules

```javascript
// firestore.rules — Firestore security rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own profile
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }

    // Posts: anyone can read published, only author can write
    match /posts/{postId} {
      allow read: if resource.data.published == true
                  || request.auth.uid == resource.data.authorId;
      allow create: if request.auth != null
                    && request.resource.data.authorId == request.auth.uid;
      allow update: if request.auth.uid == resource.data.authorId;
      allow delete: if request.auth.uid == resource.data.authorId;
    }
  }
}
```

### Cloud Functions

```typescript
// functions/src/index.ts — Serverless backend logic
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";

initializeApp();
const db = getFirestore();

// Trigger on new post creation
export const onPostCreated = onDocumentCreated("posts/{postId}", async (event) => {
  const post = event.data?.data();
  if (!post) return;

  // Update user's post count
  await db.doc(`users/${post.authorId}`).update({
    postCount: FieldValue.increment(1),
  });

  // Send notification
  await sendNotification(post.authorId, `Your post "${post.title}" was created!`);
});

// Callable function (client calls directly)
export const likePost = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");

  const { postId } = request.data;
  const postRef = db.doc(`posts/${postId}`);

  await db.runTransaction(async (tx) => {
    const post = await tx.get(postRef);
    if (!post.exists) throw new HttpsError("not-found", "Post not found");

    tx.update(postRef, { likes: (post.data()!.likes || 0) + 1 });
    tx.set(db.doc(`posts/${postId}/likes/${request.auth!.uid}`), {
      createdAt: new Date(),
    });
  });

  return { success: true };
});

// Scheduled function (cron)
export const dailyCleanup = onSchedule("every day 03:00", async () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const oldDrafts = await db.collection("posts")
    .where("published", "==", false)
    .where("createdAt", "<", cutoff)
    .get();

  const batch = db.batch();
  oldDrafts.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log(`Deleted ${oldDrafts.size} old drafts`);
});
```

### Storage

```typescript
// Upload and manage files
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const storage = getStorage();

async function uploadImage(file: File, path: string): Promise<string> {
  const storageRef = ref(storage, `images/${path}/${file.name}`);
  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: "user-123" },
  });
  return getDownloadURL(snapshot.ref);
}
```

## Installation

```bash
npm install firebase              # Client SDK
npm install firebase-admin         # Server/Cloud Functions SDK
npm install -g firebase-tools      # CLI
```


## Examples


### Example 1: Setting up Firebase with a custom configuration

**User request:**

```
I just installed Firebase. Help me configure it for my TypeScript + React workflow with my preferred keybindings.
```

The agent creates the configuration file with TypeScript-aware settings, configures relevant plugins/extensions for React development, sets up keyboard shortcuts matching the user's preferences, and verifies the setup works correctly.

### Example 2: Extending Firebase with custom functionality

**User request:**

```
I want to add a custom authentication to Firebase. How do I build one?
```

The agent scaffolds the extension/plugin project, implements the core functionality following Firebase's API patterns, adds configuration options, and provides testing instructions to verify it works end-to-end.


## Guidelines

1. **Security rules first** — Write rules before deploying; default is deny-all, which is correct
2. **Use emulators in development** — `firebase emulators:start` runs everything locally; never test against production
3. **Composite indexes** — Firestore requires indexes for compound queries; the emulator/CLI suggests them automatically
4. **Batch writes for atomicity** — Use `writeBatch()` when updating multiple documents that should succeed or fail together
5. **Real-time listeners** — Use `onSnapshot` for live updates instead of polling; Firestore pushes changes to clients
6. **Cloud Functions v2** — Use v2 functions (firebase-functions/v2); better performance and more configuration options
7. **Structure data for queries** — Firestore is not SQL; denormalize data and duplicate fields you need to filter/sort by
8. **Monitor usage** — Firestore charges per read/write; use the Firebase console to track and optimize usage
