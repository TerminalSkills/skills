---
title: "Build a Language Learning App with Spaced Repetition and AI Conversation"
description: "Build a niche language learning app — Business Spanish, Medical Japanese, Legal French — with SM-2 spaced repetition, AI conversation partner via Claude, pronunciation feedback, and XP progression."
skills: [anthropic-sdk, assemblyai, prisma]
difficulty: advanced
time_estimate: "14 hours"
tags: [language-learning, spaced-repetition, ai-conversation, speech, education, gamification]
---

# Build a Language Learning App with Spaced Repetition and AI Conversation

You're a developer who speaks 2.5 languages and thinks Duolingo is too gamified, Anki too ugly, and italki too expensive. Your niche: professional language learning. Business Spanish. Medical Japanese. Legal French. You want deep vocabulary with real conversation practice — not cartoon owls.

## What You'll Build

- SM-2 spaced repetition algorithm for vocabulary scheduling
- AI conversation partner using Claude (text + voice mode)
- Grammar exercises with real-time feedback
- Progress system: words learned, daily XP, CEFR level
- Pronunciation scoring via AssemblyAI audio analysis

## Schema

```typescript
// prisma/schema.prisma
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  name         String
  nativeLanguage String   @default("en")
  targetLanguage String   @default("es")
  dailyGoalXP  Int        @default(50)
  currentXP    Int        @default(0)
  totalXP      Int        @default(0)
  level        String     @default("A1") // A1 A2 B1 B2 C1 C2
  streak       Int        @default(0)
  lastStudied  DateTime?
  cards        UserCard[]
  sessions     ConversationSession[]
  createdAt    DateTime   @default(now())
}

model VocabCard {
  id           String     @id @default(cuid())
  language     String     // "es", "ja", "fr"
  niche        String?    // "business", "medical", "legal"
  word         String
  translation  String
  pronunciation String?   // IPA or phonetic
  exampleSentence String?
  exampleTranslation String?
  audioUrl     String?
  difficulty   Int        @default(1) // 1-5
  userCards    UserCard[]
}

model UserCard {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  cardId       String
  card         VocabCard @relation(fields: [cardId], references: [id])
  // SM-2 fields
  repetitions  Int       @default(0)
  easeFactor   Float     @default(2.5)
  interval     Int       @default(1) // days
  nextReview   DateTime  @default(now())
  lastReview   DateTime?
  status       String    @default("new") // new | learning | review | mastered

  @@unique([userId, cardId])
  @@index([userId, nextReview])
}

model ConversationSession {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  topic        String
  scenario     String?   // "job_interview", "medical_appointment"
  messages     Json      // array of {role, content, timestamp}
  duration     Int?      // seconds
  xpEarned     Int       @default(0)
  createdAt    DateTime  @default(now())
}
```

## SM-2 Spaced Repetition Algorithm

```typescript
// lib/sm2.ts
export interface SM2State {
  repetitions: number
  easeFactor: number
  interval: number
}

export type Quality = 0 | 1 | 2 | 3 | 4 | 5
// 0-1: complete failure, 2: incorrect but easy to recall
// 3: correct with difficulty, 4: correct, 5: perfect

export function sm2(state: SM2State, quality: Quality): SM2State & { nextInterval: number } {
  let { repetitions, easeFactor, interval } = state

  if (quality < 3) {
    // Failed: reset
    repetitions = 0
    interval = 1
  } else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * easeFactor)

    repetitions++
  }

  // Update ease factor (minimum 1.3)
  easeFactor = Math.max(
    1.3,
    easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  )

  return { repetitions, easeFactor, interval, nextInterval: interval }
}

export async function reviewCard(userId: string, cardId: string, quality: Quality) {
  const userCard = await prisma.userCard.findUnique({
    where: { userId_cardId: { userId, cardId } },
  })

  if (!userCard) throw new Error('Card not found')

  const result = sm2(
    { repetitions: userCard.repetitions, easeFactor: userCard.easeFactor, interval: userCard.interval },
    quality
  )

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + result.nextInterval)

  const xpGained = quality >= 4 ? 10 : quality >= 3 ? 5 : 2
  const newStatus = result.repetitions >= 5 ? 'mastered' : result.repetitions >= 2 ? 'review' : 'learning'

  await Promise.all([
    prisma.userCard.update({
      where: { userId_cardId: { userId, cardId } },
      data: {
        repetitions: result.repetitions,
        easeFactor: result.easeFactor,
        interval: result.nextInterval,
        nextReview,
        lastReview: new Date(),
        status: newStatus,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { currentXP: { increment: xpGained }, totalXP: { increment: xpGained } },
    }),
  ])

  return { nextReview, xpGained, status: newStatus }
}

export async function getDueCards(userId: string, limit = 20) {
  return prisma.userCard.findMany({
    where: { userId, nextReview: { lte: new Date() } },
    include: { card: true },
    orderBy: { nextReview: 'asc' },
    take: limit,
  })
}
```

## AI Conversation Partner with Claude

```typescript
// lib/conversation.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const SCENARIOS = {
  job_interview: 'You are a Spanish-speaking HR manager conducting a job interview at a Madrid tech company.',
  medical_appointment: 'You are a Spanish doctor. The user is a patient describing symptoms.',
  business_meeting: 'You are a Spanish business partner in a contract negotiation meeting.',
  restaurant: 'You are a waiter at a tapas bar in Barcelona.',
}

export async function chat(
  sessionId: string,
  userMessage: string,
  history: { role: string; content: string }[],
  scenario: keyof typeof SCENARIOS,
  targetLanguage: string
) {
  const systemPrompt = `${SCENARIOS[scenario]}

Language: ${targetLanguage}. Always respond in ${targetLanguage}.
After each response, add a brief line starting with "💡 Tip:" to correct any grammar mistakes or suggest better phrasing from the user's last message. Keep tips concise.
Stay in character. Make the conversation feel natural and educational.`

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : ''
  
  // Extract tip if present
  const tipMatch = content.match(/💡 Tip: (.+)/)
  const reply = content.replace(/💡 Tip: .+/, '').trim()

  return { reply, tip: tipMatch?.[1] || null, tokensUsed: response.usage.output_tokens }
}
```

## Pronunciation Scoring with AssemblyAI

```typescript
// lib/pronunciation.ts
import { AssemblyAI } from 'assemblyai'

const assemblyai = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })

export async function scorePronunciation(
  audioBlob: Buffer,
  expectedText: string,
  language: string
): Promise<{ score: number; transcribed: string; feedback: string }> {
  // Upload audio
  const uploadUrl = await assemblyai.files.upload(audioBlob)

  // Transcribe with language detection
  const transcript = await assemblyai.transcripts.transcribePolled({
    audio_url: uploadUrl,
    language_code: language,
  })

  if (!transcript.text) return { score: 0, transcribed: '', feedback: 'Could not transcribe audio.' }

  // Simple scoring: word-level match ratio
  const expected = expectedText.toLowerCase().split(/\s+/)
  const spoken = transcript.text.toLowerCase().split(/\s+/)
  const matchCount = expected.filter((w, i) => spoken[i] === w).length
  const score = Math.round((matchCount / expected.length) * 100)

  let feedback: string
  if (score >= 90) feedback = 'Excellent pronunciation! 🎉'
  else if (score >= 70) feedback = `Good effort! You said: "${transcript.text}". Focus on the highlighted words.`
  else feedback = `Keep practicing! You said: "${transcript.text}". Listen to the native audio again.`

  return { score, transcribed: transcript.text, feedback }
}
```

## Grammar Exercise Generator

```typescript
// lib/exercises.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function generateGrammarExercise(
  topic: string,
  level: string,
  language: string
) {
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Generate a grammar exercise for ${language} language learners at ${level} level about: ${topic}.

Return JSON with:
{
  "instruction": "Fill in the blank...",
  "sentence": "Yo ___ a la tienda ayer.",
  "blank": "fui",
  "options": ["fui", "voy", "iré", "iba"],
  "explanation": "Preterite tense for completed past actions...",
  "grammarRule": "ser vs ir in preterite"
}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return JSON.parse(text.match(/\{[\s\S]+\}/)?.[0] || '{}')
}
```

## Key Features Summary

- **SM-2 algorithm**: proven spaced repetition schedules each card individually
- **AI conversation**: role-play realistic scenarios in your target language
- **Pronunciation scoring**: real speech recognition, not just mic detection
- **Grammar feedback**: inline corrections after every AI conversation turn
- **XP + CEFR leveling**: gamification that tracks real proficiency

## Extensions to Consider

- **Vocabulary mining**: paste any text, extract unknown words to your deck
- **Shadowing mode**: listen + speak simultaneously for accent training
- **Leaderboard**: compete with friends on weekly XP
- **Offline mode**: pre-download due cards for airplane study sessions
- **Streak recovery**: miss a day? earn it back with double XP weekend
