---
name: adonisjs
description: >-
  Build full-stack web applications with AdonisJS — a batteries-included Node.js
  framework with ORM, auth, validation, and mailer built-in. Use when someone
  asks to "build a web app with Node.js", "Laravel for Node.js", "full-stack
  Node framework", "AdonisJS", "batteries-included backend", or "Node.js with
  built-in ORM and auth". Covers Lucid ORM, auth (sessions, tokens, social),
  VineJS validation, Edge templates, and deployment.
license: Apache-2.0
compatibility: "Node.js 20+. TypeScript."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: backend
  tags: ["nodejs", "framework", "orm", "auth", "full-stack", "adonisjs"]
---

# AdonisJS

## Overview

AdonisJS is a full-stack Node.js framework — the "Laravel of Node.js." Unlike Express/Fastify where you assemble everything from packages, AdonisJS ships with an ORM (Lucid), authentication, validation (VineJS), mailer, queues, and testing out of the box. Opinionated, TypeScript-first, and production-ready.

## When to Use

- Building a complete web application (not just an API) with Node.js
- Want an opinionated framework with conventions (like Rails/Laravel)
- Need built-in auth (sessions, API tokens, social OAuth)
- Database-driven applications with migrations and models
- Teams that prefer convention over configuration

## Instructions

### Setup

```bash
npm init adonisjs@latest my-app -- --kit=web
cd my-app
node ace serve --watch
```

### Routes and Controllers

```typescript
// start/routes.ts — Route definitions
import router from "@adonisjs/core/services/router";
const UsersController = () => import("#controllers/users_controller");

router.group(() => {
  router.get("/users", [UsersController, "index"]);
  router.get("/users/:id", [UsersController, "show"]);
  router.post("/users", [UsersController, "store"]);
  router.put("/users/:id", [UsersController, "update"]);
  router.delete("/users/:id", [UsersController, "destroy"]);
}).prefix("/api");
```

```typescript
// app/controllers/users_controller.ts — Controller with validation
import type { HttpContext } from "@adonisjs/core/http";
import User from "#models/user";
import { createUserValidator, updateUserValidator } from "#validators/user";

export default class UsersController {
  async index({ request }: HttpContext) {
    const page = request.input("page", 1);
    const limit = request.input("limit", 20);
    return User.query().paginate(page, limit);
  }

  async show({ params }: HttpContext) {
    return User.findOrFail(params.id);
  }

  async store({ request, response }: HttpContext) {
    const data = await request.validateUsing(createUserValidator);
    const user = await User.create(data);
    return response.created(user);
  }

  async update({ params, request }: HttpContext) {
    const user = await User.findOrFail(params.id);
    const data = await request.validateUsing(updateUserValidator);
    user.merge(data);
    await user.save();
    return user;
  }

  async destroy({ params, response }: HttpContext) {
    const user = await User.findOrFail(params.id);
    await user.delete();
    return response.noContent();
  }
}
```

### Lucid ORM (Models and Migrations)

```typescript
// app/models/user.ts — Lucid model with relationships
import { DateTime } from "luxon";
import { BaseModel, column, hasMany } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";
import Post from "#models/post";

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: number;

  @column()
  declare email: string;

  @column()
  declare name: string;

  @column({ serializeAs: null })  // Never include in JSON
  declare password: string;

  @hasMany(() => Post)
  declare posts: HasMany<typeof Post>;

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime;

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime;
}
```

```bash
# Generate migration
node ace make:migration create_users_table

# Run migrations
node ace migration:run

# Rollback
node ace migration:rollback
```

### VineJS Validation

```typescript
// app/validators/user.ts — Request validation with VineJS
import vine from "@vinejs/vine";

export const createUserValidator = vine.compile(
  vine.object({
    email: vine.string().email().unique(async (db, value) => {
      const user = await db.from("users").where("email", value).first();
      return !user;  // Must not exist
    }),
    name: vine.string().minLength(2).maxLength(100),
    password: vine.string().minLength(8).confirmed(),  // password + password_confirmation
  })
);

export const updateUserValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(2).maxLength(100).optional(),
    email: vine.string().email().optional(),
  })
);
```

### Authentication

```typescript
// config/auth.ts — Auth config (sessions + API tokens)
import { defineConfig } from "@adonisjs/auth";
import { sessionGuard, sessionUserProvider } from "@adonisjs/auth/session";
import { tokensGuard, tokensUserProvider } from "@adonisjs/auth/access_tokens";

export default defineConfig({
  default: "web",
  guards: {
    web: sessionGuard({ useRememberMeTokens: true, provider: sessionUserProvider({ model: () => import("#models/user") }) }),
    api: tokensGuard({ provider: tokensUserProvider({ model: () => import("#models/user"), tokens: "accessTokens" }) }),
  },
});
```

```typescript
// app/controllers/auth_controller.ts
export default class AuthController {
  async login({ request, auth, response }: HttpContext) {
    const { email, password } = request.only(["email", "password"]);
    const user = await User.verifyCredentials(email, password);
    await auth.use("web").login(user);
    return response.redirect("/dashboard");
  }

  async apiToken({ request, auth }: HttpContext) {
    const { email, password } = request.only(["email", "password"]);
    const user = await User.verifyCredentials(email, password);
    const token = await User.accessTokens.create(user);
    return { token: token.toJSON() };
  }
}
```

## Examples

### Example 1: Full CRUD web application

**User prompt:** "Build a blog with AdonisJS — posts CRUD, user auth, and server-rendered pages."

The agent will scaffold an AdonisJS web app with Lucid models (User, Post), authentication middleware, VineJS validation, and Edge templates for the views.

### Example 2: REST API with token auth

**User prompt:** "Create a REST API with AdonisJS, API token authentication, and pagination."

The agent will set up API routes, access token guard, JSON responses with pagination, and Japa tests.

## Guidelines

- **Use `node ace` for everything** — generators, migrations, REPL, deployment
- **Controllers stay thin** — move business logic to services
- **VineJS for all input** — never trust `request.body()` directly
- **`serializeAs: null`** — exclude sensitive fields (password) from JSON serialization
- **Lucid relations are lazy** — use `.preload()` or `.query().preload()` to eager load
- **Migrations are sequential** — don't modify old migrations; create new ones
- **Auth middleware** — `router.get('/dashboard').use(middleware.auth())` 
- **Testing with Japa** — built-in test runner, no Jest needed
- **Deploy**: `node ace build` → run `build/server.js` in production
