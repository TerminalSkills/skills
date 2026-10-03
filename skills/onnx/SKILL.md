---
name: onnx
description: |
  Open Neural Network Exchange (ONNX) is a framework-neutral file format for machine-learning models, and ONNX Runtime is the engine that runs them on CPU, GPU and edge devices. Use when exporting a PyTorch or Hugging Face model to ONNX, running inference with onnxruntime, simplifying or quantizing a model, validating a .onnx file, or preparing a model for mobile.
license: Apache-2.0
compatibility: 'Python 3.10+, onnx 1.2x, onnxruntime 1.2x, Linux/macOS/Windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/onnx/onnx
  tags:
    - model-interoperability
    - optimization
    - inference
    - cross-platform
    - edge-deployment
---

# ONNX

## Overview

ONNX ([onnx/onnx](https://github.com/onnx/onnx)) defines the model format and operator sets; ONNX Runtime ([microsoft/onnxruntime](https://github.com/microsoft/onnxruntime)) executes it through pluggable execution providers (CPU, CUDA, TensorRT, OpenVINO, CoreML, DirectML, QNN). Checked against onnx 1.23.1 and onnxruntime 1.30.0 (October 2026); the runtime-side snippets below were run on those versions.

## Instructions

### Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install onnx onnxruntime numpy        # CPU runtime
pip install onnxsim onnxoptimizer         # optional graph simplifiers
```

For NVIDIA GPUs install `onnxruntime-gpu` instead of `onnxruntime`. The two packages must never be installed together. `onnxruntime-directml` (Windows) and `onnxruntime-qnn` are other variants. The default GPU wheel targets CUDA 12.x with a separately installed cuDNN.

### Export from PyTorch

Since PyTorch 2.9 `torch.onnx.export` uses the dynamo exporter by default (`dynamo=True`), which needs `pip install onnxscript` and takes `dynamic_shapes` (not `dynamic_axes`) for variable sizes. `dynamic_axes` still works with the legacy exporter (`dynamo=False`).

```python
# export_pytorch.py
import torch, torch.nn as nn

model = nn.Sequential(nn.Linear(10, 64), nn.ReLU(), nn.Linear(64, 3)).eval()
dummy = torch.randn(2, 10)
batch = torch.export.Dim("batch_size", min=1, max=4096)

torch.onnx.export(
    model, (dummy,), "churn_model.onnx",
    input_names=["input"], output_names=["output"],
    dynamic_shapes={"input": {0: batch}},
    opset_version=18,
)
```

Legacy path: `torch.onnx.export(model, dummy, "churn_model.onnx", dynamo=False, opset_version=17, dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}})`. Large models are written with external data (`.onnx.data`) next to the file; keep both together.

### Export Hugging Face models

```bash
pip install "optimum[onnx]"
optimum-cli export onnx --model distilbert-base-uncased-finetuned-sst-2-english sst2_onnx/
```

Or from Python, `ORTModelForSequenceClassification.from_pretrained(name, export=True)` from `optimum.onnxruntime` exports and loads in one step, then `save_pretrained("sst2_onnx")`. Text generation tasks use the `-with-past` variant (key/value cache) by default.

### Run inference

```python
# inference.py
import numpy as np, onnxruntime as ort

opts = ort.SessionOptions()
opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
wanted = ["CUDAExecutionProvider", "CPUExecutionProvider"]
providers = [p for p in wanted if p in ort.get_available_providers()]
session = ort.InferenceSession("churn_model.onnx", opts, providers=providers)

print([i.name for i in session.get_inputs()], [o.name for o in session.get_outputs()])
batch = np.random.randn(1000, 10).astype(np.float32)   # dtype must match the model input
logits = session.run(None, {"input": batch})[0]
print(logits.shape)                                      # (1000, 3)
```

Filtering by `get_available_providers()` avoids warnings when the CUDA provider is not installed. Providers are tried in order.

### Simplify and validate

```python
import onnx, onnxsim
model = onnx.load("churn_model.onnx")
onnx.checker.check_model(model)                   # raises on an invalid graph
print(model.ir_version, model.opset_import[0].version, len(model.graph.node))
simplified, ok = onnxsim.simplify(model)
if ok: onnx.save(simplified, "churn_model_sim.onnx")
```

For files above 2 GB pass the path to `check_model("big.onnx")` instead of a loaded proto.

### Quantize

```python
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic("churn_model.onnx", "churn_model_int8.onnx", weight_type=QuantType.QInt8)
```

Dynamic quantization suits MatMul/Linear-heavy models (transformers, MLPs) on CPU. It prints a warning recommending `quant_pre_process` first; run `python -m onnxruntime.quantization.preprocess --input in.onnx --output out.onnx` for best results. Convolution nets usually need static quantization (`quantize_static` with a calibration data reader). Always compare accuracy on real data afterwards.

### Mobile and minimal builds

```bash
python -m onnxruntime.tools.convert_onnx_models_to_ort churn_model.onnx --output_dir mobile_model
```

This writes `.ort` files plus a `required_operators.config` for custom minimal builds. The old Python function `ort_format_model.convert_onnx_models_to_ort(...)` does not exist; use the module command above. Standard `.onnx` files also run on the ONNX Runtime Mobile and web packages, so the ORT format is only needed for minimal-size builds.

## Examples

### Example 1: "Export my PyTorch classifier and check it matches"

Run the export above on the trained `model`, then compare outputs:

```python
import numpy as np, onnxruntime as ort, torch
x = torch.randn(8, 10)
expected = model(x).detach().numpy()
got = ort.InferenceSession("churn_model.onnx", providers=["CPUExecutionProvider"]).run(None, {"input": x.numpy()})[0]
np.testing.assert_allclose(expected, got, rtol=1e-3, atol=1e-5)
```

The assertion passes silently when the export is faithful; a mismatch raises with the worst element.

### Example 2: "Make this model smaller for a CPU server"

```bash
python -c "from onnxruntime.quantization import quantize_dynamic, QuantType; quantize_dynamic('churn_model.onnx','churn_model_int8.onnx',weight_type=QuantType.QInt8)"
ls -l churn_model*.onnx
```

For weight-dominated models the int8 file is roughly a quarter of the size; run the accuracy comparison from Example 1 against the quantized file before shipping.

## Guidelines

- Pin `opset_version` explicitly and check the target runtime supports it; newer opsets need a recent onnxruntime.
- Inputs must be numpy arrays of the exact dtype (`float32`, `int64` for token ids); a wrong dtype is the most common `InvalidArgument` error.
- Mark batch and sequence dimensions dynamic at export time, or the model only accepts the dummy shape.
- Test with `eval()` mode and fixed seeds; dropout or batch-norm in training mode produces wrong exports.
- Never mix `onnxruntime` and `onnxruntime-gpu` in one environment.
- Load `.onnx` files only from trusted sources: ONNX models can reference external data files and custom operator libraries.
- Not every PyTorch operator exports; unsupported ops fail at export with the operator name. Rewrite the op or register a custom translation.
