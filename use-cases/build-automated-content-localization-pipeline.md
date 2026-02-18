---
title: "Build an Automated Content Localization Pipeline with AI"
slug: build-automated-content-localization-pipeline
description: "Automate translating and adapting app content for multiple locales using AI-powered workflows."
skills: [content-writer, batch-processor, data-extractor]
category: automation
tags: [i18n, localization, translation, content, automation]
---

# Build an Automated Content Localization Pipeline with AI

## The Problem

A 15-person SaaS startup is expanding into three new markets — Germany, Brazil, and Japan. The app has over 800 translation keys spread across JSON locale files, marketing pages, and email templates. The team has been manually sending spreadsheets to freelance translators, waiting days for responses, then copy-pasting translations back into code. Keys get missed, context is lost, and the Brazilian Portuguese translations sometimes read like they were written for Portugal. Every feature release means another round of translation delays.

## The Solution

Use the **content-writer** skill to generate contextually accurate translations, **batch-processor** to handle hundreds of keys in a single run, and **data-extractor** to pull translatable strings from source files automatically.

```bash
npx terminal-skills install content-writer batch-processor data-extractor
```

## Step-by-Step Walkthrough

### 1. Extract all translatable strings

Tell the agent where your locale files live:

```text
Scan ./src and ./emails for all translatable strings. Extract every key from en.json and find any hardcoded English strings in React components that should be externalized.
```

### 2. The agent maps your content

The agent parses your JSON locale files and scans JSX files for hardcoded text. It produces a report:

```text
Locale file: src/locales/en.json — 847 keys
Hardcoded strings found: 23 across 14 components
Email templates: 6 files with translatable blocks
Total strings to translate: 912
```

### 3. Generate translations with cultural context

Provide target locales and context:

```text
Translate all 912 strings to de-DE, pt-BR, and ja-JP. This is a project management SaaS app. Use informal tone for pt-BR, formal Sie-form for de-DE. Keep UI strings under 40 characters where the English is under 30. For date and number formats, use each locale's native convention.
```

### 4. The agent translates in batches

The batch-processor handles all 912 strings across three locales, respecting character limits and cultural conventions:

```text
Processing de-DE: 912/912 complete
Processing pt-BR: 912/912 complete
Processing ja-JP: 912/912 complete

Locale-specific adaptations applied:
- de-DE: formal "Sie" form, comma as decimal separator, DD.MM.YYYY dates
- pt-BR: informal "você" form, comma as decimal separator, DD/MM/YYYY dates
- ja-JP: polite desu/masu form, full-width numbers in labels, YYYY年MM月DD日 dates

Warnings:
- 12 strings exceeded character limit in de-DE (German compounds are longer)
- 3 strings in ja-JP need review: ambiguous context for "board" (bulletin board vs. project board)
- 2 strings in pt-BR flagged: idioms that don't translate directly

Output: src/locales/de-DE.json, src/locales/pt-BR.json, src/locales/ja-JP.json
```

### 5. Handle pluralization and gender rules

Different languages have different pluralization rules. Ask the agent to handle this:

```text
Check all translated strings for pluralization issues. German has different plural forms than English, Japanese doesn't pluralize nouns, and Portuguese has gendered nouns. Update the locale files to use ICU MessageFormat where needed.
```

```text
Pluralization fixes applied:
- de-DE: 34 strings updated to handle German plural forms
- pt-BR: 18 strings updated for gendered variants (o projeto/a tarefa)
- ja-JP: 12 strings simplified (removed unnecessary plural markers)
- Generated ICU MessageFormat patterns for all count-dependent strings
```

### 6. Review and validate

Ask the agent to check consistency:

```text
Verify that all three locale files have the same keys as en.json. Flag any translations that are identical to the English original, suspiciously short, or containing untranslated English words embedded in otherwise translated strings.
```

```text
Validation Results:
- de-DE: 912/912 keys present ✓, 0 identical to English, 2 embedded English words flagged
- pt-BR: 912/912 keys present ✓, 1 identical to English ("OK" button — acceptable), 0 issues
- ja-JP: 912/912 keys present ✓, 5 strings flagged for human review (technical terms)

Flagged for review:
- ja-JP: "dashboard" left untranslated (common practice in Japanese tech UI — approve or translate as ダッシュボード)
- ja-JP: "sprint" left untranslated (approve or translate as スプリント)
- de-DE: "Setup" embedded in German sentence (should be "Einrichtung")
```

## Real-World Example

Dani, a frontend developer at a 15-person SaaS startup, needs to ship German, Brazilian Portuguese, and Japanese versions before a trade show in six weeks. Previously, localization took three weeks of back-and-forth with translators.

1. Dani asks the agent to extract all strings from the codebase and locale files — the agent finds 912 translatable strings in under a minute
2. The agent generates all three locale files with culturally appropriate translations, flagging 15 strings that need human review due to ambiguous context
3. Dani reviews the flagged strings, approves 12, and corrects 3 Japanese translations with help from a native-speaking colleague
4. The agent externalizes the 23 hardcoded strings it found, creating proper i18n keys and updating the components
5. Total time: 4 hours instead of 3 weeks — and every future feature release can reuse the same pipeline for incremental translations
