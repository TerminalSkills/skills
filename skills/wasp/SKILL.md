---
name: wasp
description: >-
  Build fullstack web apps faster with Wasp. Use when a user asks to scaffold a fullstack app quickly, build a SaaS starter, or use a framework that handles auth, jobs, email, and deployment out of the box.
license: Apache-2.0
compatibility: 'Node.js 18+ (React frontend, Node.js backend)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: fullstack
  tags:
    - wasp
    - fullstack
    - saas
    - scaffold
    - react
---

# Wasp

## Overview
Wasp is a fullstack web framework that generates React + Node.js apps from a declarative DSL. It handles auth, database, jobs, email, and deployment — you focus on business logic.

## Instructions

### Step 1: Setup
```bash
curl -sSL https://get.wasp-lang.dev/installer.sh | sh
wasp new my-app
cd my-app
wasp start
```

### Step 2: Define App
```wasp
// main.wasp — App definition
app MyApp {
  wasp: { version: "^0.14.0" },
  title: "My SaaS",
  auth: {
    userEntity: User,
    methods: { email: {}, google: {} },
  }
}

entity User {=psl
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String?
psl=}

route HomeRoute { path: "/", to: HomePage }
page HomePage { component: import { Home } from "@src/pages/Home" }

query getTasks { fn: import { getTasks } from "@src/queries", entities: [Task] }
action createTask { fn: import { createTask } from "@src/actions", entities: [Task] }
```

### Step 3: Deploy
```bash
wasp deploy fly launch my-app mia
```

## Guidelines
- Wasp generates Prisma schema, Express routes, and React pages from the .wasp file.
- Built-in auth (email, Google, GitHub), jobs (cron), and email — no setup required.
- Great for SaaS MVPs — go from idea to deployed app in hours.
- Uses Prisma under the hood for database access.
