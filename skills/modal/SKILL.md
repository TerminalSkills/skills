---
name: modal
description: >-
  Run Python functions on cloud GPUs and CPUs with Modal, a serverless platform that builds
  containers from Python code, scales to zero and bills per second. Use when a user asks to
  "run this on a GPU", "deploy a model endpoint", "serve an LLM with vLLM", "run a nightly
  training job", "fan out a batch job across many containers", or "cache model weights in a
  volume" without managing servers or Kubernetes.
license: Apache-2.0
compatibility: "Python 3.10+ (modal 1.x, 1.6 at the time of writing), Linux/macOS/Windows, a Modal account"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/modal-labs/modal-client"
  category: data-ai
  tags:
    - serverless
    - gpu-compute
    - model-serving
    - cloud
    - inference
---

# Modal

## Overview

Modal runs ordinary Python functions in containers it builds and schedules for you. You declare the image, GPU, secrets and volumes in Python decorators; `modal run` executes once, `modal deploy` keeps an app live, and idle containers scale to zero. Requires a Modal account and authentication with `modal setup`, which opens a browser. Do not run `modal setup` on the user's behalf in an unattended session; ask them to authenticate, or use `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` created in the dashboard.

Modal 1.0 renamed several parameters. Code written for 0.x fails with a `DeprecationError`:

| Old (0.x) | Now |
|---|---|
| `container_idle_timeout=` | `scaledown_window=` |
| `concurrency_limit=` | `max_containers=` |
| `@modal.web_endpoint` | `@modal.fastapi_endpoint` (needs `fastapi[standard]` in the image) |
| `allow_concurrent_inputs=` | `@modal.concurrent(max_inputs=N)` |

## Instructions

### Step 1: Install and authenticate

```bash
pip install modal
modal setup                  # browser login, writes ~/.modal.toml
modal run --help             # sanity check
```

### Step 2: Run a function on a GPU

```python
# hello_gpu.py
import modal

app = modal.App("hello-gpu")

@app.function(gpu="T4")
def gpu_info() -> str:
    import subprocess
    return subprocess.run(["nvidia-smi"], capture_output=True, text=True).stdout

@app.local_entrypoint()
def main():
    print(gpu_info.remote())
```

```bash
modal run hello_gpu.py
```

GPU strings: `T4`, `L4`, `A10`, `L40S`, `A100` (`A100-40GB`, `A100-80GB`), `RTX-PRO-6000`, `H100`, `H200`, `B200`, `B300`. Add a count with `"H100:8"`, or a fallback list with `gpu=["H100", "A100-80GB"]`.

### Step 3: Define the image

```python
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch", "transformers", "accelerate")
    .env({"HF_HOME": "/models"})
)
app = modal.App("ml-inference", image=image)
```

Pin versions of packages that break often. Import heavy libraries inside the function body, because the local machine does not have them. `Image.uv_pip_install` is a faster drop-in for `pip_install`.

### Step 4: Cache model weights in a Volume

```python
volume = modal.Volume.from_name("model-cache", create_if_missing=True)

@app.function(gpu="L40S", volumes={"/models": volume}, timeout=900)
def generate(prompt: str) -> str:
    from transformers import pipeline
    pipe = pipeline("text-generation", model="Qwen/Qwen2.5-7B-Instruct", device_map="auto")
    out = pipe(prompt, max_new_tokens=120)[0]["generated_text"]
    volume.commit()          # persist weights downloaded into /models/hub
    return out
```

With `HF_HOME=/models` the first call downloads weights to the volume and later containers reuse them. Call `volume.commit()` after writing; other containers see new files after `volume.reload()`.

### Step 5: Serve an endpoint

```python
import modal

image = modal.Image.debian_slim(python_version="3.12").pip_install("vllm", "fastapi[standard]")
app = modal.App("llm-server", image=image)
MODEL = "Qwen/Qwen2.5-7B-Instruct"

@app.cls(gpu="L40S", scaledown_window=300, timeout=600)
@modal.concurrent(max_inputs=8)
class LLMServer:
    @modal.enter()
    def load_model(self):
        from vllm import LLM
        self.llm = LLM(model=MODEL)

    @modal.fastapi_endpoint(method="POST")
    def generate(self, request: dict):
        from vllm import SamplingParams
        params = SamplingParams(temperature=0.7, max_tokens=request.get("max_tokens", 200))
        out = self.llm.generate([request["prompt"]], params)
        return {"text": out[0].outputs[0].text}
```

```bash
modal serve serve_model.py     # temporary URL with hot reload, stops on Ctrl-C
modal deploy serve_model.py    # persistent; prints the *.modal.run URL
```

`@modal.enter()` runs once per container start, so weights load once, not per request. Endpoints are public unless you add auth (`requires_proxy_auth=True` on the decorator, with proxy auth tokens from the dashboard, or check a header against a secret in the function).

### Step 6: Batch, schedule, secrets

```python
@app.function(image=image, max_containers=10)
def embed(text: str) -> int:
    return len(text)

@app.local_entrypoint()
def main():
    results = list(embed.map([f"Ticket {i}: printer offline" for i in range(100)]))

@app.function(schedule=modal.Cron("0 2 * * *"), gpu="A100", timeout=3600)   # 02:00 UTC
def nightly_finetune(): ...

@app.function(secrets=[modal.Secret.from_name("huggingface")])
def private_model():
    import os; token = os.environ["HF_TOKEN"]
```

Create secrets from the CLI: `modal secret create huggingface HF_TOKEN="$HF_TOKEN"`. `modal deploy` is required for a schedule to run; `modal run` does not start it.

## Examples

### Example 1: Run a batch embedding job on GPUs

Request: "Embed these 5,000 support tickets on a GPU, in parallel."

```python
import modal

image = modal.Image.debian_slim(python_version="3.12").pip_install("sentence-transformers")
app = modal.App("ticket-embeddings", image=image)

@app.function(gpu="T4", max_containers=10)
def embed(batch: list[str]) -> list[list[float]]:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-MiniLM-L6-v2")
    return model.encode(batch).tolist()

@app.local_entrypoint()
def main():
    tickets = [f"Ticket {i}: customer cannot reset password" for i in range(5000)]
    batches = [tickets[i:i + 100] for i in range(0, len(tickets), 100)]
    vectors = [v for part in embed.map(batches) for v in part]
    print(len(vectors), len(vectors[0]))
```

`modal run ticket_embeddings.py` prints `5000 384`, using up to 10 T4 containers at once. Batches of 100 amortize the model load.

### Example 2: Deploy a private LLM endpoint

Request: "Put Qwen 7B behind an HTTP API that costs nothing when idle."

Use the Step 5 code, then:

```console
$ modal deploy serve_model.py
✓ Created web function LLMServer.generate => my-workspace--llm-server-llmserver-generate.modal.run
$ HOST=my-workspace--llm-server-llmserver-generate.modal.run
$ curl -s -X POST "https://$HOST" -H 'Content-Type: application/json' \
    -d '{"prompt": "Explain DNS in one line.", "max_tokens": 60}'
{"text": "DNS translates domain names into IP addresses."}
```

The container stops 300 seconds after the last request; the next request pays a cold start while vLLM loads the model.

## Guidelines

- Check parameter names against the table above; 0.x tutorials on the web still use removed arguments.
- `@modal.enter()` for model loading, Volumes for weights; otherwise every cold start re-downloads gigabytes.
- Set `timeout` (default 300 seconds) high enough for training and long generations; a function that exceeds it is killed.
- Cost control: set `max_containers`, keep `scaledown_window` short unless cold starts hurt, and use the smallest GPU that fits the model.
- Never put secrets in the image or the source; use `modal.Secret`.
- Public endpoints are open to the internet unless you add authentication.
- Modal is not for always-on stateful servers or code that needs a specific host kernel; use it for bursty and batch compute.
