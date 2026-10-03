---
name: browser-use
description: >-
  Browser Use is an open-source Python library that lets an LLM agent drive a
  real browser to navigate sites, fill forms, click and extract data from a plain-English
  task. Use when the user wants an AI agent to automate a website, scrape pages
  that need clicking or login, return structured data from the web, add browser
  tools to a coding agent, or run browser agents locally or in the cloud.
license: Apache-2.0
compatibility: 'Python 3.11+, Chromium or Chrome, an LLM API key (Browser Use, OpenAI, Anthropic, Google, Ollama and others)'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags:
    - browser
    - automation
    - agent
    - scraping
    - python
  repository: https://github.com/browser-use/browser-use
---

# Browser Use — AI Browser Automation Agent

## Overview

Browser Use gives an LLM a browser: the agent reads the page (DOM plus screenshots), then clicks, types, scrolls, switches tabs and extracts data until the task is done. Checked against browser-use 0.13.10 (4 September 2026). Three ways to use it:

- **Python library** (this skill's focus): `Agent(task=..., llm=...)` running locally, with your choice of model.
- **CLI** (`browser-use`, built on Browser Harness): lets a coding agent such as Claude Code run Python helpers against your own Chrome with its logins.
- **Browser Use Cloud**: hosted agents and stealth browsers, paid per use.

It no longer sits on LangChain. Models are Browser Use's own wrappers (`ChatOpenAI`, `ChatAnthropic`, `ChatGoogle`, `ChatOllama`, `ChatBrowserUse`, and more), and the old `BrowserConfig` and `output_model=` names are gone.

## Instructions

### Install

```bash
uv init --python 3.12          # new project; Browser Use needs Python 3.11+
uv add browser-use
uvx browser-use install        # downloads Chromium
```

Put your model key in `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, or `BROWSER_USE_API_KEY` for `ChatBrowserUse`) and call `load_dotenv()`.

### A first agent

```python
# agent.py
import asyncio
from dotenv import load_dotenv
from browser_use import Agent, Browser, ChatAnthropic

load_dotenv()

async def main():
    agent = Agent(
        task="Open news.ycombinator.com and tell me the title of the top Show HN post",
        llm=ChatAnthropic(model="claude-sonnet-4-6"),
        browser=Browser(headless=True),
    )
    history = await agent.run(max_steps=30)
    print(history.final_result())
    print(history.is_done(), history.is_successful(), history.urls())

asyncio.run(main())
```

`agent.run()` returns an `AgentHistoryList`. Useful methods: `final_result()`, `is_done()`, `is_successful()` (the agent's own verdict), `errors()`, `urls()`, `action_names()`, `number_of_steps()`. Swap the model with `ChatOpenAI(model="gpt-5")`, `ChatGoogle(model="gemini-2.5-flash")` or `ChatOllama(model=...)`.

### Structured output

Pass a Pydantic model as `output_model_schema`; read the parsed result from `history.structured_output`.

```python
from pydantic import BaseModel

class Laptop(BaseModel):
    name: str
    price_usd: float
    rating: float

class Laptops(BaseModel):
    items: list[Laptop]

agent = Agent(
    task="On bestbuy.com find the five best-rated laptops under $1000",
    llm=llm,
    output_model_schema=Laptops,
)
history = await agent.run()
for laptop in history.structured_output.items:
    print(laptop.name, laptop.price_usd, laptop.rating)
```

### Browser settings, domains and proxy

`Browser(...)` takes the options that used to live in `BrowserConfig`:

```python
from browser_use import Browser
from browser_use.browser.profile import ProxySettings

browser = Browser(
    headless=True,
    window_size={"width": 1280, "height": 800},
    allowed_domains=["*.bestbuy.com"],            # the agent cannot leave these domains
    proxy=ProxySettings(server="http://proxy.acme-corp.net:8080"),
    storage_state="auth.json",                    # cookies and localStorage, loaded and saved
)
```

`Browser(use_cloud=True)` uses a Browser Use cloud browser (needs `BROWSER_USE_API_KEY`); `Browser.from_system_chrome()` reuses your installed Chrome profile, so close Chrome first.

### Logins and secrets

Do not write passwords into the task text. Pass `sensitive_data`; the model sees only the placeholder names, and the real values are substituted when typing, limited to the matching domain:

```python
agent = Agent(
    task="Log in to the dashboard with bb_user and bb_pass, then open the Orders page",
    llm=llm,
    browser=Browser(allowed_domains=["https://*.bestbuy.com"]),
    sensitive_data={"https://*.bestbuy.com": {"bb_user": os.environ["BB_USER"], "bb_pass": os.environ["BB_PASS"]}},
)
```

For sites with 2FA or CAPTCHAs, log in once in a real browser and export `storage_state` with `await browser.export_storage_state("auth.json")`, then reuse that file headless.

### Custom tools

```python
from browser_use import Agent, Tools, ActionResult

tools = Tools()

@tools.action(description="Ask a human for the 2FA code shown on their phone")
async def ask_human(question: str) -> ActionResult:
    return ActionResult(extracted_content=input(f"{question} > "))

agent = Agent(task="...", llm=llm, tools=tools)
```

Special parameters are injected by name: `browser_session: BrowserSession`, `page_extraction_llm`, `file_system`, `available_file_paths`. A wrong name makes the tool fail silently. `Tools` replaces the old `Controller` (the old name still imports).

### Use it from a coding agent

```bash
uv tool install browser-use
browser-use skill install                       # registers the skill with Claude Code, Codex, etc.
browser-use --doctor                            # diagnose browser connection
claude mcp add browser-use -- uvx --from 'browser-use[cli]' browser-use --mcp   # or run it as an MCP server
```

## Examples

### Example 1: "Get the top 5 Show HN posts as JSON"

```python
class Post(BaseModel):
    title: str
    url: str
    points: int

class Posts(BaseModel):
    posts: list[Post]

agent = Agent(task="Go to news.ycombinator.com/show and list the first 5 posts", llm=ChatOpenAI(model="gpt-5"), output_model_schema=Posts)
history = await agent.run(max_steps=25)
print(history.structured_output.model_dump_json(indent=2))
```

Result: a validated `Posts` object, for example `{"posts": [{"title": "Show HN: ...", "url": "https://...", "points": 214}, ...]}`. If the agent stops early, `history.errors()` and `history.number_of_steps()` show why.

### Example 2: "Check my order status behind a login, headless, in CI"

Export the session once on your machine (`Browser.from_system_chrome()`, then `export_storage_state("auth.json")`), store the file as a CI secret, and run:

```python
agent = Agent(
    task="Open the Orders page and report the status of the most recent order",
    llm=ChatAnthropic(model="claude-sonnet-4-6"),
    browser=Browser(headless=True, storage_state="auth.json", allowed_domains=["shop.brightbasket.dev"]),
)
print((await agent.run(max_steps=20)).final_result())
```

The agent reuses the saved cookies, never sees a password, and cannot browse outside `shop.brightbasket.dev`.

## Guidelines

- `is_done()` only means the agent emitted a final action; `is_successful()` is the agent's own opinion. Verify important outcomes (a submitted form, a purchase) in the destination system.
- Always set `max_steps` (the default in 0.13.10 is 500) and a model with vision; cost and time grow with every step.
- Restrict `allowed_domains` and never feed untrusted page content into tasks that hold credentials: pages can contain prompt injection aimed at the agent.
- Keep secrets in `sensitive_data` or `storage_state` files that are git-ignored; never inline them in the task text.
- Prefer an official API when one exists; use a browser agent for sites without one. Respect each site's terms and robots rules.
- Telemetry is on by default; opt out with `ANONYMIZED_TELEMETRY=false`.
- The library API changes between 0.x releases (older posts show `BrowserConfig`, `browser_config=`, LangChain models); trust the installed version's signatures.
