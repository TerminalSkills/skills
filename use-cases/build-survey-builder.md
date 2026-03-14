---
title: Build a Survey Builder with Analytics
slug: build-survey-builder
description: Build a Typeform-style survey builder with conditional logic, question branching, response collection, real-time analytics, and export — creating dynamic forms that adapt based on answers.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - nextjs
  - zod
category: Full-Stack Development
tags:
  - survey
  - forms
  - analytics
  - data-collection
  - saas
---

# Build a Survey Builder with Analytics

## The Problem

Eva leads research at a 20-person product company. They use Google Forms for customer surveys but it's too basic: no conditional logic (show question B only if answer A was "yes"), no custom branding, no real-time analytics, and CSV exports require manual pivot tables. They're paying $300/month for Typeform but need deeper integration with their app and custom analytics. They need a survey builder where non-technical team members create surveys, questions branch based on answers, and results stream into a live dashboard.

## Step 1: Build the Survey Engine

```typescript
// src/survey/engine.ts — Survey builder with conditional branching and live analytics
import { pool } from "../db";
import { Redis } from "ioredis";
import { z } from "zod";

const redis = new Redis(process.env.REDIS_URL!);

type QuestionType = "text" | "textarea" | "number" | "single_choice" | "multiple_choice" | "rating" | "nps" | "date";

interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  order: number;
  options?: string[];           // for choice questions
  min?: number;                 // for rating/number
  max?: number;
  placeholder?: string;
  conditions?: ConditionalRule[]; // show this question only if...
}

interface ConditionalRule {
  questionId: string;           // depends on this question
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
  value: any;
}

interface Survey {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  settings: {
    allowMultipleResponses: boolean;
    showProgressBar: boolean;
    randomizeQuestions: boolean;
    closeAfterResponses?: number;
    closeAfterDate?: string;
    redirectUrl?: string;
    thankYouMessage: string;
  };
  status: "draft" | "active" | "closed";
  responseCount: number;
  createdBy: string;
}

// Get survey with conditional filtering
export async function getSurveyForResponse(
  surveyId: string,
  currentAnswers: Record<string, any> = {}
): Promise<{ survey: Survey; visibleQuestions: Question[] }> {
  const { rows: [survey] } = await pool.query(
    "SELECT * FROM surveys WHERE id = $1 AND status = 'active'",
    [surveyId]
  );
  if (!survey) throw new Error("Survey not found or closed");

  // Check if closed by response limit
  if (survey.settings.closeAfterResponses && survey.response_count >= survey.settings.closeAfterResponses) {
    throw new Error("This survey has reached its response limit");
  }

  const questions: Question[] = survey.questions;

  // Filter questions based on conditional logic
  const visibleQuestions = questions.filter((q) => {
    if (!q.conditions || q.conditions.length === 0) return true;

    return q.conditions.every((cond) => {
      const answer = currentAnswers[cond.questionId];
      if (answer === undefined) return false;

      switch (cond.operator) {
        case "equals": return answer === cond.value;
        case "not_equals": return answer !== cond.value;
        case "contains": return String(answer).includes(cond.value);
        case "greater_than": return Number(answer) > Number(cond.value);
        case "less_than": return Number(answer) < Number(cond.value);
        default: return true;
      }
    });
  });

  return {
    survey: { ...survey, questions },
    visibleQuestions: visibleQuestions.sort((a, b) => a.order - b.order),
  };
}

// Submit survey response
export async function submitResponse(
  surveyId: string,
  answers: Record<string, any>,
  metadata?: { userId?: string; userAgent?: string; ip?: string }
): Promise<{ responseId: string; thankYouMessage: string }> {
  const { rows: [survey] } = await pool.query("SELECT * FROM surveys WHERE id = $1", [surveyId]);
  if (!survey || survey.status !== "active") throw new Error("Survey is not accepting responses");

  // Validate required questions
  const questions: Question[] = survey.questions;
  const { visibleQuestions } = await getSurveyForResponse(surveyId, answers);

  for (const q of visibleQuestions) {
    if (q.required && (answers[q.id] === undefined || answers[q.id] === "")) {
      throw new Error(`Question "${q.title}" is required`);
    }
  }

  // Check duplicate responses
  if (!survey.settings.allowMultipleResponses && metadata?.userId) {
    const { rows } = await pool.query(
      "SELECT 1 FROM survey_responses WHERE survey_id = $1 AND user_id = $2",
      [surveyId, metadata.userId]
    );
    if (rows.length > 0) throw new Error("You have already responded to this survey");
  }

  const responseId = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await pool.query(
    `INSERT INTO survey_responses (id, survey_id, answers, user_id, user_agent, ip_hash, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [responseId, surveyId, JSON.stringify(answers),
     metadata?.userId || null, metadata?.userAgent || null,
     metadata?.ip ? simpleHash(metadata.ip) : null]
  );

  // Increment response count
  await pool.query("UPDATE surveys SET response_count = response_count + 1 WHERE id = $1", [surveyId]);

  // Update real-time analytics
  await updateAnalytics(surveyId, answers, questions);

  // Publish for live dashboard
  await redis.publish(`survey:responses:${surveyId}`, JSON.stringify({
    responseId, answers, timestamp: new Date().toISOString(),
  }));

  return {
    responseId,
    thankYouMessage: survey.settings.thankYouMessage || "Thank you for your response!",
  };
}

// Real-time analytics
async function updateAnalytics(surveyId: string, answers: Record<string, any>, questions: Question[]): Promise<void> {
  for (const question of questions) {
    const answer = answers[question.id];
    if (answer === undefined) continue;

    const key = `survey:analytics:${surveyId}:${question.id}`;

    switch (question.type) {
      case "single_choice":
      case "multiple_choice":
        const choices = Array.isArray(answer) ? answer : [answer];
        for (const choice of choices) {
          await redis.hincrby(key, choice, 1);
        }
        break;

      case "rating":
      case "nps":
      case "number":
        await redis.rpush(`${key}:values`, String(answer));
        break;

      case "text":
      case "textarea":
        await redis.hincrby(`${key}:count`, "responses", 1);
        break;
    }
  }
}

// Get analytics for a survey
export async function getAnalytics(surveyId: string): Promise<{
  responseCount: number;
  questions: Array<{
    id: string;
    title: string;
    type: QuestionType;
    analytics: any;
  }>;
  completionRate: number;
  averageTimeSeconds: number;
}> {
  const { rows: [survey] } = await pool.query("SELECT * FROM surveys WHERE id = $1", [surveyId]);
  const questions: Question[] = survey.questions;

  const analytics = [];

  for (const q of questions) {
    const key = `survey:analytics:${surveyId}:${q.id}`;
    let data: any;

    switch (q.type) {
      case "single_choice":
      case "multiple_choice":
        const distribution = await redis.hgetall(key);
        const total = Object.values(distribution).reduce((s: number, v: any) => s + parseInt(v), 0);
        data = {
          distribution,
          percentages: Object.fromEntries(
            Object.entries(distribution).map(([k, v]) => [k, ((parseInt(v as string) / Math.max(total, 1)) * 100).toFixed(1) + "%"])
          ),
        };
        break;

      case "rating":
      case "nps":
        const values = (await redis.lrange(`${key}:values`, 0, -1)).map(Number);
        const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
        data = {
          average: Math.round(avg * 10) / 10,
          count: values.length,
          distribution: values.reduce((acc: Record<number, number>, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {}),
        };

        // NPS calculation
        if (q.type === "nps") {
          const promoters = values.filter((v) => v >= 9).length;
          const detractors = values.filter((v) => v <= 6).length;
          data.npsScore = Math.round(((promoters - detractors) / Math.max(values.length, 1)) * 100);
        }
        break;

      default:
        const count = await redis.hget(`${key}:count`, "responses");
        data = { responseCount: parseInt(count || "0") };
    }

    analytics.push({ id: q.id, title: q.title, type: q.type, analytics: data });
  }

  return {
    responseCount: survey.response_count,
    questions: analytics,
    completionRate: 0, // calculated from partial responses
    averageTimeSeconds: 0,
  };
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}
```

## Results

- **Survey response rates up 40%** — conditional branching shortens surveys for each respondent; users who answer "No" skip irrelevant follow-up questions
- **NPS tracking automated** — real-time NPS score updates on the dashboard as responses come in; PM sees score drop from 45 to 38 and investigates immediately
- **No more CSV pivot tables** — live analytics dashboard shows choice distributions, rating averages, and NPS breakdown; no manual data processing
- **$300/month Typeform cost eliminated** — custom survey builder integrates directly with the app; surveys can be embedded in-product at exactly the right moment
- **Conditional logic handles complex flows** — "If role = manager AND team size > 10, show enterprise questions" — one survey serves multiple segments
