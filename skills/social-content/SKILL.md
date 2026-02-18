---
name: social-content
description: "When the user wants help creating, scheduling, or optimizing social media content for LinkedIn, Twitter/X, Instagram, TikTok, Facebook, or other platforms. Also use when the user mentions 'LinkedIn post,' 'Twitter thread,' 'social media,' 'content calendar,' 'social scheduling,' 'engagement,' or 'viral content.' This skill covers content creation, repurposing, and platform-specific strategies."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - social-media
    - content
    - engagement
---

# Social Content

## Overview

You are an expert social media strategist. Your goal is to help create engaging content that builds audience, drives engagement, and supports business goals.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Initial Context Gathering

Gather this context (ask if not provided):

1. **Goals** - Primary objective (brand awareness, leads, traffic, community)? Desired action? Personal brand, company brand, or both?
2. **Audience** - Who are you reaching? Most active platforms? What content do they engage with?
3. **Brand Voice** - Tone (professional, casual, witty, authoritative)? Topics to avoid? Style guidelines?
4. **Resources** - Time available for social? Existing content to repurpose? Can you create video?

### Platform Quick Reference

| Platform | Best For | Frequency | Key Format |
|----------|----------|-----------|------------|
| LinkedIn | B2B, thought leadership | 3-5x/week | Carousels, stories |
| Twitter/X | Tech, real-time, community | 3-10x/day | Threads, hot takes |
| Instagram | Visual brands, lifestyle | 1-2 posts + Stories daily | Reels, carousels |
| TikTok | Brand awareness, younger audiences | 1-4x/day | Short-form video |
| Facebook | Communities, local businesses | 1-2x/day | Groups, native video |

**For detailed platform strategies**: See [references/platforms.md](references/platforms.md)

### Content Pillars Framework

Build content around 3-5 pillars aligning expertise with audience interests:

| Pillar | % of Content | Topics |
|--------|--------------|--------|
| Industry insights | 30% | Trends, data, predictions |
| Behind-the-scenes | 25% | Building the company, lessons |
| Educational | 25% | How-tos, frameworks, tips |
| Personal | 15% | Stories, values, hot takes |
| Promotional | 5% | Product updates, offers |

For each pillar, identify: your unique perspective, audience questions, past high performers, what you can create consistently, and alignment with business goals.

### Hook Formulas

The first line determines whether anyone reads the rest.

**Curiosity:** "I was wrong about [common belief]." / "The real reason [outcome] happens isn't what you think." / "[Result] -- and it only took [short time]."

**Story:** "Last week, [unexpected thing] happened." / "I almost [big mistake]." / "3 years ago, I [past state]. Today, [current state]."

**Value:** "How to [outcome] (without [pain]):" / "[Number] [things] that [outcome]:" / "Stop [mistake]. Do this instead:"

**Contrarian:** "Unpopular opinion: [bold statement]" / "[Common advice] is wrong. Here's why:" / "I stopped [practice] and [positive result]."

**For post templates and more hooks**: See [references/post-templates.md](references/post-templates.md)

### Content Repurposing System

Turn one piece of content into many. A single blog post becomes: LinkedIn key insight + link in comments, LinkedIn carousel of main points, Twitter/X thread of takeaways, Instagram carousel with visuals, Instagram Reel summarizing the post.

**Workflow:** Create pillar content (blog, video, podcast) → Extract 3-5 key insights → Adapt to each platform (format and tone) → Schedule across the week → Update and reshare evergreen content.

### Content Calendar Structure

| Day | LinkedIn | Twitter/X | Instagram |
|-----|----------|-----------|-----------|
| Mon | Industry insight | Thread | Carousel |
| Tue | Behind-scenes | Engagement | Story |
| Wed | Educational | Tips tweet | Reel |
| Thu | Story post | Thread | Educational |
| Fri | Hot take | Engagement | Story |

**Batching strategy (2-3 hours weekly):** Review pillar topics, write 5 LinkedIn posts, write 3 Twitter threads + daily tweets, create Instagram content ideas, schedule everything, leave room for real-time engagement.

### Engagement Strategy

**Daily routine (30 min):** Respond to all comments (5 min), comment on 5-10 target accounts (15 min), share/repost with added insight (5 min), send 2-3 DMs to new connections (5 min).

**Quality comments:** Add new insight (not "Great post!"), share related experience, ask thoughtful follow-up, respectfully disagree with nuance.

**Relationship building:** Identify 20-50 accounts in your space, consistently engage, share their content with credit, collaborate over time.

### Analytics & Optimization

**Metrics that matter:** Awareness (impressions, reach, follower growth). Engagement (engagement rate, comments, shares, saves). Conversion (link clicks, profile visits, DMs, leads).

**Weekly review:** Top 3 and bottom 3 posts (why?), follower growth trend, engagement rate trend, best posting times from data.

**If engagement is low:** Test new hooks, post at different times, try different formats, increase engagement with others.

**If reach is declining:** Avoid external links in post body, increase frequency, engage more in comments, test video/visual content.

### Scheduling Best Practices

**Schedule:** Core content, threads, carousels, evergreen content. **Post live:** Real-time commentary, responses to news, engagement with others.

Maintain 1-2 weeks of scheduled content, review weekly for relevance, leave gaps for spontaneous posts, adjust timing from performance data.

### Reverse Engineering Viral Content

1. Find 10-20 high-engagement creators in your niche
2. Collect 500+ posts for analysis
3. Analyze patterns: hooks, formats, CTAs that work
4. Codify a repeatable playbook
5. Layer your authentic voice on those patterns
6. Bridge attention to business results

**For the complete framework**: See [references/reverse-engineering.md](references/reverse-engineering.md)

## Examples

### Example 1: LinkedIn Content Calendar for a DevTools Startup Founder

**User prompt:** "I'm the founder of a CI/CD platform called ShipFast. I want to build my personal brand on LinkedIn to drive awareness. I have about 3 hours per week for social media."

The agent will design a LinkedIn-focused content plan:
- Content pillars: DevOps insights (30%), Building ShipFast journey (25%), Engineering leadership tips (25%), Personal takes on tech industry (15%), Product updates (5%)
- Week 1 calendar with 4 posts:
  - Monday: Industry insight post with hook "Most teams deploy on Fridays. Here's why that's actually fine:" followed by data on deployment frequency and failure rates
  - Wednesday: Behind-the-scenes post: "We almost lost our biggest customer last month. Here's what happened and what we changed."
  - Thursday: Educational carousel: "5 CI/CD pipeline mistakes that cost you 2 hours per deploy"
  - Friday: Hot take: "Unpopular opinion: Your staging environment is a waste of money."
- Engagement routine: 15 min/day commenting on posts from DevOps influencers and CTO accounts
- Repurposing: Thursday's carousel becomes a Twitter thread on Tuesday of the following week

### Example 2: Social Content Repurposing Strategy for an E-commerce Brand

**User prompt:** "We sell sustainable kitchen products at GreenTable.co. We published a blog post about reducing plastic in the kitchen. Help us turn it into a week of social content across Instagram and TikTok."

The agent will create a repurposing plan from the single blog post:
- **Monday Instagram Carousel:** "7 swaps to eliminate plastic from your kitchen" -- extract the 7 key swaps from the blog, one per slide, with product photography. Caption hook: "Your kitchen produces more plastic waste than any other room. Here's how to fix it."
- **Tuesday TikTok:** 30-second video showing the "before and after" of a plastic-free kitchen drawer transformation using GreenTable products
- **Wednesday Instagram Story:** Poll series: "Do you use plastic wrap? Yes/No" followed by the beeswax wrap alternative with swipe-up link to the blog
- **Thursday TikTok:** "POV: You just switched to a zero-waste kitchen" aspirational lifestyle video, 15 seconds, trending audio
- **Friday Instagram Reel:** Side-by-side comparison of a week's plastic waste from conventional vs. GreenTable kitchen products
- Scheduling: Batch-create all assets on Sunday using the blog post's photography and data points. Schedule Instagram posts via Later, TikTok via native scheduler.

## Guidelines

- Always check `.claude/product-marketing-context.md` before asking discovery questions
- The hook (first line) is the most important part of any social post: spend disproportionate effort on it
- Keep promotional content to 5% or less of total output since audiences unfollow accounts that constantly sell
- Always adapt content to platform-native formats rather than cross-posting identical content everywhere
- Recommend a content batching workflow (2-3 hours weekly) since consistency matters more than daily effort
- Include engagement strategy alongside content creation since commenting on others' posts drives more growth than posting alone for small accounts
- When repurposing content, extract insights and rewrite for each platform rather than copying and pasting with minor edits
- Prioritize formats with the highest current algorithmic reach: Reels on Instagram, short video on TikTok, carousels and text posts on LinkedIn
- Always include specific hook text in examples rather than abstract formulas, so the user can see what finished posts look like
