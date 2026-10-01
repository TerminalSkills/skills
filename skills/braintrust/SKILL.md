---
name: braintrust
description: >-
  Braintrust is a hosted platform for evaluating and tracing LLM applications:
  it runs a task over a dataset, scores the outputs, stores each run as an
  experiment and logs production traces. Use when a user asks to write or run
  a Braintrust eval, score LLM outputs with autoevals, compare prompt or model
  versions as experiments, run evals in CI and fail on regressions, trace
  OpenAI or Anthropic calls with Braintrust, manage evaluation datasets, or
  use the bt CLI.
license: Apache-2.0
compatibility: 'Node.js 18.19+ or 20.6+ (TypeScript SDK) or Python 3.10+ (Python SDK); a Braintrust account and API key to store results; bt eval runs on macOS and Linux only'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
    - evaluation
    - llm
    - testing
    - observability
    - experiments
---

# Braintrust — AI Evaluation and Observability

## Overview

Braintrust measures the quality of LLM applications. An evaluation has three parts — **data** (test cases with `input` and `expected`), a **task** (the function under test) and **scores** (functions that grade each output from 0 to 1). Every run is stored as an experiment that can be compared with earlier runs. The same SDK logs production traces, and the `bt` CLI runs eval files, queries logs and manages datasets from a terminal. The platform is a hosted service (free Starter plan, self-hosting on Enterprise); the SDKs (`braintrust`), the scorer library (`autoevals`) and the CLI are open source. Official SDKs also exist for Go, Ruby, Java and C#; this skill covers TypeScript and Python.

## Instructions

### Install

```bash
npm install braintrust autoevals@latest openai   # TypeScript SDK, scorers, provider client
npm install --save-dev @braintrust/bt tsx        # bt CLI plus a TypeScript runner
pip install braintrust autoevals openai          # Python 3.10+
```

Keep `@latest` on `autoevals`: 0.3.0 declares a pnpm-only `engines` field, so a bare `npm install autoevals` silently resolves to the older 0.0.132 (with `@latest` npm prints an `EBADENGINE` warning and installs 0.3.0). `npx bt --version` prints `bt 0.22.1` or later. `bt` needs a runner for TypeScript files and picks the first it finds of `tsx`, `vite-node`, `ts-node`, `deno`; for Python it uses the active virtualenv.

### Authenticate

Create a key under Settings > API keys in the Braintrust app and export it. The SDKs and `bt` read it automatically; nothing has to be passed in code.

```bash
export BRAINTRUST_API_KEY="..."         # from your secret manager, never committed
export OPENAI_API_KEY="..."             # only if the task or an LLM scorer calls OpenAI
npx bt status                           # shows the active org and project
```

For interactive use `bt login` stores a profile instead (`bt login --oauth` opens the browser).

### Write and run an eval (TypeScript)

Name eval files `*.eval.ts` so `bt eval` discovers them. The first argument of `Eval` is the project name.

```typescript
// evals/support-bot.eval.ts
import { Eval } from "braintrust";
import { Factuality, Levenshtein } from "autoevals";
import OpenAI from "openai";

const openai = new OpenAI();

async function answerQuestion(question: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: "You are the support assistant for Parcelwise, a shipping-label app." },
      { role: "user", content: question },
    ],
  });
  return res.choices[0].message.content ?? "";
}

// Custom scorer: receives one object, returns a number in [0, 1] or { name, score }
const mentionsPrice = ({ output, expected }: { output: string; expected?: string }) => ({
  name: "mentions_price",
  score: /\$\d+/.test(output) === /\$\d+/.test(expected ?? "") ? 1 : 0,
});

Eval("support-bot", {
  experimentName: "gpt-5-mini-baseline",
  data: () => [
    { input: "How do I reset my password?", expected: "Go to Settings > Security > Reset password" },
    { input: "What does the Team plan cost?", expected: "The Team plan is $49 per month" },
  ],
  task: answerQuestion,
  scores: [Factuality, Levenshtein, mentionsPrice],
  metadata: { model: "gpt-5-mini", prompt_version: "v2" },
  trialCount: 3,        // run each case 3 times and average
  maxConcurrency: 5,
});
```

```bash
npx bt eval evals/support-bot.eval.ts        # run one file, upload the experiment
npx bt eval evals/                           # every *.eval.ts (or eval_*.py) under evals/; one language per run
npx bt eval --watch evals/support-bot.eval.ts
npx bt eval --first 20 evals/                # smoke run on the first 20 cases, marked non-final
npx bt eval --no-send-logs evals/            # run locally, upload nothing
npx bt eval --list evals/                    # list evaluators without running them
```

`bt` does not load `.env` files by itself: export the variables or pass `--env-file .env`. For TypeScript files `bt eval` auto-instruments supported LLM clients, so each model call inside the task appears as a span in the experiment.

### Write and run an eval (Python)

Name files `eval_*.py`. Custom scorers take `input`, `output`, `expected` as arguments.

```python
# evals/eval_support_bot.py
from autoevals import Factuality, Levenshtein
from braintrust import Eval, Score
from openai import OpenAI

client = OpenAI()

def answer_question(question: str) -> str:
    res = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[{"role": "user", "content": question}],
    )
    return res.choices[0].message.content or ""

def mentions_price(input, output, expected):
    return Score(name="mentions_price", score=1 if ("$" in output) == ("$" in expected) else 0)

Eval(
    "support-bot",
    experiment_name="gpt-5-mini-baseline",
    data=lambda: [
        {"input": "How do I reset my password?", "expected": "Go to Settings > Security > Reset password"},
        {"input": "What does the Team plan cost?", "expected": "The Team plan is $49 per month"},
    ],
    task=answer_question,
    scores=[Factuality, Levenshtein, mentions_price],
    metadata={"model": "gpt-5-mini"},
    trial_count=3,
    max_concurrency=5,
)
```

Run it with `npx bt eval evals/eval_support_bot.py`; `--num-workers 4` sets the number of Python worker threads.

### Scorers

`autoevals` ships ready-made scorers; import them and put them in `scores`.

| Kind | Scorers |
|------|---------|
| Deterministic | `ExactMatch`, `Levenshtein`, `NumericDiff`, `JSONDiff`, `ValidJSON`, `ListContains` |
| Embedding | `EmbeddingSimilarity` |
| Model-graded | `Factuality`, `ClosedQA`, `Battle`, `Humor`, `Possible`, `Security`, `Sql`, `Summary`, `Translation`, `Moderation` |
| RAG | `AnswerRelevancy`, `AnswerCorrectness`, `AnswerSimilarity`, `ContextPrecision`, `ContextRecall`, `ContextRelevancy`, `ContextEntityRecall`, `Faithfulness` |

For a rubric of your own, build an LLM judge: `LLMClassifierFromTemplate({ name, promptTemplate, choiceScores, useCoT })` in TypeScript, `LLMClassifier(name=..., prompt_template=..., choice_scores=..., model=...)` in Python. The template can reference `{{input}}`, `{{output}}` and `{{expected}}`.

### Datasets

Keep test cases in Braintrust instead of in code so the team can edit them and experiments can be compared row by row.

```typescript
// scripts/seed-dataset.ts — run once with: npx tsx scripts/seed-dataset.ts
import { initDataset } from "braintrust";

async function main() {
  const dataset = initDataset("support-bot", { dataset: "billing-questions" }); // created if missing
  dataset.insert({
    input: "Can I get a refund after 30 days?",
    expected: "Refunds are available within 30 days of purchase",
    metadata: { category: "billing" },
  });
  await dataset.flush();
}
main();
```

In the eval file, replace the inline array with the dataset: `data: initDataset("support-bot", { dataset: "billing-questions" })`. Python equivalent: `braintrust.init_dataset(project="support-bot", name="billing-questions")`, then `dataset.insert(input=..., expected=..., metadata=...)` and `dataset.flush()`.

### Trace production calls

```typescript
// src/tracing.ts — call once at startup, before any LLM call
import { initLogger, wrapOpenAI, wrapTraced } from "braintrust";
import OpenAI from "openai";

export const logger = initLogger({ projectName: "support-bot" });
export const openai = wrapOpenAI(new OpenAI());       // every call is logged with tokens and latency

export const retrieveArticles = wrapTraced(async function retrieveArticles(query: string) {
  return searchHelpCenter(query);                      // arguments and return value become a span
});
```

On Node.js the wrapper can be skipped by starting the process with `node --import braintrust/hook.mjs dist/server.js`, which patches supported provider SDKs at load time.

In Python call `braintrust.init_logger(project="support-bot")` and then `braintrust.auto_instrument()` before any provider client is created, and decorate your own functions with `@traced` (Example 2 shows the full file). `wrap_openai(OpenAI())` is the manual alternative to auto-instrumentation.

### Run evals in CI

```yaml
# .github/workflows/evals.yml
on: pull_request
permissions:
  pull-requests: write
  contents: read
jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - uses: braintrustdata/eval-action@v2
        with:
          api_key: ${{ secrets.BRAINTRUST_API_KEY }}
          runtime: node          # or python, go
          paths: evals
```

The action posts a score summary as a pull-request comment (the `permissions` block is required for that) and, with its default `use_proxy: true`, sends LLM calls through the Braintrust proxy, which caches repeated requests. On other CI systems run `npx bt eval evals/ --no-input --json` with `BRAINTRUST_API_KEY` set.

## Examples

### Example 1: Check a prompt change before merging

**User request:** "I changed the system prompt of our support bot. Tell me if answers got worse, and don't upload anything yet."

Run the existing eval file locally and read the scores as JSON:

```bash
npx bt eval --no-send-logs --jsonl evals/support-bot.eval.ts > scores.jsonl
jq -c '.scores | map_values(.score)' scores.jsonl
```

```json
{"Factuality":0.8,"Levenshtein":0.75,"mentions_price":1.0}
```

To make the same check fail a pipeline, add a threshold: `jq -e '.scores.Levenshtein.score >= 0.7' scores.jsonl` exits 1 when the score is lower. Once the numbers look right, drop `--no-send-logs`; the run is uploaded as an experiment and the summary prints a link where it can be compared with earlier experiments.

### Example 2: Add tracing to a Python RAG service

**User request:** "Our FastAPI app answers questions from our docs with OpenAI. I want every request in Braintrust, with the retrieval step visible."

```python
# app/main.py
import braintrust
from braintrust import traced

braintrust.init_logger(project="docs-assistant")
braintrust.auto_instrument()

from fastapi import FastAPI
from openai import OpenAI

app = FastAPI()
client = OpenAI()

@traced
def retrieve(question: str) -> list[str]:
    return vector_store.search(question, limit=4)

@traced
def answer(question: str) -> str:
    context = "\n\n".join(retrieve(question))
    res = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {"role": "system", "content": f"Answer from this context only:\n{context}"},
            {"role": "user", "content": question},
        ],
    )
    return res.choices[0].message.content or ""

@app.post("/ask")
def ask(question: str) -> dict:
    return {"answer": answer(question)}
```

Each request to `/ask` now appears under Logs in the `docs-assistant` project as one trace with three spans: `answer`, a nested `retrieve` span holding the question and the returned chunks, and the OpenAI call with its prompt, completion, token counts and latency.

## Guidelines

- `bt eval` exits non-zero only when an eval throws. A low score does not fail the build by itself — gate on the `--jsonl` output as in Example 1. `braintrustdata/eval-action` posts the scores on the pull request for review.
- A custom scorer in TypeScript takes a single object (`{ input, output, expected, metadata }`); in Python it takes those names as arguments. Return a number between 0 and 1, or an object with `name` and `score`.
- LLM-judge scorers make model calls of their own, so they cost tokens and are not deterministic. Use `trialCount` / `trial_count` for noisy tasks and prefer deterministic scorers where an exact check exists.
- `autoevals` before 0.3.0 sends `OPENAI_API_KEY` to the Braintrust endpoint when both keys are set. If a scorer fails with `401 Braintrust gateway error`, upgrade `autoevals` or give it an explicit client: `init({ client: new OpenAI({ apiKey: process.env.BRAINTRUST_API_KEY, baseURL: "https://gateway.braintrust.dev" }) })`.
- Call `initLogger` / `init_logger` once at startup. In serverless functions and short scripts, flush before exit (`await logger.flush()`), or the last spans are lost.
- Traces contain prompts and completions. Do not log secrets or personal data you may not send to a third party; the SDKs support a masking function for redaction, and Enterprise plans can self-host the data plane.
- Keep keys in environment variables or CI secrets. The Python SDK also reads `BRAINTRUST_API_KEY` from a `.env.braintrust` file — add it to `.gitignore`.
- The older `npx braintrust eval` and Python `braintrust eval` commands still ship with the SDKs, but the documentation now uses `bt eval`; `bt eval` is not available on Windows, so use WSL there.
- Starter-plan limits apply to stored scores and ingested data (10k scores per month at the time of writing); run large sweeps with `--first` or `--sample` first.
