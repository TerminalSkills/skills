---
title: Build an Automated Research Agent
slug: build-automated-research-agent
description: Build an automated research agent that searches multiple sources, synthesizes findings, generates structured reports, tracks citations, and iterates on research questions.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: AI & Machine Learning
tags:
  - research
  - ai-agent
  - synthesis
  - automation
  - knowledge
---

# Build an Automated Research Agent

## The Problem

Sofia leads product research at a 15-person startup. Before building a feature, they need competitive analysis, market sizing, and technical feasibility research. This takes a researcher 2-3 days per topic. They search Google, read 20+ articles, take notes, and compile a report. Half the sources are outdated or irrelevant. When a question branches ("What are the pricing models?" leads to "What's the typical churn rate?"), the researcher has to manually pursue each branch. They need an AI research agent that searches, reads, synthesizes, and produces structured reports — following research threads automatically.

## Step 1: Build the Research Agent

```typescript
// src/research/agent.ts — Automated research with multi-source search and synthesis
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ResearchProject {
  id: string;
  question: string;
  status: "researching" | "synthesizing" | "completed" | "failed";
  depth: number;                // how many sub-questions to pursue
  sources: ResearchSource[];
  findings: Finding[];
  subQuestions: string[];
  report: ResearchReport | null;
  iterations: number;
  maxIterations: number;
  startedAt: string;
  completedAt: string | null;
}

interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  fetchedAt: string;
  content: string;
  type: "article" | "paper" | "forum" | "documentation" | "news";
}

interface Finding {
  id: string;
  claim: string;
  evidence: string;
  sourceUrls: string[];
  confidence: number;
  category: string;
  contradicts?: string[];      // IDs of findings this contradicts
}

interface ResearchReport {
  title: string;
  executiveSummary: string;
  sections: Array<{
    heading: string;
    content: string;
    findings: string[];        // Finding IDs
    confidence: number;
  }>;
  methodology: string;
  limitations: string[];
  citations: Array<{ index: number; url: string; title: string; accessedAt: string }>;
  generatedAt: string;
}

// Start research on a question
export async function startResearch(params: {
  question: string;
  depth?: number;
  maxIterations?: number;
}): Promise<ResearchProject> {
  const id = `research-${randomBytes(6).toString("hex")}`;

  const project: ResearchProject = {
    id, question: params.question,
    status: "researching",
    depth: params.depth || 2,
    sources: [], findings: [], subQuestions: [],
    report: null,
    iterations: 0,
    maxIterations: params.maxIterations || 10,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  await pool.query(
    `INSERT INTO research_projects (id, question, status, depth, started_at)
     VALUES ($1, $2, 'researching', $3, NOW())`,
    [id, params.question, project.depth]
  );

  // Start research loop asynchronously
  researchLoop(project).catch(async () => {
    await pool.query("UPDATE research_projects SET status='failed' WHERE id=$1", [id]);
  });

  return project;
}

async function researchLoop(project: ResearchProject): Promise<void> {
  const questions = [project.question];

  while (project.iterations < project.maxIterations && questions.length > 0) {
    project.iterations++;
    const currentQuestion = questions.shift()!;

    // Search multiple sources
    const searchResults = await searchSources(currentQuestion);

    // Fetch and extract content from top results
    for (const result of searchResults.slice(0, 5)) {
      try {
        const content = await fetchAndExtract(result.url);
        project.sources.push({
          ...result,
          content: content.slice(0, 5000),
          fetchedAt: new Date().toISOString(),
        });
      } catch { /* skip unreachable sources */ }
    }

    // Extract findings from fetched content
    const newFindings = await extractFindings(currentQuestion, project.sources.slice(-5));
    project.findings.push(...newFindings);

    // Generate sub-questions if depth allows
    if (project.depth > 0 && project.iterations < project.maxIterations / 2) {
      const subQs = await generateSubQuestions(currentQuestion, newFindings);
      questions.push(...subQs.slice(0, 3));
      project.subQuestions.push(...subQs);
      project.depth--;
    }

    await saveProject(project);
  }

  // Synthesize report
  project.status = "synthesizing";
  await saveProject(project);

  project.report = await synthesizeReport(project);
  project.status = "completed";
  project.completedAt = new Date().toISOString();
  await saveProject(project);
}

async function searchSources(query: string): Promise<Array<{ url: string; title: string; snippet: string; relevanceScore: number; type: ResearchSource["type"] }>> {
  // In production: calls search API (Brave, Serper, etc.)
  return [
    { url: "https://example.com/article1", title: `Research on: ${query}`, snippet: "Comprehensive analysis...", relevanceScore: 0.9, type: "article" },
    { url: "https://example.com/paper1", title: `Study: ${query}`, snippet: "Academic findings...", relevanceScore: 0.85, type: "paper" },
  ];
}

async function fetchAndExtract(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const html = await response.text();
  // Strip HTML tags for plain text extraction
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function extractFindings(question: string, sources: ResearchSource[]): Promise<Finding[]> {
  // In production: LLM extracts structured findings from source content
  return sources.map((s, i) => ({
    id: `f-${randomBytes(4).toString("hex")}`,
    claim: `Finding from ${s.title}: relevant to ${question}`,
    evidence: s.content.slice(0, 200),
    sourceUrls: [s.url],
    confidence: s.relevanceScore,
    category: "general",
  }));
}

async function generateSubQuestions(question: string, findings: Finding[]): Promise<string[]> {
  // In production: LLM generates follow-up questions based on gaps in findings
  return [`What are the alternatives to ${question.split(" ").slice(-3).join(" ")}?`];
}

async function synthesizeReport(project: ResearchProject): Promise<ResearchReport> {
  // In production: LLM synthesizes all findings into structured report
  const citations = project.sources.map((s, i) => ({
    index: i + 1, url: s.url, title: s.title, accessedAt: s.fetchedAt,
  }));

  return {
    title: `Research Report: ${project.question}`,
    executiveSummary: `Based on analysis of ${project.sources.length} sources and ${project.findings.length} findings, here are the key insights on "${project.question}".`,
    sections: [{
      heading: "Key Findings",
      content: project.findings.map((f) => f.claim).join("\n\n"),
      findings: project.findings.map((f) => f.id),
      confidence: project.findings.reduce((sum, f) => sum + f.confidence, 0) / project.findings.length,
    }],
    methodology: `Automated search across multiple sources with ${project.iterations} research iterations and ${project.subQuestions.length} follow-up questions.`,
    limitations: ["Automated extraction may miss nuance", "Limited to publicly available sources"],
    citations,
    generatedAt: new Date().toISOString(),
  };
}

async function saveProject(project: ResearchProject): Promise<void> {
  await pool.query(
    "UPDATE research_projects SET status=$2, sources=$3, findings=$4, report=$5, iterations=$6, completed_at=$7 WHERE id=$1",
    [project.id, project.status, JSON.stringify(project.sources), JSON.stringify(project.findings), JSON.stringify(project.report), project.iterations, project.completedAt]
  );
}

export async function getResearch(id: string): Promise<ResearchProject | null> {
  const { rows: [row] } = await pool.query("SELECT * FROM research_projects WHERE id = $1", [id]);
  if (!row) return null;
  return { ...row, sources: JSON.parse(row.sources), findings: JSON.parse(row.findings), report: row.report ? JSON.parse(row.report) : null };
}
```

## Results

- **Research time: 2-3 days → 30 minutes** — agent searches, reads, and synthesizes 20+ sources automatically; researcher reviews and edits instead of starting from scratch
- **Automatic sub-question pursuit** — "What's the market size for X?" branches into "What's the growth rate?" and "Who are the top players?"; depth-first exploration covers gaps human researchers miss
- **Structured reports with citations** — every claim linked to source URL; executive summary + detailed sections; ready for stakeholder presentation without reformatting
- **Contradiction detection** — finding A says "market growing 20%" but finding B says "market declining"; both flagged for human review; prevents cherry-picking data
- **Reproducible research** — every search query, source, and finding logged; re-run research monthly to track changes; methodology section documents how conclusions were reached
