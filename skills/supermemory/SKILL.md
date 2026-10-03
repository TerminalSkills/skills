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
compatibility: "Node.js 18+ or Python 3.9+; a Supermemory API key from console.supermemory.ai"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["memory", "ai-agents", "rag", "personalization", "supermemory"]
  repository: https://github.com/supermemoryai/supermemory
---

# Supermemory

## Overview

Supermemory is a memory and context layer for AI agents. You send it conversations, documents, files or URLs; it extracts facts into a per-container memory graph, maintains a profile (static facts and recent context), and answers searches over both memories and document chunks. Everything is scoped by a `containerTag` (a user, project or tenant id), which is the isolation boundary.

The API changed since early SDK examples. Old snippets use `client.memories.add`, `client.users.getProfile`, `userId` and `includeConnectors`; none of these exist in the current SDKs (`supermemory` 4.x on npm, 3.x on PyPI). Current calls are top-level `client.add`, `client.search`, `client.profile`, with `containerTag` / `container_tag`. Checked against the TypeScript SDK 4.25.4 and the Python SDK 3.62.0.

## Instructions

### Install and authenticate

```bash
npm install supermemory      # or: pip install supermemory
export SUPERMEMORY_API_KEY="sm_..."   # create in console.supermemory.ai, API Keys
```

The client reads `SUPERMEMORY_API_KEY` from the environment, so `new Supermemory()` is enough. For a browser or per-tenant client, mint a scoped key restricted to one `containerTag` (`POST /v3/auth/scoped-key`, `expiresInDays` 1 to 365) instead of shipping the org key.

### Ingest: conversations and documents

`add` returns at once with `status: "queued"`; processing is asynchronous. Send a whole session under a stable `customId` rather than one-line "memories"; re-sending with the same `customId` processes only the new part.

```typescript
import Supermemory from "supermemory";
const client = new Supermemory();

const conv = await client.add({
  content: "user: I moved our API from Express to Fastify last week.\nassistant: Nice, how did the migration go?",
  containerTag: "user_4f8a",
  customId: "chat_2026-10-02_a91",
  metadata: { type: "conversation" },
  dreaming: "instant", // optional: extract memories now (costs one extra operation)
});

// knowledge you only want searchable, not remembered (about 5x cheaper per token)
await client.add({
  content: "# Runbook\nRestart the worker with `systemctl restart ingest-worker`.",
  containerTag: "user_4f8a",
  customId: "doc_runbook",
  taskType: "superrag",
});
```

Files: `client.documents.uploadFile({ file: fs.createReadStream("handbook.pdf"), containerTag: "user_4f8a" })`. Python uses `container_tag`, `custom_id`, `task_type`.

Wait for `client.documents.get(id).status` to reach `done` (or `failed`) before searching. By default (`dreaming: "dynamic"`) memories may form later than `done`, because related documents are batched.

### Search and profile

```typescript
const results = await client.search({
  q: "which web framework does the user run",
  containerTag: "user_4f8a",
  searchMode: "hybrid", // "memories" (default) | "documents" | "hybrid"
  limit: 5,
});
for (const r of results.results) console.log(r.memory ?? r.chunk, r.similarity);

const { profile } = await client.profile({ containerTag: "user_4f8a", q: "deployment" });
console.log(profile.static, profile.dynamic); // long-term facts, recent context
```

Other search options: `threshold` (0 to 1, default 0.5), `rerank`, `rewriteQuery`, metadata `filters` (`{ AND: [{ key: "type", value: "meeting" }] }`). In Python the search call is `client.search.memories(q=..., container_tag=..., search_mode="hybrid")` and the profile call is `client.profile(container_tag=...)`, with `result.profile.static`.

### Use it in a chat loop

```typescript
import Anthropic from "@anthropic-ai/sdk";
const claude = new Anthropic();

async function reply(userId: string, sessionId: string, message: string) {
  const { profile, searchResults } = await client.profile({ containerTag: userId, q: message });
  const context = [...profile.static, ...profile.dynamic, ...(searchResults?.results ?? []).map(r => r.memory ?? r.chunk)];
  const res = await claude.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 1024,
    system: `Known about this user:\n${context.map(c => `- ${c}`).join("\n")}`,
    messages: [{ role: "user", content: message }],
  });
  const answer = res.content[0].type === "text" ? res.content[0].text : "";
  await client.add({
    content: `user: ${message}\nassistant: ${answer}`,
    containerTag: userId,
    customId: `chat_${sessionId}`,
  });
  return answer;
}
```

### Correct or remove a memory

`client.memories.updateMemory({ containerTag, newContent })` writes a new version and keeps the old one with `isLatest=false`; `client.memories.forget({ containerTag, ... })` soft-deletes. `client.documents.delete(id)` removes a document.

### Connectors

Supported providers: `notion`, `google-drive`, `gmail`, `onedrive`, `github`, `web-crawler`, `s3`. Creating a connection returns an OAuth link the user must open.

```typescript
const conn = await client.connections.create("notion", {
  redirectUrl: "https://app.brewline.dev/settings/connected",
  containerTag: "team_support",
  documentLimit: 5000,
});
console.log(conn.authLink); // redirect the user here; sync starts after approval
```

Connected documents are returned by normal `search` with `searchMode: "hybrid"` or `"documents"`; there is no `includeConnectors` flag. Some connectors are plan-gated (Gmail from Max, S3 and web crawler from Scale).

### MCP and coding agents

The hosted MCP server is `https://mcp.supermemory.ai/mcp` and uses OAuth, so no API key goes in the config. Claude Desktop: Settings, Connectors, add a custom connector with that URL. Cursor (`~/.cursor/mcp.json`):

```json
{ "mcpServers": { "supermemory": { "url": "https://mcp.supermemory.ai/mcp" } } }
```

Tools exposed include `search_memory`, `get_profile`, `add_memory` (`action` of `save` or `forget`), `list_documents`, `list_memories` and `list_spaces`. The old `npx supermemory-mcp` stdio setup is no longer the documented route. For Claude Code there is a plugin: `/plugin marketplace add supermemoryai/claude-supermemory`, then `/plugin install supermemory`, with `SUPERMEMORY_CC_API_KEY` set in the shell.

## Examples

### Example 1: "Make my support bot remember each customer between chats"

Install `supermemory`, set `SUPERMEMORY_API_KEY`, and call the `reply` function above with the customer id as `containerTag` and the chat id as `customId`. Day one the customer says they run Fastify on Hetzner; two weeks later they ask "why is my deploy slow?". `client.profile` returns `static: ["Runs a Fastify API on Hetzner"]`, the system prompt carries it, and the answer skips the "what is your stack?" questions.

### Example 2: "Let the team search Notion together with past chats"

Create a `notion` connection with `containerTag: "team_support"`, open `conn.authLink`, approve, then ask:

```typescript
const r = await client.search({ q: "refund policy for annual plans", containerTag: "team_support", searchMode: "hybrid" });
```

Result: Notion page chunks appear with a `chunk` field and extracted facts from earlier conversations with a `memory` field, each with a `similarity` score.

## Guidelines

- Always set `containerTag` per user or tenant; omitting it mixes data across users.
- Use a stable `customId` per conversation or document. Same-`customId` updates bill only new tokens; a new id is billed in full.
- Prefer `dreaming: "dynamic"` in production; `"instant"` costs an extra operation per document and suits tests and setup.
- Use `taskType: "superrag"` for reference documents you do not need turned into memories.
- Billing is usage-based USD credits, not the old memory counts: Free includes $5 a month, Pro $19 (with $20 included), Max $100, Scale $399. Verify on supermemory.ai/pricing; search and profile calls are metered per query and return 402 when the balance is empty.
- Content sent to Supermemory is stored on a third-party service. For sensitive data check the security page, or run self-hosted Supermemory (`npx supermemory local`).
- Keep the API key in an environment variable; use scoped keys for anything client-side.
- Not needed if all you want is a local note file or a plain vector store you already run.
