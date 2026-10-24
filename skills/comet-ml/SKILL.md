---
name: comet-ml
description: Comet ML is a platform for tracking machine learning experiments, managing registered models, and comparing runs. Use when logging experiments, hyperparameters and metrics, registering model versions, or comparing training runs; LLM tracing goes through Comet's Opik. Helps developers log experiments, compare model versions, and build reproducible ML pipelines with automatic code/data versioning.
license: Apache-2.0
compatibility: "Python 3.8+, comet-ml SDK (pip), a Comet account and COMET_API_KEY (or OfflineExperiment)"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
  - ml-ops
  - experiment-tracking
  - model-registry
  - monitoring
  - collaboration
---

# Comet ML — ML Experiment Tracking & Model Management


## Overview


Comet ML is a platform for tracking machine learning experiments (parameters, metrics, code, git state, environment), registering model versions, and comparing runs through the Python SDK `comet-ml` and its REST-backed `API` class. LLM tracing and evaluation are handled by the separate Opik package.


## Instructions

### Experiment Tracking

```python
# train.py — Track a training run with Comet ML
import os
import comet_ml   # import before torch/sklearn so auto-logging can hook them
from comet_ml import Experiment
import torch
from torch import nn, optim

# Initialize experiment — auto-logs git info, environment, and dependencies
experiment = Experiment(
    api_key=os.environ["COMET_API_KEY"],
    project_name="text-classifier",
    workspace="my-team",
    auto_metric_logging=True,
    auto_param_logging=True,
    auto_histogram_weight_logging=True,
    log_code=True,                          # Logs the full source code
)

# Log hyperparameters
experiment.log_parameters({
    "model": "distilbert-base-uncased",
    "learning_rate": 2e-5,
    "batch_size": 32,
    "epochs": 5,
    "optimizer": "AdamW",
    "warmup_steps": 100,
    "weight_decay": 0.01,
    "max_seq_length": 256,
})

# Log dataset information
experiment.log_dataset_hash(train_df)       # Hash for reproducibility
experiment.log_parameter("train_samples", len(train_df))
experiment.log_parameter("val_samples", len(val_df))

# Training loop with metric logging
for epoch in range(5):
    model.train()
    running_loss = 0

    for batch_idx, (inputs, labels) in enumerate(train_loader):
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item()

        # Log batch-level metrics
        experiment.log_metric("batch_loss", loss.item(),
                             step=epoch * len(train_loader) + batch_idx)

    # Log epoch-level metrics
    avg_loss = running_loss / len(train_loader)
    experiment.log_metric("train_loss", avg_loss, epoch=epoch)

    # Validation
    val_loss, val_acc, val_f1 = evaluate(model, val_loader)
    experiment.log_metrics({
        "val_loss": val_loss,
        "val_accuracy": val_acc,
        "val_f1": val_f1,
    }, epoch=epoch)

    print(f"Epoch {epoch}: loss={avg_loss:.4f} val_acc={val_acc:.4f}")

# Log the weights, so they can be registered later
experiment.log_model("text-classifier", "./model_weights.pt")

# Log confusion matrix
experiment.log_confusion_matrix(
    y_true=val_labels,
    y_predicted=val_predictions,
    labels=["negative", "neutral", "positive"],
)

# Log sample predictions
for i in range(10):
    experiment.log_text(f"Input: {val_texts[i]}\nPredicted: {val_predictions[i]}\nActual: {val_labels[i]}")

# Add tags for filtering in the dashboard
experiment.add_tags(["v2", "distilbert", "sentiment"])

experiment.end()
```

### Model Registry

```python
# In train.py, after log_model and before experiment.end(): register the logged model
# The first argument is the name given to log_model; registry_name is the registered model's name
experiment.register_model(
    "text-classifier",
    registry_name="text-classifier-prod",
    version="1.2.0",
    description="DistilBERT fine-tuned on customer reviews, F1=0.92",
    tags=["production-ready"],
    status="Production",              # free-form status string, e.g. Staging | Production
)
```

```python
# Later, from another script: look up, promote and download a registered model
import os
from comet_ml import API

api = API(api_key=os.environ["COMET_API_KEY"])
model = api.get_model(workspace="my-team", model_name="text-classifier-prod")
details = model.get_details("1.2.0")
print(details["modelName"], details["version"], details["status"])

model.set_status("1.2.0", "Production")
model.download("1.2.0", output_folder="./model_artifacts/")
```

### LLM Tracking (Opik)

Comet's LLM tracing, prompt and evaluation features live in **Opik**, a separate open-source package (`pip install opik`) that can run on Comet cloud or be self-hosted. The `comet-ml` SDK has no OpenAI integration.

```python
import opik
from openai import OpenAI
from opik.integrations.openai import track_openai

opik.configure()                      # prompts for / reads the Opik API key and URL
client = track_openai(OpenAI(), project_name="support-bot-eval")

reply = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Summarize our refund policy in two sentences."}],
)
# Prompt, response, model, token usage and latency show up as a trace in Opik

@opik.track                           # trace any function as a span
def answer(question: str) -> str:
    return client.chat.completions.create(
        model="gpt-4o-mini", messages=[{"role": "user", "content": question}]
    ).choices[0].message.content
```

### Comparing Experiments

```python
import os
from comet_ml import API
from comet_ml.query import Metric

api = API(api_key=os.environ["COMET_API_KEY"])

# Server-side filter: experiments whose val_f1 exceeds 0.85
good = api.query("my-team", "text-classifier", Metric("val_f1") > 0.85)

def final_f1(exp):
    summary = exp.get_metrics_summary("val_f1")     # dict with valueCurrent, valueMax, ...
    return float(summary["valueCurrent"]) if summary else 0.0

for exp in sorted(good, key=final_f1, reverse=True)[:5]:
    params = {p["name"]: p["valueCurrent"] for p in exp.get_parameters_summary()}
    print(exp.name, params.get("learning_rate"), final_f1(exp))
```

## Installation

```bash
pip install comet-ml            # current release 3.58.x; set COMET_API_KEY in the environment
```

Frameworks (PyTorch, scikit-learn, Keras, XGBoost, ...) are detected automatically: `import comet_ml` **before** importing them. Without an account or network, use `OfflineExperiment(offline_directory="./comet-offline")` and upload later with `comet upload <file>.zip`.

## Examples


### Example 1: Track a scikit-learn run and pick the best one

**User request:** "I keep retraining a churn model and losing track of which settings gave the best F1. Log my runs to Comet."

The agent adds `import comet_ml` at the top of `train.py`, creates `Experiment(project_name="churn-model", workspace="my-team")` reading `COMET_API_KEY` from the environment, logs `n_estimators` and `max_depth` with `log_parameters`, `val_f1` with `log_metric`, and a confusion matrix. After a few runs, `api.query("my-team", "churn-model", Metric("val_f1") > 0.8)` returns the matching runs, sorted in Python by `get_metrics_summary("val_f1")["valueCurrent"]`. Each run also appears in the project table at comet.com with its git commit and environment.

### Example 2: Promote a model and trace an LLM app

**User request:** "Register the best classifier as `text-classifier-prod` and trace the OpenAI calls in our support bot."

The agent calls `experiment.log_model("text-classifier", "./model_weights.pt")` followed by `experiment.register_model("text-classifier", registry_name="text-classifier-prod", version="1.2.0", status="Production")`, and later fetches it with `api.get_model(...).download("1.2.0", output_folder="./model_artifacts/")`. For the bot it installs `opik`, wraps the client with `track_openai(OpenAI())`, and checks the traces in the Opik project `support-bot-eval`.


## Guidelines

1. **Log everything from the start** — It's cheaper to log and not need it than to re-run experiments because you forgot a metric
2. **Use auto-logging** — Enable `auto_metric_logging` and `auto_param_logging` to capture framework metrics automatically
3. **Tag experiments** — Use tags (`experiment.add_tags()`) for filtering; tag by architecture, dataset version, or purpose
4. **Model registry for deployment** — Don't deploy from experiment artifacts; register models with versions and status tracking
5. **Log dataset hashes** — Use `log_dataset_hash()` for reproducibility; know exactly which data produced which results
6. **Confusion matrices for classification** — Always log confusion matrices; accuracy alone misses class imbalances
7. **Compare before deploying** — Use Comet's comparison view to verify new models outperform current production across all metrics
8. **LLM apps use Opik** — `comet-ml` is for training experiments and the model registry; trace prompts and LLM calls with the `opik` package
9. **Keep keys out of code** — read `COMET_API_KEY` from the environment or `~/.comet.config`, never commit it
