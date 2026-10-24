---
name: facebook-marketing
description: >-
  Create, optimize, and automate Facebook content for Pages, Groups, and Ads.
  Use when someone asks to "grow Facebook page", "create Facebook ads", "manage
  Facebook group", "Facebook API integration", "automate Facebook posting",
  "Facebook analytics", or "Facebook marketing strategy". Covers Pages, Groups,
  Graph API publishing, Ads Manager API, Messenger bots, and growth strategies.
license: Apache-2.0
compatibility: 'Facebook Graph API v26.0 (current as of 2026-10-24; v19.0 expired 2026-05-21), Marketing API. Requires Facebook Business account.'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags:
    - facebook
    - social-media
    - ads
    - groups
    - marketing
---

# Facebook Marketing

## Overview

This skill helps AI agents create content for Facebook Pages, manage Groups, run Ads, and integrate with the Facebook Graph API. It covers content formats, Page management, Group engagement, Ads Manager API, Messenger automation, analytics, and growth strategies for Facebook's mature, community-driven ecosystem.

## Instructions

### Platform Rules & Algorithm

Practices below are heuristics from common practice. Meta does not publish its feed ranking weights, and none of these points was verified against a Meta source in this round.

- Conversation-sparking posts tend to do better than brand announcements.
- Native video is usually preferred over link posts for reach.
- Engagement bait ("Like if you agree", "Tag a friend who...") and clickbait headlines are commonly reported to hurt reach.

### Content Formats

#### Reels
- **Specs:** check Meta's current Reels specifications before you produce one
- **Aspect ratio:** 9:16 vertical is the usual Reels format (common practice)
- **Hook:** First 3 seconds — text overlay or surprising visual (heuristic)
- **Captions:** Add them; many people watch without sound (heuristic)
- **Cross-posting:** check Meta Business Suite for current options
- **Music:** use only music your account is licensed to use

#### Video (Native)
- **Duration and aspect ratio:** check Meta's current specs for feed video
- **Upload:** upload the file natively; link posts are commonly reported to get less reach (heuristic)
- **Captions:** Auto-generated captions are available; enable them
- **Live Video:** a format for Q&A or announcements

#### Images (sizes are common practice; confirm against Meta's specs)
- **Typical sizes:** 1200x630px for link shares, 1080x1080px for standalone
- **Carousel:** 2-10 images, each 1080x1080px
- **Infographics** perform well when shareable

#### Text Posts (Pages & Groups)
- Keep under 250 characters for full visibility without "See more"
- Questions drive comments
- Polls built into Groups have high engagement
- Stories/anecdotes perform better than announcements

#### Links
- **Warning:** External links reduce organic reach significantly
- Post link in comments if possible
- If posting link directly: write compelling preview text, don't rely on auto-preview
- Use UTM parameters for tracking: `?utm_source=facebook&utm_medium=social&utm_campaign=name`

### Facebook Groups

#### Creating an Engaged Group
```
Group setup:
- Name: [Topic] + Community/Network/Hub (searchable keywords)
- Description: Clear value proposition, who it's for, rules summary
- Privacy: Private (more exclusive feel, better engagement)
- Rules: 5-7 clear rules, pin to top
- Welcome post: Auto-post for new members with introduction prompt
- Tags: Relevant topic tags for discoverability

Engagement framework:
- Monday: Weekly theme post / prompt
- Tuesday: Resource sharing day
- Wednesday: Question of the week (poll)
- Thursday: Win/milestone sharing
- Friday: Free discussion / off-topic
- Weekly: Go Live for Q&A or teaching
```

#### Group Moderation
Use membership questions to filter spammers, require post approval for new members, and use the moderation settings in the Group's admin tools. Setting names change, so check the current Meta Help Center page before you give steps.

### Facebook Graph API

#### Authentication
```typescript
// Facebook uses same OAuth as Instagram (shared Meta platform)
const FB_AUTH_URL = 'https://www.facebook.com/v26.0/dialog/oauth';

// Step 1: Redirect user
const authUrl = new URL(FB_AUTH_URL);
authUrl.searchParams.set('client_id', process.env.FB_APP_ID);
authUrl.searchParams.set('redirect_uri', process.env.REDIRECT_URI);
authUrl.searchParams.set('scope', 'pages_manage_posts,pages_manage_engagement,pages_read_engagement,pages_read_user_engagement,pages_show_list');

// Step 2: Exchange code for token
const tokenRes = await fetch(`https://graph.facebook.com/v26.0/oauth/access_token?client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&redirect_uri=${REDIRECT_URI}&code=${code}`);
const { access_token } = await tokenRes.json();

// Step 2b: swap the short-lived user token for a long-lived one:
// GET /v26.0/oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token={access_token}
// Step 3: Get Page access token (never expires when derived from a long-lived user token)
const pagesRes = await fetch(`https://graph.facebook.com/v26.0/me/accounts?access_token=${access_token}`);
const { data: pages } = await pagesRes.json();
const pageToken = pages[0].access_token; // Already long-lived when from long-lived user token
const pageId = pages[0].id;
```

#### Publish to Page
```typescript
// Text post
const postRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/feed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Your post text here...',
    access_token: pageToken,
  }),
});

// Post with image
const photoRes = await fetch(`https://graph.facebook.com/v26.0/${pageId}/photos`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://images.greenleaf-nursery.com/spring-perennials.jpg', // Public URL
    caption: 'Photo caption...',
    access_token: pageToken,
  }),
});

// Schedule a post (Unix timestamp, minimum 10 min from now)
await fetch(`https://graph.facebook.com/v26.0/${pageId}/feed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Scheduled post content...',
    published: false,
    scheduled_publish_time: Math.floor(Date.now() / 1000) + 86400,
    access_token: pageToken,
  }),
});
```

#### Analytics
```typescript
// Page insights. Meta deprecated page_impressions (-> page_media_view) and
// page_fans (-> page_follows) on 2025-11-15, and page_engaged_users in 2024.
// Check the Page Insights reference for the current metric list before use.
const insightsRes = await fetch(
  `https://graph.facebook.com/v26.0/${pageId}/insights?metric=page_media_view,page_follows&period=day&since=${startDate}&until=${endDate}&access_token=${pageToken}`
);

// Post insights (post_impressions was replaced by post_media_view on 2025-11-15)
const postInsightsRes = await fetch(
  `https://graph.facebook.com/v26.0/${postId}/insights?metric=post_media_view&access_token=${pageToken}`
);
```

### Facebook Ads (Marketing API)

#### Campaign Structure
```
Account
  └── Campaign (objective: awareness, traffic, engagement, leads, sales)
       └── Ad Set (targeting, budget, schedule, placements)
            └── Ad (creative: image/video, copy, CTA)
```

#### Create Campaign via API
```typescript
// Create campaign
const campaignRes = await fetch(`https://graph.facebook.com/v26.0/act_${adAccountId}/campaigns`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Website Traffic Q1 2026',
    objective: 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
    special_ad_categories: [],
    access_token: adToken,
  }),
});
const { id: campaignId } = await campaignRes.json();

// Then create Ad Set (targeting + budget), Ad Creative, and Ad
// Each references the parent: campaign → ad set → ad creative → ad
// Use daily_budget in cents (2000 = $20/day). Bid strategy names such as LOWEST_COST_WITHOUT_CAP were not verified in this round; confirm them in the Marketing API reference for v26.0
```

### Growth Strategy

**Page posting schedule (heuristic):** 1-2 posts/day + Stories

**Content mix (heuristic, not sourced):**
- 40% native video / Reels (highest organic reach)
- 25% community engagement (questions, polls, discussions)
- 20% images / carousels (shareable, saveable)
- 10% links (post in comments when possible)
- 5% live video (notifications sent to followers)

**Groups strategy:**
- Create a niche community around your topic
- Post daily prompts, answer questions personally
- Don't sell in the group — build trust, sell in DMs/links
- Feature community members (they share, expanding reach)
- Pin useful threads so new members find them

## Examples

### Example 1: Create a Facebook Group engagement strategy for a SaaS community
**User prompt:** "I run a project management tool called TaskPilot. We have a Facebook Group with 3,400 members but engagement is dying. Create a plan to revive it."

The agent will create a weekly engagement framework for the TaskPilot Community group. Monday: "Workflow Wednesday Preview" poll asking members to vote on the next tutorial topic (options: Gantt charts, sprint boards, time tracking, resource allocation). Tuesday: resource sharing thread where members post their favorite productivity tools. Wednesday: step-by-step tutorial post with screenshots showing a specific TaskPilot workflow. Thursday: "Win of the Week" thread prompting members to share completed projects. Friday: casual off-topic discussion. The plan includes setting up 3 membership screening questions, enabling post approval for members under 14 days old, pinning community rules, creating themed Highlights from past valuable posts, and scheduling a monthly Live Q&A with the product team. Each post includes specific copy and engagement-driving CTAs like "Drop a screenshot of your dashboard setup below."

### Example 2: Build a Facebook Page posting automation with the Graph API
**User prompt:** "Write a TypeScript script that publishes a text post and a photo post to our Facebook Page (Greenleaf Nursery, page ID 108374625190283) and then fetches the page insights for the last 7 days."

The agent will create a TypeScript script that authenticates using a long-lived Page access token from environment variable `FB_PAGE_TOKEN`. It publishes a text post via `POST /v26.0/108374625190283/feed` with the message "Spring planting season is here! Visit us this weekend for 20% off all native perennials." Then it publishes a photo post via `POST /v26.0/108374625190283/photos` with a public image URL and caption. Finally, it fetches 7-day page insights by calling `GET /v26.0/108374625190283/insights` with metrics `page_media_view,page_follows`, period `day`, and date range parameters. The script logs each post's returned ID and prints the insights as a formatted table.

## Guidelines

- Native video is common practice for reach; Meta does not publish ranking weights
- Groups can build an engaged community; no source checked here ranks their reach
- Don't link-dump — write valuable posts that happen to have links
- Reels can reach people who do not follow the Page; reach is not quantified here
- Facebook Ads: budgets, number of variants and stop rules are your own choice; none is set by a source here
- Use Lookalike audiences from your email list or website visitors for ads
- UTM parameters on every link — track what converts, not just what clicks
- Reply to every comment — extends post visibility and builds community
- Use Live Video for Q&A or announcements
- Check Meta Business Suite for cross-posting options before you rely on them
