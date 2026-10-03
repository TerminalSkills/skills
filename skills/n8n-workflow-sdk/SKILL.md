---
name: n8n-workflow-sdk
description: >-
  Build n8n workflows as TypeScript code with the official @n8n/workflow-sdk
  package: define nodes and connections, validate them, convert between n8n
  JSON and SDK code, and push the result to an n8n instance. Use when a user
  asks to create n8n workflows programmatically, generate workflow JSON,
  version-control workflows, or let an AI agent write n8n workflows.
license: Sustainable Use License
compatibility: 'Node.js 20+, TypeScript or modern JavaScript; an n8n instance and API key to deploy'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags:
    - n8n
    - workflow
    - automation
    - sdk
    - typescript
  repository: https://github.com/n8n-io/n8n
---

# n8n Workflow SDK

## Overview

`@n8n/workflow-sdk` is n8n's own TypeScript SDK (it lives in `packages/@n8n/workflow-sdk` of the n8n monorepo). You declare nodes with a few factory functions, wire them with `.add()` / `.to()`, and get standard n8n workflow JSON. It validates workflows, turns existing JSON into SDK code (`generateWorkflowCode`) and parses SDK code back into JSON (`parseWorkflowCode`). Checked against 0.34.2 (1 October 2026; a `beta` tag 0.35.x also exists). The package is pre-1.0 and changes weekly, so pin an exact version.

The API is generic: there are no per-node helpers such as `httpRequest()` or `code()` and no `new WorkflowBuilder()`. Every node is `node({ type, version, config })`, and the node's `type` and `version` come from n8n (copy them from an exported workflow or `generateWorkflowCode`).

## Instructions

### Install

```bash
npm install --save-exact @n8n/workflow-sdk@0.34.2
```

### Building blocks

```typescript
import {
  workflow, node, trigger, ifElse, switchCase, merge, splitInBatches, nextBatch,
  languageModel, memory, tool, outputParser, newCredential, fromAi,
  expr, nodeJson, sticky,
} from '@n8n/workflow-sdk';
```

- `trigger({ type, version, config })` starts a workflow; `node(...)` is any other node; `config` holds `name`, `parameters`, `credentials`, `position`, flags such as `executeOnce`.
- `workflow('id', 'Name').add(trigger).to(nodeA).to(nodeB)` builds the graph; call `.add(otherTrigger)` again for another entry point.
- `ifElse({ version, config })` gives `.onTrue(x)` / `.onFalse(y)`; `switchCase(...)` gives `.onCase(0, x)`; `merge(...)` takes branches via `.input(0)` / `.input(1)`; `splitInBatches(...)` gives `.onEachBatch(...)` and `.onDone(...)`, and the loop body ends with `nextBatch(loopNode)`.
- `expr('{{ $json.email }}')` marks an n8n expression; `nodeJson(someNode, 'body.userId')` reads a field from a specific earlier node.
- AI nodes: build `languageModel`, `memory`, `tool`, `outputParser` instances and attach them in `subnodes: { model, memory, tools: [...], outputParser }` on the agent node.
- Credentials are never embedded: `newCredential('OpenAI account')` is a placeholder you bind in n8n.

### A branching workflow

```typescript
// workflows/lead-routing.ts
import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const intake = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'New Lead', parameters: { httpMethod: 'POST', path: 'new-lead', responseMode: 'onReceived' } },
});

const isHot = ifElse({
  version: 2.2,
  config: {
    name: 'Score >= 80?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.body.score }}'), operator: { type: 'number', operation: 'gte' }, rightValue: 80 }],
        combinator: 'and',
      },
    },
  },
});

const notifySales = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: { name: 'Notify Sales', parameters: { method: 'POST', url: 'https://hooks.acme-crm.io/sales', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.body) }}') } },
});

const addToNurture = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: { name: 'Add To Nurture', parameters: { method: 'POST', url: 'https://hooks.acme-crm.io/nurture' } },
});

export const leadRouting = workflow('lead-routing', 'Lead Routing')
  .add(intake)
  .to(isHot.onTrue(notifySales).onFalse(addToNurture));
```

`leadRouting.validate()` returns `{ valid, errors, warnings }`; `leadRouting.toJSON()` returns `{ id, name, nodes, connections, settings }`. The `ifElse` conditions object must include `options`, `conditions` and `combinator`.

### An AI agent with memory and a tool

```typescript
const support = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'Support Message', parameters: { httpMethod: 'POST', path: 'support', responseMode: 'lastNode' } } });

const model = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', version: 1.3,
  config: { name: 'OpenAI Chat Model', parameters: { model: { __rl: true, mode: 'list', value: 'gpt-4o-mini' } },
            credentials: { openAiApi: newCredential('OpenAI account') } } });

const mem = memory({ type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: 1.3,
  config: { name: 'Window Memory',
            parameters: { sessionIdType: 'customKey', sessionKey: nodeJson(support, 'body.userId'), contextWindowLength: 20 } } });

const lookup = tool({ type: 'n8n-nodes-base.httpRequestTool', version: 4.3,
  config: { name: 'Lookup Account',
            parameters: { toolDescription: 'Look up a customer account by email',
                          url: expr('https://api.acme-saas.io/accounts/{{ $fromAI("email", "Customer email") }}') } } });

const agent = node({ type: '@n8n/n8n-nodes-langchain.agent', version: 3.1,
  config: { name: 'Support Agent',
            parameters: { promptType: 'define', text: expr('{{ $json.body.message }}'),
                          options: { systemMessage: 'You are a concise support agent. Call Lookup Account before answering billing questions.' } },
            subnodes: { model, memory: mem, tools: [lookup] } } });

export const supportAgent = workflow('support-agent', 'Support Agent').add(support).to(agent);
```

Sub-nodes (memory, model, tools, parsers) have no normal predecessor, so `expr('{{ $json... }}')` in them is rejected by the validator; reference the source node with `nodeJson(support, 'path')` instead.

### Batch loop

```typescript
const loop = splitInBatches({ version: 3, config: { name: 'Batches of 50', parameters: { batchSize: 50 } } });

export const enrichment = workflow('enrichment', 'Contact Enrichment')
  .add(nightly)                        // a scheduleTrigger 1.3 declared with trigger(...)
  .to(getPending)
  .to(loop.onDone(finish).onEachBatch(enrichContact.to(saveContact).to(nextBatch(loop))));
```

An empty list simply skips the loop, so do not guard it with an IF node or `alwaysOutputData`. When a node should run once rather than per input item, set `executeOnce: true` in its config.

### Convert JSON and code, validate in CI

```typescript
// tools/roundtrip.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorkflowCode, parseWorkflowCode, validateWorkflow } from '@n8n/workflow-sdk';

const exported = JSON.parse(readFileSync('exports/lead-routing.json', 'utf8'));
writeFileSync('workflows/lead-routing.sdk.ts', generateWorkflowCode(exported));   // JSON -> SDK code

const json = parseWorkflowCode(readFileSync('workflows/lead-routing.sdk.ts', 'utf8')); // code -> JSON
const result = validateWorkflow(json);
if (!result.valid) {
  console.error(result.errors.map((e) => `${e.code}: ${e.message}`).join('\n'));
  process.exit(1);
}
```

`parseWorkflowCode` reads a restricted subset of TypeScript (the code is interpreted, not run): `const` only, no imports, loops, arrow functions, `new`, or named exports, and a single `export default`. Real modules with imports are fine when you just execute them and call `.toJSON()`.

### Deploy through the n8n public API

Create an API key in n8n (Settings, n8n API). The create endpoint rejects unknown fields, so send only `name`, `nodes`, `connections` and `settings`, then publish (what v1 called activate; `POST /workflows/{id}/activate` is deprecated).

```typescript
// deploy.ts (Node 20+, run as an ES module)
import { leadRouting } from './workflows/lead-routing';

const base = `${process.env.N8N_URL}/api/v1`;
const headers = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': process.env.N8N_API_KEY! };
const { name, nodes, connections, settings } = leadRouting.toJSON();

const created = await fetch(`${base}/workflows`, { method: 'POST', headers, body: JSON.stringify({ name, nodes, connections, settings }) });
if (!created.ok) throw new Error(`create failed: ${created.status} ${await created.text()}`);
const { id } = await created.json();

const published = await fetch(`${base}/workflows/${id}/publish`, { method: 'POST', headers, body: '{}' });
if (!published.ok) throw new Error(`publish failed: ${published.status}`);
console.log(`Published ${name} as ${id}`);
```

Credentials referenced by `newCredential()` must exist in n8n and be selected there before a workflow that uses them can run.

## Examples

### Example 1: "Generate a webhook workflow that routes hot leads to sales"

Save the branching workflow above as `workflows/lead-routing.ts` and run:

```bash
npx tsx -e "import('./workflows/lead-routing.ts').then(m => console.log(m.leadRouting.validate(), m.leadRouting.toJSON().nodes.map(n => n.name)))"
```

Output: `{ valid: true, errors: [], warnings: [] }` and `[ 'New Lead', 'Score >= 80?', 'Notify Sales', 'Add To Nurture' ]`. Then run `deploy.ts` to create and publish it.

### Example 2: "Move our exported n8n workflows into git as code"

```bash
npm install --save-exact @n8n/workflow-sdk@0.34.2 tsx
npx tsx tools/roundtrip.ts
```

Each exported JSON becomes a readable `trigger(...)`/`node(...)` file with positions; reviewers see parameter changes in a normal diff, and the CI step fails when `validateWorkflow` reports an error such as `UNSAFE_MEMORY_SESSION_KEY_EXPRESSION`.

## Guidelines

- Pre-1.0 and fast-moving: pin the exact version, re-run validation after every upgrade, and treat `type`/`version` pairs as data from your own n8n version (node versions differ between n8n releases).
- Always run `validate()` or `validateWorkflow()` before deploying; it catches wrong parameters, unsafe `$json` in sub-nodes and missing `conditions` fields. Warnings such as a missing agent system message are worth fixing too.
- Keep runtime logic in nodes (Set, Filter, IF, Code) or inside `expr('{{ ... }}')`; builder code only describes the graph.
- Never put API keys or tokens into node parameters; use n8n credentials and `$env` or the credential store.
- The licence is the Sustainable Use License (source-available, not open source): fine for internal business use, restricted for resale or hosting it for others. Check the terms before building a product on it.
- The SDK produces workflow definitions only; it does not run them. Execution happens in n8n.
