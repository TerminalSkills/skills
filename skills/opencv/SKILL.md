---
name: opencv
description: >-
   You are an expert in OpenCV (Open Source Computer Vision Library), the most
  popular library for real-time computer vision. You help developers build
  image processing pipelines, object detection systems, video analysis tools,
  augmented reality, and document processing using OpenCV's 2,500+ algorithms
  for image manipulation, feature detection, camera calibration, 3D
  reconstruction, and DNN inference — in Python, C++, or JavaScript.
category: AI & Machine Learning
tags: [computer-vision, image-processing, video, python, real-time, detection]
version: 1.0.0
author: terminal-skills
---

# OpenCV — Computer Vision Library

You are an expert in OpenCV (Open Source Computer Vision Library), the most popular library for real-time computer vision. You help developers build image processing pipelines, object detection systems, video analysis tools, augmented reality, and document processing using OpenCV's 2,500+ algorithms for image manipulation, feature detection, camera calibration, 3D reconstruction, and DNN inference — in Python, C++, or JavaScript.

## Core Capabilities

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

```python
# YOLO inference with OpenCV DNN
net = cv2.dnn.readNetFromONNX("yolov8n.onnx")

def detect_objects(image, conf_threshold=0.5):
    """Detect objects using YOLOv8 with OpenCV DNN backend.

    Args:
        image: BGR image (numpy array)
        conf_threshold: Minimum confidence to keep detection

    Returns:
        List of (class_id, confidence, x, y, w, h) tuples
    """
    blob = cv2.dnn.blobFromImage(image, 1/255.0, (640, 640), swapRB=True, crop=False)
    net.setInput(blob)
    outputs = net.forward(net.getUnconnectedOutLayersNames())

    detections = []
    h, w = image.shape[:2]

    for output in outputs:
        for detection in output[0]:
            scores = detection[4:]
            class_id = np.argmax(scores)
            confidence = scores[class_id]

            if confidence > conf_threshold:
                cx, cy, bw, bh = detection[:4]
                x = int((cx - bw/2) * w / 640)
                y = int((cy - bh/2) * h / 640)
                detections.append((class_id, float(confidence), x, y, int(bw*w/640), int(bh*h/640)))

    return detections
```

### Video Processing

```python
# Real-time video processing
cap = cv2.VideoCapture(0)                  # Webcam
# cap = cv2.VideoCapture("video.mp4")     # File

# Output video
fourcc = cv2.VideoWriter_fourcc(*"mp4v")
out = cv2.VideoWriter("output.mp4", fourcc, 30.0, (640, 480))

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

    shape = "circle" if sides > 8 else {3: "triangle", 4: "rectangle"}.get(sides, "polygon")
    cv2.drawContours(img, [contour], -1, (0, 255, 0), 2)
    cv2.putText(img, shape, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
```

## Installation

```bash
pip install opencv-python                  # Core + main modules
pip install opencv-contrib-python          # + extra modules (SIFT, face detection, tracking)
pip install opencv-python-headless         # Without GUI (for servers)
```

## Best Practices

1. **BGR not RGB** — OpenCV loads images in BGR; convert with `cv2.cvtColor` when using with matplotlib or PIL
2. **DNN for inference** — Use `cv2.dnn` for running YOLO, SSD, face detection; no PyTorch/TF dependency needed
3. **Preprocessing pipeline** — Resize → blur → convert → threshold → morphology → contours; order matters
4. **Contour hierarchy** — Use `RETR_EXTERNAL` for outermost contours only; `RETR_TREE` for nested relationships
5. **Video with codec** — Use `mp4v` for MP4, `XVID` for AVI; check codec availability on your platform
6. **NumPy integration** — OpenCV images are NumPy arrays; use NumPy for fast pixel-level operations
7. **Headless for servers** — Install `opencv-python-headless`; no X11/GUI dependencies needed for processing pipelines
8. **GPU acceleration** — Build from source with CUDA support for 10-50x speedup on GPU; or use `cv2.cuda` module
