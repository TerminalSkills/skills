---
name: wandb
description: |
  Weights & Biases platform for ML experiment tracking, hyperparameter optimization,
  and artifact management. Log metrics, visualize training runs, run sweeps for
  hyperparameter tuning, and version datasets and models.
license: Apache-2.0
compatibility:
  - python 3.7+
  - wandb 0.15+
  - Linux/macOS/Windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - experiment-tracking
    - hyperparameter-tuning
    - visualization
    - artifacts
    - ml-ops
---

# Weights & Biases (W&B)

## Installation

```bash
# Install and login
pip install wandb
wandb login  # Enter API key from https://wandb.ai/authorize
```

## Basic Experiment Tracking

```python
# track_experiment.py — Log training metrics and parameters
import wandb
import random

wandb.init(
    project="my-ml-project",
    name="experiment-1",
    config={
        "learning_rate": 0.001,
        "epochs": 50,
        "batch_size": 32,
        "architecture": "resnet50",
        "optimizer": "adam",
    },
)

for epoch in range(wandb.config.epochs):
    train_loss = random.uniform(0.1, 1.0) * (1 - epoch / 50)
    val_loss = train_loss + random.uniform(0, 0.2)
    accuracy = 1 - val_loss + random.uniform(-0.05, 0.05)

    wandb.log({
        "epoch": epoch,
        "train/loss": train_loss,
        "val/loss": val_loss,
        "val/accuracy": accuracy,
    })

wandb.finish()
```

## PyTorch Integration

```python
# pytorch_wandb.py — Track PyTorch training with automatic gradient logging
import wandb
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

wandb.init(project="pytorch-demo", config={"lr": 0.01, "epochs": 20})

model = nn.Sequential(nn.Linear(10, 64), nn.ReLU(), nn.Linear(64, 2))
wandb.watch(model, log="all", log_freq=10)  # Log gradients and parameters

optimizer = torch.optim.Adam(model.parameters(), lr=wandb.config.lr)
criterion = nn.CrossEntropyLoss()

dataset = TensorDataset(torch.randn(1000, 10), torch.randint(0, 2, (1000,)))
loader = DataLoader(dataset, batch_size=32, shuffle=True)

for epoch in range(wandb.config.epochs):
    for x, y in loader:
        loss = criterion(model(x), y)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    wandb.log({"loss": loss.item(), "epoch": epoch})

wandb.finish()
```

## Hugging Face Trainer Integration

```python
# hf_wandb.py — Automatic logging with Hugging Face Trainer
import os
os.environ["WANDB_PROJECT"] = "hf-fine-tuning"

from transformers import TrainingArguments

training_args = TrainingArguments(
    output_dir="./results",
    report_to="wandb",
    run_name="distilbert-imdb",
    num_train_epochs=3,
    logging_steps=50,
)
# Trainer will automatically log to W&B
```

## Hyperparameter Sweeps

```yaml
# sweep_config.yaml — Define a hyperparameter sweep
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
  optimizer:
    values: ["adam", "sgd", "adamw"]
  dropout:
    distribution: uniform
    min: 0.1
    max: 0.5
```

```python
# sweep_train.py — Training script compatible with W&B sweeps
import wandb

def train():
    wandb.init()
    config = wandb.config

    # Use config.learning_rate, config.batch_size, etc.
    for epoch in range(10):
        loss = 1.0 / (epoch + 1) * (1 / config.learning_rate)
        accuracy = 1 - loss / 100
        wandb.log({"val/accuracy": accuracy, "train/loss": loss})

    wandb.finish()

# Create and run sweep
sweep_id = wandb.sweep(sweep="sweep_config.yaml", project="sweep-demo")
wandb.agent(sweep_id, function=train, count=20)
```

## Artifacts (Data and Model Versioning)

```python
# artifacts.py — Version datasets and models with W&B Artifacts
import wandb

# Log a dataset artifact
run = wandb.init(project="artifacts-demo", job_type="data-prep")
artifact = wandb.Artifact("my-dataset", type="dataset", description="Training dataset v1")
artifact.add_dir("./data/processed/")
run.log_artifact(artifact)
run.finish()

# Use the artifact in training
run = wandb.init(project="artifacts-demo", job_type="training")
artifact = run.use_artifact("my-dataset:latest")
data_dir = artifact.download()

# Log a model artifact
model_artifact = wandb.Artifact("my-model", type="model")
model_artifact.add_file("model.pt")
run.log_artifact(model_artifact)
run.finish()
```

## Tables and Media Logging

```python
# tables.py — Log rich media, tables, and images
import wandb
import numpy as np

wandb.init(project="media-demo")

# Log images
images = [wandb.Image(np.random.rand(28, 28), caption=f"Sample {i}") for i in range(5)]
wandb.log({"examples": images})

# Log a table
table = wandb.Table(columns=["input", "prediction", "label", "correct"])
table.add_data("Hello", "positive", "positive", True)
table.add_data("Terrible", "negative", "negative", True)
table.add_data("Okay", "positive", "neutral", False)
wandb.log({"predictions": table})

wandb.finish()
```

## Key Concepts

- **Runs**: Individual experiment executions with automatic system metrics (GPU, CPU, memory)
- **Config**: Hyperparameters tracked per run — use `wandb.config` for consistency
- **Sweeps**: Bayesian, grid, or random hyperparameter search with early stopping
- **Artifacts**: Version datasets, models, and other files with lineage tracking
- **`wandb.watch()`**: Automatically log model gradients and parameters during training
- **Reports**: Create shareable dashboards and reports from experiment data in the W&B UI
