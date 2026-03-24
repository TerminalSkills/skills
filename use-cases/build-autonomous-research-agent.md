---
title: Build an Autonomous Research Agent
slug: build-autonomous-research-agent
description: Build a DeerFlow-inspired autonomous research agent that takes a single question and produces a full multi-page report — searching the web, synthesizing sources, and writing with citations, with human-in-the-loop checkpoints.
skills:
  - deer-flow
  - langchain
  - langgraph
  - anthropic-sdk
category: ai-agents
tags:
  - agents
  - research
  - langgraph
  - autonomous
  - deerflow
  - report-generation
---

## The Problem

Maya is a research analyst at a strategy consulting firm. When a client asks "What's the competitive landscape for B2B CRM tools?", she spends 8–12 hours reading analyst reports, vendor websites, G2 reviews, and LinkedIn posts — then another 4 hours writing the summary. That's 12 hours for a report her clients read in 20 minutes.

She's heard about AI research tools but every tool she's tried either hallucinates sources, stops after a shallow summary, or requires her to manually guide every step. She needs an agent that can actually run autonomously for hours — doing the deep dive she would do, not just surfacing the first few Google results.

## The Solution

Use `deer-flow` as the orchestration backbone: a LangGraph workflow modeled after ByteDance's DeerFlow architecture. The workflow routes tasks through a Coordinator (understands the goal), Planner (breaks it into research tasks), Researcher (executes web searches), Writer (synthesizes findings), and Publisher (formats the final report). Human approval checkpoints prevent runaway costs and keep Maya in control.

## Step-by-Step Walkthrough

### Step 1: Define the Research Workflow State

```python
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from typing import TypedDict, List
import json

class ResearchState(TypedDict):
    query: str                    # Original research question
    research_plan: List[str]      # Sub-questions to investigate
    search_results: List[dict]    # Raw search results
    synthesized_findings: str     # Synthesized analysis
    report_draft: str             # Draft report
    final_report: str             # Polished output
    human_approved: bool          # Checkpoint flag
    iteration: int                # Loop counter

llm = ChatAnthropic(model="claude-opus-4-5")
fast_llm = ChatAnthropic(model="claude-haiku-4-5")
```

### Step 2: Coordinator — Understand the Goal

```python
def coordinator(state: ResearchState) -> ResearchState:
    """Clarifies the research question and sets scope."""
    response = llm.invoke([{
        "role": "user",
        "content": f"""You are a research coordinator. Analyze this research request:

"{state['query']}"

Clarify:
1. What is the core question being asked?
2. What dimensions should be covered? (market size, key players, trends, risks)
3. What's the appropriate depth? (surface overview vs. deep dive)
4. What are 5-8 specific sub-questions that would fully answer this?

Return as JSON with keys: core_question, dimensions, sub_questions (list)"""
    }])

    try:
        parsed = json.loads(response.content)
        plan = parsed.get("sub_questions", [state["query"]])
    except:
        plan = [state["query"]]

    return {"research_plan": plan}
```

### Step 3: Researcher — Execute Web Search

```python
from tavily import TavilyClient
import os

tavily = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

def researcher(state: ResearchState) -> ResearchState:
    """Searches the web for each sub-question."""
    all_results = []

    for sub_question in state["research_plan"]:
        results = tavily.search(
            query=sub_question,
            search_depth="advanced",
            max_results=5,
            include_raw_content=True
        )
        all_results.append({
            "question": sub_question,
            "sources": results.get("results", [])
        })

    return {"search_results": all_results}
```

### Step 4: Human-in-the-Loop Checkpoint

```python
def human_review_checkpoint(state: ResearchState) -> ResearchState:
    """Pause for human approval before expensive synthesis step."""
    print("\n=== RESEARCH PLAN READY FOR REVIEW ===")
    print(f"Query: {state['query']}")
    print(f"\nSub-questions to research ({len(state['research_plan'])}):")
    for i, q in enumerate(state['research_plan'], 1):
        print(f"  {i}. {q}")
    print(f"\nSources found: {sum(len(r['sources']) for r in state['search_results'])}")
    print("\nProceed with synthesis? (yes/no): ", end="")

    approval = input().strip().lower()
    return {"human_approved": approval == "yes"}

def should_continue(state: ResearchState) -> str:
    return "writer" if state["human_approved"] else END
```

### Step 5: Writer — Synthesize Findings

```python
def writer(state: ResearchState) -> ResearchState:
    """Synthesizes all search results into a coherent analysis."""

    # Format sources for LLM
    sources_text = ""
    for result in state["search_results"]:
        sources_text += f"\n### Sub-question: {result['question']}\n"
        for source in result["sources"][:3]:  # Top 3 per question
            sources_text += f"**Source:** {source.get('url', 'unknown')}\n"
            sources_text += f"{source.get('content', '')[:500]}\n\n"

    response = llm.invoke([{
        "role": "user",
        "content": f"""You are a senior research analyst. Synthesize these research findings into a comprehensive analysis.

ORIGINAL QUERY: {state['query']}

RESEARCH FINDINGS:
{sources_text}

Write a detailed analysis covering:
1. Executive Summary (3-4 sentences)
2. Key Players and Market Structure
3. Market Trends and Dynamics
4. Competitive Positioning
5. Risks and Challenges
6. Conclusions and Recommendations

Include inline citations like [Source: URL]. Be specific and data-driven."""
    }])

    return {"synthesized_findings": response.content}
```

### Step 6: Publisher — Format the Final Report

```python
def publisher(state: ResearchState) -> ResearchState:
    """Formats the analysis into a polished, structured report."""
    response = llm.invoke([{
        "role": "user",
        "content": f"""Format this research analysis into a professional report.

ANALYSIS:
{state['synthesized_findings']}

Format requirements:
- Title with date
- Table of contents
- Executive summary box
- Numbered sections with clear headers
- Key metrics in bold
- Bullet-point key takeaways at end
- Sources appendix

Output clean Markdown suitable for export to PDF."""
    }])

    # Save to file
    with open(f"research_report_{state['query'][:30].replace(' ', '_')}.md", "w") as f:
        f.write(response.content)

    return {"final_report": response.content}
```

### Step 7: Assemble the Graph

```python
def build_research_graph():
    graph = StateGraph(ResearchState)

    graph.add_node("coordinator", coordinator)
    graph.add_node("researcher", researcher)
    graph.add_node("human_review", human_review_checkpoint)
    graph.add_node("writer", writer)
    graph.add_node("publisher", publisher)

    graph.set_entry_point("coordinator")
    graph.add_edge("coordinator", "researcher")
    graph.add_edge("researcher", "human_review")
    graph.add_conditional_edges("human_review", should_continue, {
        "writer": "writer",
        END: END
    })
    graph.add_edge("writer", "publisher")
    graph.add_edge("publisher", END)

    return graph.compile()

# Run the research agent
research_agent = build_research_graph()

result = research_agent.invoke({
    "query": "What is the competitive landscape for B2B CRM tools in 2025?",
    "research_plan": [],
    "search_results": [],
    "synthesized_findings": "",
    "report_draft": "",
    "final_report": "",
    "human_approved": False,
    "iteration": 0
})

print(result["final_report"])
```

## Tips & Extensions

- **Parallel research**: Fan out researcher nodes for each sub-question simultaneously using LangGraph's `Send` API for 3-5x speedup.
- **PDF export**: Add `pypandoc` or `weasyprint` to convert the Markdown report to PDF in the publisher node.
- **Cost control**: Add token counting and set a budget limit — abort if estimated cost exceeds threshold before the synthesis step.
- **Citation verification**: Add a fact-checker node that re-fetches sources and confirms quoted statistics exist in the original.
- **Iterative deepening**: Loop back to researcher if the writer identifies gaps ("I found no data on pricing models").
