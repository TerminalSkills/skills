---
name: triton
description: >-
  Serves trained machine-learning models over HTTP and gRPC with NVIDIA Triton Inference Server: one server for ONNX, TensorRT, PyTorch, TensorFlow, OpenVINO and Python models, with dynamic batching, model ensembles, versioning and Prometheus metrics, on GPU or CPU. Use when a user asks to deploy a model for production inference, write a config.pbtxt, batch requests for GPU throughput, chain preprocessing and a model, or call Triton from Python.
license: Apache-2.0
compatibility: "Docker with the NVIDIA Container Toolkit for GPU serving (the server also runs on CPU only), Linux. Images come from NVIDIA NGC (nvcr.io) and are several gigabytes."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags:
    - inference-server
    - model-serving
    - nvidia
    - dynamic-batching
    - model-ensembles
  repository: https://github.com/triton-inference-server/server
---

# NVIDIA Triton Inference Server

## Overview

Triton loads models from a directory called the model repository and serves each of them over HTTP (port 8000), gRPC (8001) and Prometheus metrics (8002), using the KServe v2 inference protocol. Each model is run by a *backend* (`onnxruntime`, `tensorrt`, `pytorch`, `tensorflow`, `openvino`, `python`, `fil`, `vllm` and others), so one server can host models from different frameworks. The server is released together with an NGC container of the same year.month: release 2.73.0 is container `26.09` (checked October 2026). Use the newest container your NVIDIA driver supports; the release notes list the minimum driver for each tag.

## Instructions

### Step 1: Lay out the model repository

```
model_repository/
├── text_classifier/
│   ├── config.pbtxt
│   ├── 1/model.onnx          # version 1
│   └── 2/model.onnx          # version 2 (latest is served by default)
├── image_model/
│   ├── config.pbtxt
│   └── 1/model.plan          # TensorRT engine
├── preprocess/
│   ├── config.pbtxt
│   └── 1/model.py            # Python backend
└── ensemble_pipeline/
    ├── config.pbtxt
    └── 1/                    # empty directory for an ensemble
```

Default file names are fixed per backend: `model.onnx`, `model.plan`, `model.pt` (TorchScript), `model.savedmodel/`, `model.py`. For ONNX, TensorRT and OpenVINO models Triton can generate the minimal configuration (inputs, outputs, `max_batch_size`) itself, so `config.pbtxt` may be left out until you need batching or instance settings. Models of other types, such as TorchScript, need a config file. To see what Triton generated, run `curl localhost:8000/v2/models/text_classifier/config`.

### Step 2: Start the server

```bash
docker run --gpus all --rm -p 8000:8000 -p 8001:8001 -p 8002:8002 \
    -v "$(pwd)/model_repository:/models" \
    nvcr.io/nvidia/tritonserver:26.09-py3 \
    tritonserver --model-repository=/models
```

Drop `--gpus all` to run on CPU only (use `KIND_CPU` in `instance_group`). The log ends with a table of models; each should show `READY`, otherwise the table gives the load error. `curl -s -o /dev/null -w "%{http_code}" localhost:8000/v2/health/ready` returns 200 when the server is ready. With `--model-control-mode=explicit` models load only on request (`--load-model=text_classifier` or the repository API).

### Step 3: Write `config.pbtxt`

```protobuf
# model_repository/text_classifier/config.pbtxt
name: "text_classifier"
backend: "onnxruntime"          # older configs use: platform: "onnxruntime_onnx"
max_batch_size: 64

input [
  { name: "input_ids"      data_type: TYPE_INT64 dims: [ 128 ] },
  { name: "attention_mask" data_type: TYPE_INT64 dims: [ 128 ] }
]
output [
  { name: "logits" data_type: TYPE_FP32 dims: [ 2 ] }
]

dynamic_batching {
  max_queue_delay_microseconds: 100
}

instance_group [
  { count: 2 kind: KIND_GPU gpus: [ 0 ] }
]
```

With `max_batch_size` above 0, the batch dimension is implicit: `dims` describes one sample and requests carry shape `[batch, 128]`. Dynamic batching merges concurrent requests up to that size; the queue delay is how long Triton waits to fill a batch. NVIDIA advises leaving out `preferred_batch_size` for most models, except TensorRT models with several optimization profiles. `instance_group` runs two copies of the model on GPU 0 so requests overlap. Measure with Perf Analyzer (in the `-py3-sdk` container) before tuning.

### Step 4: Call the server

```python
# http_client.py — plain HTTP, no Triton library needed
import numpy as np
import requests

TRITON_URL = "http://localhost:8000"
assert requests.get(f"{TRITON_URL}/v2/health/ready").status_code == 200

ids = np.random.randint(0, 30000, (1, 128))
payload = {"inputs": [
    {"name": "input_ids", "shape": [1, 128], "datatype": "INT64", "data": ids.flatten().tolist()},
    {"name": "attention_mask", "shape": [1, 128], "datatype": "INT64", "data": [1] * 128},
]}
reply = requests.post(f"{TRITON_URL}/v2/models/text_classifier/infer", json=payload, timeout=30)
reply.raise_for_status()
print(reply.json()["outputs"][0]["data"])      # two logits for the one sample
```

```python
# grpc_client.py — pip install "tritonclient[grpc]"
import numpy as np
import tritonclient.grpc as grpcclient

client = grpcclient.InferenceServerClient(url="localhost:8001")
assert client.is_model_ready("text_classifier")

input_ids = np.random.randint(0, 30000, (4, 128)).astype(np.int64)    # batch of 4
attention_mask = np.ones((4, 128), dtype=np.int64)
inputs = [grpcclient.InferInput("input_ids", input_ids.shape, "INT64"),
          grpcclient.InferInput("attention_mask", attention_mask.shape, "INT64")]
inputs[0].set_data_from_numpy(input_ids)
inputs[1].set_data_from_numpy(attention_mask)

result = client.infer("text_classifier", inputs, outputs=[grpcclient.InferRequestedOutput("logits")])
print(result.as_numpy("logits").shape)         # (4, 2)
```

The `tritonclient` version follows the server release (2.73.0 today). Extras are `http`, `grpc`, `cuda`, `perf-analyzer` and `all`.

### Step 5: Python backend and ensembles

A Python model is a class named `TritonPythonModel` in `1/model.py`, with a config that sets `backend: "python"`:

```protobuf
# model_repository/preprocess/config.pbtxt
name: "preprocess"
backend: "python"
max_batch_size: 64
input  [ { name: "raw_text"       data_type: TYPE_STRING dims: [ 1 ] } ]
output [ { name: "input_ids"      data_type: TYPE_INT64  dims: [ 128 ] },
         { name: "attention_mask" data_type: TYPE_INT64  dims: [ 128 ] } ]
```

```python
# model_repository/preprocess/1/model.py
import numpy as np
import triton_python_backend_utils as pb_utils

class TritonPythonModel:
    def execute(self, requests):
        responses = []
        for request in requests:
            texts = pb_utils.get_input_tensor_by_name(request, "raw_text").as_numpy()  # shape (batch, 1), bytes
            ids = np.zeros((len(texts), 128), dtype=np.int64)
            mask = np.zeros((len(texts), 128), dtype=np.int64)
            for row, item in enumerate(texts):
                tokens = [ord(c) for c in item[0].decode("utf-8")[:128]]   # stand-in for a real tokenizer
                ids[row, :len(tokens)] = tokens
                mask[row, :len(tokens)] = 1
            responses.append(pb_utils.InferenceResponse(output_tensors=[
                pb_utils.Tensor("input_ids", ids), pb_utils.Tensor("attention_mask", mask)]))
        return responses     # one response per request, in order
```

An ensemble wires the steps together without client round trips; the keys in `input_map` and `output_map` are each model's own tensor names, the values are names inside the pipeline:

```protobuf
# model_repository/ensemble_pipeline/config.pbtxt
name: "ensemble_pipeline"
platform: "ensemble"
max_batch_size: 64
input  [ { name: "raw_text" data_type: TYPE_STRING dims: [ 1 ] } ]
output [ { name: "logits"   data_type: TYPE_FP32   dims: [ 2 ] } ]
ensemble_scheduling {
  step [
    { model_name: "preprocess" model_version: -1
      input_map  { key: "raw_text"       value: "raw_text" }
      output_map { key: "input_ids"      value: "ids" }
      output_map { key: "attention_mask" value: "mask" } },
    { model_name: "text_classifier" model_version: -1
      input_map  { key: "input_ids"      value: "ids" }
      input_map  { key: "attention_mask" value: "mask" }
      output_map { key: "logits"         value: "logits" } }
  ]
}
```

`model_version: -1` means the latest version. For branching or loops, use Business Logic Scripting in the Python backend instead of an ensemble.

## Examples

### Example 1: Serve an exported ONNX model on a single GPU

Request: "I exported sentiment.onnx from PyTorch; serve it so the app can POST to it."

```bash
mkdir -p model_repository/sentiment/1 && cp sentiment.onnx model_repository/sentiment/1/model.onnx
docker run --gpus all --rm -p 8000:8000 -v "$(pwd)/model_repository:/models" \
    nvcr.io/nvidia/tritonserver:26.09-py3 tritonserver --model-repository=/models
curl -s localhost:8000/v2/models/sentiment/config      # the configuration Triton generated
```

With no `config.pbtxt`, the startup log lists `sentiment | 1 | READY`, and the config endpoint shows the inputs, outputs and batch size taken from the file. Copy those into a `config.pbtxt` and add `dynamic_batching { }` once you need batching.

### Example 2: A model that will not load

Request: "Triton says my model is UNAVAILABLE."

Read the status table at startup; the reason is printed in the last column, for example a name mismatch such as `unexpected inference input 'ids', allowed inputs are: input_ids, attention_mask`. Fix `name` and `dims` in `config.pbtxt` to match the model (`curl localhost:8000/v2/models/<name>/config` shows the generated values for ONNX), then restart or reload with the model-control API. A wrong file name inside the version directory (for example `model.onnx` expected, `classifier.onnx` found) gives a similar failure.

## Guidelines

- Pin the container tag; do not use `latest`. A GPU image needs a recent enough NVIDIA driver, and the SDK container (`-py3-sdk`) matches the server release.
- Never expose ports 8000 to 8002 to the internet. Triton has no authentication by default; put it behind a gateway, and keep the model-control and repository endpoints private.
- `dims` never includes the batch dimension when `max_batch_size` is above 0; with `max_batch_size: 0` it must include it.
- Do not guess dynamic-batching numbers: benchmark with Perf Analyzer, and raise `max_queue_delay_microseconds` only if latency targets allow it.
- Triton metrics may not work when another DCGM agent runs on the same host; the release notes list this known issue.
- Container memory growth after unloading models is often allocator behavior; `LD_PRELOAD` with tcmalloc or jemalloc (both shipped in the image) is the documented mitigation.
- For serving a single large language model, a dedicated engine (vLLM, TensorRT-LLM; Triton has backends for both) may be simpler than a generic repository.
