---
title: "Build a Guided Meditation App with AI-Personalized Sessions"
description: "Build a Calm alternative with AI-generated meditation scripts, ElevenLabs voice narration, mood-based personalization, background sound mixing, and streak tracking."
skills: [elevenlabs-sdk, anthropic-sdk, prisma]
difficulty: advanced
time_estimate: "12 hours"
tags: [meditation, wellness, ai, tts, audio, mindfulness, personalization, streaks]
---

# Build a Guided Meditation App with AI-Personalized Sessions

You've tried Calm. You've tried Headspace. They're fine — but they have 3 sessions on anxiety, none of them quite fit today's specific flavor of overwhelm. Build a wellness app that generates custom 10-minute meditations based on your mood, narrated in a soothing voice, with the exact ambient sounds you want.

## What You'll Build

- Session library: breathing, body scan, focus, sleep, anxiety sessions
- AI personalization: Claude generates custom meditation script based on mood input
- Voice narration: ElevenLabs TTS with configurable voice style
- Streak system: days meditated, total minutes, mood trend chart
- Background sound mixer: rain, binaural beats, white noise, forest

## Schema

```typescript
// prisma/schema.prisma
model User {
  id              String            @id @default(cuid())
  email           String            @unique
  name            String
  preferredVoice  String            @default("rachel")
  preferredSounds String[]          @default(["rain"])
  dailyGoalMins   Int               @default(10)
  timezone        String            @default("UTC")
  streak          Int               @default(0)
  longestStreak   Int               @default(0)
  totalMinutes    Int               @default(0)
  lastMeditated   DateTime?
  sessions        MeditationSession[]
  moodLogs        MoodLog[]
  createdAt       DateTime          @default(now())
}

model MeditationSession {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  title        String
  type         String   // breathing | body-scan | focus | sleep | custom
  durationMins Int
  scriptText   String?  @db.Text
  audioUrl     String?  // generated audio stored in S3/R2
  isGenerated  Boolean  @default(false) // AI-generated vs library
  moodBefore   String?
  moodAfter    String?
  completed    Boolean  @default(false)
  completedAt  DateTime?
  rating       Int?     // 1-5
  createdAt    DateTime @default(now())
}

model MoodLog {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  mood      String   // anxious | stressed | tired | neutral | good | energized
  intensity Int      @default(3) // 1-5
  notes     String?
  createdAt DateTime @default(now())
}

model SessionTemplate {
  id           String @id @default(cuid())
  title        String
  type         String
  durationMins Int
  description  String
  tags         String[]
  scriptText   String @db.Text
  isPremium    Boolean @default(false)
}
```

## AI Meditation Script Generator with Claude

```typescript
// lib/script-generator.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

interface MeditationRequest {
  mood: string
  moodIntensity: number
  durationMins: number
  type: string
  userName: string
  preferredStyle?: 'gentle' | 'focused' | 'energizing' | 'sleep'
}

export async function generateMeditationScript(req: MeditationRequest): Promise<string> {
  const styleGuides = {
    gentle: 'Use soft, warm, nurturing language. Speak slowly. Use nature imagery.',
    focused: 'Be direct and clear. Use body-awareness cues. Minimal metaphor.',
    energizing: 'Build energy gradually. Use breath retention and activation.',
    sleep: 'Progressive relaxation. Very slow pace. Descending imagery (going deeper, sinking).',
  }

  const wordCount = req.durationMins * 100 // ~100 words per minute for meditation pace

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    system: `You are a certified meditation teacher writing guided meditation scripts. Your scripts are spoken aloud by a text-to-speech voice, so write naturally for audio — use pauses indicated by "..." (3 dots = brief pause, "... ..." = longer pause), avoid markdown, avoid lists. Write in second person.`,
    messages: [{
      role: 'user',
      content: `Write a ${req.durationMins}-minute guided meditation for someone named ${req.userName}.

Their current mood: ${req.mood} (intensity: ${req.moodIntensity}/5)
Meditation type: ${req.type}
Style guide: ${styleGuides[req.preferredStyle || 'gentle']}

Target approximately ${wordCount} words. Begin with a gentle welcome, guide through the practice, end with a gentle return to awareness. Include timing cues like [PAUSE 10s] for longer silences.

The script should directly address and help with their current emotional state of feeling ${req.mood}.`,
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
```

## ElevenLabs Voice Generation

```typescript
// lib/voice-generator.ts
import { ElevenLabsClient } from 'elevenlabs'
import { Readable } from 'stream'

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY!,
})

// Good voices for meditation
const MEDITATION_VOICES = {
  rachel: 'EXAVITQu4vr4xnSDxMaL',   // calm, warm female
  adam: 'pNInz6obpgDQGcFmaJgB',      // gentle male
  domi: 'AZnzlk1XvdvUeBnXmlld',      // soft female
  bella: 'EXAVITQu4vr4xnSDxMaL',     // soothing
}

export async function generateMeditationAudio(
  script: string,
  voiceId: string = MEDITATION_VOICES.rachel,
): Promise<Buffer> {
  // Remove timing cues from script for TTS
  const cleanScript = script
    .replace(/\[PAUSE \d+s\]/g, '...')
    .replace(/\[.*?\]/g, '')

  const audioStream = await elevenlabs.generate({
    voice: voiceId,
    text: cleanScript,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.75,        // higher = more consistent, less expressive
      similarity_boost: 0.75,
      style: 0.2,             // low for calmer delivery
      use_speaker_boost: false,
    },
  })

  const chunks: Buffer[] = []
  for await (const chunk of audioStream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
```

## Session API with Audio Caching

```typescript
// app/api/sessions/generate/route.ts
import { put } from '@vercel/blob'
import { generateMeditationScript } from '@/lib/script-generator'
import { generateMeditationAudio } from '@/lib/voice-generator'

export async function POST(req: Request) {
  const { userId, mood, moodIntensity, durationMins, type, style } = await req.json()

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return Response.json({ error: 'User not found' }, { status: 404 })

  // Generate script
  const script = await generateMeditationScript({
    mood, moodIntensity, durationMins, type,
    userName: user.name.split(' ')[0],
    preferredStyle: style,
  })

  // Generate audio
  const audioBuffer = await generateMeditationAudio(script, user.preferredVoice)

  // Store audio
  const blob = await put(`meditations/${userId}/${Date.now()}.mp3`, audioBuffer, {
    access: 'public',
    contentType: 'audio/mpeg',
  })

  // Save session
  const session = await prisma.meditationSession.create({
    data: {
      userId,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} for ${mood}`,
      type,
      durationMins,
      scriptText: script,
      audioUrl: blob.url,
      isGenerated: true,
      moodBefore: mood,
    },
  })

  return Response.json({ session, audioUrl: blob.url })
}
```

## Streak and Stats Engine

```typescript
// lib/streaks.ts
import { startOfDay, differenceInDays } from 'date-fns'

export async function recordMeditationComplete(userId: string, sessionId: string, moodAfter?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return

  const today = startOfDay(new Date())
  const lastDay = user.lastMeditated ? startOfDay(user.lastMeditated) : null
  const daysSinceLast = lastDay ? differenceInDays(today, lastDay) : Infinity

  let newStreak = user.streak
  if (daysSinceLast === 0) {
    // Already meditated today, no streak change
  } else if (daysSinceLast === 1) {
    newStreak++
  } else {
    newStreak = 1 // reset
  }

  const session = await prisma.meditationSession.findUnique({ where: { id: sessionId } })

  await prisma.user.update({
    where: { id: userId },
    data: {
      streak: newStreak,
      longestStreak: Math.max(user.longestStreak, newStreak),
      totalMinutes: { increment: session?.durationMins || 0 },
      lastMeditated: new Date(),
    },
  })

  await prisma.meditationSession.update({
    where: { id: sessionId },
    data: { completed: true, completedAt: new Date(), moodAfter },
  })

  return { streak: newStreak, isNewRecord: newStreak > user.longestStreak }
}

export async function getMoodTrend(userId: string, days = 30) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const logs = await prisma.moodLog.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  })

  return logs.map(l => ({
    date: l.createdAt.toISOString().split('T')[0],
    mood: l.mood,
    intensity: l.intensity,
  }))
}
```

## Background Sound Mixer

```typescript
// lib/sounds.ts
export const SOUND_LIBRARY = {
  rain: { url: '/sounds/rain-light.mp3', label: 'Light Rain', category: 'nature' },
  rain_heavy: { url: '/sounds/rain-heavy.mp3', label: 'Heavy Rain', category: 'nature' },
  forest: { url: '/sounds/forest-birds.mp3', label: 'Forest Birds', category: 'nature' },
  ocean: { url: '/sounds/ocean-waves.mp3', label: 'Ocean Waves', category: 'nature' },
  white_noise: { url: '/sounds/white-noise.mp3', label: 'White Noise', category: 'noise' },
  brown_noise: { url: '/sounds/brown-noise.mp3', label: 'Brown Noise', category: 'noise' },
  binaural_theta: { url: '/sounds/binaural-theta-6hz.mp3', label: 'Theta Waves (6Hz)', category: 'binaural' },
  binaural_alpha: { url: '/sounds/binaural-alpha-10hz.mp3', label: 'Alpha Waves (10Hz)', category: 'binaural' },
  tibetan_bowl: { url: '/sounds/tibetan-bowl.mp3', label: 'Tibetan Bowl', category: 'instrumental' },
  fireplace: { url: '/sounds/fireplace.mp3', label: 'Fireplace', category: 'ambience' },
}

// Frontend: use Web Audio API to mix multiple sounds
export const mixerCode = `
const AudioContext = window.AudioContext || window.webkitAudioContext
const ctx = new AudioContext()
const gains = {}

async function loadSound(id, url, volume = 0.5) {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  const source = ctx.createBufferSource()
  const gainNode = ctx.createGain()
  source.buffer = audioBuffer
  source.loop = true
  gainNode.gain.value = volume
  source.connect(gainNode)
  gainNode.connect(ctx.destination)
  source.start()
  gains[id] = gainNode
  return source
}

function setVolume(id, volume) {
  if (gains[id]) gains[id].gain.setTargetAtTime(volume, ctx.currentTime, 0.1)
}
`

## Key Features Summary

- **AI personalization**: Claude writes a unique 10-min meditation for your exact mood
- **ElevenLabs voice**: ultra-realistic guided narration, not robotic TTS
- **Sound mixer**: layer up to 3 background sounds simultaneously
- **Streak tracking**: daily meditation habit with longest streak record
- **Mood correlation**: see how meditation affects your mood over time

## Extensions to Consider

- **Offline mode**: cache generated sessions for airplane/commute use
- **Sleep timer**: auto-fade audio after session ends
- **Apple Watch** haptic breathing guide integration
- **Community sessions**: share AI-generated scripts with other users
- **Corporate wellness** tier: team dashboards, anonymous mood aggregates
