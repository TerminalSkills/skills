---
name: senior-computer-vision
description: >-
  Object detection, image segmentation, and visual AI. Use when a user asks to
  detect objects in images, segment images, run YOLO inference, build a
  computer vision pipeline, use Faster R-CNN or SAM, deploy a vision model
  with TensorRT, or perform image classification. Covers YOLO, SAM, Mask
  R-CNN, and TensorRT optimization.
license: Apache-2.0
compatibility: "Python 3.8+ with PyTorch; a CUDA GPU is recommended and required for TensorRT export. Ultralytics is AGPL-3.0."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/ultralytics/ultralytics
  category: data-ai
  tags: "computer-vision, yolo, segmentation, detection, tensorrt"
  use-cases: "Detect and count objects in images or video streams, Segment images with SAM or Mask R-CNN, Deploy optimized vision models with TensorRT for production"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Senior Computer Vision

## Overview

Build and deploy computer vision pipelines for object detection, image segmentation, and visual AI. Supports Ultralytics YOLO (YOLO26 is the current release; YOLO11 and v8 still work), Faster R-CNN, SAM (Segment Anything Model), and Mask R-CNN. Includes TensorRT optimization for production deployment with real-time inference.

## Instructions

When a user asks for computer vision help, determine the task:

### Task A: Object detection with YOLO

1. Install ultralytics:

```bash
pip install ultralytics
```

Ultralytics code and weights are AGPL-3.0; closed-source commercial products need an Ultralytics Enterprise License (or use torchvision/other Apache or BSD models).

2. Run inference:

```python
from ultralytics import YOLO

# Load a pretrained model
model = YOLO("yolo26n.pt")  # nano (fastest) | s | m | l | x (most accurate)

# Detect objects in an image
results = model("image.jpg")

# Process results
for result in results:
    boxes = result.boxes
    for box in boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])
        label = model.names[cls]
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        print(f"{label}: {conf:.2f} at [{x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f}]")

# Save annotated image
results[0].save("result.jpg")
```

3. Run on video:

```python
# Process video with tracking
results = model.track("video.mp4", show=False, save=True, tracker="bytetrack.yaml")
```

4. Train a custom YOLO model:

```python
model = YOLO("yolo26n.pt")
model.train(
    data="dataset.yaml",   # Path to dataset config
    epochs=100,
    imgsz=640,
    batch=16,
    device=0,              # GPU index
    patience=20,           # Early stopping
)
```

Dataset YAML format:
```yaml
path: ./dataset
train: images/train
val: images/val
names:
  0: cat
  1: dog
  2: bird
```

### Task B: Image segmentation with SAM

The simplest route is the Ultralytics `SAM` class (weights download automatically). `sam2.1_b.pt` (SAM 2.1) and SAM 3 (`sam3.pt`, needs access approval on Hugging Face) load the same way.

```python
from ultralytics import SAM

model = SAM("sam_b.pt")

# Prompt with a box [x1, y1, x2, y2] or points (1 = foreground, 0 = background)
results = model("product.jpg", bboxes=[120, 80, 860, 940])
results = model("product.jpg", points=[[500, 375]], labels=[1])

# No prompt: segment everything
results = model("product.jpg")
mask = results[0].masks.data[0].cpu().numpy()   # binary mask, shape (H, W)
```

Meta's original `segment-anything` package (`pip install git+https://github.com/facebookresearch/segment-anything.git`, checkpoint `sam_vit_h_4b8939.pth` downloaded from the repo README) exposes `sam_model_registry`, `SamPredictor` and `SamAutomaticMaskGenerator`; use it when you need its raw API. It needs `numpy` and an RGB `(H, W, 3)` uint8 array as the image.

### Task C: Faster R-CNN and Mask R-CNN with torchvision

```python
import torch
from torchvision.models.detection import fasterrcnn_resnet50_fpn_v2, maskrcnn_resnet50_fpn_v2
from torchvision.transforms import functional as F
from PIL import Image

# Object detection with Faster R-CNN
det_model = fasterrcnn_resnet50_fpn_v2(weights="DEFAULT")
det_model.eval().cuda()

img = Image.open("image.jpg")
img_tensor = F.to_tensor(img).unsqueeze(0).cuda()

with torch.no_grad():
    predictions = det_model(img_tensor)[0]

# Filter by confidence
threshold = 0.7
for i in range(len(predictions["scores"])):
    if predictions["scores"][i] > threshold:
        label = predictions["labels"][i].item()
        score = predictions["scores"][i].item()
        box = predictions["boxes"][i].tolist()
        print(f"Class {label}: {score:.2f} at {box}")

# Instance segmentation with Mask R-CNN
seg_model = maskrcnn_resnet50_fpn_v2(weights="DEFAULT")
seg_model.eval().cuda()

with torch.no_grad():
    predictions = seg_model(img_tensor)[0]
    # predictions["masks"] contains per-instance binary masks
```

### Task D: TensorRT optimization for deployment

```python
# Export YOLO to TensorRT
from ultralytics import YOLO

model = YOLO("yolo26n.pt")
model.export(format="engine", device=0, quantize=16)  # FP16 engine yolo26n.engine (older versions: half=True)

# Run inference with TensorRT engine
trt_model = YOLO("yolo26n.engine")
results = trt_model("image.jpg")
```

For custom models:

```python
import torch

# Export PyTorch model to ONNX first
torch.onnx.export(
    model, dummy_input, "model.onnx",
    opset_version=17,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
)

# Convert ONNX to TensorRT
# trtexec --onnx=model.onnx --saveEngine=model.engine --fp16
```

### Task E: Image classification

```python
from torchvision.models import efficientnet_v2_s, EfficientNet_V2_S_Weights
import torch
from torchvision.transforms import functional as F
from PIL import Image

weights = EfficientNet_V2_S_Weights.DEFAULT
model = efficientnet_v2_s(weights=weights).eval().cuda()
preprocess = weights.transforms()

img = Image.open("image.jpg")
batch = preprocess(img).unsqueeze(0).cuda()

with torch.no_grad():
    logits = model(batch)
    probs = torch.softmax(logits, dim=1)[0]
    top5 = torch.topk(probs, 5)

categories = weights.meta["categories"]
for score, idx in zip(top5.values, top5.indices):
    print(f"{categories[idx]}: {score:.2%}")
```

## Examples

### Example 1: Count products on a shelf

**User request:** "Count how many bottles are on each shelf in this image"

```python
model = YOLO("yolo26m.pt")
results = model("shelf.jpg", conf=0.5)
bottles = [b for b in results[0].boxes if model.names[int(b.cls[0])] == "bottle"]
print(f"Detected {len(bottles)} bottles")
results[0].save("shelf_annotated.jpg")
```

### Example 2: Segment and extract a foreground object

**User request:** "Remove the background from this product photo"

Use SAM with a center-point prompt to segment the main object, then apply the mask to create a transparent PNG background.

### Example 3: Real-time detection on a webcam

**User request:** "Run object detection on my webcam feed"

```python
model = YOLO("yolo26n.pt")
results = model(source=0, show=True, conf=0.5)  # source=0 for webcam
```

## Guidelines

- Start with the smallest model variant (nano/small) and scale up only if accuracy is insufficient.
- Use TensorRT or ONNX Runtime for production deployments; the speedup over PyTorch depends on model and GPU, so measure it. A TensorRT engine only runs on the GPU model and TensorRT version that built it.
- For custom detection tasks, fine-tune YOLO on your dataset rather than training from scratch.
- Set confidence thresholds based on the application: 0.5 for general use, 0.7+ for high-precision needs.
- Use half-precision (FP16) inference on GPUs (`half=True` in predict, `quantize=16` in export); accuracy loss is usually small, but validate on your own data.
- Pre-process images to the model's expected resolution before inference for best results.
- For video processing, use batch inference and tracking (ByteTrack) for temporal consistency.
- Benchmark with `from ultralytics.utils.benchmarks import benchmark; benchmark(model="yolo26n.pt", data="coco8.yaml", imgsz=640, device=0)` before committing to a model size; pass `imgsz` and `device` explicitly.
