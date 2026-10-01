---
name: clearml
description: >-
  ClearML is an open-source MLOps platform that records machine-learning
  experiments, versions datasets, chains tasks into pipelines and runs them on
  remote machines through agents and queues. Use when a user asks to "track
  experiments with ClearML", "log metrics, artifacts and models", "version a
  dataset", "run training on a remote GPU with clearml-agent", "build a ClearML
  pipeline", "run hyperparameter optimization", or "self-host ClearML Server".
  Covers the clearml 2.x Python SDK, clearml-agent 3.x and ClearML Server 2.x.
license: Apache-2.0
compatibility: "Python package clearml 2.x (pip). Needs a ClearML Server: the hosted app.clear.ml or a self-hosted one (Docker, at least 8 GB of RAM); offline mode works without a server. Remote execution needs clearml-agent on the worker."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/clearml/clearml
  tags:
  - ml-ops
  - experiment-tracking
  - pipeline
  - orchestration
  - data-management
---

# ClearML — Open-Source ML Operations

## Overview

ClearML has three parts. The `clearml` Python package turns a script into a tracked *task*: code version, installed packages, arguments, console output, metrics, artifacts and models are recorded. ClearML Server stores and shows them. `clearml-agent` runs on worker machines, pulls tasks from named queues, rebuilds their environment and executes them. Pipelines, hyperparameter optimization and dataset versioning are built on those three pieces.

## Instructions

### 1. Install and connect

```bash
pip install clearml
clearml-init          # asks for credentials created in the web UI: Settings > Workspace > Create new credentials
```

`clearml-init` writes `~/clearml.conf` and refuses to overwrite an existing one. In CI and containers use environment variables instead of the file:

```bash
export CLEARML_API_HOST=https://api.clear.ml
export CLEARML_WEB_HOST=https://app.clear.ml
export CLEARML_FILES_HOST=https://files.clear.ml
export CLEARML_API_ACCESS_KEY="$CLEARML_ACCESS_KEY_FROM_VAULT"
export CLEARML_API_SECRET_KEY="$CLEARML_SECRET_KEY_FROM_VAULT"
```

A self-hosted server exposes the web UI on port 8080, the API on 8008 and the file server on 8081:

```bash
git clone --depth 1 --branch v2.4.0 https://github.com/clearml/clearml-server.git
sudo sysctl -w vm.max_map_count=524288          # required by the Elasticsearch container
sudo mkdir -p /opt/clearml/data/elastic_7 /opt/clearml/data/mongo_4/db /opt/clearml/data/mongo_4/configdb \
  /opt/clearml/data/redis /opt/clearml/data/fileserver /opt/clearml/logs /opt/clearml/config
sudo chown -R 1000:1000 /opt/clearml
docker compose -f clearml-server/docker/compose.yaml up -d      # UI at http://localhost:8080
# with the old docker-compose v1 binary use docker/docker-compose.yml instead
```

### 2. Track an experiment

```python
# train.py
import argparse

import joblib
from clearml import Task
from sklearn.datasets import load_wine
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split

parser = argparse.ArgumentParser()
parser.add_argument("--n-estimators", type=int, default=200)
parser.add_argument("--max-depth", type=int, default=6)
args = parser.parse_args()

task = Task.init(project_name="wine-quality", task_name="random-forest-baseline", tags=["baseline"])
params = task.connect({"test_size": 0.25, "seed": 42})   # shown under "General"; argparse values under "Args"

X, y = load_wine(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=params["test_size"], random_state=params["seed"])

logger = task.get_logger()
for depth in range(1, args.max_depth + 1):
    model = RandomForestClassifier(n_estimators=args.n_estimators, max_depth=depth, random_state=params["seed"])
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    logger.report_scalar(title="eval", series="accuracy", value=accuracy_score(y_test, pred), iteration=depth)
    logger.report_scalar(title="eval", series="f1", value=f1_score(y_test, pred, average="macro"), iteration=depth)

joblib.dump(model, "model.joblib")                        # registered as an output model
task.upload_artifact("test_predictions", artifact_object={"pred": pred.tolist(), "true": y_test.tolist()})
task.close()
```

`Task.init()` is the only required call: argparse arguments, console output, the git commit with uncommitted changes, installed packages, and what supported frameworks report (PyTorch, TensorFlow/Keras, scikit-learn via joblib, XGBoost, matplotlib, TensorBoard) are captured automatically. Pass `output_uri=True` to upload model files to the file server, or an `s3://`, `gs://` or `azure://` URL to upload them there. Rerunning the same script reuses the previous task unless it has artifacts or models; pass `reuse_last_task_id=False` to always start a new one.

### 3. Work without a server (offline mode)

```bash
CLEARML_OFFLINE_MODE=1 python train.py
clearml-task --import-offline-session ~/.clearml/cache/offline/offline-d652b83b3fbe44cd9e2e586bbf91904c.zip
```

The run is stored as a zip under `~/.clearml/cache/offline/`; the second command uploads it once a server is reachable. In code: `Task.set_offline(offline_mode=True)` before `Task.init()` and `Task.import_offline_session(session_folder_zip=...)` afterwards.

### 4. Version datasets

```python
from clearml import Dataset

ds = Dataset.create(dataset_name="customer-reviews", dataset_project="nlp-sentiment", dataset_version="1.0.0")
ds.add_files(path="data/")            # a file or a whole folder
ds.upload()            # to the ClearML file server, or upload(output_url="s3://ml-datasets/reviews")
ds.finalize()          # the version is now immutable

# New version: inherits the parent's files, stores only the difference
ds2 = Dataset.create(dataset_name="customer-reviews", dataset_project="nlp-sentiment",
                     dataset_version="1.1.0", parent_datasets=[ds.id])
ds2.add_files(path="data/reviews_2026_q3.parquet")
ds2.remove_files(dataset_path="labels_draft.csv")
ds2.upload(); ds2.finalize()

# In training code: a cached, read-only local copy
folder = Dataset.get(dataset_name="customer-reviews", dataset_project="nlp-sentiment",
                     dataset_version="1.1.0").get_local_copy()
```

The `clearml-data` CLI does the same from a shell (`create`, `add`, `sync`, `upload`, `close`, `get`, `list`). Use `get_mutable_local_copy(target_folder=...)` when the code needs to write into the folder.

### 5. Run tasks on remote machines

On the worker, install the agent with the system Python (not inside a virtual environment, because the agent creates one per task), configure it and attach it to a queue:

```bash
pip install clearml-agent
clearml-agent init
clearml-agent daemon --queue gpu-queue --create-queue --gpus 0 --detached     # virtualenv per task
clearml-agent daemon --queue gpu-queue --gpus all --docker nvidia/cuda:12.4.1-runtime-ubuntu22.04 --detached
clearml-agent daemon --queue gpu-queue --stop                                 # stop the matching agent
```

Then send work to the queue, either from inside the script or from a shell:

```python
task = Task.init(project_name="wine-quality", task_name="random-forest-large")
task.execute_remotely(queue_name="gpu-queue")   # local process exits here; the agent reruns the script from the top
```

```bash
clearml-task --project wine-quality --name random-forest-large --folder . --script train.py \
  --skip-task-init --args n_estimators=800 max_depth=12 --queue gpu-queue
```

The agent clones the repository at the recorded commit, applies the uncommitted diff and installs the recorded packages. `--skip-task-init` tells `clearml-task` that the script already calls `Task.init()`. `execute_remotely()` does nothing when the script is already running under an agent. A finished task can also be cloned in the UI, edited and enqueued again.

### 6. Build a pipeline

```python
# pipeline.py
from clearml import PipelineController, Task


def load_data(test_size: float):
    from sklearn.datasets import load_wine
    from sklearn.model_selection import train_test_split
    X, y = load_wine(return_X_y=True)
    return train_test_split(X, y, test_size=test_size, random_state=42)


def train(split, n_estimators: int):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import accuracy_score
    X_train, X_test, y_train, y_test = split
    model = RandomForestClassifier(n_estimators=n_estimators, random_state=42).fit(X_train, y_train)
    return model, accuracy_score(y_test, model.predict(X_test))


def good_enough(pipeline, node, param_override):   # False skips this step and the steps that depend on it
    train_task = Task.get_task(task_id=pipeline.get_pipeline_dag()["train"].executed)
    accuracy = train_task.artifacts["accuracy"].get()
    return accuracy >= 0.9


pipe = PipelineController(name="wine-training", project="wine-quality", version="1.0.0")
pipe.set_default_execution_queue("cpu-queue")
pipe.add_parameter(name="n_estimators", default=200, description="Trees in the forest")

pipe.add_function_step(name="load_data", function=load_data,
                       function_kwargs={"test_size": 0.25}, function_return=["split"],
                       cache_executed_step=True)
pipe.add_function_step(name="train", function=train,
                       function_kwargs={"split": "${load_data.split}", "n_estimators": "${pipeline.n_estimators}"},
                       function_return=["model", "accuracy"])
pipe.add_step(name="register", parents=["train"],
              base_task_project="wine-quality", base_task_name="register-model",
              parameter_override={"General/model_url": "${train.artifacts.model.url}",
                                  "General/source_task": "${train.id}"},
              pre_execute_callback=good_enough)

pipe.start(queue="services")      # controller runs on the "services" queue, steps on cpu-queue
```

Each function becomes its own task, so its imports go inside the function and its return values are stored as artifacts named by `function_return`. `add_step()` clones an existing task (`register-model` must already have run once). References: `${step.id}`, `${step.artifacts.NAME.url}`, `${step.parameters.Args/NAME}`, `${step.RETURN_NAME}` for function steps, `${pipeline.NAME}` for pipeline parameters.

### 7. Optimize hyperparameters

```python
# hpo.py — needs: pip install optuna
from clearml import Task
from clearml.automation import HyperParameterOptimizer, UniformIntegerParameterRange, DiscreteParameterRange
from clearml.automation.optuna import OptimizerOptuna

Task.init(project_name="wine-quality", task_name="rf-hpo", task_type=Task.TaskTypes.optimizer,
          reuse_last_task_id=False)
base = Task.get_task(project_name="wine-quality", task_name="random-forest-baseline")

optimizer = HyperParameterOptimizer(
    base_task_id=base.id,
    hyper_parameters=[
        UniformIntegerParameterRange("Args/n_estimators", min_value=100, max_value=800, step_size=100),
        DiscreteParameterRange("Args/max_depth", values=[4, 6, 8, 12]),
    ],
    objective_metric_title="eval",
    objective_metric_series="f1",
    objective_metric_sign="max",
    optimizer_class=OptimizerOptuna,
    execution_queue="cpu-queue",
    max_number_of_concurrent_tasks=4,
    total_max_jobs=30,
)
optimizer.start(); optimizer.wait()
best = optimizer.get_top_experiments(top_k=1)[0]
print(best.id, best.get_last_scalar_metrics()["eval"]["f1"]["last"], best.get_parameters())
optimizer.stop()
```

Parameter names carry their section (`Args/` for argparse, `General/` for `task.connect()`). `optimizer_class` is a class, not a string: `OptimizerOptuna`, `OptimizerBOHB` from `clearml.automation.hpbandster` (needs `hpbandster`), or the built-in `RandomSearch` and `GridSearch`.

## Examples

### Example 1: Add tracking to an existing script and try it without a server

**User request:**

```
Add ClearML to my scikit-learn training script. I don't have a server yet, I just want to see that it captures things.
```

The agent adds the `Task.init()`, `task.connect()` and `report_scalar()` lines shown in section 2 and runs the script in offline mode:

```bash
pip install clearml scikit-learn
CLEARML_OFFLINE_MODE=1 python train.py --max-depth 4
```

```
ClearML Task: created new task id=offline-d652b83b3fbe44cd9e2e586bbf91904c
ClearML Task: Offline session stored in /home/priya/.clearml/cache/offline/offline-d652b83b3fbe44cd9e2e586bbf91904c.zip
```

The session folder holds `task.json` (arguments under `Args`, the connected dictionary under `General`), `metrics.jsonl` with the `eval/accuracy` and `eval/f1` points, and the uploaded artifact. Once the user has credentials, `clearml-task --import-offline-session` with that zip publishes the run.

### Example 2: Move training to the team's GPU machine

**User request:**

```
train.py works on my laptop. Run it on gpu-box-01 with 800 trees and keep everything in ClearML.
```

On `gpu-box-01` the agent installs and starts a worker; on the laptop it enqueues the script:

```bash
# on gpu-box-01
pip install clearml-agent && clearml-agent init
clearml-agent daemon --queue gpu-queue --create-queue --gpus 0 --detached

# on the laptop, in the project's git repository
clearml-task --project wine-quality --name random-forest-800 --folder . --script train.py \
  --skip-task-init --args n_estimators=800 --queue gpu-queue
```

`clearml-task` prints `New task created id=...` and the URL of the execution log. The task appears in the `gpu-queue` queue, the worker picks it up, recreates the environment and runs it; console output, scalars and the model show up in the web UI while it runs. Changes that are not pushed to the remote repository reach the worker only as the recorded uncommitted diff, so new untracked files must be added to git first.

## Guidelines

1. **Call `Task.init()` at the top of the script, before training starts** — automatic logging hooks the frameworks from that point on; a task created at the end captures nothing.
2. **Never put credentials in code** — use `clearml.conf` or the `CLEARML_API_ACCESS_KEY` / `CLEARML_API_SECRET_KEY` variables from a secret store.
3. **A self-hosted server starts with open access** — enable web login and change the default secrets before exposing it; its bundled agent-services container runs privileged with the Docker socket mounted, so keep the server on a trusted network. One queue per hardware class (`cpu-queue`, `gpu-queue`) keeps jobs off the wrong machines.
4. **Remote runs need reproducible code** — the agent rebuilds the task from the git remote plus the recorded diff; large data belongs in a ClearML Dataset or object storage, not in the repository.
5. **Finalize datasets** — a dataset that is not finalized cannot be used as a parent or fetched with `get_local_copy()`, and a finalized one cannot be changed: create a child version instead.
6. **Use `task.connect()` for anything worth tuning** — only connected parameters and argparse arguments can be overridden by pipelines, HPO and UI clones.
7. **Pipelines and HPO need running agents** — the controller only enqueues tasks; with no agent on the target queue they stay pending. Use `start_locally(run_pipeline_steps_locally=True)` to debug on one machine.
8. **Pin image tags for production servers** — the compose file uses `clearml/server:latest`; back up `/opt/clearml/data` and `/opt/clearml/config` with the server stopped before upgrading.
