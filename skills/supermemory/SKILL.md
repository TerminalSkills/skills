---
name: supermemory
description: >-
  Supermemory is a hosted memory and context API for AI agents: it extracts
  facts from conversations and documents, keeps a per-user profile, and
  returns the right context through search. Use when building assistants that
  remember users across sessions, adding long-term memory to a chatbot, wiring
  Supermemory into Claude Code or another MCP client, or syncing Notion,
  Google Drive or GitHub into a searchable knowledge base.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+; a Supermemory API key from console.supermemory.ai"
metadata:
  author: terminal-skills
  version: "1.3.0"
  category: data-ai
  tags: ["memory", "ai-agents", "rag", "personalization", "supermemory"]
  repository: https://github.com/supermemoryai/supermemory
---

# Supermemory

## Overview

Supermemory is a memory and context layer for AI agents. You send it conversations, documents, files or URLs; it extracts facts into a per-namespace memory graph, maintains a profile (static facts and recent context), and answers searches over both memories and document chunks. Everything is scoped by a **namespace** (a user, project or tenant id; v3 and v4 called it a container tag), which is the isolation boundary.

This skill targets the **v5 SDKs** (`supermemory` 5.0.2 on npm, 5.0.0 on PyPI; 5.0.1 and 5.0.2 only add to the API, nothing from 5.0.0 changed). v5 is namespace-first: the namespace is the first positional argument of every call, and everything else goes in one options object. Snippets written for 4.x (`client.add({ content, containerTag, customId })`, `q`, `filters`, `client.memories.add`, `client.connections.create`) do not compile against v5. The 4.x to 5 mapping is in `node_modules/supermemory/MIGRATION.md`.

## Instructions

### Install and authenticate

```bash
npm install supermemory      # or: pip install supermemory
export SUPERMEMORY_API_KEY="sm_..."   # create in console.supermemory.ai, API Keys
```

The client reads `SUPERMEMORY_API_KEY` from the environment, so `new Supermemory()` is enough (the import is the named export `import { Supermemory } from "supermemory"`). Client options were renamed in v5: `baseUrl`, `timeoutInSeconds` (seconds, not ms), `headers`, `maxRetries`. Errors are `SupermemoryError` subclasses (`NotFoundError`, `UnauthorizedError`, `PaymentRequiredError`, ...) with `statusCode` and `body`; timeouts throw `SupermemoryTimeoutError`.

For a browser or per-tenant client, mint a key limited to one namespace instead of shipping the org key: `POST https://api.supermemory.ai/v3/auth/scoped-key` with the org key as Bearer token and a body of `containerTag` (still called that), optional `expiresInDays` (1 to 365), `rateLimitMax`. Its documented endpoint allowlist names the v3/v4 routes, so confirm a scoped key works against the v5 calls you use before relying on it.

### Ingest: conversations and documents

`add` returns at once with `{ id, status: "queued" }`; processing is asynchronous. Send a whole session under a stable `id` rather than one-line "memories"; re-sending with the same `id` processes only the new part.

```typescript
import { Supermemory } from "supermemory";
const client = new Supermemory();

const conv = await client.add("user_4f8a", {
  content: "user: I moved our API from Express to Fastify last week.\nassistant: Nice, how did the migration go?",
  id: "chat_2026-10-02_a91",
  metadata: { type: "conversation" },
  dreaming: "instant", // optional: extract memories right away (costs one extra operation)
});

// knowledge you only want searchable, not remembered
await client.add("user_4f8a", {
  content: "# Runbook\nRestart the worker with `systemctl restart ingest-worker`.",
  id: "doc_runbook",
  taskType: "superrag",
});
```

Other `add` fields: `supportingContext` (guides extraction, max 1500 characters), `group` (an object of metadata values that separates related context inside a namespace), `date` (ISO 8601 date of the source). `content` may also be a URL. Files: `client.documents.uploadFile("user_4f8a", { file: await openAsBlob("handbook.pdf") })` (`openAsBlob` from `node:fs`); several texts at once: `client.documents.batchAdd(namespace, { documents })`. Python uses snake_case keywords: `client.add("user_4f8a", content=..., id=..., task_type="superrag")`.

Poll `(await client.documents.get("user_4f8a", conv.id)).system` until `status` is `done` (or `failed`) before searching. With the default `dreaming: "dynamic"`, memories may form later than that, because related documents are batched; since 5.0.2 the same object carries `dreamingStatus` (`"dreaming"` or `"done"`), so wait for that too when you need the extracted memories, not just the document chunks.

### Search and profile

```typescript
const results = await client.search("user_4f8a", {
  query: "which web framework does the user run",
  searchMode: "hybrid", // "hybrid" (default) | "memories" | "chunks"
  limit: 5,
});
for (const r of results.results) console.log(r.memory ?? r.chunk, r.similarity);

const { profile } = await client.profile("user_4f8a");
console.log(profile.static.map(m => m.memory), profile.dynamic.map(m => m.memory));
```

`profile` takes no query in v5 and its items are objects with `id` and `memory`; run a separate `search` for query-specific context. Other search options: `threshold` (0 to 1, default now 0.3), `rerank` (`"none"`, `"order"`, `"aggregate"`), `rewriteQuery`, `include` (`{ related: true }` adds the version history of a memory, `{ documents: true }` the source document) and a typed `filter` (`{ field: "type", operator: "eq", value: "meeting" }`, or `{ operator: "and", operands: [...] }`). Python: `client.search("user_4f8a", query=..., search_mode="hybrid")` and `client.profile("user_4f8a").profile.static`.

### Use it in a chat loop

```typescript
import Anthropic from "@anthropic-ai/sdk";
const claude = new Anthropic();

async function reply(userId: string, sessionId: string, message: string) {
  const [{ profile }, found] = await Promise.all([
    client.profile(userId),
    client.search(userId, { query: message, limit: 5 }),
  ]);
  const context = [
    ...profile.static.map(m => m.memory),
    ...profile.dynamic.map(m => m.memory),
    ...found.results.map(r => r.memory ?? r.chunk ?? ""),
  ];
  const res = await claude.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 1024,
    system: `Known about this user:\n${context.map(c => `- ${c}`).join("\n")}`,
    messages: [{ role: "user", content: message }],
  });
  const answer = res.content[0].type === "text" ? res.content[0].text : "";
  await client.add(userId, { content: `user: ${message}\nassistant: ${answer}`, id: `chat_${sessionId}` });
  return answer;
}
```

### Correct or remove a memory

There is no `memories.add` or `updateMemory` in v5: change the source by re-adding or updating the document (`client.documents.update(namespace, id, {...})`). Remove recall with `client.memories.forget(namespace, { ids: ["mem_..."] })`, or preview a natural-language forget first: `client.memories.forgetMatching(namespace, { query: "old pricing plans", dryRun: true })`. `client.documents.delete(namespace, { ids: [...] })` permanently deletes documents. Browse with `client.list(namespace, "documents" | "memories", { limit, filter })`; forgotten and expired memories are hidden unless you pass `include: { forgotten: true }` (memories only).

### Connectors

Providers: `notion`, `google-drive`, `gmail`, `onedrive`, `github`, `web-crawler`, `s3`, `granola`. Creating a connector returns an authorization link the user must open (null for providers that authenticate with config only).

```typescript
const conn = await client.connectors.create("team_support", {
  provider: "notion",
  redirectUrl: "https://app.brewline.dev/settings/connected",
  documentLimit: 5000,
});
console.log(conn.authorization?.url); // send the user here; sync starts after approval
```

Manage them with `connectors.list(namespace)`, `listAll()`, `get`, `update` (selection, `documentLimit`), `sync(namespace, id)` and `delete(namespace, id, { deleteDocuments: false })` (documents are deleted by default). Connected documents come back through normal `search` in `hybrid` or `chunks` mode. Free includes no connectors; Pro adds Google Drive, OneDrive, Notion and Granola, Max adds Gmail, Scale adds GitHub, S3 and the web crawler.

### MCP and coding agents

The hosted MCP server is `https://mcp.supermemory.ai/mcp` and uses OAuth, so no API key goes in the config. Claude Desktop and claude.ai: Settings, Connectors, add a custom connector with that URL. Cursor (`~/.cursor/mcp.json`):

```json
{ "mcpServers": { "supermemory": { "url": "https://mcp.supermemory.ai/mcp" } } }
```

Tools: `search_memory`, `get_profile`, `add_memory`, `forget_memory`, `list_documents`, `get_document`, `list_memories`, `list_spaces`, `who_am_i`. `add_memory` and `forget_memory` act on the active space unless you pass `namespace`. For Claude Code there is also a plugin: `/plugin marketplace add supermemoryai/claude-supermemory`, then `/plugin install supermemory`, with `SUPERMEMORY_CC_API_KEY` set in the shell. The npm package ships a `supermemory` CLI too (`npx supermemory`, with `login`, `add`, `search`, `docs list`).

## Examples

### Example 1: "Make my support bot remember each customer between chats"

Install `supermemory`, set `SUPERMEMORY_API_KEY`, and call the `reply` function above with the customer id as the namespace and the chat id as the document `id`. Day one the customer says they run Fastify on Hetzner; two weeks later they ask "why is my deploy slow?". `client.profile(customerId)` returns `static: [{ id: "mem_…", memory: "Runs a Fastify API on Hetzner" }]`, the system prompt carries it, and the answer skips the "what is your stack?" questions.

### Example 2: "Let the team search Notion together with past chats"

Create a `notion` connector in the `team_support` namespace (Pro plan or higher), open `conn.authorization.url`, approve, then ask:

```typescript
const r = await client.search("team_support", { query: "refund policy for annual plans", searchMode: "hybrid" });
```

Result: Notion page chunks appear with a `chunk` field and extracted facts from earlier conversations with a `memory` field, each with a `similarity` score.

## Guidelines

- Use one namespace per user or tenant; sharing a namespace mixes their memories.
- Use a stable `id` per conversation or document. Same-`id` updates bill only new tokens; a new id is billed in full.
- Prefer `dreaming: "dynamic"` in production; `"instant"` costs an extra operation per document and suits tests and setup.
- Use `taskType: "superrag"` for reference documents you do not need turned into memories.
- Billing is usage-based USD credits, not the old memory counts: Free includes $5 a month, Pro costs $19 (with $20 included), Max $100 ($130 included), Scale $399 ($600 included); see supermemory.ai/docs/overview/billing; search calls are metered per query (the v5 profile call currently is not) and metered calls return 402 when the balance is empty.
- Content sent to Supermemory is stored on a third-party service. For sensitive data check the security page, or run it locally with `npx supermemory local` (v5 SDKs need server 0.0.9 or later; it needs a model only for memory extraction).
- Keep the API key in an environment variable; use scoped keys for anything client-side.
- Not needed if all you want is a local note file or a plain vector store you already run.
