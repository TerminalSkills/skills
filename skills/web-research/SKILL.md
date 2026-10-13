---
name: web-research
description: >-
  Deep web research with Brave Search API. Find sources, extract content,
  and compile comprehensive reports. Use when a user asks to research a
  topic on the web, find information online, compile a research report,
  search the internet for sources, do a deep dive on a subject, gather
  web sources for a report, or investigate a topic thoroughly using
  multiple online sources.
license: Apache-2.0
compatibility: "Requires Python 3.9+ with requests and beautifulsoup4 installed. Requires a Brave Search API key (Search plan; $5 free monthly credit, card required)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  tags: ["research", "web-search", "brave", "report", "sources"]
  use-cases:
    - "Compile a research report with cited sources on any topic"
    - "Find and compare multiple perspectives on a subject"
    - "Gather evidence and data points to support a decision or analysis"
  agents: ["claude-code", "openai-codex", "gemini-cli", "cursor"]
---

# Web Research

## Overview

Conduct thorough web research using the Brave Search API. Search for information, fetch and extract content from web pages, cross-reference multiple sources, and compile structured research reports with proper citations. Designed for deep-dive research that goes beyond a single search query.

## Instructions

When a user asks you to research a topic on the web, follow these steps:

### Step 1: Plan the research

Before searching, define a research plan:
- **Central question**: What is the user trying to learn or decide?
- **Sub-questions**: Break the topic into 3-5 specific queries
- **Source types**: What kinds of sources are valuable (academic, news, official docs, forums)?
- **Scope**: How deep should the research go?

Example plan for "Is Rust ready for production web development?":
```
Central question: Can Rust be used for production web APIs today?

Sub-queries:
  1. "Rust web frameworks comparison 2026"
  2. "Rust production web services case studies"
  3. "Rust vs Go web performance benchmarks"
  4. "Rust web development challenges limitations"
  5. "companies using Rust in production backend"
```

### Step 2: Search with Brave Search API

Install the helpers once: `pip install requests beautifulsoup4`.

```python
import requests
import os

BRAVE_API_KEY = os.environ.get("BRAVE_API_KEY")
BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"

def brave_search(query, count=10, freshness=None):
    """Search the web using Brave Search API.

    Args:
        query: Search query string
        count: Number of results (max 20)
        freshness: Optional filter: 'pd' (past day), 'pw' (past week),
                   'pm' (past 31 days), 'py' (past year), or a
                   range such as '2026-01-01to2026-06-30'
    """
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
    }
    params = {"q": query, "count": min(count, 20)}
    if freshness:
        params["freshness"] = freshness

    response = requests.get(BRAVE_SEARCH_URL, headers=headers,
                            params=params, timeout=30)
    response.raise_for_status()

    results = []
    data = response.json()
    for item in data.get("web", {}).get("results", []):
        results.append({
            "title": item["title"],
            "url": item["url"],
            "description": item.get("description", ""),
            "age": item.get("age", ""),
        })
    return results
```

### Step 3: Extract content from sources

Fetch and extract readable content from the most relevant URLs:

```python
from bs4 import BeautifulSoup

def extract_page_content(url):
    """Fetch a URL and extract the main text content."""
    headers = {"User-Agent": "terminal-skills-check (https://terminalskills.io)"}
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove navigation, ads, footers
    for tag in soup.select("nav, footer, header, aside, .ad, .sidebar, script, style"):
        tag.decompose()

    # Try to find the main content area
    main = soup.select_one("article, main, .post-content, .entry-content")
    if not main:
        main = soup.find("body")

    if main:
        text = main.get_text(separator="\n", strip=True)
        # Clean up excessive whitespace
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        return "\n".join(lines)
    return ""
```

### Step 4: Analyze and cross-reference

For each sub-question, synthesize information from multiple sources:

```
Sub-question: "Rust web frameworks comparison"

Source 1 (blog.tokio-notes.dev): Actix-web is the fastest, Axum has the
  best developer experience, Rocket is easiest for beginners.

Source 2 (benchmark-site.com): Actix-web handles 650K req/s, Axum
  handles 580K req/s. Both outperform Express.js by 10x.

Source 3 (forum discussion): Community consensus is shifting toward
  Axum due to its use of the Tokio ecosystem and simpler API.

Synthesis: Axum is emerging as the recommended choice, offering a
  balance of performance and ergonomics, with strong ecosystem support.
```

### Step 5: Compile the research report

```markdown
# Research Report: [Topic]

**Date:** [date]
**Queries executed:** [count]
**Sources analyzed:** [count]

## Executive Summary

[2-3 paragraph summary of key findings]

## Detailed Findings

### [Sub-topic 1]

[Findings with inline citations]

Key data points:
- [fact] [Source 1]
- [fact] [Source 2]

### [Sub-topic 2]

[Findings with inline citations]

## Conflicting Information

[Note any areas where sources disagree and why]

## Knowledge Gaps

[Areas where information was insufficient or outdated]

## Sources

1. [Title](URL) - [brief description of what was extracted]
2. [Title](URL) - [brief description]
3. [Title](URL) - [brief description]
...

## Methodology

- Search engine: Brave Search API
- Queries executed: [list each query]
- Date range: [freshness filter used]
- Sources evaluated: [total count]
- Sources included: [count included in report]
```

### Step 6: Save the report

```bash
cat > research_report_[topic].md << 'EOF'
[compiled report]
EOF
```

## Examples

### Example 1: Technology evaluation research

**User request:** "Research whether we should migrate from REST to GraphQL for our mobile app API."

**Research plan:**
1. "GraphQL vs REST mobile app performance"
2. "GraphQL migration challenges production"
3. "companies migrated REST to GraphQL results"
4. "GraphQL disadvantages drawbacks"
5. "REST vs GraphQL mobile bandwidth optimization"

**Output:** Structured report with pros, cons, case studies, and a recommendation based on evidence.

### Example 2: Market research for a new product

**User request:** "Research the current state of AI code review tools. Who are the players and what are the gaps?"

**Research plan:**
1. "AI code review tools comparison 2026"
2. "AI code review market size growth"
3. "best AI code review GitHub" (product-specific)
4. "AI code review limitations complaints"
5. "developer survey code review automation"

**Output:** Competitive landscape analysis with feature matrices, pricing data, user sentiment, and identified market gaps.

### Example 3: Fact-checking and verification

**User request:** "Research whether the claim 'microservices reduce deployment frequency' is supported by evidence."

**Research plan:**
1. "microservices deployment frequency study"
2. "microservices vs monolith deployment speed evidence"
3. "DORA metrics microservices research"
4. "microservices deployment challenges"

**Output:** Evidence-based analysis citing research papers, industry surveys, and case studies both supporting and refuting the claim.

## Guidelines

- Always verify the Brave Search API key is set in the environment. Guide the user to get one at https://brave.com/search/api/ if missing. Brave now sells a Search plan ($5 per 1,000 requests) that includes $5 of free credit each month, roughly 1,000 queries; a card is required at signup but is not charged within the credit. Send it as the `X-Subscription-Token` header, never in the URL or in committed files.
- Execute multiple search queries per research topic. A single query is rarely sufficient for thorough research.
- Cross-reference claims across at least 2-3 sources before including them in the report.
- Clearly distinguish between facts, opinions, and the report's synthesis.
- Always include source URLs so the user can verify claims. Never present information without attribution.
- Note the publication date of sources. Older sources may contain outdated information.
- Flag conflicting information explicitly rather than silently choosing one version.
- Respect robots.txt and rate-limit page fetches. Add a 1-second delay between requests.
- If a page cannot be fetched (paywall, 403, timeout), note it and rely on the search snippet instead.
- Keep the final report focused and actionable. Raw information dumps are less useful than synthesized insights.
- Save the report in markdown format for easy reading and sharing.
- For time-sensitive topics, use the `freshness` parameter to prioritize recent results.
