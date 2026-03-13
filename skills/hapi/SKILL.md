---
name: hapi
description: >-
   You are an expert in Hapi.js, the configuration-centric enterprise
  framework for Node.js. You help developers build production APIs with
  built-in input validation (Joi), authentication strategies, plugin
  architecture, caching, rate limiting, and comprehensive request lifecycle
  hooks — designed for teams that need structure, security, and testability
  without third-party middleware sprawl.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - node
    - web-framework
    - enterprise
    - validation
    - auth
    - api
    - plugins
---

# Hapi — Enterprise Node.js Framework

You are an expert in Hapi.js, the configuration-centric enterprise framework for Node.js. You help developers build production APIs with built-in input validation (Joi), authentication strategies, plugin architecture, caching, rate limiting, and comprehensive request lifecycle hooks — designed for teams that need structure, security, and testability without third-party middleware sprawl.

## Core Capabilities

### Server and Routes

```typescript
import Hapi from "@hapi/hapi";
import Joi from "joi";

const server = Hapi.server({ port: 3000, host: "0.0.0.0",
  routes: { cors: { origin: ["*"], credentials: true }, validate: { failAction: "error" } },
});

// Route with built-in validation
server.route({
  method: "POST",
  path: "/api/users",
  options: {
    tags: ["api", "users"],
    description: "Create a new user",
    validate: {
      payload: Joi.object({
        name: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required(),
        role: Joi.string().valid("user", "admin").default("user"),
      }),
    },
    response: {
      schema: Joi.object({
        id: Joi.string().uuid(),
        name: Joi.string(),
        email: Joi.string(),
        role: Joi.string(),
        createdAt: Joi.date(),
      }),
    },
    auth: "jwt",
  },
  handler: async (request, h) => {
    const user = await db.users.create(request.payload);
    return h.response(user).code(201);
  },
});

// Auth strategy
await server.register(require("@hapi/jwt"));
server.auth.strategy("jwt", "jwt", {
  keys: process.env.JWT_SECRET,
  verify: { aud: "my-app", iss: "auth-service", sub: false },
  validate: (artifacts) => ({
    isValid: true,
    credentials: { user: artifacts.decoded.payload },
  }),
});
server.auth.default("jwt");

// Plugin
const usersPlugin: Hapi.Plugin<{}> = {
  name: "users",
  version: "1.0.0",
  register: async (server) => {
    server.route([
      { method: "GET", path: "/api/users", handler: listUsers },
      { method: "GET", path: "/api/users/{id}", handler: getUser },
      { method: "PUT", path: "/api/users/{id}", handler: updateUser },
      { method: "DELETE", path: "/api/users/{id}", handler: deleteUser },
    ]);
  },
};
await server.register(usersPlugin);

await server.start();
```

## Installation

```bash
npm install @hapi/hapi @hapi/joi @hapi/jwt @hapi/inert @hapi/vision
```

## Best Practices

1. **Joi validation** — Validate all input (params, query, payload, headers) at the route level; rejects bad input before handler
2. **Plugins for modularity** — Group related routes/logic into plugins; each plugin is self-contained and testable
3. **Auth strategies** — Register auth strategies (JWT, cookie, OAuth) via plugins; apply per-route or as default
4. **Response validation** — Validate outgoing responses in development; catches schema drift early
5. **Server methods** — Use `server.method()` for cached, shared functions; built-in caching with TTL
6. **Lifecycle hooks** — Use `onPreAuth`, `onPreHandler`, `onPostHandler` for cross-cutting concerns (logging, metrics)
7. **Error handling** — Use `@hapi/boom` for HTTP errors; consistent error format across all routes
8. **Testing** — Use `server.inject()` for integration tests; no HTTP overhead, test routes directly
