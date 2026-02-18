---
name: youtube-marketing
description: >-
  Create, optimize, and manage YouTube content for channel growth, audience
  building, and monetization. Use when someone asks to "grow on YouTube",
  "optimize YouTube videos", "YouTube SEO", "YouTube Shorts strategy", "YouTube
  API integration", "automate YouTube uploads", "YouTube analytics", "YouTube
  thumbnail", or "YouTube content strategy". Covers long-form video, Shorts,
  SEO, thumbnail design, YouTube Data API, analytics, monetization, and growth
  strategies.
license: Apache-2.0
compatibility: >-
  YouTube Data API v3, YouTube Analytics API. Requires Google Cloud project with
  YouTube API enabled.
metadata:
  author: terminal-skills
  version: 1.0.0
  category: marketing
  tags:
    - youtube
    - video
    - social-media
    - seo
    - shorts
---

# YouTube Marketing

## Overview

This skill helps AI agents create high-performing YouTube content and integrate with the YouTube Data API. It covers long-form video strategy, Shorts, SEO optimization, thumbnail design, upload automation, analytics, monetization paths, and growth strategies for YouTube's search-and-recommendation algorithm.

## Instructions

### Algorithm & Discovery

**Search (YouTube is the #2 search engine):** title/description/tags keyword matching, video transcript indexed, engagement rate (CTR + watch time), fresh content boost.

**Recommendations (70%+ of views):** click-through rate (thumbnail + title), average view duration, session time, viewer satisfaction (likes, shares, comments), upload consistency.

What kills reach: clickbait without delivery, long intros, inconsistent uploads, misleading thumbnails.

### Content Formats

**Long-Form (8-20 min):** Hook (0-30s) -> Context (30s-1min) -> Main content -> CTA. Specs: 1080p minimum (4K preferred), MP4 H.264, clear audio at -14 to -12 LUFS. Retention techniques: pattern interrupts every 30-60s, open loops, chapters/timestamps, visual variety.

**Shorts (under 60s, 9:16 vertical):** Hook in first 1 second, single focused idea, loop-friendly endings, use as funnel to long-form. Post 3-5 Shorts/week.

**Community Posts (500+ subscribers):** Polls, images, video teasers. Post 2-3x/week between uploads.

### YouTube SEO

**Title:** 60-70 chars, primary keyword near start, number + benefit works. Formula: `[Primary Keyword] — [Benefit/Hook] ([Modifier])`. Example: "Next.js Authentication — Complete Guide (2026)".

**Description:** First 150 chars appear in search (front-load keywords). Include timestamps/chapters (min 3). 150-300 words total. Links below the fold.

**Tags:** 5-15 per video, primary keyword first, mix exact match + broader terms.

**Thumbnail:** 1280x720px, high contrast, expressive face, 3-5 words max bold text, consistent branding, rule of thirds.

**Captions:** Upload accurate SRT (auto-captions have errors). YouTube indexes caption text for search. Multi-language subtitles expand global reach.

### YouTube Data API v3

```typescript
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials(tokens);
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

// Upload video
const res = await youtube.videos.insert({
  part: ['snippet', 'status'],
  requestBody: {
    snippet: {
      title: 'Next.js Authentication — Complete Guide (2026)',
      description: 'Learn how to implement auth in Next.js...\n\n0:00 Introduction\n1:23 Setup',
      tags: ['nextjs', 'authentication', 'tutorial'],
      categoryId: '28',
    },
    status: { privacyStatus: 'private', publishAt: '2026-03-01T15:00:00.000Z', selfDeclaredMadeForKids: false },
  },
  media: { body: fs.createReadStream('/path/to/video.mp4') },
});
await youtube.thumbnails.set({ videoId: res.data.id, media: { body: fs.createReadStream('/path/to/thumb.jpg') } });

// Upload Short (vertical video + #Shorts in title)
await youtube.videos.insert({
  part: ['snippet', 'status'],
  requestBody: {
    snippet: { title: '3 Git Commands You Didn\'t Know #Shorts', tags: ['shorts', 'git'], categoryId: '28' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  },
  media: { body: fs.createReadStream('/path/to/short-vertical.mp4') },
});

// Create playlist and add video
const playlist = await youtube.playlists.insert({
  part: ['snippet', 'status'],
  requestBody: { snippet: { title: 'Next.js Complete Course' }, status: { privacyStatus: 'public' } },
});
await youtube.playlistItems.insert({
  part: ['snippet'],
  requestBody: { snippet: { playlistId: playlist.data.id, resourceId: { kind: 'youtube#video', videoId: 'abc123' } } },
});
```

### Analytics

```typescript
const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });

// Channel stats
const stats = await youtubeAnalytics.reports.query({
  ids: 'channel==MINE', startDate: '2026-01-01', endDate: '2026-02-18',
  metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained',
  dimensions: 'day', sort: '-day',
});

// Top videos
const top = await youtubeAnalytics.reports.query({
  ids: 'channel==MINE', startDate: '2026-01-01', endDate: '2026-02-18',
  metrics: 'views,estimatedMinutesWatched,averageViewDuration,likes',
  dimensions: 'video', sort: '-views', maxResults: 20,
});
```

### Monetization

**YPP requirements:** 1,000 subscribers + 4,000 watch hours (12 months) or 10M Shorts views (90 days).

**Revenue streams:** Ad revenue ($3-8 CPM tech niche), channel memberships, Super Chat/Thanks, YouTube Shopping, Shorts revenue sharing.

**Beyond YPP:** Sponsorships ($50-200/1K views for tech), affiliate links, own products/courses, consulting.

### Growth Strategy

Upload 1-2 long-form/week + 3-5 Shorts/week. Content mix: 50% tutorials, 25% Shorts, 15% trend-jacking, 10% community. First 48 hours: share everywhere, reply to every comment, pin a question comment, post to relevant communities.

## Examples

### Example 1: Optimize and schedule a tutorial video upload
**User prompt:** "Upload my Next.js authentication tutorial video to YouTube with proper SEO, a custom thumbnail, and schedule it for Saturday at 3 PM UTC."

The agent will:
1. Call `youtube.videos.insert` with `privacyStatus: 'private'` and `publishAt: '2026-03-07T15:00:00.000Z'`
2. Set the title to "Next.js Authentication — Complete Guide (2026)" with primary keywords front-loaded
3. Write a 200-word description with timestamps, keywords, and resource links below the fold
4. Add 10 relevant tags mixing exact-match and broader terms
5. Upload the custom thumbnail via `youtube.thumbnails.set`

### Example 2: Analyze channel performance and identify growth opportunities
**User prompt:** "Pull my YouTube analytics for the last 30 days and tell me which videos are driving the most subscribers and where my traffic is coming from."

The agent will:
1. Query `youtubeAnalytics.reports` with `dimensions: 'video'` and `metrics: 'subscribersGained,views,averageViewDuration'` sorted by subscribers gained
2. Query traffic sources with `dimensions: 'insightTrafficSourceType'` to identify search vs. browse vs. suggested splits
3. Present the top 5 subscriber-driving videos with their view duration and CTR metrics
4. Recommend content strategy adjustments based on which traffic sources are strongest

## Guidelines

- Thumbnail + title are 80% of the click decision — spend time on them
- First 30 seconds determine if people stay — hook immediately, no long intros
- Upload as unlisted, set thumbnail, add end screen, then publish (avoid low CTR on default thumbnail)
- Chapters in description improve retention (viewers jump to relevant parts instead of leaving)
- Cards and end screens — always point to your best-performing video or relevant playlist
- Upload SRT captions — auto-captions have errors, YouTube indexes caption text for search
- Consistency beats virality — 1 video/week for 2 years beats random posting
- Shorts and long-form serve different purposes: Shorts for reach, long-form for watch time and monetization
- Study Analytics Audience tab for optimal posting times
- Every video should answer: "Why click THIS video instead of the other 10 on this topic?"
