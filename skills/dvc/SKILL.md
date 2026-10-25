---
name: dvc
description: |
  DVC (Data Version Control) tracks large datasets and models next to Git, builds reproducible ML pipelines and compares experiments. Use when the user says "version my dataset", "dvc add", "dvc repro", "track ML experiments", "push data to S3 or GCS" or wants to reproduce a model from a Git commit.
license: Apache-2.0
compatibility: 'Python 3.9+, dvc 3.x (checked with 3.67), Git, Linux/macOS/Windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/treeverse/dvc
  tags: "data-versioning, ml-pipelines, experiment-tracking, reproducibility, git"
---

# DVC (Data Version Control)

## Overview

DVC keeps big files out of Git. `dvc add` replaces a file or directory with a small `.dvc` pointer that Git tracks, while the content goes to a cache and a remote (S3, GCS, Azure, SSH, local path). `dvc.yaml` describes pipeline stages with dependencies, parameters and outputs, so `dvc repro` re-runs only what changed. `dvc exp` runs and compares experiments without making a branch per try.

## Instructions

### Install and initialise

```bash
pip install dvc            # or: pipx install dvc, uv tool install dvc
pip install "dvc[s3]"      # remote extras: s3, gs, azure, ssh, webdav; "dvc[all]" for all
cd churn-model
git init && dvc init       # creates .dvc/ and .dvcignore; commit them
```

### Track data

```bash
dvc add data/raw                  # file or directory; writes data/raw.dvc, adds data/raw to .gitignore
git add data/raw.dvc data/.gitignore
git commit -m "Track raw data with DVC"
```

Never run `git add` on the data itself. Once a path is tracked by DVC, Git must not track it too.

### Remote storage

```bash
dvc remote add -d storage s3://acme-ml-data/dvc-store   # -d makes it the default
# other URL forms (use one name once; add -f to replace an existing remote):
#   gs://acme-ml-data/dvc-store    GCS
#   /mnt/shared/dvc-store          local or network path
dvc remote modify --local storage profile ml-team        # S3 profile; credentials go in --local (not committed)
dvc push      # upload cache to the remote
dvc pull      # download what the current commit needs (after clone or checkout)
```

Keep secrets out of `.dvc/config`; use `--local` (written to `.dvc/config.local`, git-ignored) or the cloud provider's environment variables.

### Pipelines

`dvc.yaml` (stages) and `params.yaml` (parameters) are both committed:

```yaml
# dvc.yaml
stages:
  prepare:
    cmd: python src/prepare.py
    deps: [src/prepare.py, data/raw]
    outs: [data/processed]
  train:
    cmd: python src/train.py
    deps: [src/train.py, data/processed]
    params: [train.n_estimators, train.max_depth]
    outs: [models/model.pkl]
    metrics:
      - metrics/train.json:
          cache: false
    plots:
      - metrics/confusion.csv:
          cache: false
          x: predicted
          y: actual
```

```yaml
# params.yaml
train:
  n_estimators: 50
  max_depth: 5
```

```bash
dvc repro            # runs stale stages, writes dvc.lock (commit it)
dvc repro train      # one stage and its upstream
dvc dag              # show stage graph
```

`dvc stage add -n train -d src/train.py -o models/model.pkl python src/train.py` creates a stage from the command line.

### Experiments

```bash
dvc exp run -S train.n_estimators=100            # one run with an overridden parameter
dvc exp run -S train.n_estimators=10 --queue     # queue instead of running
dvc exp run -S train.n_estimators=200 --queue
dvc queue start -j 2                              # run queued experiments with 2 workers
dvc queue status
dvc exp show                                      # table of params and metrics per experiment
dvc exp diff
dvc exp apply eight-gaze                          # put an experiment's result into the workspace
dvc exp push origin eight-gaze                    # share it as a Git ref (needs a Git remote)
```

Experiments get generated names (like `eight-gaze`); use the name `dvc exp show` prints. `dvc exp run` also leaves the result in your workspace, so commit it if you want to keep it.

### Metrics and plots

```bash
dvc metrics show
dvc metrics diff main                # compare workspace with a revision
dvc plots show metrics/confusion.csv # writes dvc_plots/index.html
dvc plots diff main
```

### Use data from another repository

```bash
dvc get https://github.com/acme-ml/churn-data data/processed   # download once, no link
dvc import https://github.com/acme-ml/churn-data data/processed # download and record the source in a .dvc file; update with dvc update
```

```python
import dvc.api
import pandas as pd

with dvc.api.open("data/processed/customers.csv", repo="https://github.com/acme-ml/churn-data") as f:
    df = pd.read_csv(f)
url = dvc.api.get_url("models/model.pkl", repo="https://github.com/acme-ml/churn-data")
```

## Examples

### Example 1: "Version my 5 GB image folder and share it with the team"

```bash
dvc add data/images
git add data/images.dvc data/.gitignore && git commit -m "Track images"
dvc remote add -d storage s3://acme-ml-data/dvc-store
git add .dvc/config && git commit -m "Configure DVC remote"
dvc push
```

A teammate then runs `git clone ... && dvc pull`. `dvc pull` then restores `data/images` from the S3 store.

### Example 2: "Try three learning depths and keep the best"

```bash
for d in 3 5 8; do dvc exp run -S train.max_depth=$d --queue; done
dvc queue start -j 3
dvc exp show --only-changed
dvc exp apply calm-tail   # the name from the table
git add dvc.lock params.yaml metrics && git commit -m "Use max_depth 8"
```

`dvc exp show` prints one row per experiment with accuracy and the changed parameters, so the best one can be chosen by value and applied.

## Guidelines

- Commit `dvc.yaml`, `dvc.lock`, `params.yaml`, `.dvc` files and `.gitignore` changes; do not commit data, models or `.dvc/cache`.
- A stage `params:` entry must match a key in `params.yaml`, and the script must read that key; a mismatch silently makes the stage ignore the change.
- Mark small metrics files `cache: false` so Git can show their diffs.
- Run `dvc push` before pushing the Git commit, or teammates get pointers to data that is not in the remote.
- Only pickle-load model files you produced yourself; `model.pkl` from an untrusted repository can run code.
- DVC is not a database or a feature store; for small text files plain Git is simpler.
