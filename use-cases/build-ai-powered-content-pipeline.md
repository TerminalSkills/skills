---
title: Build an AI-Powered Content Pipeline with Agents and Evaluation
slug: build-ai-powered-content-pipeline
description: Build an automated content production pipeline where CrewAI agents research topics and write articles, Haystack indexes content for RAG-based Q&A, Braintrust evaluates quality, Trigger.dev orchestrates the workflow as background jobs, and Crawl4AI feeds the system with fresh web data — creating a self-improving content engine that produces, evaluates, and publishes articles autonomously.
skills: [crewai, haystack, braintrust, trigger-dev-v3, crawl4ai, qdrant]
category: data-ai
tags: [content, agents, rag, evaluation, pipeline, automation]
---

# Build an AI-Powered Content Pipeline with Agents and Evaluation

Omar runs a developer-focused newsletter. He publishes 5 articles/week but spends 15 hours researching and writing. He wants an AI pipeline that crawls trending topics, researches them with specialized agents, writes draft articles, evaluates quality against his standards, and publishes the approved ones — reducing his role from writer to editor.

## Step 1: Crawl Trending Topics with Crawl4AI

```python
# tasks/crawl_sources.py — Discover trending topics
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
from crawl4ai.extraction_strategy import LLMExtractionStrategy
from pydantic import BaseModel

class TrendingTopic(BaseModel):
    title: str
    summary: str
    source_url: str
    relevance_score: float

extraction = LLMExtractionStrategy(
    provider="openai/gpt-4o-mini",
    schema=TrendingTopic.model_json_schema(),
    instruction="Extract trending developer topics with high relevance",
)

async def crawl_sources():
    topics = []
    sources = [
        "https://news.ycombinator.com",
        "https://dev.to/top/week",
        "https://lobste.rs",
    ]
    async with AsyncWebCrawler() as crawler:
        for url in sources:
            result = await crawler.arun(url=url, config=CrawlerRunConfig(extraction_strategy=extraction))
            topics.extend(json.loads(result.extracted_content))

    # Deduplicate and rank
    return sorted(topics, key=lambda t: t["relevance_score"], reverse=True)[:10]
```

## Step 2: Research and Write with CrewAI

```python
from crewai import Agent, Task, Crew, Process

researcher = Agent(
    role="Tech Researcher",
    goal="Find comprehensive, accurate technical content",
    tools=[web_search_tool, crawl4ai_tool],
    llm="gpt-4o",
)

writer = Agent(
    role="Developer Content Writer",
    goal="Write engaging, technically accurate articles for developers",
    llm="gpt-4o",
)

def create_article_crew(topic: dict):
    research_task = Task(
        description=f"Research '{topic['title']}'. Find 5+ sources, code examples, expert opinions.",
        expected_output="Research report with citations and code snippets",
        agent=researcher,
    )
    writing_task = Task(
        description="Write a 1200-word article. Include intro, 3 sections with code, conclusion.",
        expected_output="Complete article in markdown",
        agent=writer,
        context=[research_task],
    )
    return Crew(agents=[researcher, writer], tasks=[research_task, writing_task], process=Process.sequential)
```

## Step 3: Index in Knowledge Base with Haystack + Qdrant

```python
from haystack import Pipeline
from haystack.components.embedders import OpenAIDocumentEmbedder
from haystack_integrations.document_stores.qdrant import QdrantDocumentStore

store = QdrantDocumentStore(url="http://localhost:6333", index="articles", embedding_dim=1536)

indexing = Pipeline()
indexing.add_component("embedder", OpenAIDocumentEmbedder())
indexing.add_component("writer", DocumentWriter(document_store=store))
indexing.connect("embedder", "writer")

def index_article(title: str, content: str, metadata: dict):
    doc = Document(content=content, meta={"title": title, **metadata})
    indexing.run({"embedder": {"documents": [doc]}})
```

## Step 4: Evaluate Quality with Braintrust

```python
from braintrust import Eval
from autoevals import Factuality, ClosedQA

async def evaluate_article(article: str, topic: dict):
    results = await Eval("content-pipeline", {
        "data": [{"input": topic["title"], "expected": topic["summary"], "output": article}],
        "scores": [
            Factuality,
            lambda output, expected: {"name": "length", "score": 1.0 if 800 < len(output.split()) < 1500 else 0.5},
            lambda output, expected: {"name": "code_examples", "score": 1.0 if "```" in output else 0.0},
            lambda output, expected: {"name": "structure", "score": 1.0 if output.count("##") >= 3 else 0.5},
        ],
    })
    avg_score = sum(s["score"] for s in results.scores) / len(results.scores)
    return avg_score >= 0.75               # Publish threshold
```

## Step 5: Orchestrate with Trigger.dev

```typescript
// trigger/content-pipeline.ts
import { task, schedules } from "@trigger.dev/sdk/v3";

export const contentPipeline = schedules.task({
  id: "weekly-content-pipeline",
  cron: "0 6 * * 1,3,5",                  // Mon, Wed, Fri at 6 AM
  run: async () => {
    // 1. Crawl trending topics
    const topics = await crawlTrendingSources();

    // 2. Generate articles for top 3 topics
    for (const topic of topics.slice(0, 3)) {
      const article = await generateArticle.triggerAndWait({ topic });

      // 3. Evaluate quality
      const passed = await evaluateArticle.triggerAndWait({
        article: article.output.content,
        topic,
      });

      if (passed.output.approved) {
        // 4. Index in knowledge base
        await indexArticle.trigger({ title: topic.title, content: article.output.content });

        // 5. Queue for publishing
        await publishArticle.trigger({ content: article.output.content, topic });
      }
    }
  },
});
```

## Results

After 6 weeks of running the pipeline:

- **Output**: 15 articles/week (up from 5); Omar reviews/edits 3 hours instead of 15 hours writing
- **Quality**: 82% of AI-generated articles pass Braintrust evaluation on first attempt
- **Knowledge base**: 90 articles indexed in Qdrant; RAG-powered Q&A answers reader questions
- **Cost**: $47/week in LLM costs (CrewAI research + writing + evaluation); saves 12 hours of Omar's time
- **Engagement**: Newsletter subscribers grew 40% due to 3x content frequency
- **Crawl coverage**: Crawl4AI processes 50+ pages/run across 3 sources; catches trends within 24 hours
- **Self-improvement**: Braintrust scores trending up 8% over 6 weeks as prompts were tuned based on eval data
