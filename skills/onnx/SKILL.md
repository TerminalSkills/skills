---
name: onnx
description: |
  Open Neural Network Exchange format for model interoperability across frameworks. Export
  models from PyTorch, TensorFlow, and other frameworks to ONNX, optimize with ONNX Runtime,
  and deploy for cross-platform inference on CPU, GPU, and edge devices.
license: Apache-2.0
compatibility:
  - python 3.8+
  - onnxruntime 1.16+
  - Linux/macOS/Windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - model-interoperability
    - optimization
    - inference
    - cross-platform
    - edge-deployment
---

# ONNX

## Installation

```bash
# Install ONNX and ONNX Runtime
pip install onnx onnxruntime

# For GPU inference
pip install onnxruntime-gpu

# For model optimization
pip install onnxoptimizer onnxsim
```

## Export PyTorch Model to ONNX

```python
# export_pytorch.py — Convert a PyTorch model to ONNX format
import torch
import torch.nn as nn

class SimpleModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(10, 64)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(64, 3)

    def forward(self, x):
        return self.fc2(self.relu(self.fc1(x)))

model = SimpleModel()
model.eval()

dummy_input = torch.randn(1, 10)

torch.onnx.export(
    model,
    dummy_input,
    "model.onnx",
    export_params=True,
    opset_version=17,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={
        "input": {0: "batch_size"},
        "output": {0: "batch_size"},
    },
)
print("Exported model.onnx")
```

## Export Hugging Face Transformers

```python
# export_transformers.py — Export a Hugging Face model to ONNX using optimum
# pip install optimum[onnxruntime]
from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer

model_name = "distilbert-base-uncased-finetuned-sst-2-english"

# Export and load in one step
model = ORTModelForSequenceClassification.from_pretrained(model_name, export=True)
tokenizer = AutoTokenizer.from_pretrained(model_name)

# Save the ONNX model
model.save_pretrained("./onnx_model")
tokenizer.save_pretrained("./onnx_model")

# Run inference
inputs = tokenizer("This movie was fantastic!", return_tensors="pt")
outputs = model(**inputs)
print(f"Logits: {outputs.logits}")
```

## ONNX Runtime Inference

```python
# inference.py — Run inference with ONNX Runtime for optimized performance
import onnxruntime as ort
import numpy as np

# Create session with optimization
session_options = ort.SessionOptions()
session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
session_options.intra_op_num_threads = 4

# Use CPU or GPU provider
providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
session = ort.InferenceSession("model.onnx", session_options, providers=providers)

# Get input/output details
print(f"Inputs: {[i.name for i in session.get_inputs()]}")
print(f"Outputs: {[o.name for o in session.get_outputs()]}")

# Run inference
input_data = np.random.randn(1, 10).astype(np.float32)
results = session.run(None, {"input": input_data})
print(f"Output shape: {results[0].shape}")
print(f"Predictions: {results[0]}")
```

## Batch Inference

```python
# batch_inference.py — Efficient batch processing with ONNX Runtime
import onnxruntime as ort
import numpy as np
import time

session = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])

# Batch of 1000 samples
batch_data = np.random.randn(1000, 10).astype(np.float32)

start = time.time()
results = session.run(None, {"input": batch_data})
elapsed = time.time() - start

print(f"Processed 1000 samples in {elapsed:.3f}s ({1000/elapsed:.0f} samples/sec)")
```

## Model Optimization

```python
# optimize.py — Optimize an ONNX model for faster inference
import onnx
from onnxruntime.transformers import optimizer

# Basic optimization with ONNX simplifier
# pip install onnxsim
import onnxsim
model = onnx.load("model.onnx")
optimized, check = onnxsim.simplify(model)
onnx.save(optimized, "model_simplified.onnx")
print(f"Simplified: {check}")
```

## Quantization

```python
# quantize.py — Reduce model size and speed up inference with quantization
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    model_input="model.onnx",
    model_output="model_quantized.onnx",
    weight_type=QuantType.QInt8,
)

import os
original = os.path.getsize("model.onnx")
quantized = os.path.getsize("model_quantized.onnx")
print(f"Original: {original/1024:.1f} KB")
print(f"Quantized: {quantized/1024:.1f} KB ({quantized/original*100:.1f}%)")
```

## Validate ONNX Model

```python
# validate.py — Check model validity and inspect structure
import onnx

model = onnx.load("model.onnx")
onnx.checker.check_model(model)
print("Model is valid!")

# Print model info
print(f"IR version: {model.ir_version}")
print(f"Opset: {model.opset_import[0].version}")
print(f"Graph inputs: {[i.name for i in model.graph.input]}")
print(f"Graph outputs: {[o.name for o in model.graph.output]}")
print(f"Nodes: {len(model.graph.node)}")
```

## Edge Deployment (ONNX Runtime Mobile)

```python
# mobile_export.py — Prepare a model for mobile/edge deployment
from onnxruntime.tools import ort_format_model

# Convert to ORT format for mobile
ort_format_model.convert_onnx_models_to_ort(
    "model.onnx",
    output_dir="./mobile_model",
    optimization_level="all",
)
# Use the .ort file with ONNX Runtime Mobile SDK on iOS/Android
```

## Key Concepts

- **ONNX format**: Framework-agnostic model representation — export from PyTorch/TF, run anywhere
- **ONNX Runtime**: High-performance inference engine with CPU, GPU, TensorRT, and DirectML support
- **Dynamic axes**: Allow variable batch sizes and sequence lengths in exported models
- **Quantization**: INT8 quantization reduces model size 2-4x with minimal accuracy loss
- **Execution providers**: Plug in hardware-specific backends (CUDA, TensorRT, OpenVINO, CoreML)
- **Opset versions**: Higher opset = more supported operations; use opset 17+ for modern models
