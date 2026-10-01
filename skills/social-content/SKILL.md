---
name: social-content
description: >-
  Plans and writes social media posts for a person or a company and delivers them as a checked,
  dated file: posts adapted to each network's format and hard limits, with alt text, disclosure
  where required, tracked links and a posting calendar. Use when a user asks to "write a LinkedIn
  post", "turn this blog post into a thread", "plan a month of social content", "build a content
  calendar", "repurpose this article for Instagram and TikTok", "announce our launch on X and
  Bluesky", or wants help deciding what to post, where and how often.
license: Apache-2.0
compatibility: "Any project where source material (blog posts, changelog, docs) can be read. Limit checker needs Python 3.8+ (standard library only). Publishing is done by the user or their scheduler."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: content
  tags: ["social-media", "content-marketing", "copywriting", "content-calendar", "linkedin"]
---

# Social Content

## Overview

Social posts work when a specific person says a specific thing to people who care about it, in the shape the network expects. They fail when one generic paragraph is pasted everywhere, when the first line could open any post, or when a post is rejected, truncated or hidden because it broke a limit nobody checked.

This skill turns source material and a goal into posts that are ready to publish: it gathers what makes the account's voice its own, picks networks the user can actually sustain, writes each post natively, and stores everything in `social/posts.json` so lengths, hashtags, alt text and disclosure can be verified by a script before anything goes out. It writes and plans; it does not publish or sign in to any account.

## Instructions

### 1. Gather the brief

Read what the project already holds before asking: `CHANGELOG.md`, release notes, the blog or docs directory, the README, customer quotes the user has permission to use. Then ask for what is missing:

- **Speaker:** a named person or the brand account. People get more reach and more replies; brand accounts suit announcements and support.
- **Audience and one goal for the quarter:** for example trial sign-ups from engineering managers, or repeat orders from past buyers. One goal decides what a post asks the reader to do.
- **Capacity:** hours per week, who replies to comments, whether they can record video.
- **Voice samples:** three to five past posts or messages the speaker is happy with. From them note sentence length, first or third person, use of emoji, words they favour and avoid. Write that down as five lines and follow it.
- **Limits:** claims legal will not allow, customers that may not be named, embargo dates.
- **History:** if they already post, the last twenty posts with their numbers.

### 2. Choose networks and cadence

Pick the fewest networks that reach the audience, and a rhythm the user can keep for three months. A person with three hours a week does one network well: about three posts plus replies. Add a second network only when the first runs without strain.

| Network | Native shape | Hard limits (checked October 2026) |
|---|---|---|
| LinkedIn | Text post that opens with a concrete claim; document carousels; short native video | 3,000 characters; the feed cuts off after roughly the first two lines |
| X | Single post or a short thread, one point each | 280 weighted characters on free accounts: any link counts 23, emoji and CJK characters count 2 |
| Bluesky | Short post, link card, threads | 300 graphemes; 4 images, each up to 2 MB |
| Mastodon | Short post with content warnings and alt text expected | 500 characters by default (set per server); links count 23 |
| Threads | Conversational short post | 500 characters; at most 5 links; carousel of 2 to 20 items |
| Instagram | Carousel, Reel, Story; caption supports the visual | Caption 2,200 characters; 5 hashtags since Instagram's December 2025 change; alt text up to 1,000 characters |
| TikTok | Vertical video with a spoken or on-screen opening line | Caption 2,200 characters through the posting API |
| YouTube Shorts | Vertical video | Up to 3 minutes |

Limits change. Recheck the network's own help or developer pages when a post sits near a limit or the table is more than a few months old, and update `LIMITS` in the checker.

### 3. Write each post

Work from one source at a time and decide what single point each post makes.

- **Opening line:** it carries the most specific thing you have: a number, a result, a decision, a mistake. A reader should know from it whether the post is for them. Test: could this line open a post by any other company? If yes, rewrite it.
- **Body:** short paragraphs, one idea each. Use the numbers, names and steps from the source. Say what it cost or what went wrong; a post with no trade-off reads as an advert.
- **Close:** one next step that serves the goal, or none. Do not ask people to "comment YES" or tag friends to win reach.
- **Links:** one per post, with `utm_source`, `utm_medium=social` and `utm_campaign` so clicks can be traced. Whether a link in the body or in a reply performs better differs by account; test it on this account instead of assuming.
- **Hashtags:** none to three on LinkedIn, X, Bluesky and Mastodon, chosen because people follow them. Write multi-word tags in CamelCase so screen readers can pronounce them.
- **Plain characters only:** no bold or italic lookalikes from Unicode symbol blocks; screen readers skip or mangle them and search cannot match them.

Phrases to cut on sight, because they mark text as filler: openers such as "In today's fast-moving world", "Let's dive in", "Here's the thing"; a question opener followed immediately by its own answer; "game-changer", "unlock", "supercharge"; every line ending in an emoji; a closing "Thoughts?".

### 4. Adapt, do not copy

One source becomes several native pieces. What changes between them:

| From a 1,200-word article | Becomes |
|---|---|
| LinkedIn | 120 to 250 words: the claim, three concrete steps or findings, the trade-off, a link |
| X or Bluesky | One post with the sharpest number and the link; or a thread of 3 to 5 posts, each readable alone |
| Instagram or LinkedIn carousel | 5 to 8 slides: a headline slide, one point per slide in under 20 words, a closing slide with the next step; the caption adds context |
| Short video | A script of 20 to 45 seconds: the result in the first sentence, then how, then one caution |

Spread the pieces over one or two weeks so followers on several networks do not see the same thing at the same hour.

### 5. Media, accessibility, disclosure

- Every still image gets alt text that states what the image shows and any number on it, in one or two sentences. Video gets captions; say the key line out loud as well as showing it.
- **Disclosure:** when the speaker has a material connection to what they praise (they are paid, received it free, are an employee, earn commission), the post itself says so in plain words near the start: "ad", "sponsored", "gifted", "I work at Tarnlog". A profile bio, a tag buried among hashtags, or abbreviations such as "sp" and "collab" are not enough under the FTC's Endorsement Guides. In video the disclosure is spoken or on screen, not only in the caption. Use the network's paid-partnership label as well, not instead.
- **Synthetic media:** realistic AI-generated or altered images, audio and video must be labelled with the network's own disclosure setting (YouTube, TikTok and Meta each have one). AI help with wording or outlines needs no label.
- Reposting a customer's or creator's content needs their permission in writing.

### 6. Store and check

Keep all posts in `social/posts.json`, one object per post:

```json
{
  "id": "w41-x-1",
  "network": "x",
  "date": "2026-10-07",
  "status": "draft",
  "text": "We cut our ingest bill 41% with 60 lines of code.\n\nThe problem was never bytes. It was requests: one object write per log line.",
  "media": [{ "file": "social/media/ingest-cost-chart.png", "alt": "Line chart of monthly ingest cost falling from $11,800 to $6,960." }],
  "paid_or_gifted": false
}
```

Save the checker as `social/check_posts.py` and run it after every edit: `python3 social/check_posts.py`.

```python
#!/usr/bin/env python3
"""Check social/posts.json against each network's hard limits. Exit 1 on any failure."""
import json, re, sys

URL = re.compile(r"https?://\S+")
LIMITS = {  # verified October 2026; text limit, counting rule, max hashtags, max links
    "x":         (280,  "weighted", None, None),   # free tier; URLs count 23, wide characters and emoji count 2
    "linkedin":  (3000, "chars",    None, None),
    "instagram": (2200, "chars",    5,    None),
    "threads":   (500,  "chars",    None, 5),
    "bluesky":   (300,  "chars",    None, None),   # limit is in graphemes; code points never undercount
    "mastodon":  (500,  "urls23",   None, None),   # default instance limit
    "tiktok":    (2200, "chars",    None, None),
}

def length(text, rule):
    if rule == "chars":
        return len(text)
    rest = URL.sub("", text)
    urls = 23 * len(URL.findall(text))
    if rule == "urls23":
        return len(rest) + urls
    narrow = lambda c: ord(c) <= 4351 or 8192 <= ord(c) <= 8205 or 8208 <= ord(c) <= 8223 or 8242 <= ord(c) <= 8247
    return sum(1 if narrow(c) else 2 for c in rest) + urls

failed = False
for post in json.load(open(sys.argv[1] if len(sys.argv) > 1 else "social/posts.json", encoding="utf-8")):
    limit, rule, max_tags, max_links = LIMITS[post["network"]]
    problems = []
    used = length(post["text"], rule)
    if used > limit:
        problems.append(f"text {used}/{limit}")
    if max_tags is not None and len(re.findall(r"#\w+", post["text"])) > max_tags:
        problems.append(f"more than {max_tags} hashtags")
    if max_links is not None and len(URL.findall(post["text"])) > max_links:
        problems.append(f"more than {max_links} links")
    problems += [f"no alt text for {m['file']}" for m in post.get("media", []) if not m.get("alt") and not m["file"].endswith((".mp4", ".mov"))]
    if post.get("paid_or_gifted") and not re.search(r"#ad\b|#sponsored\b|\bad:|\bgifted\b|paid partnership", post["text"], re.I):
        problems.append("material connection not disclosed in the text")
    failed = failed or bool(problems)
    print(f"{post['id']:<14} {post['network']:<10} {used:>4}/{limit:<5} {'FAIL: ' + '; '.join(problems) if problems else 'ok'}")
sys.exit(1 if failed else 0)
```

The X count follows the published weighting and never undercounts; multi-part emoji may be counted a little high.

### 7. Calendar, replies and review

Write `social/calendar.md` as a table: `date | network | post id | format | goal of the post | owner`. Put posts on days the speaker can spend fifteen minutes replying afterwards; a post whose comments go unanswered wastes most of its value. Leave gaps for news that cannot be planned.

Once a month, collect per post: impressions, interactions (replies, reposts, saves, reactions), link clicks from analytics, and follows gained. Compare the three strongest and three weakest posts by interactions per impression and by clicks, name what the strong ones share (topic, opening, format), and change one thing in the next month's plan. Posting time and frequency are the last things to tune, not the first.

### 8. Deliverable

`social/posts.json`, `social/calendar.md`, the checker output showing every post `ok`, the five-line voice note, and a short list of what the user must still do: record video, approve named customers, schedule.

## Examples

### Example 1: One engineering article, three networks

**Request:** "I'm Mirela, founder of Tarnlog (log search for small teams). Turn `blog/batching-writes.md` into posts for my LinkedIn, X and Bluesky. I have three hours a week. Goal: trial sign-ups from backend engineers."

Voice note from her samples: first person, short declarative sentences, numbers before adjectives, no emoji, admits trade-offs.

LinkedIn post (`w41-li-1`, Tuesday):

```text
Our ingest bill dropped 41% in one release, and the change was 60 lines.

Tarnlog wrote every log line to object storage as it arrived. Fine at 2,000 lines a second, ruinous at 40,000: we were paying per request, not per byte.

What we changed:
1. Buffer lines per tenant for up to 2 seconds or 4 MB, whichever comes first.
2. Write one compressed block instead of thousands of small objects.
3. Acknowledge the client only after the block is durable, so nothing is lost on a crash.

What it cost us: search results now trail real time by up to 2 seconds. We asked ten customers first; nobody minded.

If your storage bill grows faster than your data, count requests before you count gigabytes.

Full write-up with the benchmark numbers: https://tarnlog.dev/blog/batching-writes?utm_source=linkedin&utm_medium=social&utm_campaign=batching
```

The X post keeps the number, the cause and the link; the Bluesky post leads with the reader's problem instead. Checker output:

```text
w41-li-1       linkedin    838/3000  ok
w41-x-1        x           248/280   ok
w41-bsky-1     bluesky     270/300   ok
```

Calendar: LinkedIn on Tuesday, X and Bluesky on Wednesday, with a note that the following week's post takes one customer question from the replies as its subject.

### Example 2: Product drop with a gifted review

**Request:** "Pebblewick Candles is bringing back Bonfire Orchard on 9 October, 300 jars. Write Instagram and TikTok posts. We also want to repost a video review from a creator we sent a free candle to."

First run of the checker on the drafts:

```text
bo-ig-1        instagram   267/2200  FAIL: more than 5 hashtags; no alt text for social/media/bonfire-orchard-2.jpg
bo-ig-2        instagram   138/2200  FAIL: material connection not disclosed in the text
bo-tt-1        tiktok      114/2200  ok
```

Fixes: the launch caption keeps `#candles #soycandle #autumn` and drops four generic tags; the second carousel image gets the alt text "Close-up of the lit candle with a cedar sprig beside it"; the review repost is marked `"paid_or_gifted": true` and its caption now opens "Gifted: we sent @hollis.at.home a jar, and this is her honest review." The paid-partnership label is switched on when it is published, and the creator's written permission to repost is filed with the brief. Final launch caption:

```text
Bonfire Orchard is back for autumn: smoked apple, cedar and a little clove. 55-hour burn, soy wax, poured in Leeds. 300 jars this year, same as last, and last year they were gone in nine days.

#candles #soycandle #autumn
```

After the fixes all three posts report `ok`.

## Guidelines

- Never invent numbers, customer names, quotes or results. If the source has no figure, write the post without one or ask.
- Do not state how an algorithm treats links, hashtags or posting times as fact. Networks rarely document it and it shifts; the account's own results are the evidence.
- A named person's account is theirs: write in their voice from their samples, and leave anything personal for them to add.
- Promotion earns its place by being useful. If every post sells, say so and rebalance toward posts that teach or show work.
- Limits in the table come from each network's help or developer documentation; treat them as dated. Paid tiers (X Premium, for one) allow longer text, so confirm the account tier before using it.
- Disclosure and synthetic-media labelling are legal and platform requirements, not style choices. When unsure whether a connection is material, disclose.
- This skill does not publish, schedule through an API, buy ads or analyse competitors' accounts. It stops at files the user can review.
