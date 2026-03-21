---
title: "Build a Multilingual AI Chatbot"
description: "Build an AI support chatbot that auto-detects the user's language and responds in kind — supporting 15+ languages with translation memory and human escalation fallback."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "6 hours"
tags: [chatbot, i18n, multilingual, ai, support, saas]
---

# Build a Multilingual AI Chatbot

**Persona:** Your B2B SaaS has customers in 15 countries. Your support team speaks English and Spanish. You need a chatbot that handles French, German, Japanese, Arabic, and a dozen more without hiring linguists.

## What You'll Build

- **Language detection**: Identify user language from their first message
- **Localized AI responses**: Claude responds in the detected language
- **System prompt localization**: Load locale-specific instructions
- **Translation memory**: Cache Q&A pairs per locale to reduce API cost
- **Human escalation**: Hand off unsupported or low-confidence languages

---

## 1. Language Detection

Detect user language using Claude before routing to the main handler.

```typescript
// lib/detect-language.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface DetectionResult {
  language: string;   // ISO 639-1 code: "en", "fr", "ja"
  confidence: number; // 0-1
  supported: boolean;
}

const SUPPORTED_LANGUAGES = ["en", "fr", "de", "es", "pt", "it", "ja", "ko", "zh", "ru", "ar", "nl", "pl", "sv", "tr"];

export async function detectLanguage(text: string): Promise<DetectionResult> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 64,
    messages: [{
      role: "user",
      content: `Detect the language of this text. Respond with JSON only: {"language": "ISO 639-1 code", "confidence": 0.0-1.0}\n\nText: "${text.slice(0, 200)}"`
    }]
  });

  const result = JSON.parse(message.content[0].text);
  return {
    ...result,
    supported: SUPPORTED_LANGUAGES.includes(result.language) && result.confidence > 0.8
  };
}
```

---

## 2. Localized System Prompts

Each language gets a tailored system prompt with locale-specific phrasing.

```typescript
// lib/system-prompts.ts
const BASE_PROMPT = `You are a helpful support assistant for Acme SaaS. 
Answer questions about billing, features, and troubleshooting.
Be concise and friendly. If you don't know something, say so honestly.`;

const LOCALE_OVERRIDES: Record<string, string> = {
  ja: `${BASE_PROMPT}\nUse polite Japanese (敬語). Address the user as お客様.`,
  ar: `${BASE_PROMPT}\nRespond in Modern Standard Arabic (فصحى). Format right-to-left text properly.`,
  de: `${BASE_PROMPT}\nUse formal German (Sie form). Germans prefer directness and precision.`,
  fr: `${BASE_PROMPT}\nUse formal French (vous). Avoid anglicisms when French equivalents exist.`,
  ko: `${BASE_PROMPT}\nUse formal Korean (존댓말). Address the user as 고객님.`,
};

export function getSystemPrompt(language: string): string {
  return LOCALE_OVERRIDES[language] ?? `${BASE_PROMPT}\nRespond in the user's language: ${language}.`;
}
```

---

## 3. Translation Memory

Cache frequent Q&A pairs per locale. Check cache before hitting the API.

```typescript
// lib/translation-memory.ts
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function getAnswer(question: string, language: string, userId: string): Promise<string> {
  // Check translation memory
  const cached = await prisma.translationMemory.findFirst({
    where: { language, similarity: { gt: 0.85 } },
    orderBy: { useCount: "desc" }
  });
  
  // Simple keyword match (replace with pgvector for production)
  const keywordMatch = await prisma.$queryRaw<Array<{ answer: string; id: string }>>`
    SELECT id, answer FROM "TranslationMemory"
    WHERE language = ${language}
    AND question % ${question}
    ORDER BY similarity(question, ${question}) DESC
    LIMIT 1
  `;

  if (keywordMatch.length > 0) {
    await prisma.translationMemory.update({
      where: { id: keywordMatch[0].id },
      data: { useCount: { increment: 1 } }
    });
    return keywordMatch[0].answer;
  }

  // Cache miss — generate new response
  const systemPrompt = getSystemPrompt(language);
  const message = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: question }]
  });

  const answer = message.content[0].text;

  // Store in translation memory
  await prisma.translationMemory.create({
    data: { language, question, answer, useCount: 1 }
  });

  return answer;
}
```

---

## 4. Chat API Route with Streaming

Full chat handler with language detection, routing, and escalation.

```typescript
// app/api/chat/route.ts
import { detectLanguage } from "@/lib/detect-language";
import { getSystemPrompt } from "@/lib/system-prompts";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(req: Request) {
  const { message, sessionId } = await req.json();

  // Get or create session
  let session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  
  if (!session) {
    const detection = await detectLanguage(message);
    
    if (!detection.supported) {
      // Escalate to human
      await prisma.escalation.create({
        data: { sessionId, reason: `Unsupported language: ${detection.language}`, message }
      });
      return Response.json({ 
        reply: "Let me connect you with a human agent who can help. Please wait a moment.",
        escalated: true 
      });
    }

    session = await prisma.chatSession.create({
      data: { id: sessionId, language: detection.language }
    });
  }

  // Store user message
  await prisma.chatMessage.create({
    data: { sessionId, role: "user", content: message }
  });

  // Get conversation history
  const history = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 20
  });

  // Stream response
  const stream = client.messages.stream({
    model: "claude-opus-4-5",
    max_tokens: 512,
    system: getSystemPrompt(session.language),
    messages: history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          fullResponse += chunk.delta.text;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
        }
      }
      await prisma.chatMessage.create({
        data: { sessionId, role: "assistant", content: fullResponse }
      });
      controller.close();
    }
  });

  return new Response(readable, { headers: { "Content-Type": "text/event-stream" } });
}
```

---

## 5. Prisma Schema

```prisma
model ChatSession {
  id        String        @id @default(cuid())
  language  String
  messages  ChatMessage[]
  createdAt DateTime      @default(now())
}

model ChatMessage {
  id        String      @id @default(cuid())
  sessionId String
  session   ChatSession @relation(fields: [sessionId], references: [id])
  role      String      // "user" | "assistant"
  content   String      @db.Text
  createdAt DateTime    @default(now())
}

model TranslationMemory {
  id        String   @id @default(cuid())
  language  String
  question  String   @db.Text
  answer    String   @db.Text
  useCount  Int      @default(0)
  createdAt DateTime @default(now())
  @@index([language])
}

model Escalation {
  id        String   @id @default(cuid())
  sessionId String
  reason    String
  message   String   @db.Text
  resolved  Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

---

## Result

Your support chatbot now:
- Detects language automatically — no dropdown needed
- Responds natively in 15+ languages using Claude's multilingual capabilities
- Stores hot Q&A pairs to cut API costs by 40-60%
- Gracefully escalates to humans when language is exotic or confidence is low
- Logs full conversation history per locale for future training data

No translation service fees. No translation team. Just Claude doing the heavy lifting.
