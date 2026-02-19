---
name: mlflow
description: |
  Open-source platform for managing the ML lifecycle. Track experiments with metrics and
  parameters, register and version models, deploy models to various targets, and build
  reproducible ML pipelines. Integrates with all major ML frameworks.
license: Apache-2.0
compatibility:
  - python 3.8+
  - mlflow 2.0+
  - Linux/macOS/Windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-ml
  tags:
    - experiment-tracking
    - model-registry
    - ml-lifecycle
    - deployment
    - pipelines
---

# MLflow

## Installation

```bash
# Install MLflow
pip install mlflow

# Start the tracking UI
mlflow ui --port 5000
# Visit http://localhost:5000
```

## Experiment Tracking

```python
# track_experiment.py — Log parameters, metrics, and artifacts to MLflow
import mlflow
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

mlflow.set_tracking_uri("http://localhost:5000")
mlflow.set_experiment("iris-classification")

X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

with mlflow.start_run(run_name="random-forest-v1"):
    # Log parameters
    n_estimators = 100
    max_depth = 5
    mlflow.log_param("n_estimators", n_estimators)
    mlflow.log_param("max_depth", max_depth)

    # Train model
    model = RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth)
    model.fit(X_train, y_train)

    # Log metrics
    accuracy = accuracy_score(y_test, model.predict(X_test))
    mlflow.log_metric("accuracy", accuracy)
    mlflow.log_metric("train_size", len(X_train))

    # Log model
    mlflow.sklearn.log_model(model, "model")

    # Log artifacts
    import json
    with open("feature_importance.json", "w") as f:
        json.dump(dict(zip(["f1","f2","f3","f4"], model.feature_importances_.tolist())), f)
    mlflow.log_artifact("feature_importance.json")

    print(f"Run ID: {mlflow.active_run().info.run_id}")
    print(f"Accuracy: {accuracy:.4f}")
```

## Autologging

```python
# autolog.py — Automatically log parameters, metrics, and models
import mlflow
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split

# Enable autologging for sklearn (also works with pytorch, tensorflow, xgboost, etc.)
mlflow.sklearn.autolog()

X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

with mlflow.start_run():
    model = GradientBoostingClassifier(n_estimators=200, learning_rate=0.1)
    model.fit(X_train, y_train)
    # All params, metrics, and model are logged automatically
```

## Model Registry

```python
# model_registry.py — Register, version, and manage models
import mlflow

# Register a model from a run
model_uri = f"runs:/{run_id}/model"
model_version = mlflow.register_model(model_uri, "iris-classifier")

# Load a registered model
from mlflow.pyfunc import load_model
model = load_model("models:/iris-classifier/1")  # By version
model = load_model("models:/iris-classifier@production")  # By alias

# Set model alias
client = mlflow.tracking.MlflowClient()
client.set_registered_model_alias("iris-classifier", "production", version=1)
client.set_registered_model_alias("iris-classifier", "staging", version=2)
```

## PyTorch Integration

```python
# pytorch_tracking.py — Track PyTorch training with MLflow
import mlflow
import torch
import torch.nn as nn

mlflow.set_experiment("pytorch-demo")

with mlflow.start_run():
    model = nn.Sequential(nn.Linear(10, 64), nn.ReLU(), nn.Linear(64, 1))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.MSELoss()

    mlflow.log_param("learning_rate", 0.001)
    mlflow.log_param("architecture", "10-64-1")

    for epoch in range(100):
        x = torch.randn(32, 10)
        y = torch.randn(32, 1)
        loss = criterion(model(x), y)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        if epoch % 10 == 0:
            mlflow.log_metric("loss", loss.item(), step=epoch)

    mlflow.pytorch.log_model(model, "model")
```

## Serving Models

```bash
# Serve a registered model as a REST API
mlflow models serve -m "models:/iris-classifier@production" -p 5001 --no-conda

# Test the endpoint
curl -X POST http://localhost:5001/invocations \
    -H "Content-Type: application/json" \
    -d '{"inputs": [[5.1, 3.5, 1.4, 0.2]]}'
```

## Remote Tracking Server

```bash
# Start a remote tracking server with PostgreSQL backend and S3 artifact store
mlflow server \
    --backend-store-uri postgresql://user:pass@localhost:5432/mlflow \
    --default-artifact-root s3://my-mlflow-bucket/artifacts \
    --host 0.0.0.0 \
    --port 5000
```

## Key Concepts

- **Runs**: Individual experiment executions with parameters, metrics, and artifacts
- **Experiments**: Groups of runs for comparison and organization
- **Model Registry**: Central hub for versioning, aliasing (staging/production), and managing models
- **Autologging**: One-line integration for sklearn, PyTorch, TensorFlow, XGBoost, etc.
- **Artifacts**: Files (models, plots, data) stored alongside runs for reproducibility
- **Model serving**: Deploy any registered model as a REST API with `mlflow models serve`
