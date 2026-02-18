---
name: tiktok-marketing
description: >-
  Create, optimize, and automate TikTok content for brand awareness, audience
  growth, and conversions. Use when someone asks to "grow on TikTok", "create
  TikTok content", "TikTok marketing strategy", "TikTok API integration",
  "automate TikTok posting", "TikTok analytics", or "TikTok for business".
  Covers short-form video strategy, trending sounds, TikTok Content Posting API,
  analytics, and growth tactics.
license: Apache-2.0
compatibility: >-
  TikTok Content Posting API, TikTok for Business API. Requires TikTok Developer
  account.
metadata:
  author: terminal-skills
  version: 1.0.0
  category: marketing
  tags:
    - tiktok
    - social-media
    - short-form-video
    - marketing
    - viral
---

# TikTok Marketing

## Overview

This skill helps AI agents create high-performing TikTok content and integrate with TikTok's APIs. It covers short-form video strategy, hook techniques, trending sounds, Content Posting API, analytics, and growth strategies for TikTok's For You Page algorithm.

## Instructions

### Platform Rules & Algorithm

TikTok's For You Page (FYP) algorithm:

- **Completion rate** — THE most important metric. Videos watched to the end (or replayed) get massive distribution
- **Watch time** — total seconds watched matters for longer videos
- **Shares** — strongest engagement signal (sent via DM or external)
- **Comments** — especially lengthy or emoji-heavy comments
- **Follows from video** — signals high-quality creator
- **Content-based distribution** — TikTok shows content to ANYONE interested, regardless of follower count
- **Batch testing** — new videos shown to ~200-500 people first, performance determines next batch

What kills reach:
- TikTok watermark on reposted content
- Violation of community guidelines (even borderline)
- Deleting and reposting (algorithm tracks this)
- Very long videos without retention hooks (drop-off = death)
- Static images without motion or text animation
- Mentioning other platform names ("link in my Instagram bio")

### Video Content Guidelines

#### Video Specs
- **Aspect ratio:** 9:16 (1080x1920px) — always vertical
- **Duration:** 15-60 seconds optimal. Under 30s has highest completion rates
- **Format:** MP4 or MOV, H.264 codec
- **Max file size:** 287.6 MB (mobile), 500 MB (web)
- **Max duration:** 10 minutes (but short = better for growth)
- **Frame rate:** 30fps minimum, 60fps for smooth motion

#### Hook Framework (First 1-3 seconds)
The first second determines everything. The viewer decides to scroll or stay.

**Visual hooks:**
- Start with movement or action mid-frame (not a static title card)
- Face close-up with expression (curiosity, shock, excitement)
- Before/after preview in first second
- Text overlay appearing with motion

**Verbal hooks:**
- "Stop scrolling if you [audience identifier]"
- "I can't believe this actually works"
- "Here's what nobody tells you about [topic]"
- "The secret to [desired outcome] is..."
- "POV: you just discovered [interesting thing]"
- "Watch till the end — the last one is insane"

**Retention hooks (throughout video):**
- "But here's where it gets interesting..."
- "Wait for it..."
- Text: "Part 3 will blow your mind" (encourages follow for series)
- Pattern interrupts every 3-5 seconds (zoom, cut, new angle)

#### Content Types That Work

**Educational / How-To (highest save rate)**
- 3-5 step tutorials shown visually
- "Things I wish I knew about [topic]"
- Quick tips with text overlays
- Software walkthroughs with screen recording

**Trending Audio + Niche**
- Take trending sound and apply to your industry
- Check "Trending" in TikTok's Creative Center
- Original audio can also trend — speak clearly, memorable phrases

**Storytelling**
- Personal stories with emotional arc
- "Storytime: how I [unexpected outcome]"
- Green screen with photos/screenshots as proof

**Day in the Life / Behind the Scenes**
- Authentic > polished
- Show real process, struggles, wins
- Time-lapse of work with voiceover

**Series Content**
- Part 1, Part 2, Part 3 format
- Drives follows ("follow for part 2")
- Pin part 1 to profile

### Caption & Hashtag Strategy

```
[Caption: 1-2 sentences max. Punchy, adds context or CTA]

[Hashtags: 3-5 targeted, mix of niche and broad]
```

**Caption rules:**
- Short — TikTok captions are secondary to video
- Add context the video doesn't provide
- CTA: "Save this for later 📌" or "Send to a friend who needs this"
- Max 2,200 characters but keep it under 150

**Hashtag rules:**
- 3-5 hashtags (not 30 — this isn't Instagram 2019)
- 1-2 niche hashtags (your specific topic)
- 1-2 medium hashtags (broader category)
- 1 broad hashtag (#fyp is useless now — use topical broad tags)
- TikTok SEO: use keywords naturally in caption (algorithm reads text)

### TikTok Content Posting API

#### Authentication
```typescript
// TikTok uses OAuth 2.0
const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';

// Step 1: Redirect to authorization
const authUrl = new URL(TIKTOK_AUTH_URL);
authUrl.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'user.info.basic,video.publish,video.upload,video.list');
authUrl.searchParams.set('redirect_uri', process.env.TIKTOK_REDIRECT_URI);
authUrl.searchParams.set('state', 'random-state');

// Step 2: Exchange code for token
const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    code: authorizationCode,
    grant_type: 'authorization_code',
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
  }),
});
const { access_token, refresh_token, expires_in } = await tokenRes.json();
```

#### Publish Video
```typescript
// Step 1: Initialize upload
const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    post_info: {
      title: 'Video title',
      privacy_level: 'PUBLIC_TO_EVERYONE', // or MUTUAL_FOLLOW_FRIENDS, SELF_ONLY
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000, // Cover frame at 1 second
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: videoFileSize, // in bytes
      chunk_size: videoFileSize, // single chunk for files < 64MB
      total_chunk_count: 1,
    },
  }),
});
const { data: { publish_id, upload_url } } = await initRes.json();

// Step 2: Upload video
await fetch(upload_url, {
  method: 'PUT',
  headers: {
    'Content-Range': `bytes 0-${videoFileSize - 1}/${videoFileSize}`,
    'Content-Type': 'video/mp4',
  },
  body: videoBuffer,
});

// Step 3: Check publish status
const statusRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ publish_id }),
});
// Status: PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, PUBLISH_COMPLETE, FAILED
```

#### Query Videos & Analytics
```typescript
// List user's videos
const videosRes = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,share_url,duration,cover_image_url,like_count,comment_count,share_count,view_count', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ max_count: 20 }),
});

// Get user info
const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url,follower_count,following_count,likes_count,video_count', {
  headers: { Authorization: `Bearer ${access_token}` },
});
```

### Growth Strategy

**Posting schedule:** 1-3 videos/day (consistency > quality for growth phase)

**Content mix:**
- 40% trending audio + your niche (reach new audiences)
- 30% educational/tutorial (saves, shares, follows)
- 20% storytelling/behind-the-scenes (builds connection)
- 10% series/part content (drives follows for "next part")

**Best posting times:** 7-9 AM, 12-1 PM, 7-10 PM (target timezone). Test and check your Analytics for YOUR audience's active times.

**Growth tactics:**
- Post 1-3x daily during growth phase (algorithm rewards consistency)
- Reply to comments with video replies (creates new content + engagement)
- Stitch/Duet trending creators in your niche (rides their distribution)
- Pin your 3 best-performing videos to profile
- Create a series with consistent format (viewers follow for next part)
- Cross-post to Instagram Reels and YouTube Shorts (remove TikTok watermark first using SnapTik or manual re-export)

**TikTok SEO (2025-2026):**
- TikTok is now a search engine — people search it like Google
- Use keywords in: captions, text overlays, voiceover/speech
- Answer common search queries in your niche
- Check TikTok search bar suggestions for content ideas

## Examples

### Example 1: Create a TikTok content plan for a coffee roastery
**User prompt:** "I run a specialty coffee roastery called Northside Beans in Portland. Create a 1-week TikTok content plan to grow my following from 400 to 2,000."

The agent will create a 7-day content calendar with specific video concepts tailored to a coffee roastery. Day 1: "POV: you just discovered single-origin Ethiopian Yirgacheffe" (trending audio + close-up pour, 15s). Day 2: "3 mistakes you're making with your morning coffee" (educational, text overlays, 30s). Day 3: "Watch us roast a batch from green to brown" (time-lapse behind-the-scenes, 20s). Day 4-7 continue with a mix of series content ("Coffee basics Part 1"), storytime ("How I quit my tech job to roast coffee"), and duet/stitch ideas. Each entry includes the hook line, suggested duration, content type, 3-5 hashtags like #SpecialtyCoffee #CoffeeTok #PortlandFood, and optimal posting time (7 AM and 7 PM PST).

### Example 2: Write a TikTok API integration to auto-publish videos
**User prompt:** "Build a Node.js script that uploads a pre-recorded MP4 to TikTok using their Content Posting API. The video file is at ./videos/latte-art-tutorial.mp4."

The agent will create a Node.js script that authenticates via TikTok OAuth 2.0 using environment variables `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`, reads the video file size, initializes the upload via `POST /v2/post/publish/video/init/` with the title "Latte Art Tutorial — 3 Steps to a Perfect Rosetta", sets `privacy_level` to `PUBLIC_TO_EVERYONE`, uploads the binary to the returned `upload_url` with the correct `Content-Range` header, then polls `/v2/post/publish/status/fetch/` every 5 seconds until the status is `PUBLISH_COMPLETE` or `FAILED`, logging the result.

## Guidelines

- First 1 second = make or break. Start with hook, not intro/logo
- Under 30 seconds has highest completion rate — tight editing, no filler
- Film vertical ALWAYS — horizontal video = instant scroll
- Use trending sounds even if video is primarily text/voiceover (algorithmic boost)
- Post consistently at same times — your audience learns your schedule
- Engage with comments in first hour — drives video into next distribution batch
- Video replies to comments count as new videos — free content ideas
- Never delete underperforming videos — they can resurface weeks later
- TikTok watermark on other platforms = suppressed. Always re-export clean
- Film in good lighting and clear audio — production value matters more than ever
