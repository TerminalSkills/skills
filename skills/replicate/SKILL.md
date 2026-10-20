---
name: replicate
description: |
  Run machine learning models in the cloud via API. Access thousands of open-source models
  for image generation, language, audio, and video. Fine-tune models on custom data and
  deploy custom models with Cog packaging format.
license: Apache-2.0
compatibility: 'python 3.8+, node 18+, curl/HTTP'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/replicate/replicate-python
  tags:
    - ml-api
    - model-hosting
    - image-generation
    - fine-tuning
    - serverless
---


# Replicate

## Overview

Replicate runs open-source and proprietary models behind one HTTP API: image, video, audio and language models, billed per second of compute (or per output for some official models). You call `owner/name` for official models, or `owner/name:version` to pin a community model to an exact version. You can also fine-tune supported models (such as FLUX) and publish your own models packaged with Cog. Clients: `replicate` on PyPI (1.0.x) and npm (1.x). Model IDs, versions and input fields vary per model, so open the model's API tab on replicate.com before copying inputs.

## Instructions

### Install and authenticate

```bash
pip install replicate          # Python 3.8+
npm install replicate          # Node 18+
export REPLICATE_API_TOKEN="r8_your_token_from_replicate_com_account"
```

Create tokens at replicate.com/account/api-tokens and keep them in the environment, never in source.

### Run a model

Since `replicate` 1.0.0, `run()` returns `FileOutput` objects instead of URL strings for models that output files. Use `.read()`, iterate the object, or `.url`; `use_file_output=False` restores plain URLs.

```python
import replicate

outputs = replicate.run(
    "black-forest-labs/flux-schnell",
    input={"prompt": "A futuristic cityscape at sunset, digital art", "num_outputs": 1},
)
for i, image in enumerate(outputs):
    with open(f"city_{i}.webp", "wb") as f:
        f.write(image.read())
    print(image.url)
```

`run()` first asks the API to hold the request for up to 60 seconds (`wait=1..60`; `wait=False` skips this), then keeps polling until the prediction ends, and raises `replicate.exceptions.ModelError` if the prediction fails; `e.prediction.logs` shows why.

```typescript
import Replicate from "replicate";
import { writeFile } from "node:fs/promises";

const replicate = new Replicate(); // reads REPLICATE_API_TOKEN
const [image] = await replicate.run("black-forest-labs/flux-schnell", {
  input: { prompt: "A watercolor painting of a robot" },
});
await writeFile("robot.webp", image);
```

### Language models and streaming

```python
for event in replicate.stream(
    "meta/meta-llama-3-70b-instruct",
    input={"prompt": "Explain machine learning to a 5-year-old", "max_tokens": 500, "temperature": 0.7},
):
    print(str(event), end="", flush=True)
```

Language-model input names differ between models (`max_tokens` vs `max_new_tokens`, `system_prompt`); read the model page. Older models such as Llama 2 may be unavailable.

### Background predictions and polling

```python
import time, replicate

prediction = replicate.predictions.create(
    model="black-forest-labs/flux-schnell",     # official model: no version needed
    input={"prompt": "A cat in space"},
)
while prediction.status not in ("succeeded", "failed", "canceled"):
    time.sleep(2)
    prediction.reload()
if prediction.status == "succeeded":
    print(prediction.output)       # list of URLs when read from the prediction object
else:
    print(prediction.error)
```

For community models pass `version="<64-character version id>"` instead of `model=`. Cancel with `prediction.cancel()`.

### Webhooks

```python
prediction = replicate.predictions.create(
    model="black-forest-labs/flux-schnell",
    input={"prompt": "A mountain landscape"},
    webhook="https://hooks.shopfront.dev/replicate",
    webhook_events_filter=["completed"],   # start | output | logs | completed
)
```

Verify every delivery: Replicate signs it with `webhook-id`, `webhook-timestamp` and `webhook-signature` headers. Sign `{id}.{timestamp}.{raw body}` with the base64 part of the `whsec_...` key returned by `GET https://api.replicate.com/v1/webhooks/default/secret`, compare in constant time, and reject old timestamps. The Python client has `replicate.webhooks.validate`, and the Node client `validateWebhook`, for this.

### Fine-tuning FLUX

SDXL fine-tuning inputs from older guides no longer apply; the supported route is the FLUX trainer.

```python
import replicate

trainer = replicate.models.get("replicate/fast-flux-trainer")
training = replicate.trainings.create(
    model="replicate/fast-flux-trainer",
    version=trainer.latest_version.id,
    destination="jdoe/mug-style-flux",           # model you own; create it first at replicate.com/create
    input={
        "input_images": "https://assets.jdoe-studio.com/mug-photos.zip",   # zip of training images (the guide uses about 20)
        "trigger_word": "MUGSTYLE",   # made-up string, not a real word
        "lora_type": "style",         # or "subject"
        "training_steps": 1000,
    },
)
training.reload()
print(training.status)
```

When it succeeds, run `jdoe/mug-style-flux` with a prompt containing the trigger word. Training is billed per second on H100s, typically a couple of dollars.

### Deploy a custom model with Cog

Install Cog with Homebrew (`brew install replicate/tap/cog`) or from the release page with its checksum verified, and have Docker running.

```yaml
# cog.yaml
build:
  python_version: "3.12"
  python_packages:
    - torch==2.3.1
    - transformers==4.44.0
  gpu: true
predict: "predict.py:Predictor"
```

```python
# predict.py
from cog import BasePredictor, Input

class Predictor(BasePredictor):
    def setup(self):
        """Load weights once per container start."""
        from transformers import pipeline
        self.pipe = pipeline("text-generation", model="./model", device=0)

    def predict(
        self,
        prompt: str = Input(description="Input text"),
        max_tokens: int = Input(description="Tokens to generate", default=100, ge=1, le=1000),
    ) -> str:
        return self.pipe(prompt, max_new_tokens=max_tokens)[0]["generated_text"]
```

```bash
cog predict -i prompt="Write a product tagline for a ceramic mug"   # test locally
cog login                                                          # paste your API token
cog push r8.im/jdoe/mug-writer                                     # create the model page first
```

## Examples

### Example 1: Generate and save product shots

Request: "Make 4 product photos of a ceramic mug and save them."

```python
outputs = replicate.run("black-forest-labs/flux-schnell",
    input={"prompt": "Ceramic coffee mug on oak table, soft morning light", "num_outputs": 4})
for i, img in enumerate(outputs):
    open(f"mug_{i}.webp", "wb").write(img.read())
```

Result: four `mug_0.webp` to `mug_3.webp` files in the working directory; the run is billed per image.

### Example 2: Get notified instead of polling

Request: "Start a render and call my server when it finishes."

Use the webhook snippet above. Result: `create()` returns at once with status `starting`; Replicate POSTs the final prediction JSON (status `succeeded`, `output` URLs) to your endpoint, which should verify the signature and return 2xx.

## Guidelines

- Inputs, outputs and logs of API predictions are deleted after an hour by default; download what you need to keep.
- Pin `owner/name:version` for community models so a new model version cannot change your output; official models change without a version pin.
- Cold starts: a model that has not run recently can take tens of seconds to boot. Use deployments for always-warm capacity.
- Check `prediction.error` and `logs` on failure; do not retry blindly, since failed input validation fails every time.
- Token handling: keep it in `REPLICATE_API_TOKEN`; the Cog `predict.py` can read secrets from inputs, not from files in the image.
- Do not send private or regulated data to public models without reading Replicate's data-retention page.
