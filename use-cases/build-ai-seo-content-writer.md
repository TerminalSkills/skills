---
title: Build an AI SEO Content Writer
slug: build-ai-seo-content-writer
description: Build an AI content pipeline that researches keywords, scrapes competitor content, generates SEO-optimized outlines, writes full articles with Claude, and publishes to your CMS — at scale.
skills:
  - anthropic-sdk
  - firecrawl
difficulty: advanced
time_estimate: "8 hours"
category: marketing
tags:
  - seo
  - content
  - ai
  - claude
  - firecrawl
  - automation
  - cms
---

# Build an AI SEO Content Writer

Mia runs content at a SaaS startup with two people. She needs to publish 50 SEO-optimized articles per month to compete for organic traffic. Writing each one manually takes 6 hours — that's 300 hours/month, clearly impossible. She needs a pipeline: find keywords → analyze what ranks → generate an outline based on gaps → write the full article → publish to Contentful. Human review before publish, but the heavy lifting done by machines.

## Step 1 — Keyword Research via Google Search Console API

```typescript
// lib/keyword-research.ts — Pull keywords from Google Search Console.
// Shows keywords where you rank 4-20 — "almost ranking" = quick wins.

import { google } from "googleapis";

const searchConsole = google.webmasters("v3");

export async function getKeywordOpportunities(
  siteUrl: string,
  daysBack: number = 90
): Promise<KeywordOpportunity[]> {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const response = await searchConsole.searchanalytics.query({
    auth,
    siteUrl,
    requestBody: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      dimensions: ["query"],
      rowLimit: 500,
      dimensionFilterGroups: [{
        filters: [{
          dimension: "position",
          operator: "lessThan",
          expression: "20",
        }, {
          dimension: "position",
          operator: "greaterThan",
          expression: "3",
        }],
      }],
    },
  });

  const rows = response.data.rows || [];

  return rows
    .map(row => ({
      keyword: row.keys![0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      position: row.position || 0,
      ctr: row.ctr || 0,
      // Priority score: high impressions + low position = opportunity
      opportunityScore: (row.impressions || 0) / Math.pow(row.position || 20, 1.5),
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 50);
}
```

## Step 2 — SERP Analysis with Firecrawl

```typescript
// lib/serp-analysis.ts — Scrape top 10 Google results for a keyword.
// Extracts headings, word count, and topics to inform our outline.

import FirecrawlApp from "@mendable/firecrawl-js";
import Anthropic from "@anthropic-ai/sdk";

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
const anthropic = new Anthropic();

interface SerpResult {
  url: string;
  title: string;
  wordCount: number;
  headings: string[];
  topicsCovers: string[];
}

export async function analyzeSerpCompetitors(keyword: string): Promise<{
  results: SerpResult[];
  avgWordCount: number;
  commonTopics: string[];
  contentGaps: string[];
}> {
  // Search Google and scrape results via Firecrawl
  const searchResult = await firecrawl.search(keyword, {
    limit: 10,
    scrapeOptions: {
      formats: ["markdown"],
    },
  });

  const results: SerpResult[] = [];

  for (const item of searchResult.data.slice(0, 10)) {
    if (!item.markdown) continue;

    // Extract headings from markdown
    const headings = (item.markdown.match(/^#{1,3} .+$/gm) || [])
      .map(h => h.replace(/^#+\s/, "").trim());

    const wordCount = item.markdown.split(/\s+/).length;

    results.push({
      url: item.url,
      title: item.title || "",
      wordCount,
      headings,
      topicsCovers: [],
    });
  }

  const avgWordCount = Math.round(
    results.reduce((sum, r) => sum + r.wordCount, 0) / results.length
  );

  // Use Claude to identify common topics and content gaps
  const analysis = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Analyze these headings from the top 10 Google results for "${keyword}".
      
Headings from competitors:
${results.map(r => r.headings.join(", ")).join("\n")}

Return JSON with:
- commonTopics: array of topics covered by 5+ results
- contentGaps: array of topics NOT covered by most results but highly relevant
- suggestedWordCount: recommended article length based on average (${avgWordCount} words)`,
    }],
  });

  const parsed = JSON.parse(
    analysis.content[0].type === "text" ? analysis.content[0].text : "{}"
  );

  return {
    results,
    avgWordCount,
    commonTopics: parsed.commonTopics || [],
    contentGaps: parsed.contentGaps || [],
  };
}
```

## Step 3 — AI Outline Generation

```typescript
// lib/outline-generator.ts — Generate SEO-optimized outlines with Claude.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface ArticleOutline {
  title: string;
  metaDescription: string;
  targetWordCount: number;
  sections: {
    heading: string;
    level: "h2" | "h3";
    keyPoints: string[];
    targetWords: number;
  }[];
  internalLinkOpportunities: string[];
  lsiKeywords: string[];
}

export async function generateOutline(
  keyword: string,
  serpAnalysis: Awaited<ReturnType<typeof analyzeSerpCompetitors>>
): Promise<ArticleOutline> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Create a detailed SEO article outline for the keyword: "${keyword}"

SERP Analysis:
- Average competitor word count: ${serpAnalysis.avgWordCount}
- Common topics covered: ${serpAnalysis.commonTopics.join(", ")}
- Content gaps (not covered well): ${serpAnalysis.contentGaps.join(", ")}

Requirements:
- Title: include the exact keyword, under 60 characters
- Meta description: 150-160 characters with keyword
- Word count: 10-20% more than competitor average (${Math.round(serpAnalysis.avgWordCount * 1.15)})
- Structure: H2 for main sections, H3 for subsections
- Cover ALL common topics (don't give competitors an edge)
- Cover at least 2 content gaps (differentiation)
- Include 3-5 LSI (semantically related) keywords
- Note 3 internal link opportunities (related topics on our site)

Return a JSON object matching this exact structure:
{
  "title": "...",
  "metaDescription": "...",
  "targetWordCount": number,
  "sections": [
    {
      "heading": "...",
      "level": "h2" | "h3",
      "keyPoints": ["...", "..."],
      "targetWords": number
    }
  ],
  "internalLinkOpportunities": ["topic1", "topic2", "topic3"],
  "lsiKeywords": ["keyword1", "keyword2", "keyword3"]
}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
}
```

## Step 4 — Full Article Writing

```typescript
// lib/article-writer.ts — Write the full article from an outline using Claude.
// Writes section by section to stay within context limits and maintain quality.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function writeArticle(
  keyword: string,
  outline: ArticleOutline,
  brandVoice: string
): Promise<string> {
  const sections: string[] = [];

  // Write intro separately
  const introResponse = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 600,
    messages: [{
      role: "user",
      content: `Write an engaging introduction for an SEO article.

Primary keyword: "${keyword}"
LSI keywords to include: ${outline.lsiKeywords.slice(0, 3).join(", ")}
Brand voice: ${brandVoice}
Target length: 150-200 words

Requirements:
- Hook the reader in the first sentence
- Mention the primary keyword in the first 100 words  
- Preview what the article covers
- Do NOT use "In this article, we will..." — find a more engaging opener`,
    }],
  });

  sections.push(introResponse.content[0].type === "text" ? introResponse.content[0].text : "");

  // Write each H2 section
  for (const section of outline.sections.filter(s => s.level === "h2")) {
    const h3Subsections = outline.sections.filter(
      s => s.level === "h3" && outline.sections.indexOf(s) >
        outline.sections.indexOf(section)
    ).slice(0, 3);

    const sectionResponse = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Write the "${section.heading}" section for an article about "${keyword}".

Key points to cover:
${section.keyPoints.map(p => `- ${p}`).join("\n")}

${h3Subsections.length ? `Subsections to include as H3:
${h3Subsections.map(s => `- ${s.heading}: ${s.keyPoints.join(", ")}`).join("\n")}` : ""}

Target length: ${section.targetWords} words
Brand voice: ${brandVoice}

Write in markdown. Start with ## ${section.heading}`,
      }],
    });

    sections.push(sectionResponse.content[0].type === "text" ? sectionResponse.content[0].text : "");
  }

  return sections.join("\n\n");
}
```

## Step 5 — Publish to Contentful

```typescript
// lib/publish.ts — Publish the completed article to Contentful CMS.

import { createClient } from "contentful-management";

const client = createClient({ accessToken: process.env.CONTENTFUL_MGMT_TOKEN! });

export async function publishToCMS(article: {
  title: string;
  slug: string;
  metaDescription: string;
  content: string;
  keyword: string;
  status: "draft" | "review" | "published";
}) {
  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID!);
  const env = await space.getEnvironment("master");

  const entry = await env.createEntry("blogPost", {
    fields: {
      title: { "en-US": article.title },
      slug: { "en-US": article.slug },
      metaDescription: { "en-US": article.metaDescription },
      body: { "en-US": article.content },
      seoKeyword: { "en-US": article.keyword },
      status: { "en-US": article.status },
      generatedAt: { "en-US": new Date().toISOString() },
    },
  });

  if (article.status === "published") {
    await entry.publish();
  }

  return entry.sys.id;
}

// Pipeline runner — ties everything together
export async function runContentPipeline(keyword: string) {
  console.log(`🔍 Analyzing SERP for: ${keyword}`);
  const serpData = await analyzeSerpCompetitors(keyword);

  console.log(`📝 Generating outline...`);
  const outline = await generateOutline(keyword, serpData);

  console.log(`✍️  Writing article (${outline.targetWordCount} words)...`);
  const content = await writeArticle(keyword, outline, "conversational, expert, practical");

  console.log(`📤 Publishing to CMS as draft...`);
  const entryId = await publishToCMS({
    title: outline.title,
    slug: keyword.toLowerCase().replace(/\s+/g, "-"),
    metaDescription: outline.metaDescription,
    content,
    keyword,
    status: "draft",       // Human reviews before publishing
  });

  console.log(`✅ Done! Review at: https://app.contentful.com/spaces/${process.env.CONTENTFUL_SPACE_ID}/entries/${entryId}`);
}
```

## Results

Mia ran the pipeline for 3 months. Publishing went from 8 articles/month to 52/month:

- **Time per article: 45 minutes** — pipeline runs in 8 minutes, human review takes 35 minutes. Down from 6 hours.
- **Organic traffic up 180%** in 90 days — 52 articles vs 8 means more keywords covered. The pipeline targets "page 2" keywords first (positions 4-20), which show ranking improvements fastest.
- **Average article quality** — Claude follows the SEO structure (keyword in first 100 words, proper H2/H3, target word count). 15% of drafts need significant rewriting; 85% need minor edits.
- **Content gaps win** — articles covering topics competitors miss get featured snippets. 8 featured snippets in 90 days vs 1 previously.
- **Firecrawl tip** — use `scrapeOptions: { waitFor: 2000 }` for JavaScript-rendered pages that don't show content immediately.
