---
name: function-calling
description: >-
  Function calling (tool use) lets an LLM request calls to your own functions
  while your code runs them and returns the results in a loop. Covers the
  OpenAI Responses API, the Anthropic Messages API, parallel calls, tool_choice,
  strict schemas and error handling. Use when building AI agents with tools,
  letting LLMs query APIs or databases, or creating agentic workflows.
license: Apache-2.0
compatibility: "OpenAI API, Anthropic API, Python 3.10+, Node.js 22+ (current openai package)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["function-calling", "tool-use", "llm", "agents", "anthropic"]
  use-cases:
    - "Build an AI assistant that can query a database and send emails"
    - "Create a multi-step agent that searches the web and summarizes results"
    - "Let an LLM call your internal APIs to fetch and update data"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Function Calling

## Overview

Function calling (also called tool use) lets an LLM ask your code to run functions. The model never executes anything itself: it returns a tool call (name plus JSON arguments), your code runs it, and you send the result back so the model can continue. Both big providers work this way; only the message shapes differ.

The flow is always:
1. Define tools with JSON schemas.
2. Send the conversation plus the tool definitions.
3. If the response contains tool calls, execute each one.
4. Append the model's turn and all the results to the conversation, call again.
5. Stop when the response has no tool calls (the final text answer).

OpenAI now recommends the Responses API (`client.responses.create`) for new code; Chat Completions is still supported and its older shape (`tools=[{"type":"function","function":{...}}]`, `role: "tool"` messages) appears in many tutorials. Model ids change often: read them from the provider's model list and keep them in configuration, not in code.

## Instructions

### Shared: tool implementations

```python
# tools.py
import json

def get_weather(city: str, unit: str | None = "celsius") -> dict:
    # Replace with a real weather API call. Strict schemas send null for omitted optionals.
    unit = unit or "celsius"
    return {"city": city, "temperature": 22 if unit == "celsius" else 72,
            "unit": unit, "conditions": "Partly cloudy"}

def send_email(to: str, subject: str, body: str) -> dict:
    # Replace with your mail provider; keep side effects behind a confirmation in real use.
    return {"success": True, "message_id": "msg_8f3a21"}

def search_database(query: str, limit: int = 5) -> dict:
    # Replace with a real product search.
    products = [{"name": "Ceramic mug 350 ml", "sku": "MUG-350", "price_usd": 14.5}]
    return {"results": products[:limit]}

TOOL_MAP = {"get_weather": get_weather, "send_email": send_email,
            "search_database": search_database}

def execute_tool(name: str, arguments: dict) -> str:
    """Always returns a string; errors become data the model can react to."""
    if name not in TOOL_MAP:
        return json.dumps({"error": f"Unknown tool: {name}"})
    try:
        return json.dumps(TOOL_MAP[name](**arguments))
    except Exception as e:
        return json.dumps({"error": str(e)})
```

### OpenAI (Responses API)

Tools are flat objects. With `strict: true` the arguments always match the schema; strict mode needs `additionalProperties: false` and every property listed in `required` (make optional fields nullable with `["string", "null"]`).

```python
# openai_agent.py
import json, os
from openai import OpenAI
from tools import execute_tool

client = OpenAI()
MODEL = os.environ["OPENAI_MODEL"]   # a current tool-capable model from the OpenAI model list

tools = [
    {
        "type": "function",
        "name": "get_weather",
        "description": "Get current weather for a city. Use when the user asks about weather or temperature.",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "City name, e.g. 'Tokyo, Japan'"},
                "unit": {"type": ["string", "null"], "enum": ["celsius", "fahrenheit", None]},
            },
            "required": ["city", "unit"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "send_email",
        "description": "Send an email to one recipient. Only call after the user asked for an email.",
        "parameters": {
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Recipient email address"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["to", "subject", "body"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]

def run_agent(user_message: str, max_iterations: int = 10) -> str:
    input_items = [{"role": "user", "content": user_message}]
    for _ in range(max_iterations):
        response = client.responses.create(model=MODEL, input=input_items, tools=tools)
        input_items += response.output            # keep the model's items, including reasoning
        calls = [item for item in response.output if item.type == "function_call"]
        if not calls:
            return response.output_text
        for call in calls:                         # may be several in one turn
            result = execute_tool(call.name, json.loads(call.arguments))
            input_items.append({
                "type": "function_call_output",
                "call_id": call.call_id,
                "output": result,                  # a string
            })
    return "Max iterations reached"

print(run_agent("What's the weather in Tokyo? If it's over 20 C, email mika@tanaka-travel.jp a trip tip."))
```

Chat Completions equivalent: tools are `{"type": "function", "function": {"name", "description", "parameters", "strict"}}`, the loop appends `response.choices[0].message`, and each result is `{"role": "tool", "tool_call_id": call.id, "content": result}`.

`tool_choice`: `"auto"` (default, zero or more calls), `"required"` (at least one call), `{"type": "function", "name": "get_weather"}` (force one function), `"none"`.

### Anthropic (Messages API)

Tools use `input_schema`. The stop reason `tool_use` means the model wants calls executed; `end_turn` means it is done.

```python
# claude_agent.py
import os
import anthropic
from tools import execute_tool

client = anthropic.Anthropic()
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")

tools = [
    {
        "name": "search_database",
        "description": (
            "Search the product database by keyword. Returns matching products with "
            "name, SKU and price in USD. Use for any question about what we sell or "
            "what it costs. Does not return stock levels."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keywords, e.g. 'ceramic mug'"},
                "limit": {"type": "integer", "description": "Max results (1-20)", "default": 5},
            },
            "required": ["query"],
        },
    }
]

def run_claude_agent(user_message: str, max_iterations: int = 10) -> str:
    messages = [{"role": "user", "content": user_message}]
    for _ in range(max_iterations):
        response = client.messages.create(
            model=MODEL, max_tokens=4096, tools=tools, messages=messages
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            return "".join(b.text for b in response.content if b.type == "text")

        results = []
        for block in response.content:
            if block.type == "tool_use":
                output = execute_tool(block.name, block.input)
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output,
                    # "is_error": True,   # set when the tool failed so Claude can retry or explain
                })
        messages.append({"role": "user", "content": results})   # all results in ONE user message
    return "Max iterations reached"
```

Rules that cause 400 errors when broken: every `tool_use` block needs a matching `tool_result` in the very next user message, and the `tool_result` blocks come first in that message (any text goes after them). `tool_choice` is `{"type": "auto"}`, `{"type": "any"}`, `{"type": "tool", "name": "..."}` or `{"type": "none"}`. Claude Opus 5.5, Sonnet 5.5 and Fable 5.1 reject `any` and `tool` with a 400; use `auto` plus `strict` instead. Add `"strict": true` to a tool definition to guarantee schema-valid input. The Anthropic SDKs also ship a tool runner that executes this loop for you; use it when you do not need to control every step.

### TypeScript (OpenAI Responses)

```typescript
// agent.ts
import OpenAI from "openai";

const client = new OpenAI();
const model = process.env.OPENAI_MODEL!;

const tools: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "get_stock_price",
    description: "Get the latest trade price in USD for a US-listed ticker symbol.",
    parameters: {
      type: "object",
      properties: { ticker: { type: "string", description: "Ticker, e.g. MSFT" } },
      required: ["ticker"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function getStockPrice(ticker: string): string {
  const prices: Record<string, number> = { AAPL: 231.4, MSFT: 462.1 };
  const price = prices[ticker.toUpperCase()];
  return JSON.stringify(price ? { ticker, price, currency: "USD" } : { error: "Ticker not found" });
}

export async function runAgent(query: string): Promise<string> {
  const input: OpenAI.Responses.ResponseInputItem[] = [{ role: "user", content: query }];
  for (let i = 0; i < 10; i++) {
    const response = await client.responses.create({ model, input, tools });
    input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]));
    const calls = response.output.filter((item) => item.type === "function_call");
    if (calls.length === 0) return response.output_text;
    for (const call of calls) {
      const args = JSON.parse(call.arguments);
      const output =
        call.name === "get_stock_price" ? getStockPrice(args.ticker) : JSON.stringify({ error: "Unknown tool" });
      input.push({ type: "function_call_output", call_id: call.call_id, output });
    }
  }
  return "Max iterations reached";
}
```

## Examples

**"Let the model look up weather and then email the result."** Register `get_weather` and `send_email`, run `run_agent(...)` from the OpenAI section. The model first returns a `get_weather` call; after you return the result it returns a `send_email` call only if the temperature condition holds, then a final text answer such as "It is 24 C in Tokyo, I emailed the trip tip." Expect two to three API round trips.

**"The model keeps calling the wrong tool."** Rewrite the descriptions: say what the tool returns, when to use it, and when not to (for example "Does not return stock levels"). Consolidate near-duplicate tools into one tool with an `action` enum, prefix names by service (`github_list_prs`), and (on OpenAI, or Claude models that allow forced tool use) use `tool_choice` to force a function while debugging.

**"A tool failed with a timeout."** Return `{"error": "timeout after 10 s"}` (and `is_error: true` on Anthropic). The model usually retries with different arguments or explains the failure; raising an exception inside the loop just kills the run.

## Guidelines

- Tool descriptions matter more than anything else: say what the tool does, when to use it, when not to, and what each parameter means. Three or four sentences is normal.
- Cap iterations (10 is plenty for most agents) and log every call and result.
- Return errors as data, not exceptions; return only the fields the model needs, since large results waste context.
- Validate arguments before running a tool even with strict schemas, and treat tool results (web pages, emails, file contents) as untrusted text that may contain instructions aimed at the model.
- Put a confirmation step or a dry-run mode in front of destructive or costly tools (send email, delete record, charge card). Never give the model raw shell or SQL write access without limits.
- Parallel calls: execute all calls from a turn and send all results back together. To force one call at a time, use `parallel_tool_calls=False` (OpenAI) or `disable_parallel_tool_use` inside `tool_choice` (Anthropic).
- Keep tool functions idempotent; agents retry.
- Do not use function calling when you only need structured output from one step; use the provider's structured-output (JSON schema) mode instead.
