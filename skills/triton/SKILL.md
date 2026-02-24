---
name: triton
description: |
  NVIDIA Triton Inference Server for deploying AI models at scale. Supports multiple
  frameworks (ONNX, TensorRT, PyTorch, TensorFlow), model ensembles, dynamic batching,
  model versioning, and GPU/CPU inference with high throughput and low latency.
license: Apache-2.0
compatibility:
  - NVIDIA GPU (recommended)
  - Docker/Kubernetes
  - Linux
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-ml
  tags:
    - inference-server
    - model-serving
    - nvidia
    - dynamic-batching
    - model-ensembles
---

# NVIDIA Triton Inference Server

## Quick Start with Docker

```bash
# start_triton.sh — Launch Triton Inference Server with a model repository
# Create model repository structure
mkdir -p model_repository/my_model/1

# Start Triton
docker run --gpus all --rm -p 8000:8000 -p 8001:8001 -p 8002:8002 \
    -v $(pwd)/model_repository:/models \
    nvcr.io/nvidia/tritonserver:24.01-py3 \
    tritonserver --model-repository=/models

# Ports: 8000=HTTP, 8001=gRPC, 8002=metrics
```

## Model Repository Structure

```
# Model repository layout — each model has a config and numbered version directories
model_repository/
├── text_classifier/
│   ├── config.pbtxt
│   ├── 1/
│   │   └── model.onnx
│   └── 2/
│       └── model.onnx
├── image_model/
│   ├── config.pbtxt
│   └── 1/
│       └── model.plan      # TensorRT engine
└── ensemble_pipeline/
    ├── config.pbtxt
    └── 1/                   # Empty for ensembles
```

## Model Configuration

```protobuf
# config.pbtxt — Configuration for an ONNX text classification model
name: "text_classifier"
platform: "onnxruntime_onnx"
max_batch_size: 64

input [
  {
    name: "input_ids"
    data_type: TYPE_INT64
    dims: [ 128 ]
  },
  {
    name: "attention_mask"
    data_type: TYPE_INT64
    dims: [ 128 ]
  }
]

output [
  {
    name: "logits"
    data_type: TYPE_FP32
    dims: [ 2 ]
  }
]

dynamic_batching {
  preferred_batch_size: [ 8, 16, 32 ]
  max_queue_delay_microseconds: 100
}

instance_group [
  {
    count: 2
    kind: KIND_GPU
    gpus: [ 0 ]
  }
]
```

## HTTP Client

```python
# http_client.py — Send inference requests via HTTP
import requests
import numpy as np

TRITON_URL = "http://localhost:8000"

# Check server health
health = requests.get(f"{TRITON_URL}/v2/health/ready")
print(f"Server ready: {health.status_code == 200}")

# Send inference request
input_ids = np.random.randint(0, 1000, (1, 128)).tolist()
attention_mask = np.ones((1, 128)).astype(int).tolist()

payload = {
    "inputs": [
        {"name": "input_ids", "shape": [1, 128], "datatype": "INT64", "data": input_ids},
        {"name": "attention_mask", "shape": [1, 128], "datatype": "INT64", "data": attention_mask},
    ],
}

response = requests.post(
    f"{TRITON_URL}/v2/models/text_classifier/infer",
    json=payload,
)
result = response.json()
print(f"Output: {result['outputs'][0]['data']}")
```

## Triton Python Client (tritonclient)

```python
# grpc_client.py — High-performance gRPC client for Triton
# pip install tritonclient[all]
import tritonclient.grpc as grpcclient
import numpy as np

client = grpcclient.InferenceServerClient(url="localhost:8001")

# Check model status
print(f"Server live: {client.is_server_live()}")
print(f"Model ready: {client.is_model_ready('text_classifier')}")

# Prepare inputs
input_ids = np.random.randint(0, 1000, (4, 128)).astype(np.int64)  # Batch of 4
attention_mask = np.ones((4, 128), dtype=np.int64)

inputs = [
    grpcclient.InferInput("input_ids", input_ids.shape, "INT64"),
    grpcclient.InferInput("attention_mask", attention_mask.shape, "INT64"),
]
inputs[0].set_data_from_numpy(input_ids)
inputs[1].set_data_from_numpy(attention_mask)

outputs = [grpcclient.InferRequestedOutput("logits")]

result = client.infer("text_classifier", inputs, outputs=outputs)
logits = result.as_numpy("logits")
print(f"Batch output shape: {logits.shape}")
```

## Python Backend (Custom Logic)

```python
# model_repository/preprocess/1/model.py — Custom preprocessing with Python backend
import triton_python_backend_utils as pb_utils
import numpy as np
import json

class TritonPythonModel:
    def initialize(self, args):
        self.model_config = json.loads(args["model_config"])

    def execute(self, requests):
        responses = []
        for request in requests:
            raw_text = pb_utils.get_input_tensor_by_name(request, "raw_text")
            text = raw_text.as_numpy()[0].decode("utf-8")

            # Tokenize (simplified)
            tokens = [ord(c) for c in text[:128]]
            tokens += [0] * (128 - len(tokens))

            input_ids = np.array([tokens], dtype=np.int64)
            output_tensor = pb_utils.Tensor("input_ids", input_ids)
            responses.append(pb_utils.InferenceResponse([output_tensor]))

        return responses
```

## Model Ensemble

```protobuf
# config.pbtxt — Ensemble pipeline combining preprocessing and inference
name: "ensemble_pipeline"
platform: "ensemble"
max_batch_size: 64

input [ { name: "raw_text" data_type: TYPE_STRING dims: [ 1 ] } ]
output [ { name: "logits" data_type: TYPE_FP32 dims: [ 2 ] } ]

ensemble_scheduling {
  step [
    {
      model_name: "preprocess"
      model_version: -1
      input_map { key: "raw_text" value: "raw_text" }
      output_map { key: "input_ids" value: "preprocessed_ids" }
    },
    {
      model_name: "text_classifier"
      model_version: -1
      input_map { key: "input_ids" value: "preprocessed_ids" }
      output_map { key: "logits" value: "logits" }
    }
  ]
}
```

## Key Concepts

- **Model repository**: Directory structure defines available models and versions
- **Dynamic batching**: Automatically combines requests into batches for GPU efficiency
- **Multi-framework**: Serve ONNX, TensorRT, PyTorch, TensorFlow, and Python models together
- **Ensembles**: Chain models into pipelines (preprocess → infer → postprocess)
- **Model versioning**: Deploy multiple versions simultaneously; route traffic between them
- **Instance groups**: Control GPU/CPU placement and number of model instances
- **Metrics**: Prometheus metrics at port 8002 for monitoring latency and throughput
