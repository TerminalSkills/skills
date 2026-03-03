---
name: app-store-optimization
description: >-
  Optimize mobile app listings for discovery and conversion in Apple App Store
  and Google Play. Use when tasks involve ASO keyword research, title and subtitle
  optimization, screenshot and preview video design, A/B testing store listings,
  review management, localization for international markets, tracking keyword
  rankings, or improving download conversion rates. Covers both iOS and Android
  store algorithms and best practices.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags:
    - aso
    - app-store
    - google-play
    - mobile
    - marketing
---

# App Store Optimization (ASO)

## Overview

Optimize mobile app visibility and conversion in App Store and Google Play. Cover keyword research, metadata optimization, creative assets, ratings management, and localization.

## Instructions

### How store algorithms work

**Apple App Store** indexes: App Name (30 chars, highest weight), Subtitle (30 chars), Keyword field (100 chars, hidden), In-App Purchase names, Developer name. Apple does NOT index the description for search.

**Google Play** indexes: App Title (30 chars, highest weight), Short Description (80 chars), Long Description (4000 chars, 2-5% keyword density), Developer name, Package name. Google also factors engagement metrics: install velocity, retention, crash rate, uninstall rate.

### Keyword research

1. **Seed list**: Features, use cases, competitor names, problem words
2. **Expand**: Use autocomplete in both stores
3. **Validate**: Check volume and difficulty (AppTweak, Sensor Tower, AppFollow)
4. **Prioritize**: Score each on `volume × relevance / difficulty`
5. **Map**: Assign keywords to metadata fields by priority

**Keyword placement:**

```
App Store (iOS):
- App Name (30 chars): Top 2-3 keywords, natural reading
- Subtitle (30 chars): Supporting keywords, value prop
- Keyword field (100 chars): Everything else, no duplicates across fields
- Comma-separated, no spaces. Singular OR plural (Apple matches both)
- Don't include "app" or category name. Don't use competitor brands.

Google Play:
- Title (30 chars): Primary keyword + brand
- Short Description (80 chars): Key features with keywords
- Long Description (4000 chars): Natural usage, 2-5% density, repeat 3-5x
```

### Store listing creative assets

**Screenshots** are the single biggest conversion factor. Design principles:
- First 3 screenshots visible without scrolling — strongest value props here
- Each screenshot = one clear message (feature + benefit)
- Large, readable text overlay
- Sequence: Hero shot → Core feature → Unique differentiator → Secondary feature → Social proof

**Preview video**: iOS 15-30s (autoplays muted), Android 30s-2min (YouTube). Start with the wow moment, no long intros.

**Icon**: Recognizable at 16×16px, single focal element, avoid text, A/B test variations.

### A/B testing store listings

**Google Play Experiments**: Test up to 5 variants (icon, screenshots, descriptions). Minimum 7 days, recommend 14 days.

**Apple Product Page Optimization**: Test up to 3 treatments (icon, screenshots, preview video). Cannot test title/subtitle. 90-day limit.

**Priority order**: Screenshots → Icon → Short description/subtitle → Preview video.

### Ratings and reviews

Each 0.5-star increase improves conversion by 10-20%. Apps below 4.0 lose significant traffic.

**In-app review prompts**: Use native review API. Trigger after positive actions (completed goal, saved money). Pre-qualify: ask "Are you enjoying [App]?" — if yes, show review; if no, route to feedback form. Max 3 times per year (iOS enforced).

**Responding**: Reply to all negative reviews within 24-48 hours. Be specific about fixes. Never argue or be defensive.

### Localization

Localizing metadata (not the app) is the fastest ASO win. High-impact locales: Spanish, Portuguese (Brazil), Japanese, German, French, Korean.

Localization is NOT translation — research keywords in each locale separately. Direct translations often aren't what locals search for.

### Monitoring

Track weekly: keyword rankings (top 10 with position changes), category ranking, impressions, page view → install rate (benchmark: 25-35%), impression → install rate (benchmark: 3-8%), Day 1 retention, crash rate, current rating and trend.

## Examples

### Optimize an iOS app listing for more downloads

```prompt
Our meditation app "ZenFlow" has 2,000 daily downloads but a 22% conversion rate from page views. Current title: "ZenFlow". We rank for "meditation" (#45) and "sleep sounds" (#78). Optimize our App Store metadata — title, subtitle, and keyword field — to improve keyword rankings and conversion. Research what top competitors in the meditation category use.
```

### Plan a localization strategy for Google Play

```prompt
Our fitness app has 100K downloads in the US and we want to expand internationally. Identify the top 5 markets by opportunity (considering competition, ARPU, and mobile fitness trends), then create localized metadata for each — not direct translations, but locally researched keywords and culturally adapted screenshots.
```

### Design a screenshot A/B test

```prompt
Our productivity app's screenshots haven't been updated in 8 months and conversion is declining. Design 3 screenshot variants to A/B test on Google Play. Include the messaging strategy, visual approach, and success metrics for each variant. Our current conversion rate from page view to install is 28%.
```

## Guidelines

- Always deduplicate keywords across title, subtitle, and keyword field on iOS — Apple deduplicates automatically
- Use singular or plural forms but not both on iOS (Apple matches both)
- Never include competitor brand names in the keyword field — risk of rejection
- Update screenshots and metadata at least every 3-6 months to avoid conversion decline
- Always pre-qualify users before showing the native review prompt
- Respond to negative reviews with specific fix information, never defensively
- Track keyword rankings weekly and iterate metadata based on position changes
