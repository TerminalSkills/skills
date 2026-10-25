---
name: instagram-marketing
description: >-
  Create, optimize, and automate Instagram content including Reels, Stories,
  carousels, and feed posts. Use when someone asks to "grow on Instagram",
  "create Instagram Reels", "Instagram content strategy", "Instagram API
  integration", "automate Instagram posting", "Instagram analytics", or
  "Instagram marketing". Covers Reels-first strategy, content format limits,
  the Instagram Graph API (publishing and insights), and growth tactics.
license: Apache-2.0
compatibility: >-
  Instagram API (Graph API) with an Instagram professional account (Business
  or Creator). The Basic Display API was shut down in December 2024.
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags: "instagram, social-media, reels, visual-content, marketing"
---

# Instagram Marketing

## Overview

This skill helps AI agents plan Instagram content (Reels, Stories, carousels, feed posts, captions) and publish and measure it through the Instagram API. Platform limits quoted below come from Meta's developer documentation; statements about what the ranking algorithm rewards are heuristics, because Instagram publishes no numeric benchmarks.

## Instructions

### Platform rules and ranking (heuristics)

Instagram does not publish its ranking formula. Treat the following as working assumptions to test, not facts:

- Reels are the main way to reach people who do not follow you yet
- Saves, shares and watch time are better signals of value than likes
- Searchable keywords in captions, alt text and on-screen text help discovery more than long hashtag lists
- Original content is favoured; re-uploads with another app's watermark tend to perform worse
- Low-resolution media, engagement bait ("like for part 2") and long inactive periods hurt

Track your own insights (saves per reach, shares per reach, average watch time) and let them overrule these assumptions.

### Content formats

#### Reels
- **Length (API):** 3 seconds to 15 minutes via the API, 300 MB max. Shorter, tightly edited videos usually hold attention better (heuristic)
- **Aspect ratio:** 9:16 recommended; the API accepts 0.01:1 to 10:1
- **Video:** MP4 or MOV, H.264 or HEVC, 23-60 FPS, max width 1920 px, audio AAC
- **Hook:** the first seconds decide whether people keep watching; use a text overlay or a surprising visual
- **Captions/subtitles:** many people watch muted, so burn in subtitles
- **Cover:** JPEG, up to 8 MB, 9:16 ideal; the feed grid shows the middle square
- **CTA:** "Save this for later", "Send this to a teammate", "Follow for more"

Formats that work: tutorials, before/after, list videos with text overlays, behind the scenes, relatable POV skits.

#### Carousels
- **Slides (API):** up to 20 images/videos. All slides are cropped to the first slide's aspect ratio (default 1:1)
- **Aspect ratio:** 4:5 (1080x1350) uses more screen space than 1:1
- **Slide 1:** hook, treat it like a thumbnail; add a swipe cue
- **Middle slides:** one idea per slide, large text
- **Last slide:** CTA and handle
- Types: tutorial, tips list, story, before/after, data visualization

#### Stories
- 9:16 (1080x1920); the API publishes them with `media_type=STORIES`
- Interactive stickers (polls, questions, quizzes, countdowns) invite replies when added in the app; the API cannot publish stickers (only plain @mentions)
- API limits: story images are JPEG up to 8 MB; story videos 3-60 seconds, up to 100 MB
- Save the best ones to Highlights; informal beats polished

#### Feed images
- JPEG only through the API, max 8 MB, aspect ratio between 4:5 and 1.91:1, sRGB
- Add alt text (API `alt_text`, up to 1,000 characters, single images and carousel images only)

### Captions

Structure: a hook line (visible before "...more"), a short conversational body with natural keywords, then one CTA. Hard limits: 2,200 characters, 30 hashtags and 20 @mentions per caption. A handful of relevant hashtags is plenty; there is no documented benefit from using the maximum. Put them in the caption or the first comment, and compare.

### Instagram API

There are three ways to authenticate (Meta docs): Instagram Login (`graph.instagram.com`, Instagram User token, no Facebook Page needed, permissions `instagram_business_basic` and `instagram_business_content_publish`), Facebook Login (`graph.facebook.com`, Page token, linked Page required) and Unified Login for new integrations. The code below uses Facebook Login. Set `GRAPH_VERSION` to a current version from Meta's Graph API changelog (the Instagram docs examples use `v26.0`).

#### Authentication (Facebook Login)
```typescript
const V = process.env.GRAPH_VERSION ?? 'v26.0';
const authUrl = new URL(`https://www.facebook.com/${V}/dialog/oauth`);
authUrl.search = new URLSearchParams({
  client_id: process.env.FB_APP_ID!,
  redirect_uri: process.env.REDIRECT_URI!,
  scope: 'instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement',
  response_type: 'code',
}).toString();

// After the redirect: exchange the code for a short-lived user token (valid 1 hour)
const tokenRes = await fetch(`https://graph.facebook.com/${V}/oauth/access_token?` + new URLSearchParams({
  client_id: process.env.FB_APP_ID!, client_secret: process.env.FB_APP_SECRET!,
  redirect_uri: process.env.REDIRECT_URI!, code,
}));
const { access_token } = await tokenRes.json();

// Exchange for a long-lived token (60 days; refresh before it expires)
const longRes = await fetch(`https://graph.facebook.com/${V}/oauth/access_token?` + new URLSearchParams({
  grant_type: 'fb_exchange_token', client_id: process.env.FB_APP_ID!,
  client_secret: process.env.FB_APP_SECRET!, fb_exchange_token: access_token,
}));
const { access_token: userToken } = await longRes.json();

// Find the Instagram account linked to the Page
const pages = (await (await fetch(`https://graph.facebook.com/${V}/me/accounts?access_token=${userToken}`)).json()).data;
const igRes = await fetch(`https://graph.facebook.com/${V}/${pages[0].id}?fields=instagram_business_account&access_token=${userToken}`);
const igAccountId = (await igRes.json()).instagram_business_account.id;
```
Keep tokens and the app secret on the server; never ship them to a browser.

#### Publish content
Publishing is always two steps: create a container, then `media_publish`. Image URLs and video URLs must be publicly reachable. An unpublished container expires after 24 hours.

```typescript
const base = `https://graph.facebook.com/${V}/${igAccountId}`;
const post = async (path: string, body: Record<string, unknown>) => {
  const res = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: userToken }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error));
  return json.id as string;
};

// Wait until a container (especially video) is ready: poll once a minute, up to 5 minutes
const waitFinished = async (containerId: string) => {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://graph.facebook.com/${V}/${containerId}?fields=status_code&access_token=${userToken}`);
    const { status_code } = await r.json();
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Container ${status_code}`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error('Container not ready after 5 minutes');
};

// Single JPEG image
const imageContainer = await post('media', {
  image_url: 'https://cdn.brightbody.co/posts/slide-1.jpg',
  caption: 'Meal prep in 30 minutes #mealprep',
  alt_text: 'Five glass containers of chicken, rice and broccoli',
});
await post('media_publish', { creation_id: imageContainer });

// Carousel: child containers first, then the parent
const childIds: string[] = [];
for (const url of imageUrls) {
  childIds.push(await post('media', { image_url: url, is_carousel_item: true }));
}
const carousel = await post('media', {
  media_type: 'CAROUSEL', children: childIds.join(','), caption: 'Five lunches under $8',
});
await waitFinished(carousel);
await post('media_publish', { creation_id: carousel });

// Reel
const reel = await post('media', {
  media_type: 'REELS',
  video_url: 'https://cdn.brightbody.co/reels/form-check.mp4',
  caption: '3 gym mistakes to stop today',
  share_to_feed: true,
  cover_url: 'https://cdn.brightbody.co/reels/form-check-cover.jpg',
});
await waitFinished(reel);
await post('media_publish', { creation_id: reel });
```

Limits: 100 API-published posts per 24-hour moving period (a carousel counts once; Meta's carousel section states 50, so read the real number from `GET /{ig-id}/content_publishing_limit` before bulk jobs). For large local video files use resumable upload (`upload_type=resumable`, then upload to `rupload.facebook.com`). A published Reel reports `media_type=VIDEO`; check `media_product_type=REELS` to identify it.

#### Analytics
Several old metrics are gone: `impressions` (media created after July 2, 2024, and all account-level use since April 21, 2025), `plays`, `video_views`, `engagement`, `follower_count` and `profile_views` no longer work. Use these instead:

```typescript
// Account insights: totals over a window (since/until are UNIX timestamps)
const acct = await fetch(`${base}/insights?metric=reach,views,accounts_engaged,total_interactions,follows_and_unfollows&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${userToken}`);

// Feed post or carousel
const feed = await fetch(`https://graph.facebook.com/${V}/${mediaId}/insights?metric=reach,saved,shares,likes,comments,total_interactions,views&access_token=${userToken}`);

// Reel
const reelStats = await fetch(`https://graph.facebook.com/${V}/${reelId}/insights?metric=reach,views,saved,shares,ig_reels_avg_watch_time,reels_skip_rate,total_interactions&access_token=${userToken}`);
```
Not every metric exists for every media type (Stories, for example, have `navigation` and `replies`; Reels have the watch-time metrics), and a request with an unsupported metric returns an error, so request one media type's metrics at a time.

### Growth plan (starting point, adjust with your data)

- A sustainable cadence beats a heavy one: for example 3-5 Reels, 1-3 carousels and daily Stories per week
- Lead with Reels for reach to new people, carousels for saves and depth, Stories for existing followers
- Use the Collaborators feature (up to 3 co-authors on feed images, Reels and carousels) to share reach
- Reply to comments and DMs; they build the relationship that ranking cannot

## Examples

### Example 1: Content plan for a fitness coach
**User prompt:** "I'm a personal trainer in Austin, TX with 1,200 followers. Plan two weeks of Instagram content to grow my audience and book coaching clients."

The agent returns a 14-day calendar. Week 1: Monday Reel "3 exercises you're doing wrong at the gym" (30 s, burned-in subtitles, hook in the first two seconds); Wednesday 4:5 carousel "5 high-protein lunches under $8" (slide 1 hook with swipe cue, recipe per slide, last slide "Save this for meal prep Sunday"); Friday Reel "Sarah's 12-week transformation" (before/after with voiceover). Week 2 repeats the pattern with new topics. Each day has 3-5 Stories (workout clip, poll "What should I post next?", carousel teaser). Captions open with a keyword-rich hook such as "Stop wasting time on crunches for abs" and use 3-5 relevant hashtags such as #AustinFitness and #PersonalTrainerAustin. The agent states the cadence is a starting hypothesis and proposes comparing saves per reach after two weeks.

### Example 2: Publish a carousel via the API
**User prompt:** "Write a Node.js script to publish a 5-image carousel to my Instagram business account. Images are at cdn.brightbody.co/posts/slide-1.jpg to slide-5.jpg."

The agent writes a script using the `post` helper above. It checks the images are JPEG, creates five child containers with `is_carousel_item: true`, creates the parent with `media_type: 'CAROUSEL'` and `children` joined by commas, polls `status_code` until `FINISHED`, then calls `media_publish`. Tokens come from `IG_ACCESS_TOKEN` and `IG_ACCOUNT_ID` environment variables. On failure it prints the Graph API error object. Output: `Published carousel 17895695668004550`.

## Guidelines

- Use a professional (Business or Creator) account; personal accounts cannot use the publishing API
- Images must be JPEG; PNG and WebP uploads fail through the API
- Stay inside the posting quota; check `content_publishing_limit` first
- Never rely on removed metrics (`impressions`, `plays`, `video_views`, `engagement`); the Basic Display API no longer exists
- Do not repost videos with another platform's watermark; export a clean copy
- Add alt text to images and keywords to captions
- Treat every "best time", "best length" or "best hashtag count" claim as a hypothesis to test on your own account
