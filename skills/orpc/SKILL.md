---
name: orpc
description: >-
  oRPC is a TypeScript framework for building end-to-end type-safe APIs: you write server procedures with Zod schemas and get a typed client, an RPC endpoint, a REST endpoint and an OpenAPI document with no code generation. Use when asked to "build a type-safe API", "tRPC alternative with OpenAPI", "contract-first TypeScript API", "generate an OpenAPI spec from my router", or "share types between server and client".
license: Apache-2.0
compatibility: "Node.js 20+, TypeScript 5+, Zod 4"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "typescript, rpc, openapi, zod, type-safe-api"
  repository: https://github.com/middleapi/orpc
---
# oRPC — Type-safe APIs with typed client and OpenAPI

## Overview
oRPC lets you declare procedures (input schema, output schema, handler) and group them into a router. From that one router you get a client whose types are inferred from the server (like tRPC), a REST-style handler with real HTTP verbs and paths, and an OpenAPI 3.1 document. A contract-first mode (`@orpc/contract`) lets you publish the API shape separately from its implementation.

Verified with `@orpc/server`, `@orpc/client`, `@orpc/contract`, `@orpc/openapi`, `@orpc/openapi-client` and `@orpc/zod` 1.16.1 with Zod 4.6; the examples below type-check with `tsc --noEmit` and ran against a local Node server.

## Instructions

### Install
```bash
npm install @orpc/server @orpc/client zod
npm install @orpc/openapi @orpc/zod        # REST handler + OpenAPI generation
npm install @orpc/contract @orpc/openapi-client   # only for contract-first work
npm install --save-dev typescript tsx @types/node
```
Use ES modules (`"type": "module"` in `package.json`) and `"moduleResolution": "Bundler"` or `"NodeNext"` in `tsconfig.json`; the packages expose sub-path exports such as `@orpc/server/node` and `@orpc/client/fetch`.

### Define procedures and a router
```typescript
// src/router.ts
import { ORPCError, os } from '@orpc/server'
import * as z from 'zod'

const Book = z.object({ isbn: z.string(), title: z.string(), priceCents: z.number().int() })

export const listBooks = os
  .route({ method: 'GET', path: '/books', summary: 'List books' })
  .input(z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }))
  .output(z.array(Book))
  .handler(async ({ input }) =>
    [{ isbn: '9780131103627', title: 'The C Programming Language', priceCents: 4999 }].slice(0, input.limit),
  )

export const getBook = os
  .route({ method: 'GET', path: '/books/{isbn}', summary: 'Get one book' })
  .input(z.object({ isbn: z.string() }))
  .output(Book)
  .handler(async ({ input }) => {
    if (input.isbn !== '9780131103627') throw new ORPCError('NOT_FOUND', { message: 'No such book' })
    return { isbn: input.isbn, title: 'The C Programming Language', priceCents: 4999 }
  })

export const router = { books: { list: listBooks, get: getBook } }
export type AppRouter = typeof router
```
`.route()` only matters for the REST/OpenAPI handler; the RPC handler ignores it. Use `z.coerce.number()` for numeric inputs that arrive in the query string, because query values are strings and the REST handler returned a 400 "Input validation failed" for a plain `z.number()` when tested.

### Serve it over Node's http module
```typescript
// src/server.ts
import { createServer } from 'node:http'
import { RPCHandler } from '@orpc/server/node'
import { OpenAPIHandler } from '@orpc/openapi/node'
import { router } from './router'

const rpc = new RPCHandler(router)
const rest = new OpenAPIHandler(router)

const server = createServer(async (req, res) => {
  if ((await rpc.handle(req, res, { prefix: '/rpc' })).matched) return
  if ((await rest.handle(req, res, { prefix: '/api' })).matched) return
  res.statusCode = 404
  res.end('Not found')
})

server.listen(4000, '127.0.0.1')
```
Handlers also exist for fetch-style runtimes (`@orpc/server/fetch`, `@orpc/openapi/fetch`) and for Fastify (`@orpc/openapi/fastify`). Pass per-request context (for example the authenticated user) as `{ prefix, context }` in the second argument of `handle`.

### Call it with a typed client
```typescript
// src/client.ts
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { AppRouter } from './router'

const link = new RPCLink({ url: 'http://127.0.0.1:4000/rpc' })
const client: RouterClient<AppRouter> = createORPCClient(link)

const books = await client.books.list({ limit: 5 })
console.log(books[0].title)
```
Import the router type with `import type` so no server code ends up in the client bundle. Renaming a field in `Book` now produces a compile error here.

### Generate the OpenAPI document
```typescript
// src/spec.ts
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { router } from './router'

const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] })
const spec = await generator.generate(router, {
  info: { title: 'Bookshop API', version: '1.0.0' },
  servers: [{ url: '/api' }],
})
console.log(JSON.stringify(spec, null, 2))
```
Run with `npx tsx src/spec.ts > openapi.json`. The output is OpenAPI 3.1 with `operationId` values such as `books.list`. Feed it to a viewer like Scalar. `@orpc/zod/zod4` is the converter for Zod 4.

### Contract-first (optional)
Define the shape once, implement it elsewhere, and let non-TypeScript or separate packages consume it.
```typescript
// src/contract.ts
import { oc } from '@orpc/contract'
import * as z from 'zod'

export const contract = {
  books: {
    find: oc
      .route({ method: 'GET', path: '/books/{isbn}' })
      .input(z.object({ isbn: z.string() }))
      .output(z.object({ isbn: z.string(), title: z.string() })),
  },
}
export type Contract = typeof contract
```
```typescript
// src/impl.ts
import { implement } from '@orpc/server'
import { contract } from './contract'

const os = implement(contract)

export const router = os.router({
  books: { find: os.books.find.handler(async ({ input }) => ({ isbn: input.isbn, title: 'SICP' })) },
})
```
A consumer that only has the contract can call the REST endpoint with full types:
```typescript
import { createORPCClient } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { contract } from './contract'
import type { Contract } from './contract'

const link = new OpenAPILink(contract, { url: 'http://127.0.0.1:4000/api' })
const client: ContractRouterClient<Contract> = createORPCClient(link)
console.log(await client.books.find({ isbn: '9780262510875' }))
```
Serve the implementation with the same `OpenAPIHandler` shown above.

### Type-check
```bash
npx tsc --noEmit
```
Run it after every router change; the compiler is the main safety net for client/server drift.

## Examples

### Example 1: Typed API for an existing Node service
**Request:** "Add a type-safe API for books to our service and give the frontend a client."

Install the packages, create `src/router.ts` and `src/server.ts` as above, start with `npx tsx src/server.ts`, then use `src/client.ts` in the frontend. Result: `client.books.get({ isbn: '0000' })` rejects with an error whose `code` is `NOT_FOUND` and `status` is 404, and `client.books.list({ limit: 5 })` resolves to a typed array.

### Example 2: Publish an OpenAPI spec for partner teams
**Request:** "Partners want REST docs for the same endpoints."

```bash
npx tsx src/spec.ts > openapi.json
curl -s "http://127.0.0.1:4000/api/books?limit=1"
```
Result: `openapi.json` lists `GET /books` and `GET /books/{isbn}` with schemas taken from the Zod definitions; the curl call returns `[{"isbn":"9780131103627","title":"The C Programming Language","priceCents":4999}]`, and an unknown ISBN returns 404 with `{"defined":false,"code":"NOT_FOUND",...}`.

### Example 3: Contract shared between repos
**Request:** "The mobile team's TypeScript app should call our API without importing our server code."

Publish `contract.ts` in a small package, implement it with `implement(contract)` on the server, and have the mobile app use `OpenAPILink` plus `ContractRouterClient` as shown. Result: the mobile app is type-checked against the contract only.

## Guidelines
- Always define `.input()` and `.output()` with schemas; output validation catches handler bugs before they reach clients.
- Throw `ORPCError` with a standard code (`NOT_FOUND`, `UNAUTHORIZED`, `BAD_REQUEST`) instead of plain `Error`; plain errors become opaque 500s.
- REST inputs come from path, query and body: the handler merges them into one object, and query values are strings, so coerce numbers and booleans.
- Use `import type` for the router in client code, and keep `@orpc/server` out of browser bundles.
- Put authentication in middleware or in the `context` passed to `handle`, not in each procedure.
- Zod, Valibot and ArkType are supported through separate converter packages for OpenAPI output (`@orpc/zod`, `@orpc/valibot`, `@orpc/arktype`); install the one that matches your schemas.
- Keep the OpenAPI `servers` URL equal to the handler prefix, or generated clients will call the wrong path.
- Pick plain tRPC if you only need an internal TypeScript client and already have it; pick oRPC when you also need REST endpoints, OpenAPI output or a contract-first workflow.
- Bind test servers to `127.0.0.1`, and do not expose the RPC endpoint publicly without authentication and CORS rules.
