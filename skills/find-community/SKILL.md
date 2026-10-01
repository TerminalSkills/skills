---
name: find-community
description: >-
  Finds the places where a defined group of customers already talks to each
  other, measures each place for activity, how often the target problem comes
  up, buying signals and posting rules, and returns a ranked community map with
  a 30-day participation plan. Use when someone asks "where do my customers hang
  out", "which community should I build for", "find subreddits and forums for my
  product", "who should I serve", "how do I get involved without spamming", or
  "should I start my own community". Covers founders choosing a group to serve,
  products with no audience yet, developer tools, local trades and B2B niches.
license: Apache-2.0
compatibility: "Any agent with web search or a browser. Optional: Python 3.8+ (standard library only) for the tally script and curl for the public Hacker News search API. No accounts or API keys."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["community", "audience-research", "customer-discovery", "startup", "go-to-market"]
---

# Find Community

## Overview

A community, for this skill, is a place where people with the same role or situation talk to each other without being paid to: a forum, a subreddit, a group chat, a trade association, a meetup, the replies under a niche newsletter. Finding the right one settles two things a small business needs early: which group of people it serves, and where it can listen to them and be heard.

The work has four parts. Turn a vague audience into search terms. List candidate venues. Read a sample of each and score all of them on the same five measures. Write a participation plan that fits each venue's rules. The deliverable is `community-map.md` and the log it was computed from, `community-log.csv`.

## Instructions

### 1. Ask first, then read what the project already knows

Ask only what the project does not answer:

1. Who has the problem, as a role plus a situation ("owner of a physiotherapy clinic with 2 to 8 staff"), not a demographic ("health professionals, 30 to 50").
2. What that person is trying to get done when the problem shows up, and what they use today.
3. Is there a product, and at what price or likely price band?
4. Which groups is the founder already in, and in what standing: reader, regular, organiser, working practitioner?
5. Country, language, and whether the business is local.
6. How many hours a week the founder can spend taking part, for at least three months.

In the repository, read the README and landing copy, the pricing page, any customer list or CRM export (job titles, company types, the "how did you hear about us" column), support mail and reviews. The words customers use are better search terms than the words on the landing page.

No group chosen yet? Run steps 2 to 5 for up to three groups the founder belongs to and compare the totals. A group where the founder would score 0 on fit is not a candidate, however large it is.

### 2. Build the vocabulary

Collect 10 to 20 terms in four buckets before searching. Venues are found by the problem and the tools far more often than by the job title.

| Bucket | What goes in | Physiotherapy clinic example |
|---|---|---|
| Roles | what they call themselves | clinic owner, practice manager, private practice |
| Tools | what they already use | diary system, booking software, card terminal |
| Problem, their words | phrases from mail and reviews | no-shows, DNA rate, late cancellations |
| Neighbours | topics discussed nearby | insurer billing, hiring associates, room rental |

### 3. List candidate venues

Aim for 8 to 15 candidates across at least four of these types, then sample the most promising five or six.

| Type | How to find it | Note down |
|---|---|---|
| Subreddits, public forums | site search and web search with the vocabulary | rules page, pinned threads |
| Group chats (Discord, Slack, WhatsApp, Telegram) | "slack" or "discord" next to the role in web search; show notes of niche podcasts; ask customers | who admits members, channel list |
| Facebook and LinkedIn groups | each platform's group search | membership questions, admin names |
| Trade bodies, meetups, conferences | "association", "society", "meetup" next to the role and the country | who may join, event calendar |
| Newsletters, podcasts, YouTube channels | "newsletter" or "podcast" next to the role | whether readers can reply or comment |
| Q&A and code hosts (Stack Exchange, GitHub Discussions, Hacker News) | tag pages, repository discussions of adjacent tools | tags, typical question |

The highest-signal source is not a search engine. Ask five customers or prospects: "Where do you go when you are stuck on this?", "What do you read every week for work?", "Whose recommendation made you buy the last tool you bought?"

Query patterns that work as written:

```text
Reddit search bar   (field filters take no space after the colon; AND, OR, NOT in capitals)
  "no shows" AND (clinic OR practice)
  title:"cancellation policy" self:true
  subreddit:physiotherapy selftext:"booking software"

Google
  "physio clinic owners" (forum OR "facebook group" OR slack OR discord)
  site:reddit.com "private practice" "no-shows" after:2026-01-01
  physiotherapy "practice owners" (podcast OR newsletter) -jobs
```

For a technical audience, the Hacker News search API is public, needs no key, and returns counts and thread links:

```bash
SINCE=$(python3 -c 'import time; print(int(time.time()) - 365 * 86400)')
curl -s "https://hn.algolia.com/api/v1/search_by_date?query=%22schema%20drift%22&tags=comment&numericFilters=created_at_i%3E$SINCE&hitsPerPage=50" \
  | python3 -c 'import json, sys
d = json.load(sys.stdin)
print(d["nbHits"], "comments in 12 months")
for h in d["hits"]:
    print(h["created_at"][:10], "https://news.ycombinator.com/item?id=" + h["objectID"], "|", h.get("story_title", ""))'
```

`tags` accepts `story`, `comment`, `ask_hn` and `show_hn`; `numericFilters` accepts `created_at_i`, `points` and `num_comments`, comma-separated; `/search` ranks by relevance and `/search_by_date` by recency.

### 4. Sample and log

For each shortlisted venue read the 40 most recent threads or the last 14 days, whichever is fewer threads. Read through the site itself, by hand or with the browser. Do not write a scraper or a bot: forum terms generally restrict automated collection, and 40 threads is twenty minutes of reading.

After the first 15 threads, fix a short list of themes (five to eight plus `other`) and code every thread with exactly one. One of the themes is the target problem. Log one row per thread:

```csv
date,venue,url,theme,replies,asks_for_tool,mentions_paying,quote
2026-09-22,slack-practice-owners,https://practiceowners.slack.com/archives/C04TOOLS/p1758533000,no-shows,6,y,y,"we lose about 9 slots a week and the diary system only texts once"
```

`asks_for_tool` is `y` when the author asks what others use or recommend. `mentions_paying` is `y` when anyone names a price, a budget or a paid product they use for it. Keep quotes short, without names, and keep the log private.

Then tally:

```python
#!/usr/bin/env python3
"""tally.py community-log.csv "target theme" - activity and problem density per venue."""
import csv, sys
from collections import Counter, defaultdict
from datetime import date
from statistics import median

rows = list(csv.DictReader(open(sys.argv[1], newline="")))
target = sys.argv[2].lower()
by_venue = defaultdict(list)
for r in rows:
    by_venue[r["venue"]].append(r)

print(f"{'venue':26} {'thr':>3} {'/wk':>5} {'replies':>7} {'target':>6} {'asks':>4} {'pays':>4}  top themes")
for venue, rs in sorted(by_venue.items()):
    days = [date.fromisoformat(r["date"]) for r in rs]
    span = (max(days) - min(days)).days + 1
    hits = sum(r["theme"].lower() == target for r in rs)
    top = ", ".join(f"{t} {n}" for t, n in Counter(r["theme"] for r in rs).most_common(3))
    print(f"{venue[:26]:26} {len(rs):>3} {len(rs) * 7 / span:>5.1f} "
          f"{median(int(r['replies']) for r in rs):>7.1f} {hits / len(rs):>6.0%} "
          f"{sum(r['asks_for_tool'] == 'y' for r in rs):>4} "
          f"{sum(r['mentions_paying'] == 'y' for r in rs):>4}  {top}")
```

### 5. Score every venue the same way

| Measure | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Activity | nothing new in 30 days | under 5 threads a week | 5 to 25 a week | over 25 a week and a median of 3+ replies |
| Problem density (target share of sample) | 0% | under 5% | 5 to 15% | over 15% |
| Buying signals | none | complaints only, or one thread asking what to use | two or more threads asking what to use | threads naming what people pay, or asking for a supplier |
| Access | cannot join honestly | can join; no mention of own product anywhere | own product allowed in set threads or with moderator approval | disclosed founders and suppliers welcome |
| Fit | nothing to contribute | can ask informed questions | can answer some questions from experience | a practitioner the group sees as one of its own |

Read the access score off the venue's written rules, not from what other people appear to get away with.

- Total 11 or more with no zero: candidate for the primary venue. Pick one.
- Total 8 to 10: secondary. Keep at most two.
- Total 7 or less, or a zero on Access or Fit: do not take part. If problem density is 2 or 3, keep it as a place to read.

A small, busy, on-topic group beats a large one where the target problem is 2% of the conversation. Member counts say little; many large groups are silent.

### 6. Write the participation plan

The plan covers 30 days and fits the hours from step 1.

- **Days 1 to 14: reply only.** Answer threads where the founder has first-hand knowledge. No product mention, no link in the profile yet if the rules forbid it.
- **Days 15 to 30: add one original post a week** that would be worth reading if the product did not exist: numbers from the founder's own work, a template, a teardown of a common mistake.
- **Disclosure.** Any time the product is relevant, say "I make this" in the same message.
- **Ratio.** Keep own-product mentions to at most one contribution in ten. Reddit's own etiquette page gives that 9:1 figure as a rule of thumb, and its spam policy forbids bulk unsolicited private messages and bot-driven promotion.
- **Hacker News.** A Show HN must be something people can try, ideally without a signup; landing pages and blog posts do not qualify, and asking friends to upvote or comment is against the rules.
- **Before anything promotional**, message the moderators: who you are, what you would like to post, and an offer to change or drop it.
- **Measure** replies received, direct messages from members, and conversations booked. The goal for day 30 is a number of real conversations with people in the target role, not a follower count.

### 7. When no venue fits

Start a space of your own only when all of these hold: no existing venue scores 11 or more; around 30 customers or users have already contacted the founder individually (a rule of thumb, not a law); those people have reasons to talk to each other and not only to the founder; and the founder can show up every week for a year. Begin with the smallest form, a group chat of 10 to 15 invited customers or a monthly call, and grow it only if members start threads without being prompted.

### 8. Output

```markdown
# Community map: (audience, one line)
Sampled (dates). Target problem: (theme). Founder hours per week: (n)

| Venue | Threads/wk | Median replies | Target share | Activity | Density | Buying | Access | Fit | Total | Role |
|---|---|---|---|---|---|---|---|---|---|---|

## Primary venue: (name)
Why this one, in two sentences, with the numbers.
Rules that apply (quoted from the venue's rules page, with link).

## 30-day plan
Week by week: replies per week, original posts, the moderator message, what is measured.

## What members say (5 to 8 short quotes, no names)
## Dropped venues and why
## Next check: (date three months out)
```

## Examples

### Example 1: A product with no audience, sold to clinic owners

Priya Raman managed a physiotherapy practice in Leeds for six years and now sells a deposit-and-reminder add-on for clinic diary systems at £39 a month. She has four customers, all former colleagues, and five hours a week. Target problem: no-shows.

Vocabulary and searches produced eleven candidates; four were sampled between 14 and 27 September 2026 (113 threads). `python3 tally.py community-log.csv "no-shows"` printed:

```text
venue                      thr   /wk replies target asks pays  top themes
assoc-member-forum           9   4.8     2.0    11%    0    0  cpd 4, clinical 3, no-shows 1
fb-clinic-owners-uk         46  23.0     9.5    20%    5    4  other 12, hiring 11, no-shows 9
physio-subreddit            40  93.3     7.0     2%    1    0  career 22, clinical 12, other 3
slack-practice-owners       18   9.0     4.0    28%    4    3  other 6, no-shows 5, booking software 4
```

| Venue | Activity | Density | Buying | Access | Fit | Total | Role |
|---|---|---|---|---|---|---|---|
| Slack workspace run by a practice-owner podcast | 2 | 3 | 3 | 3 | 3 | 14 | primary |
| Facebook group for UK clinic owners | 2 | 3 | 3 | 2 | 3 | 13 | secondary |
| General physiotherapy subreddit | 3 | 1 | 1 | 1 | 1 | 7 | read only |
| Professional association member forum | 1 | 2 | 1 | 0 | 2 | dropped | members must be registered clinicians |

The subreddit is by far the busiest and still loses: 34 of its 40 threads are students and clinical questions, and its rules forbid mentioning a product. The Slack workspace has a tenth of the traffic, yet more than a quarter of what is said there is about the problem Priya solves, and three threads name what owners already pay.

Plan written into the map: weeks 1 and 2, five replies a week in the Slack `#running-the-clinic` and `#tools` channels from her experience as a practice manager; week 3, a post with her old clinic's figures (no-show rate from 11% to 6% after a £15 deposit, the exact wording of the policy, what patients said); week 4, the same material adapted for the Facebook group's monthly supplier thread, after asking the admin. Day-30 goal: five calls with clinic owners she did not know before.

### Example 2: An open-source developer tool looking for a home

Tomasz Zielinski maintains a command-line tool that reports schema drift between Postgres environments: 140 GitHub stars, 31 people who have opened issues, six hours a week. He asks whether to post on Hacker News or open a Discord server.

The search API, run on 1 October 2026 for `"schema drift"` over twelve months, returned 25 comments, 19 stories, 11 Show HN posts and 3 Ask HN posts, and no story with ten or more comments. The topic exists there, but nothing about it holds a conversation.

| Venue | Activity | Density | Buying | Access | Fit | Total | Role |
|---|---|---|---|---|---|---|---|
| Postgres community chat, help channels | 3 | 2 | 2 | 2 | 3 | 12 | primary |
| GitHub Discussions on his own repository | 1 | 3 | 2 | 3 | 3 | 12 | home for existing users |
| Hacker News | 3 | 1 | 1 | 2 | 2 | 9 | one Show HN, then read |
| A general DevOps subreddit | 3 | 1 | 1 | 1 | 2 | 8 | read only |

Decision: no Discord server. Step 7 fails twice: an existing venue already scores 12, and although 31 issue openers pass the size test, they come to report bugs, not to talk to each other. Discussions on the existing repository is the right size. The 30-day plan is ten answers a week in the chat's help channels on migration questions, a pinned "how are you checking drift today?" thread in Discussions, and a single Show HN once the tool runs from one command with no signup, with Tomasz present in the thread for the day.

## Guidelines

- A following is not a community. People who follow one creator or brand do not talk to each other; that is a channel for sponsorship or ads, not a place to listen.
- Do not send the founder where they are an outsider. If every venue scores 0 or 1 on fit, the finding is "the founder does not know these people yet", and the plan is three months of reading and asking questions, or a different group.
- People who post are not the whole market. Before building on what the log shows, confirm it in five conversations with members.
- A two-week sample misses seasons (tax time, term starts, trade-show months). Re-sample every three months and whenever the product changes.
- Search-API hit counts are approximate and include off-topic matches; open ten results before quoting a number.
- Reddit community pages now show weekly visitors and contributions; use those and your own sample, not an old member count from a third-party list.
- Never automate participation: no scraping of private groups, no bulk direct messages, no generated replies posted under the founder's name. One removal by a moderator costs more than a month of careful posting earns.
- The log holds what people wrote in semi-private places. Store links and short anonymous quotes, never member lists, and do not publish quotes from closed groups.
- Not the right tool when the business already has several hundred customers and their email addresses (interview and survey them instead), or when it sells to a few dozen named enterprise accounts, where research on each account matters more than any forum.
