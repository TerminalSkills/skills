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
  YouTube Data API v3, YouTube Analytics API v2. Requires a Google Cloud
  project with the YouTube APIs enabled and OAuth consent for uploads.
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags: "youtube, video, social-media, seo, shorts"
---

# YouTube Marketing

## Overview

This skill helps AI agents plan YouTube content (long-form, Shorts, titles, descriptions, thumbnails), automate uploads and playlists with the YouTube Data API v3, and read channel analytics with the YouTube Analytics API. Field limits, quotas and Partner Program rules below come from Google's documentation. Claims about what the recommendation system favours are heuristics: YouTube publishes no ranking formula, so test them against your own Analytics.

## Instructions

### Discovery (heuristics)

- **Search:** title, description, chapters and captions are text the system can match against a query, so put the real topic in plain words early
- **Recommendations:** click-through rate on the thumbnail and title, how long people watch, and whether viewers are satisfied. Read your own Analytics (impressions CTR, average view duration, retention graph) rather than trusting rules of thumb
- What hurts: a title or thumbnail that promises something the video does not deliver, long intros, hiding the answer

### Content formats

**Long-form:** Hook in the first seconds, state what the viewer will get, then deliver in clear sections with chapters. Upload at 1080p or higher in MP4 (H.264) with clean audio. Retention tools: pattern changes, open loops, visual variety. Check the retention graph and cut where it drops.

**Shorts:** vertical video. YouTube Help says Shorts can be up to 3 minutes long; the maximum upload resolution is 1080p. Open with the hook, one idea per Short, loop-friendly ending. Use Shorts to point to long-form playlists. Public view counts start when a video begins to play, for Shorts and long-form alike (Shorts since March 31, 2025, all formats since August 27, 2026); monetization and most core metrics stay on engaged views and engaged watch hours (`engagedViews` in Analytics).

**Community posts:** available to channels with the feature; polls, images and teasers between uploads.

### Metadata

- **Title:** max 100 characters, no `<` or `>`. Aim for something short enough not to be cut in search results (about 60 characters is a common guideline, a heuristic). Put the primary keyword early. Example: "Next.js Authentication - Complete Guide (2026)"
- **Description:** max 5,000 bytes. The opening lines appear in search and above the fold, so put the summary there. Timestamps starting at `0:00` create chapters (at least three, each 10 seconds or longer, per YouTube Help). Keep links below the summary
- **Tags:** max 500 characters in total including commas. Google only says tags can help with findability; the effect is small, so use a few accurate ones (including common misspellings of a product name) rather than stuffing
- **Thumbnail:** 16:9, JPG or PNG, high contrast, few words. The channel must be verified to use custom thumbnails. The `thumbnails.set` size limit is 50 MB (raised from 2 MB on September 14, 2026)
- **Captions:** upload accurate captions; captions inserted through the API must carry timing information (the `sync` parameter was removed in 2024)

### YouTube Data API v3

Uploads need OAuth with the `https://www.googleapis.com/auth/youtube.upload` scope (add `youtube` for playlists and thumbnails).

```typescript
import fs from 'node:fs';
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials(tokens); // from your OAuth consent flow, stored server-side
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

// Upload, scheduled: private + publishAt (must be in the future, ISO 8601)
const res = await youtube.videos.insert({
  part: ['snippet', 'status'],
  requestBody: {
    snippet: {
      title: 'Next.js Authentication - Complete Guide (2026)',
      description: 'Add sign-in to a Next.js app.\n\n0:00 Introduction\n1:23 Setup\n4:10 Sessions',
      tags: ['nextjs', 'authentication', 'tutorial'],
      categoryId: '28', // Science & Technology; list valid ids with youtube.videoCategories.list
    },
    status: {
      privacyStatus: 'private',
      publishAt: '2026-11-07T15:00:00.000Z',
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: false, // set true if it has realistic altered or synthetic content
    },
  },
  media: { body: fs.createReadStream('./next-auth-tutorial.mp4') },
});
const videoId = res.data.id!;
await youtube.thumbnails.set({ videoId, media: { body: fs.createReadStream('./next-auth-thumb.jpg') } });
```

Then add the video to a new playlist:

```typescript
const playlist = await youtube.playlists.insert({
  part: ['snippet', 'status'],
  requestBody: { snippet: { title: 'Next.js Complete Course' }, status: { privacyStatus: 'public' } },
});
await youtube.playlistItems.insert({
  part: ['snippet'],
  requestBody: { snippet: { playlistId: playlist.data.id!, resourceId: { kind: 'youtube#video', videoId } } },
});
```

A Short is uploaded the same way: a vertical video within the Shorts length limit goes through `videos.insert` like any other file; there is no separate API call.

**Quota and audit:** the default allocation is 10,000 units per day for most methods. Since June 1, 2026, `videos.insert` and `search.list` are charged to their own buckets (100 calls per day each by default; an upload cost about 100 units before that). `thumbnails.set`, `playlists.insert` and `playlistItems.insert` cost 50 units each; most `list` calls cost 1. More quota needs the "YouTube API Services - Audit and Quota Extension Form". Google's `videos.insert` reference states that videos uploaded from unverified API projects are not restricted to private viewing mode.

### Analytics (YouTube Analytics API v2)

```typescript
const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });

// Daily channel stats
const stats = await youtubeAnalytics.reports.query({
  ids: 'channel==MINE', startDate: '2026-09-24', endDate: '2026-10-23',
  metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained',
  dimensions: 'day', sort: 'day',
});

// Top videos by subscribers gained
const top = await youtubeAnalytics.reports.query({
  ids: 'channel==MINE', startDate: '2026-09-24', endDate: '2026-10-23',
  metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained',
  dimensions: 'video', sort: '-subscribersGained', maxResults: 10,
});

// Where views come from
const sources = await youtubeAnalytics.reports.query({
  ids: 'channel==MINE', startDate: '2026-09-24', endDate: '2026-10-23',
  metrics: 'views,estimatedMinutesWatched', dimensions: 'insightTrafficSourceType', sort: '-views',
});
```
Use `estimatedRevenue` (not the long-removed `earnings`) for revenue and the `https://www.googleapis.com/auth/yt-analytics.readonly` scope. Traffic-source queries error if videos multiplied by days in the range exceed 50,000.

### Monetization

**YouTube Partner Program (YouTube Help):** 1,000 subscribers plus either 4,000 qualified public long-form watch hours in the last 12 months or 10 million qualified public Shorts views in the last 90 days. You also need to follow monetization policies, live in an eligible country, have no active Community Guidelines strikes, enable 2-Step Verification and link an AdSense account. The whole channel is reviewed (about a month). YPP terms change on February 1, 2027; accept the updated terms in YouTube Studio by January 31, 2027.

Other income (channel memberships, Super Chat, Shopping, sponsorships, affiliate links, own products) depends on the channel; no reliable rate benchmarks exist, so get quotes rather than assuming a CPM.

### Growth plan (starting point)

Pick a cadence you can keep for a year; consistency matters more than volume. Publish long-form for depth and watch time, Shorts for reach. After publishing, reply to early comments, pin a question and compare the first week's CTR and retention with your channel average.

## Examples

### Example 1: Optimize and schedule a tutorial upload
**User prompt:** "Upload my Next.js authentication tutorial to YouTube with proper SEO, a custom thumbnail, and schedule it for Saturday at 3 PM UTC."

The agent will:
1. Call `youtube.videos.insert` with `privacyStatus: 'private'` and a future `publishAt` of `2026-11-07T15:00:00.000Z`
2. Set the title "Next.js Authentication - Complete Guide (2026)" (under 100 characters, keyword first)
3. Write a description with a two-line summary, then chapters from `0:00`, then links
4. Add a few accurate tags (total under 500 characters)
5. Call `youtube.thumbnails.set` with a 16:9 JPG
6. Report the returned video ID and the scheduled publish time

### Example 2: Analyze channel performance
**User prompt:** "Pull my YouTube analytics for the last 30 days and tell me which videos are driving the most subscribers and where my traffic comes from."

The agent will:
1. Query `reports.query` with `dimensions: 'video'`, `metrics: 'views,averageViewDuration,subscribersGained'`, `sort: '-subscribersGained'`, `maxResults: 10`
2. Query `dimensions: 'insightTrafficSourceType'` for the split between search, browse, suggested and Shorts
3. Return a table of the top five videos and the traffic-source shares
4. Suggest next topics based on the videos that gained the most subscribers per view

## Guidelines

- Do not promise outcomes; no ranking formula is public, so treat tips as experiments
- Stay inside API quotas; cache `list` results and avoid `search.list` when `videos.list` or `playlistItems.list` can answer
- Never put OAuth tokens or client secrets in code or logs; use environment variables
- Titles and thumbnails must match the video's content; misleading ones lose viewers and can violate policy
- `autoLevels` and `stabilize` on `videos.insert` are deprecated and ignored
- Set `selfDeclaredMadeForKids` honestly and mark realistic synthetic media with `containsSyntheticMedia`
- Chapters, accurate captions and end screens help viewers; use Analytics retention data to decide edits
