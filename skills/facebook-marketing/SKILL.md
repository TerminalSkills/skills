---
name: facebook-marketing
description: >-
  Create, optimize, and automate Facebook content for Pages, Groups, and Ads.
  Use when someone asks to "grow Facebook page", "create Facebook ads", "manage
  Facebook group", "Facebook API integration", "automate Facebook posting",
  "Facebook analytics", or "Facebook marketing strategy". Covers Pages, Groups,
  Graph API publishing, Ads Manager API, Messenger bots, and growth strategies.
license: Apache-2.0
compatibility: 'Facebook Graph API v19.0+, Marketing API. Requires Facebook Business account.'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: marketing
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

Facebook algorithm (2025-2026):

- **Meaningful interactions** — content that sparks conversations between people, not just brand-to-consumer
- **Groups priority** — Group content ranks higher than Page content in feed
- **Video (especially Reels)** — native video gets 2-3x more reach than links or images
- **Shares to Messenger** — private shares are a very strong signal
- **Comments with replies** — long comment threads boost distribution
- **Friends and family first** — personal connections outrank brand pages

What kills reach:
- Engagement bait ("Like if you agree", "Tag a friend who...")
- Clickbait headlines that don't deliver
- Links to low-quality websites
- Frequently shared misinformation content
- Posts flagged by users as irrelevant

### Content Formats

#### Reels (Primary organic reach)
- **Duration:** 15-90 seconds (30-60s optimal)
- **Aspect ratio:** 9:16 (1080x1920px) vertical
- **Hook:** First 3 seconds — text overlay or surprising visual
- **Captions:** Required — most watch without sound
- **Cross-posting:** Can auto-share to Instagram Reels
- **Music:** Use Facebook's licensed music library

#### Video (Native)
- **Duration:** 1-3 minutes for feed (60-90s highest engagement)
- **Aspect ratio:** 1:1 (square) or 4:5 for feed, 9:16 for Reels/Stories
- **Upload:** Native only — YouTube links get suppressed
- **Captions:** Auto-generated available, always enable
- **Live Video:** Gets priority in feed, sends notifications to followers

#### Images
- **Recommended:** 1200x630px for link shares, 1080x1080px for standalone
- **Carousel:** 2-10 images, each 1080x1080px
- **Infographics** perform well when shareable
- **Text on images:** Keep under 20% of image area (ad policy, also good for feed)

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

### Facebook Groups (Highest organic reach)

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
Use membership questions (3 max) to filter spammers, enable post approval for new members' first 2 weeks, set keyword alerts for spam, and use Admin Assist to auto-decline posts with certain URLs.

### Facebook Graph API

#### Authentication
```typescript
// Facebook uses same OAuth as Instagram (shared Meta platform)
const FB_AUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';

// Step 1: Redirect user
const authUrl = new URL(FB_AUTH_URL);
authUrl.searchParams.set('client_id', process.env.FB_APP_ID);
authUrl.searchParams.set('redirect_uri', process.env.REDIRECT_URI);
authUrl.searchParams.set('scope', 'pages_manage_posts,pages_read_engagement,pages_show_list,pages_manage_metadata,read_insights');

// Step 2: Exchange code for token
const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&redirect_uri=${REDIRECT_URI}&code=${code}`);
const { access_token } = await tokenRes.json();

// Step 3: Get Page access token (long-lived)
const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${access_token}`);
const { data: pages } = await pagesRes.json();
const pageToken = pages[0].access_token; // Already long-lived when from long-lived user token
const pageId = pages[0].id;
```

#### Publish to Page
```typescript
// Text post
const postRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Your post text here...',
    access_token: pageToken,
  }),
});

// Post with image
const photoRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com/image.jpg', // Public URL
    caption: 'Photo caption...',
    access_token: pageToken,
  }),
});

// Schedule a post (Unix timestamp, minimum 10 min from now)
await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
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
// Page insights
const insightsRes = await fetch(
  `https://graph.facebook.com/v19.0/${pageId}/insights?metric=page_impressions,page_engaged_users,page_fans,page_views_total&period=day&since=${startDate}&until=${endDate}&access_token=${pageToken}`
);

// Post insights
const postInsightsRes = await fetch(
  `https://graph.facebook.com/v19.0/${postId}/insights?metric=post_impressions,post_engaged_users,post_clicks,post_reactions_by_type_total&access_token=${pageToken}`
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
const campaignRes = await fetch(`https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns`, {
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
// Use daily_budget in cents (2000 = $20/day), LOWEST_COST_WITHOUT_CAP bid strategy
```

### Growth Strategy

**Page posting schedule:** 1-2 posts/day + Stories

**Content mix:**
- 40% native video / Reels (highest organic reach)
- 25% community engagement (questions, polls, discussions)
- 20% images / carousels (shareable, saveable)
- 10% links (post in comments when possible)
- 5% live video (notifications sent to followers)

**Groups strategy (highest ROI):**
- Create a niche community around your topic
- Post daily prompts, answer questions personally
- Don't sell in the group — build trust, sell in DMs/links
- Feature community members (they share, expanding reach)
- Use Units for structured learning content

## Examples

### Example 1: Create a Facebook Group engagement strategy for a SaaS community
**User prompt:** "I run a project management tool called TaskPilot. We have a Facebook Group with 3,400 members but engagement is dying. Create a plan to revive it."

The agent will create a weekly engagement framework for the TaskPilot Community group. Monday: "Workflow Wednesday Preview" poll asking members to vote on the next tutorial topic (options: Gantt charts, sprint boards, time tracking, resource allocation). Tuesday: resource sharing thread where members post their favorite productivity tools. Wednesday: step-by-step tutorial post with screenshots showing a specific TaskPilot workflow. Thursday: "Win of the Week" thread prompting members to share completed projects. Friday: casual off-topic discussion. The plan includes setting up 3 membership screening questions, enabling post approval for members under 14 days old, pinning community rules, creating themed Highlights from past valuable posts, and scheduling a monthly Live Q&A with the product team. Each post includes specific copy and engagement-driving CTAs like "Drop a screenshot of your dashboard setup below."

### Example 2: Build a Facebook Page posting automation with the Graph API
**User prompt:** "Write a TypeScript script that publishes a text post and a photo post to our Facebook Page (Greenleaf Nursery, page ID 108374625190283) and then fetches the page insights for the last 7 days."

The agent will create a TypeScript script that authenticates using a long-lived Page access token from environment variable `FB_PAGE_TOKEN`. It publishes a text post via `POST /v19.0/108374625190283/feed` with the message "Spring planting season is here! Visit us this weekend for 20% off all native perennials." Then it publishes a photo post via `POST /v19.0/108374625190283/photos` with a public image URL and caption. Finally, it fetches 7-day page insights by calling `GET /v19.0/108374625190283/insights` with metrics `page_impressions,page_engaged_users,page_fans,page_views_total`, period `day`, and date range parameters. The script logs each post's returned ID and prints the insights as a formatted table.

## Guidelines

- Native video > links > images for reach (algorithm preference order)
- Groups are the highest-ROI Facebook channel for organic growth in 2025-2026
- Don't link-dump — write valuable posts that happen to have links
- Post Reels to get non-follower reach (same mechanic as Instagram/TikTok)
- Facebook Ads: start with $10-20/day, test 3 ad variations, kill losers after 1000 impressions
- Use Lookalike audiences from your email list or website visitors for ads
- UTM parameters on every link — track what converts, not just what clicks
- Reply to every comment — extends post visibility and builds community
- Live Video sends push notifications — use it for announcements and Q&A
- Cross-post Reels to Instagram (native cross-posting from Meta Business Suite)
