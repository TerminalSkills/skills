---
name: openui
description: >-
  OpenUI is an MIT-licensed generative UI framework: the model writes a compact line-based language (OpenUI Lang) that names components from a library you define, and a streaming renderer shows them as tokens arrive in React, Vue, Svelte or Angular. Use when asked to "let the LLM answer with charts, forms and tables instead of markdown", "add generative UI to my chat app", "generate a system prompt from my component library", or "render streamed model output as live components". Not the older wandb/openui mockup tool.
license: Apache-2.0
compatibility: "Node.js 20+, React 18 or 19 and zod 3.25+ or 4 (React runtime); works with any LLM that streams text"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "generative-ui, react, llm, streaming, components"
  repository: https://github.com/thesysdev/openui
---

# OpenUI — let the model answer with real components

## Overview

OpenUI (github.com/thesysdev/openui, by Thesys, MIT licence) lets an LLM reply with an interface instead of text. You register the components the model may use, OpenUI turns that library into a system prompt, the model answers in OpenUI Lang, and a renderer draws the components progressively while the answer streams.

OpenUI Lang is one statement per line, with positional arguments: `root = Page([a, b])`, `a = OrderStatus("A-1042", "shipped", 2)`. Because the model can only call components you registered, the output cannot inject markup or unknown elements.

The open-source pieces run with any model and any backend, with no account:

- `@openuidev/react-lang` (1.1.0): `defineComponent`, `createLibrary`, `Renderer`. Vue, Svelte and Angular have their own `@openuidev/*-lang` packages.
- `@openuidev/lang-core` (1.1.0): framework-free parsing and `generateSystemPrompt`, usable on any Node or edge backend.
- `@openuidev/react-ui` (0.18.5): ready-made component libraries (`openuiLibrary`, `openuiChatLibrary`) and chat layouts, plus styles.
- `@openuidev/cli` (0.6.3): `openui create`, `openui generate`.

There is also an optional hosted service from Thesys, OpenUI Gateway, with a free tier and paid plans (an API key from the Thesys console). The project scaffolded by `openui create` is wired to it and asks for a Gateway key afterwards. This skill covers only the self-run path, which needs no Gateway.

## Instructions

### Install

```bash
npm install @openuidev/react-lang @openuidev/react-ui zod react react-dom
npm install @openuidev/lang-core        # backend only: system prompt from a spec
npm install -D @openuidev/cli           # the `openui` command
```

Component schemas use Zod 4 through the subpath `zod/v4`. For the built-in components, import the stylesheet once, for example in `app/globals.css`:

```css
@import "@openuidev/react-ui/styles/index.css";
```

### Define components and a library

`props` is a Zod object. The key order is the positional argument order the model must use, and each `.describe()` text is shown to the model.

```tsx
// src/lib/openui.tsx
import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";

const OrderStatus = defineComponent({
  name: "OrderStatus",
  description: "Delivery status of one order",
  props: z.object({
    orderId: z.string().describe("Order number, e.g. A-1042"),
    status: z.enum(["packed", "shipped", "delivered"]),
    etaDays: z.number().optional().describe("Days until delivery"),
  }),
  component: ({ props }) => (
    <div>
      Order {props.orderId}: {props.status}
      {props.etaDays !== undefined ? ` (arrives in ${props.etaDays} days)` : ""}
    </div>
  ),
});

const Page = defineComponent({
  name: "Page",
  description: "Vertical container for the whole answer",
  props: z.object({ children: z.array(OrderStatus.ref) }),
  component: ({ props, renderNode }) => <section>{renderNode(props.children)}</section>,
});

export const library = createLibrary({ root: "Page", components: [Page, OrderStatus] });
```

`root` names the component the program's `root = ...` statement calls. `X.ref` lets a parent accept child components of that type.

### Generate the system prompt

Frontend or full-stack route that can import the library:

```ts
const systemPrompt = library.prompt({
  preamble: "You show order tracking for a web shop.",
  additionalRules: ["Never invent order numbers."],
});
```

For a backend that must not import React, export a spec once and build the prompt from it:

```bash
npx openui generate src/lib/openui.tsx --spec --out src/lib/openui.spec.json --no-interactive
```

With `--spec`, the file given to `--out` is the spec. Without `--spec`, `--out` receives a ready-made prompt and the spec lands next to it as `<name>.spec.json`. `--export <name>` picks the library export if auto-detection fails; `--prompt-options <name>` picks an exported `PromptOptions`. Regenerate whenever the components change. Then:

```ts
import { generateSystemPrompt, type LibrarySpec } from "@openuidev/lang-core";
import spec from "./openui.spec.json";

export const system = generateSystemPrompt({
  library: spec as unknown as LibrarySpec,
  promptOptions: { preamble: "You show order tracking for a web shop." },
});
```

Do not pass `cloud: true`; that variant only emits a configuration block for the hosted Gateway.

### Stream from the model

Any provider works as long as the system message is the generated prompt and the response is streamed as text. With the OpenAI SDK, forwarding only the text deltas (`OPENAI_API_KEY` comes from the OpenAI dashboard):

```ts
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const { messages } = await req.json();
  const completion = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    stream: true,
    messages: [{ role: "system", content: system }, ...messages],
  });
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) controller.enqueue(encoder.encode(delta));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

### Render and handle actions

`response` is the text received so far. Keep `isStreaming` true until the stream closes: it makes the renderer tolerate half-written statements and disables form input meanwhile.

```tsx
"use client";
import { BuiltinActionType, Renderer, type ActionEvent } from "@openuidev/react-lang";
import { library } from "@/lib/openui";

function toModelMessage(event: ActionEvent) {
  const lines = [`User clicked: ${event.humanFriendlyMessage}`];
  if (event.formState) lines.push(`Form values: ${JSON.stringify(event.formState)}`);
  return lines.join("\n");
}

export function AssistantMessage(props: {
  content: string;
  isStreaming: boolean;
  onSend: (text: string) => void;
}) {
  return (
    <Renderer
      response={props.content}
      library={library}
      isStreaming={props.isStreaming}
      onError={(errors) => console.warn(errors)}
      onAction={(e) => {
        if (e.type === BuiltinActionType.ContinueConversation) props.onSend(toModelMessage(e));
        else if (e.type === BuiltinActionType.OpenUrl)
          window.open(String(e.params?.url), "_blank", "noopener,noreferrer");
      }}
    />
  );
}
```

Without `onAction`, buttons and forms in the generated UI do nothing. Send the form values back to the model in the next user turn (as above), otherwise it cannot see what the user entered.

### Use the built-in library instead of writing components

```tsx
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui";

const systemPrompt = openuiLibrary.prompt({
  ...openuiPromptOptions,
  preamble: "You are a revenue analyst.",
});
// render with <Renderer library={openuiLibrary} ... />
```

It contains Stack, Card, TextContent, Form, FormControl, Input, Select, Button(s), Tabs, Table/Col, BarChart and more. `openuiChatLibrary` is the variant for chat surfaces. `library.extend({ add: [MyComponent] })` derives a library with your own components added (`override` and `remove` also exist).

### Scaffold a whole app

```bash
npx @openuidev/cli@latest create --name order-assistant --no-interactive --no-install
```

This creates a Next.js agent project (default backend framework `langgraph`; see `--backend-framework`, and `-e <example>` for examples listed in the repository's `examples/examples.json`). Scaffolding needs no account; the generated agent talks to the hosted Gateway and needs `openui generate-api-key`, which signs in to Thesys. The CLI sends anonymous usage analytics; pass `--no-telemetry` or set `DO_NOT_TRACK=1` to opt out. `openui setup-agent` adds OpenUI instructions to a project's `AGENTS.md`.

## Examples

### Example 1: Revenue answers as a chart and a table, not markdown

Request: "Our analytics chatbot prints markdown tables. Make it answer 'compare Q3 revenue by region' with a chart and a table."

```bash
npm install @openuidev/react-lang @openuidev/react-ui zod react react-dom
```

```tsx
// src/lib/openui.tsx
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui";

export const library = openuiLibrary;
export const systemPrompt = library.prompt({
  ...openuiPromptOptions,
  preamble: "You are a revenue analyst. Answer with charts and tables built from the data given.",
});
```

The route uses `systemPrompt` as the system message and streams text deltas as shown above. The page renders `<Renderer response={text} library={library} isStreaming={loading} />` and imports `@openuidev/react-ui/styles/index.css` once. Result: while the model streams, a Stack with a BarChart and a Table appears piece by piece; the model's output is checked against the library, so a made-up component name is not rendered.

### Example 2: A custom component library with a generated backend prompt

Request: "Support bot should show order status cards. The API server is plain Node and must not import React."

```bash
npx openui generate src/lib/openui.tsx --out prompts/orders.txt --no-interactive
```

Output (paths printed by the CLI): the system prompt at `prompts/orders.txt` and the spec at `prompts/orders.spec.json`. The first lines of the prompt state the language rules; the signature lines list what the model may call:

```text
Page(children: OrderStatus[]) — Vertical container for the whole answer
OrderStatus(orderId: string, status: "packed" | "shipped" | "delivered", etaDays?: number) — Delivery status of one order
```

The server imports `orders.spec.json`, calls `generateSystemPrompt` from `@openuidev/lang-core` (see above), and the browser renders with the same `library`. A valid answer looks like:

```text
root = Page([a, b])
a = OrderStatus("A-1042", "shipped", 2)
b = OrderStatus("A-1043", "packed")
```

## Guidelines

- Keep the library and the prompt in sync: regenerate the spec or call `library.prompt()` after every component change, and use the same library definition on the server and in the browser.
- Prompt size grows with the library. Register only the components you want the model to use, and write short `description` and `.describe()` texts: they are the model's only documentation.
- Arguments are positional. Reordering keys in a Zod `props` object changes the language the model must write; do not reorder casually.
- Treat the output as untrusted input. The renderer only creates registered components, but your own components must still escape text and validate URLs they receive.
- Weaker models sometimes write invalid OpenUI Lang. Pass `onError`, show something sensible, and test with the model you will ship. The hosted Gateway can repair invalid output, but that is a paid service and not required.
- The library has a `Query`/`Mutation`, state (`$variables`) and edit-mode feature set that needs extra `promptOptions` (`tools`, `editMode`, `inlineMode`). This skill does not cover them; read the docs at openui.com/docs/openui-lang before using them.
- Do not confuse it with wandb/openui (a prompt-to-HTML mockup app); this is the Thesys project. The npm scope is `@openuidev`, not `@thesysai`.
- Choose OpenUI when you want a typed component catalog, streaming and a ready chat UI in one framework. Choose `ai-sdk` when you only need streaming and tool calling and will render tool results yourself; choose `a2ui` when you need a protocol that native clients (Flutter, mobile) render with their own catalog; `copilotkit` when the app is built around CopilotKit agents.
- Pin versions: the packages release often (react-ui and react-headless 0.18.x, cli 0.6.x, langchain 0.0.x).
