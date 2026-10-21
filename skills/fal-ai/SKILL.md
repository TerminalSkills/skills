---
name: fal-ai
description: >-
  Run hosted image, video and audio AI models through the fal.ai API with the
  JavaScript or Python client. Use when generating images with Flux or LoRA,
  animating images into video, transcribing audio with Whisper, running
  inference through a queue with webhooks, or building AI media features.
license: Apache-2.0
compatibility: "Node.js 18+, Python 3.8+, Browser (via @fal-ai/client)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/fal-ai/fal-js
  tags: ["fal-ai", "image-generation", "flux", "ml", "inference"]
  use-cases:
    - "Generate product images with Flux Pro for an e-commerce catalog"
    - "Animate a product photo into a short video with Kling"
    - "Transcribe audio files at scale with Whisper"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# fal.ai

## Overview

fal.ai hosts 1,000+ generative models (image, video, audio, LLM) behind one API: pick an endpoint ID, send `input`, get JSON back with URLs to the generated media. There are no GPUs to manage and billing is per use. Calls go through a durable queue, so long jobs survive retries; `subscribe` hides the queue behind one awaited call, while `queue.submit` plus a webhook suits production pipelines. Result shapes differ per model, so check the model's API page (open it from fal.ai/models and choose the API tab) before reading fields.

## Instructions

### Install and authenticate

```bash
npm install @fal-ai/client     # Node 18+, browsers, React Native
pip install fal-client         # Python 3.8+
export FAL_KEY="fal_live_key_from_dashboard"   # create at fal.ai/dashboard/keys
```

Both clients read `FAL_KEY` from the environment. Never ship the key to a browser: in front-end code route requests through a server proxy (`@fal-ai/server-proxy` for Next.js) and set `fal.config({ proxyUrl: "/api/fal/proxy" })`.

### Quick start

The JavaScript client exports a named `fal` object. `import * as fal from "@fal-ai/client"` does not work (`fal.subscribe` is undefined).

```typescript
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/flux/schnell", {
  input: {
    prompt: "A futuristic city at night, neon lights, cyberpunk style",
    image_size: "landscape_4_3",
    num_images: 1,
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === "IN_QUEUE") console.log(`queue position ${update.queue_position}`);
    if (update.status === "IN_PROGRESS") update.logs?.forEach((l) => console.log(l.message));
  },
});

console.log(result.data.images[0].url); // JS wraps the output in { data, requestId }
```

```python
import fal_client

def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
            print(log["message"])

result = fal_client.subscribe(
    "fal-ai/flux/schnell",
    arguments={"prompt": "A futuristic city at night, neon lights, cyberpunk style",
               "image_size": "landscape_4_3", "num_images": 1},
    with_logs=True,
    on_queue_update=on_queue_update,
)
print(result["images"][0]["url"])   # Python returns the output dict directly
```

`fal.run` / `fal_client.run` call the model directly without the queue (no retries); async variants are `subscribe_async`, `submit_async`, `upload_file_async`.

### Image models

| Endpoint | Use |
|---|---|
| `fal-ai/flux/schnell` | Fastest FLUX.1, 1-4 steps (default 4, max 12) |
| `fal-ai/flux/dev` | FLUX.1 dev, open weights, 28 steps typical |
| `fal-ai/flux-pro/v1.1` | FLUX.1 pro, no `num_inference_steps` or `guidance_scale` |
| `fal-ai/flux-2`, `fal-ai/flux-2-pro` | FLUX.2 text-to-image (editing is a separate `fal-ai/flux-2/edit`) |
| `fal-ai/flux-lora` | FLUX.1 dev plus LoRA weights |
| `fal-ai/nano-banana-2` | Google image model, text-to-image (`/edit` variant for edits) |

```typescript
const lora = await fal.subscribe("fal-ai/flux-lora", {
  input: {
    prompt: "A photo of TOK wearing a tuxedo",
    loras: [{ path: "https://huggingface.co/acme-studio/tok-lora/resolve/main/tok.safetensors", scale: 1.0 }],
    num_inference_steps: 28,
    guidance_scale: 3.5,
    seed: 42, // reproducible
  },
});

const edit = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
  input: {
    prompt: "Transform into oil painting style",
    image_url: "https://v3b.fal.media/files/b/0a98f887/YYbm6L.png",
    strength: 0.85, // 0.01-1, higher departs further from the source
  },
});
```

`fal-ai/flux-pro` (v1) takes `safety_tolerance` "1"-"6" (higher is more permissive); the dev/schnell/lora endpoints use `enable_safety_checker` instead. `image_size` accepts presets (`square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9`) or `{ width, height }`.

### Video

Image-to-video endpoints change names with every Kling release; pick the version on `fal.ai/models` (e.g. `kling-video/v3/standard/image-to-video`) and read its schema, because input names differ between versions.

```typescript
const clip = await fal.subscribe("fal-ai/kling-video/v3/standard/image-to-video", {
  input: {
    start_image_url: "https://v3b.fal.media/files/b/0a98f887/YYbm6L.png", // v1.x/v2.x use image_url
    prompt: "Camera slowly pans right across the product",
    duration: "5",   // string, "3"-"15" on v3
  },
});
console.log(clip.data.video.url);
```

`fal-ai/animatediff-v2v` is video-to-video (`video_url` plus `prompt`), not image animation.

### Audio

```typescript
const audio = new Blob([fs.readFileSync("interview.mp3")], { type: "audio/mpeg" });
const audioUrl = await fal.storage.upload(audio);

const transcript = await fal.subscribe("fal-ai/whisper", {
  input: { audio_url: audioUrl, task: "transcribe", chunk_level: "segment", diarize: false },
});
console.log(transcript.data.text); // transcript.data.chunks has timestamps
```

`task` is `transcribe` or `translate` (to English); `language` is optional. `fal-ai/wizper` is a faster Whisper variant.

```python
result = fal_client.subscribe("fal-ai/musicgen", arguments={
    "prompt": "Upbeat electronic music for a tech product demo, 120 BPM",
    "duration": 30,   # seconds, 4-40
})
print(result["audio_url"]["url"])
```

### Queue, polling and webhooks

Queue statuses are `IN_QUEUE`, `IN_PROGRESS` and `COMPLETED`; there is no `FAILED` status. A failed request arrives as `COMPLETED` with an `error` field, and `queue.result` then throws.

```typescript
const { request_id } = await fal.queue.submit("fal-ai/flux/dev", {
  input: { prompt: "Product photo of a ceramic mug on oak table" },
  webhookUrl: "https://shop.mystorefront.io/api/webhooks/fal", // optional
});

let status = await fal.queue.status("fal-ai/flux/dev", { requestId: request_id, logs: true });
while (status.status !== "COMPLETED") {
  await new Promise((r) => setTimeout(r, 2000));
  status = await fal.queue.status("fal-ai/flux/dev", { requestId: request_id });
}
const { data } = await fal.queue.result("fal-ai/flux/dev", { requestId: request_id });
```

Python: `handler = fal_client.submit(...)`, then `handler.status()`, `handler.get()` (waits), `handler.cancel()`. JS: `fal.queue.cancel`, `fal.queue.streamStatus`, `fal.queue.subscribeToStatus`.

Webhook body: `{ request_id, gateway_request_id, status: "OK" | "ERROR", payload, error? }`. `"OK"` and `"ERROR"` are webhook statuses, not queue statuses.

```typescript
// app/api/webhooks/fal/route.ts (Next.js)
export async function POST(req: Request) {
  const body = await req.json();
  if (body.status === "OK") {
    await db.images.update(body.request_id, { url: body.payload.images[0].url, state: "done" });
  } else {
    await db.images.update(body.request_id, { state: "failed", error: body.error });
  }
  return Response.json({ ok: true });
}
```

### Files and batches

```python
url = fal_client.upload_file("./photo.png")   # returns a fal.media CDN URL
```

Models take file inputs as URLs (CDN upload, your own public or presigned URL, or a small data URI). JS: `fal.storage.upload(file)` takes a `Blob`/`File`.

For batches, run calls concurrently; each `subscribe` waits for its own result.

```typescript
const prompts = ["A red sports car", "A blue mountain lake", "A golden sunset over the ocean"];
const results = await Promise.all(
  prompts.map((prompt) => fal.subscribe("fal-ai/flux/schnell", { input: { prompt } })),
);
const urls = results.map((r) => r.data.images[0].url);
```

## Examples

### Example 1: Product images for a catalog

Request: "Generate four hero images of a stainless steel water bottle on a marble counter."

```typescript
const out = await fal.subscribe("fal-ai/flux/dev", {
  input: { prompt: "Stainless steel water bottle on white marble counter, soft window light, product photography",
           image_size: "square_hd", num_images: 4, output_format: "png" },
});
out.data.images.forEach((img, i) => console.log(i, img.url, img.width, img.height));
```

Result: four 1024x1024 PNG URLs on `fal.media`, plus `out.data.seed` for regenerating.

### Example 2: Transcribe a podcast in the background

Request: "Transcribe episode-42.mp3 and POST the text to my server when done."

```python
import fal_client
url = fal_client.upload_file("episode-42.mp3")
handler = fal_client.submit("fal-ai/whisper",
    arguments={"audio_url": url, "task": "transcribe", "chunk_level": "segment"},
    webhook_url="https://podcasts.mysite.io/hooks/fal")
print(handler.request_id)
```

Result: the call returns at once with a request ID; fal POSTs `{"status": "OK", "payload": {"text": "...", "chunks": [...]}}` to the webhook when finished.

## Guidelines

- Use `subscribe` for scripts and request-time calls; use `queue.submit` with a webhook for long jobs (video, training) so no connection stays open.
- Webhook URLs must be public and return 2xx within 15 seconds; redirects are not followed, and delivery is retried, so make the handler idempotent on `request_id`. Verify the `X-Fal-Webhook-Signature` header (ED25519, keys at `https://rest.fal.ai/.well-known/jwks.json`) before trusting a payload.
- Generated and uploaded files live on the fal CDN and can expire; download what you need to keep. Send `X-Fal-Store-IO: 0` to stop request payloads being stored in history.
- Model IDs and schemas change; confirm input names on the model's API page rather than copying them from another version.
- Keep `FAL_KEY` server-side. Submit work through the queue instead of retrying in tight loops.
- Training or deploying your own model uses a different product (fal Serverless, `pip install fal`, `fal deploy`), not this client.
