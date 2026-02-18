---
title: "Build a Realtime Collaborative Editor"
slug: build-realtime-collaborative-editor
description: "Create a collaborative text editor where multiple users can edit documents simultaneously with live cursors, presence indicators, and conflict-free synchronization."
skills: [websocket-builder, realtime-database, auth-system-setup]
category: development
tags: [websocket, collaboration, realtime, editor, crdt, presence]
---

# Build a Realtime Collaborative Editor

## The Problem

Noa is building an internal knowledge base tool for her team. The key requirement: multiple people need to edit the same document at the same time, like Google Docs but self-hosted and private. She needs live cursors showing who's editing where, real-time text synchronization without conflicts, and user authentication so edits are attributed. Off-the-shelf solutions either cost too much or don't meet the data residency requirements.

## The Solution

Use **auth-system-setup** to handle user accounts and session management, **websocket-builder** to create the real-time communication layer between clients and server, and **realtime-database** to persist document state and sync changes across connected clients with conflict resolution.

## Step-by-Step Walkthrough

### 1. Set up authentication and document permissions

```text
I need user authentication for the editor. Simple email + password login,
JWT sessions, and document-level permissions: owner, editor, viewer.
The owner can share documents with others and set their role. Use
PostgreSQL for storage.
```

```text
Created auth/users.ts — User management:
  Table: users (id, email, password_hash, display_name, avatar_color, created_at)
  avatar_color: randomly assigned from 12 distinct colors (for cursor display)
  POST /auth/register — email + password, bcrypt(12 rounds)
  POST /auth/login — returns JWT (24h expiry, contains user.id + display_name)

Created auth/permissions.ts — Document access control:
  Table: document_permissions (document_id, user_id, role, granted_at, granted_by)
  Roles: owner (full control), editor (read + write), viewer (read only)

  POST /documents/:id/share — owner only
    Body: { email, role } → looks up user, creates permission
  GET /documents/:id/collaborators — lists users with access
  DELETE /documents/:id/share/:userId — owner only, revoke access

  Middleware: requireDocumentAccess(minRole)
    Checks JWT → extracts user → queries document_permissions
    Returns 403 if role insufficient

  Document creation: POST /documents
    Auto-assigns owner role to creator
    Returns { documentId, title, createdAt }
```

### 2. Build the WebSocket server for real-time communication

```text
Set up the WebSocket server. Each document is a "room" — when a user
opens a document, they join that room. I need: connection authentication
(verify JWT on connect), room management, and message routing so edits
in one client reach all others in the same room instantly.
```

```text
Created ws/server.ts — WebSocket server (ws library + Express upgrade):

  Connection flow:
    1. Client connects: ws://host/ws?token=JWT&docId=abc123
    2. Server verifies JWT (same key as HTTP auth)
    3. Checks document_permissions for this user + document
    4. If authorized: join room, broadcast presence update
    5. If not: close connection with 4403 code

  Room management (ws/rooms.ts):
    Map<documentId, Set<Connection>>
    Connection: { ws, userId, displayName, avatarColor, role, cursor }

    join(docId, connection): add to room, broadcast "user_joined"
    leave(docId, userId): remove from room, broadcast "user_left"
    broadcast(docId, message, excludeUserId?): send to all in room

  Message types:
    Client → Server:
      "operation" — text change (insert/delete at position)
      "cursor" — cursor position update
      "select" — selection range update

    Server → Client:
      "operation" — relayed change from another user
      "cursor" — other user's cursor moved
      "presence" — user joined/left/list
      "sync" — full document state (on initial connect)

  Heartbeat: ping every 30s, disconnect after 2 missed pongs
  Reconnection: client auto-reconnects, server replays missed ops
```

### 3. Implement conflict-free document synchronization

```text
The hard part: when two people type at the same position simultaneously,
the edits need to merge without losing either person's changes. Implement
operational transformation or CRDTs — whichever is simpler for a text
editor. Persist every operation so we have full history.
```

```text
Created sync/crdt.ts — Yjs CRDT integration:

  Using Yjs (CRDT library) for conflict-free merging:
    Y.Doc per document — shared data structure
    Y.Text for the document body — supports concurrent inserts/deletes
    Y.Map for document metadata (title, last_modified)

  Why Yjs over OT:
    No central transform server needed — merges are commutative
    Works offline — clients can edit disconnected, sync on reconnect
    Battle-tested: used by Notion, Jupyter, and others

  Server-side (sync/provider.ts):
    On client connect: send Y.Doc state as sync step 1
    On client update: apply to server Y.Doc, broadcast to room
    Periodic persistence: debounced save to database every 2 seconds
    Full state save: on last client disconnect

  Database storage (realtime-database):
    Table: documents (id, title, yjs_state BYTEA, version, updated_at)
    Table: document_updates (id, document_id, update BYTEA, user_id, created_at)
    yjs_state: compressed binary snapshot of Y.Doc
    document_updates: append-only log for history replay

  Conflict example:
    User A types "hello" at position 0
    User B types "world" at position 0 (simultaneously)
    CRDT merges: "helloworld" or "worldhello" (deterministic by user ID order)
    No data lost, no manual conflict resolution needed
```

### 4. Add live cursors and presence indicators

```text
Show each user's cursor position and selection in real time. Each user
gets a unique color. Show a small name label next to each remote cursor.
Also show a presence list in the sidebar — who's currently viewing the
document and whether they're actively editing or idle.
```

```text
Created editor/cursors.ts — Remote cursor rendering:

  Cursor data structure:
    { userId, displayName, avatarColor, position: { line, ch }, selection?: { start, end } }

  Client sends cursor updates:
    On cursor move: throttled to max 50ms interval (20 updates/sec)
    On selection change: immediate send
    On idle (no movement for 5s): send { status: 'idle' }

  Rendering (CodeMirror 6 decorations):
    Remote cursor: 2px wide bar in user's avatarColor
    Name label: small floating div above cursor, same color, user's name
    Selection: semi-transparent highlight in user's color (20% opacity)
    Idle cursors: fade to 50% opacity after 5 seconds

Created editor/presence.ts — Sidebar presence panel:

  Presence list shows:
    Avatar circle (user's color) + display name
    Status dot: green (active), yellow (idle 30s+), grey (viewer)
    "Editing near line 42" — approximate location in document

  Broadcasts:
    On connect: full presence list sent to joining user
    On status change: broadcast to room
    On disconnect: removed from list with 5s grace period (covers page refreshes)

  Presence state managed server-side:
    Map<docId, Map<userId, { displayName, color, status, lastActive, cursorLine }>>
    Updated on every cursor message
```

### 5. Build the editor UI with document management

```text
Create the frontend: a clean editor interface with a document list sidebar,
the collaborative editor in the center, and the presence panel on the right.
Use CodeMirror 6 for the editor. Add markdown support since our team writes
docs in markdown.
```

```text
Created editor/App.tsx — Main editor application (React + CodeMirror 6):

  Layout (CSS Grid):
    Left sidebar (240px): document list, search, "New Document" button
    Center (flex): CodeMirror editor, full height
    Right panel (200px): presence list, share button

  CodeMirror 6 setup (editor/codemirror-setup.ts):
    Extensions:
      markdown() — syntax highlighting + preview toggle
      yCollab(yText, provider) — Yjs collaboration binding
      cursors extension — renders remote cursors from awareness
      keymap: defaultKeymap + markdownKeymap
      theme: customized light theme, clean typography

  Document list (editor/DocList.tsx):
    Fetches GET /documents — user's documents + shared with them
    Shows: title, last modified, collaborator count
    Click to open: connects WebSocket, loads Y.Doc state
    "New Document" → POST /documents, auto-opens

  Share dialog (editor/ShareDialog.tsx):
    Enter email, select role (editor/viewer)
    POST /documents/:id/share
    Shows current collaborators with role badges
    Owner can remove access or change roles

  Connection status bar (bottom):
    "Connected — 3 collaborators" (green dot)
    "Reconnecting..." (yellow dot, auto-retry)
    "Offline — changes will sync when reconnected" (red dot)
    Yjs handles offline: edits queue locally, merge on reconnect
```

## Real-World Example

Kai's five-person engineering team was paying for a collaboration tool they barely used outside of document editing. He set up this self-hosted editor on a small VPS in a weekend. The team writes specs, runbooks, and design docs collaboratively now — live cursors make pair-writing actually fun. When two engineers edited the same incident runbook during an outage, the CRDT merged their changes seamlessly. The full edit history also came in handy when they needed to trace when a particular section was added.
