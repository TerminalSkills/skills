---
name: wandb
description: |
  Weights & Biases platform for ML experiment tracking, hyperparameter optimization,
  and artifact management. Log metrics, visualize training runs, run sweeps for
  hyperparameter tuning, and version datasets and models.
license: Apache-2.0
compatibility: 'Python 3.10+, wandb 0.31+, Linux/macOS/Windows; a W&B account or a self-hosted server'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/wandb/wandb
  tags: "experiment-tracking, hyperparameter-tuning, visualization, artifacts, ml-ops"
---

# Weights & Biases (W&B)

## Overview

Weights & Biases (the `wandb` Python package) records the config, metrics, system stats, media and files of every training run, compares runs in a web dashboard, searches hyperparameters with sweeps, and versions datasets and models as artifacts. This skill covers installation, run tracking, framework integrations, sweeps, artifacts and tables.

## Instructions

### Install and authenticate

```bash
pip install wandb
wandb login          # paste a personal API key from your W&B user settings
```

In CI or containers, skip the interactive login and export the key instead: `export WANDB_API_KEY=...` (read it from your secret store, never commit it). To record a run without a network or an account, set `WANDB_MODE=offline` and upload later with `wandb sync wandb/offline-run-*`; `WANDB_MODE=disabled` turns every call into a no-op. Self-hosted servers: set `WANDB_BASE_URL`.

`wandb.Image` needs `pillow` and numpy arrays need `numpy`; W&B does not install them for you. The package requires Python 3.10 or newer (0.31.0).

### Track a run

```python
# train.py
import random
import wandb

run = wandb.init(
    project="churn-model",
    name="resnet50-baseline",
    config={"learning_rate": 0.001, "epochs": 50, "batch_size": 32, "optimizer": "adam"},
)

for epoch in range(run.config.epochs):
    train_loss = random.uniform(0.1, 1.0) * (1 - epoch / run.config.epochs)
    val_loss = train_loss + random.uniform(0, 0.2)
    run.log({"epoch": epoch, "train/loss": train_loss, "val/loss": val_loss})

run.summary["best_val_loss"] = val_loss   # final value shown in the runs table
run.finish()
```

`wandb.init` returns the run object; prefer `run.log` / `run.config` over the module-level `wandb.log` / `wandb.config` so code also works with several runs. Metrics named `group/name` are grouped in the UI. `with wandb.init(...) as run:` finishes the run automatically.

### PyTorch and Hugging Face

```python
# pytorch_wandb.py
import torch
import torch.nn as nn
import wandb

run = wandb.init(project="pytorch-demo", config={"lr": 0.01, "epochs": 20})
model = nn.Sequential(nn.Linear(10, 64), nn.ReLU(), nn.Linear(64, 2))
run.watch(model, log="all", log_freq=100)    # gradients and parameters

optimizer = torch.optim.Adam(model.parameters(), lr=run.config.lr)
criterion = nn.CrossEntropyLoss()
x, y = torch.randn(1000, 10), torch.randint(0, 2, (1000,))

for epoch in range(run.config.epochs):
    loss = criterion(model(x), y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    run.log({"loss": loss.item(), "epoch": epoch})
run.finish()
```

Hugging Face `Trainer` logs to W&B when `report_to="wandb"` is set in `TrainingArguments`; choose the project with the `WANDB_PROJECT` environment variable and the run name with `run_name`.

### Sweeps

Define the search in YAML for the command line, or as a Python dict for use inside a script.

```yaml
# sweep.yaml
program: train.py
method: bayes
metric:
  name: val/accuracy
  goal: maximize
parameters:
  learning_rate:
    distribution: log_uniform_values
    min: 0.0001
    max: 0.1
  batch_size:
    values: [16, 32, 64, 128]
  dropout:
    distribution: uniform
    min: 0.1
    max: 0.5
```

```console
$ wandb sweep sweep.yaml            # prints the sweep ID and the agent command
$ wandb agent my-team/churn-model/k3x9q2ab --count 20
```

`train.py` calls `wandb.init()` with no arguments and reads the values the agent chose from `run.config`; it must log the metric named in `metric.name`. Inside Python, `wandb.sweep(sweep=sweep_dict, project=...)` takes a dict, not a file path, and `wandb.agent(sweep_id, function=train, count=20)` runs a function instead of the `program`.

### Artifacts

```python
# artifacts.py
import wandb

run = wandb.init(project="churn-model", job_type="data-prep")
dataset = wandb.Artifact("customer-features", type="dataset", description="Cleaned features")
dataset.add_dir("./data/processed/")
run.log_artifact(dataset)
run.finish()

run = wandb.init(project="churn-model", job_type="training")
data_dir = run.use_artifact("customer-features:latest").download()
model = wandb.Artifact("churn-classifier", type="model")
model.add_file("model.pt")
run.log_artifact(model)
run.finish()
```

`use_artifact` records lineage between the dataset and the model run. Refer to versions as `name:v3`, `name:latest` or an alias you set.

### Tables and media

```python
# tables.py
import numpy as np
import wandb

run = wandb.init(project="sentiment-eval")
run.log({"examples": [wandb.Image(np.random.rand(28, 28), caption=f"sample {i}") for i in range(5)]})

table = wandb.Table(columns=["text", "prediction", "label", "correct"])
table.add_data("Great battery life", "positive", "positive", True)
table.add_data("Arrived broken", "negative", "negative", True)
table.add_data("It is fine", "positive", "neutral", False)
run.log({"predictions": table})
run.finish()
```

## Examples

### Example 1: Add tracking to an existing training script
**User prompt:** "My train.py prints the loss every epoch. Log it to Weights & Biases so I can compare runs with different learning rates."

The agent runs `pip install wandb`, adds `run = wandb.init(project="churn-model", config={...})` with the hyperparameters from the argument parser, replaces the `print` with `run.log({"train/loss": loss, "epoch": epoch})`, and calls `run.finish()`. Result: each execution appears as a run with its config and loss curve in the project page; runs sort and overlay by `learning_rate`.

### Example 2: Tune hyperparameters with a sweep
**User prompt:** "Find the best learning rate and batch size for my classifier; I have GPU time for about 30 trials."

The agent writes `sweep.yaml` (Bayesian search, `val/accuracy` to maximize), makes `train.py` read `run.config`, runs `wandb sweep sweep.yaml`, then `wandb agent my-team/churn-model/k3x9q2ab --count 30` (the ID is printed by the first command). Result: the sweep page shows the parameter importance chart and the best run's config.

## Guidelines

- Never hard-code the API key; use `wandb login` locally and `WANDB_API_KEY` from a secret store in CI. Do not log secrets or personal data in config or tables.
- Always end a run with `run.finish()` (or a `with` block); otherwise the process may hang at exit or the last metrics are lost, especially in notebooks.
- Log scalars every step, but media, tables and gradients sparingly: large tables and `log="all"` slow training and fill storage.
- Artifacts upload the files to W&B storage; check data-residency and size limits before logging private or very large datasets (use reference artifacts via `add_reference` for files that stay in your own bucket).
- Sweep agents run `program` as a fresh process for every trial; set a `count` so a Bayesian sweep does not run forever.
- For reproducible comparisons, log the git commit and random seed in `config`.
