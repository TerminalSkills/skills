---
name: instagram-marketing
description: >-
  Create, optimize, and automate Instagram content including Reels, Stories,
  carousels, and feed posts. Use when someone asks to "grow on Instagram",
  "create Instagram Reels", "Instagram content strategy", "Instagram API
  integration", "automate Instagram posting", "Instagram analytics", or
  "Instagram marketing". Covers Reels-first strategy, visual content guidelines,
  Instagram Graph API, and growth tactics.
license: Apache-2.0
compatibility: >-
  Instagram Graph API, Instagram Basic Display API. Requires Facebook Business
  account.
metadata:
  author: terminal-skills
  version: 1.0.0
  category: marketing
  tags:
    - instagram
    - social-media
    - reels
    - visual-content
    - marketing
---

# Instagram Marketing

## Overview

This skill helps AI agents create high-performing Instagram content and integrate with the Instagram Graph API. It covers content formats (Reels, Stories, carousels, feed posts), visual guidelines, caption writing, hashtag strategy, API publishing, analytics, and growth strategies for Instagram's visual-first, Reels-dominated algorithm.

## Instructions

### Platform Rules & Algorithm

Instagram algorithm (2025-2026):

- **Reels are king** — 2-3x reach compared to static posts, Instagram's primary growth lever
- **Saves and shares** — strongest signals (more than likes or comments)
- **Watch time** — Reels that are watched fully or replayed get boosted heavily
- **Content type variety** — accounts posting Reels + carousels + Stories rank higher
- **Hashtags are weak** — SEO-style keyword captions matter more now
- **Consistency** — daily Stories + 4-7 feed posts/week

What kills reach:
- Reposting TikTok videos with watermark (Instagram actively suppresses)
- Low-resolution images/video
- Engagement bait ("like for part 2")
- Inactive periods (algorithm deprioritizes dormant accounts)
- Excessive hashtags in caption (looks spammy, 5-10 targeted is better than 30)

### Content Formats

#### Reels (Primary growth format)
- **Duration:** 15-60 seconds optimal (under 90s max, but shorter performs better)
- **Aspect ratio:** 9:16 (1080x1920px) — full vertical
- **Hook:** First 1-2 seconds determine if people keep watching. Text overlay or surprising visual
- **Captions/subtitles:** Mandatory — 85%+ watch without sound
- **Music:** Use trending audio for algorithmic boost (check Reels tab for trending sounds)
- **Cover image:** Custom cover at 1080x1920px, shows in grid — keep it clean with text overlay
- **Text overlays:** Large, bold, centered. Assume people watch on phone
- **CTA:** "Save this for later", "Share with someone who needs this", "Follow for more [topic]"

**Reel types that work:**
- Tutorial/how-to (3-5 step process shown visually)
- Before/after transformation
- Trending audio + your niche twist
- Day in the life / behind the scenes
- List format with text overlays ("5 tools I can't live without")
- POV / relatable scenarios

#### Carousels (Highest save rate)
- **Slides:** 2-10 images/videos per carousel
- **Aspect ratio:** 1:1 (1080x1080px) or 4:5 (1080x1350px) — 4:5 takes more screen space
- **Slide 1:** Hook — bold title, treat it like a thumbnail
- **Slides 2-9:** One idea per slide, large text, clean design
- **Last slide:** CTA (save, share, follow) + your handle/branding
- **Swipe cue:** Add "Swipe →" or arrow on first slide
- **Design consistency:** Same fonts, colors, layout across slides

**Carousel types:**
- Educational (step-by-step tutorial)
- Tips/list (10 things about X)
- Storytelling (narrative across slides)
- Before/after comparison
- Data/stats visualization

#### Stories (Daily engagement tool)
- **Duration:** 15 seconds per story, post 3-7 per day
- **Aspect ratio:** 9:16 (1080x1920px)
- **Stickers:** Use polls, questions, quizzes, countdowns (drive engagement)
- **Links:** Available for all accounts (link sticker)
- **Highlights:** Save best stories to themed highlights on profile
- **Authenticity:** Stories can be less polished than feed — real > perfect

#### Feed Posts (Static images)
- **Aspect ratio:** 1:1 (1080x1080px) or 4:5 (1080x1350px)
- **Quality:** High-res only, consistent visual style/filter
- **Alt text:** Add for accessibility and SEO (Instagram indexes it)

### Caption Writing

```
[Hook line — stops the scroll, shown before "...more"]

[Empty line for spacing]

[Body — value, story, or insight. Written conversationally.]

[Break long paragraphs into 2-3 sentences max.]

[Include searchable keywords naturally — Instagram now does SEO]

[CTA — question, save prompt, or share prompt]

.
.
.
[Hashtags below dot spacers — or in first comment]
```

**Caption rules:**
- First line is the hook (shown before truncation)
- 150-300 words for educational posts (dwell time matters)
- Write conversationally — Instagram is personal
- Use line breaks and spacing (no text walls)
- Include keywords naturally (Instagram's search is now keyword-based)
- 5-15 hashtags — mix of niche (10K-500K posts) and medium (500K-5M)
- Put hashtags in caption OR first comment (both work, test what's better)

### Instagram Graph API

#### Authentication
```typescript
// Instagram Graph API uses Facebook's OAuth
// Requires: Facebook Page + Instagram Professional account linked

// Step 1: Get Facebook User Access Token via Facebook Login
const FB_AUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const params = new URLSearchParams({
  client_id: process.env.FB_APP_ID,
  redirect_uri: process.env.REDIRECT_URI,
  scope: 'instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement',
  response_type: 'code',
});
// Redirect to: FB_AUTH_URL + '?' + params

// Step 2: Exchange code for token
const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&redirect_uri=${REDIRECT_URI}&code=${code}`);
const { access_token } = await tokenRes.json();

// Step 3: Get long-lived token (60 days)
const longLivedRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${access_token}`);
const { access_token: longLivedToken } = await longLivedRes.json();

// Step 4: Get Instagram Business Account ID
const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedToken}`);
const { data: pages } = await pagesRes.json();
const pageId = pages[0].id;

const igRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${longLivedToken}`);
const { instagram_business_account: { id: igAccountId } } = await igRes.json();
```

#### Publish Content
```typescript
// Publish single image
// Step 1: Create media container
const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image_url: 'https://example.com/image.jpg', // Must be public URL
    caption: 'Your caption here\n\n#hashtag1 #hashtag2',
    access_token: longLivedToken,
  }),
});
const { id: containerId } = await containerRes.json();

// Step 2: Publish
await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    creation_id: containerId,
    access_token: longLivedToken,
  }),
});

// Publish carousel
const mediaIds = [];
for (const imageUrl of imageUrls) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      is_carousel_item: true,
      access_token: longLivedToken,
    }),
  });
  const { id } = await res.json();
  mediaIds.push(id);
}

const carouselRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    media_type: 'CAROUSEL',
    children: mediaIds,
    caption: 'Carousel caption...',
    access_token: longLivedToken,
  }),
});
const { id: carouselId } = await carouselRes.json();

await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
  method: 'POST',
  body: JSON.stringify({ creation_id: carouselId, access_token: longLivedToken }),
});

// Publish Reel
const reelContainer = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    media_type: 'REELS',
    video_url: 'https://example.com/reel.mp4', // Public URL, mp4, H.264
    caption: 'Reel caption...',
    share_to_feed: true,
    cover_url: 'https://example.com/cover.jpg', // Optional custom cover
    access_token: longLivedToken,
  }),
});
```

#### Analytics
```typescript
// Account insights
const insightsRes = await fetch(
  `https://graph.facebook.com/v19.0/${igAccountId}/insights?metric=impressions,reach,profile_views,follower_count&period=day&since=${startDate}&until=${endDate}&access_token=${longLivedToken}`
);

// Media insights
const mediaInsightsRes = await fetch(
  `https://graph.facebook.com/v19.0/${mediaId}/insights?metric=impressions,reach,engagement,saved,shares&access_token=${longLivedToken}`
);

// Reel insights
const reelInsightsRes = await fetch(
  `https://graph.facebook.com/v19.0/${reelId}/insights?metric=plays,reach,likes,comments,shares,saved,total_interactions&access_token=${longLivedToken}`
);
```

### Growth Strategy

**Posting schedule:** 1 Reel/day + 2-3 carousels/week + daily Stories

**Content mix:**
- 40% Reels (growth driver — reach non-followers)
- 30% carousels (save magnet — builds loyalty)
- 20% Stories (daily engagement, authenticity)
- 10% feed posts (aesthetic, announcements)

**Hashtag strategy:**
- 5-15 hashtags per post
- Mix: 5 niche (<100K posts), 5 medium (100K-1M), 3-5 broad (1M+)
- Create a branded hashtag for your community
- Research hashtags by searching keywords in Instagram's Explore

## Examples

### Example 1: Create an Instagram content strategy for a fitness coach
**User prompt:** "I'm a personal trainer in Austin, TX with 1,200 followers. Plan a 2-week Instagram content strategy to grow my audience and book more coaching clients."

The agent will create a 14-day content calendar mixing Reels, carousels, and Stories. Week 1: Monday — Reel "3 exercises you're doing wrong at the gym" (trending audio, 30s, text overlays showing correct form), Wednesday — carousel "Meal prep guide: 5 high-protein lunches under $8" (10 slides, 4:5 ratio, swipe cue on slide 1), Friday — Reel "Client transformation: Sarah lost 22 lbs in 12 weeks" (before/after with voiceover). Week 2 follows the same pattern with fresh topics. Each day includes 3-5 Stories (morning workout clip, midday poll "What should I post next?", afternoon carousel teaser). Captions include keyword-rich hooks like "Stop wasting time on crunches for abs" with CTAs like "Save this for your next gym session." Hashtags: 5 niche (#AustinFitness #PersonalTrainerAustin), 5 medium (#FitnessTips #GymMotivation), 3 broad (#Fitness #Workout).

### Example 2: Publish a carousel post via the Instagram Graph API
**User prompt:** "Write a Node.js script to publish a 5-image carousel to my Instagram business account using the Graph API. The images are hosted on my CDN at cdn.brightbody.co/posts/."

The agent will create a Node.js script that uses the Instagram Graph API with a long-lived Facebook access token. It loops through 5 image URLs (e.g., `https://cdn.brightbody.co/posts/slide-1.jpg` through `slide-5.jpg`), creates individual media containers via `POST /{ig-account-id}/media` with `is_carousel_item: true`, collects the returned container IDs, then creates the carousel container with `media_type: CAROUSEL`, the children array, and a caption including hashtags. Finally it publishes via `POST /{ig-account-id}/media_publish` with the carousel container ID. The script includes error handling for each API call and a 3-second delay between container creation requests to avoid rate limits.

## Guidelines

- Reels-first strategy — it's how Instagram wants you to grow in 2025-2026
- Never repost TikTok with watermark — Instagram suppresses it. Re-export without watermark
- Post carousels at 4:5 ratio (1080x1350px) — takes maximum feed space
- Add alt text to every image — accessibility + Instagram uses it for search
- Use Instagram's native text/sticker tools on Stories — algorithm prefers native creation
- Hashtags in first comment vs caption — test both, neither is universally better
- Grid planning: use Preview or Later app to plan how posts look together
- Reply to DMs — DM engagement is a strong algorithm signal
- Collaborate feature (tagging co-authors) gives reach to both audiences
- Save counts matter more than likes — create content worth bookmarking
