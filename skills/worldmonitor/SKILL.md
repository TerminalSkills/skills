---
name: worldmonitor
description: >-
  Build real-time intelligence dashboards that aggregate news, geopolitical events, and
  infrastructure data using AI. Use when: building news aggregation systems, monitoring
  global events, creating situational awareness dashboards.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: [intelligence, news-aggregation, geopolitical, monitoring, dashboard, real-time]
  use-cases:
    - "Build a real-time news monitoring dashboard for a specific industry"
    - "Create an AI-powered intelligence feed that summarizes global events"
    - "Monitor competitor news and market changes in real-time"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# World Monitor

## Overview

Build real-time intelligence dashboards that ingest data from multiple sources (RSS, news APIs, social media), use AI to categorize, summarize, deduplicate, and score severity, then push updates to a live dashboard. Think of it as your own AI-powered situation room.

## Architecture

```
[Sources]                    [Processing]              [Output]
RSS feeds      ──┐
News APIs      ──┤──→ Ingestor ──→ Dedup ──→ AI Classify ──→ Dashboard API
Social feeds   ──┤                            & Summarize     WebSocket push
Custom scrapers──┘                            & Score         Alerts (email/Slack)
```

## Instructions

When a user asks to build a news monitoring system, intelligence dashboard, or event aggregation feed:

1. **Define scope** — What topics/regions/industries to monitor?
2. **Select sources** — RSS feeds, NewsAPI, social APIs, custom scrapers
3. **Set up pipeline** — Ingest → Deduplicate → Classify → Summarize → Score
4. **Build output** — API + WebSocket for real-time push, alert rules

## Source Ingestion

### Multi-Source Fetcher (Python)

```python
"""Fetch from multiple source types in parallel."""
import asyncio
import hashlib
import feedparser
import httpx
from datetime import datetime, timezone

class NewsItem:
    def __init__(self, title: str, content: str, source: str, url: str, published: datetime):
        self.title = title
        self.content = content
        self.source = source
        self.url = url
        self.published = published
        self.id = hashlib.sha256(f"{title}{url}".encode()).hexdigest()[:16]

async def fetch_rss(feeds: list[str]) -> list[NewsItem]:
    """Fetch and parse multiple RSS feeds."""
    items = []
    async with httpx.AsyncClient(timeout=15) as client:
        tasks = [client.get(url) for url in feeds]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

    for resp in responses:
        if isinstance(resp, Exception):
            continue
        feed = feedparser.parse(resp.text)
        for entry in feed.entries[:20]:
            items.append(NewsItem(
                title=entry.get("title", ""),
                content=entry.get("summary", ""),
                source=feed.feed.get("title", "RSS"),
                url=entry.get("link", ""),
                published=datetime.now(timezone.utc),
            ))
    return items

async def fetch_newsapi(query: str, api_key: str) -> list[NewsItem]:
    """Fetch from NewsAPI.org."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://newsapi.org/v2/everything",
            params={"q": query, "sortBy": "publishedAt", "pageSize": 50},
            headers={"X-Api-Key": api_key},
        )
        data = resp.json()

    return [
        NewsItem(
            title=a["title"],
            content=a.get("description", ""),
            source=a["source"]["name"],
            url=a["url"],
            published=datetime.fromisoformat(a["publishedAt"].replace("Z", "+00:00")),
        )
        for a in data.get("articles", [])
    ]

# Aggregate all sources
async def fetch_all(rss_feeds: list[str], newsapi_key: str, queries: list[str]) -> list[NewsItem]:
    tasks = [fetch_rss(rss_feeds)]
    tasks += [fetch_newsapi(q, newsapi_key) for q in queries]
    results = await asyncio.gather(*tasks)
    return [item for batch in results for item in batch]
```

## Deduplication

```python
"""Deduplicate news using title similarity."""
from difflib import SequenceMatcher

def deduplicate(items: list[NewsItem], threshold: float = 0.75) -> list[NewsItem]:
    """Remove near-duplicate articles based on title similarity."""
    unique = []
    seen_titles: list[str] = []

    for item in sorted(items, key=lambda x: x.published, reverse=True):
        is_dup = any(
            SequenceMatcher(None, item.title.lower(), seen.lower()).ratio() > threshold
            for seen in seen_titles
        )
        if not is_dup:
            unique.append(item)
            seen_titles.append(item.title)

    return unique
```

## AI Classification & Summarization

```python
"""Classify, summarize, and score severity with a single LLM call."""
import json
from openai import OpenAI

client = OpenAI()

CATEGORIES = [
    "geopolitics", "technology", "finance", "security",
    "climate", "health", "regulation", "market-move"
]

def analyze_article(item: NewsItem) -> dict:
    """Classify, summarize, and score a news item."""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[{
            "role": "system",
            "content": (
                f"Analyze this news article. Respond as JSON:\n"
                f'{{"category": one of {CATEGORIES},\n'
                f'"severity": 1-10 (1=routine, 10=crisis),\n'
                f'"summary": "2-3 sentence summary",\n'
                f'"entities": ["key entities mentioned"],\n'
                f'"sentiment": "positive|negative|neutral",\n'
                f'"actionable": true/false}}'
            ),
        }, {
            "role": "user",
            "content": f"Title: {item.title}\n\nContent: {item.content[:2000]}",
        }],
    )
    analysis = json.loads(response.choices[0].message.content)
    return {**analysis, "id": item.id, "title": item.title, "url": item.url, "source": item.source}
```

### Batch Processing for Cost Efficiency

```python
async def analyze_batch(items: list[NewsItem], batch_size: int = 10) -> list[dict]:
    """Analyze articles in batches to manage API costs."""
    results = []
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        # Combine into single prompt for batch efficiency
        combined = "\n---\n".join(
            f"[{j}] Title: {item.title}\nContent: {item.content[:500]}"
            for j, item in enumerate(batch)
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[{
                "role": "system",
                "content": f"Analyze each article. Return JSON: {{\"articles\": [{{\"index\", \"category\", \"severity\", \"summary\", \"sentiment\"}}]}}"
            }, {
                "role": "user",
                "content": combined,
            }],
        )
        batch_results = json.loads(response.choices[0].message.content)
        results.extend(batch_results.get("articles", []))
    return results
```

## Dashboard API (Node.js)

```typescript
/**
 * Express API with WebSocket for real-time intelligence feed.
 */
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

interface IntelItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  severity: number;
  source: string;
  url: string;
  timestamp: string;
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// In-memory store (use Redis/Postgres in production)
let feed: IntelItem[] = [];
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  // Send last 50 items on connect
  ws.send(JSON.stringify({ type: "init", items: feed.slice(0, 50) }));
  ws.on("close", () => clients.delete(ws));
});

function broadcast(item: IntelItem) {
  const msg = JSON.stringify({ type: "new", item });
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// Ingest endpoint (called by Python pipeline)
app.post("/api/ingest", express.json(), (req, res) => {
  const item: IntelItem = {
    ...req.body,
    timestamp: new Date().toISOString(),
  };
  feed.unshift(item);
  feed = feed.slice(0, 1000); // Keep last 1000
  broadcast(item);
  res.json({ ok: true });
});

// Query endpoint with filters
app.get("/api/feed", (req, res) => {
  let items = feed;
  const { category, minSeverity, limit } = req.query;
  if (category) items = items.filter((i) => i.category === category);
  if (minSeverity) items = items.filter((i) => i.severity >= Number(minSeverity));
  res.json(items.slice(0, Number(limit) || 50));
});

server.listen(3000, () => console.log("Intelligence dashboard on :3000"));
```

## Alert Rules

```python
"""Send alerts when severity exceeds threshold."""
import httpx

ALERT_RULES = [
    {"category": "security", "min_severity": 7, "channel": "slack"},
    {"category": "market-move", "min_severity": 8, "channel": "email"},
    {"category": "*", "min_severity": 9, "channel": "all"},
]

async def check_alerts(item: dict):
    for rule in ALERT_RULES:
        cat_match = rule["category"] == "*" or rule["category"] == item["category"]
        if cat_match and item["severity"] >= rule["min_severity"]:
            await send_alert(rule["channel"], item)

async def send_alert(channel: str, item: dict):
    msg = f"🚨 [{item['category'].upper()}] Severity {item['severity']}/10\n{item['title']}\n{item['summary']}"
    if channel in ("slack", "all"):
        await httpx.AsyncClient().post(
            "https://hooks.slack.com/services/YOUR/WEBHOOK",
            json={"text": msg},
        )
    if channel in ("email", "all"):
        # Use your email service (SendGrid, SES, etc.)
        pass
```

## Polling Schedule

```python
"""Run the full pipeline on a schedule."""
import asyncio

async def monitor_loop(interval_minutes: int = 15):
    while True:
        items = await fetch_all(RSS_FEEDS, NEWSAPI_KEY, QUERIES)
        unique = deduplicate(items)
        for item in unique:
            analysis = analyze_article(item)
            # Push to dashboard
            async with httpx.AsyncClient() as c:
                await c.post("http://localhost:3000/api/ingest", json=analysis)
            await check_alerts(analysis)
        await asyncio.sleep(interval_minutes * 60)
```

## Source Recommendations

| Source | Free Tier | Best For |
|--------|-----------|----------|
| **NewsAPI.org** | 100 req/day | General news |
| **GNews.io** | 100 req/day | Headlines |
| **RSS Feeds** | Unlimited | Tech, finance blogs |
| **Reddit API** | Free | Community sentiment |
| **Hacker News API** | Unlimited | Tech trends |
| **GDELT** | Unlimited | Geopolitical events |

## Best Practices

1. **Dedup aggressively** — The same story appears across 20+ outlets. Dedup by title similarity
2. **Batch AI calls** — Process 10 articles per LLM call instead of 1. Saves 90% on API costs
3. **Severity calibration** — Periodically review severity scores. LLMs tend to over-rate severity
4. **Source diversity** — Mix mainstream, niche, and social sources for balanced coverage
5. **Rate limit respect** — Cache RSS feeds for 15-30 min. Don't hammer free APIs
6. **Historical storage** — Keep analyzed articles in a DB for trend analysis over time

## Dependencies

```bash
pip install feedparser httpx openai     # Python pipeline
npm install express ws                   # Node.js dashboard
```
