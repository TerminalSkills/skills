---
name: pytorch
description: >-
  Assists with building, training, and deploying neural networks using PyTorch. Use when
  designing architectures for computer vision, NLP, or tabular data, optimizing training
  with mixed precision and distributed strategies, or exporting models for production
  inference. Trigger words: pytorch, torch, neural network, deep learning, training loop, cuda.
license: Apache-2.0
compatibility: "Requires Python 3.10+ (PyTorch 2.9 and later); a CUDA-capable GPU is recommended"
metadata:
  author: terminal-skills
  version: "1.2.0"
  repository: https://github.com/pytorch/pytorch
  category: data-ai
  tags: ["pytorch", "deep-learning", "neural-network", "gpu", "machine-learning"]
---

# PyTorch

## Overview

PyTorch is a deep learning framework for building and training neural networks with dynamic computation graphs and automatic differentiation. It provides tensor operations with GPU acceleration, `nn.Module` for defining architectures, DataLoader for efficient data loading, mixed precision training for performance, and export tools (`torch.export`, ONNX) for production deployment.

## Instructions

- Install with pip from the selector at pytorch.org/get-started/locally (it prints the right index URL for your CUDA version or CPU-only). PyTorch 2.9 and later need Python 3.10+.
- Pick the device once: `device = "cuda" if torch.cuda.is_available() else "cpu"` (Apple Silicon: `"mps"`).
- When defining models, subclass `nn.Module` with `__init__` for layers and `forward` for computation, using `nn.Sequential` for simple stacks.
- When training, run the standard loop: `optimizer.zero_grad()`, forward pass, loss, `loss.backward()`, `clip_grad_norm_`, `optimizer.step()`. Call `model.train()` before the loop and `model.eval()` for validation.
- When loading data, subclass `Dataset` with `__len__` and `__getitem__`, then use `DataLoader` with `num_workers=4`, `pin_memory=True` and `persistent_workers=True` for GPU training.
- When optimizing performance, use `torch.compile(model)` (first call is slow while it compiles), mixed precision with `torch.autocast(device_type="cuda", dtype=torch.bfloat16)`, and `DistributedDataParallel` launched with `torchrun` for multi-GPU. With float16 also use `torch.amp.GradScaler("cuda")`; bfloat16 does not need it.
- When doing transfer learning, load pretrained weights with the `weights=` enum (`ResNet50_Weights.DEFAULT`; the old `pretrained=True` was removed) or from Hugging Face, freeze the backbone, and replace the classifier head.
- When saving, store `model.state_dict()`; load with `torch.load(path, map_location=device, weights_only=True)`. `weights_only=True` is the default since 2.6 and rejects arbitrary pickled objects.
- When deploying, use `torch.export.export(model, example_args)` for a graph you can ship, and `torch.onnx.export(model, example_args, "model.onnx", dynamo=True)` for ONNX (the dynamo exporter is the default since 2.9). TorchScript (`torch.jit.trace`/`script`) is deprecated; keep it only for legacy code.
- For INT8 or lower-precision inference, use the `torchao` package (`torchao.quantization.quantize_`). `torch.ao.quantization` is being phased out in favour of it.

## Examples

### Example 0: Install and verify

```bash
pip install torch torchvision
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```

Prints the version (for example `2.14.1`) and `True` when a CUDA GPU is usable.

### Example 1: Fine-tune a vision model for image classification

**User request:** "Fine-tune a pretrained ResNet for classifying product images into 12 categories"

```python
import torch, torch.nn as nn
from torchvision.models import resnet50, ResNet50_Weights

device = "cuda" if torch.cuda.is_available() else "cpu"
model = resnet50(weights=ResNet50_Weights.DEFAULT)
for p in model.parameters():
    p.requires_grad = False
model.fc = nn.Linear(2048, 12)          # new head is trainable
model.to(device)

opt = torch.optim.AdamW(model.fc.parameters(), lr=1e-3, weight_decay=0.01)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=10)
loss_fn = nn.CrossEntropyLoss()

model.train()
for epoch in range(10):
    for images, labels in train_loader:   # DataLoader with RandomCrop/ColorJitter/Normalize
        images, labels = images.to(device), labels.to(device)
        opt.zero_grad()
        with torch.autocast(device_type=device, dtype=torch.bfloat16):
            loss = loss_fn(model(images), labels)
        loss.backward()
        opt.step()
    sched.step()
```

**Result:** only the 12-way head is trained, so each epoch is fast; the loss printed per epoch falls steadily and validation accuracy is checked with `model.eval()` and `torch.no_grad()`.

### Example 2: Fine-tune a transformer for sentiment and export it

**User request:** "Build a sentiment model from bert-base-uncased and export it for serving"

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
tok = AutoTokenizer.from_pretrained("bert-base-uncased")
model = AutoModelForSequenceClassification.from_pretrained("bert-base-uncased", num_labels=2)
# ... train with AdamW(lr=2e-5), a linear warmup scheduler and clip_grad_norm_(model.parameters(), 1.0)

model.eval()
sample = tok("great battery life", return_tensors="pt")
torch.onnx.export(model, (sample["input_ids"], sample["attention_mask"]),
                  "sentiment.onnx", input_names=["input_ids", "attention_mask"],
                  dynamo=True)
```

**Result:** a `sentiment.onnx` file that ONNX Runtime can load. If export fails on a data-dependent branch, try `torch.export.export` first to see the exact graph break, then pass `dynamic_shapes` for variable batch or sequence length.

## Guidelines

- Use `AdamW` over `Adam` for decoupled weight decay.
- Keep the Dataset on CPU and move batches to the device in the loop.
- Use `model.eval()` together with `torch.no_grad()` (or `torch.inference_mode()`) for inference; forgetting `eval()` leaves dropout and batch-norm in training mode.
- `torch.compile` can recompile when input shapes change; mark dynamic dimensions or pad to fixed sizes.
- Never `torch.load` a checkpoint from an untrusted source with `weights_only=False`; it can execute arbitrary code.
- Save `state_dict`, not the whole pickled model, so checkpoints survive code changes.
- Do not mix `torch.jit` and `torch.export` in new code; pick `torch.export`.
- Use PyTorch for custom architectures and research; for plain tabular data, gradient boosting is often faster and just as accurate.
