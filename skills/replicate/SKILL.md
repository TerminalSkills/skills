---
name: replicate
description: |
  Run machine learning models in the cloud via API. Access thousands of open-source models
  for image generation, language, audio, and video. Fine-tune models on custom data and
  deploy custom models with Cog packaging format.
license: Apache-2.0
compatibility:
  - python 3.8+
  - typescript/node 18+
  - curl/HTTP
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-ml
  tags:
    - ml-api
    - model-hosting
    - image-generation
    - fine-tuning
    - serverless
---

# Replicate

## Installation

```bash
# Install Python client
pip install replicate

# Set API token
export REPLICATE_API_TOKEN="r8_xxxxxxxxxxxx"
```

## Run a Model

```python
# run_model.py — Run a model and get the output
import replicate

# Run Stable Diffusion XL
output = replicate.run(
    "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
    input={
        "prompt": "A futuristic cityscape at sunset, digital art",
        "negative_prompt": "blurry, low quality",
        "width": 1024,
        "height": 1024,
        "num_outputs": 1,
    },
)

# Output is a list of URLs
for url in output:
    print(url)
```

## Run Language Models

```python
# run_llm.py — Run open-source LLMs via Replicate
import replicate

# Run Llama with streaming
for event in replicate.stream(
    "meta/llama-2-70b-chat",
    input={
        "prompt": "Explain machine learning to a 5-year-old",
        "system_prompt": "You are a friendly teacher.",
        "max_new_tokens": 500,
        "temperature": 0.7,
    },
):
    print(str(event), end="", flush=True)
```

## Async Predictions

```python
# async_prediction.py — Submit a prediction and poll for results
import replicate
import time

# Create prediction without waiting
prediction = replicate.predictions.create(
    model="stability-ai/sdxl",
    input={"prompt": "A cat in space"},
)
print(f"Prediction ID: {prediction.id}")
print(f"Status: {prediction.status}")

# Poll for completion
while prediction.status not in ("succeeded", "failed", "canceled"):
    time.sleep(2)
    prediction.reload()
    print(f"Status: {prediction.status}")

if prediction.status == "succeeded":
    print(f"Output: {prediction.output}")
```

## Webhooks

```python
# webhook_prediction.py — Get notified when a prediction completes via webhook
import replicate

prediction = replicate.predictions.create(
    model="stability-ai/sdxl",
    input={"prompt": "A mountain landscape"},
    webhook="https://myapp.com/api/replicate-webhook",
    webhook_events_filter=["completed"],
)
print(f"Prediction started: {prediction.id}")
```

## Fine-Tuning

```python
# fine_tune.py — Fine-tune SDXL on custom images
import replicate

# Create a fine-tune training
training = replicate.trainings.create(
    version="stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
    input={
        "input_images": "https://my-bucket.s3.amazonaws.com/training-images.zip",
        "token_string": "TOK",
        "caption_prefix": "a photo of TOK, ",
        "max_train_steps": 1000,
        "use_face_detection_instead": False,
    },
    destination="my-username/my-sdxl-model",
)

print(f"Training ID: {training.id}")
print(f"Status: {training.status}")

# Check training status
training.reload()
print(f"Status: {training.status}")
print(f"Model version: {training.output.get('version')}")
```

## Deploy Custom Models with Cog

```dockerfile
# cog.yaml — Define model environment for Cog packaging
build:
  python_version: "3.11"
  python_packages:
    - torch==2.1.0
    - transformers==4.36.0
  gpu: true
predict: "predict.py:Predictor"
```

```python
# predict.py — Cog predictor class for custom model deployment
from cog import BasePredictor, Input, Path
from transformers import pipeline

class Predictor(BasePredictor):
    def setup(self):
        """Load model into memory during container startup"""
        self.pipe = pipeline("text-generation", model="./model", device=0)

    def predict(
        self,
        prompt: str = Input(description="Input text prompt"),
        max_tokens: int = Input(description="Max tokens to generate", default=100, ge=1, le=1000),
        temperature: float = Input(description="Sampling temperature", default=0.7, ge=0, le=2),
    ) -> str:
        """Run a single prediction"""
        output = self.pipe(prompt, max_new_tokens=max_tokens, temperature=temperature)
        return output[0]["generated_text"]
```

```bash
# Build and push a custom model with Cog
pip install cog

# Test locally
cog predict -i prompt="Hello world"

# Push to Replicate
cog login
cog push r8.im/my-username/my-model
```

## Node.js Client

```typescript
// replicate_node.ts — Use Replicate from Node.js
import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

const output = await replicate.run("stability-ai/sdxl", {
  input: {
    prompt: "A watercolor painting of a robot",
    width: 1024,
    height: 1024,
  },
});

console.log(output);
```

## Key Concepts

- **Version pinning**: Models are versioned by SHA — pin versions for reproducibility
- **Cold starts**: First request to a model may take 10-60s to boot; subsequent calls are faster
- **Streaming**: Use `replicate.stream()` for real-time token output from language models
- **Cog**: Open-source tool to package ML models as Docker containers for Replicate
- **Webhooks**: Avoid polling by receiving HTTP callbacks when predictions complete
- **Pricing**: Pay per second of compute; GPU type depends on the model
