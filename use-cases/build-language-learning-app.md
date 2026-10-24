---
title: "Build a Language Learning App with Spaced Repetition and AI Conversation"
slug: build-language-learning-app
description: "Build a niche language learning app (Business Spanish, Medical Japanese, Legal French) with SM-2 spaced repetition, an AI conversation partner via Claude, speech-based pronunciation checks, and XP progression."
skills: [anthropic-sdk, assemblyai, prisma]
category: development
difficulty: advanced
time_estimate: "14 hours"
tags: [language-learning, spaced-repetition, ai-conversation, speech, education, gamification]
---

# Build a Language Learning App with Spaced Repetition and AI Conversation

## The Problem

You are a developer who speaks 2.5 languages and thinks Duolingo is too gamified, Anki too ugly, and tutoring marketplaces too expensive. Your niche is professional language learning: Business Spanish, Medical Japanese, Legal French. You want deep vocabulary with real conversation practice, not cartoon owls.

## The Solution

Combine three skills in a TypeScript backend:

- **prisma** stores users, vocabulary cards and per-user review state in PostgreSQL.
- **anthropic-sdk** powers the conversation partner and the grammar exercises through Claude.
- **assemblyai** transcribes the learner's recorded speech, so you can check whether a recognizer understood the target sentence.

Scheduling uses the SM-2 spaced repetition algorithm, written out in full below because it is only a few lines.

## Step-by-Step Walkthrough

### Step 1: Set Up the Project

```bash
mkdir lingo && cd lingo && npm init -y
npm install @prisma/client@7 @prisma/adapter-pg@7 pg @anthropic-ai/sdk assemblyai dotenv
npm install -D prisma@7 typescript @types/node @types/pg
npx prisma init --datasource-provider postgresql
export ANTHROPIC_API_KEY=... ASSEMBLYAI_API_KEY=...   # keys from the two consoles, never committed
```

The `@7` pins matter: the `latest` tag of the `prisma` CLI now points at a Prisma 8 release candidate whose `init` has no `--datasource-provider` flag. Set `DATABASE_URL` in `.env` to a Postgres instance listening on `127.0.0.1`. Prisma 7 no longer reads the connection string from `schema.prisma`: `prisma init` creates a config file (`prisma.config.ts`; the 7.10 CLI wrote `prisma7.config.ts` here, so rename it if you see that name) with `datasource: { url: process.env["DATABASE_URL"] }`, and the client connects through a driver adapter, as in `lib/prisma.ts` below.

### Step 2: Define the Schema

Replace the generated `prisma/schema.prisma`, then run `npx prisma migrate dev --name init`. Add `topic`, `xpEarned` and timestamps to the session model as your UI needs them.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id             String                @id @default(cuid())
  email          String                @unique
  name           String
  nativeLanguage String                @default("en")
  targetLanguage String                @default("es")
  currentXP      Int                   @default(0)
  totalXP        Int                   @default(0)
  level          String                @default("A1") // A1 A2 B1 B2 C1 C2
  cards          UserCard[]
  sessions       ConversationSession[]
}

model VocabCard {
  id                 String     @id @default(cuid())
  language           String     // "es", "ja", "fr"
  niche              String?    // "business", "medical", "legal"
  word               String
  translation        String
  exampleSentence    String?
  userCards          UserCard[]
}

model UserCard {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  cardId      String
  card        VocabCard @relation(fields: [cardId], references: [id])
  repetitions Int       @default(0)
  easeFactor  Float     @default(2.5)
  interval    Int       @default(0) // days
  nextReview  DateTime  @default(now())
  status      String    @default("new") // new | learning | review | mastered

  @@unique([userId, cardId])
  @@index([userId, nextReview])
}

model ConversationSession {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  scenario  String?  // "job_interview", "medical_appointment"
  messages  Json     // array of {role, content}
}
```

```typescript
// lib/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter })
```

### Step 3: Schedule Reviews with SM-2

SM-2 (SuperMemo, 1990) gives each card its own interval. After a recall graded 3 or higher the interval grows to 1 day, then 6 days, then `interval * easeFactor`. Grades run from 0 to 5; below 3 is a failed recall, which restarts the intervals but leaves the ease factor alone, and the ease factor never drops below 1.3.

```typescript
// lib/sm2.ts
import { prisma } from './prisma'

export interface SM2State {
  repetitions: number
  easeFactor: number
  interval: number // days
}

export type Quality = 0 | 1 | 2 | 3 | 4 | 5

// SuperMemo-2: https://super-memory.com/english/ol/sm2.htm
export function sm2(state: SM2State, quality: Quality): SM2State {
  if (quality < 3) {
    return { repetitions: 0, easeFactor: state.easeFactor, interval: 1 }
  }
  const interval =
    state.repetitions === 0 ? 1 : state.repetitions === 1 ? 6 : Math.round(state.interval * state.easeFactor)
  const easeFactor = Math.max(
    1.3,
    state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  )
  return { repetitions: state.repetitions + 1, easeFactor, interval }
}

export async function reviewCard(userId: string, cardId: string, quality: Quality) {
  const where = { userId_cardId: { userId, cardId } }
  const userCard = await prisma.userCard.findUnique({ where })
  if (!userCard) throw new Error('Card not found')

  const next = sm2(userCard, quality)
  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + next.interval)

  const xpGained = quality >= 4 ? 10 : quality === 3 ? 5 : 2
  const status = next.repetitions >= 5 ? 'mastered' : next.repetitions >= 2 ? 'review' : 'learning'

  await prisma.$transaction([
    prisma.userCard.update({
      where,
      data: { ...next, nextReview, status },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { currentXP: { increment: xpGained }, totalXP: { increment: xpGained } },
    }),
  ])
  return { nextReview, xpGained, status }
}

export function getDueCards(userId: string, limit = 20) {
  return prisma.userCard.findMany({
    where: { userId, nextReview: { lte: new Date() } },
    include: { card: true },
    orderBy: { nextReview: 'asc' },
    take: limit,
  })
}
```

### Step 4: Add the AI Conversation Partner

Each scenario is a system prompt. The reply stays in character, and a final `Tip:` line carries the grammar correction, which the app splits off and shows separately. Check the current model IDs in Anthropic's model overview before shipping, as they change.

```typescript
// lib/conversation.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic() // reads ANTHROPIC_API_KEY
const MODEL = 'claude-sonnet-5-5'

const SCENARIOS = {
  job_interview: 'You are an HR manager interviewing the user for a job at a Madrid tech company.',
  medical_appointment: 'You are a doctor in Madrid. The user is a patient describing symptoms.',
}

export async function chat(
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  scenario: keyof typeof SCENARIOS,
  targetLanguage: string,
) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: `${SCENARIOS[scenario]}
Always reply in ${targetLanguage} and stay in character.
After your reply, add one final line starting with "Tip:" that corrects any grammar mistake
in the user's last message or suggests better phrasing. Keep it short.`,
    messages: [...history, { role: 'user', content: userMessage }],
  })

  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const tip = text.match(/^Tip: (.+)$/m)?.[1] ?? null
  const reply = text.replace(/^Tip: .+$/m, '').trim()
  return { reply, tip, outputTokens: response.usage.output_tokens }
}
```

Store each turn in `ConversationSession.messages` and pass the history back on every call, since the API is stateless.

### Step 5: Check Pronunciation with AssemblyAI

Record the learner on the client, send the audio to the backend, and compare what the recognizer heard with the target sentence. A word-level match against the recognizer's output tells you the sentence was intelligible. It does not locate individual mispronounced sounds, so present it as a clarity score.

```typescript
// lib/pronunciation.ts
import { AssemblyAI } from 'assemblyai'

const assemblyai = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean)

function lcs(a: string[], b: string[]) {
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1])
  return t[a.length][b.length]
}

// Scores how much of the target sentence a speech recognizer heard. This measures
// intelligibility, not phoneme-level accuracy.
export async function scoreSpeech(audio: Buffer, expectedText: string, language: string) {
  const transcript = await assemblyai.transcripts.transcribe({
    audio: await assemblyai.files.upload(audio),
    language_code: language, // e.g. "es", "ja", "fr"
  })
  if (transcript.status === 'error') throw new Error(transcript.error ?? 'Transcription failed')
  if (!transcript.text) return { score: 0, heard: '', feedback: 'No speech detected.' }

  const expected = words(expectedText)
  const score = Math.round((lcs(expected, words(transcript.text)) / expected.length) * 100)
  const feedback =
    score >= 90 ? 'Clear and easy to understand.'
    : score >= 70 ? `Mostly clear. We heard: "${transcript.text}".`
    : `We heard: "${transcript.text}". Listen to the native audio and try again.`
  return { score, heard: transcript.text, feedback }
}
```

### Step 6: Generate Grammar Exercises

Claude can return an exercise as JSON. Validate the shape before showing it, since the model can occasionally add prose around the object or invent an option list that lacks the answer.

```typescript
// lib/exercises.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function generateGrammarExercise(topic: string, level: string, language: string) {
  const response = await client.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Write one fill-in-the-blank ${language} grammar exercise at CEFR level ${level} about: ${topic}.
Reply with only a JSON object with the keys instruction, sentence (using ___ for the blank),
blank, options (4 strings including the blank), and explanation (in English).`,
    }],
  })
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) throw new Error('Model did not return JSON')
  const exercise = JSON.parse(json) as { instruction: string; sentence: string; blank: string; options: string[]; explanation: string }
  if (!exercise.options.includes(exercise.blank)) throw new Error('Invalid exercise, retry')
  return exercise
}
```

## Real-World Example

Ana is a nurse preparing for a posting in Madrid. She loads 300 medical Spanish cards (`niche: "medical"`), reviews the due queue for ten minutes each morning, and gets 10 XP for a grade of 4 or 5. In the evening she runs the `medical_appointment` scenario, where Claude plays a doctor and she describes symptoms. After each of her turns, the `Tip:` line points out that she wrote "yo tengo dolor en el cabeza" instead of "la cabeza". She then reads three flagged sentences aloud and sees which ones the recognizer got right.

Cards she recalls move out to 6-day and 15-day intervals, and the ones she fails come back the next day.

## Related Skills

- [anthropic-sdk](../skills/anthropic-sdk/SKILL.md): messages, system prompts and response handling for the conversation partner
- [assemblyai](../skills/assemblyai/SKILL.md): transcription for the pronunciation check
- [prisma](../skills/prisma/SKILL.md): schema, migrations and queries
