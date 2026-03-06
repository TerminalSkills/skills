---
title: Build an AI Content Engine That Runs Your Social Media
slug: build-ai-content-engine-for-social-media
description: Build an automated content pipeline that takes one long-form input (podcast, blog post, video) and generates a week of platform-optimized social media posts using OpenAI for content generation, Buffer API for scheduling, and n8n for orchestration — turning 1 hour of content creation into 30+ ready-to-publish posts across LinkedIn, Twitter, and Instagram.
skills: [n8n-workflow-sdk, openai-realtime, twitter-x, linkedin, instagram]
category: Marketing & Growth
tags: [content-marketing, social-media, automation, ai-content, repurposing]
---

# Build an AI Content Engine That Runs Your Social Media

Leo is the solo marketer at a 15-person developer tools startup. He's responsible for LinkedIn (3x/week), Twitter (daily), Instagram (2x/week), and a weekly newsletter. He spends 20 hours per week creating and scheduling content. The CEO wants him to also manage the company blog and YouTube presence. There are only so many hours in a week.

Leo's insight: most social media content is derived from the same core ideas, just reformatted for each platform. A deep technical blog post contains enough material for 10 LinkedIn posts, 15 tweets, and 5 Instagram carousels. The problem isn't ideas — it's the manual reformatting, scheduling, and platform-specific optimization.

## Step 1: Content Atomization Pipeline in n8n

The pipeline starts when Leo drops a piece of long-form content (blog post URL, podcast transcript, or video script) into a webhook. n8n orchestrates the entire flow: extract the content, generate platform-specific posts, create images, and schedule everything.

```javascript
// n8n Function Node: atomize-content
// Takes long-form content and breaks it into atomic ideas

const content = $input.first().json.content;
const contentType = $input.first().json.type; // "blog", "podcast", "video"

// Call OpenAI to extract atomic content pieces
const response = await $http.request({
  method: "POST",
  url: "https://api.openai.com/v1/chat/completions",
  headers: {
    "Authorization": `Bearer ${$env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: {
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a content strategist for a developer tools company.
Extract atomic content pieces from long-form content.

For each piece, identify:
- The core insight or takeaway
- A memorable hook (question, stat, or bold claim)
- Supporting data or example
- Which platforms it works best on

Return JSON:
{
  "atoms": [
    {
      "id": "atom_1",
      "insight": "The core point",
      "hook": "The attention-grabbing opener",
      "evidence": "Supporting data/example",
      "platforms": ["linkedin", "twitter"],
      "content_type": "thought_leadership" | "how_to" | "data_point" | "story" | "controversial_take"
    }
  ]
}`
      },
      {
        role: "user",
        content: `Content type: ${contentType}\n\n${content}`
      }
    ],
  },
});

const atoms = JSON.parse(response.choices[0].message.content).atoms;
return atoms.map(atom => ({ json: atom }));
```

## Step 2: Platform-Specific Content Generation

Each content atom gets transformed into platform-native posts. LinkedIn wants professional storytelling with formatting. Twitter wants punchy threads. Instagram needs carousel slide text.

```python
# content_generator.py — Platform-specific post generation
# Called by n8n via HTTP Request node for each content atom

from openai import OpenAI
from pydantic import BaseModel

client = OpenAI()

class LinkedInPost(BaseModel):
    """Structured LinkedIn post output."""
    hook: str              # First line — the scroll-stopper
    body: str              # Main content with line breaks
    cta: str               # Call-to-action (comment, share, follow)
    hashtags: list[str]    # 3-5 relevant hashtags

class TwitterThread(BaseModel):
    """Structured Twitter/X thread output."""
    tweets: list[str]      # Each tweet ≤ 280 chars
    # First tweet is the hook, last tweet is the CTA

class InstagramCarousel(BaseModel):
    """Structured Instagram carousel slide text."""
    slides: list[dict]     # Each slide: {headline, body, slide_number}
    caption: str           # Post caption with hashtags

def generate_linkedin(atom: dict) -> LinkedInPost:
    """Generate a LinkedIn post from a content atom.

    Args:
        atom: Content atom with insight, hook, evidence, and content_type
    """
    response = client.beta.chat.completions.parse(
        model="gpt-4o",
        response_format=LinkedInPost,
        messages=[
            {"role": "system", "content": """Write a LinkedIn post for a developer tools company.

RULES:
- First line must stop the scroll. Use a bold claim, surprising stat, or contrarian take.
- Short paragraphs (1-2 sentences max). Use line breaks liberally.
- Include a personal angle or "we learned this the hard way" element.
- End with a question that invites comments (LinkedIn's algorithm rewards comments).
- 3-5 hashtags, mix of broad (#engineering) and niche (#devtools).
- 800-1200 characters total. Not too short, not a wall of text.
- NO emoji spam. One emoji per paragraph maximum."""},
            {"role": "user", "content": f"Content atom:\n{atom}"}
        ],
    )
    return response.choices[0].message.parsed

def generate_twitter_thread(atom: dict) -> TwitterThread:
    """Generate a Twitter thread from a content atom.

    Args:
        atom: Content atom with insight, hook, evidence
    """
    response = client.beta.chat.completions.parse(
        model="gpt-4o",
        response_format=TwitterThread,
        messages=[
            {"role": "system", "content": """Write a Twitter/X thread for a dev tools audience.

RULES:
- 4-7 tweets per thread.
- Tweet 1: Hook. Must be self-contained and make people click "Show thread."
- Each tweet is a complete thought (readers might see only one in their feed).
- Use concrete numbers: "reduced deploy time from 45min to 3min" not "made deploys faster."
- Last tweet: CTA — follow, reply, or link to the full content.
- No hashtags in thread tweets (they look spammy on Twitter).
- Each tweet ≤ 280 characters. No exceptions."""},
            {"role": "user", "content": f"Content atom:\n{atom}"}
        ],
    )
    return response.choices[0].message.parsed
```

## Step 3: Scheduling with Buffer API

Once posts are generated and approved (Leo reviews them in a Notion dashboard), they're pushed to Buffer for optimal-time scheduling.

```typescript
// schedule-posts.ts — Push approved posts to Buffer API
// Called by n8n after Leo approves in Notion

interface BufferPost {
  text: string;
  profile_ids: string[];    // Buffer profile IDs for each platform
  scheduled_at?: string;     // ISO timestamp
  media?: { link: string }; // Image URL for Instagram/LinkedIn
}

async function scheduleWeek(posts: GeneratedPost[]): Promise<void> {
  const bufferToken = process.env.BUFFER_ACCESS_TOKEN;

  // Optimal posting times by platform (based on engagement data)
  const optimalTimes: Record<string, string[]> = {
    linkedin: ["08:00", "12:00", "17:30"],            // Tue, Wed, Thu
    twitter: ["09:00", "12:30", "15:00", "18:00"],    // Daily
    instagram: ["11:00", "19:00"],                      // Mon, Wed, Fri
  };

  for (const post of posts) {
    const scheduledAt = getNextOptimalSlot(post.platform, optimalTimes);

    const response = await fetch("https://api.bufferapp.com/1/updates/create.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: bufferToken,
        text: post.content,
        "profile_ids[]": getProfileId(post.platform),
        scheduled_at: scheduledAt.toISOString(),
        ...(post.imageUrl ? { "media[link]": post.imageUrl } : {}),
      }),
    });

    if (!response.ok) {
      console.error(`Failed to schedule ${post.platform} post: ${await response.text()}`);
    }
  }
}
```

## Step 4: Performance Tracking and Optimization

Every week, the system pulls engagement metrics and feeds them back to the content generator. Posts that got high engagement influence the style of future posts.

```python
# analytics.py — Weekly performance analysis
# Runs every Monday via n8n cron trigger

def analyze_weekly_performance(posts: list[dict]) -> dict:
    """Analyze last week's posts and identify winning patterns.

    Returns insights that feed back into the content generation prompts
    to continuously improve engagement rates.
    """
    top_posts = sorted(posts, key=lambda p: p["engagement_rate"], reverse=True)[:5]
    bottom_posts = sorted(posts, key=lambda p: p["engagement_rate"])[:5]

    analysis_prompt = f"""Analyze these social media performance results for a dev tools company.

TOP PERFORMERS (highest engagement):
{format_posts(top_posts)}

BOTTOM PERFORMERS (lowest engagement):
{format_posts(bottom_posts)}

Identify:
1. What patterns do top posts share? (format, tone, topic, time)
2. What patterns do bottom posts share?
3. Three specific recommendations for next week's content."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": analysis_prompt}],
    )

    return {
        "insights": response.choices[0].message.content,
        "top_content_types": extract_content_types(top_posts),
        "best_posting_times": extract_best_times(top_posts),
        "avg_engagement_rate": sum(p["engagement_rate"] for p in posts) / len(posts),
    }
```

## Results After 8 Weeks

Leo now spends 4 hours per week on social media instead of 20. He writes one deep blog post or records one podcast episode, feeds it into the pipeline, reviews and tweaks the generated posts (30 minutes), and the system handles the rest.

- **Content volume**: 8 posts/week → 32 posts/week (4x increase)
- **Time spent**: 20 hours/week → 4 hours/week (review + one long-form piece)
- **LinkedIn followers**: +340% growth (consistent daily posting vs sporadic)
- **Twitter impressions**: 12K/week → 89K/week (daily threads compound)
- **Inbound leads from social**: 3/month → 14/month
- **Content cost**: $0.12 per generated post (GPT-4o) + $0 for Buffer (free tier, 3 channels)
