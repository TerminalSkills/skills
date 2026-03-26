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
  category: data-ai
  tags: [intelligence, news-aggregation, geopolitical, monitoring, dashboard]
  use-cases:
    - "Build a real-time news monitoring dashboard for a specific industry"
    - "Create an AI-powered intelligence feed that summarizes global events"
    - "Monitor competitor news and market changes in real-time"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# World Monitor

## Overview

Build real-time intelligence dashboards that ingest data from multiple sources (RSS, news APIs, social media), use AI to categorize, summarize, deduplicate, and score severity, then push updates to a live dashboard. Think of it as your own AI-powered situation room.

## Instructions

When a user asks to build a news monitoring system, intelligence dashboard, or event aggregation feed:

1. **Define scope** — What topics/regions/industries to monitor?
2. **Select sources** — RSS feeds, NewsAPI, social APIs, custom scrapers
3. **Set up pipeline** — Ingest → Deduplicate → Classify → Summarize → Score
4. **Build output** — API + WebSocket for real-time push, alert rules

### Source Ingestion (Python)

```python
"""Fetch from multiple source types in parallel."""
import asyncio, hashlib, feedparser, httpx
from datetime import datetime, timezone

class NewsItem:
    def __init__(self, title: str, content: str, source: str, url: str, published: datetime):
        self.title, self.content, self.source, self.url = title, content, source, url
        self.published = published
        self.id = hashlib.sha256(f"{title}{url}".encode()).hexdigest()[:16]

async def fetch_rss(feeds: list[str]) -> list[NewsItem]:
    items = []
    async with httpx.AsyncClient(timeout=15) as client:
        responses = await asyncio.gather(*[client.get(url) for url in feeds], return_exceptions=True)
    for resp in responses:
        if isinstance(resp, Exception):
            continue
        feed = feedparser.parse(resp.text)
        for entry in feed.entries[:20]:
            items.append(NewsItem(
                title=entry.get("title", ""), content=entry.get("summary", ""),
                source=feed.feed.get("title", "RSS"), url=entry.get("link", ""),
                published=datetime.now(timezone.utc),
            ))
    return items

async def fetch_newsapi(query: str, api_key: str) -> list[NewsItem]:
    async with httpx.AsyncClient() as client:
        resp = await client.get("https://newsapi.org/v2/everything",
            params={"q": query, "sortBy": "publishedAt", "pageSize": 50},
            headers={"X-Api-Key": api_key})
        data = resp.json()
    return [
        NewsItem(title=a["title"], content=a.get("description", ""),
                 source=a["source"]["name"], url=a["url"],
                 published=datetime.fromisoformat(a["publishedAt"].replace("Z", "+00:00")))
        for a in data.get("articles", [])
    ]
```

### Deduplication

```python
from difflib import SequenceMatcher

def deduplicate(items: list[NewsItem], threshold: float = 0.75) -> list[NewsItem]:
    unique, seen_titles = [], []
    for item in sorted(items, key=lambda x: x.published, reverse=True):
        is_dup = any(SequenceMatcher(None, item.title.lower(), s.lower()).ratio() > threshold for s in seen_titles)
        if not is_dup:
            unique.append(item)
            seen_titles.append(item.title)
    return unique
```

### AI Classification & Summarization

```python
import json
from openai import OpenAI

client = OpenAI()
CATEGORIES = ["geopolitics", "technology", "finance", "security", "climate", "health", "regulation", "market-move"]

def analyze_article(item: NewsItem) -> dict:
    response = client.chat.completions.create(
        model="gpt-4o-mini", response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": f"Analyze this news. Return JSON: {{category: one of {CATEGORIES}, severity: 1-10, summary: '2-3 sentences', entities: [], sentiment: 'positive|negative|neutral', actionable: bool}}"},
            {"role": "user", "content": f"Title: {item.title}\n\nContent: {item.content[:2000]}"},
        ],
    )
    analysis = json.loads(response.choices[0].message.content)
    return {**analysis, "id": item.id, "title": item.title, "url": item.url, "source": item.source}
```

### Dashboard API (Node.js)

```typescript
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

interface IntelItem {
  id: string; title: string; summary: string; category: string;
  severity: number; source: string; url: string; timestamp: string;
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
let feed: IntelItem[] = [];
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "init", items: feed.slice(0, 50) }));
  ws.on("close", () => clients.delete(ws));
});

function broadcast(item: IntelItem) {
  const msg = JSON.stringify({ type: "new", item });
  clients.forEach((ws) => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

app.post("/api/ingest", express.json(), (req, res) => {
  const item: IntelItem = { ...req.body, timestamp: new Date().toISOString() };
  feed.unshift(item);
  feed = feed.slice(0, 1000);
  broadcast(item);
  res.json({ ok: true });
});

app.get("/api/feed", (req, res) => {
  let items = feed;
  const { category, minSeverity, limit } = req.query;
  if (category) items = items.filter((i) => i.category === category);
  if (minSeverity) items = items.filter((i) => i.severity >= Number(minSeverity));
  res.json(items.slice(0, Number(limit) || 50));
});

server.listen(3000, () => console.log("Intelligence dashboard on :3000"));
```

### Alert Rules

```python
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
    msg = f"[{item['category'].upper()}] Severity {item['severity']}/10\n{item['title']}\n{item['summary']}"
    if channel in ("slack", "all"):
        await httpx.AsyncClient().post("https://hooks.slack.com/services/YOUR/WEBHOOK", json={"text": msg})
```

## Examples

### Example 1: Tech Industry News Monitor

```python
RSS_FEEDS = [
    "https://feeds.arstechnica.com/arstechnica/index",
    "https://techcrunch.com/feed/",
    "https://www.theverge.com/rss/index.xml",
]

async def run_tech_monitor():
    items = await fetch_rss(RSS_FEEDS)
    unique = deduplicate(items)
    for item in unique[:20]:
        analysis = analyze_article(item)
        async with httpx.AsyncClient() as c:
            await c.post("http://localhost:3000/api/ingest", json=analysis)
        await check_alerts(analysis)
        # Output: {"category": "technology", "severity": 4, "summary": "Apple announced..."}
```

### Example 2: Geopolitical Event Monitoring with Scheduled Polling

```python
async def monitor_loop(interval_minutes: int = 15):
    """Run the full pipeline on a schedule."""
    while True:
        items = await fetch_rss(RSS_FEEDS)
        newsapi_items = await fetch_newsapi("geopolitics OR sanctions", NEWSAPI_KEY)
        all_items = items + newsapi_items
        unique = deduplicate(all_items)
        for item in unique:
            analysis = analyze_article(item)
            async with httpx.AsyncClient() as c:
                await c.post("http://localhost:3000/api/ingest", json=analysis)
            await check_alerts(analysis)
        await asyncio.sleep(interval_minutes * 60)
        # Runs every 15 min, deduplicates across sources, alerts on severity >= 7
```

## Guidelines

1. **Dedup aggressively** — The same story appears across 20+ outlets. Dedup by title similarity
2. **Batch AI calls** — Process 10 articles per LLM call instead of 1 to save ~90% on API costs
3. **Severity calibration** — Periodically review severity scores. LLMs tend to over-rate severity
4. **Source diversity** — Mix mainstream, niche, and social sources for balanced coverage
5. **Rate limit respect** — Cache RSS feeds for 15-30 min. Don't hammer free APIs
6. **Historical storage** — Keep analyzed articles in a DB for trend analysis over time

## Dependencies

```bash
pip install feedparser httpx openai     # Python pipeline
npm install express ws                   # Node.js dashboard
```
