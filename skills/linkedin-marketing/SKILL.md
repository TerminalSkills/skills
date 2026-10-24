---
name: linkedin-marketing
description: >-
  Create, optimize, and automate LinkedIn content for personal branding, lead
  generation, and B2B marketing. Use when someone asks to "write a LinkedIn
  post", "grow on LinkedIn", "LinkedIn content strategy", "LinkedIn API
  integration", "automate LinkedIn posting", "LinkedIn carousel", "LinkedIn
  analytics", or "LinkedIn outreach". Covers post formatting, the LinkedIn
  Posts API with image and document uploads, company page posting, analytics
  access, and growth strategy.
license: Apache-2.0
compatibility: 'LinkedIn Posts API (versioned REST, YYYYMM header). Node.js 18+ or Python 3.9+.'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags:
    - linkedin
    - social-media
    - b2b
    - content-marketing
    - personal-branding
---

# LinkedIn Marketing

## Overview

This skill helps AI agents write LinkedIn posts and publish them through the LinkedIn Posts API. It covers post structure, document (carousel) and image posts, company page posting, OAuth setup, and the access limits that decide what a script can read back.

The API facts below were checked against the LinkedIn Marketing API reference on Microsoft Learn. Writing advice is a heuristic: LinkedIn does not publish its ranking formula or best posting times, so the numbers in the growth section are starting points, not rules.

## Instructions

### Post Rules

- **Length:** post text (`commentary`) is limited by the API. A `FIELD_LENGTH_TOO_LONG` error means the text is too long. Check the current limit in the Posts API schema.
- **Formatting:** LinkedIn does not render markdown. Use line breaks and plain symbols. Bold text needs Unicode characters, which screen readers may read oddly.
- **Links:** a link in the post body is commonly reported to lower reach (heuristic). Put the link in the first comment.
- **Mentions:** write `@[Display Name](urn:li:organization:2414183)` to tag an organization, and `#hashtag` for hashtags. Plain text names do not link.

### Content Formats

#### Text Posts
```
[Hook: first two lines show before "...see more"]

[Short paragraphs, one to three sentences each]

[Body: story, insight, or framework]

[CTA: an open question people can answer]

[Hashtags: a few relevant ones, or none]
```

- Length is a judgment call. Keep it to what the story needs (heuristic: a few hundred to about 1,300 characters).
- Write in the first person for personal posts.

#### Document Posts (carousels)
LinkedIn's "carousel" is a document post: upload a PDF, PPT, PPTX, DOC or DOCX file. Limits from the Documents API: 100 MB and 300 pages per file. Each page is one slide.

- Slide size: 1080x1350 (4:5) is a common choice for mobile (heuristic; LinkedIn does not mandate it for document posts).
- Put the hook on slide 1 and the profile and CTA on the last slide.
- Organic carousel posts (separate swipeable images) are not supported by the Posts API; the document post above is the substitute. For several separate images in one organic post, use the MultiImage API (linked from the Posts API page).

#### Polls
- Organic polls are supported by the Posts API. Build the poll as described in the Poll API (linked from the Posts API page): 2 to 4 options, and a duration of `ONE_DAY`, `THREE_DAYS`, `SEVEN_DAYS` or `FOURTEEN_DAYS`. Polls cannot be edited after creation, and only non-sponsored polls can be created through the API.
- Use three or four options. Add context in the post body.

#### Articles
- The Posts API can create an article post from a source URL with a thumbnail image, title and description. It does not scrape the URL; set those fields yourself.

#### Video
- Upload with the Videos API, then reference the video URN in the post. Check the Videos API for the current length and size limits before automating.

### LinkedIn Posts API Integration

Every call needs two headers: `Linkedin-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`. Use a version from the current Posts API docs. The version `202511` is scheduled to be sunset on 16 November 2026, so do not start new code on it.

#### Authentication (3-legged OAuth 2.0)

Authorize at `https://www.linkedin.com/oauth/v2/authorization`, then exchange the code at `https://www.linkedin.com/oauth/v2/accessToken`.

```typescript
const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', process.env.LINKEDIN_CLIENT_ID!);
authUrl.searchParams.set('redirect_uri', process.env.LINKEDIN_REDIRECT_URI!);
authUrl.searchParams.set('state', crypto.randomUUID()); // check it on return
authUrl.searchParams.set('scope', 'openid profile w_member_social');
// Send the member's browser to authUrl.toString()

// After the redirect, verify `state`, then exchange the code (valid 30 minutes):
const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
  }),
});
const { access_token, expires_in } = await tokenRes.json();
// expires_in is 5184000 seconds (60 days) on current tokens.
```

LinkedIn does not issue long-lived access tokens to most apps. Plan to send the member through the consent flow again when the token expires. Programmatic refresh tokens are limited to approved partners.

#### Text Post
```typescript
const headers = {
  Authorization: `Bearer ${access_token}`,
  'Content-Type': 'application/json',
  'X-Restli-Protocol-Version': '2.0.0',
  'Linkedin-Version': process.env.LINKEDIN_API_VERSION!, // a current YYYYMM value
};

const postRes = await fetch('https://api.linkedin.com/rest/posts', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    author: `urn:li:person:${personId}`,
    commentary: 'We cut our export job from 40 minutes to 90 seconds.\n\nThe fix was not a bigger server.',
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }),
});
// 201 Created; the post URN is in the x-restli-id response header.
const postUrn = postRes.headers.get('x-restli-id');
```

`personId` is the member's ID. Get it from the OpenID Connect userinfo response (`GET https://api.linkedin.com/v2/userinfo` with the bearer token; the `sub` field; needs the `openid` and `profile` scopes and the "Sign In with LinkedIn using OpenID Connect" product on the app), then build `urn:li:person:{sub}`.

#### Image Post
```typescript
// 1. Register the upload
const init = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
  method: 'POST',
  headers,
  body: JSON.stringify({ initializeUploadRequest: { owner: `urn:li:person:${personId}` } }),
});
const { value: { uploadUrl, image } } = await init.json();

// 2. Upload the bytes to the returned uploadUrl
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${access_token}` },
  body: imageBuffer, // Buffer with the PNG or JPG bytes
});

// 3. Create the post that references the image URN
await fetch('https://api.linkedin.com/rest/posts', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    author: `urn:li:person:${personId}`,
    commentary: 'Latency chart from this week.',
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { altText: 'Line chart of p95 latency falling from 420 ms to 90 ms', id: image } },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }),
});
```

Images must be JPG, GIF or PNG and under 36,152,320 pixels. The upload step for a file that is not an image is different, so use the Documents API for PDFs.

#### Document (Carousel) Post
```typescript
// 1. Register the document upload
const docInit = await fetch('https://api.linkedin.com/rest/documents?action=initializeUpload', {
  method: 'POST',
  headers,
  body: JSON.stringify({ initializeUploadRequest: { owner: `urn:li:person:${personId}` } }),
});
const { value: { uploadUrl: docUploadUrl, document } } = await docInit.json();

// 2. Upload the PDF to the returned uploadUrl
await fetch(docUploadUrl, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${access_token}` },
  body: pdfBuffer, // under 100 MB and 300 pages
});

// 3. Post it. Use the document URN, not the image URN.
await fetch('https://api.linkedin.com/rest/posts', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    author: `urn:li:person:${personId}`,
    commentary: '7 slides on how we cut CI time by 60%.',
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { title: 'CI speedup playbook', id: document } },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }),
});
```

Wait for the document to finish processing before creating the post. Poll `GET /rest/documents/{urn}` until `status` is `AVAILABLE`. A `PROCESSING_FAILED` status means the file must be replaced.

#### Company Page Posting
Post as an organization with `author: "urn:li:organization:{id}"`. The authenticated member must hold one of these page roles: ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER or CONTENT_ADMIN. The required scope is `w_organization_social`. Reading organization posts needs `r_organization_social` and the same roles.

#### Reading Posts and Analytics
- `GET https://api.linkedin.com/rest/posts/{encodedPostUrn}?viewContext=AUTHOR` returns the post's latest version, including drafts.
- To list a member's or organization's posts, use the finder `GET /rest/posts?author={encodedUrn}&q=author`. Retrieving a member's posts needs `r_member_social`, which LinkedIn restricts to approved users. Retrieving an organization's posts needs `r_organization_social`.
- Engagement counts and comment controls are in the Social Metadata API, not in the Posts API. Check that page before you build a dashboard.

### Growth Strategy (heuristic)

These are working habits, not published LinkedIn rules. LinkedIn does not publish weights for comments, dwell time or links.

**Rhythm:** a few posts a week is a common starting point. Consistency usually matters more than one post's result.

**Timing:** check your own analytics by weekday and hour. Do not rely on a fixed "best time" list, since none is published.

**Content mix:**
- About 40% educational: frameworks, how-tos, lessons learned
- About 25% stories from your own work
- About 20% opinion posts that invite a reply
- About 10% questions or polls
- About 5% announcements

**Comment strategy:**
- Reply to comments on your posts. A conversation in the comments is the usual goal.
- Leave a few considered comments a day on posts in your niche.
- Do not use engagement pods. LinkedIn restricts inauthentic engagement under its user agreement.

## Examples

### Example 1: Write a LinkedIn post announcing a product launch
**User prompt:** "Write a LinkedIn post for me. I'm the CTO of Meridian Analytics and we just launched a real-time data pipeline product called StreamFlow that processes 2 million events per second. Target audience is engineering leaders at mid-size SaaS companies."

The agent drafts a text post in the first person. The first two lines are the hook: "We spent 14 months building something we could not find anywhere else. Today we are launching StreamFlow, a real-time pipeline that handles 2 million events per second." The body describes the problem (batch jobs left dashboards hours behind), what StreamFlow changes, and one result from beta customers. It ends with an open question: "What is the slowest step in your data pipeline today?" The product URL goes in the first comment, not the body. The agent also checks the draft against the `commentary` length limit in the Posts API schema before publishing.

### Example 2: Automate a weekly post to a LinkedIn company page
**User prompt:** "Build a TypeScript function that posts a weekly engineering blog summary to our LinkedIn company page (Meridian Analytics, org ID 91847362) every Monday at 9 AM EST."

The agent writes a module that reads a short access token from `LINKEDIN_ACCESS_TOKEN` and calls `POST https://api.linkedin.com/rest/posts` with `author: "urn:li:organization:91847362"`, the summary as `commentary`, `visibility: "PUBLIC"`, and `lifecycleState: "PUBLISHED"`. Headers include `Linkedin-Version` with a current YYYYMM value and `X-Restli-Protocol-Version: 2.0.0`. It runs on `node-cron` with `0 9 * * 1` and the time zone set to `America/New_York`. Before the first run, it checks that the token has `w_organization_social` and that the member is an ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER or CONTENT_ADMIN of that page. It logs the returned `x-restli-id` on success and the error body on failure. It also records when the 60-day token will expire and sends an alert before then.

## Guidelines

- Use `/rest/...` endpoints with a `Linkedin-Version` header. The older `/v2/posts` path is not the current Posts API.
- Keep the version header current. Check the Posts API versioning page; sunset dates are listed there.
- Tokens last 60 days on current apps. Build a re-authorization flow, not a silent refresh.
- Never put client secrets in URLs or logs. Read them from environment variables.
- Do not post on behalf of a person without their explicit approval for each post in an automated flow.
- Do not script engagement (auto-likes, auto-comments, connection spam). It violates LinkedIn's user agreement.
- Put links in the first comment, not the post body (heuristic; LinkedIn does not document a reach penalty).
- Use alt text on images. It helps screen-reader users.
- Tag people only when they are relevant and will reply.
- Repurpose a strong post after a few months with a new hook. New followers have not seen it.
