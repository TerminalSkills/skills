---
name: reddit-insights
description: >-
  Semantic search across Reddit to find pain points, validate ideas, discover
  niches, and analyze sentiment. Use when a user asks to research Reddit,
  find Reddit discussions about a topic, analyze Reddit sentiment, discover
  what people complain about on Reddit, validate a business idea on Reddit,
  find pain points in a subreddit, or mine Reddit for product insights.
license: Apache-2.0
compatibility: "Requires Python 3.10+ with praw installed and a Reddit script-app client ID and secret (free to register; API access is subject to Reddit approval)."
metadata:
  author: terminal-skills
  version: "1.3.0"
  repository: https://github.com/praw-dev/praw
  category: research
  tags: "reddit, research, sentiment, market-research, validation"
  use-cases: "Validate a startup idea by finding real user pain points on Reddit, Analyze sentiment around a product or brand across subreddits, Discover underserved niches by mining complaints and feature requests"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Reddit Insights

## Overview

Perform semantic research across Reddit to extract actionable insights. Search for discussions, analyze sentiment patterns, identify recurring pain points, validate product ideas, and discover niche opportunities. Uses Reddit's official OAuth API (through PRAW) to read posts and comments; anonymous `.json` scraping is blocked by Reddit.

## Instructions

When a user asks you to research Reddit for insights, follow these steps:

### Step 1: Define the research scope

Clarify with the user:
- **Topic/query**: What subject, product, or idea to research
- **Subreddits** (optional): Specific subreddits to focus on, or search broadly
- **Time range**: Recent (week/month) or historical (year/all)
- **Research goal**: Pain points, sentiment, idea validation, competitor analysis, or trend discovery
- **Output format**: Summary report, raw data, or structured analysis

### Step 2: Fetch Reddit data through the official API (OAuth)

Reddit now answers anonymous requests to `www.reddit.com/*.json` with HTTP 403, and its API rules require OAuth2 clients. Use the official API through PRAW (Python 3.10+). The user must register a "script" app at https://www.reddit.com/prefs/apps and, under Reddit's Responsible Builder Policy, may need approval for API access; ask them to export the credentials as environment variables, never paste them into code:

```bash
pip install praw
export REDDIT_CLIENT_ID=...        # shown under the app name
export REDDIT_CLIENT_SECRET=...
export REDDIT_USER_AGENT="script:market-research:v1.0 (by u/your_reddit_username)"
```

```python
import os
import praw

reddit = praw.Reddit(
    client_id=os.environ["REDDIT_CLIENT_ID"],
    client_secret=os.environ["REDDIT_CLIENT_SECRET"],
    user_agent=os.environ["REDDIT_USER_AGENT"],
)  # read-only mode: enough for search and reading

def search_reddit(query, subreddit="all", sort="relevance", time_filter="year", limit=100):
    """Search posts; PRAW pages through results and respects rate limits."""
    posts = []
    for post in reddit.subreddit(subreddit).search(
        query, sort=sort, time_filter=time_filter, limit=limit
    ):
        posts.append({
            "title": post.title,
            "selftext": post.selftext,
            "subreddit": post.subreddit.display_name,
            "score": post.score,
            "num_comments": post.num_comments,
            "url": f"https://www.reddit.com{post.permalink}",
            "created_utc": post.created_utc,
            "id": post.id,
        })
    return posts

def get_post_comments(post_id, limit=200):
    """Top-level comments of one post, best first."""
    submission = reddit.submission(id=post_id)
    submission.comment_sort = "top"
    submission.comments.replace_more(limit=0)  # drop "load more" stubs
    return [
        {"body": c.body, "score": c.score, "author": str(c.author or "[deleted]")}
        for c in submission.comments[:limit]
    ]

posts = search_reddit("project management agency", subreddit="agency", time_filter="year", limit=50)
```

`sort` accepts relevance, hot, top, new, comments; `time_filter` accepts hour, day, week, month, year, all. If the user has no credentials and will not register, say so plainly and fall back to data they supply (exported threads, pasted links) or a search engine with `site:reddit.com`; do not try to bypass the 403 by spoofing a browser, which Reddit's rules prohibit.

### Step 3: Analyze the content

Process the collected posts and comments to extract insights:

**Pain point extraction:**
- Search for phrases like "I wish", "frustrated with", "hate that", "switched from", "biggest problem"
- Group recurring complaints by theme
- Count frequency and upvote weight of each pain point

**Sentiment analysis:**
- Categorize posts/comments as positive, negative, neutral, or mixed
- Track sentiment trends over time
- Identify polarizing topics

**Idea validation:**
- Find existing discussions about similar solutions
- Look for "someone should build" or "is there a tool that" posts
- Assess demand signals: upvotes, comment engagement, frequency of asks

**Competitive analysis:**
- Search for competitor product names
- Analyze praise and criticism patterns
- Identify feature gaps users mention

### Step 4: Compile the research report

Structure the output as an actionable report:

```markdown
# Reddit Research Report: [Topic]

## Research Parameters
- Query: [search terms used]
- Subreddits: [list of subreddits searched]
- Time range: [period]
- Posts analyzed: [count]
- Comments analyzed: [count]

## Key Findings

### Top Pain Points
1. **[Pain point 1]** (mentioned 23 times, avg score: 45)
   - Example: "[quoted user comment]"
   - Subreddits: r/subreddit1, r/subreddit2

2. **[Pain point 2]** (mentioned 18 times, avg score: 32)
   - Example: "[quoted user comment]"

### Sentiment Overview
- Positive: 35% | Neutral: 40% | Negative: 25%
- Most positive aspect: [topic]
- Most negative aspect: [topic]

### Opportunity Signals
- [Unmet need identified from discussions]
- [Feature request pattern observed]
- [Gap in existing solutions mentioned]

### Notable Discussions
1. [Post title](url) - [X] upvotes, [Y] comments
   Summary: [brief takeaway]

## Recommendations
- [Actionable recommendation 1]
- [Actionable recommendation 2]
- [Actionable recommendation 3]
```

### Step 5: Save the report

```bash
cat > reddit_research_[topic].md << 'EOF'
[compiled report]
EOF
```

## Examples

### Example 1: Validate a SaaS idea

**User request:** "Research Reddit to see if people need a better project management tool for small agencies."

**Research approach:**
1. Search queries: "project management agency", "PM tool freelancer", "manage client projects"
2. Target subreddits: r/agency, r/freelance, r/smallbusiness, r/projectmanagement
3. Look for: complaints about existing tools, feature wish lists, "what do you use" threads
4. Analyze: frequency of complaints, which tools are mentioned negatively, unmet needs

**Key findings format:**
```
Pain Points Found:
1. "Asana/Monday are too complex for a 5-person team" (seen 15 times)
2. "No good tool combines project tracking with client invoicing" (seen 9 times)
3. "Switching between 4 tools to manage one project" (seen 12 times)

Validation Signal: MODERATE-STRONG
- Clear demand exists, but space is crowded
- Differentiation opportunity: simplicity + invoicing integration
```

### Example 2: Analyze sentiment around a product launch

**User request:** "What is Reddit saying about the new Arc browser?"

**Research approach:**
1. Search for "Arc browser" across all subreddits
2. Fetch top 50 posts and their comments from the past 3 months
3. Categorize sentiment per feature area (UI, speed, extensions, sync)
4. Identify most loved and most criticized features

### Example 3: Discover underserved niches

**User request:** "Find underserved developer tool niches by mining Reddit complaints."

**Research approach:**
1. Search r/programming, r/webdev, r/devops for frustration keywords
2. Queries: "annoying that", "wish there was", "no good tool for", "why is there no"
3. Group complaints by category (testing, deployment, documentation, etc.)
4. Rank by frequency and engagement
5. Cross-reference with existing tools to identify true gaps

## Guidelines

- Authenticate with OAuth and send a descriptive User-Agent in Reddit's format (`script:<app>:<version> (by u/<username>)`). Generic or browser-like agents are throttled or blocked.
- The limit is 60 requests per minute for OAuth clients; PRAW waits automatically. Avoid repeated single-item calls when a listing returns many.
- One listing returns at most about 1,000 items, so split big research into several queries, subreddits and time filters.
- Keep client ID, secret and password in environment variables; never commit them or print them.
- Check Reddit's Data API Terms before commercial use or before feeding content into model training; they restrict both.
- Do not collect personal profiles or personally identifiable information; quote usernames only when necessary.
- Present findings with context: one upvoted complaint is not a validated market need. Look for patterns across discussions and weigh upvotes (a 500-upvote post counts more than a 3-upvote one).
- Note the subreddit context: complaints in r/technology mean something different from those in r/startups.
- For idea validation, look for both demand signals (people asking for a solution) and supply signals (existing tools already addressing it).
- Always include source links and save raw data alongside the analysis so the user can verify and explore further.
- If a call fails with 401, 403 or 429, report it and retry after a pause instead of looping.
