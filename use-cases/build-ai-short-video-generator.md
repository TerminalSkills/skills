---
title: Build an AI Short Video Generator
description: >-
  Build a faceless YouTube Shorts / TikTok video generator pipeline that creates
  50+ videos per day — from topic research to upload automation.
persona: >-
  Content creator building a faceless video channel generating $2k/month in
  ad revenue and affiliate income within 6 months.
skills: [ai-video-generator, elevenlabs-sdk, anthropic-sdk, ffmpeg]
tags: [video, tiktok, youtube-shorts, faceless-channel, automation, passive-income]
---

# Build an AI Short Video Generator

## Goal

Build an automated pipeline that generates faceless short-form videos (YouTube Shorts, TikTok, Instagram Reels) — from trending topic research through script writing, narration, stock footage selection, subtitle generation, assembly, and upload. Target: 50 videos/day at ~$0.05/video cost.

## Who This Is For

A content creator who wants to build one or more faceless video channels generating passive income. No camera, no face, no editing skills needed — just AI + automation.

## Architecture

```
Trending Topics API
       ↓
  AI Script Writer (Claude)
       ↓
  Text-to-Speech (ElevenLabs / OpenAI TTS)
       ↓
  Stock Footage Matcher (Pexels API)
       ↓
  Subtitle Generator (WhisperX)
       ↓
  Video Assembler (FFmpeg / MoviePy)
       ↓
  Upload Bot (YouTube API / TikTok)
       ↓
  Analytics Dashboard
```

## Step-by-Step

### 1. Set Up the Project

```bash
mkdir video-generator && cd video-generator
python -m venv venv && source venv/bin/activate
pip install anthropic requests moviepy pydub whisperx srt schedule
sudo apt install ffmpeg
```

Environment variables needed:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ELEVENLABS_API_KEY=...
export PEXELS_API_KEY=...
export YOUTUBE_CLIENT_SECRET=...  # for upload
```

### 2. Topic Research Engine

Find what's trending and likely to go viral:

```python
# Research trending topics in your niche
# Use Google Trends API, Reddit trending, or curated topic lists
# The ai-video-generator skill has get_trending_topics() function

# Key niches with high RPM:
# - "AI tools nobody talks about" ($8-15 RPM)
# - "Psychology facts" ($5-10 RPM)
# - "Money/finance tips" ($10-20 RPM)
# - "Tech reviews" ($8-15 RPM)
```

### 3. Script Generation with Hooks

Every viral short follows this formula:

```
HOOK (0-3s): "Stop scrolling — this AI tool is replacing..."
BODY (3-50s): 3-5 punchy facts, each 1-2 sentences
CTA (50-60s): "Follow for more, link in bio"
```

Use the `generate_script()` function from the `ai-video-generator` skill. Key: the hook is everything — if they don't stop scrolling in 3 seconds, you lost them.

### 4. Voice Generation

Choose your voice strategy:
- **ElevenLabs** ($22/mo): Best quality, most natural, voice cloning
- **OpenAI TTS** (~$0.015/1K chars): Good quality, cheaper at scale
- **Edge TTS** (free): Decent quality, unlimited, good for testing

For a faceless channel, pick ONE consistent voice — it becomes your brand.

### 5. Stock Footage Matching

```python
# For each script section, extract 2-3 keywords
# Search Pexels API for matching portrait (9:16) clips
# Download and cache clips for reuse
# Tip: build a local footage library to reduce API calls
```

### 6. Subtitle Generation

Subtitles are CRITICAL for shorts — 80% of viewers watch with sound off.

Style: bold white text with black outline, centered bottom third, 3-5 words at a time, word-by-word highlight for engagement.

### 7. Video Assembly

```python
# Combine: background clips + narration + subtitles
# Output: 1080x1920 (9:16), H.264, AAC audio
# Add: slight zoom/pan on clips to avoid static frames
# Duration: 30-60 seconds optimal
```

### 8. Upload Automation

```python
# YouTube Shorts: Use YouTube Data API v3
# - Upload via resumable upload
# - Set: #Shorts in title/description for Shorts shelf
# - Schedule uploads: 3-5 per day, spread across hours

# TikTok: Use unofficial API or Selenium automation
# - Upload via browser automation
# - Add trending sounds when relevant
```

### 9. Batch Production

```python
# Daily batch: generate 50 videos overnight
# Store in output/YYYY-MM-DD/ directory
# Upload scheduler: drip 5-10 per day to avoid spam flags
# A/B test: same topic, different hooks → keep the winner
```

### 10. Analytics & Optimization

Track what works:
- **Hook retention** — if <30% watch past 3s, rewrite hooks
- **Completion rate** — target >60% for Shorts algorithm
- **Click-through rate** — thumbnail + title optimization
- **Revenue per video** — double down on high-RPM topics

## Cost Breakdown

| Item | Monthly Cost |
|------|-------------|
| Claude Sonnet (scripts) | ~$5 |
| ElevenLabs (voice) | $22-99 |
| Pexels (footage) | Free |
| VPS for automation | $10-20 |
| **Total** | **~$40-125** |

## Revenue Timeline

| Month | Videos | Views | Revenue |
|-------|--------|-------|---------|
| 1 | 500 | 50K | $0 (building) |
| 2 | 1,000 | 200K | $50-100 |
| 3 | 1,500 | 500K | $200-500 |
| 6 | 3,000 | 2M+ | $1,000-2,000 |

## Tips for Success

1. **Consistency beats quality** — post daily, the algorithm rewards frequency
2. **First 3 seconds decide everything** — spend 50% of effort on hooks
3. **One niche per channel** — don't mix finance and cooking
4. **Recycle what works** — same topic, different angle, new hook
5. **Watch competitors** — see what gets views in your niche, make it better
6. **Build multiple channels** — diversify risk and income sources

## Related Skills

- `ai-video-generator` — core video generation pipeline
- `ai-content-monetization` — broader monetization strategies
- `anthropic-sdk` — Claude API for script generation
