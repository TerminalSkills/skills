---
name: a2a-sdk
description: >-
   You are an expert in the A2A (Agent-to-Agent) Protocol, Google's open
  standard for inter-agent communication. You help developers build agents
  that discover, communicate, and delegate tasks to other agents across
  organizations and platforms — with agent cards for capability discovery,
  task lifecycle management, streaming updates, and push notifications,
  enabling a web of interoperable AI agents.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - agent-to-agent
    - protocol
    - google
    - interoperability
    - multi-agent
    - api
---

# A2A SDK — Agent-to-Agent Protocol

You are an expert in the A2A (Agent-to-Agent) Protocol, Google's open standard for inter-agent communication. You help developers build agents that discover, communicate, and delegate tasks to other agents across organizations and platforms — with agent cards for capability discovery, task lifecycle management, streaming updates, and push notifications, enabling a web of interoperable AI agents.

## Core Capabilities

### Agent Card (Discovery)

```json
// .well-known/agent.json — Describes agent capabilities
{
  "name": "Invoice Processing Agent",
  "description": "Processes invoices, extracts data, and routes to accounting systems",
  "url": "https://invoices.example.com/a2a",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": true
  },
  "skills": [
    {
      "id": "extract-invoice",
      "name": "Extract Invoice Data",
      "description": "Extract structured data from PDF/image invoices",
      "tags": ["ocr", "extraction", "accounting"],
      "examples": ["Process this invoice and extract the total, vendor, and line items"]
    },
    {
      "id": "validate-invoice",
      "name": "Validate Invoice",
      "description": "Validate invoice data against PO and contracts",
      "tags": ["validation", "compliance"]
    }
  ],
  "authentication": {
    "schemes": ["bearer"]
  }
}
```

### A2A Server (Python)

```python
# server.py — A2A-compatible agent server
from a2a.server import A2AServer, TaskHandler
from a2a.types import Task, TaskState, Message, TextPart, DataPart

class InvoiceAgent(TaskHandler):
    async def on_message(self, task: Task, message: Message) -> Task:
        """Handle incoming task messages."""
        user_text = next(
            (p.text for p in message.parts if isinstance(p, TextPart)), ""
        )

        if "extract" in user_text.lower():
            # Process invoice
            task.state = TaskState.WORKING

            # Get attached file
            file_data = next(
                (p for p in message.parts if isinstance(p, DataPart)), None
            )

            if file_data:
                extracted = await self.extract_invoice(file_data.data)
                task.add_message(Message(
                    role="agent",
                    parts=[
                        TextPart(text=f"Extracted invoice data from {extracted['vendor']}"),
                        DataPart(
                            data=extracted,
                            mimeType="application/json",
                        ),
                    ],
                ))
                task.state = TaskState.COMPLETED
            else:
                task.add_message(Message(
                    role="agent",
                    parts=[TextPart(text="Please attach an invoice file (PDF or image).")],
                ))
                task.state = TaskState.INPUT_REQUIRED

        return task

    async def extract_invoice(self, file_data: bytes) -> dict:
        """OCR + LLM extraction pipeline."""
        text = await ocr_extract(file_data)
        structured = await llm_extract(text)
        return structured

server = A2AServer(handler=InvoiceAgent())
server.run(port=8080)
```

### A2A Client (Calling Other Agents)

```python
# client.py — Discover and call external agents
from a2a.client import A2AClient

# Discover agent capabilities
client = A2AClient("https://invoices.example.com")
agent_card = await client.get_agent_card()
print(f"Agent: {agent_card.name}")
print(f"Skills: {[s.name for s in agent_card.skills]}")

# Send task
task = await client.send_task(
    message=Message(
        role="user",
        parts=[
            TextPart(text="Extract data from this invoice"),
            DataPart(data=invoice_bytes, mimeType="application/pdf"),
        ],
    ),
)

# Poll for completion (or use streaming)
while task.state not in (TaskState.COMPLETED, TaskState.FAILED):
    task = await client.get_task(task.id)
    await asyncio.sleep(1)

# Get results
for msg in task.messages:
    for part in msg.parts:
        if isinstance(part, DataPart):
            print(f"Extracted data: {part.data}")

# Streaming
async for event in client.send_task_streaming(message=message):
    if event.type == "message":
        print(event.message.parts[0].text)
    elif event.type == "state_change":
        print(f"State: {event.state}")
```

### Multi-Agent Orchestration

```python
# orchestrator.py — Coordinate multiple A2A agents
async def process_invoice_pipeline(invoice_bytes: bytes):
    # Agent 1: Extract invoice data
    extractor = A2AClient("https://invoices.example.com")
    extraction_task = await extractor.send_task(
        message=Message(role="user", parts=[
            TextPart(text="Extract all data from this invoice"),
            DataPart(data=invoice_bytes, mimeType="application/pdf"),
        ]),
    )
    extracted_data = await wait_for_completion(extraction_task)

    # Agent 2: Validate against PO
    validator = A2AClient("https://validation.example.com")
    validation_task = await validator.send_task(
        message=Message(role="user", parts=[
            TextPart(text="Validate this invoice against purchase orders"),
            DataPart(data=extracted_data, mimeType="application/json"),
        ]),
    )
    validation_result = await wait_for_completion(validation_task)

    # Agent 3: Route to accounting
    if validation_result["valid"]:
        accounting = A2AClient("https://accounting.example.com")
        await accounting.send_task(
            message=Message(role="user", parts=[
                TextPart(text="Book this validated invoice"),
                DataPart(data=extracted_data, mimeType="application/json"),
            ]),
        )
```

## Installation

```bash
pip install a2a-sdk
# Or build from Google's spec: https://github.com/google/a2a-protocol
```

## Best Practices

1. **Agent cards** — Publish `/.well-known/agent.json` with clear skill descriptions; enables automatic discovery
2. **Task lifecycle** — Use proper states: SUBMITTED → WORKING → COMPLETED/FAILED/INPUT_REQUIRED
3. **Streaming** — Enable streaming for long tasks; clients get real-time progress updates
4. **Multi-part messages** — Use TextPart for instructions, DataPart for structured data/files; separate concerns
5. **Authentication** — Support bearer tokens; agents calling your agent need proper credentials
6. **Idempotent tasks** — Tasks have unique IDs; handle duplicate submissions gracefully
7. **Push notifications** — Configure push for async tasks; agent notifies client when complete
8. **Composable pipelines** — Chain agents: extraction → validation → booking; each agent is independent and reusable
