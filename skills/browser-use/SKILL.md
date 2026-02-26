---
name: browser-use
description: >-
  Give AI agents browser control with Browser Use — autonomous web browsing
  for LLM agents. Use when someone asks to "AI browse the web", "browser
  automation with AI", "Browser Use", "LLM web agent", "autonomous browsing",
  "AI fill out forms", or "agent that can navigate websites". Covers autonomous
  browsing, task completion, data extraction, and form filling.
license: Apache-2.0
compatibility: "Python 3.11+. Playwright. Any LLM via LangChain."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["ai-agent", "browser", "automation", "browser-use", "web-agent"]
---

# Browser Use

## Overview

Browser Use gives LLM agents the ability to browse the web autonomously. The agent sees the page (via accessibility tree or screenshots), decides what to click/type/scroll, and executes actions via Playwright. It can navigate websites, fill forms, extract data, and complete multi-step tasks — like a human using a browser but driven by an LLM.

## When to Use

- AI agent needs to interact with websites that don't have APIs
- Automating multi-step web workflows (booking, form filling, research)
- Data extraction from dynamic websites
- Testing web applications with natural language instructions
- Building AI assistants that can "use the internet"

## Instructions

### Setup

```bash
pip install browser-use
playwright install chromium
```

### Basic Usage

```python
# browse.py — AI agent that browses the web
from browser_use import Agent
from langchain_openai import ChatOpenAI

agent = Agent(
    task="Go to github.com/trending and find the top 3 Python repositories today. Return their names, descriptions, and star counts.",
    llm=ChatOpenAI(model="gpt-4o"),
)

result = await agent.run()
print(result)
```

### Multi-Step Tasks

```python
# task.py — Complex multi-step web task
from browser_use import Agent
from langchain_anthropic import ChatAnthropic

agent = Agent(
    task="""
    1. Go to news.ycombinator.com
    2. Find the top 5 stories about AI
    3. For each story, click through and summarize the article in 2 sentences
    4. Return a structured list with: title, URL, summary, points
    """,
    llm=ChatAnthropic(model="claude-sonnet-4-20250514"),
    max_steps=50,  # Maximum actions the agent can take
)

result = await agent.run()
```

### With Custom Controller

```python
# controlled.py — Custom browser settings and hooks
from browser_use import Agent, Controller, Browser, BrowserConfig

# Custom browser config
browser = Browser(config=BrowserConfig(
    headless=True,
    disable_security=False,
    extra_chromium_args=["--disable-blink-features=AutomationControlled"],
))

# Controller with action hooks
controller = Controller()

@controller.action("Save extracted data to file")
def save_data(data: str, filename: str):
    with open(filename, "w") as f:
        f.write(data)
    return f"Saved to {filename}"

agent = Agent(
    task="Find the latest Python release version from python.org and save it to version.txt",
    llm=ChatOpenAI(model="gpt-4o"),
    browser=browser,
    controller=controller,
)

result = await agent.run()
```

### Data Extraction

```python
# extract.py — Extract structured data from websites
from browser_use import Agent
from pydantic import BaseModel

class Product(BaseModel):
    name: str
    price: float
    rating: float
    url: str

agent = Agent(
    task="""
    Go to amazon.com and search for "mechanical keyboard".
    Extract the first 5 results with name, price, rating, and URL.
    Return as JSON.
    """,
    llm=ChatOpenAI(model="gpt-4o"),
)

result = await agent.run()
# Parse result into Product models
```

### Form Filling

```python
# form.py — Fill out web forms
agent = Agent(
    task="""
    Go to the job application page at https://careers.example.com/apply.
    Fill in the form with:
    - Name: Test User
    - Email: test@example.com
    - Position: Senior Developer
    - Experience: 5 years
    - Cover letter: "I am excited to join your team..."
    Do NOT submit the form. Just fill it in and take a screenshot.
    """,
    llm=ChatOpenAI(model="gpt-4o"),
    save_conversation_path="./logs/",
)

result = await agent.run()
```

## Examples

### Example 1: Research assistant that browses the web

**User prompt:** "Build an AI research agent that can search the web, read articles, and compile a report."

The agent will use Browser Use to navigate search engines, click through results, extract article content, and compile findings into a structured report.

### Example 2: Automated web testing with natural language

**User prompt:** "Test my web app by having an AI agent go through the signup flow and report any issues."

The agent will navigate to the signup page, fill in forms, submit, and report on UX issues, errors, or confusing elements.

## Guidelines

- **GPT-4o or Claude Sonnet recommended** — needs strong vision + reasoning
- **`max_steps` to limit actions** — prevent infinite loops
- **Headless for production** — `headless=True` in BrowserConfig
- **Save conversations for debugging** — `save_conversation_path` logs every step
- **Custom actions via Controller** — extend what the agent can do (save files, call APIs)
- **Don't automate logins to services you don't own** — respect ToS
- **Screenshots for debugging** — agent can take screenshots at any step
- **Retry on failure** — web pages change; build retries into your workflow
- **Combine with E2B** — run Browser Use in a sandbox for isolation
- **Vision mode** — agent sees screenshots; accessibility mode sees DOM tree
