---
name: mlflow
description: >-
  MLflow is an open-source platform for tracking machine-learning experiments, versioning models in a registry and serving them as a REST API. Use it when the user wants to log parameters, metrics and artifacts, compare runs, register a model with aliases like "production", set up a shared tracking server, or serve a trained model locally. Covers MLflow 3 (name= in log_model, signatures, skops serialization for scikit-learn).
license: Apache-2.0
compatibility: 'Python 3.10+, mlflow 3.x, Linux/macOS/Windows'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/mlflow/mlflow
  tags: "experiment-tracking, model-registry, ml-lifecycle, deployment"
---

# MLflow

## Overview

MLflow records what happened in each training run (parameters, metrics, files, the model itself), keeps a registry of model versions, and can serve a model over HTTP. This skill targets MLflow 3.x (checked against 3.17.2, which requires Python 3.10+). Three changes since 2.x matter in practice: `log_model` takes `name=` (the old `artifact_path=` still exists but is deprecated), scikit-learn models are saved with `skops` instead of pickle, and the tracking server rejects requests whose `Host` header is not allow-listed.

## Instructions

1. Install in a virtual environment: `pip install mlflow scikit-learn`. A quick local server with a SQLite backend:
   ```bash
   mlflow server --backend-store-uri sqlite:///mlflow.db --host 127.0.0.1 --port 5000
   ```
   The UI is at http://127.0.0.1:5000. `mlflow ui` is the same app for local use.
2. Point code at it with `mlflow.set_tracking_uri("http://127.0.0.1:5000")` or the `MLFLOW_TRACKING_URI` environment variable, then `mlflow.set_experiment("name")`.
3. Wrap training in `with mlflow.start_run(run_name=...)`. Use `log_params`, `log_metric(name, value, step=...)`, `log_dict` / `log_artifact` for files.
4. Log the model with `mlflow.<flavor>.log_model(model, name="model", signature=...)`. Build the signature with `infer_signature(X_train, predictions)`; serving then validates column names and types.
5. Register by passing `registered_model_name=` to `log_model`, or call `mlflow.register_model(info.model_uri, "iris-classifier")` with the `info` returned by `log_model`. Stages are deprecated: point aliases (`production`) at versions with `MlflowClient().set_registered_model_alias(name, alias, version)` and load via `models:/name@alias`.
6. Serve with `mlflow models serve -m "models:/name@alias" -p 5001 --env-manager local` (run it inside the environment that has the model's dependencies; without `--env-manager local` MLflow builds a fresh one).
7. Prefer `mlflow.<flavor>.autolog()` (sklearn, pytorch, xgboost, lightgbm, tensorflow, ...) when you do not need custom logging.

## Examples

### Track, register and alias a scikit-learn model

```python
# train_iris.py - log params, metrics, signature and register the model
import mlflow
from mlflow import MlflowClient
from mlflow.models import infer_signature
from sklearn.datasets import load_iris
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

mlflow.set_tracking_uri("http://127.0.0.1:5000")
mlflow.set_experiment("iris-classification")

X, y = load_iris(return_X_y=True, as_frame=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

with mlflow.start_run(run_name="random-forest-v1"):
    mlflow.log_params({"n_estimators": 100, "max_depth": 5})
    model = RandomForestClassifier(n_estimators=100, max_depth=5).fit(X_train, y_train)
    mlflow.log_metric("accuracy", accuracy_score(y_test, model.predict(X_test)))
    mlflow.log_dict(dict(zip(X.columns, model.feature_importances_.tolist())), "feature_importance.json")
    mlflow.sklearn.log_model(
        model,
        name="model",
        signature=infer_signature(X_train, model.predict(X_train)),
        registered_model_name="iris-classifier",
        # scikit-learn trees are saved with skops; trust the Tree type for a model you trained yourself
        skops_trusted_types=["sklearn.tree._tree.Tree"],
    )

MlflowClient().set_registered_model_alias("iris-classifier", "production", 1)
loaded = mlflow.pyfunc.load_model("models:/iris-classifier@production")
print(loaded.predict(X_test.head(2)))
```

Result: the run appears under the `iris-classification` experiment, version 1 of `iris-classifier` exists, and the last line prints predictions such as `[1 0]`.

### Serve the registered model and call it

```bash
export MLFLOW_TRACKING_URI=http://127.0.0.1:5000
mlflow models serve -m "models:/iris-classifier@production" -p 5001 --env-manager local

curl -s -X POST http://127.0.0.1:5001/invocations \
  -H "Content-Type: application/json" \
  -d '{"dataframe_split": {"columns": ["sepal length (cm)", "sepal width (cm)", "petal length (cm)", "petal width (cm)"], "data": [[5.1, 3.5, 1.4, 0.2]]}}'
# {"predictions": [0]}
```

A model saved with a column-named signature rejects a bare `{"inputs": [[5.1, 3.5, 1.4, 0.2]]}` with `SCHEMA_ENFORCEMENT_FAILED`; send named columns as above.

### Autologging and a shared server

```python
import mlflow
from sklearn.ensemble import GradientBoostingClassifier

mlflow.sklearn.autolog()           # params, training metrics and the model are logged on fit()
with mlflow.start_run():           # X_train, y_train as in the first example
    GradientBoostingClassifier(n_estimators=200).fit(X_train, y_train)
```

```bash
# Team server: PostgreSQL metadata, S3 artifacts, reachable by a named host
mlflow server \
  --backend-store-uri "postgresql://mlflow:${MLFLOW_DB_PASSWORD}@db.internal:5432/mlflow" \
  --default-artifact-root s3://ml-team-artifacts/runs \
  --host 0.0.0.0 --port 5000 \
  --allowed-hosts "mlflow.ml-team.internal,localhost:*"
```

## Guidelines

- Use `name="model"` in `log_model`; `artifact_path` is deprecated in MLflow 3.
- A scikit-learn tree ensemble fails to save with "untrusted types" unless you pass `skops_trusted_types=[...]` (reviewed types only) or choose `serialization_format="cloudpickle"`. Never load pickle-based models from a source you do not trust.
- Do not bind `--host 0.0.0.0` without authentication in front (reverse proxy, VPN, or MLflow's basic-auth app); set `--allowed-hosts` and `--cors-allowed-origins` for the names clients use. `--disable-security-middleware` is for throwaway setups only.
- `mlflow models serve` with `--env-manager local` uses the current Python, so `uvicorn` and the model's libraries must be on `PATH` (activate the venv first).
- Keep database passwords in environment variables, not in shell history or committed files.
- Model registry stages (Staging/Production) are deprecated; use aliases and tags.
