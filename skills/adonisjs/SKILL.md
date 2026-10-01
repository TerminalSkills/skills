---
name: adonisjs
description: >-
  Builds full-stack web applications with AdonisJS — a batteries-included Node.js
  framework with ORM, auth, validation, and mailer built-in. Use when someone
  asks to "build a web app with Node.js", "Laravel for Node.js", "full-stack
  Node framework", "AdonisJS", "batteries-included backend", or "Node.js with
  built-in ORM and auth". Covers Lucid ORM, auth (sessions, tokens, social),
  VineJS validation, Edge templates, and deployment.
license: Apache-2.0
compatibility: "AdonisJS 7: Node.js 24+, npm 11+. TypeScript."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["nodejs", "framework", "orm", "auth", "full-stack"]
  repository: https://github.com/adonisjs/core
---

# AdonisJS

## Overview

AdonisJS is a full-stack Node.js framework — the "Laravel of Node.js." Unlike Express/Fastify where you assemble everything from packages, AdonisJS ships with an ORM (Lucid), authentication, validation (VineJS), mailer, queues, and testing out of the box. Opinionated, TypeScript-first, and production-ready.

This skill targets **AdonisJS 7** (`@adonisjs/core` 7.x, Lucid 22, Auth 10, VineJS 4), which requires Node.js 24. Version 7 changed the starter kits, generates Lucid schema classes from migrations, and adds a controllers barrel file and transformers — v6 snippets found online often no longer match.

## When to Use

- Building a complete web application (not just an API) with Node.js
- Want an opinionated framework with conventions (like Rails/Laravel)
- Need built-in auth (sessions, API tokens, social OAuth)
- Database-driven applications with migrations and models
- Teams that prefer convention over configuration

## Instructions

### Setup

```bash
node -v                                   # must be v24 or later
npm create adonisjs@latest bookshelf -- --kit=hypermedia
cd bookshelf
node ace serve --hmr                      # http://localhost:3333
```

Starter kits (`--kit`): `hypermedia` (Edge templates + Alpine.js), `react` and `vue` (Inertia), `api` (JSON API with access-token auth), `api-monorepo`. The v6 alias `--kit=web` no longer exists. Every kit comes with Lucid on SQLite, a `users` table, and working signup/login. `node ace serve --watch` restarts the whole process instead of using HMR.

### Routes and Controllers

```typescript
// start/routes.ts
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'   // barrel file, regenerated when `node ace serve`/`test` starts or by `node ace codegen`

router.resource('posts', controllers.Posts).only(['index', 'show'])
router
  .group(() => {
    router.resource('posts', controllers.Posts).only(['store', 'update', 'destroy'])
  })
  .use(middleware.auth())                 // unauthenticated visitors are redirected to /login
```

Controller routes get names automatically (`posts.index`, `posts.show`, …); list them with `node ace list:routes`. The v6 style `const PostsController = () => import('#controllers/posts_controller')` still works.

```typescript
// app/controllers/posts_controller.ts — node ace make:controller posts --resource
import type { HttpContext } from '@adonisjs/core/http'
import Post from '#models/post'
import { createPostValidator, updatePostValidator } from '#validators/post'

export default class PostsController {
  async index({ request, view }: HttpContext) {
    const page = request.input('page', 1)
    const posts = await Post.query().preload('author').orderBy('createdAt', 'desc').paginate(page, 20)
    return view.render('pages/posts/index', { posts })
  }

  async show({ params, view }: HttpContext) {
    const post = await Post.findOrFail(params.id)   // 404 when the row is missing
    await post.load('author')
    return view.render('pages/posts/show', { post })
  }

  async store({ request, auth, response }: HttpContext) {
    const payload = await request.validateUsing(createPostValidator)
    const post = await auth.getUserOrFail().related('posts').create(payload)
    return response.redirect().toRoute('posts.show', { id: post.id })
  }

  async update({ params, request, response }: HttpContext) {
    const post = await Post.findOrFail(params.id)
    await post.merge(await request.validateUsing(updatePostValidator)).save()
    return response.redirect().toRoute('posts.show', { id: post.id })
  }

  async destroy({ params, response }: HttpContext) {
    await (await Post.findOrFail(params.id)).delete()
    return response.redirect().toRoute('posts.index')
  }
}
```

### Lucid ORM (Models and Migrations)

Lucid 22 is migrations-first: columns are defined in the migration, and `node ace migration:run` regenerates `database/schema.ts` with one typed schema class per table. Models extend that class and add only relationships, hooks and methods. Never edit `database/schema.ts` by hand.

```bash
node ace make:model post -m      # app/models/post.ts + database/migrations/1790874006726_create_posts_table.ts
node ace migration:run           # creates the table, regenerates database/schema.ts
node ace migration:rollback      # undo the last batch
```

```typescript
// database/migrations/1790874006726_create_posts_table.ts — inside up()
this.schema.createTable(this.tableName, (table) => {
  table.increments('id')
  table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
  table.string('title').notNullable()
  table.text('body').notNullable()
  table.timestamp('created_at').notNullable()
  table.timestamp('updated_at').nullable()
})
```

```typescript
// app/models/post.ts — PostSchema already declares id, userId, title, body, createdAt, updatedAt
import { PostSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class Post extends PostSchema {
  @belongsTo(() => User)
  declare author: BelongsTo<typeof User>
}
```

In `app/models/user.ts` add the inverse: `@hasMany(() => Post) declare posts: HasMany<typeof Post>` (import `hasMany` from `@adonisjs/lucid/orm`). A model may still extend `BaseModel` and declare `@column()` fields itself.

### VineJS Validation

```typescript
// app/validators/post.ts — node ace make:validator post
import vine from '@vinejs/vine'

export const createPostValidator = vine.create({
  title: vine.string().trim().minLength(3).maxLength(120),
  body: vine.string().trim().minLength(20),
})
export const updatePostValidator = vine.create({
  title: vine.string().trim().minLength(3).maxLength(120).optional(),
  body: vine.string().trim().minLength(20).optional(),
})
```

`vine.create({...})` is shorthand for `vine.compile(vine.object({...}))`. Lucid adds database rules, for example `vine.string().email().unique({ table: 'users', column: 'email' })`; confirm a password with `passwordConfirmation: vine.string().sameAs('password')`. When validation fails, `request.validateUsing()` throws: form posts are redirected back with errors flashed to the session, JSON clients get `422` with an `errors` array.

### Authentication

```typescript
// config/auth.ts (api kit) — a token guard and a session guard side by side
import { defineConfig } from '@adonisjs/auth'
import { sessionGuard, sessionUserProvider } from '@adonisjs/auth/session'
import { tokensGuard, tokensUserProvider } from '@adonisjs/auth/access_tokens'

const authConfig = defineConfig({
  default: 'api',
  guards: {
    api: tokensGuard({
      provider: tokensUserProvider({ tokens: 'accessTokens', model: () => import('#models/user') }),
    }),
    web: sessionGuard({
      useRememberMeTokens: false,
      provider: sessionUserProvider({ model: () => import('#models/user') }),
    }),
  },
})
export default authConfig
```

```typescript
// app/models/user.ts — withAuthFinder hashes the password on save and adds verifyCredentials
// (compose: @adonisjs/core/helpers, hash: @adonisjs/core/services/hash,
//  withAuthFinder: @adonisjs/auth/mixins/lucid, DbAccessTokensProvider: @adonisjs/auth/access_tokens)
export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  static accessTokens = DbAccessTokensProvider.forModel(User, { expiresIn: '30 days' })
}

// Session login (hypermedia / Inertia kits)
const user = await User.verifyCredentials(email, password)
await auth.use('web').login(user)

// Access token (api kit) — the plain value is available only at creation
const token = await User.accessTokens.create(user)
return { token: token.value!.release() }       // "oat_…", sent as Authorization: Bearer
```

Protect routes with `.use(middleware.auth())` or `middleware.auth({ guards: ['api'] })`. Tokens are opaque and stored hashed in `auth_access_tokens`. Social login: `npm install @adonisjs/ally@6 && node ace configure @adonisjs/ally --providers=github` (Ally 6 is the AdonisJS 7 line; npm's `latest` tag currently resolves to 5.x for AdonisJS 6, so a bare `node ace add @adonisjs/ally` fails with ERESOLVE), then `ally.use('github').redirect()` and `await ally.use('github').user()` in the callback.

### Upgrading from v6

Node.js 24; replace `ts-node` with `@poppinss/ts-exec` in `ace.js`; add `hooks: { init: [indexEntities()] }` to `adonisrc.ts`; move the app key to `config/encryption.ts`; `router.makeUrl()` → `urlFor()`; `Request`/`Response` classes → `HttpRequest`/`HttpResponse`; flash key `errors.*` → `inputErrorsBag.*`. Full list: https://docs.adonisjs.com/v6-to-v7

## Examples

### Example 1: Full CRUD web application

**User prompt:** "Build a blog with AdonisJS — posts CRUD, user auth, and server-rendered pages."

```bash
npm create adonisjs@latest bookshelf -- --kit=hypermedia
cd bookshelf
node ace make:model post -m
node ace make:controller posts --resource
node ace make:validator post
# fill in the migration, model, validator, controller and routes shown above
node ace codegen && node ace migration:run   # codegen first: routes.ts needs controllers.Posts in the barrel
node ace serve --hmr
```

```edge
{{-- resources/views/pages/posts/index.edge --}}
<h1>Posts</h1>
<ul>
  @each(post in posts)
    <li>
      <a href="{{ urlFor('posts.show', { id: post.id }) }}">{{ post.title }}</a>
      by {{ post.author.fullName ?? post.author.email }}
    </li>
  @end
</ul>
<p>Total: {{ posts.total }}</p>
```

After signing up at `/signup` and posting the form to `/posts`, `GET /posts` renders `<a href="/posts/1">Why we moved to AdonisJS 7</a> by Maya Okafor` and `Total: 1`. Forms need the CSRF field — the kit's `@form` component adds it; in a hand-written form use `{{ csrfField() }}`.

### Example 2: REST API with token auth

**User prompt:** "Create a REST API with AdonisJS, API token authentication, and pagination."

```bash
npm create adonisjs@latest inventory -- --kit=api
cd inventory
node ace make:model product -m && node ace make:transformer product
node ace make:controller products --api && node ace make:validator product
node ace migration:run   # after adding sku, name, price_cents and stock columns to the new migration
```

```typescript
// start/routes.ts — inside the existing .prefix('/api/v1') group
router.resource('products', controllers.Products).apiOnly().use('*', middleware.auth())

// app/transformers/product_transformer.ts
export default class ProductTransformer extends BaseTransformer<Product> {
  toObject() { return this.pick(this.resource, ['id', 'sku', 'name', 'priceCents', 'stock']) }
}

// app/controllers/products_controller.ts
async index({ request, serialize }: HttpContext) {
  const products = await Product.query().orderBy('name').paginate(request.input('page', 1), 20)
  return serialize(ProductTransformer.paginate(products.all(), products.getMeta()))
}

async store({ request, response, serialize }: HttpContext) {
  const product = await Product.create(await request.validateUsing(createProductValidator))
  response.status(201)
  return serialize(ProductTransformer.transform(product))
}
```

```bash
API=http://localhost:3333/api/v1
curl -s -X POST $API/auth/signup -H 'Content-Type: application/json' \
  -d "{\"fullName\":\"Lena Fischer\",\"email\":\"lena@inventory.dev\",\"password\":\"$INVENTORY_PASSWORD\",\"passwordConfirmation\":\"$INVENTORY_PASSWORD\"}"
# {"data":{"token":"oat_…","user":{"id":1,"fullName":"Lena Fischer",…}}} — export the token as INVENTORY_TOKEN; POST $API/auth/login returns the same shape
curl -s -X POST $API/products -H "Authorization: Bearer $INVENTORY_TOKEN" -H 'Content-Type: application/json' -d '{"sku":"MUG-BLK-350","name":"Black mug 350 ml","priceCents":1290,"stock":48}'   # 201

curl -s "$API/products?page=1" -H "Authorization: Bearer $INVENTORY_TOKEN"
# {"data":[{"id":1,"sku":"MUG-BLK-350","name":"Black mug 350 ml","priceCents":1290,"stock":48}],
#  "metadata":{"total":1,"perPage":20,"currentPage":1,"lastPage":1,…}}
```

Without a token the API answers `401 {"errors":[{"message":"Unauthorized access"}]}`. In Japa tests (`node ace make:test products --suite=functional`, `node ace test functional`) authenticate with `client.get('/api/v1/products').loginAs(user)`.

## Guidelines

- **Use `node ace` for everything** — generators, migrations, REPL, build; `node ace add @adonisjs/mail` (or any official package) installs and configures it
- **Controllers stay thin** — move business logic to services
- **VineJS for all input** — never trust `request.body()` directly
- **`serializeAs: null`** — the generated `password` column already has it; use transformers to decide which fields an API returns
- **Lucid relations are lazy** — use `.preload()` or `model.load()`; transformers never query, so preload what they read
- **Migrations are sequential** — don't modify old migrations; create new ones. Production needs `node ace migration:run --force`. `migration:rollback --force` also runs there (it drops tables) unless `migrations.disableRollbacksInProduction: true` is set on the connection in `config/database.ts`
- **`make:model --controller` quirk** — in Lucid 22.4 it generates a transformer instead of a controller; run `make:controller` separately
- **CSRF** — the hypermedia kit enables CSRF protection (`config/shield.ts`), so POST/PUT/PATCH/DELETE requests without a token are rejected; the `api` kit ships with it disabled
- **Secrets** — `APP_KEY` and database credentials live in `.env`, validated in `start/env.ts`; `.env` is not copied into the build
- **Testing with Japa** — built-in test runner, no Jest needed
- **Deploy**: `node ace build`, then `cd build && npm ci --omit=dev && node bin/server.js` with `NODE_ENV=production`
