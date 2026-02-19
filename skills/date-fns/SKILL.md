---
name: date-fns
description: >-
  Work with dates in JavaScript using date-fns. Use when a user asks to format
  dates, calculate date differences, parse date strings, add/subtract time, or
  handle timezones in JavaScript.
license: Apache-2.0
compatibility: 'Any JavaScript/TypeScript environment'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: utilities
  tags:
    - date-fns
    - dates
    - formatting
    - time
    - javascript
---

# date-fns

## Overview

date-fns is a modular date utility library — tree-shakeable (only import what you use), immutable (doesn't mutate dates), and supports 60+ locales. The modern alternative to Moment.js.

## Instructions

### Step 1: Formatting

```typescript
import { format, formatDistance, formatRelative } from 'date-fns'

format(new Date(), 'yyyy-MM-dd')               // "2025-03-15"
format(new Date(), 'MMMM do, yyyy h:mm a')     // "March 15th, 2025 3:30 PM"
format(new Date(), "EEEE 'at' h:mm a")         // "Saturday at 3:30 PM"

// Relative time
formatDistance(new Date(2025, 2, 10), new Date(), { addSuffix: true })    // "5 days ago"
formatRelative(new Date(2025, 2, 14), new Date())                         // "yesterday at 3:30 PM"
```

### Step 2: Calculations

```typescript
import { addDays, subMonths, differenceInDays, isAfter, isBefore, startOfMonth, endOfMonth } from 'date-fns'

const nextWeek = addDays(new Date(), 7)
const lastMonth = subMonths(new Date(), 1)
const daysBetween = differenceInDays(new Date(2025, 11, 31), new Date())

const monthStart = startOfMonth(new Date())
const monthEnd = endOfMonth(new Date())

if (isAfter(deadline, new Date())) {
  console.log('Still time!')
}
```

### Step 3: Parsing

```typescript
import { parse, parseISO, isValid } from 'date-fns'

const date = parseISO('2025-03-15T10:00:00Z')
const custom = parse('15/03/2025', 'dd/MM/yyyy', new Date())

if (isValid(date)) {
  console.log('Valid date')
}
```

### Step 4: Locales

```typescript
import { format } from 'date-fns'
import { uk } from 'date-fns/locale'

format(new Date(), "d MMMM yyyy, EEEE", { locale: uk })    // "15 березня 2025, субота"
```

## Guidelines

- date-fns is tree-shakeable — import individual functions, not the entire library.
- All functions are pure (don't mutate input dates) — safe for React state.
- For timezone handling, use `date-fns-tz` companion library.
- If you need minimal bundle size, consider Temporal (upcoming native JS API) or dayjs (2KB).
