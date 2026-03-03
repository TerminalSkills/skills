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
    - keywords
---

# App Store Optimization (ASO)

Optimize mobile app visibility and conversion in App Store and Google Play. Cover keyword research, metadata optimization, creative assets, ratings management, and localization.

## How Store Algorithms Work

### Apple App Store

Apple indexes these fields for search:
- **App Name** (30 chars) — highest keyword weight
- **Subtitle** (30 chars) — second highest weight
- **Keyword field** (100 chars) — hidden, comma-separated, no spaces after commas
- **In-App Purchase names** — indexed but low weight
- **Developer name** — indexed

Apple does NOT index the description or promotional text for search. Those are for conversion only.

### Google Play

Google indexes more text:
- **App Title** (30 chars) — highest weight
- **Short Description** (80 chars) — high weight
- **Long Description** (4000 chars) — indexed, keyword density matters (2-5% natural)
- **Developer name** — indexed
- **Package name** — indexed (one-time choice, pick well)

Google also factors in engagement metrics: install velocity, retention rate, crash rate, uninstall rate.

## Keyword Research

### Process

1. **Seed list**: Start with features, use cases, competitor names, problem words
2. **Expand**: Use autocomplete in both stores — type your seed and note suggestions
3. **Validate**: Check search volume and difficulty using ASO tools (AppTweak, Sensor Tower, AppFollow)
4. **Prioritize**: Score each keyword on `volume × relevance / difficulty`
5. **Map**: Assign keywords to metadata fields by priority

### Keyword placement rules

```
App Store (iOS):
┌─────────────────────────────────┐
│ App Name (30 chars)             │ ← Top 2-3 keywords, natural reading
│ Subtitle (30 chars)             │ ← Supporting keywords, value prop
│ Keyword field (100 chars)       │ ← Everything else, no duplicates
│ Don't repeat words across fields│ ← Apple deduplicates automatically
└─────────────────────────────────┘

Google Play:
┌─────────────────────────────────┐
│ Title (30 chars)                │ ← Primary keyword + brand
│ Short Description (80 chars)    │ ← Key features with keywords
│ Long Description (4000 chars)   │ ← Natural keyword usage, 2-5% density
│ Repeat important keywords 3-5x │ ← Google rewards repetition (natural)
└─────────────────────────────────┘
```

### Keyword field optimization (iOS)

The 100-character keyword field is hidden from users but critical for search:

```
# Rules:
# - Comma-separated, no spaces after commas
# - Don't repeat words already in title or subtitle
# - Use singular OR plural, not both (Apple matches both)
# - Don't include "app" or your category name (implicit)
# - Don't include competitor brand names (rejection risk)
# - Short words save characters: use "pic" not "picture"

# Example for a meditation app:
# Title: "Calm Mind - Meditation Timer"
# Subtitle: "Sleep Sounds & Breathing Guide"
# Keywords: relax,focus,stress,anxiety,mindful,zen,nature,rain,
#           ocean,white,noise,habit,daily,morning,routine,wellness
```

## Store Listing Creative Assets

### Screenshots

Screenshots are the single biggest conversion factor. Users decide to install or leave within 3-6 seconds of viewing your listing.

**Design principles:**
- First 3 screenshots visible without scrolling — put the strongest value props here
- Each screenshot = one clear message (feature + benefit)
- Large, readable text overlay — people browse on small screens
- Show the app UI but emphasize the outcome, not the interface
- Use device frames or go edge-to-edge (test both)

**Screenshot sequence:**
```
1. Hero shot — primary value proposition + social proof
2. Core feature — the main thing users do in the app
3. Unique differentiator — what competitors don't have
4. Secondary feature — another strong use case
5. Social proof — reviews, awards, press mentions, user counts
```

For Apple: up to 10 screenshots, first 3 appear in search results
For Google: up to 8 screenshots, first 3-4 appear in search results

### Preview Video

- **iOS**: 15-30 seconds, autoplays muted in search results, first 3 seconds are the poster frame
- **Android**: 30 seconds to 2 minutes, YouTube link, thumbnail matters

Video should show the app in action with text overlays explaining what's happening. No long intros — start with the wow moment.

### Icon

The icon appears everywhere — search results, home screen, notifications. It must:
- Be recognizable at 16×16px (notification size)
- Stand out against both light and dark backgrounds
- Avoid text (too small to read at most sizes)
- Use a single focal element, not a collage
- A/B test variations (Google Play Store allows native experiments)

## A/B Testing Store Listings

### Google Play Store Experiments

Google Play has built-in A/B testing:
- Test up to 5 variants against control
- Can test: icon, feature graphic, screenshots, short description, long description
- Minimum 7 days, Google recommends 14 days for significance
- Apply the winner with one click

### Apple Product Page Optimization

Apple allows testing alternative product pages:
- Test up to 3 treatments against control
- Can test: icon, screenshots, preview video
- Cannot test title, subtitle, or description
- 90-day test limit, needs minimum traffic to reach significance

### What to test first

1. **Screenshots** — highest conversion impact
2. **Icon** — affects both search CTR and conversion
3. **Short description / subtitle** — affects click-through from search
4. **Preview video** — can boost conversion 15-30% if done well

## Ratings and Reviews Management

**Impact**: Each 0.5-star increase in average rating can improve conversion by 10-20%. Apps below 4.0 stars lose significant traffic.

### In-app review prompts

```
Best practices:
- Use native review API (SKStoreReviewController / Google In-App Review API)
- Trigger after a positive action (completed workout, saved money, reached goal)
- Don't trigger during frustration (error, failed action, slow load)
- Limit frequency: max 3 times per 365 days (iOS enforces this)
- Pre-qualify: ask "Are you enjoying [App]?" — if yes, show review prompt
  If no, route to support/feedback form (don't send unhappy users to store)
```

### Responding to reviews

- Respond to all negative reviews within 24-48 hours
- Be specific about fixes: "We fixed the crash in version 3.2.1"
- Updated responses to old reviews can prompt users to change their rating
- Never argue or be defensive — acknowledge, explain, resolve

## Localization

Localizing metadata (not the app itself) is the fastest ASO win for international growth:

**High-impact locales to consider:**
- Spanish (Spain + Latin America = 500M+ speakers)
- Portuguese (Brazil = huge mobile market)
- Japanese (high ARPU, low competition for English apps)
- German (strong European market)
- French (France + Africa)
- Korean (high mobile usage)

**Localization is NOT translation.** Research keywords in each locale separately — direct translations often aren't what locals search for. A "to-do list" app might be searched as "タスク管理" (task management) in Japanese, not "やることリスト" (to-do list).

## Monitoring and Iteration

Track these metrics weekly:

```
VISIBILITY
- Keyword rankings: [top 10 keywords with position changes]
- Category ranking: [position in primary category]
- Search visibility score: [composite metric]
- Impressions: [count, WoW change]

CONVERSION
- Page views → Installs: [rate]% (benchmark: 25-35%)
- Impression → Install: [rate]% (benchmark: 3-8%)
- Browse vs Search split: [ratio]

ENGAGEMENT (affects ranking)
- Day 1 retention: [rate]%
- Crash rate: [rate]%
- Uninstall rate: [rate]%
- Average session duration: [time]

RATINGS
- Current rating: [stars] ([count] ratings)
- Recent trend: [improving/declining]
- Review response rate: [rate]%
```

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
