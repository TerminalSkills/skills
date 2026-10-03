---
name: ray
description: |
  Framework for scaling Python applications from a laptop to a cluster. Includes Ray Core
  for distributed computing, Ray Serve for model serving, Ray Tune for hyperparameter
  optimization, and Ray Data for distributed data processing.
license: Apache-2.0
compatibility: 'Python 3.10+, Ray 2.59, Linux/macOS (Windows is beta)'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/ray-project/ray
  category: data-ai
  tags:
    - distributed-computing
    - model-serving
    - hyperparameter-tuning
    - scaling
    - parallel-processing
---

# Ray

## Overview

Ray scales Python code from a laptop to a cluster. Ray Core turns functions and classes into distributed tasks and actors; Serve, Tune and Data build model serving, hyperparameter search and dataset processing on top. Examples below were run against Ray 2.59 (Python 3.12).

## Instructions

### Installation

```bash
# Core + dashboard + cluster launcher (Python 3.10+)
pip install "ray[default]"

# Or specific components
pip install "ray[serve]"   # Model serving
pip install "ray[tune]"    # Hyperparameter tuning
pip install "ray[data]"    # Distributed data processing
pip install "ray[train]"   # Distributed training
```

### Ray Core — Distributed Functions

```python
# ray_basics.py — Parallelize Python functions across CPUs/GPUs
import ray
import time

ray.init()  # Connects to or starts a local Ray cluster

@ray.remote
def process_item(item: int) -> int:
    time.sleep(1)  # Simulate work
    return item ** 2

# Run 10 tasks in parallel (takes ~1s instead of 10s)
futures = [process_item.remote(i) for i in range(10)]
results = ray.get(futures)
print(f"Results: {results}")

# GPU tasks
@ray.remote(num_gpus=1)
def train_on_gpu(data):
    import torch
    device = torch.device("cuda")
    tensor = torch.tensor(data, device=device)
    return tensor.sum().item()
```

### Ray Actors — Stateful Workers

```python
# ray_actors.py — Stateful distributed objects for maintaining state across calls
import ray

@ray.remote
class ModelServer:
    def __init__(self, model_name: str):
        from transformers import pipeline
        self.pipe = pipeline("sentiment-analysis", model=model_name)
        self.request_count = 0

    def predict(self, text: str) -> dict:
        self.request_count += 1
        return self.pipe(text)[0]

    def get_stats(self) -> dict:
        return {"requests": self.request_count}

# Create 3 actor replicas
servers = [ModelServer.remote("distilbert-base-uncased-finetuned-sst-2-english") for _ in range(3)]

# Distribute requests across actors
texts = ["Great product!", "Terrible service", "It's okay"] * 10
futures = [servers[i % 3].predict.remote(text) for i, text in enumerate(texts)]
results = ray.get(futures)
```

### Ray Serve — Model Serving

```python
# serve_model.py — Deploy ML models as scalable HTTP endpoints
from ray import serve
from starlette.requests import Request

@serve.deployment(num_replicas=2, ray_actor_options={"num_gpus": 0.5})
class SentimentService:
    def __init__(self):
        from transformers import pipeline
        self.classifier = pipeline("sentiment-analysis")

    async def __call__(self, request: Request) -> dict:
        body = await request.json()
        text = body.get("text", "")
        result = self.classifier(text)[0]
        return {"label": result["label"], "score": result["score"]}

app = SentimentService.bind()

# host and port belong to serve.start(), not serve.run().
# Bind to localhost; put a reverse proxy or the cluster ingress in front for remote access.
serve.start(http_options={"host": "127.0.0.1", "port": 8000})
serve.run(app, route_prefix="/")
```

`ray_actor_options={"num_gpus": 0.5}` needs a GPU; drop it on a CPU-only machine. In production prefer a config file: `serve run serve_model:app` for development and `serve deploy config.yaml` for a cluster.

```bash
# Test the endpoint
curl -X POST http://localhost:8000 \
    -H "Content-Type: application/json" \
    -d '{"text": "Ray Serve is excellent!"}'
```

### Ray Serve — Composition (Multi-Model Pipeline)

```python
# serve_pipeline.py — Chain multiple models in a serving pipeline
from ray import serve
from starlette.requests import Request

@serve.deployment
class Preprocessor:
    def preprocess(self, text: str) -> str:
        return text.strip().lower()

@serve.deployment
class Classifier:
    def __init__(self):
        from transformers import pipeline
        self.pipe = pipeline("sentiment-analysis")

    def classify(self, text: str) -> dict:
        return self.pipe(text)[0]

@serve.deployment
class Pipeline:
    def __init__(self, preprocessor, classifier):
        self.preprocessor = preprocessor
        self.classifier = classifier

    async def __call__(self, request: Request) -> dict:
        body = await request.json()
        clean_text = await self.preprocessor.preprocess.remote(body["text"])
        result = await self.classifier.classify.remote(clean_text)
        return result

preprocessor = Preprocessor.bind()
classifier = Classifier.bind()
app = Pipeline.bind(preprocessor, classifier)
```

Bound deployments are passed to the constructor as `DeploymentHandle`s, so every call is `await handle.method.remote(...)`. Run it with `serve.run(app)` and post `{"text": "  Great! "}` to `http://127.0.0.1:8000/`.

### Ray Tune — Hyperparameter Optimization

```python
# tune_experiment.py — Run hyperparameter search across a cluster
from ray import tune
from ray.tune.schedulers import ASHAScheduler

def train_model(config):
    import torch
    import torch.nn as nn

    model = nn.Sequential(
        nn.Linear(10, config["hidden_size"]),
        nn.ReLU(),
        nn.Linear(config["hidden_size"], 1),
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=config["lr"])

    for epoch in range(20):
        x = torch.randn(64, 10)
        y = torch.randn(64, 1)
        loss = nn.MSELoss()(model(x), y)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        tune.report({"loss": loss.item(), "epoch": epoch})

scheduler = ASHAScheduler(max_t=20, grace_period=5, reduction_factor=2)

# tune.run is deprecated: use tune.Tuner
tuner = tune.Tuner(
    tune.with_resources(train_model, {"cpu": 2, "gpu": 0}),
    param_space={
        "lr": tune.loguniform(1e-4, 1e-1),
        "hidden_size": tune.choice([32, 64, 128, 256]),
    },
    tune_config=tune.TuneConfig(
        metric="loss", mode="min", num_samples=20, scheduler=scheduler,
    ),
)
results = tuner.fit()

best = results.get_best_result()
print(f"Best config: {best.config}")
print(f"Best loss: {best.metrics['loss']:.4f}")
```

### Ray Data — Distributed Processing

```python
# ray_data.py — Process large datasets in parallel with Ray Data
import ray

# Read and process a large dataset
ds = ray.data.read_parquet("s3://my-bucket/data/")

# Map transformations in parallel
def preprocess(batch):
    batch["text_length"] = [len(t) for t in batch["text"]]
    return batch

processed = ds.map_batches(preprocess, batch_format="pandas")

# Filter
filtered = processed.filter(lambda row: row["text_length"] > 50)

# Write results
filtered.write_parquet("s3://my-bucket/processed/")
print(f"Processed {filtered.count()} records")
```

### Cluster Setup

On Kubernetes, use the KubeRay operator and its Helm charts (the old `provider: type: kubernetes` cluster-launcher YAML is not the supported route):

```bash
helm repo add kuberay https://ray-project.github.io/kuberay-helm/
helm repo update
helm install kuberay-operator kuberay/kuberay-operator --version 1.7.0
helm install raycluster kuberay/ray-cluster --version 1.7.0
kubectl get rayclusters
```

Check the KubeRay docs for the chart version that matches your Ray release. On plain VMs use `ray start --head` on the first machine and `ray start --address=10.0.0.5:6379` on workers.

## Examples

**Request:** "Run my 10,000 slow feature-extraction calls in parallel."
Wrap the function in `@ray.remote`, submit with `.remote()`, collect with `ray.get`. Ten one-second tasks finish in about 1 s on 10 CPUs and print `Results: [0, 1, 4, ...]`.

**Request:** "Tune my learning rate on 20 samples."
Use the `tune.Tuner` snippet above; the printout ends with `Best config: {'lr': 0.0018, 'hidden_size': 64}` and the best loss.

## Guidelines

### Key Concepts

- **Ray Core**: `@ray.remote` turns any function/class into a distributed task/actor
- **Ray Serve**: Production model serving with autoscaling, batching, and multi-model composition
- **Ray Tune**: Hyperparameter search with ASHA, Bayesian optimization, PBT, and more
- **Ray Data**: Distributed data loading and preprocessing for ML training pipelines
- **Autoscaling**: Automatically scales workers up/down based on demand
- **Resource management**: Specify CPU, GPU, and memory requirements per task

### Pitfalls

- Tasks that need `num_gpus` stay pending forever on machines without GPUs; check `ray.cluster_resources()`.
- `ray.get` in a loop serializes work: submit all tasks first, then call `ray.get` once on the list.
- Large arguments are copied per call; put them in the object store once with `ray.put`.
- On Windows Ray is beta and multi-node clusters are untested.
- Stop local clusters with `ray stop` when you finish.
