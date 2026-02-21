---
title: "Build a Production Computer Vision Pipeline with AI-Generated Training Data"
slug: build-production-computer-vision-pipeline
description: "Detect and classify objects in images using YOLO and PyTorch, augmented with synthetic training data from Vertex AI media generation."
skills:
  - senior-computer-vision
  - pytorch
  - vertex-media-generation
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

A warehouse operations company needs to detect damaged packages on conveyor belts in real time. They have security cameras at every station, but only 800 labeled images of damaged packages -- not enough to train an accurate detection model. Collecting more real damaged packages is slow and expensive (they would need to intentionally damage inventory). The model needs to run at 30 FPS on edge devices with TensorRT, not on a cloud GPU that adds 200ms of network latency to every frame.

## The Solution

Using the **senior-computer-vision**, **pytorch**, and **vertex-media-generation** skills, the workflow generates synthetic training images of damaged packages using Vertex AI Imagen to augment the small real dataset, trains a YOLOv8 detection model with PyTorch on the combined data, and optimizes it for edge deployment with TensorRT to hit the 30 FPS requirement on an NVIDIA Jetson.

## Step-by-Step Walkthrough

### 1. Generate synthetic training images with Vertex AI

Use Imagen to create realistic images of damaged packages in warehouse settings, expanding the training dataset from 800 to 5,000 images.

> Generate 200 photorealistic images of damaged cardboard boxes on a warehouse conveyor belt using Vertex AI Imagen. Vary the damage types: crushed corners, torn sides, water stains, and tape failures. Use different lighting conditions and camera angles. Save to ./synthetic_data/damaged/ with sequential filenames.

The generated images fill gaps in the real dataset. Real photos captured mostly crushed-corner damage, but torn and water-damaged packages were rare. Synthetic images balance the class distribution so the model does not learn to only recognize one type of damage.

### 2. Train a YOLOv8 detection model

Combine real and synthetic datasets, configure annotations, and train with PyTorch for optimal detection accuracy.

> Train a YOLOv8m model on the combined dataset of 800 real and 4,200 synthetic images. Use 80/20 train/val split. Apply augmentations: mosaic, random perspective, HSV shift, and horizontal flip. Train for 100 epochs with batch size 16, image size 640, cosine annealing scheduler. Track mAP@0.5 on the validation set.

The training configuration uses medium augmentation to prevent overfitting on synthetic data. The model learns from both real and generated images, with validation always using only real images to ensure metrics reflect real-world performance.

### 3. Evaluate and analyze detection performance

Run inference on the validation set and analyze where the model succeeds and fails to guide further improvements.

> Evaluate the trained model on the real-image validation set. Show mAP@0.5, mAP@0.5:0.95, precision, and recall per damage type. Generate a confusion matrix and show the 10 worst false positives and 10 worst false negatives so I can understand failure modes.

The evaluation on real-only validation data shows whether synthetic augmentation helped or introduced artifacts. Typical failure modes include reflective tape being confused for water damage, and shadows being classified as crushed corners.

### 4. Optimize for edge deployment with TensorRT

Export the model for real-time inference on NVIDIA Jetson edge hardware.

> Export the YOLOv8 model to TensorRT FP16 format optimized for Jetson Orin. Benchmark inference speed at image sizes 640 and 480. Build a Python inference script that reads from an RTSP camera stream, runs detection at 30 FPS, and sends alerts via webhook when damaged packages are detected with confidence above 0.85.

The TensorRT export reduces model size by 60% and doubles inference speed. The alert threshold of 0.85 balances catching real damage against false positives that would slow down the conveyor line unnecessarily.

## Real-World Example

A third-party logistics company trained a package damage detector using 800 real labeled images supplemented with 4,200 Imagen-generated synthetic images. The synthetic data boosted mAP@0.5 from 0.71 (real-only) to 0.89 (combined). After TensorRT optimization, the model ran at 34 FPS on Jetson Orin Nano devices mounted above each conveyor line. In the first month, the system flagged 340 damaged packages that would have shipped to customers, reducing damage-related returns by 62%. The total cost was $180 in Vertex AI generation credits and 8 hours of A100 training time, compared to the $45,000 quarterly cost of damage-related returns they were experiencing before.
