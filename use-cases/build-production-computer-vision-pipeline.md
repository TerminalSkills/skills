---
title: "Build a Production Computer Vision Pipeline with AI-Generated Training Data"
slug: build-production-computer-vision-pipeline
description: "Detect and classify objects in images using YOLO and PyTorch, augmented with synthetic training data from Gemini image models on Vertex AI."
skills:
  - senior-computer-vision
  - pytorch
  - vertex-media-generation
  - supervision
category: data-ai
tags:
  - computer-vision
  - yolo
  - pytorch
  - image-generation
  - object-detection
---

# Build a Production Computer Vision Pipeline with AI-Generated Training Data

## The Problem

A warehouse operations company needs to detect damaged packages on conveyor belts in real time. They have security cameras at every station, but only 800 labeled images of damaged packages -- not enough to train an accurate detection model. Collecting more real damaged packages is slow and expensive (they would need to intentionally damage inventory). The model needs to run at 30 FPS on edge devices with TensorRT, not on a cloud GPU that adds network latency to every frame.

## The Solution

Using the **senior-computer-vision**, **pytorch**, and **vertex-media-generation** skills, the workflow generates synthetic images of damaged packages with a Gemini image model on Vertex AI, labels them with a model trained on the real data plus human review, trains an Ultralytics YOLO detector (PyTorch) on real plus synthetic images, validates on real images only, and exports a TensorRT engine on the Jetson that will run it.

Two licensing notes before you start: Ultralytics code and weights are AGPL-3.0, so a closed-source commercial product needs an Ultralytics Enterprise License (or a different detector such as a torchvision model). Synthetic images are also subject to Google's terms for the image model you call; read them for training use.

## Step-by-Step Walkthrough

### 1. Generate synthetic training images with a Gemini image model

Google has discontinued the Vertex AI Imagen endpoints, and `gemini-2.5-flash-image` is deprecated (retires 2027-03-15). The vertex-media-generation skill uses `gemini-3.1-flash-lite-image` through `@ai-sdk/google-vertex`, served from the `global` location only. Ask the agent:

> Write a Node script that generates 200 photorealistic images of damaged cardboard boxes on a warehouse conveyor belt with the Vercel AI SDK and the Vertex provider. Vary the damage (crushed corners, torn sides, water stains, tape failures), lighting and camera angle. Save to ./synthetic_data/images/ with sequential filenames.

The agent produces something like this (`generate.mjs`; the AI SDK 7 needs Node 22 or newer, and `gcloud auth application-default login` plus `GOOGLE_VERTEX_PROJECT` must be set):

```javascript
import { createVertex } from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';
import fs from 'node:fs';

const vertexGlobal = createVertex({ location: 'global' }); // project from GOOGLE_VERTEX_PROJECT
const damage = ['crushed corner', 'torn side', 'water stain', 'failed tape seam'];
const light = ['bright overhead LED light', 'dim evening light with shadows', 'warm sodium light'];
const angle = ['top-down camera', 'oblique camera 45 degrees', 'side view at belt height'];

fs.mkdirSync('synthetic_data/images', { recursive: true });
for (let i = 0; i < 200; i++) {
  const prompt =
    `Photo from a security camera: a cardboard shipping box with a ${damage[i % 4]} ` +
    `on a warehouse conveyor belt, ${light[i % 3]}, ${angle[Math.floor(i / 4) % 3]}`;
  const { image } = await generateImage({
    model: vertexGlobal.image('gemini-3.1-flash-lite-image'),
    prompt,
    aspectRatio: '16:9', // Gemini image models take aspectRatio, not size or n
  });
  fs.writeFileSync(`synthetic_data/images/damaged_${String(i).padStart(4, '0')}.png`,
    Buffer.from(image.base64, 'base64'));
}
```

One call returns one image, so the loop makes 200 calls; check Google's current Vertex AI pricing and your quota before scaling to thousands. The images fill gaps in the real dataset: if real photos show mostly crushed corners, generate more torn and water-damaged boxes so the model does not learn only one kind of damage.

A generated image has no bounding boxes. Train a first model on the real data (step 2), run it on the synthetic images with a low `conf`, save the predictions as YOLO labels (`save_txt=True`), then have a person review and correct them in a labeling tool. Drop images where the box is not visibly damaged or the damage does not match the prompt.

### 2. Train a YOLO detection model

Install the current packages (Ultralytics 8.4.x; PyTorch needs a CUDA build that matches your driver, see the pytorch skill):

```console
$ pip install ultralytics
```

Keep a real-only validation set. Training data is the real training images plus the reviewed synthetic ones; validation is the held-out real images, so the metrics reflect real cameras:

```yaml
# package_damage.yaml
path: ./dataset
train:
  - images/train_real
  - images/train_synthetic
val: images/val_real
names:
  0: crushed_corner
  1: torn_side
  2: water_stain
  3: tape_failure
```

```python
from ultralytics import YOLO

model = YOLO("yolo26m.pt")  # YOLO11 and v8 weights also load the same way
model.train(
    data="package_damage.yaml",
    epochs=100, imgsz=640, batch=16,
    cos_lr=True,                       # cosine learning-rate schedule
    mosaic=1.0, perspective=0.0005,    # defaults: mosaic 1.0, perspective 0.0
    hsv_h=0.015, hsv_s=0.7, hsv_v=0.4, fliplr=0.5,
)
```

Mosaic, HSV shift and horizontal flip are Ultralytics defaults; the values above only make them explicit. Check that a flipped crop still looks like a real conveyor before keeping `fliplr`. Compare against a baseline trained on real images alone, otherwise you cannot tell whether the synthetic data helped.

### 3. Evaluate and analyze detection performance

```python
from ultralytics import YOLO

model = YOLO("runs/detect/train/weights/best.pt")
metrics = model.val(data="package_damage.yaml", split="val")
print(metrics.box.map50, metrics.box.map, metrics.box.mp, metrics.box.mr)
print(metrics.box.maps)  # mAP50-95 per class; confusion_matrix.png is saved in the run folder
```

Per-class numbers and `confusion_matrix.png` land in the validation run directory. Review the worst false positives and false negatives by running `model.predict` on the validation images and sorting by confidence. Typical failure modes are reflective tape confused for water damage and shadows read as crushed corners; if one confusion dominates, generate more synthetic images that target it and re-review the labels.

### 4. Export to TensorRT and run on the Jetson

A TensorRT engine only runs on the GPU model and TensorRT version that built it, so run the export on the Jetson itself:

```python
from ultralytics import YOLO

YOLO("best.pt").export(format="engine", device=0, quantize=16, imgsz=640)  # FP16, writes best.engine
```

The camera also sees the floor beside the belt, so count only detections inside the belt area. `supervision` (`pip install "supervision==0.31.5"`) converts the Ultralytics result and does the zone test:

```python
import json, urllib.request
import numpy as np
import supervision as sv
from ultralytics import YOLO

model = YOLO("best.engine")
# Belt area in pixel coordinates of the 1280x720 camera frame
belt = sv.PolygonZone(polygon=np.array([[180, 0], [1100, 0], [1100, 720], [180, 720]]))
# RTSP URL comes from the camera config; credentials stay out of the code
for r in model.predict(source="rtsp://camera.local/stream1", stream=True, conf=0.85, verbose=False):
    detections = sv.Detections.from_ultralytics(r)
    on_belt = detections[belt.trigger(detections)]
    if len(on_belt):
        body = json.dumps({"station": "belt-3", "count": len(on_belt)}).encode()
        req = urllib.request.Request("https://alerts.example.com/hook", body,
                                     {"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=2)
```

Measure frames per second on the device itself (`benchmark` from `ultralytics.utils.benchmarks`, or time the loop) at `imgsz=640` and at a smaller size, and send alerts from a background queue so a slow webhook never stalls inference. Pick the confidence threshold from the precision/recall trade-off on your validation set, not from a rule of thumb.

## Real-World Example

The numbers below are one example team's results, not benchmarks. A logistics company trained a package damage detector on 800 real labeled images plus a few thousand reviewed synthetic images, and kept 160 real images for validation. They measured per-class results on the real validation set, for example:

```text
                  mAP@0.5   mAP@0.5:0.95   Precision   Recall
all classes        0.891       0.674          0.883      0.856
water_stain        0.861       0.629          0.853      0.819
```

Their real-only baseline scored lower on the same validation images, which is the comparison that justified paying for the synthetic data. The biggest remaining error was reflective tape read as water damage, so the next round of generation targeted tape under varied lighting. Your own validation set, on your own cameras, is the only number that matters.

## Related Skills

- **senior-computer-vision** -- YOLO training, validation and TensorRT export used in steps 2-4.
- **pytorch** -- the framework under Ultralytics; install the CUDA build that matches the GPU and Python version.
- **vertex-media-generation** -- generates the synthetic damaged-package images with `gemini-3.1-flash-lite-image` in step 1.
- **supervision** -- converts the Ultralytics results and keeps only detections inside the belt zone in step 4.
