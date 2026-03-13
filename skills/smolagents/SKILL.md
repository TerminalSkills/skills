---
name: smolagents
description: >-
   You are an expert in smolagents, Hugging Face's minimalist agent framework.
  You help developers build AI agents that write and execute Python code to
  solve tasks, use tools from the Hugging Face Hub, chain multiple agents
  together, and run on any LLM (OpenAI, Anthropic, local models) — providing a
  simple, code-first approach to building agents without complex abstractions.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - huggingface
    - agents
    - tools
    - code-generation
    - multi-agent
    - python
---

# smolagents — Hugging Face Lightweight Agent Framework

You are an expert in smolagents, Hugging Face's minimalist agent framework. You help developers build AI agents that write and execute Python code to solve tasks, use tools from the Hugging Face Hub, chain multiple agents together, and run on any LLM (OpenAI, Anthropic, local models) — providing a simple, code-first approach to building agents without complex abstractions.

## Core Capabilities

### Code Agent

```python
# agents/research.py — Agent that writes and executes Python code
from smolagents import CodeAgent, tool, HfApiModel, OpenAIServerModel

# Use any LLM as the engine
model = OpenAIServerModel(model_id="gpt-4o")
# Or local: HfApiModel(model_id="meta-llama/Llama-3.1-70B-Instruct")
# Or Anthropic: AnthropicServerModel(model_id="claude-sonnet-4-20250514")

@tool
def search_web(query: str) -> str:
    """Search the web for information.

    Args:
        query: Search query string
    """
    results = brave_search(query, count=5)
    return "\n".join([f"- {r['title']}: {r['description']}" for r in results])

@tool
def get_stock_price(symbol: str) -> dict:
    """Get current stock price and basic metrics.

    Args:
        symbol: Stock ticker symbol (e.g., AAPL, GOOGL)
    """
    data = yfinance.Ticker(symbol)
    return {
        "price": data.info["currentPrice"],
        "change": data.info["regularMarketChangePercent"],
        "market_cap": data.info["marketCap"],
        "pe_ratio": data.info.get("trailingPE"),
    }

@tool
def create_chart(data: dict, title: str) -> str:
    """Create a chart from data and save as image.

    Args:
        data: Dictionary with x and y values
        title: Chart title
    """
    import matplotlib.pyplot as plt
    plt.figure(figsize=(10, 6))
    plt.plot(data["x"], data["y"])
    plt.title(title)
    path = f"/tmp/{title.replace(' ', '_')}.png"
    plt.savefig(path)
    return f"Chart saved to {path}"

# Create agent
agent = CodeAgent(
    tools=[search_web, get_stock_price, create_chart],
    model=model,
    max_steps=10,
    additional_authorized_imports=["pandas", "numpy", "matplotlib"],
)

# Agent writes and executes Python code to solve the task
result = agent.run(
    "Compare AAPL and MSFT stock performance. "
    "Get their current prices, calculate the PE ratio difference, "
    "and create a comparison chart."
)
# Agent generates code like:
# aapl = get_stock_price("AAPL")
# msft = get_stock_price("MSFT")
# ... creates chart, returns analysis
```

### Multi-Agent

```python
from smolagents import CodeAgent, ManagedAgent

# Specialist agents
web_agent = CodeAgent(tools=[search_web], model=model)
data_agent = CodeAgent(tools=[get_stock_price, create_chart], model=model,
                        additional_authorized_imports=["pandas", "numpy", "matplotlib"])

# Manager agent delegates to specialists
managed_web = ManagedAgent(agent=web_agent, name="web_researcher",
    description="Searches the web for information")
managed_data = ManagedAgent(agent=data_agent, name="data_analyst",
    description="Analyzes financial data and creates charts")

manager = CodeAgent(
    tools=[],
    model=model,
    managed_agents=[managed_web, managed_data],
)

result = manager.run(
    "Research the latest AI chip market trends, "
    "then analyze NVDA and AMD stock data and create a comparison report."
)
```

### Hub Tools

```python
from smolagents import load_tool

# Load tools from Hugging Face Hub
image_gen = load_tool("m-ric/text-to-image", trust_remote_code=True)
translator = load_tool("m-ric/translation", trust_remote_code=True)
speech = load_tool("m-ric/text-to-speech", trust_remote_code=True)

agent = CodeAgent(tools=[image_gen, translator, speech], model=model)
```

## Installation

```bash
pip install smolagents
```

## Best Practices

1. **Code agents > tool agents** — CodeAgent writes Python to solve tasks; more flexible than fixed tool-calling patterns
2. **Tool docstrings matter** — Agent reads tool descriptions and arg docs to decide how to use them; be specific
3. **Authorized imports** — Whitelist Python packages with `additional_authorized_imports`; agent can use pandas, numpy, etc.
4. **Multi-agent delegation** — Use ManagedAgent for specialized sub-agents; manager delegates, specialists execute
5. **Hub tools** — Share and reuse tools via Hugging Face Hub; community-contributed tools for common tasks
6. **max_steps limit** — Set reasonable step limits (5-10); prevents infinite loops and controls costs
7. **Any LLM** — Works with OpenAI, Anthropic, Hugging Face Inference, local models; swap with one line
8. **Sandboxed execution** — Code runs in a sandbox by default; use E2B or Docker for production isolation
