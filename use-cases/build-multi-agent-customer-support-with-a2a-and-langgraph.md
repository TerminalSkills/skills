---
title: Build Multi-Agent Customer Support System with A2A and LangGraph
slug: build-multi-agent-customer-support-with-a2a-and-langgraph
description: Design a production customer support system where specialized AI agents (triage, billing, technical, escalation) communicate via Google's Agent-to-Agent protocol, orchestrated by a LangGraph supervisor that routes conversations based on intent and context.
skills:
- a2a-protocol
- langchain
- langgraph
category: data-ai
tags:
- multi-agent
- a2a
- langchain
- langgraph
- customer-support
---

# Build Multi-Agent Customer Support System with A2A and LangGraph

## The Problem

Dani is lead engineer at a 40-person SaaS company processing 2,000 support tickets daily. The current system is a single monolithic chatbot that handles everything — billing questions, technical issues, account management, refund requests. It works, but poorly. Billing questions get routed to a prompt stuffed with API documentation. Technical issues get answered with billing context. The team keeps adding more instructions to a single system prompt that's now 15,000 tokens long, and accuracy is dropping every week.

Dani decides to break the monolith into specialized agents that communicate via Google's Agent-to-Agent (A2A) protocol. Each agent is an expert in one domain. A LangGraph supervisor orchestrates the conversation, routing to the right specialist and managing handoffs when a conversation spans multiple domains.

## The Solution

Use the skills listed above to implement an automated workflow. Install the required skills:

```bash
npx terminal-skills install a2a-protocol langchain langgraph
```

## Step-by-Step Walkthrough

### Step 1: Define the Agent Architecture

The system has four specialist agents and one supervisor:

- **Triage Agent** — Classifies incoming messages, extracts intent and urgency
- **Billing Agent** — Handles subscription, payment, invoice, and refund queries
- **Technical Agent** — Resolves API errors, integration issues, and bug reports
- **Escalation Agent** — Manages cases that need human attention or cross-domain resolution

Each specialist exposes an A2A-compatible endpoint. The supervisor (built with LangGraph) decides which agent to call, passes context, and synthesizes responses.

```python
# agents/agent_card.py — A2A Agent Card generator
# Each agent advertises its capabilities via an Agent Card (JSON-LD)
# so the supervisor knows what each agent can do.

from dataclasses import dataclass, field, asdict
import json


@dataclass
class AgentSkill:
    """A specific capability an agent offers."""
    id: str
    name: str
    description: str
    tags: list[str] = field(default_factory=list)
    examples: list[str] = field(default_factory=list)


@dataclass
class AgentCard:
    """A2A Agent Card — the agent's public identity and capabilities."""
    name: str
    description: str
    url: str                          # Agent's A2A endpoint
    version: str = "1.0.0"
    skills: list[AgentSkill] = field(default_factory=list)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)

    def well_known_path(self) -> str:
        """A2A agents serve their card at /.well-known/agent.json"""
        return "/.well-known/agent.json"


# Define agent cards for each specialist
billing_card = AgentCard(
    name="Billing Agent",
    description="Handles subscription management, payment issues, invoices, and refund requests",
    url="http://billing-agent:8001/a2a",
    skills=[
        AgentSkill(
            id="subscription-management",
            name="Subscription Management",
            description="Change plans, cancel subscriptions, apply discounts",
            tags=["billing", "subscription"],
            examples=[
                "I want to upgrade to the Pro plan",
                "Cancel my subscription",
                "Apply the SAVE20 discount code",
            ],
        ),
        AgentSkill(
            id="payment-issues",
            name="Payment Issues",
            description="Resolve failed payments, update payment methods, process refunds",
            tags=["billing", "payment", "refund"],
            examples=[
                "My payment failed",
                "I need a refund for last month",
                "Update my credit card",
            ],
        ),
    ],
)

technical_card = AgentCard(
    name="Technical Agent",
    description="Resolves API errors, integration problems, SDK issues, and bug reports",
    url="http://technical-agent:8002/a2a",
    skills=[
        AgentSkill(
            id="api-troubleshooting",
            name="API Troubleshooting",
            description="Debug API errors, rate limits, authentication failures",
            tags=["api", "debugging", "errors"],
            examples=[
                "I'm getting a 429 error on the /users endpoint",
                "My API key stopped working",
                "Webhook events are not being delivered",
            ],
        ),
        AgentSkill(
            id="integration-help",
            name="Integration Help",
            description="Guide SDK setup, webhook configuration, and third-party integrations",
            tags=["sdk", "integration", "webhooks"],
            examples=[
                "How do I set up the Python SDK?",
                "Configure webhooks for payment events",
                "Integrate with Zapier",
            ],
        ),
    ],
)
```

### Step 2: Build the A2A-Compatible Specialist Agents

Each specialist runs as an independent service with its own A2A endpoint. The billing agent illustrates the pattern — it receives JSON-RPC messages, processes them with LangChain, and returns structured responses.

```python
# agents/billing_agent.py — Billing specialist with A2A endpoint
# Runs as an independent service on port 8001.
# Uses LangChain for LLM calls and tool execution.

from fastapi import FastAPI, Request
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
import uvicorn
import json

app = FastAPI()

# --- Domain-specific tools ---

@tool
def get_subscription(user_id: str) -> dict:
    """Fetch the current subscription details for a user.

    Args:
        user_id: The unique identifier of the customer.

    Returns:
        Subscription details including plan, status, and billing cycle.
    """
    # In production: query your billing database or Stripe API
    return {
        "user_id": user_id,
        "plan": "starter",
        "status": "active",
        "monthly_price": 29.00,
        "next_billing_date": "2026-04-01",
        "payment_method": "visa-4242",
    }


@tool
def change_plan(user_id: str, new_plan: str) -> dict:
    """Change a user's subscription plan.

    Args:
        user_id: The unique identifier of the customer.
        new_plan: Target plan name (starter, pro, enterprise).

    Returns:
        Confirmation with old and new plan details.
    """
    plan_prices = {"starter": 29, "pro": 79, "enterprise": 199}
    if new_plan not in plan_prices:
        return {"error": f"Unknown plan: {new_plan}. Available: {list(plan_prices.keys())}"}
    return {
        "user_id": user_id,
        "old_plan": "starter",
        "new_plan": new_plan,
        "new_price": plan_prices[new_plan],
        "effective_date": "2026-04-01",
        "prorated_charge": 16.67,    # Prorated for remaining billing cycle
    }


@tool
def process_refund(user_id: str, amount: float, reason: str) -> dict:
    """Process a refund for a customer.

    Args:
        user_id: The unique identifier of the customer.
        amount: Refund amount in USD.
        reason: Reason for the refund.

    Returns:
        Refund confirmation with transaction ID.
    """
    return {
        "refund_id": "ref_abc123",
        "user_id": user_id,
        "amount": amount,
        "status": "processed",
        "estimated_arrival": "3-5 business days",
    }


# --- LangChain agent setup ---

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a billing support specialist. You help customers with:
- Subscription changes (upgrades, downgrades, cancellations)
- Payment issues (failed charges, updating payment methods)
- Refunds and credits
- Invoice questions

Always look up the customer's current subscription before making changes.
Be empathetic but efficient. Confirm amounts before processing refunds.
If the issue is technical (API errors, integration problems), say you need
to transfer to the technical team — do NOT try to resolve technical issues."""),
    ("placeholder", "{chat_history}"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, [get_subscription, change_plan, process_refund], prompt)
executor = AgentExecutor(agent=agent, tools=[get_subscription, change_plan, process_refund])


# --- A2A endpoint ---

@app.get("/.well-known/agent.json")
async def agent_card():
    """Serve the Agent Card for A2A discovery."""
    return json.loads(billing_card.to_json())


@app.post("/a2a")
async def handle_a2a(request: Request):
    """Handle A2A JSON-RPC messages.

    The A2A protocol uses JSON-RPC 2.0. The supervisor sends tasks
    with the user's message and context. The agent processes the task
    and returns a response with artifacts (the actual reply).
    """
    body = await request.json()
    method = body.get("method")
    params = body.get("params", {})
    rpc_id = body.get("id")

    if method == "tasks/send":
        task = params
        user_message = task["message"]["parts"][0]["text"]
        context = task.get("metadata", {})
        user_id = context.get("user_id", "unknown")

        # Run the LangChain agent
        result = await executor.ainvoke({
            "input": f"[Customer: {user_id}] {user_message}",
            "chat_history": [],
        })

        return {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "id": task.get("id", "task-1"),
                "status": {"state": "completed"},
                "artifacts": [{
                    "parts": [{"text": result["output"]}],
                    "metadata": {
                        "agent": "billing",
                        "confidence": 0.95,
                        "tools_used": [step.tool for step in result.get("intermediate_steps", [])],
                    },
                }],
            },
        }

    return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32601, "message": "Method not found"}}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

The technical agent follows the same pattern but with different tools (log lookup, API status check, SDK documentation search) and a different system prompt focused on debugging and technical guidance.

### Step 3: Build the LangGraph Supervisor

The supervisor is the brain of the system. It receives every incoming customer message, determines intent, routes to the right specialist via A2A, handles multi-turn conversations, and manages cross-domain handoffs.

```python
# supervisor/graph.py — LangGraph supervisor that orchestrates specialist agents
# This is the entry point for all customer conversations.
# It uses LangGraph's StateGraph to model the conversation flow.

from typing import TypedDict, Literal, Annotated
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
import httpx
import json


# --- State definition ---

class ConversationState(TypedDict):
    """The full state of a customer support conversation.

    messages: The conversation history (LangGraph manages appending).
    current_agent: Which specialist is currently handling the conversation.
    user_id: The customer's ID (from authentication).
    intent: Classified intent from the triage step.
    urgency: How urgent is this issue (low, medium, high, critical).
    context: Accumulated context from agent responses.
    handoff_count: Number of times the conversation was routed between agents.
    """
    messages: Annotated[list, add_messages]
    current_agent: str
    user_id: str
    intent: str
    urgency: str
    context: dict
    handoff_count: int


# --- A2A client ---

async def call_agent_a2a(
    agent_url: str,
    message: str,
    user_id: str,
    context: dict | None = None,
) -> dict:
    """Send a task to a specialist agent via A2A protocol.

    Args:
        agent_url: The agent's A2A endpoint URL.
        message: The user's message to process.
        user_id: Customer identifier for context.
        context: Additional metadata (conversation history, prior agent responses).

    Returns:
        The agent's response including text and metadata.
    """
    payload = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "tasks/send",
        "params": {
            "id": f"task-{user_id}",
            "message": {
                "role": "user",
                "parts": [{"text": message}],
            },
            "metadata": {
                "user_id": user_id,
                **(context or {}),
            },
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(agent_url, json=payload)
        result = response.json()

    if "error" in result:
        raise Exception(f"A2A error: {result['error']}")

    artifact = result["result"]["artifacts"][0]
    return {
        "text": artifact["parts"][0]["text"],
        "metadata": artifact.get("metadata", {}),
    }


# --- Agent URLs ---

AGENT_URLS = {
    "billing": "http://billing-agent:8001/a2a",
    "technical": "http://technical-agent:8002/a2a",
    "escalation": "http://escalation-agent:8003/a2a",
}


# --- Graph nodes ---

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)


async def triage(state: ConversationState) -> ConversationState:
    """Classify the customer's intent and urgency.

    The triage node analyzes the latest message and determines:
    1. Which specialist should handle it (billing, technical, escalation)
    2. How urgent it is (affects response priority)
    3. A summary of the customer's intent

    This runs on every new message, even mid-conversation, to detect
    when the topic shifts (e.g., billing question → technical issue).
    """
    last_message = state["messages"][-1].content

    classification = await llm.ainvoke([
        SystemMessage(content="""Classify this customer support message. Return JSON:
{
  "agent": "billing" | "technical" | "escalation",
  "intent": "brief description of what the customer needs",
  "urgency": "low" | "medium" | "high" | "critical"
}

Rules:
- billing: subscription, payment, invoice, pricing, refund, plan changes
- technical: API errors, SDK issues, integration problems, bugs, downtime
- escalation: angry customer, legal threats, data breach, repeated failures, requests for manager
- If unclear, default to "technical"
- "critical" = data breach, security issue, or complete service outage"""),
        HumanMessage(content=last_message),
    ])

    try:
        result = json.loads(classification.content)
    except json.JSONDecodeError:
        result = {"agent": "technical", "intent": "unclear", "urgency": "medium"}

    return {
        **state,
        "current_agent": result["agent"],
        "intent": result["intent"],
        "urgency": result["urgency"],
    }


async def route_to_specialist(state: ConversationState) -> ConversationState:
    """Send the message to the appropriate specialist via A2A.

    Takes the classified intent and routes to billing, technical,
    or escalation agent. Passes conversation context so the specialist
    has full awareness of prior interactions.
    """
    agent_name = state["current_agent"]
    agent_url = AGENT_URLS[agent_name]
    last_message = state["messages"][-1].content

    # Build context from conversation history
    context = {
        "intent": state["intent"],
        "urgency": state["urgency"],
        "prior_agents": state["context"].get("prior_agents", []),
        "conversation_summary": state["context"].get("summary", ""),
    }

    response = await call_agent_a2a(
        agent_url=agent_url,
        message=last_message,
        user_id=state["user_id"],
        context=context,
    )

    # Update state with the specialist's response
    prior_agents = state["context"].get("prior_agents", [])
    if agent_name not in prior_agents:
        prior_agents.append(agent_name)

    return {
        **state,
        "messages": [AIMessage(content=response["text"])],
        "context": {
            **state["context"],
            "prior_agents": prior_agents,
            "last_response": response["text"],
            "last_agent": agent_name,
            "tools_used": response["metadata"].get("tools_used", []),
        },
        "handoff_count": state["handoff_count"] + (
            1 if state["context"].get("last_agent") and state["context"]["last_agent"] != agent_name else 0
        ),
    }


async def check_satisfaction(state: ConversationState) -> ConversationState:
    """Evaluate whether the response adequately addresses the customer's issue.

    If the specialist's response suggests a handoff (e.g., billing agent says
    "this is a technical issue"), re-route to the correct agent instead of
    sending the handoff message to the customer.
    """
    last_response = state["context"].get("last_response", "")

    evaluation = await llm.ainvoke([
        SystemMessage(content="""Evaluate this support agent response. Return JSON:
{
  "needs_handoff": true/false,
  "handoff_target": "billing" | "technical" | "escalation" | null,
  "reason": "brief explanation"
}

Set needs_handoff=true if the response explicitly says it needs to transfer
to another team or cannot handle this type of issue."""),
        HumanMessage(content=f"Agent response: {last_response}"),
    ])

    try:
        result = json.loads(evaluation.content)
    except json.JSONDecodeError:
        result = {"needs_handoff": False, "handoff_target": None}

    if result.get("needs_handoff") and result.get("handoff_target"):
        # Prevent infinite loops — max 2 handoffs per conversation
        if state["handoff_count"] < 2:
            return {**state, "current_agent": result["handoff_target"]}

    return state


# --- Routing function ---

def should_continue(state: ConversationState) -> Literal["route_to_specialist", "end"]:
    """Decide whether to route to another specialist or end the turn."""
    last_agent = state["context"].get("last_agent")
    current = state["current_agent"]

    # If check_satisfaction changed the agent, re-route
    if last_agent and last_agent != current and state["handoff_count"] < 2:
        return "route_to_specialist"
    return "end"


# --- Build the graph ---

graph = StateGraph(ConversationState)

graph.add_node("triage", triage)
graph.add_node("route_to_specialist", route_to_specialist)
graph.add_node("check_satisfaction", check_satisfaction)

# Flow: START → triage → route_to_specialist → check_satisfaction → (loop or end)
graph.add_edge(START, "triage")
graph.add_edge("triage", "route_to_specialist")
graph.add_edge("route_to_specialist", "check_satisfaction")
graph.add_conditional_edges("check_satisfaction", should_continue, {
    "route_to_specialist": "route_to_specialist",
    "end": END,
})

# Compile the graph
support_graph = graph.compile()
```

### Step 4: Wire Up the Conversation API

```python
# supervisor/api.py — HTTP API for the customer support system
# Frontend chat widgets and mobile apps connect here.

from fastapi import FastAPI, WebSocket
from supervisor.graph import support_graph, ConversationState

app = FastAPI()

# In-memory conversation store (use Redis in production)
conversations: dict[str, ConversationState] = {}


@app.post("/api/support/message")
async def handle_message(body: dict):
    """Handle an incoming customer message.

    Args (in body):
        user_id: Authenticated customer ID.
        message: The customer's message text.

    The supervisor triages the message, routes it to the appropriate
    specialist agent via A2A, checks if a handoff is needed, and returns
    the final response.
    """
    user_id = body["user_id"]
    message = body["message"]

    # Get or create conversation state
    state = conversations.get(user_id, {
        "messages": [],
        "current_agent": "",
        "user_id": user_id,
        "intent": "",
        "urgency": "medium",
        "context": {},
        "handoff_count": 0,
    })

    # Add the new message
    from langchain_core.messages import HumanMessage
    state["messages"].append(HumanMessage(content=message))

    # Run the graph
    result = await support_graph.ainvoke(state)

    # Store updated state
    conversations[user_id] = result

    # Return the last AI message
    ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
    response_text = ai_messages[-1].content if ai_messages else "Let me look into that for you."

    return {
        "response": response_text,
        "agent": result["current_agent"],
        "intent": result["intent"],
        "urgency": result["urgency"],
    }
```

### Step 5: Deploy with Docker Compose

```yaml
# docker-compose.yml — Full multi-agent support system
version: "3.8"
services:
  # Supervisor (LangGraph)
  supervisor:
    build: ./supervisor
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - billing-agent
      - technical-agent
      - escalation-agent

  # Specialist agents (each is an independent A2A service)
  billing-agent:
    build: ./agents/billing
    ports:
      - "8001:8001"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - STRIPE_API_KEY=${STRIPE_API_KEY}

  technical-agent:
    build: ./agents/technical
    ports:
      - "8002:8002"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DATABASE_URL=${DATABASE_URL}

  escalation-agent:
    build: ./agents/escalation
    ports:
      - "8003:8003"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}  # Alert humans
```


## Real-World Example

After two weeks in production, the multi-agent system resolves 78% of support tickets without human intervention, up from 45% with the monolithic chatbot. The key improvement came from specialization — the billing agent's accuracy on refund processing jumped to 96% because its prompt and tools are focused entirely on billing, without the noise of technical documentation.

The A2A protocol made the architecture genuinely modular. When the team added a new "onboarding agent" to handle trial-to-paid conversion questions, they deployed a new service, registered its Agent Card, and added one entry to the supervisor's routing table. No changes to the billing or technical agents. No redeployment of the supervisor itself — just a config update.

The LangGraph supervisor catches cross-domain issues that the monolithic bot missed entirely. When a customer says "my payment failed and now I can't access the API," the triage node routes to billing first, which resolves the payment. The satisfaction check detects the unresolved API access issue and hands off to the technical agent — all within the same conversation turn. The customer sees one seamless interaction.

Handoff detection reduced repeat contacts by 35%. Previously, customers whose billing issue caused a technical problem would get a billing answer and then open a second ticket for the technical issue. Now the supervisor catches both in one conversation.

Average response time increased from 1.2 seconds (single LLM call) to 3.8 seconds (triage + specialist + satisfaction check), but customer satisfaction scores improved by 40% because the answers are actually correct. The team considers the tradeoff worthwhile.

## Related Skills

- [a2a-protocol](../skills/a2a-protocol/) -- Google's Agent-to-Agent protocol for inter-agent communication and discovery
- [langchain](../skills/langchain/) -- Build LLM applications with chains, agents, and retrieval-augmented generation
- [langgraph](../skills/langgraph/) -- Build stateful multi-agent workflows with cycles, branching, and persistence
