---
name: last30days-skill
description: >-
  Deep research engine covering the last 30 days across 10+ sources -- Reddit, X/Twitter,
  YouTube, TikTok, HackerNews, Polymarket, Bluesky, and the web. Synthesizes findings into
  grounded, cited reports. Use when: researching trending topics, competitive intelligence,
  understanding what people are saying about a subject right now.
license: MIT
compatibility: "Node.js 18+, requires SCRAPECREATORS_API_KEY"
metadata:
  author: terminal-skills
  version: "2.9.5"
  category: research
  tags: [research, trends, deep-research, social-media, competitive-intelligence]
---

# Last 30 Days Research

## Overview

Research any topic across Reddit, X/Twitter, Bluesky, Truth Social, YouTube, TikTok, Instagram, Hacker News, Polymarket, and the web. Surfaces what people are actually discussing, recommending, betting on, and debating right now. Synthesizes findings into a grounded report with citations and engagement stats.

## Instructions

### Step 1: Parse User Intent

Before running research, extract from the user's input:

- **TOPIC**: What they want to learn about
- **TARGET_TOOL**: Where they will use the results (if specified, otherwise "unknown")
- **QUERY_TYPE**: One of RECOMMENDATIONS, NEWS, COMPARISON, PROMPTING, or GENERAL

Display your parsing to the user before calling any tools:

```
I'll research {TOPIC} across Reddit, X, Bluesky, YouTube, TikTok, and the web.

Parsed intent:
- TOPIC = {TOPIC}
- TARGET_TOOL = {TARGET_TOOL or "unknown"}
- QUERY_TYPE = {QUERY_TYPE}

Research typically takes 2-8 minutes. Starting now.
```

### Step 2: Resolve X Handle (Optional)

If the topic could have its own X/Twitter account (people, brands, products, companies), do a quick WebSearch to find their handle. Pass it as `--x-handle={handle}` to search their posts directly. Skip for generic concepts.

### Step 3: Run the Research Script

Run in foreground with a 5-minute timeout:

```bash
for dir in "." "${CLAUDE_PLUGIN_ROOT:-}" "$HOME/.claude/skills/last30days" \
  "$HOME/.agents/skills/last30days" "$HOME/.codex/skills/last30days"; do
  [ -n "$dir" ] && [ -f "$dir/scripts/last30days.py" ] && SKILL_ROOT="$dir" && break
done

python3 "${SKILL_ROOT}/scripts/last30days.py" $ARGUMENTS --emit=compact --no-native-web --save-dir=~/Documents/Last30Days
```

Read the entire output -- it contains Reddit, X, YouTube, TikTok, Instagram, HN, Polymarket, and web sections.

### Step 4: Supplement with WebSearch

After the script finishes, run WebSearch queries based on QUERY_TYPE:
- **RECOMMENDATIONS**: `best {TOPIC} recommendations`, `most popular {TOPIC}`
- **NEWS**: `{TOPIC} news 2026`, `{TOPIC} announcement update`
- **PROMPTING**: `{TOPIC} prompts examples 2026`
- **GENERAL**: `{TOPIC} 2026`, `{TOPIC} discussion`
- **COMPARISON**: Run three passes (TOPIC_A alone, TOPIC_B alone, "A vs B")

Exclude reddit.com and x.com (already covered by script).

### Step 5: Synthesize and Present

Weight sources by engagement signals: Reddit/X highest (upvotes, likes), YouTube high (views, transcripts), TikTok high (viral signal), web lowest (no engagement data). Cross-platform signals are strongest evidence.

Present in this order:
1. "What I learned" synthesis with citations (prefer @handles and r/subreddits over web sources)
2. Stats block showing counts per platform (omit platforms with 0 results)
3. Invitation with 2-3 specific follow-up suggestions based on actual findings

Cite sources sparingly: 1 source per pattern, short format ("per @handle" or "per r/sub"). Never paste raw URLs. Use publication names for web sources.

### Step 6: Handle Follow-ups

After presenting results, stay in expert mode. Answer follow-up questions from your research without new searches. Only run new research if the user asks about a different topic. Write prompts only when explicitly requested.

**Options**: `--days=N` (lookback period), `--quick` (fewer sources), `--deep` (comprehensive), `--agent` (non-interactive output).

## Examples

### Example 1: Research a Developer Framework

User asks: "What are developers saying about Bun runtime?"

```
Parsed intent:
- TOPIC = Bun runtime
- TARGET_TOOL = unknown
- QUERY_TYPE = GENERAL
```

Script returns 22 Reddit threads (1,840 upvotes), 35 X posts (4,200 likes), 8 YouTube videos (120K views). Key findings: developers praise startup speed (per @jaraborner), Bun 1.2 announcement drove Reddit discussion (per r/javascript), YouTube benchmarks show 3x faster cold starts vs Node (per Fireship). Pattern: adoption growing in CLI tools but not production servers yet (per r/node).

### Example 2: Competitive Comparison

User asks: "Plaud vs Granola for AI meeting notes"

QUERY_TYPE = COMPARISON. Run three research passes: "Plaud" alone, "Granola" alone, "Plaud vs Granola". Synthesize as side-by-side comparison with community sentiment, strengths, weaknesses, and head-to-head table. Present specific odds and mention counts: "Plaud mentioned 18x across Reddit/X with mixed sentiment on hardware quality; Granola mentioned 12x with strong praise for transcript accuracy (per @sarahk_ai)."

## Guidelines

- Always display parsed intent before running any tools
- Run the research script in foreground, never in background
- Read the entire script output -- missing sections produces incomplete stats
- Weight engagement-backed sources (Reddit, X, YouTube) over web articles
- Never paste raw URLs in output -- use publication/site names
- For RECOMMENDATIONS queries, extract specific product/tool names, not generic advice
- Polymarket odds are high-signal data -- weave them into narrative as supporting evidence
- Omit any platform line from stats that returned 0 results
- Stay in expert mode after presenting results -- answer follow-ups from existing research
- Only credential used is SCRAPECREATORS_API_KEY; X/Bluesky/Truth Social tokens are optional
- The skill reads public data only and does not post, like, or modify content on any platform
