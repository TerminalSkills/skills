---
title: "Build an Anki-Alternative Flashcard App with AI Card Generation"
description: "Build a modern flashcard app with SM-2 spaced repetition, AI card generation from text/notes, keyboard-driven study sessions, and Anki import/export support."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "8 hours"
tags: [flashcards, spaced-repetition, education, ai, anki, study, productivity]
---

# Build an Anki-Alternative Flashcard App with AI Card Generation

You're a med student. You have 40,000 Anki cards and an app that hasn't been meaningfully updated since 2006. The sync is unreliable, the UI is from 2008, and making cards takes forever. Build the flashcard app Anki should be — modern UI, AI card generation, keyboard shortcuts, and clean sync.

## What You'll Build

- Decks with cards: front/back, rich text, images, tags
- SM-2 spaced repetition scheduling
- AI card generation: paste notes → Claude creates Q&A pairs
- Keyboard-driven study sessions with rating shortcuts
- Export to Anki `.apkg` format, import from Anki decks

## Schema

```typescript
// prisma/schema.prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  name        String
  decks       Deck[]
  studySessions StudySession[]
  createdAt   DateTime @default(now())
}

model Deck {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  name        String
  description String?
  color       String   @default("#6366f1")
  isPublic    Boolean  @default(false)
  cards       Card[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
}

model Card {
  id          String   @id @default(cuid())
  deckId      String
  deck        Deck     @relation(fields: [deckId], references: [id], onDelete: Cascade)
  front       String   // markdown supported
  back        String   // markdown supported
  tags        String[] @default([])
  imageUrl    String?
  ankiId      String?  // for Anki sync
  reviews     CardReview[]
  // SM-2 state
  repetitions Int      @default(0)
  easeFactor  Float    @default(2.5)
  interval    Int      @default(1)
  nextReview  DateTime @default(now())
  status      String   @default("new") // new | learning | review | mastered
  createdAt   DateTime @default(now())

  @@index([deckId, nextReview])
  @@index([deckId, status])
}

model CardReview {
  id        String   @id @default(cuid())
  cardId    String
  card      Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  quality   Int      // 0-5 (SM-2 quality rating)
  timeMs    Int?     // time taken to answer in milliseconds
  sessionId String?
  createdAt DateTime @default(now())
}

model StudySession {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  deckId      String
  cardsStudied Int     @default(0)
  correctCount Int     @default(0)
  duration    Int?     // seconds
  createdAt   DateTime @default(now())
}
```

## SM-2 Implementation

```typescript
// lib/sm2.ts
type Quality = 0 | 1 | 2 | 3 | 4 | 5

export function calculateNextReview(
  repetitions: number,
  easeFactor: number,
  interval: number,
  quality: Quality
) {
  let newRep = repetitions
  let newEF = easeFactor
  let newInterval = interval

  if (quality < 3) {
    newRep = 0
    newInterval = 1
  } else {
    if (newRep === 0) newInterval = 1
    else if (newRep === 1) newInterval = 6
    else newInterval = Math.round(newInterval * newEF)
    newRep++
  }

  newEF = Math.max(1.3, newEF + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + newInterval)

  return {
    repetitions: newRep,
    easeFactor: newEF,
    interval: newInterval,
    nextReview,
    status: newRep >= 5 ? 'mastered' : newRep >= 2 ? 'review' : 'learning',
  }
}

export async function submitReview(cardId: string, quality: Quality, timeMs?: number) {
  const card = await prisma.card.findUnique({ where: { id: cardId } })
  if (!card) throw new Error('Card not found')

  const next = calculateNextReview(card.repetitions, card.easeFactor, card.interval, quality)

  await prisma.$transaction([
    prisma.card.update({
      where: { id: cardId },
      data: {
        repetitions: next.repetitions,
        easeFactor: next.easeFactor,
        interval: next.interval,
        nextReview: next.nextReview,
        status: next.status,
      },
    }),
    prisma.cardReview.create({
      data: { cardId, quality, timeMs },
    }),
  ])

  return next
}
```

## AI Card Generation from Text

```typescript
// lib/ai-cards.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function generateCards(
  text: string,
  deckId: string,
  options: { count?: number; style?: 'basic' | 'cloze' | 'definition' } = {}
) {
  const { count = 10, style = 'basic' } = options

  const styleInstructions = {
    basic: 'Create question/answer pairs where the question tests understanding, not memorization.',
    cloze: 'Create fill-in-the-blank cards. Use [BLANK] for the missing word.',
    definition: 'Create term/definition pairs. Front = term, Back = concise definition.',
  }

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Generate exactly ${count} flashcards from this text. Style: ${styleInstructions[style]}

Text:
${text}

Return JSON array:
[
  {
    "front": "What is the role of ATP synthase?",
    "back": "ATP synthase is an enzyme that creates ATP from ADP and inorganic phosphate using the proton gradient across the mitochondrial membrane.",
    "tags": ["biochemistry", "cellular-respiration"]
  }
]

Only return the JSON array, no other text.`,
    }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const cards = JSON.parse(content.match(/\[[\s\S]+\]/)?.[0] || '[]')

  // Batch insert
  await prisma.card.createMany({
    data: cards.map((card: any) => ({
      deckId,
      front: card.front,
      back: card.back,
      tags: card.tags || [],
    })),
  })

  return cards
}
```

## Study Session API

```typescript
// app/api/study/[deckId]/route.ts
export async function GET(req: Request, { params }: { params: { deckId: string } }) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '20')

  const dueCards = await prisma.card.findMany({
    where: {
      deckId: params.deckId,
      nextReview: { lte: new Date() },
    },
    orderBy: [
      { status: 'asc' }, // new cards first
      { nextReview: 'asc' },
    ],
    take: limit,
    select: {
      id: true, front: true, back: true, tags: true, imageUrl: true, status: true,
    },
  })

  const stats = await prisma.card.groupBy({
    by: ['status'],
    where: { deckId: params.deckId },
    _count: { id: true },
  })

  return Response.json({ cards: dueCards, stats, dueCount: dueCards.length })
}

export async function POST(req: Request, { params }: { params: { deckId: string } }) {
  const { cardId, quality, timeMs, userId } = await req.json()

  const result = await submitReview(cardId, quality, timeMs)

  // Update session stats
  await prisma.studySession.upsert({
    where: { /* today's session */ },
    update: {
      cardsStudied: { increment: 1 },
      correctCount: { increment: quality >= 3 ? 1 : 0 },
    },
    create: {
      userId,
      deckId: params.deckId,
      cardsStudied: 1,
      correctCount: quality >= 3 ? 1 : 0,
    },
  })

  return Response.json(result)
}
```

## Anki Export

```typescript
// lib/anki-export.ts
// Anki .apkg is a zip with collection.anki2 (SQLite) and media files
import JSZip from 'jszip'
import Database from 'better-sqlite3'
import { tmpdir } from 'os'
import { join } from 'path'

export async function exportToAnki(deckId: string): Promise<Buffer> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { cards: true },
  })
  if (!deck) throw new Error('Deck not found')

  const dbPath = join(tmpdir(), `anki-${Date.now()}.db`)
  const db = new Database(dbPath)

  // Minimal Anki schema
  db.exec(`
    CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT, mid INTEGER, mod INTEGER, tags TEXT, flds TEXT, sfld TEXT, csum INTEGER, flags INTEGER, data TEXT);
    CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER, mod INTEGER, usn INTEGER, type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER, left INTEGER, odue INTEGER, odid INTEGER, flags INTEGER, data TEXT);
    CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT, conf TEXT, extconf TEXT);
  `)

  const now = Math.floor(Date.now() / 1000)
  const deckId_num = Date.now()

  db.prepare('INSERT INTO decks VALUES (?, ?, ?, ?)').run(deckId_num, deck.name, '{}', '{}')

  for (const card of deck.cards) {
    const noteId = Date.now() + Math.random() * 1000
    db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      noteId, card.id, 1, now, card.tags.join(' '), `${card.front}\x1f${card.back}`, card.front, 0, 0, ''
    )
    db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      noteId + 1, noteId, deckId_num, 0, now, -1, 0, 0, 0, card.interval, Math.round(card.easeFactor * 1000), card.repetitions, 0, 0, 0, 0, 0, ''
    )
  }

  db.close()

  const zip = new JSZip()
  const { readFileSync } = await import('fs')
  zip.file('collection.anki2', readFileSync(dbPath))
  zip.file('media', '{}')

  return zip.generateAsync({ type: 'nodebuffer' })
}
```

## Key Features Summary

- **SM-2 algorithm**: scientifically proven card scheduling
- **AI generation**: paste lecture notes, get 10 quality cards in seconds
- **Keyboard shortcuts**: 1-4 rating keys, space to flip, `n` for next
- **Anki compatibility**: import existing decks, export back when needed
- **Study analytics**: accuracy rate, average time per card, mastery progress

## Extensions to Consider

- **Image occlusion**: cover parts of anatomical diagrams
- **Cloze deletion**: highlight text to auto-create fill-in cards
- **Public deck sharing**: browse community decks by subject
- **Audio cards**: text-to-speech for language learning decks
- **Mobile PWA**: offline-capable, installable on phone home screen
