---
name: label-studio
description: |
  Open-source data labeling and annotation platform for ML projects. Supports text, image,
  audio, video, and time-series data. Features configurable labeling interfaces, ML-assisted
  labeling, team collaboration, and API integration for automated workflows. Use when the user
  asks to "label data", "annotate images or text", "set up Label Studio", "export annotations
  for training", or "pre-label with a model".
license: Apache-2.0
compatibility: 'Python 3.10+ for pip install (label-studio 1.23), or Docker. Linux, macOS, Windows.'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags:
    - data-labeling
    - annotation
    - ml-workflows
    - active-learning
    - data-quality
  repository: "https://github.com/HumanSignal/label-studio"
---

# Label Studio

## Overview

Label Studio (HumanSignal, Apache-2.0) is a web app for labeling data and exporting the result as training data. A project has a labeling config (an XML template that defines the annotation UI), tasks (the data items), annotations (human labels) and optionally predictions (model suggestions used for pre-labeling). You can drive it from the browser, the REST API or the Python SDK (`label-studio-sdk` 2.x). Versions checked: label-studio 1.23.2 and label-studio-sdk 2.1.2 (September 2026). The open-source edition has no role-based access control or review workflows; those are in the paid Enterprise and Cloud editions.

## Instructions

### 1. Install and start

```bash
python -m venv .venv && source .venv/bin/activate
pip install label-studio            # needs Python 3.10+
label-studio start --port 8080      # opens http://localhost:8080; create the first account there
```

Headless start with a ready account (useful in scripts): `label-studio start -b --internal-host 127.0.0.1 -p 8080 --username maria@northwind.dev --password "$LS_PASSWORD"`. Data (SQLite database, uploads) is stored in the data directory printed at startup; set `LABEL_STUDIO_BASE_DATA_DIR` to choose it. Use `--internal-host 127.0.0.1` unless you really want other machines to reach it.

### 2. Docker with PostgreSQL

```yaml
# docker-compose.yml
services:
  label-studio:
    image: heartexlabs/label-studio:1.23.2      # pin a version instead of :latest
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      DJANGO_DB: default
      POSTGRE_NAME: labelstudio
      POSTGRE_USER: labelstudio
      POSTGRE_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRE_HOST: db
      POSTGRE_PORT: 5432
      LABEL_STUDIO_HOST: https://labels.northwind.dev    # public URL, if behind a proxy
    volumes:
      - ./ls-data:/label-studio/data
    depends_on:
      - db
  db:
    image: postgres:17
    environment:
      POSTGRES_DB: labelstudio
      POSTGRES_USER: labelstudio
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pg-data:/var/lib/postgresql/data
volumes:
  pg-data:
```

Put `POSTGRES_PASSWORD` in an untracked `.env` file. The repository's own `docker-compose.yml` adds an nginx front end and runs the app with `label-studio-uwsgi`; use it for larger production setups. Environment variables can be written with or without the `LABEL_STUDIO_` prefix. Local-file serving is off by default (`LABEL_STUDIO_LOCAL_FILES_SERVING_ENABLED=true` and `LABEL_STUDIO_LOCAL_FILES_DOCUMENT_ROOT=/label-studio/files` enable it), and only for files you really need.

### 3. Labeling configs

```xml
<!-- text classification -->
<View>
  <Header value="Classify the sentiment of this review:"/>
  <Text name="text" value="$text"/>
  <Choices name="sentiment" toName="text" choice="single" showInline="true">
    <Choice value="Positive"/>
    <Choice value="Negative"/>
    <Choice value="Neutral"/>
  </Choices>
</View>
```

```xml
<!-- named entity recognition -->
<View>
  <Labels name="label" toName="text">
    <Label value="Person" background="#d9480f"/>
    <Label value="Organization" background="#1c7ed6"/>
    <Label value="Location" background="#2f9e44"/>
  </Labels>
  <Text name="text" value="$text"/>
</View>
```

```xml
<!-- bounding boxes -->
<View>
  <Image name="image" value="$image"/>
  <RectangleLabels name="label" toName="image">
    <Label value="Car"/><Label value="Person"/><Label value="Bicycle"/>
  </RectangleLabels>
</View>
```

`$text` and `$image` refer to keys in each task's `data`. `toName` must match the `name` of the data tag, and the control `name` (`sentiment`, `label`) is what appears as `from_name` in results.

### 4. Authentication for the API

Current releases disable the old `Authorization: Token ...` header by default (the server answers 401 "legacy token authentication has been disabled"). Use a Personal Access Token: create it under Account & Settings, then give it to the SDK as `api_key`. For plain HTTP, exchange it for a short-lived access token:

```bash
ACCESS=$(curl -s -X POST http://localhost:8080/api/token/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh\": \"$LABEL_STUDIO_API_KEY\"}" | python -c "import sys,json; print(json.load(sys.stdin)['access'])")
curl -s http://localhost:8080/api/projects -H "Authorization: Bearer $ACCESS"
```

Access tokens expire after a few minutes, so refresh again when you get a 401. An admin can re-enable legacy tokens (`--enable-legacy-api-token` or `LABEL_STUDIO_ENABLE_LEGACY_API_TOKEN=true`) for old scripts.

### 5. Python SDK 2.x

The old `from label_studio_sdk import Client` / `ls.start_project` API belongs to SDK 1.x. In 2.x:

```python
import os
from label_studio_sdk.client import LabelStudio

ls = LabelStudio(base_url="http://localhost:8080", api_key=os.environ["LABEL_STUDIO_API_KEY"])

project = ls.projects.create(title="Customer Reviews", label_config=open("sentiment.xml").read())

ls.projects.import_tasks(
    id=project.id,
    request=[{"text": "Great product!"}, {"text": "Not worth the money."}],
    return_task_ids=True,
)

for task in ls.tasks.list(project=project.id):
    print(task.id, task.is_labeled, task.data)

# Add a model prediction to a task (pre-labeling)
ls.predictions.create(
    task=task.id, model_version="distilbert-v1", score=0.93,
    result=[{"from_name": "sentiment", "to_name": "text", "type": "choices",
             "value": {"choices": ["Positive"]}}],
)
```

### 6. Import and export through REST

```python
import os, requests

LS_URL = "http://localhost:8080"
refresh = os.environ["LABEL_STUDIO_API_KEY"]
access = requests.post(f"{LS_URL}/api/token/refresh", json={"refresh": refresh}).json()["access"]
headers = {"Authorization": f"Bearer {access}"}

requests.post(f"{LS_URL}/api/projects/1/import", headers=headers,
              json=[{"data": {"text": "It's okay, nothing special."}}])

export = requests.get(f"{LS_URL}/api/projects/1/export",
                      params={"exportType": "JSON"}, headers=headers).json()
for task in export:
    for ann in task["annotations"]:
        print(task["data"]["text"][:50], "->", ann["result"][0]["value"]["choices"][0])
```

Import accepts either `{"data": {...}}` objects or bare dicts. Pass `download_all_tasks=true` to include unlabeled tasks. Other export types (`CSV`, `COCO`, `YOLO`, `CONLL2003`, ...) are listed by `GET /api/projects/1/export/formats`; with the SDK use `ls.projects.exports`.

### 7. ML backend for pre-labeling

The ML backend is a separate package and web server (repo `HumanSignal/label-studio-ml-backend`). The `label-studio-ml` release on PyPI is from 2023, so install from the repository:

```bash
git clone https://github.com/HumanSignal/label-studio-ml-backend.git
cd label-studio-ml-backend && pip install -e .
label-studio-ml create sentiment_backend     # scaffolds model.py, Dockerfile, docker-compose.yml
```

```python
# sentiment_backend/model.py
from typing import Dict, List, Optional
from label_studio_ml.model import LabelStudioMLBase
from label_studio_ml.response import ModelResponse

class SentimentPredictor(LabelStudioMLBase):
    def setup(self):
        from transformers import pipeline
        self.classifier = pipeline("sentiment-analysis")
        self.set("model_version", "distilbert-0.1")

    def predict(self, tasks: List[Dict], context: Optional[Dict] = None, **kwargs) -> ModelResponse:
        predictions = []
        for task in tasks:
            out = self.classifier(task["data"]["text"])[0]
            predictions.append({
                "model_version": self.get("model_version"),
                "score": out["score"],
                "result": [{"from_name": "sentiment", "to_name": "text", "type": "choices",
                            "value": {"choices": [out["label"].capitalize()]}}],
            })
        return ModelResponse(predictions=predictions)
```

Run it with `label-studio-ml start sentiment_backend -p 9090` (or `docker-compose up` in the folder), then add `http://localhost:9090` in the project's model / ML backend settings. Set `LABEL_STUDIO_URL` and `LABEL_STUDIO_API_KEY` in the backend's environment if the model must download uploaded media. The repository also contains ready examples (spaCy, YOLO, SAM 2, Hugging Face NER, OCR, LLM-based labelers).

## Examples

### Example 1: Label customer reviews and export for fine-tuning

**User request:** "Set up Label Studio locally, label 200 product reviews as positive, negative or neutral, and give me a JSON file for training."

```bash
pip install label-studio
label-studio start -b --internal-host 127.0.0.1 -p 8080 --username maria@northwind.dev --password "$LS_PASSWORD"
```

Create a Personal Access Token in the UI, save it as `LABEL_STUDIO_API_KEY`, then run the SDK script from section 5 with `reviews.csv` converted to `[{"text": ...}]` tasks. After labeling in the browser, run the export script from section 6 and write the result to `labeled_reviews.json`. Result: one JSON object per labeled task with `data.text` and `annotations[0].result[0].value.choices`. The export contains only annotated tasks unless you add `download_all_tasks=true`.

### Example 2: Pre-label with a model, then correct

**User request:** "I have 5,000 unlabeled support tickets. Let a model suggest sentiment and have people fix it."

Start the backend from section 7, connect it to the project, and use the project's Data Manager action to retrieve predictions for the selected tasks. Annotators see the suggestion pre-filled, confirm or change it, and each correction is sent to your `fit()` method if you implemented one. Result: labeling time per task drops because most predictions are accepted; sort the Data Manager by prediction score to review low-confidence ones first.

## Guidelines

- Prefer Personal Access Tokens over legacy tokens, and keep them in environment variables, never in source or the labeling config.
- Control names in the config (`name`, `toName`) must match the `from_name` and `to_name` in imported predictions and annotations, or results silently do not render.
- Pin the image tag or package version and back up the data directory or database before upgrading; migrations are one-way.
- SQLite is fine for a single user or a small team. For many annotators or large projects use PostgreSQL and a reverse proxy with TLS.
- Never expose an instance with open sign-up to the internet: set `LABEL_STUDIO_DISABLE_SIGNUP_WITHOUT_LINK=true` or put it behind SSO or a VPN. Enable local file serving only for a dedicated directory, never for `/`.
- Write labeling instructions in the project settings and measure annotator agreement before trusting a single labeler.
- Import tasks in batches of a few thousand and use cloud storage connections (S3, GCS, Azure) for large media instead of uploading through the browser.
