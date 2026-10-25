---
name: app-store-optimization
description: >-
  Optimize mobile app listings for discovery and conversion in Apple App Store
  and Google Play. Use when tasks involve ASO keyword research, app name and
  subtitle optimization, Google Play title and short description, screenshot
  and preview video design, Apple Product Page Optimization and Google Play
  store listing experiments, review prompts, localizing store metadata, tracking
  keyword rankings, or improving download conversion rates. Covers the metadata
  limits Apple and Google publish and the conversion tests each store offers.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: "aso, app-store, google-play, mobile, marketing"
---

# App Store Optimization (ASO)

## Overview

Optimize mobile app visibility and conversion in App Store and Google Play. Cover keyword research, metadata optimization, creative assets, A/B tests the stores provide, review prompts, and localization. Limits quoted here are from Apple's and Google's help pages as checked on 2026-10-24; confirm the field limit in the console before you paste text.

## Instructions

### Metadata fields and their limits

**Apple App Store (App Store Connect)**

| Field | Limit (as published) | Notes |
|---|---|---|
| App Name | 30 characters (confirm in the field counter) | Searchable. Apple says the app is searchable by app name and company name, so do not repeat those in Keywords. |
| Subtitle | 30 characters (confirm in the field counter) | Shown under the name on the product page. |
| Keywords | 100 bytes | Each keyword must be longer than two characters. Names of other apps or companies are not allowed. |
| Promotional Text | 170 characters | Can be changed without a new app version. |
| Description | 4000 characters | Plain text. |

**Google Play (Play Console)**

| Field | Limit (as published) | Notes |
|---|---|---|
| Short description | 80 characters | Shown on the listing page. |
| Title | 30 characters | Google: "Your app title must be 30 characters or less." |
| Full description | 4,000 characters | Use the counter in the console as the final limit. |

Keyword-field separators and whether the description is indexed for search are not confirmed by the pages checked for this skill. Verify both in the current Apple and Google help pages before you rely on them.

### Keyword research

1. **Seed list**: features, use cases, competitor names, problem words.
2. **Expand**: use the store search autocomplete in each market.
3. **Validate**: check volume and difficulty with a third-party tool (for example AppTweak, Sensor Tower, AppFollow). Their numbers are estimates; record which tool and date.
4. **Prioritize**: score each keyword by your own rule (for example relevance first, then volume, then difficulty). No published formula exists for store ranking.
5. **Map**: assign each keyword to one metadata field. Avoid repeating a word across fields when the field has no room for it.

**Placement guide:**

```
App Store (iOS):
- App Name: primary keyword plus brand, readable as a phrase
- Subtitle: supporting keywords and the value proposition
- Keywords (100 bytes): remaining keywords, no app or company names,
  no competitor brands
- Promotional Text: campaign or launch message (not indexed as keywords)

Google Play:
- Title: primary keyword plus brand
- Short description (80 characters): key features with keywords
- Full description: natural usage of keywords and features, written for people
```

### Store listing creative assets

Screenshots usually affect conversion more than copy does. Practices used in this skill (heuristics, not store requirements):
- Put the strongest value props in the first three screenshots, which show without scrolling.
- One message per screenshot: a feature plus its benefit, with large readable overlay text.
- Sequence: hero shot, core feature, differentiator, secondary feature, social proof.

Preview video: check the current length and format limits in App Store Connect and Play Console before you produce one. Open with the most useful moment, not a long intro.

Icon: keep one focal element and avoid small text. Test icon variants with the store test tools below.

### A/B testing store listings

**Apple Product Page Optimization** (App Store Connect): a test can include up to three treatments, and can change app icons, screenshots and app preview videos. It runs for up to 90 days or until you stop it. The Apple page checked does not list title or subtitle as testable, so do not plan a title test there.

**Google Play store listing experiments** (Play Console): each experiment tests up to 2 variants against the current listing. A default graphics experiment covers the icon, feature graphic and screenshots; a localized experiment also covers descriptions. You can run one default graphics experiment or up to five localized experiments at once, and an experiment stops automatically after 6 months. The help page lists no testable video and no fixed minimum duration; the console shows the time and installs needed for a significant result.

Test order (practice, not a store rule): screenshots, then icon, then the short description (Google Play localized experiments) or, on Apple, the preview video. Decide the success metric and stopping rule before the test starts.

### Ratings and reviews

Star ratings matter for conversion, but no published effect size is confirmed for this skill, so track your own before-and-after data.

**In-app review prompts**: use the native review API (StoreKit on iOS, the Play In-App Review API on Android). Apple shows the system prompt at most three times in a 365-day period and decides when it appears, so do not build a timer or loop that expects it every time. Before you add any sentiment gate ("Are you enjoying the app?") that routes unhappy users elsewhere, check the current App Review Guidelines and the Google Play policy on review prompts, because the rules on this are not confirmed here.

**Responding**: reply to negative reviews with the specific fix or next step. Keep replies factual and avoid arguing.

### Localization

Localizing store metadata is usually cheaper than localizing the app, and each locale needs its own keyword research. Direct translation often misses the terms people search for in that market. Choose target markets from your own data (installs, competition, revenue per user) rather than a fixed list.

### Monitoring

Track weekly: keyword rankings for your target terms, category rank, impressions and product-page views from the store consoles, page-view-to-install rate, Day 1 retention, crash rate, and rating trend. Set baselines from your own data. Industry benchmarks quoted without a source are not used here.

## Examples

### Optimize an iOS listing for keyword ranking

```prompt
Our meditation app "ZenFlow" has 2,000 daily downloads and a 22% page-view-to-install rate. We rank #45 for "meditation" and #78 for "sleep sounds". Propose a new App Name, Subtitle and 100-byte Keywords field. Do not repeat "ZenFlow" or the company name in Keywords, and list the keywords you dropped and why.
```

Expected result: three proposed fields with byte counts for the Keywords value, a table mapping each keyword to one field, and a note of which terms need a volume check in a keyword tool before they are kept.

### Plan a Google Play localization

```prompt
Our fitness app has 100K downloads in the US. Pick three expansion markets from our analytics export (installs, competition, revenue per user), then draft a localized short description (80 characters maximum) and title for each, with keywords researched in that language.
```

Expected result: one row per market with the chosen title and short description, the character count of each, and the keyword source for each term.

### Design a screenshot test on Google Play

```prompt
Our productivity app's screenshots are eight months old and page-view-to-install fell from 31% to 28%. Draft three screenshot variants for a Play Console store listing experiment. For each, give the message, the visual approach and the metric to read. Check the experiment's variant and duration limits in the Play Console before you set the test length.
```

Expected result: three variant briefs, each with one message and one metric, and a stopping rule that matches the Play Console limits you confirmed.

## Guidelines

- Use the character or byte limit shown in each console field; do not exceed it.
- Do not put competitor or other-app names in the Apple Keywords field or in any metadata; Apple's guidance forbids other apps' and companies' names there.
- Do not repeat words across fields without a reason; spend the limited space on new terms.
- Refresh screenshots and metadata periodically, and check conversion before and after each change.
- Do not show the review prompt on a schedule you invent; let the native API decide.
- Keep replies to reviews specific and factual.
- Track keyword rankings weekly and change metadata only when you can attribute the change.
