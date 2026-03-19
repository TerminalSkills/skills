---
title: Build an AI Resume Screener
slug: build-ai-resume-screener
description: Parse hundreds of resumes automatically, score candidates against job requirements with an LLM, rank them by fit, and generate custom interview questions — all before a human reads a single CV.
skills:
  - anthropic-sdk
  - prisma
tags:
  - hiring
  - hr
  - ai
  - automation
  - recruiting
---

## The Problem

Priya's engineering team is hiring three senior engineers. They posted on LinkedIn and Greenhouse and got 500 applications in two weeks. Their recruiter is spending 8 hours a day just opening PDFs and skimming for "5+ years of experience" and "TypeScript." They're missing good candidates buried on page 3 of the applicant list, and they're wasting time on obvious mismatches.

Priya wants to automate the first pass: parse every resume, score each candidate against the actual job requirements, rank them, and surface the top 30 for human review — before anyone reads a single CV.

## The Solution

Use anthropic-sdk to parse resumes into structured JSON and score candidates against job requirements. Use prisma to store parsed profiles, scores, and track pipeline state across 500 applications.

## Step-by-Step Walkthrough

### Step 1: Parse Resumes into Structured Data

Extract text from PDF/DOCX, then use Claude to parse into a structured candidate profile.

```typescript
// parser/extract.ts
import * as fs from 'fs';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export async function extractText(filePath: string): Promise<string> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  if (ext === 'pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    return data.text;
  }
  
  if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  
  throw new Error(`Unsupported file type: ${ext}`);
}
```

```typescript
// parser/structure.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface CandidateProfile {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  yearsOfExperience: number;
  skills: string[];
  currentRole?: string;
  currentCompany?: string;
  education: Array<{ degree: string; field: string; school: string; year?: number }>;
  workHistory: Array<{ title: string; company: string; years: number; highlights: string[] }>;
  summary?: string;
}

/**
 * Use Claude to parse raw resume text into structured JSON.
 * Much more reliable than regex for varied resume formats.
 */
export async function parseResumeText(rawText: string): Promise<CandidateProfile> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',  // fast + cheap for bulk parsing
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `Parse this resume into structured JSON. Extract all available information.
        
RESUME:
${rawText}

Return a JSON object matching this schema:
{
  name: string,
  email: string,
  phone?: string,
  location?: string,
  yearsOfExperience: number,  // total years of relevant work experience
  skills: string[],           // technical skills, tools, languages, frameworks
  currentRole?: string,
  currentCompany?: string,
  education: [{ degree, field, school, year? }],
  workHistory: [{ title, company, years, highlights: string[] }],
  summary?: string
}

Return only valid JSON. Estimate yearsOfExperience from dates if not explicit.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  return JSON.parse(content.text) as CandidateProfile;
}
```

### Step 2: Score Against Job Requirements

```typescript
// scorer/evaluate.ts
import Anthropic from '@anthropic-ai/sdk';
import type { CandidateProfile } from '../parser/structure';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface JobRequirements {
  title: string;
  mustHave: string[];       // hard requirements — instant disqualify if missing
  niceToHave: string[];     // preferred but not blocking
  minYearsExp: number;
  description: string;
}

export interface CandidateScore {
  overall: number;          // 0-100
  technicalFit: number;     // 0-100: skills match
  experienceFit: number;    // 0-100: seniority/years
  keywordMatch: number;     // 0-100: role-specific terms
  mustHavesMet: boolean;
  missingRequired: string[];
  strengths: string[];
  concerns: string[];
  reasoning: string;
}

export async function scoreCandidate(
  candidate: CandidateProfile,
  job: JobRequirements
): Promise<CandidateScore> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: `Score this candidate for the job role. Be objective and strict.

JOB: ${job.title}
Must-Have: ${job.mustHave.join(', ')}
Nice-to-Have: ${job.niceToHave.join(', ')}
Minimum Years: ${job.minYearsExp}
Description: ${job.description}

CANDIDATE:
Name: ${candidate.name}
Experience: ${candidate.yearsOfExperience} years
Skills: ${candidate.skills.join(', ')}
Current: ${candidate.currentRole} at ${candidate.currentCompany}
Education: ${candidate.education.map(e => `${e.degree} in ${e.field} from ${e.school}`).join('; ')}

Return JSON:
{
  overall: 0-100,
  technicalFit: 0-100,
  experienceFit: 0-100,
  keywordMatch: 0-100,
  mustHavesMet: boolean,
  missingRequired: string[],
  strengths: string[],
  concerns: string[],
  reasoning: string  // 2-3 sentences
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  return JSON.parse(content.text) as CandidateScore;
}
```

### Step 3: Store and Rank with Prisma

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Job {
  id           String      @id @default(cuid())
  title        String
  description  String
  mustHave     String[]
  niceToHave   String[]
  minYearsExp  Int
  createdAt    DateTime    @default(now())
  candidates   Candidate[]
}

model Candidate {
  id              String   @id @default(cuid())
  name            String
  email           String
  resumeText      String
  profileJson     Json     // parsed CandidateProfile
  overallScore    Float
  technicalFit    Float
  experienceFit   Float
  mustHavesMet    Boolean
  scoreJson       Json     // full CandidateScore
  status          String   @default("pending")  // pending | reviewed | interview | rejected
  interviewQs     String[]
  jobId           String
  job             Job      @relation(fields: [jobId], references: [id])
  createdAt       DateTime @default(now())
  
  @@index([jobId, overallScore])
}
```

```typescript
// db/candidates.ts
import { PrismaClient } from '@prisma/client';
import type { CandidateProfile } from '../parser/structure';
import type { CandidateScore } from '../scorer/evaluate';

const prisma = new PrismaClient();

export async function saveCandidateResult(
  profile: CandidateProfile,
  score: CandidateScore,
  resumeText: string,
  jobId: string,
  interviewQuestions: string[]
) {
  return prisma.candidate.create({
    data: {
      name: profile.name,
      email: profile.email,
      resumeText,
      profileJson: profile as any,
      overallScore: score.overall,
      technicalFit: score.technicalFit,
      experienceFit: score.experienceFit,
      mustHavesMet: score.mustHavesMet,
      scoreJson: score as any,
      interviewQs: interviewQuestions,
      jobId,
    },
  });
}

export async function getRankedCandidates(jobId: string, limit = 30) {
  return prisma.candidate.findMany({
    where: { jobId, mustHavesMet: true },
    orderBy: { overallScore: 'desc' },
    take: limit,
  });
}
```

### Step 4: Generate Interview Questions

```typescript
// interviewer/generate.ts
import Anthropic from '@anthropic-ai/sdk';
import type { CandidateProfile } from '../parser/structure';
import type { CandidateScore } from '../scorer/evaluate';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * Generate tailored interview questions based on the candidate's
 * profile and identified strengths/concerns.
 */
export async function generateInterviewQuestions(
  candidate: CandidateProfile,
  score: CandidateScore,
  jobTitle: string
): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `Generate 6 targeted interview questions for this ${jobTitle} candidate.

Candidate strengths: ${score.strengths.join(', ')}
Concerns to probe: ${score.concerns.join(', ')}
Work history: ${candidate.workHistory.map(w => `${w.title} at ${w.company}`).join(', ')}

Mix of:
- 2 technical depth questions
- 2 questions that probe the concerns
- 1 behavioral question based on their background
- 1 question about a specific past project

Return JSON array of question strings only.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  return JSON.parse(content.text) as string[];
}
```

### Step 5: Run the Batch Screener

```typescript
// index.ts — Process all resumes in a folder
import * as fs from 'fs';
import * as path from 'path';
import { extractText } from './parser/extract';
import { parseResumeText } from './parser/structure';
import { scoreCandidate } from './scorer/evaluate';
import { generateInterviewQuestions } from './interviewer/generate';
import { saveCandidateResult, getRankedCandidates } from './db/candidates';

const JOB: JobRequirements = {
  title: 'Senior Software Engineer',
  mustHave: ['TypeScript', 'React', 'Node.js', '5+ years experience'],
  niceToHave: ['PostgreSQL', 'AWS', 'GraphQL', 'system design'],
  minYearsExp: 5,
  description: 'Build and maintain our customer-facing product. Lead technical decisions on a team of 4.'
};

async function processResumeFolder(folderPath: string, jobId: string) {
  const files = fs.readdirSync(folderPath).filter(f => /\.(pdf|docx?)$/i.test(f));
  console.log(`Processing ${files.length} resumes...`);
  
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    console.log(`Processing ${file}...`);
    
    try {
      const rawText = await extractText(filePath);
      const profile = await parseResumeText(rawText);
      const score = await scoreCandidate(profile, JOB);
      const questions = score.overall >= 60
        ? await generateInterviewQuestions(profile, score, JOB.title)
        : [];
      
      await saveCandidateResult(profile, score, rawText, jobId, questions);
    } catch (err) {
      console.error(`Failed to process ${file}:`, err);
    }
    
    // Rate limit: ~100 resumes/min with Haiku
    await new Promise(r => setTimeout(r, 600));
  }

  // Print top candidates
  const top30 = await getRankedCandidates(jobId);
  console.log('\nTop Candidates:');
  top30.forEach((c, i) => {
    console.log(`${i + 1}. ${c.name} — Score: ${c.overallScore}/100`);
  });
}

processResumeFolder('./resumes', 'job_senior_engineer_2024');
```

## What You've Built

An AI hiring assistant that processes 500 resumes in ~50 minutes with Claude Haiku (cost: ~$5 total) and surfaces the top 30 with:
- Structured profiles (skills, experience, education)
- Objective scores with reasoning
- Custom interview questions per candidate
- Full audit trail in Postgres

**Next steps:** Add a simple web UI to review candidates and update statuses. Connect to Greenhouse or Lever via their REST API to sync decisions back. Add email notifications when top candidates are identified.
