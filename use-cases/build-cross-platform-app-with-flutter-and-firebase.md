---
title: Build a Cross-Platform Task Manager with Flutter and Firebase
slug: build-cross-platform-app-with-flutter-and-firebase
description: Build a production task management app that runs on iOS, Android, and web from a single Flutter codebase, using Firebase for authentication, Firestore for real-time data sync, and Cloud Functions for background automation.
skills:
  - flutter
  - firebasecategory: development
tags:
- flutter
- firebase
- cross-platform
- mobile
- real-time
---

# Build a Cross-Platform Task Manager with Flutter and Firebase

## The Problem

Sasha is a solo developer building a task management app for small teams. The app needs to work on iOS, Android, and web — three platforms from one codebase. It needs user authentication, real-time sync (when one person marks a task done, everyone sees it instantly), push notifications for deadlines, and offline support for when users are on a plane or subway.

Flutter handles the cross-platform UI. Firebase handles everything backend — auth, database, push notifications, and serverless functions. Sasha doesn't write a single API endpoint.

## The Solution

Use the skills listed above to implement an automated workflow. Install the required skills:

```bash
npx terminal-skills install flutter firebase
```

## Step-by-Step Walkthrough

### Step 1: Firebase Authentication with Multiple Providers

```dart
// lib/services/auth_service.dart — Authentication with Google, Apple, email
// Firebase handles the entire auth flow — OAuth redirects, token refresh, session management.

import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Stream of auth state changes — use in a StreamBuilder to react to login/logout
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  /// Current user (null if not logged in)
  User? get currentUser => _auth.currentUser;

  /// Sign in with Google (works on iOS, Android, and web)
  Future<UserCredential> signInWithGoogle() async {
    // Trigger the Google sign-in flow
    final GoogleSignInAccount? googleUser = await GoogleSignIn().signIn();
    if (googleUser == null) throw Exception('Google sign-in cancelled');

    // Get auth credentials from the Google sign-in
    final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
    final credential = GoogleAuthProvider.credential(
      accessToken: googleAuth.accessToken,
      idToken: googleAuth.idToken,
    );

    // Sign in to Firebase with the Google credential
    return _auth.signInWithCredential(credential);
  }

  /// Sign in with email/password
  Future<UserCredential> signInWithEmail(String email, String password) {
    return _auth.signInWithEmailAndPassword(email: email, password: password);
  }

  /// Create account with email/password
  Future<UserCredential> createAccount(String email, String password, String displayName) async {
    final credential = await _auth.createUserWithEmailAndPassword(
      email: email,
      password: password,
    );
    // Set the display name
    await credential.user?.updateDisplayName(displayName);
    return credential;
  }

  /// Sign out
  Future<void> signOut() async {
    await GoogleSignIn().signOut();
    await _auth.signOut();
  }
}
```

### Step 2: Firestore Data Layer with Real-Time Sync

```dart
// lib/services/task_service.dart — Firestore CRUD with real-time updates
// Firestore syncs data in real-time — when any user changes a task,
// all other users see the change instantly without polling.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class TaskService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Real-time stream of tasks for a workspace.
  /// Every time a task is created, updated, or deleted by ANY user,
  /// this stream emits an updated list.
  Stream<List<Task>> watchTasks(String workspaceId) {
    return _db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('tasks')
        .orderBy('updatedAt', descending: true)
        .snapshots()                         // Real-time listener, not one-time fetch
        .map((snapshot) => snapshot.docs.map((doc) {
              return Task.fromFirestore(doc.id, doc.data());
            }).toList());
  }

  /// Create a task — immediately visible to all workspace members
  Future<String> createTask({
    required String workspaceId,
    required String title,
    required String priority,
    String? assigneeId,
    DateTime? dueDate,
  }) async {
    final docRef = await _db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('tasks')
        .add({
      'title': title,
      'description': '',
      'status': 'todo',
      'priority': priority,
      'assigneeId': assigneeId,
      'dueDate': dueDate != null ? Timestamp.fromDate(dueDate) : null,
      'createdBy': _auth.currentUser!.uid,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
    return docRef.id;
  }

  /// Update task status — optimistic update (UI updates before server confirms)
  Future<void> updateTaskStatus(String workspaceId, String taskId, String status) {
    return _db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('tasks')
        .doc(taskId)
        .update({
      'status': status,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Batch update — move multiple tasks at once (atomic)
  Future<void> batchUpdateStatus(
    String workspaceId,
    List<String> taskIds,
    String newStatus,
  ) async {
    final batch = _db.batch();
    for (final taskId in taskIds) {
      final ref = _db
          .collection('workspaces')
          .doc(workspaceId)
          .collection('tasks')
          .doc(taskId);
      batch.update(ref, {
        'status': newStatus,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}
```

### Step 3: Kanban Board UI with Drag-and-Drop

```dart
// lib/screens/board_screen.dart — Kanban board with real-time updates
// The board updates live — when a teammate moves a task, you see it move instantly.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class BoardScreen extends ConsumerWidget {
  final String workspaceId;
  const BoardScreen({super.key, required this.workspaceId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return StreamBuilder<List<Task>>(
      stream: ref.read(taskServiceProvider).watchTasks(workspaceId),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

        final tasks = snapshot.data!;
        final columns = {
          'todo': tasks.where((t) => t.status == 'todo').toList(),
          'in_progress': tasks.where((t) => t.status == 'in_progress').toList(),
          'review': tasks.where((t) => t.status == 'review').toList(),
          'done': tasks.where((t) => t.status == 'done').toList(),
        };

        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: columns.entries.map((entry) {
              return _KanbanColumn(
                title: _formatColumnTitle(entry.key),
                tasks: entry.value,
                status: entry.key,
                onTaskDropped: (taskId, newStatus) {
                  ref.read(taskServiceProvider).updateTaskStatus(
                    workspaceId, taskId, newStatus,
                  );
                },
              );
            }).toList(),
          ),
        );
      },
    );
  }
}

class _KanbanColumn extends StatelessWidget {
  final String title;
  final List<Task> tasks;
  final String status;
  final void Function(String taskId, String newStatus) onTaskDropped;

  const _KanbanColumn({
    required this.title,
    required this.tasks,
    required this.status,
    required this.onTaskDropped,
  });

  @override
  Widget build(BuildContext context) {
    return DragTarget<Task>(
      onAcceptWithDetails: (details) {
        onTaskDropped(details.data.id, status);
      },
      builder: (context, candidateData, rejectedData) {
        return Container(
          width: 300,
          margin: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: candidateData.isNotEmpty
                ? Colors.blue.withOpacity(0.1)    // Highlight when dragging over
                : Colors.grey.shade100,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const Spacer(),
                    Chip(label: Text('${tasks.length}')),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  itemCount: tasks.length,
                  itemBuilder: (context, index) {
                    return Draggable<Task>(
                      data: tasks[index],
                      feedback: Material(
                        elevation: 8,
                        child: _TaskCard(task: tasks[index]),
                      ),
                      childWhenDragging: Opacity(
                        opacity: 0.3,
                        child: _TaskCard(task: tasks[index]),
                      ),
                      child: _TaskCard(task: tasks[index]),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
```

### Step 4: Cloud Functions for Deadline Notifications

```typescript
// functions/src/index.ts — Firebase Cloud Functions for automation
// These run serverless — triggered by data changes in Firestore.

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { initializeApp } from "firebase-admin/app";

initializeApp();
const db = getFirestore();

// When a task is assigned, send a push notification to the assignee
export const onTaskAssigned = onDocumentUpdated(
  "workspaces/{workspaceId}/tasks/{taskId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only notify when assignee changes
    if (after.assigneeId && after.assigneeId !== before.assigneeId) {
      // Get assignee's FCM token
      const userDoc = await db.doc(`users/${after.assigneeId}`).get();
      const fcmToken = userDoc.data()?.fcmToken;
      if (!fcmToken) return;

      await getMessaging().send({
        token: fcmToken,
        notification: {
          title: "New task assigned",
          body: `You've been assigned: "${after.title}"`,
        },
        data: {
          type: "task_assigned",
          taskId: event.params.taskId,
          workspaceId: event.params.workspaceId,
        },
      });
    }
  }
);

// Daily check for overdue tasks — runs at 9 AM UTC every day
export const checkOverdueTasks = onSchedule("every day 09:00", async () => {
  const now = new Date();
  const workspaces = await db.collection("workspaces").get();

  for (const workspace of workspaces.docs) {
    const overdueTasks = await db
      .collection(`workspaces/${workspace.id}/tasks`)
      .where("dueDate", "<", now)
      .where("status", "not-in", ["done", "cancelled"])
      .get();

    for (const task of overdueTasks.docs) {
      const data = task.data();
      if (!data.assigneeId) continue;

      const userDoc = await db.doc(`users/${data.assigneeId}`).get();
      const fcmToken = userDoc.data()?.fcmToken;
      if (!fcmToken) continue;

      await getMessaging().send({
        token: fcmToken,
        notification: {
          title: "⚠️ Overdue task",
          body: `"${data.title}" was due ${formatRelativeDate(data.dueDate.toDate())}`,
        },
      });
    }
  }
});
```

### Step 5: Offline Support

```dart
// lib/main.dart — Enable Firestore offline persistence
// Flutter + Firestore handles offline automatically:
// - Reads work from local cache when offline
// - Writes are queued and sync when connection returns
// - UI stays responsive even without internet

import 'package:cloud_firestore/cloud_firestore.dart';

void configureFirestore() {
  FirebaseFirestore.instance.settings = const Settings(
    persistenceEnabled: true,          // Cache data locally (default on mobile)
    cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
  );
}

// That's it. Firestore handles:
// 1. Caching all queried documents locally
// 2. Serving reads from cache when offline
// 3. Queuing writes and syncing when back online
// 4. Resolving conflicts with last-writer-wins
// 5. Emitting snapshot events from cache (UI stays live)
```


## Real-World Example

Sasha launches the app on all three platforms in 6 weeks. The Flutter codebase is 12,000 lines of Dart — one codebase producing an iOS app, an Android app, and a web app. Maintaining three separate codebases (Swift + Kotlin + React) would have been 30,000+ lines across three languages.

Firestore's real-time sync is the feature users mention most. When one team member drags a task from "In Progress" to "Done" on their phone, their colleague sees the card slide to the Done column on their laptop within 200ms. No refresh button, no "sync" action — it just works.

The offline support came essentially free. Firestore's local cache means the app works on the New York subway, on a plane, or in a basement with no signal. Users create and update tasks offline, and everything syncs silently when they're back online. Two users reported they didn't even realize they'd been offline for an hour.

Cloud Functions handle all the automation Sasha would have needed a backend server for — push notifications for task assignments (2,500/day), daily deadline reminders (800 per run), and weekly digest emails. Total monthly cost: $0 (well within Firebase's free tier for 200 users).

The kanban board drag-and-drop works identically on iOS, Android, and web thanks to Flutter's gesture system. Sasha wrote the drag-and-drop logic once and it adapted to touch (mobile) and mouse (web) automatically.

## Related Skills

- [flutter](../skills/flutter/) -- Build cross-platform mobile and desktop apps from a single Dart codebase
- [firebase](../skills/firebase/) -- Google's BaaS platform for auth, Firestore database, storage, and hosting
