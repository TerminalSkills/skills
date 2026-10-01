---
name: gptzero
description: >-
  Integrates the GPTZero API for AI content detection: a hosted detector that
  classifies a text as human-written, AI-generated or mixed, with per-sentence
  probability scores — text scanning, file upload, batch processing. Use when:
  programmatic AI content scanning, academic integrity tools, content
  moderation pipelines.
license: Apache-2.0
compatibility: "Requires a GPTZero API key (API subscription plan) and any HTTP client; the examples use Node.js 18+ with native fetch, curl and jq"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["ai-detection", "gptzero", "content-moderation", "text-analysis"]
---

# GPTZero API Integration

## Overview

GPTZero is a specialized AI content detection service. Its API classifies a document as `human`, `ai` or `mixed`, says how confident it is, and returns a probability for every sentence. The FAQ lists ChatGPT, GPT-3 through GPT-6, Gemini, Claude and services built on them as the models it works across.

- **API base URL:** `https://api.gptzero.me` (detection paths start with `/v2/`, usage with `/v3/`)
- **Auth:** `x-api-key` header
- **Docs:** https://gptzero.me/docs (redirects to the reference at https://gptzero.stoplight.io/)

## Instructions

### Authentication

Create an account at https://app.gptzero.me, subscribe to an API plan, and copy the key from https://app.gptzero.me/app/api. Set it as `GPTZERO_API_KEY` in the environment and send it in the `x-api-key` header on every request. Call the API from a server: a key shipped in browser code can be read by anyone.

### Single Text Analysis — POST `/v2/predict/text`

```bash
curl -sS https://api.gptzero.me/v2/predict/text \
  -H "x-api-key: $GPTZERO_API_KEY" -H "Content-Type: application/json" \
  -d '{"document": "The Industrial Revolution fundamentally transformed Western society in numerous ways."}'
```

Body fields: `document` (required), `multilingual` (boolean), `modelVersion` and `apiVersion` (strings, both default to the latest). Text beyond 50,000 characters is cut off without an error.

The response has `version` (detector release, such as `2025-11-28-base`), `scanId`, and a `documents` array with one object per document:

- `predicted_class` — `"human"`, `"ai"` or `"mixed"`
- `class_probabilities` — `{ human, ai, mixed }`, each 0-1; the value for the predicted class is the chance the prediction is right
- `confidence_category` — `"high"`, `"medium"` or `"low"`
- `document_classification` — `"HUMAN_ONLY"`, `"MIXED"` or `"AI_ONLY"`
- `result_message` — the sentence GPTZero shows its own users, for example "Our detector is highly confident that the text is written by AI."
- `subclass` — an object, not a string: `subclass.ai.predicted_class` is `pure_ai` or `ai_paraphrased`, `subclass.mixed.predicted_class` is `concatenated` or `polished`; only the key matching the document's class is present, and it is `{}` for `human` in the reference's sample
- `sentences[]` — `sentence`, `generated_prob` (0-1), `perplexity`, `highlight_sentence_for_ai`
- `paragraphs[]` — `start_sentence_index` and `num_sentences` for each newline-separated paragraph

`completely_generated_prob` and `average_generated_prob` are still returned but marked deprecated or internal in the reference; new code should read `predicted_class` and `class_probabilities`.

### Score Interpretation

| `predicted_class` | `confidence_category` | Meaning |
|-------------------|-----------------------|---------|
| `ai`              | `high`                | Very likely AI-generated |
| `mixed`           | `high`                | Human and AI text in one document; see `subclass` and the flagged sentences |
| `human`           | `high`                | Very likely human-written |
| any               | `medium` or `low`     | Uncertain — do not act on it without a human reading the text |

`high` is defined by GPTZero as a threshold with an error rate under 1%. Do not invent cut-offs on the raw probabilities.

### File Upload — POST `/v2/predict/files`

```bash
curl -sS https://api.gptzero.me/v2/predict/files \
  -H "x-api-key: $GPTZERO_API_KEY" \
  -F "files=@essays/okafor-week3.txt" \
  -F "files=@essays/lindqvist-week3.txt"
```

Multipart form data with a repeated `files` field: by default at most 50 files and 15 MB in total per request, each file truncated to 50,000 characters. The reference does not list the accepted file formats. Optional form fields `modelVersion` and `apiVersion`; the old `version` field is deprecated. The response has the same shape as text analysis, with one entry in `documents` per file. The schema has no file-name field, so when the result must be tied to a file with certainty, send one file per request.

### Batch Processing

Use the files endpoint for up to 50 documents at once, or call the text endpoint with a small number of parallel requests. The reference does not publish numeric rate limits: HTTP 429 means the plan's word limit or the hourly rate limit was reached, so stop, wait and retry later instead of hammering. A 429 on a paid plan can also mean the `x-api-key` header was malformed and the request was counted as a free user.

Check the remaining quota before a large batch:

```bash
curl -sS https://api.gptzero.me/v3/usage-stats -H "x-api-key: $GPTZERO_API_KEY"
# {"data":{"words_left":429569,"words_used":70431,"cycle_start":1739985107,"cycle_end":1742342400,"plan":"Professional"}}
```

`words_left` is `null` on the metered API (Enterprise) plan.

### Flagged Sentences

Filter `sentences` where `highlight_sentence_for_ai === true` to extract the specific sentences GPTZero considers AI-generated. Sentences with `should_mask: true` (reference lists, tables, code blocks — see `masking_reason`) are excluded from highlighting and scoring.

### Model and API Versions

`GET /v2/model-versions/ai-scan` and `GET /v2/api-versions/ai-scan` list the available versions. Pass `modelVersion` to keep results comparable across a study or an appeal; leave it out to follow the newest model. Do not combine `modelVersion` with `multilingual: true` — only the latest multilingual model is kept.

## Examples

### Example 1: Scanning a student essay

A university teaching assistant asks: "Check this submitted essay with GPTZero and show me which sentences it flags."

```js
// scan-essay.mjs — run: node scan-essay.mjs essays/okafor-week3.txt
import { readFile } from "node:fs/promises";

const res = await fetch("https://api.gptzero.me/v2/predict/text", {
  method: "POST",
  headers: { "x-api-key": process.env.GPTZERO_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ document: await readFile(process.argv[2], "utf8") }),
});
if (!res.ok) throw new Error(`GPTZero ${res.status}: ${await res.text()}`);

const { version, documents: [doc] } = await res.json();
const flagged = doc.sentences.filter((s) => s.highlight_sentence_for_ai);

console.log(`${doc.predicted_class} (${doc.confidence_category} confidence), model ${version}`);
console.log(doc.result_message);
console.log(`${flagged.length} of ${doc.sentences.length} sentences flagged:`);
for (const s of flagged) console.log(`  ${s.generated_prob.toFixed(2)}  ${s.sentence}`);
```

Output for an essay the detector classifies as AI-written (the figures depend on the text and the model version):

```text
ai (high confidence), model 2025-11-28-base
Our detector is highly confident that the text is written by AI.
3 of 3 sentences flagged:
  1.00  The Industrial Revolution fundamentally transformed Western society in numerous ways.
  1.00  It is worth noting that the shift from agrarian economies to industrial manufacturing created unprecedented urbanization.
  1.00  Furthermore, the development of steam power and mechanized production significantly altered labor dynamics.
```

The assistant reports the class, the confidence and the flagged sentences, and states that this is a signal for a conversation with the student, not proof.

### Example 2: Verifying a journalist's draft

An editor asks: "Run the pipe-burst story through GPTZero before it goes out."

```bash
jq -Rs '{document: .}' drafts/crenshaw-pipe-burst.txt \
  | curl -sS https://api.gptzero.me/v2/predict/text \
      -H "x-api-key: $GPTZERO_API_KEY" -H "Content-Type: application/json" -d @- \
  | jq '.documents[0] | {predicted_class, confidence_category, class_probabilities, document_classification}'
```

Result for a draft the detector classifies as human-written (figures from the reference's human sample; yours depend on the text):

```json
{
  "predicted_class": "human",
  "confidence_category": "high",
  "class_probabilities": {
    "human": 0.9999096668118884,
    "ai": 0.0000851143346127509,
    "mixed": 0.000005218853498791157
  },
  "document_classification": "HUMAN_ONLY"
}
```

`jq -Rs` reads the whole file as one JSON string, so quotes and line breaks in the draft cannot break the request body.

## Guidelines

- Short texts are unreliable: GPTZero's FAQ says accuracy increases as more text is submitted and that the document-level result is more accurate than paragraph- or sentence-level ones, so do not judge a few sentences or a single flagged line
- English is the default model; `multilingual: true` switches to the multilingual model, which the reference lists for French and Spanish (other languages fall back to the English model)
- Paraphrased or AI-polished text is harder to call: look at `subclass.ai.predicted_class` and `subclass.mixed.predicted_class` (`ai_paraphrased`, `polished`) rather than only at the top-level class
- Input over 50,000 characters is truncated silently — split long documents and scan the parts
- API access needs an API subscription plan; quotas are counted in words per billing cycle. Check `/v3/usage-stats` and https://gptzero.me/pricing rather than assuming a free allowance
- Errors come back as `{ "error": "…" }`. The files endpoint documents 400 for an invalid request, 404 when the key, profile or plan is not found or the key has expired, 429 for the word or rate limit, and 500 for a failure on GPTZero's side
- Submitting a document sends it to a third party: check your institution's or client's rules before uploading student work or unpublished drafts
- Always route flagged content to human review — no detector is 100% accurate, and a false accusation is costly
