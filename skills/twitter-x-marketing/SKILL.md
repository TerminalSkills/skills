---
name: twitter-x-marketing
description: >-
  Create, optimize, and automate content for Twitter/X including tweets,
  threads, polls, and API automation with the X API v2. Use when someone asks to
  "write a tweet", "create a Twitter thread", "grow on X", "Twitter API
  integration", "automate tweeting", "Twitter analytics", "Twitter bot", or
  "X content strategy". Covers platform-specific formatting, X API v2 posting
  and media upload, thread creation, metrics, and growth tactics.
license: Apache-2.0
compatibility: 'X API v2 (pay-per-use; Enterprise for higher volume). Node.js 18+ or Python 3.9+.'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags: "twitter, x, social-media, threads, api"
---

# Twitter/X Marketing

## Overview

This skill helps AI agents write Twitter/X content and publish it through the X API v2. It covers tweet formatting, thread writing, API-based posting with media and polls, reading metrics, and growth tactics.

The API facts below were checked against the X developer documentation (docs.x.com). Growth and timing advice is a heuristic: X does not publish current ranking weights or best posting times, so treat those lines as starting points to test on your own account.

## Instructions

### Platform Rules

- **Length:** 280 characters per post on the standard account. Use a thread for longer content.
- **Formatting:** plain text only. Line breaks work; markdown does not render. Use capitals or emoji for emphasis.
- **Links:** a link in the post body is a common reason for lower reach (heuristic). Put the link in a reply to your own post.
- **Hashtags:** one or two at most, or none (heuristic).
- **Metrics:** `public_metrics` is requested with `tweet.fields` and lists reply, repost, like, quote, bookmark and impression counts (`repost_count`, `reply_count`, `like_count`, `quote_count`, `bookmark_count`, `impression_count`).

### Content Formats

#### Single Tweet
```
[Hook: sharp, opinionated, or surprising]

[Optional: 1-2 supporting lines]

[Optional: question or CTA]
```

- Keep each line short. Test whether the hook stands alone in the feed.
- Images: use 16:9 (1200x675) for a single image and add alt text (heuristic sizing, not an X requirement).

#### Threads
```
1/ [Strong hook: it is the only tweet most people see]

2/ [Context or problem statement]

3-7/ [Main content: one point per tweet]

8/ [Summary or key takeaway]

9/ [CTA: follow, bookmark, or share]

10/ [Self-reply with the link, if needed]
```

- The first tweet must work alone, because it is what appears in the feed.
- Keep each tweet under 280 characters. Seven to ten tweets is a common length (heuristic).
- Post each tweet as a reply to the previous one (see the thread example below).

#### Polls
- The API accepts 2-4 options of 1-25 characters each.
- Duration is set in minutes, from 5 to 10080 (7 days).
- Post a follow-up with the results.

#### Spaces (Live Audio)
- Schedule in advance so followers can see it.
- Pin a tweet with the agenda before you start.
- Record the Space and clip highlights for posts. Check the Spaces API for the recording rules on your plan before automating this.

#### Video
- Upload native video, not a YouTube link. Use the chunked upload flow (see below).
- Captions help, since many people watch with sound off (heuristic).
- Check the current file size and length limits in the media upload docs before you build a pipeline.

### X API v2 Integration

X API access is pay-per-use. There are no subscription tiers in the current documentation, and each request is billed. Per-request prices listed at docs.x.com/x-api/getting-started/pricing at the last check: post read $0.005, user read $0.010, post create $0.015, and $0.200 for a post that contains a URL (so keep links out of automated posts or budget for them). Pay-per-use is capped at 3 million post reads per month; higher volume requires an Enterprise plan. Check the page before you automate.

#### Authentication

Posting needs a user-context token. Use OAuth 2.0 Authorization Code with PKCE and these scopes: `tweet.read`, `tweet.write`, `users.read`, and `media.write` if you upload media, and `offline.access` if you want a refresh token. Keep `X_CLIENT_SECRET` in an environment variable and never commit it.

```bash
export X_USER_ACCESS_TOKEN="<token from the OAuth 2.0 PKCE flow>"
```

An app-only bearer token can read public data but cannot post.

#### Post a Tweet

Posts are created with `POST https://api.x.com/2/tweets` and a JSON body. The `text` field is required unless `media` is set.

```typescript
const TOKEN = process.env.X_USER_ACCESS_TOKEN;

async function createPost(body: Record<string, unknown>) {
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createPost ${res.status}: ${await res.text()}`);
  return (await res.json()).data as { id: string; text: string };
}

// Simple post
await createPost({ text: 'Shipped the new export pipeline today.' });

// Reply to a post
await createPost({
  text: 'Here is the benchmark setup we used.',
  reply: { in_reply_to_tweet_id: '1234567890123456789' },
});

// Poll (2-4 options, duration in minutes)
await createPost({
  text: 'Which deploy strategy do you use?',
  poll: { options: ['Blue/green', 'Rolling', 'Canary'], duration_minutes: 1440 },
});
```

`quote_tweet_id` is a documented field of the create-post request. The X docs state no plan restriction for it, but test it on your account before you build a flow around it.

#### Upload Media, Then Post

Media uses the v2 chunked upload endpoints, which need the `media.write` scope: `POST /2/media/upload/initialize` (JSON body: `media_type`, `total_bytes`, `media_category` such as `tweet_image`), `POST /2/media/upload/{id}/append` (multipart: `segment_index`, `media`; chunks of 5 MB or less) and `POST /2/media/upload/{id}/finalize`. Poll `GET /2/media/upload?command=STATUS&media_id=...` while processing. Do not send `command=INIT/APPEND/FINALIZE` to `POST /2/media/upload`; that is the old protocol. Upload first, then pass the returned media ID in `media.media_ids`. A post takes up to 4 images, 1 animated GIF, or 1 video.

```typescript
// 1. Upload the image bytes with the v2 media upload endpoints.
//    See the "Media upload" reference at docs.x.com for the initialize, append
//    and finalize request bodies, then read the returned media id.
const mediaId = await uploadImage('./chart.png'); // your helper around the three endpoints above

// 2. Post with the media id
await createPost({
  text: 'Latency dropped from 420ms to 90ms after the cache change.',
  media: { media_ids: [mediaId] },
});
```

The older v1.1 `upload.twitter.com` endpoint is not the documented path in the current X API reference. Do not use it for new code.

#### Create a Thread

```typescript
async function postThread(tweets: string[]) {
  let previousId: string | undefined;
  const ids: string[] = [];

  for (const text of tweets) {
    const body: Record<string, unknown> = { text };
    if (previousId) body.reply = { in_reply_to_tweet_id: previousId };
    const created = await createPost(body);
    previousId = created.id;
    ids.push(created.id);
    await new Promise((r) => setTimeout(r, 1000)); // space out requests
  }
  return ids; // ids[0] is the thread head
}

await postThread([
  '1/ We rebuilt our export pipeline in 2 weeks. Here is what broke and what we kept.',
  '2/ The old job read every row into memory. At 2M rows it swapped and timed out.',
  '3/ We switched to streaming batches of 5,000 rows. Peak memory fell from 6 GB to 400 MB.',
  '4/ Reach for streaming before you reach for a bigger machine. The fix was 40 lines.',
  '5/ If this was useful, follow for more posts on backend engineering. Bookmark it for later.',
]);
```

Each tweet is a reply to the one before it. The per-user limit for creating posts is 100 requests per 15 minutes (app: 10,000 per 24 hours), so a long thread or batch needs a counter, not just a 1-second pause. A 429 response carries an `x-rate-limit-reset` header.

#### Metrics and Search

```typescript
// One post, with public metrics
const res = await fetch(
  'https://api.x.com/2/tweets/1234567890123456789?tweet.fields=public_metrics,created_at',
  { headers: { Authorization: `Bearer ${TOKEN}` } },
);
const { data } = await res.json();
console.log(data.public_metrics); // repost_count, reply_count, like_count, quote_count, bookmark_count, impression_count
```

Recent search (`GET /2/tweets/search/recent`) is used to monitor mentions. Pay-per-use pricing applies to each post read returned, so keep `max_results` small. Confirm the endpoint's availability on your plan at docs.x.com before you build monitoring around it.

### Growth Strategy (heuristic)

These are working habits, not measured X rules. X has not published current weights for replies, bookmarks or links.

**Posting rhythm:** a few posts a day plus one or two threads a week is a common starting point. Adjust from your own analytics.

**Content mix:**
- About a third threads, for depth and bookmarks
- About a quarter single posts: opinions and observations
- About a fifth replies to larger accounts in your niche
- The rest: polls, questions, and reposts with comment

**Timing:** check your own impression data by hour and day. Do not rely on a fixed "best time" list, since none is published by X.

**Reply strategy:**
- Reply to larger accounts in your niche early in their post's life
- Add a real point, not "great post"
- Reply to replies on your own posts to keep the conversation going

## Examples

### Example 1: Write a Twitter thread about developer productivity
**User prompt:** "Write a 7-tweet thread about lessons learned scaling a Next.js app from 1,000 to 50,000 daily active users."

The agent drafts a 7-tweet thread with numbered tweets. Tweet 1/7 is the hook: "We scaled our Next.js app from 1K to 50K daily active users in 8 months. Seven lessons, and what we would change:". Tweets 2-6 each cover one lesson with a specific number, for example moving a product page from `getServerSideProps` to ISR, which cut server cost by 60%, or adding PgBouncer after random 502 errors under load. Tweet 7 closes with a CTA. Each tweet is checked against the 280-character limit before posting. The link to the write-up goes in a reply to tweet 7, not in the thread body.

### Example 2: Schedule posts from a CSV with the X API
**User prompt:** "Create a Python script that reads tweets from a CSV file and posts them at scheduled times using the X API v2."

The agent writes a Python script with `requests`. It reads a CSV with `text`, `scheduled_time` (ISO 8601), and optional `image_path`. It loads `X_USER_ACCESS_TOKEN` from the environment. At each check it posts any row whose time has passed by calling `POST https://api.x.com/2/tweets` with the JSON body. For rows with an image, it uploads through the v2 media endpoints first and adds the media ID to `media.media_ids`. On HTTP 429 it waits for the reset time in the response headers and retries. It records each posted row's tweet ID in `posted.log`, so a restart does not post twice.

## Guidelines

- Keep the API contract current: check endpoint paths, the rate-limit page and pricing at docs.x.com before each release of an automation.
- Never post from a script without an approval step for anything that goes to a real audience.
- Avoid automating engagement (likes, follows, mass replies). Check the X developer policy and automation rules before building any of it.
- Put links in a reply, not in the post body (heuristic; reach effects are not documented by X).
- Store tokens in environment variables or a secret manager. Never paste them into prompts or commits.
- Use alt text on images. It helps screen-reader users and makes the image's content indexable.
- Post threads as replies to the previous tweet, so the whole thread stays in one conversation.
- When a post's engagement is low, check the actual impression numbers before changing the strategy.
