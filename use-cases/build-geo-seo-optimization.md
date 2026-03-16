---
title: Build GEO-SEO Optimization
slug: build-geo-seo-optimization
description: Build a GEO-SEO optimization system for AI search engines with citability scoring, structured content formatting, knowledge graph alignment, and AI crawler optimization for appearing in AI-generated answers.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SEO & Marketing
tags:
  - geo-seo
  - ai-search
  - optimization
  - citability
  - content
---

# Build GEO-SEO Optimization

## The Problem

Chen leads SEO at a 20-person SaaS. Traditional SEO drives 10K visits/month but AI search (ChatGPT, Perplexity, Gemini, Claude) is growing fast — 30% of their target audience now uses AI search as their primary discovery tool. Their content doesn't appear in AI answers. Competitors get cited by AI because their content is structured with clear claims, data, and definitions. They need GEO-SEO: optimize content for AI citation, format for machine readability, track AI search visibility, and score content citability.

## Step 1: Build the GEO-SEO Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface CitabilityScore {
  url: string;
  score: number;
  factors: Array<{ name: string; score: number; weight: number; recommendation: string }>;
  aiReadiness: "high" | "medium" | "low";
}

interface ContentOptimization {
  url: string;
  currentContent: string;
  suggestions: Array<{ type: string; priority: "high" | "medium" | "low"; description: string; example?: string }>;
  structuredData: any;
  keyStatements: string[];
}

// Score content citability for AI search
export async function scoreCitability(url: string, content: string, title: string): Promise<CitabilityScore> {
  const factors: CitabilityScore["factors"] = [];

  // Factor 1: Clear definitions and claims
  const definitions = content.match(/(?:is |are |means |refers to |defined as )[^.]+\./gi) || [];
  const defScore = Math.min(1, definitions.length / 5);
  factors.push({ name: "clear_definitions", score: defScore, weight: 0.2, recommendation: defScore < 0.6 ? "Add explicit definitions: 'X is Y that does Z'" : "Good definition density" });

  // Factor 2: Quantitative data
  const numbers = content.match(/\d+[%$KMB]|\$[\d,.]+|\d+ (percent|times|users|customers|companies)/gi) || [];
  const dataScore = Math.min(1, numbers.length / 8);
  factors.push({ name: "quantitative_data", score: dataScore, weight: 0.15, recommendation: dataScore < 0.5 ? "Add specific numbers: percentages, dollar amounts, user counts" : "Good data density" });

  // Factor 3: Structured format (headings, lists, tables)
  const headings = (content.match(/^#{1,3} /gm) || []).length;
  const lists = (content.match(/^[-*] /gm) || []).length;
  const structureScore = Math.min(1, (headings + lists / 3) / 10);
  factors.push({ name: "structured_format", score: structureScore, weight: 0.15, recommendation: structureScore < 0.5 ? "Use more headings (H2, H3), bullet lists, and numbered steps" : "Well structured" });

  // Factor 4: Authoritative language
  const authoritative = content.match(/\b(according to|research shows|studies indicate|data shows|experts recommend|best practice)\b/gi) || [];
  const authScore = Math.min(1, authoritative.length / 3);
  factors.push({ name: "authority_signals", score: authScore, weight: 0.15, recommendation: authScore < 0.5 ? "Add authority phrases: 'research shows', 'best practice is'" : "Good authority signals" });

  // Factor 5: FAQ-like structure (questions answered)
  const questions = content.match(/\?/g) || [];
  const qScore = Math.min(1, questions.length / 5);
  factors.push({ name: "question_coverage", score: qScore, weight: 0.1, recommendation: qScore < 0.5 ? "Add FAQ section or rhetorical questions that match search queries" : "Good question coverage" });

  // Factor 6: Summary/TL;DR presence
  const hasSummary = /summary|tl;?dr|key takeaway|conclusion|in short/i.test(content);
  factors.push({ name: "summary_present", score: hasSummary ? 1 : 0, weight: 0.1, recommendation: hasSummary ? "Summary present" : "Add a TL;DR or Key Takeaways section at the top" });

  // Factor 7: Schema.org structured data
  const hasSchema = /application\/ld\+json|schema\.org|itemtype/i.test(content);
  factors.push({ name: "structured_data", score: hasSchema ? 1 : 0, weight: 0.1, recommendation: hasSchema ? "Structured data present" : "Add FAQ schema, HowTo schema, or Article schema" });

  // Factor 8: Freshness indicators
  const hasDates = /\b(202[4-9]|updated|last reviewed|published on)\b/i.test(content);
  factors.push({ name: "freshness", score: hasDates ? 1 : 0, weight: 0.05, recommendation: hasDates ? "Content appears fresh" : "Add 'Last updated: [date]' to signal freshness" });

  const totalScore = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) * 100);
  const aiReadiness = totalScore >= 70 ? "high" : totalScore >= 40 ? "medium" : "low";

  const result: CitabilityScore = { url, score: totalScore, factors, aiReadiness };
  await pool.query(
    `INSERT INTO citability_scores (url, score, factors, ai_readiness, scored_at) VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (url) DO UPDATE SET score = $2, factors = $3, ai_readiness = $4, scored_at = NOW()`,
    [url, totalScore, JSON.stringify(factors), aiReadiness]
  );

  return result;
}

// Generate optimization suggestions
export function generateOptimizations(content: string, title: string): ContentOptimization {
  const suggestions: ContentOptimization["suggestions"] = [];

  // Check for direct answer format
  if (!content.match(/^[A-Z][^.]+\./m)) {
    suggestions.push({ type: "direct_answer", priority: "high", description: "Start with a direct answer to the main question in the first paragraph", example: `${title.replace(/^(How to |Build |Create )/i, '')} is a technique that...` });
  }

  // Check for comparison tables
  if (!content.includes("|") && title.toLowerCase().includes("vs")) {
    suggestions.push({ type: "comparison_table", priority: "high", description: "Add a comparison table for vs-style content" });
  }

  // Check for step-by-step format
  if (title.match(/^(how to|build|create|set up)/i) && !(content.match(/step \d|^\d\./gm) || []).length) {
    suggestions.push({ type: "step_format", priority: "high", description: "Format as numbered steps for how-to content", example: "Step 1: ..., Step 2: ..., Step 3: ..." });
  }

  // Check for code examples
  if (title.match(/(api|code|build|implement)/i) && !content.includes("```")) {
    suggestions.push({ type: "code_examples", priority: "medium", description: "Add code examples — AI search frequently cites code snippets" });
  }

  // Check content length
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 500) {
    suggestions.push({ type: "content_depth", priority: "high", description: `Content is thin (${wordCount} words). AI prefers comprehensive content (1500+ words)` });
  }

  // Generate key citable statements
  const keyStatements = extractKeyStatements(content);

  // Generate recommended structured data
  const structuredData = generateSchemaMarkup(title, content, keyStatements);

  return { url: "", currentContent: content.slice(0, 500), suggestions, structuredData, keyStatements };
}

function extractKeyStatements(content: string): string[] {
  const statements: string[] = [];
  // Extract sentences with data/claims
  const sentences = content.split(/[.!]/).filter((s) => s.trim().length > 30);
  for (const sentence of sentences) {
    if (/\d+%|\$[\d,]+|\d+ (times|users|companies)|increase|decrease|improve|reduce/i.test(sentence)) {
      statements.push(sentence.trim() + ".");
    }
  }
  return statements.slice(0, 10);
}

function generateSchemaMarkup(title: string, content: string, keyStatements: string[]): any {
  const isHowTo = /^(how to|build|create|set up)/i.test(title);
  if (isHowTo) {
    return { "@context": "https://schema.org", "@type": "HowTo", name: title, description: content.slice(0, 200), step: keyStatements.map((s, i) => ({ "@type": "HowToStep", position: i + 1, text: s })) };
  }
  return {
    "@context": "https://schema.org", "@type": "Article",
    headline: title, description: content.slice(0, 160),
    dateModified: new Date().toISOString(),
  };
}

// Batch audit entire site
export async function auditSite(urls: Array<{ url: string; content: string; title: string }>): Promise<{
  avgScore: number;
  highReadiness: number;
  lowReadiness: number;
  topSuggestions: Array<{ suggestion: string; affectedPages: number }>;
}> {
  const scores: CitabilityScore[] = [];
  const suggestionCounts = new Map<string, number>();

  for (const page of urls) {
    const score = await scoreCitability(page.url, page.content, page.title);
    scores.push(score);

    const opts = generateOptimizations(page.content, page.title);
    for (const s of opts.suggestions) {
      suggestionCounts.set(s.description, (suggestionCounts.get(s.description) || 0) + 1);
    }
  }

  return {
    avgScore: Math.round(scores.reduce((s, sc) => s + sc.score, 0) / scores.length),
    highReadiness: scores.filter((s) => s.aiReadiness === "high").length,
    lowReadiness: scores.filter((s) => s.aiReadiness === "low").length,
    topSuggestions: [...suggestionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([suggestion, count]) => ({ suggestion, affectedPages: count })),
  };
}
```

## Results

- **AI search citations up 300%** — content reformatted with direct answers, data, and structured markup; Perplexity and ChatGPT now cite the site for 15 queries vs 4 previously
- **Citability score: 35 → 78** — TL;DR sections, FAQ schemas, quantitative data added; AI search engines prefer structured, data-rich content
- **Schema.org markup** — HowTo and FAQ schema on every relevant page; AI search picks up step-by-step content; featured snippets increased
- **Site-wide audit** — 500 pages scored; 120 need "direct answer" fix, 200 need quantitative data; team prioritizes by impact
- **Freshness signals** — "Last updated" dates added; AI search engines favor fresh content; recrawl frequency increased
