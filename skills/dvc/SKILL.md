---
name: dvc
description: |
  Data Version Control for ML projects. Track large datasets and models alongside Git,
  build reproducible ML pipelines, and run experiments with metric comparison. Works with
  any storage backend including S3, GCS, Azure, and local filesystems.
license: Apache-2.0
compatibility:
  - python 3.8+
  - dvc 3.0+
  - Linux/macOS/Windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-ml
  tags:
    - data-versioning
    - ml-pipelines
    - experiment-tracking
    - reproducibility
    - git
---

# DVC (Data Version Control)

## Installation

```bash
# Install DVC with cloud storage support
pip install dvc[s3]    # For AWS S3
pip install dvc[gs]    # For Google Cloud Storage
pip install dvc[azure] # For Azure Blob Storage
pip install dvc[all]   # All remotes

# Initialize DVC in a Git repo
cd my-ml-project
git init
dvc init
```

## Track Data Files

```bash
# track_data.sh — Add large files to DVC tracking instead of Git
# Add a large dataset
dvc add data/training_images/
dvc add data/dataset.csv

# DVC creates .dvc files (small pointers) — commit those to Git
git add data/training_images.dvc data/dataset.csv.dvc .gitignore
git commit -m "Track training data with DVC"
```

## Configure Remote Storage

```bash
# setup_remote.sh — Configure where DVC stores actual file contents
# S3
dvc remote add -d myremote s3://my-bucket/dvc-storage

# Google Cloud Storage
dvc remote add -d myremote gs://my-bucket/dvc-storage

# Local / network path
dvc remote add -d myremote /mnt/shared/dvc-storage

# Push data to remote
dvc push

# Pull data from remote (on another machine or after cloning)
dvc pull
```

## Build Reproducible Pipelines

```yaml
# dvc.yaml — Define ML pipeline stages with dependencies and outputs
stages:
  prepare:
    cmd: python src/prepare.py
    deps:
      - src/prepare.py
      - data/raw/
    outs:
      - data/processed/

  train:
    cmd: python src/train.py
    deps:
      - src/train.py
      - data/processed/
    params:
      - train.epochs
      - train.learning_rate
      - train.batch_size
    outs:
      - models/model.pkl
    metrics:
      - metrics/train.json:
          cache: false

  evaluate:
    cmd: python src/evaluate.py
    deps:
      - src/evaluate.py
      - models/model.pkl
      - data/processed/
    metrics:
      - metrics/eval.json:
          cache: false
    plots:
      - metrics/confusion_matrix.csv:
          x: predicted
          y: actual
```

```yaml
# params.yaml — Pipeline parameters (tracked by DVC)
train:
  epochs: 50
  learning_rate: 0.001
  batch_size: 32
```

```bash
# Run the entire pipeline (only re-runs changed stages)
dvc repro

# Run a specific stage
dvc repro train
```

## Experiment Tracking

```bash
# experiments.sh — Run and compare ML experiments
# Run an experiment with modified parameters
dvc exp run --set-param train.learning_rate=0.01

# Run multiple experiments in parallel
dvc exp run --set-param train.learning_rate=0.001 --queue
dvc exp run --set-param train.learning_rate=0.01 --queue
dvc exp run --set-param train.learning_rate=0.1 --queue
dvc queue start --jobs 3

# Compare experiments
dvc exp show
dvc exp diff

# Apply a successful experiment to workspace
dvc exp apply exp-abc123

# Push experiment to Git branch
dvc exp push origin exp-abc123
```

## Metrics and Plots

```python
# train.py — Training script that outputs DVC-tracked metrics
import json
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score
import yaml
import pickle

# Load params
with open("params.yaml") as f:
    params = yaml.safe_load(f)["train"]

X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=params["epochs"])
model.fit(X_train, y_train)

preds = model.predict(X_test)
metrics = {
    "accuracy": accuracy_score(y_test, preds),
    "f1_score": f1_score(y_test, preds, average="weighted"),
}

with open("metrics/train.json", "w") as f:
    json.dump(metrics, f, indent=2)

with open("models/model.pkl", "wb") as f:
    pickle.dump(model, f)
```

```bash
# View metrics across experiments
dvc metrics show
dvc metrics diff

# Generate plots
dvc plots show metrics/confusion_matrix.csv
dvc plots diff  # Compare plots between experiments
```

## Data Access Without Cloning

```bash
# Access tracked files from any DVC repo without full clone
dvc get https://github.com/org/ml-repo data/processed/dataset.csv
dvc import https://github.com/org/ml-repo models/model.pkl
```

```python
# dvc_api.py — Access DVC-tracked files programmatically
import dvc.api

# Read a file from a DVC repo
with dvc.api.open("data/dataset.csv", repo="https://github.com/org/ml-repo") as f:
    import pandas as pd
    df = pd.read_csv(f)

# Get the URL of a tracked file
url = dvc.api.get_url("models/model.pkl", repo="https://github.com/org/ml-repo")
```

## Key Concepts

- **`.dvc` files**: Small pointer files committed to Git that reference large data in remote storage
- **`dvc repro`**: Reproduce pipelines — only re-runs stages with changed dependencies
- **Experiments**: Branch-free experiment tracking — run, compare, and apply results
- **Params**: YAML parameter files tracked by DVC for reproducible configurations
- **Metrics**: JSON/YAML metrics files with built-in comparison tools
- **Remote storage**: S3, GCS, Azure, SSH, HDFS — data stays where you want it
