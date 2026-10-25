---
name: firebase
description: Expert guidance for Firebase, Google's platform for building and scaling web and mobile applications. Helps developers set up authentication, Firestore/Realtime Database, Cloud Functions, hosting, storage, and analytics using Firebase's SDK and CLI.
license: Apache-2.0
compatibility: "Node.js 20+ for firebase-tools; Node.js 22+ for firebase-admin 14. Cloud Functions need the Blaze (pay-as-you-go) plan."
metadata:
  author: terminal-skills
  version: 1.2.0
  category: development
  tags: "baas, google, realtime-database, auth, hosting"
---

# Firebase — Google's Backend-as-a-Service

## Overview

Firebase, Google's platform for building and scaling web and mobile applications. Helps developers set up authentication, Firestore/Realtime Database, Cloud Functions, hosting, storage, and analytics using Firebase's SDK and CLI.

## Instructions

### Project Setup

```bash
# Install Firebase CLI (15.x, Node.js 20+)
npm install -g firebase-tools

# Login and initialize
firebase login
firebase init
# Select: Firestore, Functions, Hosting, Storage, Emulators
# (also offered: App Hosting for Next.js/Angular, Data Connect, AI Logic)

# Start local development with emulators
firebase emulators:start
```

For agent-driven Firebase work, Google publishes an official Firebase agent skills bundle (also available as a Gemini CLI extension and Claude/Codex plugins):

```bash
npx skills add firebase/skills
```

Set the active project for the CLI before running commands (`firebase use --add` is the interactive variant; `--alias` names an environment):

```bash
firebase use bakery-orders-prod
firebase use --alias staging bakery-orders-staging
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
      allow update: if request.auth.uid == resource.data.authorId
                    && request.resource.data.likes == resource.data.likes; // likes change only via the callable
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
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";

initializeApp();
const db = getFirestore();

// Trigger on new post creation (pass { region } as the first argument to choose the function region)
export const onPostCreated = onDocumentCreated("posts/{postId}", async (event) => {
  const post = event.data?.data();
  if (!post) return;

  // Update user's post count
  await db.doc(`users/${post.authorId}`).update({
    postCount: FieldValue.increment(1),
  });

  console.log(`Post ${event.params.postId} created by ${post.authorId}`);
});

// Callable function (client calls directly)
export const likePost = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in");

  const { postId } = request.data;
  const postRef = db.doc(`posts/${postId}`);

  await db.runTransaction(async (tx) => {
    const likeRef = db.doc(`posts/${postId}/likes/${request.auth!.uid}`);
    const [post, like] = await Promise.all([tx.get(postRef), tx.get(likeRef)]);
    if (!post.exists) throw new HttpsError("not-found", "Post not found");
    if (like.exists) return; // one like per user

    tx.update(postRef, { likes: FieldValue.increment(1) });
    tx.set(likeRef, { createdAt: FieldValue.serverTimestamp() });
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
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

async function uploadImage(file: File, folder: string): Promise<string> {
  const snapshot = await uploadBytes(ref(getStorage(), `images/${folder}/${file.name}`), file, {
    contentType: file.type,
  });
  return getDownloadURL(snapshot.ref);
}
```

## Installation

```bash
npm install firebase                    # Client SDK (v13; its breaking changes are in the AI Logic API only)
npm install firebase-admin firebase-functions   # Server SDK (v14, needs Node 22+) and Functions SDK
npm install -g firebase-tools           # CLI
```

## Examples

### Example 1: Publishing flow with security rules and emulators

**User request:**

```
Add a posts collection where only the author can edit, and let me test it without touching production.
```

The agent adds the `posts` match block from the rules above to `firestore.rules`, runs `firebase emulators:start --only firestore,auth`, writes a client test that signs in two emulator users, and confirms the second user's `updateDoc` is rejected with `permission-denied` before running `firebase deploy --only firestore:rules`.

### Example 2: Callable function to like a post

**User request:**

```
Make liking a post safe: one like per user, no client-side counter writes.
```

The agent deploys the `likePost` callable with `firebase deploy --only functions:likePost`, calls it from the client with `httpsCallable(getFunctions(), "likePost")({ postId })`, and relies on the `update` rule above, which rejects client writes that change `likes`. The result is `{ success: true }` and the counter moves only through the transaction.

## Guidelines

1. **Security rules first** — Write rules before deploying; default is deny-all, which is correct
2. **Use emulators in development** — `firebase emulators:start` runs everything locally; never test against production
3. **Composite indexes** — Firestore requires indexes for compound queries; a query that lacks one fails with an error containing a console link to create it; keep indexes in `firestore.indexes.json` and deploy with `firebase deploy --only firestore:indexes`
4. **Batch writes for atomicity** — Use `writeBatch(db)` (commit with `batch.commit()`) when updating multiple documents that should succeed or fail together
5. **Real-time listeners** — Use `onSnapshot` for live updates instead of polling; Firestore pushes changes to clients
6. **Cloud Functions v2** — Use v2 functions (firebase-functions/v2); better performance and more configuration options
7. **Structure data for queries** — Firestore is not SQL; denormalize data and duplicate fields you need to filter/sort by
8. **Plan limits** — Cloud Functions require the Blaze plan (check the pricing page for Storage buckets); set a budget alert
9. **Monitor usage** — Firestore charges per read/write; use the Firebase console to track and optimize usage
