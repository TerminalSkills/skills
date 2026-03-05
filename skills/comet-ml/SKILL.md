---
name: comet-ml
description: Expert guidance for Comet ML, the platform for tracking machine learning experiments, managing models, and monitoring production ML systems. Helps developers log experiments, compare model versions, and build reproducible ML pipelines with automatic code/data versioning.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
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

You are an expert in Comet ML, the platform for tracking machine learning experiments, managing models, and monitoring production ML systems. You help developers log experiments, compare model versions, and build reproducible ML pipelines with automatic code/data versioning.

## Instructions

### Experiment Tracking

```python
# train.py — Track a training run with Comet ML
import comet_ml
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

# Log the model
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
# Register and version models for deployment
from comet_ml import API

api = API(api_key=os.environ["COMET_API_KEY"])

# Register a model from an experiment
experiment = api.get_experiment("my-team", "text-classifier", "abc123")

# Register to model registry
experiment.register_model(
    model_name="text-classifier-prod",
    version="1.2.0",
    description="DistilBERT fine-tuned on customer reviews, F1=0.92",
    tags=["production-ready"],
    status="Production",              # Staging | Production | Archived
)

# Retrieve a registered model
model = api.get_model(workspace="my-team", model_name="text-classifier-prod")
latest = model.get_details("1.2.0")
print(f"Model: {latest['modelName']} v{latest['version']}")
print(f"Status: {latest['status']}")

# Download model assets
model.download("1.2.0", output_folder="./model_artifacts/")

# Compare two model versions
experiments = api.query("my-team", "text-classifier",
    Expression("val_f1", ">", 0.85))
for exp in experiments:
    print(f"{exp.id}: F1={exp.get_metric('val_f1')}")
```

### LLM Tracking

```python
# Track LLM/prompt experiments
from comet_ml import Experiment
from comet_ml.integration.openai import comet_openai_trace

# Auto-log OpenAI API calls
experiment = Experiment(project_name="llm-eval")
comet_openai_trace(experiment)              # Patches OpenAI client

# All OpenAI calls are automatically logged with:
# - Prompt text and system message
# - Model used and parameters
# - Response text
# - Token usage and cost
# - Latency

response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Summarize this text..."}],
)
# ↑ Automatically logged to Comet dashboard

# Manual prompt logging
experiment.log_text("prompt_template", "Summarize the following: {text}")
experiment.log_metric("prompt_tokens", response.usage.prompt_tokens)
experiment.log_metric("completion_tokens", response.usage.completion_tokens)
experiment.log_metric("total_cost", calculate_cost(response.usage))
```

### Comparing Experiments

```python
# Query and compare experiments programmatically
from comet_ml import API

api = API()

# Get all experiments in a project
experiments = api.get_experiments("my-team", "text-classifier")

# Filter by metric
best = sorted(experiments, key=lambda e: e.get_metric("val_f1") or 0, reverse=True)[:5]

for exp in best:
    params = exp.get_parameters_summary()
    metrics = exp.get_metrics_summary()
    print(f"Experiment: {exp.name}")
    print(f"  Model: {params.get('model')}")
    print(f"  F1: {metrics.get('val_f1')}")
    print(f"  Accuracy: {metrics.get('val_accuracy')}")
```

## Installation

```bash
pip install comet-ml

# With framework integrations
pip install comet-ml[pytorch]
pip install comet-ml[tensorflow]
pip install comet-ml[sklearn]
```


## Examples

### Example 1

**User request:** "Help me set up Comet Ml"

The agent follows the instructions above to configure Comet Ml with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Comet Ml configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Log everything from the start** — It's cheaper to log and not need it than to re-run experiments because you forgot a metric
2. **Use auto-logging** — Enable `auto_metric_logging` and `auto_param_logging` to capture framework metrics automatically
3. **Tag experiments** — Use tags (`experiment.add_tags()`) for filtering; tag by architecture, dataset version, or purpose
4. **Model registry for deployment** — Don't deploy from experiment artifacts; register models with versions and status tracking
5. **Log dataset hashes** — Use `log_dataset_hash()` for reproducibility; know exactly which data produced which results
6. **Confusion matrices for classification** — Always log confusion matrices; accuracy alone misses class imbalances
7. **Compare before deploying** — Use Comet's comparison view to verify new models outperform current production across all metrics
8. **LLM cost tracking** — Log token usage and calculated costs for every LLM call; costs add up fast in production
