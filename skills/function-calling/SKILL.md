---
name: function-calling
description: >-
  Implement function/tool calling with LLMs — define tools, handle calls, and
  return results in a loop. Use when building AI agents with tools, letting LLMs
  interact with APIs or databases, creating agentic workflows, or enabling models
  to take real-world actions.
license: Apache-2.0
compatibility: "OpenAI API, Anthropic API, Python 3.9+, Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["function-calling", "tool-use", "llm", "openai", "anthropic", "agents"]
  use-cases:
    - "Build an AI assistant that can query a database and send emails"
    - "Create a multi-step agent that searches the web and summarizes results"
    - "Let an LLM call your internal APIs to fetch and update data"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Function Calling

## Overview

Function calling (also called tool use) lets LLMs invoke external functions to take actions or retrieve information. The model decides when and which tools to call; your code executes them and returns results. This enables true agentic workflows where the model can query databases, call APIs, perform calculations, and more.

## Core Concept

The flow is always:
1. Define tools with schemas
2. Send messages + tool definitions to the model
3. Model returns a tool call (name + arguments)
4. Your code executes the function
5. Return the result to the model
6. Model uses the result to continue reasoning
7. Repeat until the model returns a final text response

## OpenAI Function Calling

### Define and Register Tools

```python
from openai import OpenAI
import json

client = OpenAI()

# Define tool schemas
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a city. Returns temperature, conditions, and humidity.",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "City name, e.g. 'San Francisco, CA'"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"],
                        "description": "Temperature unit. Default: celsius"
                    }
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": "Send an email to a recipient.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"}
                },
                "required": ["to", "subject", "body"]
            }
        }
    }
]
```

### Implement Tool Functions

```python
def get_weather(city: str, unit: str = "celsius") -> dict:
    # In production, call a real weather API
    return {
        "city": city,
        "temperature": 22 if unit == "celsius" else 72,
        "unit": unit,
        "conditions": "Partly cloudy",
        "humidity": "65%"
    }

def send_email(to: str, subject: str, body: str) -> dict:
    # In production, use sendgrid/resend/smtp
    print(f"Sending email to {to}: {subject}")
    return {"success": True, "message_id": "msg_123"}

# Tool dispatcher
TOOL_MAP = {
    "get_weather": get_weather,
    "send_email": send_email,
}

def execute_tool(name: str, arguments: dict) -> str:
    if name not in TOOL_MAP:
        return json.dumps({"error": f"Unknown tool: {name}"})
    try:
        result = TOOL_MAP[name](**arguments)
        return json.dumps(result)
    except Exception as e:
        return json.dumps({"error": str(e)})
```

### Agent Loop

```python
def run_agent(user_message: str, max_iterations: int = 10) -> str:
    messages = [{"role": "user", "content": user_message}]

    for iteration in range(max_iterations):
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tools,
            tool_choice="auto"  # or "required" to force tool use
        )

        message = response.choices[0].message
        messages.append(message)  # Add assistant message to history

        # Check if we're done (no more tool calls)
        if message.tool_calls is None:
            return message.content

        # Execute all tool calls (may be parallel)
        for tool_call in message.tool_calls:
            name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)

            print(f"  → Calling {name}({args})")
            result = execute_tool(name, args)
            print(f"  ← Result: {result}")

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result
            })

    return "Max iterations reached"

# Run the agent
result = run_agent("What's the weather in Tokyo? If it's over 20°C, email weather@team.com with a trip recommendation.")
print(result)
```

## Anthropic Tool Use

```python
import anthropic
import json

client = anthropic.Anthropic()

# Anthropic tool schema format
tools = [
    {
        "name": "search_database",
        "description": "Search the product database by keyword. Returns matching products with prices.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (1-20)",
                    "default": 5
                }
            },
            "required": ["query"]
        }
    }
]

def run_claude_agent(user_message: str) -> str:
    messages = [{"role": "user", "content": user_message}]

    while True:
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            tools=tools,
            messages=messages
        )

        # Add assistant response to history
        messages.append({"role": "assistant", "content": response.content})

        # Check stop reason
        if response.stop_reason == "end_turn":
            # Extract final text response
            for block in response.content:
                if hasattr(block, "text"):
                    return block.text
            return ""

        if response.stop_reason == "tool_use":
            # Process all tool use blocks
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = execute_tool(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result
                    })

            messages.append({"role": "user", "content": tool_results})
```

## Parallel Tool Calls

OpenAI may call multiple tools simultaneously. Always handle them as a batch:

```python
# OpenAI returns multiple tool_calls in one response
# Execute them all, then return all results at once
if message.tool_calls:
    tool_results = []
    for tool_call in message.tool_calls:  # May have 2+ calls
        result = execute_tool(
            tool_call.function.name,
            json.loads(tool_call.function.arguments)
        )
        tool_results.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": result
        })
    messages.extend(tool_results)  # Add ALL results before next API call
```

## Streaming with Tool Calls

```python
from openai import OpenAI

client = OpenAI()

def stream_with_tools(user_message: str):
    messages = [{"role": "user", "content": user_message}]

    with client.chat.completions.stream(
        model="gpt-4o",
        messages=messages,
        tools=tools,
    ) as stream:
        for event in stream:
            chunk = event.choices[0].delta if event.choices else None
            if not chunk:
                continue

            # Stream text tokens
            if chunk.content:
                print(chunk.content, end="", flush=True)

            # Accumulate tool calls (streamed in pieces)
            if chunk.tool_calls:
                for tc in chunk.tool_calls:
                    # tc.function.arguments is a partial JSON string
                    pass  # Accumulate until stream ends

        # After stream completes, get the final message
        final = stream.get_final_message()
        if final.choices[0].message.tool_calls:
            # Process tool calls as usual
            pass
```

## TypeScript Example

```typescript
import OpenAI from "openai";

const client = new OpenAI();

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_stock_price",
      description: "Get the current stock price for a ticker symbol",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Stock ticker e.g. AAPL" },
        },
        required: ["ticker"],
      },
    },
  },
];

function getStockPrice(ticker: string): string {
  // Mock implementation
  const prices: Record<string, number> = { AAPL: 185.5, GOOGL: 141.2, MSFT: 378.9 };
  const price = prices[ticker.toUpperCase()];
  return JSON.stringify(price ? { ticker, price, currency: "USD" } : { error: "Not found" });
}

async function runAgent(query: string): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: query },
  ];

  while (true) {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
    });

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls?.length) return msg.content ?? "";

    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      const result = tc.function.name === "get_stock_price"
        ? getStockPrice(args.ticker)
        : JSON.stringify({ error: "Unknown tool" });

      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }
}
```

## Tool Schema Best Practices

```python
# Good tool schema — clear description, constrained parameters
{
    "name": "create_calendar_event",
    "description": "Create a calendar event. Use when the user wants to schedule a meeting, reminder, or appointment. Do NOT use for past events.",
    "parameters": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Event title, max 100 chars"
            },
            "start_time": {
                "type": "string",
                "description": "ISO 8601 datetime, e.g. '2025-03-15T14:00:00Z'"
            },
            "duration_minutes": {
                "type": "integer",
                "description": "Duration in minutes (15-480)",
                "minimum": 15,
                "maximum": 480
            },
            "attendees": {
                "type": "array",
                "items": {"type": "string", "format": "email"},
                "description": "List of attendee email addresses"
            }
        },
        "required": ["title", "start_time", "duration_minutes"]
    }
}
```

## Guidelines

- Write tool descriptions as if explaining to a smart but uninformed colleague — be specific about when to use and when NOT to use a tool
- Always handle the case where the model returns no tool calls (final answer)
- Cap iterations (10 is usually enough; infinite loops waste tokens and money)
- Log all tool calls and results for debugging
- Return errors as JSON `{"error": "message"}` — don't throw exceptions in tool functions
- For expensive tools (send email, delete record), add a confirmation step or dry-run mode
- Use `tool_choice: "required"` when you need the model to use tools, `"auto"` otherwise
- Keep tool functions idempotent when possible; agents may retry on failure
