---
name: opencv
description: >-
  OpenCV is an open-source computer vision library for image processing, video
  analysis, feature detection, camera calibration and DNN inference, with
  Python, C++ and JavaScript bindings. Use when asked to resize, blur, threshold
  or detect edges in images, find contours, read or write video, run an ONNX
  object detector, or build an OpenCV pipeline with cv2.
license: Apache-2.0
compatibility: 'Python 3.6+, opencv-python 5.0.0 (tested); Linux, macOS, Windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/opencv/opencv
  category: data-ai
  tags:
    - computer-vision
    - image-processing
    - video
    - python
    - detection
---

# OpenCV — Computer Vision Library

## Overview

OpenCV (`cv2` in Python) covers image filtering, geometry, feature detection, video I/O, calibration and inference of ONNX models through `cv2.dnn`. Images are NumPy arrays in BGR order. The sections below show the operations most pipelines are built from; the snippets were run against opencv-python-headless 5.0.0.

## Instructions

Install the package, load frames with `cv2.imread` / `cv2.VideoCapture`, process them as arrays, and write results with `cv2.imwrite` / `cv2.VideoWriter`.

### Image Processing

```python
import cv2
import numpy as np

# Read and display
img = cv2.imread("photo.jpg")
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Resize
resized = cv2.resize(img, (800, 600))
# Or maintain aspect ratio
scale = 800 / img.shape[1]
resized = cv2.resize(img, None, fx=scale, fy=scale)

# Blur (noise reduction)
blurred = cv2.GaussianBlur(img, (5, 5), 0)
median = cv2.medianBlur(img, 5)           # Better for salt-and-pepper noise

# Edge detection
edges = cv2.Canny(gray, 50, 150)

# Thresholding
_, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY, 11, 2)

# Morphological operations
kernel = np.ones((5, 5), np.uint8)
dilated = cv2.dilate(binary, kernel, iterations=1)
eroded = cv2.erode(binary, kernel, iterations=1)
opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)   # Remove noise
closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)  # Fill gaps
```

### Object Detection (DNN Module)

Export a YOLOv8 model to ONNX first (`yolo export model=yolov8n.pt format=onnx` with the `ultralytics` package; the ONNX file is the only thing OpenCV needs). The exported network returns one array of shape `(1, 84, 8400)`: 4 box values (centre x, centre y, width, height in 640x640 input pixels) plus 80 class scores per candidate, with no separate objectness score. Transpose it, keep confident rows, then run non-maximum suppression.

```python
import cv2
import numpy as np

net = cv2.dnn.readNetFromONNX("yolov8n.onnx")
CLASSES = [line.strip() for line in open("coco.names")]   # 80 COCO class names, one per line

def detect_objects(image, conf_threshold=0.5, nms_threshold=0.45):
    """Return (class_id, confidence, x, y, w, h) tuples in original image pixels."""
    h, w = image.shape[:2]
    blob = cv2.dnn.blobFromImage(image, 1 / 255.0, (640, 640), swapRB=True, crop=False)
    net.setInput(blob)
    rows = np.squeeze(net.forward()).T                    # (8400, 84)

    scores = rows[:, 4:].max(axis=1)
    class_ids = rows[:, 4:].argmax(axis=1)
    keep = scores > conf_threshold
    boxes, confs, ids = [], scores[keep], class_ids[keep]
    for cx, cy, bw, bh in rows[keep, :4]:
        boxes.append([int((cx - bw / 2) * w / 640), int((cy - bh / 2) * h / 640),
                      int(bw * w / 640), int(bh * h / 640)])

    kept = cv2.dnn.NMSBoxes(boxes, confs.tolist(), conf_threshold, nms_threshold)
    return [(int(ids[i]), float(confs[i]), *boxes[i]) for i in np.array(kept).flatten()]
```

This resizes without letterboxing, so boxes shift slightly on images that are not square; for exact boxes pad the image to a square first. Other detector models and export options use a different output layout, so print `net.forward().shape` before reusing this post-processing.

### Video Processing

```python
# Real-time video processing
cap = cv2.VideoCapture(0)                  # Webcam
# cap = cv2.VideoCapture("video.mp4")     # File

# Output video: the size must equal the frame size or the file stays empty
fourcc = cv2.VideoWriter_fourcc(*"mp4v")
size = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
out = cv2.VideoWriter("output.mp4", fourcc, 30.0, size)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Process frame
    processed = cv2.GaussianBlur(frame, (15, 15), 0)
    edges = cv2.Canny(frame, 50, 150)

    # Draw detections
    for cls, conf, x, y, w, h in detect_objects(frame):
        cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
        cv2.putText(frame, f"{CLASSES[cls]} {conf:.2f}", (x, y-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    out.write(frame)
    cv2.imshow("Detection", frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
out.release()
```

### Contours and Shape Detection

```python
# Find and analyze contours
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
_, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
contours, hierarchy = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

for contour in contours:
    area = cv2.contourArea(contour)
    if area < 100:                         # Skip small noise
        continue

    # Bounding box
    x, y, w, h = cv2.boundingRect(contour)

    # Shape approximation
    peri = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, 0.04 * peri, True)
    sides = len(approx)

    shape = "circle" if sides > 6 else {3: "triangle", 4: "rectangle"}.get(sides, "polygon")
    cv2.drawContours(img, [contour], -1, (0, 255, 0), 2)
    cv2.putText(img, shape, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
```

## Installation

Install exactly one of these packages in an environment (they share the `cv2` module and conflict with each other):

```bash
pip install opencv-python                  # main modules with GUI windows (cv2.imshow)
pip install opencv-contrib-python          # main + contrib modules
pip install opencv-python-headless         # no GUI; for servers and containers
```

SIFT and `cv2.FaceDetectorYN` (YuNet face detector, needs a YuNet `.onnx` file) are in the main modules, so contrib is only needed for contrib-only algorithms.

## Examples

**"Make every photo in uploads/ 800 px wide and grayscale."**

```python
from pathlib import Path
import cv2

out = Path("thumbs"); out.mkdir(exist_ok=True)
for p in Path("uploads").glob("*.jpg"):
    img = cv2.imread(str(p))
    if img is None:            # imread returns None instead of raising
        continue
    scale = 800 / img.shape[1]
    small = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(out / p.name), cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
```

Result: `thumbs/` holds one 800-pixel-wide grayscale JPEG per input.

**"Count the round objects in coins.png."** Threshold, find external contours, and keep those that `approxPolyDP` turns into more than 6 vertices (see the contour example above); `len(coins)` after filtering by `cv2.contourArea` above 100 is the count.

## Guidelines

1. **BGR not RGB** — OpenCV loads images in BGR; convert with `cv2.cvtColor` when using with matplotlib or PIL
2. **DNN for inference** — `cv2.dnn` runs ONNX models without PyTorch or TensorFlow; always check the output shape of the model you load
3. **Preprocessing pipeline** — Resize → blur → convert → threshold → morphology → contours; order matters
4. **Contour hierarchy** — Use `RETR_EXTERNAL` for outermost contours only; `RETR_TREE` for nested relationships
5. **Video with codec** — Use `mp4v` for MP4, `XVID` for AVI; check codec availability on your platform
6. **NumPy integration** — OpenCV images are NumPy arrays; use NumPy for fast pixel-level operations
7. **Headless for servers** — use `opencv-python-headless`; `cv2.imshow` and `cv2.waitKey` do not work there, so drop them from server code
8. **GPU acceleration** — the pip wheels have no CUDA; `cv2.cuda` needs OpenCV built from source with CUDA
