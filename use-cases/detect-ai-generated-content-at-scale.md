# Detect AI-Generated Content at Scale

**Persona:** Editorial team at a media company that receives ~500 freelance articles per week
and needs to flag likely AI-generated content before publishing.

**Skills used:** [ai-content-detection](../skills/ai-content-detection/SKILL.md),
[gptzero](../skills/gptzero/SKILL.md)

---

## Step 1: Set Up the Detection Pipeline

Install dependencies and configure API keys:

```bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY="your-anthropic-key"
export GPTZERO_API_KEY="your-gptzero-key"
```

Define the pipeline configuration:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const THRESHOLD = 6.5;        // Flag articles scoring above this (0-10 scale)
const CHUNK_SIZE = 1500;       // Words per chunk for long articles
const CONCURRENCY = 3;         // Parallel GPTZero requests
const GPTZERO_DELAY_MS = 350;  // Delay between batches (rate limiting)

const anthropic = new Anthropic();
```

---

## Step 2: Score Incoming Content Automatically

Process each article through both the LLM-as-judge and GPTZero:

```typescript
interface ArticleInput {
  id: string;
  title: string;
  author: string;
  content: string;
  submittedAt: string;
}

interface ScoredArticle extends ArticleInput {
  llm_score: number;
  gptzero_score: number | null;
  combined_score: number;
  verdict: string;
  flagged: boolean;
  suspicious_phrases: string[];
  signals: string[];
}

async function scoreArticle(article: ArticleInput): Promise<ScoredArticle> {
  // LLM analysis (Claude-based ruleset)
  const llmResult = await detectWithLLM(article.content);

  // GPTZero API check
  let gptzeroScore: number | null = null;
  try {
    const gtzDoc = await scanWithGPTZero(article.content);
    gptzeroScore = gtzDoc.completely_generated_prob * 10;
  } catch {
    // GPTZero failure is non-fatal — fall back to LLM only
  }

  const combined =
    gptzeroScore !== null
      ? (llmResult.score * 0.5 + gptzeroScore * 0.5)
      : llmResult.score;

  return {
    ...article,
    llm_score: llmResult.score,
    gptzero_score: gptzeroScore,
    combined_score: Math.round(combined * 10) / 10,
    verdict: scoreToVerdict(combined),
    flagged: combined >= THRESHOLD,
    suspicious_phrases: llmResult.suspicious_phrases,
    signals: llmResult.signals_found,
  };
}

function scoreToVerdict(score: number): string {
  if (score >= 8) return "AI-generated";
  if (score >= 6.5) return "Likely AI";
  if (score >= 4.5) return "Uncertain";
  if (score >= 2.5) return "Likely human";
  return "Human";
}
```

---

## Step 3: Flag Articles Above Threshold for Human Review

Run the full batch and separate flagged from clean:

```typescript
async function processBatch(articles: ArticleInput[]): Promise<{
  flagged: ScoredArticle[];
  clean: ScoredArticle[];
  errors: { id: string; error: string }[];
}> {
  const flagged: ScoredArticle[] = [];
  const clean: ScoredArticle[] = [];
  const errors: { id: string; error: string }[] = [];

  for (let i = 0; i < articles.length; i += CONCURRENCY) {
    const batch = articles.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(batch.map(scoreArticle));

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        r.value.flagged ? flagged.push(r.value) : clean.push(r.value);
      } else {
        errors.push({ id: batch[j].id, error: r.reason?.message ?? "Unknown" });
      }
    }

    // Rate limit protection
    if (i + CONCURRENCY < articles.length) {
      await new Promise((res) => setTimeout(res, GPTZERO_DELAY_MS));
    }

    console.log(`Progress: ${Math.min(i + CONCURRENCY, articles.length)}/${articles.length}`);
  }

  return { flagged, clean, errors };
}
```

---

## Step 4: Generate Per-Article Report with Suspicious Phrases

```typescript
function generateArticleReport(article: ScoredArticle): string {
  const bar = "█".repeat(Math.round(article.combined_score)) +
              "░".repeat(10 - Math.round(article.combined_score));

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 ${article.title}
   Author: ${article.author} | Submitted: ${article.submittedAt}

   AI Score: [${bar}] ${article.combined_score}/10 — ${article.verdict}
   LLM score: ${article.llm_score}/10 | GPTZero: ${
    article.gptzero_score !== null
      ? `${article.gptzero_score.toFixed(1)}/10`
      : "N/A"
  }

   Signals detected:
${article.signals.map((s) => `   • ${s}`).join("\n") || "   (none)"}

   Suspicious phrases:
${article.suspicious_phrases.map((p) => `   ❝ ${p} ❞`).join("\n") || "   (none)"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

function generateBatchSummary(
  flagged: ScoredArticle[],
  clean: ScoredArticle[],
  errors: { id: string; error: string }[]
): string {
  const total = flagged.length + clean.length;
  const flagRate = total > 0 ? ((flagged.length / total) * 100).toFixed(1) : "0";

  return `
📊 BATCH SUMMARY
   Total processed: ${total}
   Flagged for review: ${flagged.length} (${flagRate}%)
   Clean: ${clean.length}
   Errors: ${errors.length}

   Top flagged articles:
${flagged
  .sort((a, b) => b.combined_score - a.combined_score)
  .slice(0, 5)
  .map((a) => `   ${a.combined_score.toFixed(1)} — ${a.title} (${a.author})`)
  .join("\n")}`.trim();
}
```

---

## Step 5: Dashboard — AI Score Distribution

Track score distribution across a week's submissions:

```typescript
interface ScoreDistribution {
  ai: number;           // score >= 7
  likely_ai: number;    // score 5.5-7
  uncertain: number;    // score 4-5.5
  likely_human: number; // score 2.5-4
  human: number;        // score < 2.5
}

function computeDistribution(articles: ScoredArticle[]): ScoreDistribution {
  return articles.reduce(
    (acc, a) => {
      const s = a.combined_score;
      if (s >= 7) acc.ai++;
      else if (s >= 5.5) acc.likely_ai++;
      else if (s >= 4) acc.uncertain++;
      else if (s >= 2.5) acc.likely_human++;
      else acc.human++;
      return acc;
    },
    { ai: 0, likely_ai: 0, uncertain: 0, likely_human: 0, human: 0 }
  );
}

function printDistributionChart(dist: ScoreDistribution, total: number): void {
  const bar = (n: number) => "▇".repeat(Math.round((n / total) * 40)).padEnd(40);
  console.log(`
📈 Score Distribution (n=${total})
  AI-generated   ${bar(dist.ai)} ${dist.ai}
  Likely AI      ${bar(dist.likely_ai)} ${dist.likely_ai}
  Uncertain      ${bar(dist.uncertain)} ${dist.uncertain}
  Likely human   ${bar(dist.likely_human)} ${dist.likely_human}
  Human          ${bar(dist.human)} ${dist.human}
`);
}
```

---

## Step 6: Appeal Workflow for False Positives

Editors can mark false positives; repeated false positives adjust author trust score:

```typescript
interface AuthorRecord {
  authorId: string;
  totalArticles: number;
  flaggedCount: number;
  appealedCount: number;
  confirmedAICount: number;
  trustScore: number; // 0-1, starts at 0.8
}

const authorRegistry = new Map<string, AuthorRecord>();

function recordAppeal(authorId: string, wasCorrectlyFlagged: boolean): void {
  const rec = authorRegistry.get(authorId) ?? {
    authorId,
    totalArticles: 0,
    flaggedCount: 0,
    appealedCount: 0,
    confirmedAICount: 0,
    trustScore: 0.8,
  };

  rec.appealedCount++;
  if (wasCorrectlyFlagged) {
    rec.confirmedAICount++;
    rec.trustScore = Math.max(0.1, rec.trustScore - 0.15);
  } else {
    // False positive — restore some trust
    rec.trustScore = Math.min(1.0, rec.trustScore + 0.05);
  }

  authorRegistry.set(authorId, rec);
}

// Apply trust modifier to score: low-trust authors get higher effective score
function applyTrustModifier(
  score: number,
  authorId: string
): number {
  const rec = authorRegistry.get(authorId);
  if (!rec) return score;
  // Low trust (0.1) adds up to +2 points; full trust adds 0
  const modifier = (1 - rec.trustScore) * 2;
  return Math.min(10, score + modifier);
}
```

---

## Putting It All Together

```typescript
async function runWeeklyAudit(articles: ArticleInput[]): Promise<void> {
  console.log(`Starting audit of ${articles.length} articles...`);

  const { flagged, clean, errors } = await processBatch(articles);

  // Print summary
  console.log(generateBatchSummary(flagged, clean, errors));

  // Print distribution chart
  const dist = computeDistribution([...flagged, ...clean]);
  printDistributionChart(dist, flagged.length + clean.length);

  // Print detailed reports for flagged articles
  console.log("\n🚩 FLAGGED ARTICLES — REQUIRES HUMAN REVIEW\n");
  for (const article of flagged.sort((a, b) => b.combined_score - a.combined_score)) {
    console.log(generateArticleReport(article));
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} articles could not be scanned:`);
    errors.forEach((e) => console.log(`  - ${e.id}: ${e.error}`));
  }
}

// Example usage
const weeklySubmissions: ArticleInput[] = [
  {
    id: "art-001",
    title: "10 Ways to Boost Your Productivity",
    author: "john.doe@example.com",
    content: "In today's fast-paced world, it is important to note...",
    submittedAt: "2025-03-22",
  },
  // ... 499 more articles
];

runWeeklyAudit(weeklySubmissions);
```

---

## Notes

- **Accuracy:** Expect ~10-15% false positive rate. Always route flagged articles to a human editor, never auto-reject.
- **Short articles:** Detection is unreliable for pieces under 200 words — skip automated scoring.
- **Multilingual:** Both LLM and GPTZero perform best on English. For other languages, raise the threshold to reduce false positives.
- **Cost:** Each GPTZero API call costs credits. At 500 articles/week, budget accordingly — consider LLM-only for the first pass and GPTZero only for borderline cases (score 4–7).
