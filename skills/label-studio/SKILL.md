---
name: label-studio
description: |
  Open-source data labeling and annotation platform for ML projects. Supports text, image,
  audio, video, and time-series data. Features configurable labeling interfaces, ML-assisted
  labeling, team collaboration, and API integration for automated workflows.
license: Apache-2.0
compatibility:
  - python 3.8+
  - label-studio 1.10+
  - Linux/macOS/Windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-ml
  tags:
    - data-labeling
    - annotation
    - ml-workflows
    - active-learning
    - data-quality
---

# Label Studio

## Installation

```bash
# Install Label Studio
pip install label-studio

# Start the server
label-studio start --port 8080
# Visit http://localhost:8080 to create account and first project
```

## Docker Deployment

```yaml
# docker-compose.yml — Production Label Studio with PostgreSQL
version: "3.9"
services:
  label-studio:
    image: heartexlabs/label-studio:latest
    ports:
      - "8080:8080"
    environment:
      DJANGO_DB: default
      POSTGRE_NAME: labelstudio
      POSTGRE_USER: labelstudio
      POSTGRE_PASSWORD: labelstudio
      POSTGRE_HOST: db
      POSTGRE_PORT: 5432
      LABEL_STUDIO_LOCAL_FILES_SERVING_ENABLED: "true"
      LABEL_STUDIO_LOCAL_FILES_DOCUMENT_ROOT: /label-studio/files
    volumes:
      - ls-data:/label-studio/data
      - ./files:/label-studio/files
    depends_on:
      - db
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: labelstudio
      POSTGRES_USER: labelstudio
      POSTGRES_PASSWORD: labelstudio
    volumes:
      - pg-data:/var/lib/postgresql/data
volumes:
  ls-data:
  pg-data:
```

## Labeling Configuration (XML Templates)

```xml
<!-- text_classification.xml — Sentiment classification labeling interface -->
<View>
  <Header value="Classify the sentiment of this text:"/>
  <Text name="text" value="$text"/>
  <Choices name="sentiment" toName="text" choice="single" showInline="true">
    <Choice value="Positive"/>
    <Choice value="Negative"/>
    <Choice value="Neutral"/>
  </Choices>
</View>
```

```xml
<!-- ner_labeling.xml — Named entity recognition labeling interface -->
<View>
  <Labels name="label" toName="text">
    <Label value="Person" background="#FF0000"/>
    <Label value="Organization" background="#00FF00"/>
    <Label value="Location" background="#0000FF"/>
    <Label value="Date" background="#FFA500"/>
  </Labels>
  <Text name="text" value="$text"/>
</View>
```

```xml
<!-- image_bbox.xml — Image object detection with bounding boxes -->
<View>
  <Image name="image" value="$image"/>
  <RectangleLabels name="label" toName="image">
    <Label value="Car" background="#FF0000"/>
    <Label value="Person" background="#00FF00"/>
    <Label value="Bicycle" background="#0000FF"/>
  </RectangleLabels>
</View>
```

## API: Import Tasks

```python
# import_tasks.py — Import labeling tasks via the API
import requests

LS_URL = "http://localhost:8080"
API_KEY = "your-api-key-from-account-settings"
PROJECT_ID = 1

headers = {"Authorization": f"Token {API_KEY}"}

# Import text classification tasks
tasks = [
    {"data": {"text": "This product is amazing! I love it."}},
    {"data": {"text": "Terrible experience, would not recommend."}},
    {"data": {"text": "It's okay, nothing special."}},
]

response = requests.post(
    f"{LS_URL}/api/projects/{PROJECT_ID}/import",
    headers=headers,
    json=tasks,
)
print(f"Imported {response.json()['task_count']} tasks")
```

## API: Export Annotations

```python
# export_annotations.py — Export completed annotations for model training
import requests
import json

LS_URL = "http://localhost:8080"
API_KEY = "your-api-key"
PROJECT_ID = 1

headers = {"Authorization": f"Token {API_KEY}"}

response = requests.get(
    f"{LS_URL}/api/projects/{PROJECT_ID}/export?exportType=JSON",
    headers=headers,
)

annotations = response.json()
for task in annotations:
    text = task["data"]["text"]
    label = task["annotations"][0]["result"][0]["value"]["choices"][0]
    print(f"Text: {text[:50]}... → Label: {label}")

# Save for training
with open("labeled_data.json", "w") as f:
    json.dump(annotations, f, indent=2)
```

## Label Studio SDK

```python
# sdk_usage.py — Use the Python SDK for programmatic access
from label_studio_sdk import Client

ls = Client(url="http://localhost:8080", api_key="your-api-key")

# Create a new project
project = ls.start_project(
    title="Customer Reviews",
    label_config="""
    <View>
      <Text name="text" value="$text"/>
      <Choices name="sentiment" toName="text" choice="single">
        <Choice value="Positive"/>
        <Choice value="Negative"/>
      </Choices>
    </View>
    """,
)

# Import tasks
project.import_tasks([
    {"text": "Great product!"},
    {"text": "Not worth the money."},
])

# Get annotated tasks
labeled = project.get_labeled_tasks()
print(f"Completed annotations: {len(labeled)}")
```

## ML Backend (Pre-labeling)

```python
# ml_backend.py — ML backend for pre-labeling / active learning
from label_studio_ml import LabelStudioMLBase

class SentimentPredictor(LabelStudioMLBase):
    def setup(self):
        from transformers import pipeline
        self.classifier = pipeline("sentiment-analysis")

    def predict(self, tasks, **kwargs):
        predictions = []
        for task in tasks:
            text = task["data"]["text"]
            result = self.classifier(text)[0]
            predictions.append({
                "result": [{
                    "from_name": "sentiment",
                    "to_name": "text",
                    "type": "choices",
                    "value": {"choices": [result["label"].capitalize()]},
                }],
                "score": result["score"],
            })
        return predictions
```

```bash
# Start the ML backend
label-studio-ml start ./ml_backend --port 9090

# Connect it to Label Studio project via Settings > Machine Learning
```

## Key Concepts

- **Labeling configs**: XML templates defining the annotation interface — highly customizable
- **Tasks**: Data items to be labeled, imported via API or UI
- **Annotations**: Human labels on tasks, exportable in multiple formats (JSON, CSV, COCO, etc.)
- **ML backends**: Connect models for pre-labeling and active learning workflows
- **Webhooks**: Get notified when annotations are created or updated
- **Multi-type**: Supports text, images, audio, video, HTML, and time-series in one platform
