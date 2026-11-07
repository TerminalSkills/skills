---
name: zenml
description: >-
  ZenML is an open-source Python framework for writing machine learning pipelines as typed steps whose inputs and outputs are versioned automatically, and for running the same code locally or on Kubernetes, Airflow, SageMaker and other backends. Use when a user asks to "build an ML pipeline", "track model training runs and artifacts", "make my training script reproducible", "version datasets and models", or "run a pipeline on a different stack". Covers @step and @pipeline, zenml init, stacks, run configs, artifacts, the Model control plane and the CLI.
license: Apache-2.0
compatibility: "Python 3.10-3.14; pip install 'zenml[local]' for a local SQLite-backed setup"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "zenml, mlops, ml-pipelines, artifacts, model-registry"
  repository: https://github.com/zenml-io/zenml
---
# ZenML — ML pipelines with automatic artifact and model versioning

## Overview

In ZenML you write plain Python functions decorated with `@step`, wire them together in a function decorated with `@pipeline`, and call the pipeline. Every step output is serialized by a materializer and stored in an artifact store as a versioned artifact; every run is recorded with its steps, parameters and status. The place a pipeline runs is the active stack (orchestrator, artifact store, optional experiment tracker, container registry and so on). The default stack runs everything locally in your process, so code written on a laptop can later move to a remote stack without changes to the steps.

Verified against ZenML 0.98.1 on Python 3.12 with the default local stack. Remote stacks, ZenML Pro and the hosted dashboard need accounts and cloud resources and are not covered. For experiment-only tracking use `mlflow`; for general scheduled data workflows use `airflow` or `prefect`.

## Instructions

### Installation and initialization

```bash
python -m venv .venv
.venv/bin/pip install "zenml[local]" scikit-learn pandas
.venv/bin/zenml --version
.venv/bin/zenml init
.venv/bin/zenml status
```

Plain `pip install zenml` is only the client: any command that needs the local database fails with an ImportError telling you to install `zenml[local]`. `zenml init` marks the current directory as the repository root (a `.zen` folder) and creates the default project and the default stack in a local SQLite store. Set `ZENML_ANALYTICS_OPT_IN=false` to disable usage analytics. Do not run `zenml login` unless the user gave you a server URL.

### Steps and pipelines

```python
from typing import Annotated, Tuple
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from zenml import Model, pipeline, step


@step
def load_customers(n_rows: int = 2000) -> pd.DataFrame:
    return pd.read_csv("data/customers.csv").head(n_rows)  # features plus a 0/1 "churned" column


@step
def split(df: pd.DataFrame) -> Tuple[
    Annotated[pd.DataFrame, "train"],
    Annotated[pd.DataFrame, "test"],
]:
    train, test = train_test_split(df, test_size=0.2, random_state=0, stratify=df.churned)
    return train, test


@step
def train_model(train: pd.DataFrame) -> Annotated[GradientBoostingClassifier, "churn_model"]:
    model = GradientBoostingClassifier(random_state=0)
    model.fit(train.drop(columns="churned"), train.churned)
    return model


@step
def evaluate(model: GradientBoostingClassifier, test: pd.DataFrame) -> Annotated[float, "roc_auc"]:
    return float(roc_auc_score(test.churned, model.predict_proba(test.drop(columns="churned"))[:, 1]))


@pipeline(model=Model(name="churn_model", description="Nightly churn scorer"))
def churn_training(n_rows: int = 2000):
    df = load_customers(n_rows=n_rows)
    train, test = split(df)
    model = train_model(train)
    evaluate(model, test)


if __name__ == "__main__":
    churn_training()
```

Rules: annotate every step input and output with types (the type selects the materializer); name outputs with `Annotated[type, "name"]`; step bodies run at execution time, but the pipeline body only wires steps, so do not put real logic or `print` of step outputs there. Install `pyarrow` to make the pandas materializer store parquet instead of CSV.

### Run and configure

```bash
python churn_pipeline.py                                    # run directly
zenml pipeline run churn_pipeline.churn_training -c run_config.yaml
```

`zenml pipeline run` takes an importable `module.pipeline_object` path and an optional YAML config. A minimal `run_config.yaml`:

```yaml
parameters:
  n_rows: 3000
enable_cache: false
```

Steps are cached by default: re-running with identical code and inputs reuses earlier outputs. Use `enable_cache=False` on a step or pipeline (or in the config) when a step reads external data that changed.

### Inspect runs, artifacts and models

```bash
zenml pipeline list
zenml pipeline runs list
zenml artifact list
zenml artifact version list
zenml model list
zenml model version list
zenml model model_artifacts churn_model
zenml stack list
zenml stack describe
```

Load results back in Python, for example to score new customers with the latest trained model:

```python
from zenml.client import Client

client = Client()
run = client.get_pipeline("churn_training").last_successful_run
model = run.steps["train_model"].outputs["churn_model"][0].load()
auc = client.get_artifact_version("roc_auc").load()
```

The `Model` attached to the pipeline groups each run's artifacts as a new model version (1, 2, ...), visible with `zenml model version list`.

### Stacks

The `default` stack is local. Other stacks are built from components (`zenml orchestrator`, `zenml artifact-store`, `zenml experiment-tracker`, ...) with `zenml stack register`, switched with `zenml stack set <name>`, and used for a single run with `zenml pipeline run ... -s <stack>`. Most remote components need an integration package (`zenml integration install <name>`) and cloud credentials; do that only with the user's own accounts.

## Examples

### Example 1: Make the churn training reproducible

**Request:** "Turn `train_churn.py` into a pipeline that records the data, model and AUC of every run."

Split the script into the four steps above, save it as `churn_pipeline.py`, then:

```bash
python churn_pipeline.py
zenml pipeline runs list
```

**Result:** the log ends with `Pipeline run has finished`; `zenml pipeline runs list` shows one run named `churn_training-<date>-<time>` and `zenml artifact list` shows `train`, `test`, `churn_model` and `roc_auc` (plus the `load_customers` output), each at version 1. The AUC is not printed; read it with `Client().get_artifact_version("roc_auc").load()`. The value depends on your data.

### Example 2: Re-run with more data and compare

**Request:** "Retrain with 3,000 rows and tell me whether AUC changed."

```bash
printf 'parameters:\n  n_rows: 3000\nenable_cache: false\n' > run_config.yaml
zenml pipeline run churn_pipeline.churn_training -c run_config.yaml
zenml model version list
```

```python
from zenml.client import Client

for v in ("1", "2"):
    ver = Client().get_model_version("churn_model", v)
    print(v, ver.get_artifact("roc_auc").load() if ver.get_artifact("roc_auc") else "n/a")
```

**Result:** `zenml model version list` now shows `churn_model` versions 1 and 2. Compare the two `roc_auc` values printed by the loop (on one test dataset the AUC rose from 0.60 to 0.64; yours will differ); the second run is a new version, the first stays untouched and can still be loaded.

## Guidelines

- Install `zenml[local]`, not bare `zenml`, for local work. Run `zenml init` once per project directory; the `.zen` folder is local state and belongs in `.gitignore`.
- Pipeline bodies are evaluated at definition/compile time. Do loading, training and printing inside steps.
- Type annotations on steps are required in practice; a missing or unsupported return type fails at materialization. Custom types need a custom materializer.
- Keep step outputs small enough to serialize; pass paths or table names for very large data.
- Caching can hide a changed data source: disable it for steps that read mutable external state.
- The default stack runs steps in your own process with your own environment: no isolation and no containers. Running on a remote orchestrator builds a Docker image and needs a container registry and cloud credentials.
- Never put secrets in step code or run configs; use `zenml secret` or environment variables of the target stack.
- Not the right tool for plain ETL without models, for a single script that never needs versioned artifacts, or when the team only wants metric charts (MLflow is lighter).
