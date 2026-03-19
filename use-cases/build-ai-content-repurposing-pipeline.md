---
title: Build an AI Content Repurposing Pipeline
slug: build-ai-content-repurposing-pipeline
description: Turn one blog post or podcast transcript into 10 platform-specific content formats automatically — Twitter threads, LinkedIn posts, newsletters, TikTok scripts, YouTube descriptions, and more.
skills:
  - anthropic-sdk
  - resend
tags:
  - content
  - marketing
  - ai
  - automation
  - social-media
---

## The Problem

Sam runs a solo SaaS and publishes one in-depth blog post per week. The content is good — 3,000 words of real insight. But it reaches maybe 400 people on his blog and then it dies. He knows he should be cross-posting to LinkedIn, breaking it into a Twitter thread, turning it into a newsletter, writing a TikTok script — but that's another 4 hours per post, and he's already spent 5 hours writing the original.

Sam wants to write one post and have it automatically become a week's worth of content across every platform he uses.

## The Solution

Use anthropic-sdk to generate platform-specific content from a single source. Each platform has format constraints and audience expectations — the pipeline applies different prompt strategies per format. Use resend to deliver the newsletter version directly to subscribers.

## Step-by-Step Walkthrough

### Step 1: Parse and Understand the Source Content

```typescript
// parser/content.ts
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface ContentAnalysis {
  title: string;
  mainThesis: string;
  keyPoints: string[];       // top 5-7 insights
  quotableLines: string[];   // memorable, standalone lines
  targetAudience: string;
  tone: string;              // 'technical' | 'casual' | 'storytelling' | 'educational'
  wordCount: number;
  hook: string;              // the most compelling opening angle
}

/**
 * Analyze the source content to extract structure before repurposing.
 * This ensures every format variant stays on-message.
 */
export async function analyzeContent(text: string): Promise<ContentAnalysis> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: `Analyze this content for repurposing across social platforms.

CONTENT:
${text}

Return JSON:
{
  title: string,
  mainThesis: string,          // the single core idea in one sentence
  keyPoints: string[],         // 5-7 most important insights
  quotableLines: string[],     // 3-5 memorable lines that work standalone
  targetAudience: string,      // who this is for
  tone: string,                // overall tone descriptor
  wordCount: number,
  hook: string                 // the most compelling angle to lead with on social
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  return JSON.parse(content.text.replace(/```json\n?|\n?```/g, '').trim());
}

export function loadContent(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}
```

### Step 2: Define Platform Formats and Constraints

```typescript
// platforms/formats.ts

export interface PlatformConfig {
  name: string;
  maxChars?: number;
  format: string;              // description of format expectations
  tone: string;
  examples: string;            // style guidance
  outputKey: string;
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  twitter_thread: {
    name: 'Twitter/X Thread',
    maxChars: 280,             // per tweet
    format: '8-12 tweets. First tweet is the hook. Number each tweet (1/N). End with a CTA.',
    tone: 'punchy, direct, no jargon, one idea per tweet',
    examples: 'Bold claim → evidence → insight → repeat. Thread ends with practical takeaway.',
    outputKey: 'twitter_thread',
  },
  linkedin: {
    name: 'LinkedIn Post',
    maxChars: 3000,
    format: 'Single post. Short punchy opening line. 3-5 short paragraphs. Bullet points okay. End with question to drive comments.',
    tone: 'professional but human, first-person, story-driven opening',
    examples: 'Start with a counterintuitive statement or personal experience. End with "What do you think?"',
    outputKey: 'linkedin',
  },
  newsletter: {
    name: 'Newsletter Section',
    maxChars: 600,
    format: '2-3 paragraphs. Brief intro, 2-3 key points, link to full article.',
    tone: 'conversational, like writing to a friend, first-person',
    examples: '"This week I realized..." or "Something clicked for me when..."',
    outputKey: 'newsletter',
  },
  tiktok_script: {
    name: 'TikTok/Reels Script',
    maxChars: 500,
    format: 'Hook (0-3s), Context (3-10s), 3 points (10-45s), CTA (45-60s). Include [visual cue] notes.',
    tone: 'energetic, casual, spoken word rhythm',
    examples: 'Hook: "Nobody talks about this but..." or "I spent 3 years learning this so you don\'t have to"',
    outputKey: 'tiktok_script',
  },
  youtube_description: {
    name: 'YouTube Description',
    maxChars: 5000,
    format: 'First 2 lines are above the fold (most important). Overview paragraph. Timestamps if applicable. Links section. Keywords.',
    tone: 'SEO-aware, informative, includes relevant keywords naturally',
    examples: 'Open with what the viewer will learn. Include 5-10 relevant keywords.',
    outputKey: 'youtube_description',
  },
  instagram_caption: {
    name: 'Instagram Caption',
    maxChars: 2200,
    format: 'Hook line (first 125 chars visible before More). 3-5 short paragraphs. 20-30 hashtags at end.',
    tone: 'visual, aspirational, slightly more personal than LinkedIn',
    examples: 'Open with visual hook. Build curiosity. Hashtags on separate lines.',
    outputKey: 'instagram_caption',
  },
  reddit_post: {
    name: 'Reddit Post',
    format: 'Title + body. Title should be helpful or intriguing, not clickbait. Body goes deep on one key insight with examples.',
    tone: 'humble, add-genuine-value, no self-promotion language, conversational',
    examples: 'r/startups, r/SaaS, r/programming style. Acknowledge counterarguments.',
    outputKey: 'reddit_post',
  },
  email_subjects: {
    name: 'Email Subject Lines',
    maxChars: 60,
    format: '10 subject line options. Mix: question, number, curiosity gap, direct benefit, personal story angle.',
    tone: 'varied — each should feel different from the others',
    examples: '"Why I stopped doing X", "5 things I learned from...", "The uncomfortable truth about..."',
    outputKey: 'email_subjects',
  },
  seo_meta: {
    name: 'SEO Meta Tags',
    format: 'Title tag (50-60 chars), meta description (150-160 chars), 5 focus keywords, 5 LSI keywords, 3 internal link suggestions.',
    tone: 'keyword-aware, helpful, clear benefit',
    examples: 'Include primary keyword in title. Meta description should include CTA.',
    outputKey: 'seo_meta',
  },
  podcast_blurb: {
    name: 'Podcast Episode Description',
    maxChars: 600,
    format: '3 short paragraphs. What the episode covers, key takeaways (bullet list), who should listen.',
    tone: 'informative, conversational, podcast-listener voice',
    examples: '"In this episode, you\'ll learn..." followed by 3-5 bullets.',
    outputKey: 'podcast_blurb',
  },
};
```

### Step 3: Generate Content Per Platform

```typescript
// generator/repurpose.ts
import Anthropic from '@anthropic-ai/sdk';
import type { ContentAnalysis } from '../parser/content';
import type { PlatformConfig } from '../platforms/formats';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export type GeneratedContent = Record<string, string>;

/**
 * Generate content for a single platform.
 * Each platform gets a tailored prompt — one-size prompting produces mediocre output.
 */
export async function generateForPlatform(
  sourceText: string,
  analysis: ContentAnalysis,
  platform: PlatformConfig
): Promise<string> {
  const charLimit = platform.maxChars ? `Max ${platform.maxChars} characters total.` : '';

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `Create ${platform.name} content based on this source material.

SOURCE ANALYSIS:
- Main thesis: ${analysis.mainThesis}
- Key points: ${analysis.keyPoints.join(' | ')}
- Quotable lines: ${analysis.quotableLines.join(' | ')}
- Audience: ${analysis.targetAudience}
- Hook angle: ${analysis.hook}

FORMAT REQUIREMENTS:
${platform.format}
${charLimit}

TONE: ${platform.tone}

STYLE GUIDANCE: ${platform.examples}

SOURCE MATERIAL (for reference — don't just copy/paste):
${sourceText}

Write the ${platform.name} content now. Output only the final content, no explanation.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  return content.text.trim();
}

/**
 * Generate all formats in parallel batches.
 * Batching avoids rate limits while keeping total time under 2 minutes.
 */
export async function generateAllFormats(
  sourceText: string,
  analysis: ContentAnalysis,
  platforms: Record<string, PlatformConfig>
): Promise<GeneratedContent> {
  const entries = Object.entries(platforms);
  const results: GeneratedContent = {};
  
  // Process in batches of 3 to avoid rate limits
  for (let i = 0; i < entries.length; i += 3) {
    const batch = entries.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(async ([key, platform]) => {
        console.log(`Generating ${platform.name}...`);
        const content = await generateForPlatform(sourceText, analysis, platform);
        return [key, content] as [string, string];
      })
    );
    batchResults.forEach(([key, content]) => { results[key] = content; });
    
    if (i + 3 < entries.length) {
      await new Promise(r => setTimeout(r, 1000));  // brief pause between batches
    }
  }

  return results;
}
```

### Step 4: Send Newsletter via Resend

```typescript
// publisher/newsletter.ts
import { Resend } from 'resend';
import type { ContentAnalysis } from '../parser/content';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendNewsletterSection(
  newsletterContent: string,
  analysis: ContentAnalysis,
  subscriberList: string[],
  fromEmail: string
): Promise<void> {
  const html = `
    <div style="font-family: Georgia, serif; max-width: 640px; margin: 0 auto; padding: 20px;">
      <h2 style="font-size: 24px; margin-bottom: 16px;">${analysis.title}</h2>
      <div style="font-size: 16px; line-height: 1.7; color: #333;">
        ${newsletterContent.split('\n').map(p => p ? `<p>${p}</p>` : '').join('')}
      </div>
      <hr style="margin: 24px 0; border: 1px solid #eee;" />
      <p style="font-size: 13px; color: #999;">
        You're receiving this because you subscribed. 
        <a href="{{unsubscribe_url}}">Unsubscribe</a>
      </p>
    </div>
  `;

  // Send in batches of 50 (Resend batch API)
  for (let i = 0; i < subscriberList.length; i += 50) {
    const batch = subscriberList.slice(i, i + 50);
    await Promise.all(
      batch.map(email =>
        resend.emails.send({
          from: fromEmail,
          to: email,
          subject: `${analysis.title}`,
          html,
        })
      )
    );
    if (i + 50 < subscriberList.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`Newsletter sent to ${subscriberList.length} subscribers`);
}
```

### Step 5: Orchestrate and Save All Outputs

```typescript
// index.ts
import * as fs from 'fs';
import * as path from 'path';
import { loadContent, analyzeContent } from './parser/content';
import { PLATFORMS } from './platforms/formats';
import { generateAllFormats } from './generator/repurpose';
import { sendNewsletterSection } from './publisher/newsletter';

async function repurposeContent(config: {
  inputFile: string;
  outputDir: string;
  sendNewsletter: boolean;
  subscribers?: string[];
  fromEmail?: string;
}) {
  const { inputFile, outputDir } = config;
  
  // Load source content
  const sourceText = loadContent(inputFile);
  console.log(`Loaded ${sourceText.length} chars from ${inputFile}`);

  // Analyze content structure
  console.log('Analyzing content structure...');
  const analysis = await analyzeContent(sourceText);
  console.log(`Theme: "${analysis.mainThesis}"`);
  console.log(`Audience: ${analysis.targetAudience}`);

  // Generate all formats
  console.log('\nGenerating all platform formats...');
  const generated = await generateAllFormats(sourceText, analysis, PLATFORMS);

  // Save each format to file
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  for (const [key, content] of Object.entries(generated)) {
    const outputPath = path.join(outputDir, `${key}.txt`);
    fs.writeFileSync(outputPath, content);
    console.log(`✓ Saved ${key} (${content.length} chars)`);
  }

  // Optionally send newsletter
  if (config.sendNewsletter && config.subscribers && config.fromEmail) {
    console.log('\nSending newsletter...');
    await sendNewsletterSection(
      generated.newsletter,
      analysis,
      config.subscribers,
      config.fromEmail
    );
  }

  // Save index
  const index = Object.entries(PLATFORMS)
    .map(([key, p]) => `- ${p.name}: ${key}.txt`)
    .join('\n');
  fs.writeFileSync(path.join(outputDir, 'INDEX.md'), `# Content Pack: ${analysis.title}\n\n${index}`);

  console.log(`\nAll ${Object.keys(generated).length} formats saved to ${outputDir}`);
  return generated;
}

// Example usage
repurposeContent({
  inputFile: './posts/why-i-rebuilt-our-auth-system.md',
  outputDir: './content-pack/2024-01-15',
  sendNewsletter: true,
  subscribers: ['subscriber1@email.com', 'subscriber2@email.com'],
  fromEmail: 'sam@yourblog.com',
});
```

## What You've Built

A content pipeline that turns one blog post into 10 platform-ready formats in under 3 minutes — Twitter thread, LinkedIn post, newsletter, TikTok script, YouTube description, Instagram caption, Reddit post, email subject lines, SEO meta tags, and podcast blurb.

**Next steps:** Add direct publishing via Twitter API, LinkedIn API, and Buffer. Build a simple UI to review and edit generated content before publishing. Add a scheduling system to drip content throughout the week rather than posting everything at once.
