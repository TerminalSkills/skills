---
title: Build a Multi-Agent Research System with CrewAI
slug: build-multi-agent-research-system-with-crewai
description: Build an automated market research pipeline using CrewAI for multi-agent orchestration, PydanticAI for type-safe data extraction, and Haystack for RAG-based document analysis — where a crew of AI agents collaborates to research competitors, analyze market trends, and produce investor-ready reports in 10 minutes instead of 2 weeks.
skills: [crewai, pydantic-ai, haystack]
category: data-ai
tags: [ai-agents, multi-agent, research, rag, automation, market-analysis]
---

# Build a Multi-Agent Research System with CrewAI

Elena is head of strategy at a Series B startup. Every quarter she needs competitive intelligence reports covering a dozen competitors, market sizing, trend analysis, and strategic recommendations. Today a junior analyst spends two weeks compiling each one: searching the web, reading changelogs and earnings calls, and writing up findings.

Elena builds a multi-agent system where specialized agents handle different parts of the research, pass their work on as context, and produce a structured, sourced draft that a human then reviews. The agents are fast, not infallible, so every fact must carry a source URL and the report is checked before it goes to the board.

## Setup

Python 3.11-3.13 (CrewAI supports up to 3.13; PydanticAI and Haystack 3 need 3.11+). The `>=2` on PydanticAI matters: without it pip can settle on a 1.x release that fails to import next to the current OpenTelemetry. In Haystack 3 the sentence-transformers embedders live in a separate integration package.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install "crewai[anthropic,tools]" "pydantic-ai-slim[anthropic]>=2" \
  haystack-ai sentence-transformers-haystack pypdf markdown-it-py mdit-plain
export ANTHROPIC_API_KEY=...     # from your secret manager
export SERPER_API_KEY=...        # serper.dev key for SerperDevTool
```

## Step 1: RAG Knowledge Base with Haystack

Before the agents research the web, they need the company's existing intelligence: past reports, competitor profiles, internal strategy documents. Haystack indexes them into an in-memory store (swap in a vector database for production) and answers similarity queries. Splitting is by words, which needs no extra NLP downloads.

```python
# kb.py
from pathlib import Path
from haystack import Pipeline
from haystack.components.converters import MarkdownToDocument, PyPDFToDocument
from haystack_integrations.components.embedders.sentence_transformers import (
    SentenceTransformersDocumentEmbedder,
    SentenceTransformersTextEmbedder,
)
from haystack.components.preprocessors import DocumentSplitter
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
from haystack.components.writers import DocumentWriter
from haystack.document_stores.in_memory import InMemoryDocumentStore

MODEL = "BAAI/bge-small-en-v1.5"
document_store = InMemoryDocumentStore()


def index_documents(docs_dir: str) -> None:
    docs = []
    for pattern, converter in (("*.md", MarkdownToDocument()), ("*.pdf", PyPDFToDocument())):
        paths = list(Path(docs_dir).rglob(pattern))
        if paths:
            docs += converter.run(sources=paths)["documents"]

    indexing = Pipeline()
    indexing.add_component("splitter", DocumentSplitter(split_by="word", split_length=200, split_overlap=30))
    indexing.add_component("embedder", SentenceTransformersDocumentEmbedder(model=MODEL))
    indexing.add_component("writer", DocumentWriter(document_store=document_store))
    indexing.connect("splitter.documents", "embedder.documents")
    indexing.connect("embedder.documents", "writer.documents")
    indexing.run({"splitter": {"documents": docs}})


def search_knowledge_base(query: str, top_k: int = 5) -> list[str]:
    search = Pipeline()
    search.add_component("embedder", SentenceTransformersTextEmbedder(model=MODEL))
    search.add_component("retriever", InMemoryEmbeddingRetriever(document_store=document_store, top_k=top_k))
    search.connect("embedder.embedding", "retriever.query_embedding")
    hits = search.run({"embedder": {"text": query}})["retriever"]["documents"]
    return [f"[{d.meta.get('file_path', 'unknown')}] {d.content}" for d in hits]


if __name__ == "__main__":
    index_documents("docs")
    print(search_knowledge_base("enterprise private deployment"))
```

## Step 2: Type-Safe Extraction with PydanticAI

The research agents write prose. To compare competitors, Elena needs the same fields for each one, so a PydanticAI agent turns each dossier section into a validated `CompetitorProfile`. If the model returns a profile that breaks the schema (for example one strength where two are required), PydanticAI asks it to retry.

```python
# models.py
from pydantic import BaseModel, Field
from pydantic_ai import Agent


class CompetitorProfile(BaseModel):
    name: str
    website: str
    positioning: str = Field(description="One-sentence market positioning")
    key_products: list[str]
    target_market: str
    pricing_model: str
    strengths: list[str] = Field(min_length=2, max_length=5)
    weaknesses: list[str] = Field(min_length=2, max_length=5)
    recent_moves: list[str] = Field(description="Notable actions in the last 6 months")
    sources: list[str] = Field(min_length=1, description="URLs the facts came from")


extractor = Agent(
    "anthropic:claude-sonnet-5-5",
    output_type=CompetitorProfile,
    instructions=(
        "Extract a competitor profile from the research notes. Use only facts present "
        "in the notes; if a field is not stated, say 'not found' instead of guessing."
    ),
)


def extract_profile(notes: str) -> CompetitorProfile:
    return extractor.run_sync(notes).output
```

## Step 3: The Crew with CrewAI

Four agents run in sequence: a web researcher with search and scraping tools, an analyst with the Haystack knowledge base as a tool, a strategist, and a report writer. The strategist and writer receive earlier task outputs through `context`. The model string is `provider/model`; CrewAI uses its native Anthropic integration.

```python
# crew.py
from crewai import Agent, Crew, Process, Task
from crewai.tools import tool
from crewai_tools import ScrapeWebsiteTool, SerperDevTool

from kb import index_documents, search_knowledge_base
from models import extract_profile

LLM = "anthropic/claude-sonnet-5-5"


@tool("Internal knowledge base search")
def kb_search(query: str) -> str:
    """Search past reports and strategy documents. Returns the best matching passages with their source file."""
    return "\n\n".join(search_knowledge_base(query)) or "No matching internal documents."


web_researcher = Agent(
    role="Competitive Intelligence Researcher",
    goal="Find current, sourced facts about competitors in the {market} space",
    backstory="A careful analyst who checks every number against at least two sources and "
    "writes 'not found' when a fact cannot be sourced.",
    tools=[SerperDevTool(), ScrapeWebsiteTool()],
    llm=LLM,
    max_iter=8,
)
kb_analyst = Agent(
    role="Internal Knowledge Analyst",
    goal="Surface what our past reports and strategy documents say about {market}",
    backstory="Owns the company's competitive-intelligence archive and quotes it exactly.",
    tools=[kb_search],
    llm=LLM,
)
strategist = Agent(
    role="Chief Strategy Analyst",
    goal="Turn research into prioritized recommendations for our position in {market}",
    backstory="Thinks in moats, positioning and asymmetric advantages; ranks everything by impact.",
    llm=LLM,
)
report_writer = Agent(
    role="Executive Report Writer",
    goal="Write a board-ready competitive intelligence report",
    backstory="Writes for executives: short sentences, every claim tied to a source.",
    llm=LLM,
)

research_task = Task(
    description="Research these competitors in {market}: {competitors}. For each: funding and team "
    "size, products and launches in the last 6 months, pricing and target customer, strengths, "
    "weaknesses, strategic moves. Cite a URL for every fact; write 'not found' otherwise.",
    expected_output="A research dossier, one section per competitor, with source URLs",
    agent=web_researcher,
)
kb_task = Task(
    description="Search the internal knowledge base for past assessments of {competitors}, "
    "market sizing for {market}, and recommendations that still apply.",
    expected_output="Relevant internal findings with the source file for each",
    agent=kb_analyst,
)
analysis_task = Task(
    description="Combine the web research and internal findings into: market trends (3-5, with "
    "evidence), a SWOT for our position in {market}, prioritized recommendations (P0/P1/P2) and a "
    "90-day plan.",
    expected_output="A structured strategy analysis",
    agent=strategist,
    context=[research_task, kb_task],
)
report_task = Task(
    description="Write the report: executive summary (250 words max), landscape, trends, "
    "recommendations, 90-day roadmap, risks. Cite sources for every claim.",
    expected_output="A markdown report of about 3000 words",
    agent=report_writer,
    context=[research_task, kb_task, analysis_task],
    output_file="output/competitive_intelligence_report.md",
)

crew = Crew(
    agents=[web_researcher, kb_analyst, strategist, report_writer],
    tasks=[research_task, kb_task, analysis_task, report_task],
    process=Process.sequential,
    verbose=True,
)

if __name__ == "__main__":
    index_documents("knowledge")  # past reports, strategy docs (.md / .pdf)
    competitors = ["Cursor", "Tabnine", "Replit"]
    result = crew.kickoff(inputs={"market": "AI developer tools", "competitors": ", ".join(competitors)})

    # Validate the dossier into typed profiles (PydanticAI), one per competitor
    dossier = result.tasks_output[0].raw
    profiles = [extract_profile(f"Competitor: {c}\n\n{dossier}") for c in competitors]
    print(f"{len(profiles)} validated profiles; report in output/competitive_intelligence_report.md")
```

Run it with `python crew.py`. Every factual claim in the report should trace to a URL from the research task; Elena spot-checks the figures that matter most (funding, pricing, headcount) before the report leaves her desk.

## Results

Elena runs the crew every Monday. A run produces a structured draft in minutes instead of days of analyst time, and the analyst now spends that time verifying numbers and adding judgement rather than collecting them. Run cost depends on the model and on how much the scraping tools pull in, so measure it on your own competitor list with the usage metrics CrewAI reports after `kickoff` before promising a budget.

## Related Skills

- [crewai](../skills/crewai/SKILL.md) — agents, tasks, tools and crews
- [pydantic-ai](../skills/pydantic-ai/SKILL.md) — validated, typed model output
- [haystack](../skills/haystack/SKILL.md) — document indexing and retrieval pipelines
