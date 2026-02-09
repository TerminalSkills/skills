---
name: vertex-media-generation
description: >-
  Generate images with Imagen and videos with Veo using the Vercel AI SDK
  Google Vertex provider. Use when the user wants to generate images, edit
  images (inpainting, outpainting, background swap), generate videos, or
  build media generation pipelines with @ai-sdk/google-vertex. Covers Imagen
  4.0/3.0 and Veo 3.1/3.0/2.0 models.
license: Apache-2.0
compatibility: "Node.js 18+, npm/pnpm/yarn, @ai-sdk/google-vertex and ai packages, Google Cloud project with Vertex AI API enabled"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["vertex-ai", "imagen", "veo", "image-generation", "video-generation"]
---

# Vertex Media Generation

## Overview

Build image and video generation features using Google Vertex AI through the Vercel AI SDK. Covers Imagen models for image generation and editing (inpainting, outpainting, background swap) and Veo models for video generation with optional audio. Uses the `@ai-sdk/google-vertex` provider with the unified `ai` SDK.

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

### Step 2: Generate images with Imagen

Use `generateImage` from the `ai` package with a Vertex image model:

```typescript
import { vertex } from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';

const { image } = await generateImage({
  model: vertex.image('imagen-4.0-generate-001'),
  prompt: 'A futuristic cityscape at sunset',
  aspectRatio: '16:9',
});
```

Imagen does NOT support the `size` parameter. Use `aspectRatio` instead. Supported ratios: `1:1`, `3:4`, `4:3`, `9:16`, `16:9`.

Available Imagen models:

| Model | Speed | Quality |
|-------|-------|---------|
| `imagen-4.0-ultra-generate-001` | Slow | Highest |
| `imagen-4.0-generate-001` | Medium | High |
| `imagen-4.0-fast-generate-001` | Fast | Good |
| `imagen-3.0-generate-002` | Medium | High |
| `imagen-3.0-fast-generate-001` | Fast | Good |

Configure generation with provider options:

```typescript
const { image } = await generateImage({
  model: vertex.image('imagen-4.0-generate-001'),
  prompt: 'Professional headshot portrait',
  aspectRatio: '1:1',
  providerOptions: {
    vertex: {
      negativePrompt: 'blurry, low-quality, distorted',
      personGeneration: 'allow_adult',
      safetySetting: 'block_medium_and_above',
      addWatermark: true,
    },
  },
});
```

Provider options: `negativePrompt` (exclude elements), `personGeneration` (`allow_adult` | `allow_all` | `dont_allow`), `safetySetting` (`block_low_and_above` | `block_medium_and_above` | `block_only_high` | `block_none`), `addWatermark` (boolean, default true), `storageUri` (GCS path).

### Step 3: Edit images with Imagen

Use `imagen-3.0-capability-001` for inpainting, outpainting, and background swap. Provide the source image and a mask (white pixels = area to edit):

```typescript
import { generateImage } from 'ai';
import fs from 'fs';

const sourceImage = fs.readFileSync('./photo.png');
const mask = fs.readFileSync('./mask.png');

const { images } = await generateImage({
  model: vertex.image('imagen-3.0-capability-001'),
  prompt: {
    text: 'Add a golden retriever sitting on the grass',
    images: [sourceImage],
    mask,
  },
  providerOptions: {
    vertex: {
      edit: {
        mode: 'EDIT_MODE_INPAINT_INSERTION',
        maskMode: 'MASK_MODE_USER_PROVIDED',
        baseSteps: 50,
        maskDilation: 0.01,
      },
    },
  },
});
```

Edit modes: `EDIT_MODE_INPAINT_INSERTION` (add objects), `EDIT_MODE_INPAINT_REMOVAL` (remove objects), `EDIT_MODE_OUTPAINT` (extend canvas), `EDIT_MODE_BGSWAP` (replace background), `EDIT_MODE_PRODUCT_IMAGE` (product photography), `EDIT_MODE_CONTROLLED_EDITING` (style transfer). The `baseSteps` parameter (35-75) controls quality: higher values produce better results but take longer.

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

| Model | Audio |
|-------|-------|
| `veo-3.1-generate-001` | Yes |
| `veo-3.1-fast-generate-001` | Yes |
| `veo-3.0-generate-001` | Yes |
| `veo-3.0-fast-generate-001` | Yes |
| `veo-2.0-generate-001` | No |

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

Provider options: `generateAudio` (boolean), `personGeneration`, `negativePrompt`, `gcsOutputDirectory` (GCS URI), `referenceImages` (style guidance), `pollIntervalMs` (check interval), `pollTimeoutMs` (max wait, default 10 min for long videos).

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
    model: vertex.image('imagen-4.0-generate-001'),
    prompt: `Professional product photo of a handmade ceramic coffee mug, earth-tone glaze, ${scene}`,
    aspectRatio: '1:1',
    providerOptions: {
      vertex: {
        negativePrompt: 'text, watermark, logo, blurry, oversaturated',
        addWatermark: false,
      },
    },
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

### Example 3: Image editing — background swap

**User request:** "Replace the background of this product photo with a beach scene"

**Actions taken:**

```typescript
import { vertex } from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';
import fs from 'fs';

const sourceImage = fs.readFileSync('./product-original.png');
const mask = fs.readFileSync('./background-mask.png');

const { images } = await generateImage({
  model: vertex.image('imagen-3.0-capability-001'),
  prompt: {
    text: 'Sandy tropical beach at sunset with palm trees and calm ocean waves',
    images: [sourceImage],
    mask,
  },
  providerOptions: {
    vertex: {
      edit: {
        mode: 'EDIT_MODE_BGSWAP',
        maskMode: 'MASK_MODE_USER_PROVIDED',
        baseSteps: 60,
      },
    },
  },
});

fs.writeFileSync('product-beach-bg.png', Buffer.from(images[0].base64, 'base64'));
console.log('Saved product-beach-bg.png');
```

**Expected output:** The original product preserved with a new beach background.

## Guidelines

- Always use `aspectRatio` instead of `size` for Imagen models — `size` is not supported.
- Use `imagen-4.0-generate-001` as the default for new image generation. Use `imagen-3.0-capability-001` only for editing operations.
- Set `pollTimeoutMs` to at least 600000 (10 min) for Veo video generation — it can take several minutes, especially for higher resolutions or longer durations.
- Use `negativePrompt` to refine outputs: list specific artifacts to avoid (blurry, distorted, watermark) rather than vague terms.
- For production pipelines, specify `storageUri` (images) or `gcsOutputDirectory` (videos) to write directly to Cloud Storage instead of handling base64 in memory.
- Video generation with Veo is experimental (`experimental_generateVideo`). The API may change between SDK versions.
- Models with `fast` in the name trade quality for speed — use them for drafts and iteration, switch to standard models for final output.
- `personGeneration` defaults to blocking people. Set to `allow_adult` or `allow_all` when generating content that intentionally includes people.
- GCP billing applies to all Vertex AI media generation. Imagen ultra and Veo 3.1 cost more than their standard/fast counterparts.
