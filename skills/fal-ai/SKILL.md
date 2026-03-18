---
name: fal-ai
description: >-
  Deploy and run AI models instantly with fal.ai — image generation, video,
  audio, and custom models. Use when generating images with Flux/SDXL/LoRA,
  running ML inference at scale, building AI media features, or accessing
  state-of-the-art generative models via a simple API.
license: Apache-2.0
compatibility: "Node.js 18+, Python 3.9+, Browser (via @fal-ai/client)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["fal-ai", "image-generation", "flux", "ml", "inference"]
  use-cases:
    - "Generate product images with Flux Pro for an e-commerce catalog"
    - "Create animated videos from images with AnimateDiff"
    - "Transcribe audio files at scale with Whisper"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# fal.ai

## Overview

fal.ai provides instant serverless inference for AI models — no GPU provisioning, no containers, pay per inference. The API is simple: pick a model ID, pass inputs, get outputs. Supports async jobs with webhooks, real-time streaming, and file uploads. Best-in-class for Flux image generation, video generation, and audio models.

## Install

```bash
npm install @fal-ai/client    # JavaScript/TypeScript
pip install fal-client         # Python
```

## Authentication

```bash
export FAL_KEY="your-api-key"  # Get from fal.ai/dashboard
```

## Quick Start

### TypeScript

```typescript
import * as fal from "@fal-ai/client";

// Configure (reads FAL_KEY from env by default)
fal.config({ credentials: process.env.FAL_KEY });

// Generate an image with Flux Schnell (fastest)
const result = await fal.subscribe("fal-ai/flux/schnell", {
  input: {
    prompt: "A futuristic city at night, neon lights, cyberpunk style",
    image_size: "landscape_4_3",
    num_images: 1,
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === "IN_PROGRESS") {
      console.log(update.logs?.map(l => l.message).join("\n"));
    }
  },
});

console.log(result.data.images[0].url);
```

### Python

```python
import fal_client

def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
            print(log["message"])

result = fal_client.subscribe(
    "fal-ai/flux/schnell",
    arguments={
        "prompt": "A futuristic city at night, neon lights, cyberpunk style",
        "image_size": "landscape_4_3",
        "num_images": 1,
    },
    with_logs=True,
    on_queue_update=on_queue_update,
)

print(result["images"][0]["url"])
```

## Popular Models

### Flux Image Generation

```typescript
// Flux Pro — highest quality
const pro = await fal.subscribe("fal-ai/flux-pro", {
  input: {
    prompt: "Portrait of a robot chef, photorealistic, soft lighting",
    image_size: "portrait_4_3",   // landscape_4_3, square, square_hd
    num_inference_steps: 28,
    guidance_scale: 3.5,
    num_images: 1,
    safety_tolerance: "2",        // 1-6, higher = more permissive
  }
});

// Flux Dev — high quality, faster than Pro
const dev = await fal.subscribe("fal-ai/flux/dev", {
  input: {
    prompt: "...",
    num_inference_steps: 28,
    seed: 42,  // For reproducibility
  }
});

// Flux Schnell — fastest, good quality
const schnell = await fal.subscribe("fal-ai/flux/schnell", {
  input: { prompt: "...", num_inference_steps: 4 }  // Only needs 4 steps
});

// Flux with LoRA
const lora = await fal.subscribe("fal-ai/flux-lora", {
  input: {
    prompt: "A photo of TOK wearing a tuxedo",
    loras: [
      {
        path: "https://huggingface.co/your-lora/model.safetensors",
        scale: 1.0
      }
    ],
    num_inference_steps: 28,
  }
});
```

### Image-to-Image

```typescript
const result = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
  input: {
    prompt: "Transform into oil painting style",
    image_url: "https://example.com/photo.jpg",
    strength: 0.85,  // 0-1, how much to transform (1 = ignore original)
    num_inference_steps: 28,
  }
});
```

### Video Generation

```typescript
// AnimateDiff — animate a still image
const video = await fal.subscribe("fal-ai/animatediff-v2v", {
  input: {
    image_url: "https://example.com/frame.jpg",
    prompt: "Gentle breeze moving through the trees",
    num_frames: 16,
    fps: 8,
  }
});
console.log(video.data.video.url);  // .mp4 URL

// Runway-style video gen
const runway = await fal.subscribe("fal-ai/kling-video/v1/standard/image-to-video", {
  input: {
    image_url: "https://example.com/start.jpg",
    prompt: "Camera slowly pans right",
    duration: "5",
  }
});
```

### Audio — Whisper Transcription

```typescript
// Upload audio file first
const audioUrl = await fal.storage.upload(fs.readFileSync("audio.mp3"), "audio.mp3");

const transcript = await fal.subscribe("fal-ai/whisper", {
  input: {
    audio_url: audioUrl,
    task: "transcribe",  // or "translate" (to English)
    language: "en",      // Optional, auto-detected if omitted
    chunk_level: "segment",
    version: "3",
  }
});

console.log(transcript.data.text);
```

### MusicGen

```python
result = fal_client.subscribe(
    "fal-ai/musicgen",
    arguments={
        "prompt": "Upbeat electronic music for a tech product demo, 120 BPM",
        "duration": 30,   # seconds
        "top_k": 250,
        "top_p": 0.0,
        "temperature": 1.0,
    }
)
print(result["audio"]["url"])
```

## Async Jobs with Webhooks

For long-running jobs, use submit → poll instead of subscribe:

```typescript
// Submit job (returns immediately)
const { request_id } = await fal.queue.submit("fal-ai/flux-pro", {
  input: { prompt: "..." },
  webhookUrl: "https://your-app.com/webhooks/fal",  // Optional
});

// Poll for result
const checkStatus = async () => {
  const status = await fal.queue.status("fal-ai/flux-pro", {
    requestId: request_id,
    logs: true,
  });

  if (status.status === "COMPLETED") {
    const result = await fal.queue.result("fal-ai/flux-pro", {
      requestId: request_id,
    });
    return result.data;
  }

  if (status.status === "FAILED") {
    throw new Error(`Job failed: ${status.error}`);
  }

  // Still in queue, check again in 2s
  await new Promise(r => setTimeout(r, 2000));
  return checkStatus();
};

const result = await checkStatus();
```

### Webhook Handler (Next.js)

```typescript
// app/api/webhooks/fal/route.ts
export async function POST(req: Request) {
  const payload = await req.json();

  if (payload.status === "OK") {
    const imageUrl = payload.payload.images[0].url;
    await db.update({ requestId: payload.request_id, imageUrl, status: "done" });
  } else {
    await db.update({ requestId: payload.request_id, status: "failed" });
  }

  return Response.json({ ok: true });
}
```

## File Uploads

```typescript
import * as fal from "@fal-ai/client";
import * as fs from "fs";

// Upload a file to fal.ai storage
const fileBuffer = fs.readFileSync("my-image.jpg");
const url = await fal.storage.upload(fileBuffer, "image.jpg");
// Returns: "https://fal.run/files/..."

// Use uploaded URL as model input
const result = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
  input: { image_url: url, prompt: "..." }
});
```

```python
# Python file upload
import fal_client

url = fal_client.upload_file("./photo.png")
print(url)  # https://fal.run/files/...
```

## Batch Processing

```typescript
async function generateBatch(prompts: string[]): Promise<string[]> {
  // Submit all jobs in parallel
  const jobs = await Promise.all(
    prompts.map(prompt =>
      fal.queue.submit("fal-ai/flux/schnell", {
        input: { prompt, num_images: 1 }
      })
    )
  );

  // Poll all results
  const results = await Promise.all(
    jobs.map(({ request_id }) =>
      fal.queue.result("fal-ai/flux/schnell", { requestId: request_id })
    )
  );

  return results.map(r => r.data.images[0].url);
}

const urls = await generateBatch([
  "A red sports car",
  "A blue mountain lake",
  "A golden sunset over the ocean",
]);
```

## Guidelines

- Use `fal.subscribe()` for synchronous workflows (waits for completion, handles polling internally)
- Use `fal.queue.submit()` + webhooks for production async pipelines
- Flux Schnell is fastest (4 steps, ~2s); use for prototyping and bulk generation
- Flux Pro gives highest quality; use for final production images
- Always handle `onQueueUpdate` for user-facing apps to show progress
- Uploaded files are stored temporarily — download and persist to your own storage if needed
- Rate limits apply per API key; for high volume use the queue API to avoid timeouts
- Check `fal.ai/models` for the full list of available models (100+)
