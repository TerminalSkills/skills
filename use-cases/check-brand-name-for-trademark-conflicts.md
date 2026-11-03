---
title: "Check a Brand Name for Trademark Conflicts Before Launch"
slug: check-brand-name-for-trademark-conflicts
description: "Screen a product or company name against the USPTO and foreign registers, unregistered use and domains before launch, and get a risk-rated report to act on or hand to an attorney."
skills:
  - trademark-clearance
  - playwright-mcp
  - web-research
category: business
tags:
  - trademark
  - naming
  - uspto
  - brand-protection
  - startup
---

# Check a Brand Name for Trademark Conflicts Before Launch

## The Problem

A four-person team has picked "Lightbeam" for its analytics dashboard. The logo is drawn, the domain shortlist is open in a tab, and the landing page goes live in two weeks. Nobody has checked whether the name belongs to someone else. A quick Google search shows nothing alarming, so the team assumes it is fine.

Google is the wrong test. The USPTO refuses an application when the mark is confusingly similar to a registered mark for related goods, and that includes misspellings and marks that only sound the same. In the U.S., a business that uses a name without registering it can still stop a newcomer in its area. A cease-and-desist letter three months after launch means a rebrand: new domain, new logo, new app store listing, reprinted packaging, and lost search rankings. A trademark attorney's full clearance costs real money, and most teams skip it at the naming stage, when ten names are still on the list.

## The Solution

Run a knockout screening with the **trademark-clearance** skill before the name is committed anywhere. The agent searches the USPTO register for exact, phonetic and spelling variants, and reads each serious hit in TSDR. It also checks TMview and the WIPO Global Brand Database for the markets on the roadmap, looks for unregistered use and domains, rates each conflict with the du Pont factors, and writes a dated report. **playwright-mcp** drives the USPTO, TMview and WIPO search sites, which are browser apps with no keyless public API. **web-research** covers the common-law search for unregistered businesses using the name.

The output is a screening, not a legal opinion. It removes the names that would fail, so the attorney's time goes to the one or two finalists.

## Step-by-Step Walkthrough

### Step 1: Describe the name and the business

> We want to call our product "Lightbeam". It is a hosted analytics dashboard for e-commerce stores, sold by subscription in the U.S. now, and in the EU and UK next year. The company is a Delaware C-corp. Check whether the name is safe to use and register.

The agent maps the goods to Nice classes 9 (downloadable software) and 42 (SaaS). It notes that "Lightbeam" is arbitrary or suggestive for dashboards, so a descriptiveness refusal is unlikely.

### Step 2: Search the USPTO register

The agent opens the USPTO Trademark Search system in Field tag mode and runs the variant set: the exact mark, the split form, a phonetic regex, a wider search of embedded terms across coordinated classes, the dominant word against the goods text, and dead records.

```text
CM:/l[iy]g?h?te?b[aeiy]{1,3}m{1,2}/ AND LD:true AND IC:(009 042)
CM:/.*l[iy]g?h?te?b[aeiy]{1,3}m.*/ AND LD:true AND CC:(009 042)
CM:/.*beam.*/ AND LD:true AND GS:(analytics dashboard*)
CM:/l[iy]g?h?te?b[aeiy]{1,3}m{1,2}/ AND LD:false
```

Run on 3 November 2026, the first query returned two live LIGHTBEAM registrations for software, one owned by LightBeam.ai, Inc. and one by PaperFree Corporation. It also returned LITEBEAM, owned by Ubiquiti, for antennas. The coordinated-class query added LIGHTBEAMERS in class 42. The `beam` query showed 11 live marks for analytics or dashboard software.

### Step 3: Read the records that matter

For each serious hit, the agent opens TSDR and records the status, owner, registration date and full goods text. LightBeam.ai's LIGHTBEAM is Registration 7706971, live on the Principal Register since 25 February 2025, covering software in class 9 and services in class 42.

### Step 4: Check the markets on the roadmap and unregistered use

The agent runs TMview for the EU (`EM`) and the UK, and the WIPO Global Brand Database with the phonetic strategy in classes 9 and 42. Both are first-to-file territories, so whoever files first owns the mark. It searches the web, app stores and GitHub for businesses using the name. It also checks domains over RDAP. `lightbeam.com` returns the registry's record, while `.io` has no RDAP service, so `lightbeam.io` goes to a registrar's lookup.

### Step 5: Get the report

The report has a conflict table with mark, owner, number, status, classes, goods and risk, plus a du Pont analysis of each High and Moderate hit. Here the two LIGHTBEAM registrations are identical marks for the same goods, so the recommendation is **choose another name**. The report also gives the cost of filing for the eventual name: $350 per class at the USPTO, filed in Trademark Center, and $200 more per class if the goods are written as free text instead of ID Manual entries.

## Real-World Example

A founder had already bought a domain and briefed a designer when a teammate asked whether anyone had checked the name. The agent's screening took about twenty minutes and found the LightBeam.ai registration covering the same kind of software. The founder dropped the name before the logo was finished. The team sent the agent five new candidates, and the same search set struck three of them on the first query.

The two survivors went to a trademark attorney for a full search and filing advice. The attorney's bill covered two names instead of ten. The team filed an intent-to-use application in classes 9 and 42 before announcing the product, and set a calendar reminder for the statement of use. The screening report went into the company's records with its search date, so a later investor or acquirer can see what was checked and when.

## Related Skills

- [trademark-clearance](/skills/trademark-clearance): the search syntax, du Pont analysis, report format and USPTO fees used above
- [playwright-mcp](/skills/playwright-mcp): drives the USPTO Trademark Search, TSDR, TMview and WIPO Global Brand Database pages
- [web-research](/skills/web-research): finds unregistered businesses, products and handles already using the name
- After launch, monitoring the brand for infringers and impersonators is a separate job, covered in [Automate Trademark and Brand Monitoring with AI](/use-cases/automate-trademark-and-brand-monitoring)
