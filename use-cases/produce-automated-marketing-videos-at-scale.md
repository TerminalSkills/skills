---
title: "Produce Automated Marketing Videos at Scale with Remotion"
slug: produce-automated-marketing-videos-at-scale
description: "Generate hundreds of personalized product videos with dynamic subtitles and thumbnail frames using code-driven video production."
skills:
  - remotion-video-toolkit
  - video-subtitles
  - video-frames
category: automation
tags:
  - video-production
  - marketing
  - remotion
  - subtitles
  - automation
---

# Produce Automated Marketing Videos at Scale with Remotion

## The Problem

An e-commerce brand with 350 products needs short promotional videos for each product listing on their website and social media. A freelance video editor charges $75 per video and takes 3 days for a batch of 20. At that rate, covering all 350 products costs $26,250 and takes months. When prices change or new products launch, existing videos become outdated and the entire cycle restarts. The marketing team also wants each video to have burned-in subtitles for accessibility and autoplay-without-sound contexts, plus thumbnail frames for social media previews.

## The Solution

Using **remotion-video-toolkit** to programmatically generate videos from product data and templates, **video-subtitles** to burn accurate captions into each video, and **video-frames** to extract optimized thumbnail images, the brand produces all 350 videos in a single overnight batch run.

## Step-by-Step Walkthrough

### 1. Build a parameterized video template in Remotion

Create a React-based video component that accepts product data as props and renders a polished 15-second promotional clip.

> Use remotion-video-toolkit to create a 15-second product video template. The template takes props: productName, price, description, imageUrl, and backgroundColor. Animate the product image with a zoom-in entrance at frame 0, display the product name with a typewriter effect at frame 30, show the price with a bounce animation at frame 60, and end with a call-to-action "Shop Now" button at frame 90. Use 1080x1080 for Instagram and 1920x1080 for YouTube.

### 2. Generate subtitle tracks for each video

Create timed subtitle files from the product descriptions and burn them into the video frames.

> Use video-subtitles to generate SRT subtitle files for each product video. The subtitle text comes from the product's short description, timed to match the animation: product name at 0-2s, key feature at 2-5s, price at 5-8s, and call-to-action at 8-10s. Burn the subtitles into the video with a semi-transparent black background, white text, and the brand's font. Process all 350 videos in batch.

### 3. Extract thumbnail frames at the most visually appealing moment

Pull optimized still frames from each video for use as social media preview images and product listing thumbnails.

> Use video-frames to extract thumbnail images from each of the 350 rendered videos. Capture frames at the 3-second mark (when the product image is fully zoomed in and the name is displayed). Export as both 1080x1080 PNG for Instagram and 1280x720 JPEG for YouTube thumbnails. Apply a slight sharpening filter to compensate for video compression artifacts in the still frame.

### 4. Batch render all 350 product videos

Feed the product catalog CSV into Remotion's batch renderer and produce all videos overnight.

> Use remotion-video-toolkit to batch render all 350 product videos. Read product data from /data/products.csv. For each product, render both Instagram (1080x1080) and YouTube (1920x1080) versions. Use 4 concurrent Remotion render processes. Output to /output/videos/{product_slug}/. Estimated render time: 45 seconds per video, total batch: ~4.4 hours. Log progress and any failures to /output/render_log.csv.

## Real-World Example

The e-commerce brand ran the first batch on a Friday night. By Saturday morning, all 350 products had both Instagram and YouTube video variants, subtitle-burned versions for accessibility, and optimized thumbnail frames. Total render time was 4 hours and 12 minutes on a single 8-core machine. When a seasonal sale required updating prices on 80 products, they edited the CSV, re-ran only the changed rows, and had updated videos in 90 minutes. The project that would have cost $26,250 and taken months with a freelancer was completed for the cost of compute time, and new products get their videos the same day they are added to the catalog.
