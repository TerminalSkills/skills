---
title: "Build an AI-Powered Quiz Generator"
description: "Turn any PDF, URL, or text into a timed quiz in 2 minutes. AI extracts key concepts and generates multiple choice, true/false, and open-ended questions with difficulty levels and per-answer explanations."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "5 hours"
tags: [ai, education, quiz, assessment, pdf, claude, lms, edtech]
---

# Build an AI-Powered Quiz Generator

You spent hours writing a lecture. Now you need a quiz to test comprehension. Writing 20 questions by hand takes another hour you don't have. This system turns your content into a complete assessment in 2 minutes — multiple choice, true/false, open-ended, with explanations baked in.

## What You'll Build

- Input: paste text, upload PDF, or provide a URL
- AI extracts key concepts and generates questions
- Difficulty levels: beginner / intermediate / advanced
- Quiz engine: timed, scored, with per-answer explanations
- Export: shareable link or embeddable widget

## Architecture

```
Content input (text / PDF / URL)
  → Extract text content
  → Claude generates structured questions
  → Prisma stores quiz + questions
  → Quiz engine: render, timer, scoring
  → Results stored per attempt
  → Share link / embed code
```

## Step 1: Content Extraction

```typescript
// lib/extract.ts
import * as pdfParse from "pdf-parse";

export async function extractText(input: {
  type: "text" | "pdf" | "url";
  content: string; // raw text, base64 PDF, or URL
}): Promise<string> {
  if (input.type === "text") return input.content;

  if (input.type === "url") {
    const res = await fetch(input.content);
    const html = await res.text();
    // Strip HTML tags — basic extraction
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 20000);
  }

  if (input.type === "pdf") {
    const buffer = Buffer.from(input.content, "base64");
    const data = await pdfParse(buffer);
    return data.text.slice(0, 20000);
  }

  throw new Error("Unknown input type");
}
```

## Step 2: Generate Questions with Claude

```typescript
// lib/quiz-generator.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface Question {
  type: "multiple_choice" | "true_false" | "open_ended";
  question: string;
  options?: string[];       // for multiple_choice
  correctAnswer: string;
  explanation: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export async function generateQuiz(params: {
  content: string;
  numQuestions: number;
  difficulty: "beginner" | "intermediate" | "advanced" | "mixed";
  questionTypes: Question["type"][];
}): Promise<Question[]> {
  const prompt = `You are an expert educator. Generate a quiz based on the following content.

Content:
${params.content}

Requirements:
- Generate exactly ${params.numQuestions} questions
- Difficulty: ${params.difficulty}
- Question types to use: ${params.questionTypes.join(", ")}
- For multiple_choice: provide exactly 4 options (A, B, C, D)
- For true_false: options are ["True", "False"]
- For open_ended: provide a model answer in correctAnswer

Return a JSON array of questions. Each question must have:
- type, question, options (if applicable), correctAnswer, explanation, difficulty

Example format:
[
  {
    "type": "multiple_choice",
    "question": "What is...?",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correctAnswer": "A) ...",
    "explanation": "This is correct because...",
    "difficulty": "beginner"
  }
]

Return ONLY the JSON array, no other text.`;

  const message = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return JSON.parse(text);
}
```

## Step 3: Prisma Schema

```prisma
model Quiz {
  id          String     @id @default(cuid())
  userId      String
  title       String
  description String?
  sourceType  String     // text | pdf | url
  sourceRef   String?    // URL or filename
  difficulty  String     // beginner | intermediate | advanced | mixed
  timeLimitMin Int?      // null = no limit
  isPublished Boolean    @default(false)
  shareToken  String     @unique @default(cuid())
  questions   Question[]
  attempts    QuizAttempt[]
  createdAt   DateTime   @default(now())
}

model Question {
  id            String   @id @default(cuid())
  quizId        String
  quiz          Quiz     @relation(fields: [quizId], references: [id])
  type          String
  question      String
  options       Json?    // string[]
  correctAnswer String
  explanation   String
  difficulty    String
  sortOrder     Int
  answers       Answer[]
}

model QuizAttempt {
  id          String   @id @default(cuid())
  quizId      String
  quiz        Quiz     @relation(fields: [quizId], references: [id])
  userId      String?  // null for anonymous
  score       Float    // 0-100
  timeTakenSec Int
  completedAt DateTime @default(now())
  answers     Answer[]
}

model Answer {
  id          String      @id @default(cuid())
  attemptId   String
  attempt     QuizAttempt @relation(fields: [attemptId], references: [id])
  questionId  String
  question    Question    @relation(fields: [questionId], references: [id])
  givenAnswer String
  isCorrect   Boolean
}
```

## Step 4: Quiz API Endpoints

```typescript
// POST /api/quizzes/generate
export async function POST(req: Request) {
  const { content, type, numQuestions = 10, difficulty = "mixed",
    questionTypes = ["multiple_choice", "true_false"] } = await req.json();
  const userId = await getSessionUserId(req);

  const text = await extractText({ type, content });
  const questions = await generateQuiz({ content: text, numQuestions, difficulty, questionTypes });

  // Auto-generate a title using Claude
  const titleMsg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 50,
    messages: [{ role: "user", content: `Generate a short, catchy quiz title (max 8 words) for content about: ${text.slice(0, 500)}. Return only the title.` }],
  });
  const title = titleMsg.content[0].type === "text" ? titleMsg.content[0].text.trim() : "New Quiz";

  const quiz = await prisma.quiz.create({
    data: {
      userId,
      title,
      sourceType: type,
      difficulty,
      questions: {
        create: questions.map((q, i) => ({ ...q, sortOrder: i, options: q.options ?? undefined })),
      },
    },
    include: { questions: true },
  });

  return Response.json({ quiz });
}

// POST /api/quizzes/[id]/submit
export async function submitAttempt(req: Request, quizId: string) {
  const { answers, timeTakenSec, userId } = await req.json();
  const questions = await prisma.question.findMany({ where: { quizId } });

  let correct = 0;
  const answerData = questions.map((q) => {
    const given = answers[q.id] ?? "";
    const isCorrect = given.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    if (isCorrect) correct++;
    return { questionId: q.id, givenAnswer: given, isCorrect };
  });

  const score = (correct / questions.length) * 100;

  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId,
      userId,
      score,
      timeTakenSec,
      answers: { create: answerData },
    },
    include: { answers: { include: { question: true } } },
  });

  return Response.json({ attempt, score });
}
```

## Step 5: Share and Embed

```typescript
// GET /api/quizzes/share/[token] — public quiz by share token
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const quiz = await prisma.quiz.findUnique({
    where: { shareToken: params.token, isPublished: true },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });
  if (!quiz) return Response.json({ error: "not_found" }, { status: 404 });

  // Omit correct answers from the response
  const sanitized = {
    ...quiz,
    questions: quiz.questions.map(({ correctAnswer, explanation, ...q }) => q),
  };

  return Response.json(sanitized);
}

// Embed snippet
export function getEmbedCode(shareToken: string) {
  return `<iframe src="${process.env.APP_URL}/embed/quiz/${shareToken}" 
  width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
}
```

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://...
APP_URL=https://your-app.com
```

## Launch Checklist

- [ ] Content extraction working for text, PDF, URL
- [ ] Question generation tested across difficulty levels
- [ ] Quiz timer with auto-submit on expiry
- [ ] Score screen with per-question explanations
- [ ] Share link accessible without login
- [ ] Embed code copy button
- [ ] Quiz history and analytics for creators

## What's Next

- Question bank: save and reuse questions across quizzes
- AI re-explain: student asks "why is this wrong?" → Claude explains
- LMS integration: export to SCORM, Google Classroom
- Leaderboard: class ranking on shared quiz
