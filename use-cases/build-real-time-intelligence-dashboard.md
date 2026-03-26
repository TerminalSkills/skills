---
title: "Build a Real-Time Intelligence Dashboard"
slug: build-real-time-intelligence-dashboard
description: "Create a live intelligence dashboard that monitors news, social media, and market data with AI-powered categorization and deduplication."
skills: [worldmonitor, anthropic-sdk, resend]
category: data-ai
difficulty: advanced
time_estimate: "10 hours"
tags: [real-time, monitoring, intelligence, dashboard, websocket, news-analysis, email-digest]
---

# Build a Real-Time Intelligence Dashboard

## The Problem

Analysts at consulting firms need to track 200+ sources across news, social media, and markets — then surface what actually matters. Tab-hopping between Bloomberg, Twitter, and Reuters wastes hours every day. Clients pay for insights, not information, but there is no single tool that ingests everything, deduplicates across sources, and delivers AI-filtered intelligence in real time.

Inspired by [WorldMonitor](https://github.com/worldmonitor/worldmonitor) (43k+ stars) — real-time global event tracking with AI classification.

## The Solution

Build a single dashboard that pulls from RSS feeds, Reddit, and news APIs in parallel, classifies each event with Claude for topic and severity, deduplicates using embedding similarity, pushes updates via WebSocket, and sends a daily email digest through Resend.

```
Sources (RSS, Twitter/X, Reddit, News APIs)
            ↓
    Ingestion Workers (parallel)
            ↓
    AI Classification & Scoring
            ↓
    Deduplication (embedding similarity)
            ↓
    Event Store (SQLite/Postgres)
            ↓
    WebSocket Push → Dashboard
            ↓
    Daily Digest → Email (Resend)
```

## Step-by-Step Walkthrough

### 1. Multi-Source Ingestion

```python
import feedparser
import asyncio
import httpx

SOURCES = {
    "rss": [
        "https://feeds.reuters.com/reuters/topNews",
        "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
        "https://feeds.bbci.co.uk/news/technology/rss.xml",
    ],
    "reddit": ["r/technology", "r/business", "r/worldnews"],
    "newsapi": {"query": "AI OR startup OR funding", "language": "en"}
}

async def ingest_rss(url: str) -> list[dict]:
    feed = feedparser.parse(url)
    return [{"title": e.title, "summary": e.summary, "url": e.link,
             "source": url, "published": e.published, "type": "rss"} for e in feed.entries[:20]]

async def ingest_reddit(subreddit: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"https://www.reddit.com/{subreddit}/hot.json",
                             headers={"User-Agent": "IntelDashboard/1.0"}, params={"limit": 25})
        posts = r.json()["data"]["children"]
        return [{"title": p["data"]["title"], "summary": p["data"]["selftext"][:500],
                 "url": f"https://reddit.com{p['data']['permalink']}",
                 "source": subreddit, "score": p["data"]["score"], "type": "reddit"} for p in posts]

async def ingest_all() -> list[dict]:
    tasks = [ingest_rss(url) for url in SOURCES["rss"]]
    tasks += [ingest_reddit(sub) for sub in SOURCES["reddit"]]
    results = await asyncio.gather(*tasks)
    return [item for batch in results for item in batch]
```

### 2. AI Classification & Severity Scoring

```python
import anthropic, json

client = anthropic.Anthropic()

def classify_event(event: dict) -> dict:
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=256,
        system="Classify news events. Return JSON: {topic: string, severity: 1-5, region: string, tags: [string], one_line: string}",
        messages=[{"role": "user", "content": f"Title: {event['title']}\nSummary: {event['summary'][:300]}"}]
    )
    classification = json.loads(response.content[0].text)
    return {**event, **classification}
```

### 3. Deduplication via Embedding Similarity

```python
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer("all-MiniLM-L6-v2")

def deduplicate(events: list[dict], threshold: float = 0.85) -> list[dict]:
    texts = [f"{e['title']} {e.get('one_line', '')}" for e in events]
    embeddings = model.encode(texts)

    keep = []
    for i, event in enumerate(events):
        is_dup = False
        for j in keep:
            sim = np.dot(embeddings[i], embeddings[j]) / (
                np.linalg.norm(embeddings[i]) * np.linalg.norm(embeddings[j]))
            if sim > threshold:
                # Merge: keep higher severity, append sources
                events[j].setdefault("related_sources", []).append(event["url"])
                is_dup = True
                break
        if not is_dup:
            keep.append(i)

    return [events[i] for i in keep]
```

### 4. WebSocket Push to Dashboard

```python
from fastapi import FastAPI, WebSocket
from contextlib import asynccontextmanager
import json

connected_clients: set[WebSocket] = set()

@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(poll_loop())
    yield
    task.cancel()

app = FastAPI(lifespan=lifespan)

@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive
    except:
        connected_clients.discard(websocket)

async def broadcast(events: list[dict]):
    for ws in connected_clients.copy():
        try:
            await ws.send_json(events)
        except:
            connected_clients.discard(ws)

async def poll_loop():
    while True:
        raw = await ingest_all()
        classified = [classify_event(e) for e in raw]
        unique = deduplicate(classified)
        new_events = save_and_filter_new(unique)
        if new_events:
            await broadcast(new_events)
        await asyncio.sleep(300)  # every 5 min
```

### 5. Daily Digest Email via Resend

```python
import resend

resend.api_key = "re_..."

def send_daily_digest(events: list[dict], recipient: str):
    # Group by topic, sort by severity
    by_topic = {}
    for e in events:
        by_topic.setdefault(e["topic"], []).append(e)

    html = "<h1>🌍 Daily Intelligence Digest</h1>"
    for topic, items in sorted(by_topic.items()):
        html += f"<h2>{topic}</h2><ul>"
        for item in sorted(items, key=lambda x: -x["severity"])[:5]:
            severity_emoji = "🔴🟠🟡🟢⚪"[5 - item["severity"]]
            html += f'<li>{severity_emoji} <a href="{item["url"]}">{item["title"]}</a><br><small>{item["one_line"]}</small></li>'
        html += "</ul>"

    resend.Emails.send({
        "from": "intel@yourdomain.com",
        "to": recipient,
        "subject": f"Intelligence Digest — {len(events)} events tracked",
        "html": html
    })
```

## Real-World Example

A geopolitical risk consultancy monitors 150 sources for a client in the energy sector. On a Monday morning, the dashboard ingests 1,200 items across Reuters, BBC, Reddit, and specialized energy RSS feeds. Claude classifies each item, flagging 8 as severity-5 (critical) — including breaking news about OPEC production cuts and a pipeline disruption in the Middle East. Embedding-based deduplication merges 45 duplicate articles about the OPEC announcement into a single event with 45 linked sources. The WebSocket dashboard highlights the critical events immediately, and the daily digest email groups them under "Energy & Commodities" with red severity indicators. The analyst walks into a client meeting fully briefed, having spent zero time manually scanning sources.

## Related Skills

- **[anthropic-sdk](/skills/anthropic-sdk)** — Claude API integration for event classification and severity scoring
- **[resend](/skills/resend)** — Transactional email for daily intelligence digests
- **[fastapi](/skills/fastapi)** — WebSocket server and API endpoints for the dashboard backend
- **[datadog](/skills/datadog)** — Production monitoring and alerting for the ingestion pipeline
- **[n8n](/skills/n8n)** — Workflow automation for connecting additional data sources

## What You'll Learn

- Multi-source data ingestion with async Python
- AI-powered event classification and severity scoring
- Embedding-based deduplication for news clustering
- Real-time WebSocket push architecture
- Automated email digests with Resend
- Building analyst-grade monitoring tools
