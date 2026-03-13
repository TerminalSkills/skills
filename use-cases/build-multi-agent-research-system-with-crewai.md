---
title: Build a Multi-Agent Research System with CrewAI
slug: build-multi-agent-research-system-with-crewai
description: Build an automated market research pipeline using CrewAI for multi-agent orchestration, PydanticAI for type-safe data extraction, and Haystack for RAG-based document analysis — where a crew of AI agents collaborates to research competitors, analyze market trends, and produce investor-ready reports in 10 minutes instead of 2 weeks.
skills: [crewai, pydantic-ai, haystack]
category: AI & Machine Learning
tags: [ai-agents, multi-agent, research, rag, automation, market-analysis]
---

# Build a Multi-Agent Research System with CrewAI

Elena is head of strategy at a Series B startup. Every quarter she needs competitive intelligence reports covering 15 competitors, market sizing, trend analysis, and strategic recommendations. Currently, a junior analyst spends 2 weeks compiling each report — searching the web, reading earnings calls, analyzing product changelogs, and writing up findings.

Elena builds a multi-agent system where specialized AI agents handle different aspects of research, validate each other's findings, and produce a structured report — reducing 2 weeks to 10 minutes per run.

## Step 1: RAG Knowledge Base with Haystack

Before the agents can research, they need access to the company's existing intelligence: past reports, competitor profiles, industry analyses, and internal strategy documents.

```python
# knowledge_base.py — Build searchable knowledge base
from haystack import Pipeline, Document
from haystack.components.embedders import SentenceTransformersDocumentEmbedder, SentenceTransformersTextEmbedder
from haystack.components.writers import DocumentWriter
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.components.converters import PyPDFToDocument, MarkdownToDocument
from haystack.components.preprocessors import DocumentSplitter
from pathlib import Path

document_store = InMemoryDocumentStore()

def index_documents(docs_dir: str):
    """Index all documents from a directory into the knowledge base.

    Args:
        docs_dir: Path to directory containing PDFs and markdown files
    """
    documents = []
    
    for path in Path(docs_dir).rglob("*.md"):
        converter = MarkdownToDocument()
        result = converter.run(sources=[path])
        for doc in result["documents"]:
            doc.meta["source"] = str(path)
            doc.meta["type"] = "internal"
            documents.append(doc)

    for path in Path(docs_dir).rglob("*.pdf"):
        converter = PyPDFToDocument()
        result = converter.run(sources=[path])
        for doc in result["documents"]:
            doc.meta["source"] = str(path)
            doc.meta["type"] = "report"
            documents.append(doc)

    # Split into chunks
    splitter = DocumentSplitter(split_by="sentence", split_length=5, split_overlap=1)
    chunks = splitter.run(documents=documents)["documents"]

    # Embed and store
    indexing = Pipeline()
    indexing.add_component("embedder", SentenceTransformersDocumentEmbedder(
        model="BAAI/bge-small-en-v1.5",
    ))
    indexing.add_component("writer", DocumentWriter(document_store=document_store))
    indexing.connect("embedder", "writer")
    indexing.run({"embedder": {"documents": chunks}})

    print(f"Indexed {len(chunks)} chunks from {len(documents)} documents")

# Build retrieval pipeline
def build_retriever():
    retriever = Pipeline()
    retriever.add_component("embedder", SentenceTransformersTextEmbedder(
        model="BAAI/bge-small-en-v1.5",
    ))
    retriever.add_component("retriever", InMemoryEmbeddingRetriever(
        document_store=document_store, top_k=10,
    ))
    retriever.connect("embedder.embedding", "retriever.query_embedding")
    return retriever
```

## Step 2: Type-Safe Data Extraction with PydanticAI

Each piece of competitive intelligence is extracted into validated Pydantic models — ensuring consistent data quality across all agents.

```python
# models.py — Structured output models
from pydantic import BaseModel, Field
from pydantic_ai import Agent

class CompetitorProfile(BaseModel):
    """Validated competitor data extracted by AI agents."""
    name: str
    website: str
    founded: int
    funding_total: str = Field(description="Total funding raised, e.g. '$45M'")
    employee_count: str = Field(description="Estimated range, e.g. '50-100'")
    positioning: str = Field(description="One-sentence market positioning")
    key_products: list[str]
    target_market: str
    pricing_model: str
    strengths: list[str] = Field(min_length=2, max_length=5)
    weaknesses: list[str] = Field(min_length=2, max_length=5)
    recent_moves: list[str] = Field(description="Notable actions in last 6 months")

class MarketTrend(BaseModel):
    """Validated market trend observation."""
    trend_name: str
    description: str
    evidence: list[str] = Field(min_length=2, description="Data points supporting this trend")
    impact: str = Field(description="Low/Medium/High impact on our business")
    timeline: str = Field(description="When this trend will peak")
    opportunity: str = Field(description="How we can capitalize on this trend")

class StrategicRecommendation(BaseModel):
    """Validated strategic recommendation."""
    title: str
    priority: str = Field(description="P0 (critical) / P1 (high) / P2 (medium)")
    description: str
    rationale: str
    effort: str = Field(description="Small (1-2 weeks) / Medium (1-2 months) / Large (quarter+)")
    expected_impact: str
    risks: list[str]

# PydanticAI agent for type-safe extraction
competitor_extractor = Agent(
    "anthropic:claude-sonnet-4-20250514",
    result_type=CompetitorProfile,
    system_prompt="Extract structured competitor data from the provided research. Be precise with numbers and dates.",
)
```

## Step 3: Multi-Agent Crew with CrewAI

```python
# crew.py — Research crew with specialized agents
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool, ScrapeWebsiteTool

search = SerperDevTool()
scrape = ScrapeWebsiteTool()

# Agent 1: Web Researcher — finds raw data
web_researcher = Agent(
    role="Competitive Intelligence Researcher",
    goal="Find comprehensive, current data about competitors in the {market} space",
    backstory="""You are a senior CI analyst at Gartner with 12 years of experience.
    You know exactly where to find funding data, product launches, hiring signals,
    and strategic moves. You verify facts from multiple sources.""",
    tools=[search, scrape],
    llm="anthropic:claude-sonnet-4-20250514",
    max_iter=8,
    verbose=True,
)

# Agent 2: Knowledge Base Analyst — searches internal docs
kb_analyst = Agent(
    role="Internal Knowledge Analyst",
    goal="Find relevant insights from past reports and strategy documents about {market}",
    backstory="""You manage the company's competitive intelligence database.
    You know every past report, strategy deck, and market analysis.
    You find patterns across historical data that others miss.""",
    tools=[KnowledgeBaseTool(retriever=build_retriever())],
    llm="anthropic:claude-sonnet-4-20250514",
    verbose=True,
)

# Agent 3: Strategy Analyst — synthesizes findings
strategist = Agent(
    role="Chief Strategy Analyst",
    goal="Synthesize research into actionable strategic recommendations for {market} positioning",
    backstory="""You are a former BCG partner who now advises tech startups.
    You think in terms of competitive moats, market positioning, and
    asymmetric advantages. You always prioritize recommendations by impact.""",
    llm="anthropic:claude-sonnet-4-20250514",
    verbose=True,
)

# Agent 4: Report Writer — produces final deliverable
report_writer = Agent(
    role="Executive Report Writer",
    goal="Transform strategy analysis into a board-ready competitive intelligence report",
    backstory="""You write reports for C-suite executives and board members.
    Every sentence must be backed by data. You use clear headers,
    bullet points, and highlight key metrics.""",
    llm="anthropic:claude-sonnet-4-20250514",
    verbose=True,
)

# Tasks
research_task = Task(
    description="""Research these competitors in the {market} space: {competitors}
    
    For each competitor, find:
    - Company overview (founding, funding, team size)
    - Core products and recent launches (last 6 months)
    - Pricing model and target customer
    - Strengths and weaknesses
    - Recent strategic moves (partnerships, acquisitions, pivots)
    
    Use multiple sources for each data point. Flag anything uncertain.""",
    expected_output="Detailed research dossier with sourced data for each competitor",
    agent=web_researcher,
)

kb_task = Task(
    description="""Search our internal knowledge base for:
    - Past assessments of competitors: {competitors}
    - Historical market sizing for {market}
    - Previous strategic recommendations that are still relevant
    - Customer feedback mentioning competitors""",
    expected_output="Summary of relevant internal intelligence with references",
    agent=kb_analyst,
)

analysis_task = Task(
    description="""Synthesize the web research and internal knowledge into:
    1. Updated competitor profiles (structured data for each)
    2. Market trend analysis (3-5 key trends with evidence)
    3. SWOT for our position in {market}
    4. Strategic recommendations (prioritized P0/P1/P2)
    5. 90-day action plan""",
    expected_output="Comprehensive strategic analysis document",
    agent=strategist,
    context=[research_task, kb_task],
)

report_task = Task(
    description="""Write a board-ready competitive intelligence report:
    - Executive summary (250 words max)
    - Market landscape with competitor positioning map
    - Key trends and their impact
    - Strategic recommendations with effort/impact matrix
    - 90-day roadmap
    - Risk assessment
    
    Format: Professional markdown. Every claim must cite the source.""",
    expected_output="Publication-ready CI report in markdown (~3000 words)",
    agent=report_writer,
    context=[research_task, kb_task, analysis_task],
    output_file="output/competitive_intelligence_report.md",
)

# Assemble and run
crew = Crew(
    agents=[web_researcher, kb_analyst, strategist, report_writer],
    tasks=[research_task, kb_task, analysis_task, report_task],
    process=Process.sequential,
    verbose=True,
    memory=True,
)

result = crew.kickoff(inputs={
    "market": "AI developer tools",
    "competitors": "Cursor, Codeium, Tabnine, Replit, Bolt.new",
})
```

## Results

Elena runs the system every Monday morning. The crew produces a 3,000-word report with structured competitor profiles, trend analysis, and prioritized recommendations in 10 minutes.

- **Research time**: 2 weeks → 10 minutes per run
- **Coverage**: 15 competitors analyzed with 45+ data points each (vs. 5-8 data points manually)
- **Consistency**: Pydantic validation ensures every competitor profile has all required fields
- **Historical context**: RAG retrieves relevant insights from 2 years of past reports
- **Cost**: ~$2.50 per report run (4 agents × ~15K tokens each) vs. $4,000 analyst time
- **Frequency**: Weekly CI reports (was quarterly due to analyst bandwidth)
- **Accuracy**: Strategy team rates AI reports 8.2/10 vs. 7.8/10 for analyst reports (after 3 months of tuning)
