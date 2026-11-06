---
title: "Generate AI Media Assets at Scale with Tested Prompts"
slug: generate-ai-media-assets-at-scale
description: "Create consistent, brand-aligned images and videos using Vertex AI media generation with systematically tested and optimized prompts."
skills:
  - vertex-media-generation
  - prompt-tester
category: data-ai
tags:
  - image-generation
  - video-generation
  - prompt-engineering
  - vertex-ai
  - media-production
---

# Generate AI Media Assets at Scale with Tested Prompts

## The Problem

A content marketing team at an e-commerce company needs around 200 product lifestyle images and a few dozen short video clips every month for social media, email and landing pages. Photo shoots are slow and expensive to schedule. AI generation is fast, but the results are inconsistent: one prompt gives a great hero image and a slight variation gives wrong colors, odd proportions or an off-brand style. They need a repeatable system where prompts are tested and scored before anyone runs a batch.

## The Solution

The **prompt-tester** skill structures the prompt templates, rubric and comparison, so the winning template is chosen on scored evidence rather than favorites. The **vertex-media-generation** skill then runs that template through Gemini image models (`gemini-3.1-flash-lite-image`) and Veo 3.1 on Vertex AI, using the `ai` SDK with `@ai-sdk/google-vertex`.

Google has discontinued the Imagen endpoints on Vertex AI (`imagen-3.0-*`, `imagen-4.0-*`, `imagegeneration@00x`) and maps them to Gemini image models. `gemini-2.5-flash-image`, the first replacement, is itself deprecated and retires on March 15, 2027, so this page uses its successor `gemini-3.1-flash-lite-image`. Any older prompt pipeline that calls Imagen with `style_preset`, `size` or `n` parameters has to move to the calls below.

## Step-by-Step Walkthrough

### 1. Define brand criteria and build prompt templates

> Create 5 prompt template variants for product lifestyle photography, each with variables `{product_name}`, `{scene_setting}`, `{lighting_style}` and `{color_palette}`. Brand rules: warm natural lighting, earth-tone backgrounds, minimalist composition, no text or logos in the image, 16:9. Write a scoring rubric with brand_consistency, composition_quality, product_visibility and usability, each 0-10, with a one-line description of what a 3, 6 and 9 look like.

Templates separate structure from content, so any product can be swapped in without changing the style. Keep them as plain files (`prompts/a.txt` ... `prompts/e.txt`) in version control.

### 2. Generate test samples and score them

> For each template and each of three products (wireless earbuds, ceramic mug, leather wallet) generate 2 images with `gemini-3.1-flash-lite-image` via `generateImage` and save them under `tests/<template>/<product>/`. Then score every image against the rubric and build a matrix of average scores per template and per product.

```typescript
import { generateImage } from 'ai';
import { createVertex } from '@ai-sdk/google-vertex';

// The image model is served from the global location only.
const vertexGlobal = createVertex({ location: 'global' }) // project from GOOGLE_VERTEX_PROJECT;

const { image } = await generateImage({
  model: vertexGlobal.image('gemini-3.1-flash-lite-image'),
  prompt: renderedTemplate,
  aspectRatio: '16:9',
});
fs.writeFileSync(file, image.uint8Array);
```

Gemini image models take `aspectRatio` (for example `16:9` or `4:5`), not `size` or `n`: make several images with a loop. Scoring needs a judge. A vision model as judge is quick but noisy, so use it to shortlist and have a designer confirm the top two templates. Thirty samples are enough to separate a clearly better template from a worse one; they do not prove small differences.

### 3. Generate the batch

Run the winning template over the catalog with a small script, not a one-off chat request, so failures are logged and reruns are cheap.

> Using `prompts/winner.txt`, generate 3 variations per product in `products.json` with `gemini-3.1-flash-lite-image`, `aspectRatio: '16:9'`, at most 4 requests in flight, `maxRetries: 4`. Save to `generated_assets/<slug>/<slug>-v<n>.png`, write failures to `failed.txt`, then score the outputs with the rubric and list everything below 7 for regeneration.

The script the agent writes follows this shape (a 4-worker queue; `failed.txt` holds any request that still failed after retries):

```typescript
const jobs = products.flatMap((p) => [1, 2, 3].map((n) => [p, n]));
async function worker() {
  for (let job = jobs.shift(); job; job = jobs.shift()) {
    try { await render(...job); } catch (err) { failed.push(`${job[0].slug}: ${err.message}`); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
```

Check your project's Vertex AI quota and the current price per image on the Vertex AI pricing page before a large run, and do a 5-product pilot first. Regenerate low scorers with a corrective instruction (tighter crop for occluded products, the exact hex codes for palette drift) rather than rerunning the same prompt. Gemini image models can also edit: pass the source photo as a `Buffer` with an instruction such as "keep the mug unchanged, replace the background with a beach". There is no mask-based inpainting.

### 4. Generate short videos with Veo

> Generate an 8-second 1080p clip for each of the top 10 products with `veo-3.1-generate-001` (use `veo-3.1-fast-generate-001` for drafts). Adapt the winning template: start on a close-up of the product, pull back to reveal the scene, end on a hero composition. 16:9, 2 variations each, `pollTimeoutMs: 600000`.

```typescript
import { experimental_generateVideo as generateVideo } from 'ai';
import { vertex } from '@ai-sdk/google-vertex'; // location from GOOGLE_VERTEX_LOCATION, e.g. us-central1

const { video } = await generateVideo({
  model: vertex.video('veo-3.1-generate-001'),
  prompt,
  aspectRatio: '16:9',
  resolution: '1920x1080',
  duration: 8,
  providerOptions: { vertex: { generateAudio: false, pollTimeoutMs: 600000 } },
});
fs.writeFileSync(`${slug}.mp4`, video.uint8Array);
```

Veo 3.1 clips are 4, 6 or 8 seconds, in 16:9 or 9:16, at 720p or 1080p (with 4K output) and 24 fps. For a longer ad, generate several clips and join them in an editor. Generation is asynchronous and takes minutes per clip, so run videos as a separate job from the images. `veo-3.0-*` ids were retired on June 30, 2026; use the 3.1 ids.

## Real-World Example

A small e-commerce brand piloted this on 40 catalog products. In their own run, the testing afternoon showed that their flat-lay templates scored higher against the rubric than the in-use lifestyle templates for a minimalist brand, so they dropped the lifestyle set. They generated three variations per product, the design team approved roughly one image in two to three per product, and the rest were regenerated with corrective prompts. The team kept the rubric and template files in version control and reran the scoring whenever Google changed the model behind a model id. The video step stayed an experiment: clips went out only after a designer cut and approved them.

## Tips

- Pin the model id (`gemini-3.1-flash-lite-image`, `veo-3.1-generate-001`) in the template config. Preview ids change often; check the AI SDK Vertex provider page before pinning one.
- Put exact hex codes from the brand guide in the prompt ("#D4C5A9 background"); color names are ambiguous.
- AI-generated product images should still match the real product. Have a person check shape, logo and color against the item before publishing, and follow your marketplace's disclosure rules for generated imagery.
- Authenticate with `gcloud auth application-default login` (or a service account on a server) and set `GOOGLE_VERTEX_PROJECT` and `GOOGLE_VERTEX_LOCATION` (the variables the AI SDK Vertex provider reads); never put credentials in the prompt files.

## Related Skills

- [vertex-media-generation](/skills/vertex-media-generation) — generates and edits images with Gemini image models and videos with Veo 3.1 through the AI SDK Vertex provider
- [prompt-tester](/skills/prompt-tester) — defines the rubric and test set, runs the template variants and compares scores before the batch
