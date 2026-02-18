---
name: linkedin-marketing
description: >-
  Create, optimize, and automate LinkedIn content for personal branding, lead
  generation, and B2B marketing. Use when someone asks to "write a LinkedIn
  post", "grow on LinkedIn", "LinkedIn content strategy", "LinkedIn API
  integration", "automate LinkedIn posting", "LinkedIn carousel", "LinkedIn
  analytics", or "LinkedIn outreach". Covers content creation with
  platform-specific formatting, API integration, analytics, and growth
  strategies.
license: Apache-2.0
compatibility: 'LinkedIn API v2, LinkedIn Marketing API. Node.js/Python examples.'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: marketing
  tags:
    - linkedin
    - social-media
    - b2b
    - content-marketing
    - personal-branding
---

# LinkedIn Marketing

## Overview

This skill helps AI agents create high-performing LinkedIn content and integrate with the LinkedIn API. It covers platform-specific content rules, post formatting, carousel creation, API-based publishing, analytics tracking, and growth strategies tailored to LinkedIn's algorithm and audience behavior.

## Instructions

### Platform Rules & Algorithm

LinkedIn's algorithm in 2025-2026 prioritizes:

- **Dwell time** — how long people spend reading your post (long-form > short)
- **Early engagement** — first 60-90 minutes are critical for distribution
- **Comments > reactions** — comments weight 5-8x more than likes
- **Native content** — no external links in post body (kills reach 40-50%)
- **Relevance** — content shown to people interested in the topic, not just connections
- **Consistency** — 3-5 posts/week beats 1 viral post/month

What kills reach:
- External links in post body (put in comments instead)
- Editing post within first hour
- Engagement pods (LinkedIn detects and suppresses)
- Hashtag stuffing (3-5 max)
- Tagging people who don't engage back

### Content Formats & Best Practices

#### Text Posts (Highest organic reach)
```
[Hook — first 2 lines are everything, must stop the scroll]

[Line break after every 1-2 sentences for mobile readability]

[Body — story, insight, or framework. 800-1300 characters optimal]

[Each paragraph is 1-3 short sentences max]

[CTA — question to drive comments, not "like if you agree"]

[3-5 relevant hashtags at the bottom]
```

**Formatting rules:**
- First 2 lines show before "...see more" — make them irresistible
- Use line breaks aggressively — wall of text = scroll past
- 800-1300 characters is the sweet spot (long enough for dwell time, short enough to finish)
- Emojis sparingly as bullet markers (🔹, →, ✅), not decoration
- No markdown — LinkedIn doesn't render it. Use CAPS or emojis for emphasis
- End with a question to drive comments (open-ended, not yes/no)

#### Carousels (PDF documents — highest save rate)
- Upload as PDF (each page is a slide)
- Slide size: 1080x1350px (4:5 ratio) or 1080x1080px (1:1)
- 8-12 slides optimal
- First slide = hook/title (bold, minimal text)
- Last slide = CTA + profile summary
- One idea per slide, large text (24-32pt minimum)
- Brand colors and consistent design
- File size: under 100MB, max 300 pages

#### Polls (High engagement, low effort)
- 2 weeks duration optimal
- 3-4 options (not 2 — too binary)
- Add context in the post body explaining why you're asking
- Follow up with results analysis post

#### Articles & Newsletters
- Articles: 1000-2000 words, SEO-indexed by Google
- Newsletters: subscribers get email + in-app notification
- Good for long-form thought leadership
- Lower viral potential but higher authority building
- Include images every 300-400 words

#### Video
- Native video (not YouTube links)
- Vertical (9:16) or square (1:1) — NOT widescreen
- Under 2 minutes for feed (30-90s optimal)
- Captions mandatory (80%+ watch without sound)
- Hook in first 3 seconds
- Max file size: 5GB, max duration: 15 minutes

### LinkedIn API Integration

#### Authentication (OAuth 2.0)
```typescript
// LinkedIn uses OAuth 2.0 with 3-legged flow
const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

// Step 1: Redirect user to authorize
const authUrl = new URL(LINKEDIN_AUTH_URL);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', process.env.LINKEDIN_CLIENT_ID);
authUrl.searchParams.set('redirect_uri', process.env.LINKEDIN_REDIRECT_URI);
authUrl.searchParams.set('scope', 'openid profile email w_member_social');
// Redirect user to authUrl.toString()

// Step 2: Exchange code for token
const tokenResponse = await fetch(LINKEDIN_TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
  }),
});
const { access_token, expires_in } = await tokenResponse.json();
// Token valid for 60 days, refresh before expiry
```

#### Post Content via API
```typescript
// Get user profile URN
const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
  headers: { Authorization: `Bearer ${access_token}` },
});
const { sub: personUrn } = await profileRes.json();

// Create a text post
const postRes = await fetch('https://api.linkedin.com/v2/posts', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': '202401',
  },
  body: JSON.stringify({
    author: `urn:li:person:${personUrn}`,
    commentary: 'Your post text here...',
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
  }),
});

// Create a post with image
// Step 1: Initialize upload
const uploadRes = await fetch('https://api.linkedin.com/v2/images?action=initializeUpload', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    initializeUploadRequest: {
      owner: `urn:li:person:${personUrn}`,
    },
  }),
});
const { value: { uploadUrl, image: imageUrn } } = await uploadRes.json();

// Step 2: Upload image binary
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/png' },
  body: imageBuffer,
});

// Step 3: Create post with image
await fetch('https://api.linkedin.com/v2/posts', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': '202401',
  },
  body: JSON.stringify({
    author: `urn:li:person:${personUrn}`,
    commentary: 'Post with image...',
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
    },
    content: {
      media: {
        id: imageUrn,
        title: 'Image title',
      },
    },
    lifecycleState: 'PUBLISHED',
  }),
});
```

#### Company Page Posting
```typescript
// Post as company page (requires r_organization_admin + w_organization_social)
await fetch('https://api.linkedin.com/v2/posts', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': '202401',
  },
  body: JSON.stringify({
    author: 'urn:li:organization:12345678',
    commentary: 'Company update...',
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED' },
    lifecycleState: 'PUBLISHED',
  }),
});
```

#### Analytics
```typescript
// Get post analytics (requires r_organization_social scope for org posts)
const analyticsRes = await fetch(
  `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:12345678&timeIntervals.timeGranularityType=DAY&timeIntervals.timeRange.start=1704067200000&timeIntervals.timeRange.end=1706745600000`,
  { headers: { Authorization: `Bearer ${access_token}` } }
);

// Personal post metrics via ugcPosts
const ugcRes = await fetch(
  `https://api.linkedin.com/v2/socialMetadata/${postUrn}`,
  { headers: { Authorization: `Bearer ${access_token}` } }
);
```

### Growth Strategy

**Posting schedule:** 3-5x/week (Tue-Thu peak engagement, 8-10 AM local time)

**Content mix:**
- 40% educational (frameworks, how-tos, lessons learned)
- 25% stories (personal experiences, behind-the-scenes)
- 20% opinion/contrarian takes (drives comments)
- 10% engagement posts (polls, questions)
- 5% promotional (product, hiring, announcements)

**Comment strategy:**
- Reply to every comment on your posts within 2 hours
- Leave 5-10 thoughtful comments/day on posts in your niche
- Comments on big accounts get you visibility to their audience
- Ask follow-up questions in comments to extend threads

## Examples

### Example 1: Write a LinkedIn post announcing a product launch
**User prompt:** "Write a LinkedIn post for me. I'm the CTO of Meridian Analytics and we just launched a real-time data pipeline product called StreamFlow that processes 2 million events per second. Target audience is engineering leaders at mid-size SaaS companies."

The agent will draft a LinkedIn text post optimized for the algorithm. The first two lines hook with: "We spent 14 months building something we couldn't find anywhere else.\n\nToday we're launching StreamFlow — a real-time data pipeline that handles 2M events/sec with sub-10ms latency." The body tells the story of the problem (batch processing delays costing customers $40K/month in stale dashboards), the solution, and early results from beta customers. It ends with an open-ended question: "What's the biggest bottleneck in your data pipeline today?" followed by 4 hashtags: #DataEngineering #RealTimeAnalytics #SaaS #ProductLaunch. The link to the product page goes in a separate first comment, not in the post body.

### Example 2: Automate posting to a LinkedIn company page via API
**User prompt:** "Build a TypeScript function that posts a weekly engineering blog summary to our LinkedIn company page (Meridian Analytics, org ID 91847362) every Monday at 9 AM EST."

The agent will create a TypeScript module that authenticates with LinkedIn OAuth 2.0 using `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` from environment variables, obtains an access token with `w_organization_social` scope, then calls `POST /v2/posts` with `author: "urn:li:organization:91847362"`, the formatted blog summary as `commentary`, `visibility: "PUBLIC"`, and `lifecycleState: "PUBLISHED"`. The function is wrapped in a cron scheduler using `node-cron` with the pattern `0 9 * * 1` (Mondays at 9 AM). It includes token refresh logic to handle the 60-day expiry and logs each post's success or failure to a `linkedin-posts.log` file.

## Guidelines

- Put links in the FIRST COMMENT, never in the post body
- Write for mobile — 60%+ of LinkedIn users are on phones
- Don't edit posts in the first hour — it resets distribution
- Use "I" not "we" for personal posts — LinkedIn is personal-first
- Tag max 3-5 people per post, only if they'll actually engage
- Post consistently at the same times — your audience learns when to expect you
- Repurpose high-performing posts after 3-4 months — new followers haven't seen them
- Save carousels as PDF at 1080x1350px for optimal mobile display
