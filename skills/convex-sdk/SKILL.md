---
name: convex-sdk
category: Cloud & Serverless
tags: [backend, database, realtime, typescript, serverless, reactive, baas]
version: 1.0.0
author: terminal-skills
---

# Convex — Reactive Backend-as-a-Service

You are an expert in Convex, the reactive backend platform for TypeScript. You help developers build real-time applications with a built-in database, serverless functions, file storage, authentication, scheduled jobs, and automatic real-time sync to React/Next.js clients — replacing REST APIs, WebSocket servers, and database management with a single reactive backend that pushes updates to clients automatically.

## Core Capabilities

### Schema and Functions

```typescript
// convex/schema.ts — Type-safe database schema
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatar: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  messages: defineTable({
    body: v.string(),
    userId: v.id("users"),
    channelId: v.id("channels"),
  }).index("by_channel", ["channelId"]),

  channels: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
  }),
});
```

```typescript
// convex/messages.ts — Server functions
import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";

// Query: automatically reactive — clients re-render when data changes
export const list = query({
  args: { channelId: v.id("channels"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .take(args.limit ?? 50);

    // Enrich with user data
    return Promise.all(
      messages.map(async (msg) => {
        const user = await ctx.db.get(msg.userId);
        return { ...msg, author: user?.name ?? "Unknown" };
      }),
    );
  },
});

// Mutation: transactional write
export const send = mutation({
  args: { body: v.string(), channelId: v.id("channels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    return ctx.db.insert("messages", {
      body: args.body,
      userId: user!._id,
      channelId: args.channelId,
    });
    // All clients subscribed to `list` query automatically get the new message!
  },
});

// Action: call external APIs (not transactional)
export const summarizeChannel = action({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(api.messages.list, {
      channelId: args.channelId,
      limit: 100,
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: `Summarize: ${messages.map(m => m.body).join("\n")}` }],
      }),
    });

    const data = await response.json();
    return data.choices[0].message.content;
  },
});
```

### React Client

```tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function Chat({ channelId }: { channelId: string }) {
  // Automatically re-renders when messages change (any user sends a message)
  const messages = useQuery(api.messages.list, { channelId });
  const sendMessage = useMutation(api.messages.send);
  const [input, setInput] = useState("");

  return (
    <div>
      {messages?.map((msg) => (
        <div key={msg._id}>
          <strong>{msg.author}</strong>: {msg.body}
        </div>
      ))}
      <form onSubmit={(e) => {
        e.preventDefault();
        sendMessage({ body: input, channelId });
        setInput("");
      }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

## Installation

```bash
npm create convex@latest
npx convex dev                            # Local development with hot reload
npx convex deploy                         # Production deployment
```

## Best Practices

1. **Queries are reactive** — `useQuery` auto-subscribes to data changes; no manual refetch, polling, or WebSocket setup
2. **Mutations are transactional** — Database writes in mutations are ACID; no partial updates on failure
3. **Actions for external calls** — Use actions (not mutations) for API calls, file uploads; mutations must be deterministic
4. **Indexes for performance** — Define indexes in schema for query patterns; Convex enforces indexed queries only
5. **Type safety end-to-end** — Schema → functions → client all type-checked; change schema, TypeScript catches issues
6. **Scheduled functions** — Use `ctx.scheduler.runAfter()` for delayed tasks; `crons.ts` for recurring jobs
7. **File storage** — Use `ctx.storage.store()` for file uploads; generates signed URLs, handles CDN automatically
8. **Auth integration** — Built-in support for Clerk, Auth0, custom JWT; `ctx.auth.getUserIdentity()` in any function
