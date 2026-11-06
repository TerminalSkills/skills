---
name: supervision
description: >-
  Supervision is a Python library of reusable computer-vision utilities: it wraps detection results in one Detections object, draws boxes, labels, masks and heat maps on frames, counts objects in zones or across lines, runs video through a callback, and converts datasets between YOLO and COCO formats. Use when a user says "annotate detections on a video", "count people crossing a line", "count objects in a polygon zone", "slice a large image for small-object detection", or "convert my COCO dataset to YOLO". It does not ship a model or a tracker.
license: Apache-2.0
compatibility: "Python 3.10+; pip install supervision (pulls in numpy, scipy, matplotlib, pillow, av; OpenCV is optional). A detection model is only needed for the model connectors."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "computer-vision, object-detection, video-analytics, annotation, datasets"
  repository: https://github.com/roboflow/supervision
---
# Supervision — model-agnostic utilities for detection, annotation, zones and datasets

## Overview

Supervision (PyPI `supervision`, Apache-2.0, by Roboflow) sits after the model. Whatever produces boxes, masks or keypoints (Ultralytics YOLO, Hugging Face Transformers, Roboflow Inference, your own code), you convert the output to `sv.Detections` once and reuse the same filtering, drawing, counting, video and dataset code. This skill was verified against release 0.31.5.

What it does: `Detections` (NumPy-backed, sliceable and filterable), annotators, `PolygonZone` and `LineZone` counters, `InferenceSlicer` (tiled inference), video helpers, `DetectionDataset` (YOLO, COCO, Pascal VOC), CSV and JSON sinks.

What it does not do: it is not a model and not a tracker. `sv.ByteTrack` was removed in 0.31.0; tracking now lives in the separate `trackers` package (`pip install trackers`, verified with 2.7.0: `from trackers import ByteTrackTracker`, then `tracked = tracker.update(detections)` returns `sv.Detections` with `tracker_id` set). `LineZone` and `TraceAnnotator` need that field.

## Instructions

### Installation

Use a virtual environment so the pinned version is reproducible.

```bash
python3 -m venv .venv
.venv/bin/pip install "supervision==0.31.5"
.venv/bin/python -c "import supervision as sv; print(sv.__version__)"
```

OpenCV is not a dependency. Without it supervision warns and uses a slower pure NumPy fallback. For full speed and behavior install `opencv-python` (or `opencv-python-headless` on servers without display libraries; never both).

### Build Detections

Directly from arrays (the same shape every connector produces):

```python
import numpy as np
import supervision as sv

detections = sv.Detections(
    xyxy=np.array([[50, 60, 200, 300], [300, 100, 420, 260], [450, 50, 600, 400]], dtype=float),
    confidence=np.array([0.91, 0.78, 0.45]),
    class_id=np.array([0, 2, 0]),
    data={"class_name": np.array(["car", "truck", "car"])},
)
confident = detections[detections.confidence > 0.5]   # boolean-mask filtering
print(len(confident), detections.area)                # 2 and per-box pixel areas
nms = detections.with_nms(threshold=0.5)              # class_agnostic=False by default
```

From a model (connectors exist in 0.31.5; these need the model package and weights, which this skill does not install):

```python
detections = sv.Detections.from_ultralytics(results)      # Ultralytics result object
detections = sv.Detections.from_transformers(transformers_results, id2label=id2label)
detections = sv.Detections.from_inference(inference_result)  # Roboflow Inference
```

Check the connector's parameters with `help(sv.Detections.from_transformers)` before use; they differ per library.

### Annotate frames

Annotators take a BGR NumPy image (what OpenCV reads), draw on it in place and return the same array. Always pass a copy if you need the original.

```python
labels = [f"{name} {conf:.2f}" for name, conf in zip(detections["class_name"], detections.confidence)]
frame = image.copy()
frame = sv.BoxAnnotator().annotate(frame, detections)
frame = sv.LabelAnnotator().annotate(frame, detections, labels=labels)
```

Other annotators that exist in 0.31.5 include `MaskAnnotator`, `PolygonAnnotator`, `HaloAnnotator`, `BlurAnnotator`, `PixelateAnnotator`, `CropAnnotator`, `HeatMapAnnotator`, `TraceAnnotator` (needs `tracker_id`) and `EdgeAnnotator`/`VertexAnnotator` for keypoints. Masks need `detections.mask`.

### Count in a zone

```python
polygon = np.array([[0, 0], [320, 0], [320, 480], [0, 480]])
zone = sv.PolygonZone(polygon=polygon)       # default anchor: bottom center of each box
inside = zone.trigger(detections)            # boolean array, one entry per detection
print(zone.current_count)                    # detections inside right now
frame = sv.PolygonZoneAnnotator(zone=zone, color=sv.Color.RED).annotate(frame)
```

### Count line crossings (needs tracker ids)

```python
line = sv.LineZone(start=sv.Point(0, 540), end=sv.Point(1920, 540))
crossed_in, crossed_out = line.trigger(detections)   # detections must have tracker_id
print(line.in_count, line.out_count)
frame = sv.LineZoneAnnotator().annotate(frame, line_counter=line)
```

Run `trigger` once per frame, in order. A box that moves down through a horizontal line counts as `out`; moving up counts as `in`.

### Process a whole video

`process_video` reads frames, calls your function with `(frame, frame_index)`, and writes the result.

```python
box = sv.BoxAnnotator()

def callback(frame: np.ndarray, index: int) -> np.ndarray:
    detections = detect(frame)           # your model call returning sv.Detections
    return box.annotate(frame.copy(), detections)

sv.process_video(source_path="lot.mp4", target_path="lot-annotated.mp4", callback=callback)
```

For custom loops: `sv.get_video_frames_generator("lot.mp4", stride=5)` yields every fifth frame, `sv.VideoInfo.from_video_path("lot.mp4")` returns width, height, fps and total frames, and `sv.VideoSink("out.mp4", info)` is a context manager with `write_frame`.

### Small objects in large images

`InferenceSlicer` runs your callback on overlapping tiles and merges the results with NMS.

```python
slicer = sv.InferenceSlicer(callback=lambda tile: detect(tile), slice_wh=(640, 640), overlap_wh=(128, 128))
detections = slicer(image)
```

The overlap argument is `overlap_wh` in pixels (not a ratio).

### Datasets

```python
ds = sv.DetectionDataset.from_yolo("data/images", "data/labels", "data/data.yaml")
train, valid = ds.split(split_ratio=0.8, random_state=1, shuffle=True)
train.as_coco(images_directory_path="coco/train", annotations_path="coco/train.json")
valid.as_yolo(images_directory_path="yolo/valid/images",
              annotations_directory_path="yolo/valid/labels",
              data_yaml_path="yolo/data.yaml")
print(len(ds), ds.classes)
```

`from_coco(images_directory_path, annotations_path)` and `as_pascal_voc(...)` also exist. Conversions copy the images into the target folder.

### Export detections

```python
with sv.CSVSink("detections.csv") as sink:
    sink.append(detections, custom_data={"frame": 1})   # columns: x_min,y_min,x_max,y_max,class_id,confidence,tracker_id, then keys of detections.data (class_name), then frame
```

`sv.JSONSink` has the same interface.

## Examples

### Example 1: "Count cars in the left half of a parking-lot camera"

Request: draw the detections of `lot.mp4` and show how many cars stand in the left half.

```python
import numpy as np
import supervision as sv

info = sv.VideoInfo.from_video_path("lot.mp4")
zone = sv.PolygonZone(polygon=np.array([[0, 0], [info.width // 2, 0],
                                         [info.width // 2, info.height], [0, info.height]]))
box, zone_ann = sv.BoxAnnotator(), sv.PolygonZoneAnnotator(zone=zone, color=sv.Color.GREEN)

def callback(frame, index):
    detections = detect(frame)                      # model-specific, returns sv.Detections
    detections = detections[detections.confidence > 0.4]
    zone.trigger(detections)
    return zone_ann.annotate(box.annotate(frame.copy(), detections))

sv.process_video("lot.mp4", "lot-zone.mp4", callback)
```

Result: `lot-zone.mp4` with the same frame count as the input, boxes on each car and a counter for the zone. The zone logic was run on synthetic boxes: three boxes, only the one with its bottom-center in the left half was reported `True`, `current_count == 1`.

### Example 2: "Convert my YOLO dataset to COCO and hold out 20 percent"

```python
import supervision as sv

ds = sv.DetectionDataset.from_yolo("datasets/helmets/images", "datasets/helmets/labels",
                                   "datasets/helmets/data.yaml")
train, valid = ds.split(split_ratio=0.8, random_state=7)
train.as_coco("coco/train", "coco/train.json")
valid.as_coco("coco/valid", "coco/valid.json")
print(len(ds), len(train), len(valid))
```

Result: for 6 images the split was 4 and 2; `coco/train.json` and `coco/valid.json` can be read back with `sv.DetectionDataset.from_coco` and give the same image counts.

## Guidelines

- Pin the version. Supervision removes and renames APIs between minor releases (`sv.ByteTrack` is gone since 0.31.0); check `dir(sv)` or `help()` instead of copying snippets from older blog posts.
- `xyxy` is pixel coordinates `[x_min, y_min, x_max, y_max]` as floats. Models that return normalized or `xywh` boxes need converting first (`sv.xywh_to_xyxy`, `sv.denormalize_boxes`).
- Annotators draw in place on the array you pass. Hand them a copy when the original frame is reused.
- `LineZone`, `TraceAnnotator` and any per-object logic need `tracker_id`; without it counting silently has nothing to count. `LineZone` ignores negative ids (`-1` is an unconfirmed track in `trackers`), and a crossing is only reported on the frame after the first sighting.
- Do not run model inference on every frame of a long video without need: use `stride` in `get_video_frames_generator`, or lower the resolution.
- Model connectors, Roboflow API keys and cloud inference are outside this skill. Read keys from an environment variable such as `ROBOFLOW_API_KEY`, never from a file in the repository.
- Do not choose Supervision when you only need a detector (use the model library) or full MLOps (training, serving). It is the glue and the reporting layer.
