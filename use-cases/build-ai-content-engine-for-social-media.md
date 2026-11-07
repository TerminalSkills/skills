---
title: Build an AI Content Engine That Runs Your Social Media
slug: build-ai-content-engine-for-social-media
description: >-
  Automate social media by turning one long-form piece into 30+ platform-optimized posts across LinkedIn, Twitter, and Instagram using OpenAI and n8n orchestration.
skills: [n8n, openai-sdk, twitter-x-marketing, linkedin-marketing, instagram-marketing]
category: marketing
tags: [content-marketing, social-media, automation, ai-content, repurposing]
---

# Build an AI Content Engine That Runs Your Social Media

Leo is the solo marketer at a 15-person developer tools startup, responsible for LinkedIn, Twitter, Instagram, and a newsletter. He spends 20 hours per week creating and scheduling content. His insight: most social content is derived from the same core ideas, just reformatted per platform.

## The Problem

A single blog post contains enough material for 10 LinkedIn posts, 15 tweets, and 5 Instagram carousels. But manually reformatting, optimizing for each platform's algorithm, and scheduling across channels eats 20 hours a week. The CEO wants Leo to also manage the company blog and YouTube. Content ideas aren't the bottleneck — the manual labor of repurposing and scheduling is.

## The Solution

Build an automated pipeline where Leo drops one long-form piece (blog post, podcast transcript, or video script) into a webhook. n8n orchestrates the flow: extract content atoms with the OpenAI Responses API, generate platform-specific posts, and schedule everything through Buffer's GraphQL API. Leo reviews every draft before anything is scheduled.

```bash
terminal-skills install n8n openai-sdk twitter-x-marketing linkedin-marketing instagram-marketing
```

## Step-by-Step Walkthrough

### 1. Content Atomization Pipeline in n8n

Self-host n8n as the n8n skill describes (Docker image `docker.n8n.io/n8nio/n8n`, pinned tag, Postgres, `N8N_ENCRYPTION_KEY`, `N8N_WEBHOOK_URL` set to the public URL). Since n8n 2.0, Code nodes cannot read environment variables (`N8N_BLOCK_ENV_ACCESS_IN_NODE` defaults to `true`), so the OpenAI key lives in an n8n credential and the call is an HTTP Request node.

Workflow: **Webhook** (POST, path `content-engine`, Header Auth, published so the `/webhook/content-engine` production URL is live) -> **HTTP Request** (POST `https://api.openai.com/v1/responses`, Authentication "Generic Credential Type" -> Header Auth with `Authorization: Bearer <key>`, body type JSON, "Using JSON" with the expression below) -> **Code** (below).

```javascript
// HTTP Request node, JSON body (expression)
{{ {
  model: "gpt-6-luna",
  instructions: "Extract atomic content pieces from the text. For each: core_insight, hook, supporting_evidence, target_platforms (linkedin, twitter, instagram), content_type (thought_leadership, how_to, data_point, story, controversial_take).",
  input: "Content type: " + $json.body.type + "\n\n" + $json.body.content,
  text: { format: {
    type: "json_schema", name: "atoms", strict: true,
    schema: {
      type: "object", additionalProperties: false, required: ["atoms"],
      properties: { atoms: { type: "array", items: {
        type: "object", additionalProperties: false,
        required: ["core_insight", "hook", "supporting_evidence", "target_platforms", "content_type"],
        properties: {
          core_insight: { type: "string" }, hook: { type: "string" },
          supporting_evidence: { type: "string" },
          target_platforms: { type: "array", items: { type: "string" } },
          content_type: { type: "string" }
        } } } }
    }
  } }
} }}
```

```javascript
// Code node, mode: Run Once for All Items
const res = $input.first().json;
const message = res.output.find(o => o.type === "message");   // reasoning items may come first
const atoms = JSON.parse(message.content[0].text).atoms;
return atoms.map(atom => ({ json: atom }));
```

Test it with `curl -X POST https://n8n.devtoolsco.example/webhook/content-engine -H 'X-Api-Key: ...' -H 'Content-Type: application/json' -d @episode.json`. `gpt-6-luna` is the cheapest GPT-6 model on OpenAI's models page and supports structured outputs; read the name from the current model list (see the openai-sdk skill), because older names such as `gpt-4o` are scheduled for shutdown.

### 2. Platform-Specific Content Generation

Each atom is transformed into platform-native posts. LinkedIn gets professional storytelling with formatting. Twitter gets punchy threads (4-7 tweets, each under 280 chars). Instagram gets carousel slide text with captions.

```python
from openai import OpenAI
from pydantic import BaseModel

client = OpenAI()          # reads OPENAI_API_KEY from the environment

class LinkedInPost(BaseModel):
    hook: str           # First line, the scroll-stopper
    body: str           # Main content with line breaks
    cta: str            # Call-to-action
    hashtags: list[str] # 3-5 relevant hashtags

class TwitterThread(BaseModel):
    tweets: list[str]   # 4-7 tweets; validate len(t) <= 280 before scheduling

def generate_linkedin(atom: dict) -> LinkedInPost:
    response = client.responses.parse(
        model="gpt-6-luna",
        instructions="Write a LinkedIn post. Bold-style first line, short paragraphs, "
                     "end with a question. 800-1200 chars. Return the structured fields.",
        input=f"Content atom:\n{atom}",
        text_format=LinkedInPost,
    )
    return response.output_parsed
```

Generate the other formats the same way with their own models. The platform skills set the rules each draft is checked against: `twitter-x-marketing` (280 characters per post, links in a reply rather than the post), `linkedin-marketing` (hook in the first two lines, link in the first comment) and `instagram-marketing` (carousel slides and caption limits). For Instagram the model writes slide text and a caption; Leo still turns the text into images, because carousel slides must be uploaded as image files.

### 3. Scheduling and Performance Feedback

Leo approves drafts in Notion, then an n8n step schedules the approved ones. Buffer's current API is GraphQL at `https://api.buffer.com` (the old `api.bufferapp.com/1/updates/create.json` REST endpoint is the legacy API). Create an API key in Buffer's API settings, store it as an n8n Header Auth credential or in the script's environment, and look up channel IDs once with the `channels` query for your organization.

```typescript
const optimalTimes: Record<string, string[]> = {   // starting points: test them on your own audience
  linkedin: ["08:00", "12:00", "17:30"],
  twitter: ["09:00", "12:30", "15:00", "18:00"],
  instagram: ["11:00", "19:00"],
};

const mutation = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id text } }
      ... on MutationError { message }
    }
  }`;

for (const post of posts) {
  if (post.platform === "instagram" && !post.imageUrl) continue;   // slides not rendered yet
  const dueAt = getNextOptimalSlot(post.platform, optimalTimes);   // a Date
  const res = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BUFFER_API_KEY}`,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          text: post.content,
          channelId: getChannelId(post.platform),
          schedulingType: "automatic",
          mode: "customScheduled",
          dueAt: dueAt.toISOString(),
          // Instagram needs a public image URL and its post type; text-only posts are rejected
          ...(post.platform === "instagram" && {
            assets: [{ image: { url: post.imageUrl } }],
            metadata: { instagram: { type: "post", shouldShareToFeed: true } },
          }),
        },
      },
    }),
  });
  const { data, errors } = await res.json();
  if (errors || data.createPost.message) throw new Error(JSON.stringify(errors ?? data.createPost));
}
```

Each week a second n8n workflow (Schedule Trigger) reads post metrics, from Buffer's post-metrics queries or each platform's API, and appends the top performers to the generation prompts as style examples.

## Real-World Example

Leo, solo marketer at DevToolsCo (15 people), records a 30-minute podcast about their migration from REST to GraphQL.

1. He pastes the transcript into the n8n webhook
2. The pipeline extracts 12 content atoms (performance wins, developer experience insights, migration pitfalls)
3. OpenAI generates 12 LinkedIn posts, 8 Twitter threads, and 5 Instagram carousels
4. Leo reviews in Notion, tweaks 3 posts, approves the rest (30 minutes)
5. Buffer schedules everything across the week at optimal times

**Leo's numbers after 8 weeks (his own tracking, not a benchmark):** content volume went from 8 to 32 posts a week and his weekly time from 20 hours to 4, most of it review. Check OpenAI's pricing page for your model before budgeting the generation cost.

## Related Skills

- [n8n](../skills/n8n/) — Orchestrate the full content pipeline
- [openai-sdk](../skills/openai-sdk/) — Power content generation and atomization
- [twitter-x-marketing](../skills/twitter-x-marketing/) — Platform-specific Twitter optimization
- [linkedin-marketing](../skills/linkedin-marketing/) — LinkedIn post formatting and strategy
- [instagram-marketing](../skills/instagram-marketing/) — Instagram carousel and caption generation
