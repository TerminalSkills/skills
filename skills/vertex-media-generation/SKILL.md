---
name: vertex-media-generation
description: >-
  Generates images with Gemini image models and videos with Veo through the
  Vercel AI SDK Google Vertex provider. Use when the user wants to generate
  or edit images, generate videos, migrate off discontinued Imagen models,
  or build media pipelines with @ai-sdk/google-vertex. Covers Gemini image
  models and Veo 3.1.
license: Apache-2.0
compatibility: "Node.js 18+, npm/pnpm/yarn, @ai-sdk/google-vertex and ai packages, Google Cloud project with Vertex AI API enabled"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/vercel/ai
  category: data-ai
  tags: ["vertex-ai", "gemini-image", "veo", "image-generation", "video-generation"]
---

# Vertex Media Generation

## Overview

Build image and video generation features using Google Vertex AI through the Vercel AI SDK. Covers Gemini image models for image generation and mask-free editing (Google discontinued the Imagen endpoints on Vertex AI) and Veo 3.1 for video generation with optional audio. Uses the `@ai-sdk/google-vertex` provider with the unified `ai` SDK.

## Instructions

### Step 1: Set up the project

```bash
npm install ai @ai-sdk/google-vertex
gcloud auth application-default login
```

Use the default provider instance (reads `GOOGLE_CLOUD_PROJECT` from env), or create a custom one:

```typescript
import { vertex } from '@ai-sdk/google-vertex';
// Or: import { createVertex } from '@ai-sdk/google-vertex';
// const vertex = createVertex({ project: 'my-gcp-project', location: 'us-central1' });
```

### Step 2: Generate images with Gemini image models

Google has discontinued the Imagen endpoints on Vertex AI (`imagen-3.0-generate-002`, `imagen-3.0-capability-001`, `imagen-4.0-generate-001`, `-fast-` and `-ultra-`). Google's replacement mapping points all of them to `gemini-2.5-flash-image`, and the AI SDK Vertex page now documents only Gemini image models. Use `generateImage` with one of these:

```typescript
import { vertex } from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';

const { image } = await generateImage({
  model: vertex.image('gemini-2.5-flash-image'),
  prompt: 'A futuristic cityscape at sunset',
  aspectRatio: '16:9',
});
```

| Model | Notes |
|-------|-------|
| `gemini-2.5-flash-image` | Stable default, the documented replacement for Imagen |
| `gemini-3-pro-image-preview` | Preview; up to 14 reference images |
| `gemini-3.1-flash-image-preview` | Preview |

Gemini image models do not support `size` or `n`; use `aspectRatio` (`1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`). Preview model ids change often, so check the AI SDK Vertex page before pinning one.

Provider options go under `providerOptions.vertex` (type `GoogleVertexImageModelOptions`):

```typescript
const { image } = await generateImage({
  model: vertex.image('gemini-3-pro-image-preview'),
  prompt: 'Professional headshot portrait',
  providerOptions: {
    vertex: {
      imageConfig: {
        aspectRatio: '1:1',
        imageSize: '2K',
        personGeneration: 'allow_adult',
      },
    },
  },
});
```

Documented `imageConfig` keys: `aspectRatio`, `imageSize` (`1K`, `2K`, `4K`), `personGeneration`, `prominentPeople`, `imageOutputOptions` (`mimeType`, `compressionQuality`).

### Step 3: Edit images

Gemini editing is mask-free: pass the source image(s) with an instruction. Inputs may be `Buffer`, `ArrayBuffer`, `Uint8Array` or base64 strings; URLs and `gs://` paths are not supported, and mask-based inpainting is not supported by the AI SDK Gemini image path.

```typescript
import fs from 'fs';

const { image } = await generateImage({
  model: vertex.image('gemini-2.5-flash-image'),
  prompt: {
    text: 'Add a golden retriever sitting on the grass on the left',
    images: [fs.readFileSync('./photo.png')],
  },
});
fs.writeFileSync('photo-edited.png', Buffer.from(image.base64, 'base64'));
```

Describe what to keep and what to change ("keep the mug unchanged, replace the background with a beach"). The old Imagen edit modes (`EDIT_MODE_INPAINT_INSERTION`, `EDIT_MODE_BGSWAP`, `maskMode`) belong to the discontinued Imagen capability model.

### Step 4: Generate videos with Veo

Use `experimental_generateVideo` for video generation. Video generation is asynchronous and may take several minutes:

```typescript
import { vertex } from '@ai-sdk/google-vertex';
import { experimental_generateVideo as generateVideo } from 'ai';

const { video } = await generateVideo({
  model: vertex.video('veo-3.1-generate-001'),
  prompt: 'Aerial drone shot of a coral reef with tropical fish',
  aspectRatio: '16:9',
  resolution: '1920x1080',
  duration: 8,
});
```

Available Veo models:

| Model | Notes |
|-------|-------|
| `veo-3.1-generate-001` | Audio; 720p/1080p (4K output); 4, 6 or 8 s; 16:9 or 9:16 |
| `veo-3.1-fast-generate-001` | Audio; faster, up to 1080p |
| `veo-3.1-lite-generate-001` | Preview |

`veo-3.0-generate-001` and `veo-3.0-fast-generate-001` were retired on June 30, 2026; Google's replacements are the matching 3.1 ids. `veo-2.0-generate-001` is listed in the AI SDK docs but absent from Google's current Veo pages, so prefer 3.1. Veo 3.1 supports `frameImages` (`first_frame` / `last_frame`) for image-to-video.

Configure with provider options:

```typescript
const { video } = await generateVideo({
  model: vertex.video('veo-3.1-generate-001'),
  prompt: 'Time-lapse of a flower blooming',
  aspectRatio: '16:9',
  providerOptions: {
    vertex: {
      generateAudio: true,
      personGeneration: 'allow_adult',
      negativePrompt: 'blurry, shaky, low-resolution',
      pollIntervalMs: 5000,
      pollTimeoutMs: 600000,
    },
  },
});
```

Provider options: `generateAudio` (boolean), `personGeneration`, `negativePrompt`, `gcsOutputDirectory` (GCS URI), `referenceImages` (style guidance), `pollIntervalMs` (check interval), `pollTimeoutMs` (max wait; set at least 600000).

## Examples

### Example 1: Product photography pipeline

**User request:** "Generate product photos for an e-commerce listing of a ceramic mug"

**Actions taken:**

```typescript
import { vertex } from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';
import fs from 'fs';

const backgrounds = [
  'Minimalist white marble countertop with soft natural lighting',
  'Cozy breakfast table with morning sunlight and croissants',
  'Modern office desk with laptop and notebook, shallow depth of field',
];

for (const [i, scene] of backgrounds.entries()) {
  const { image } = await generateImage({
    model: vertex.image('gemini-2.5-flash-image'),
    prompt: `Professional product photo of a handmade ceramic coffee mug, earth-tone glaze, ${scene}. No text, logo or watermark.`,
    aspectRatio: '1:1',
  });

  fs.writeFileSync(`mug-scene-${i + 1}.png`, Buffer.from(image.base64, 'base64'));
  console.log(`Saved mug-scene-${i + 1}.png`);
}
```

**Expected output:** Three 1:1 product images saved as PNG files, each showing the mug in a different setting.

### Example 2: Video ad generation with audio

**User request:** "Create a short video ad for a hiking app launch"

**Actions taken:**

```typescript
import { vertex } from '@ai-sdk/google-vertex';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'fs';

const { video } = await generateVideo({
  model: vertex.video('veo-3.1-generate-001'),
  prompt: `Cinematic drone shot following a solo hiker ascending a mountain trail
at golden hour. Camera starts low behind the hiker and rises to reveal a
panoramic vista of snow-capped peaks. Style: epic, aspirational, warm color
grading. Text overlay space at the top third of the frame.`,
  aspectRatio: '9:16',
  resolution: '1080x1920',
  duration: 8,
  providerOptions: {
    vertex: {
      generateAudio: true,
      negativePrompt: 'shaky camera, low quality, overexposed, urban elements',
      pollTimeoutMs: 600000,
    },
  },
});

fs.writeFileSync('hiking-app-ad.mp4', Buffer.from(video.base64, 'base64'));
console.log('Saved hiking-app-ad.mp4');
```

**Expected output:** An 8-second vertical video with generated audio, saved as MP4.

### Example 3: Image editing, background swap

**User request:** "Replace the background of this product photo with a beach scene"

**Actions taken:**

```typescript
import { vertex } from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';
import fs from 'fs';

const { image } = await generateImage({
  model: vertex.image('gemini-2.5-flash-image'),
  prompt: {
    text: 'Keep the product exactly as it is. Replace the background with a sandy tropical beach at sunset with palm trees and calm waves.',
    images: [fs.readFileSync('./product-original.png')],
  },
});

fs.writeFileSync('product-beach-bg.png', Buffer.from(image.base64, 'base64'));
console.log('Saved product-beach-bg.png');
```

**Expected output:** The product preserved with a new beach background, no mask file needed.

## Guidelines

- Do not build on Imagen ids (`imagen-3.0-*`, `imagen-4.0-*`): Google lists them as discontinued. Existing code should move to `gemini-2.5-flash-image` or a newer Gemini image model, and drop `negativePrompt`, `addWatermark`, `safetySetting` and `storageUri`, which were Imagen options. Put exclusions in the prompt text.
- Use `aspectRatio` instead of `size`; `n` is also unsupported for Gemini image models.
- Set `pollTimeoutMs` to at least 600000 (10 min) for Veo; generation can take several minutes.
- For production video pipelines, set `gcsOutputDirectory` to write to Cloud Storage instead of holding base64 in memory.
- Video generation is `experimental_generateVideo`; the API may change between SDK versions, and preview model ids are renamed often.
- `fast` variants trade quality for speed: use them for drafts, standard models for final output.
- `personGeneration` defaults to blocking people; set `allow_adult` or `allow_all` when people are intended.
- Billing applies to every Vertex AI generation call, and Veo costs far more per call than images. Authenticate with `gcloud auth application-default login` locally and a service account in production; never commit key files.
