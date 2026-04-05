---
title: "Run Vision AI Locally on Mac"
description: >-
  Replace $200/month cloud API costs with free, offline vision AI
  on Apple Silicon using mlx-vlm for product photo processing.
skills: [mlx-vlm]
difficulty: beginner
time: "30 minutes"
metadata:
  author: terminal-skills
  tags: ["mlx", "vision", "mac", "apple-silicon", "photography", "cost-saving"]
---

# Run Vision AI Locally on Mac

## The Situation

Elena is a product photographer processing 500 photos weekly for an e-commerce client. For each photo she needs to:

- Generate product descriptions (title, category, key features)
- Detect quality defects (blur, bad lighting, color issues)
- Tag categories for the product catalog

She's been using GPT-4V API at ~$0.01 per image. With 500 images/week × 3 tasks each, that's roughly **$200/month**. Her M3 Max MacBook Pro with 36GB RAM sits underutilized.

**Goal:** Run the same vision AI tasks locally for $0/month.

## What You'll Build

A Python pipeline that:
1. Loads a quantized Pixtral 12B model locally via mlx-vlm
2. Processes a folder of product images
3. Generates descriptions, detects defects, and assigns categories
4. Exports everything to a CSV ready for catalog import

## Step 1 — Set Up Environment

```bash
# Create isolated environment
python3 -m venv ~/.venvs/product-vision
source ~/.venvs/product-vision/bin/activate

# Install dependencies
pip install mlx-vlm pandas
```

Verify MLX can see the GPU:
```bash
python3 -c "import mlx.core as mx; print(mx.default_device())"
# Should print: Device(gpu, 0)
```

## Step 2 — Download the Model

```bash
# Pre-download to avoid timeout during processing
python3 -c "
from mlx_vlm import load
model, processor = load('mlx-community/pixtral-12b-240910-4bit')
print('Model loaded successfully')
"
```

First run downloads ~7GB. The 4-bit quantized Pixtral fits comfortably in 36GB unified memory.

## Step 3 — Create the Processing Script

Save as `process_products.py`:

```python
import os
import sys
import json
import pandas as pd
from datetime import datetime
from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template

MODEL_ID = "mlx-community/pixtral-12b-240910-4bit"

DESCRIBE_PROMPT = """Analyze this product photo. Return JSON:
{"title": "short product title", "category": "main category", "subcategory": "specific type", "color": "primary color", "features": ["feature1", "feature2", "feature3"]}
Return ONLY valid JSON, no other text."""

DEFECT_PROMPT = """Inspect this product photo for quality issues.
Check for: blur, bad lighting, overexposure, color cast, cropping issues, background problems.
Return JSON: {"quality": "pass" or "fail", "issues": ["issue1", "issue2"], "score": 1-10}
Return ONLY valid JSON."""

def process_image(model, processor, image_path, prompt):
    formatted = apply_chat_template(
        processor, config=model.config,
        prompt=prompt, images=[image_path],
    )
    result = generate(
        model, processor, formatted,
        images=[image_path], max_tokens=300, temperature=0.1,
    )
    try:
        return json.loads(result.strip())
    except json.JSONDecodeError:
        # Try extracting JSON from response
        start = result.find("{")
        end = result.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(result[start:end])
        return {"error": result}

def main():
    image_dir = sys.argv[1] if len(sys.argv) > 1 else "images"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "catalog_output.csv"

    print(f"Loading model: {MODEL_ID}")
    model, processor = load(MODEL_ID)

    extensions = {".jpg", ".jpeg", ".png", ".webp"}
    images = sorted([
        f for f in os.listdir(image_dir)
        if os.path.splitext(f)[1].lower() in extensions
    ])
    print(f"Found {len(images)} images in {image_dir}/")

    results = []
    for i, filename in enumerate(images, 1):
        path = os.path.join(image_dir, filename)
        print(f"[{i}/{len(images)}] {filename}...")

        desc = process_image(model, processor, path, DESCRIBE_PROMPT)
        defect = process_image(model, processor, path, DEFECT_PROMPT)

        row = {
            "file": filename,
            "title": desc.get("title", ""),
            "category": desc.get("category", ""),
            "subcategory": desc.get("subcategory", ""),
            "color": desc.get("color", ""),
            "features": "; ".join(desc.get("features", [])),
            "quality": defect.get("quality", ""),
            "quality_score": defect.get("score", ""),
            "issues": "; ".join(defect.get("issues", [])),
        }
        results.append(row)
        print(f"  → {row['title']} | Quality: {row['quality']} ({row['quality_score']}/10)")

    df = pd.DataFrame(results)
    df.to_csv(output_file, index=False)
    print(f"\nDone! Results saved to {output_file}")
    print(f"  Pass: {len(df[df['quality'] == 'pass'])} | Fail: {len(df[df['quality'] == 'fail'])}")

if __name__ == "__main__":
    main()
```

## Step 4 — Run It

```bash
# Process all images in the images/ folder
python3 process_products.py images/ catalog_output.csv

# Output:
# [1/500] product_001.jpg...
#   → Blue Wireless Headphones | Quality: pass (9/10)
# [2/500] product_002.jpg...
#   → Red Cotton T-Shirt | Quality: fail (4/10)
# ...
# Done! Results saved to catalog_output.csv
#   Pass: 467 | Fail: 33
```

Processing speed on M3 Max: ~5-8 seconds per image per task, so 500 images × 2 tasks ≈ 1.5-2 hours.

## Step 5 — Automate Weekly Runs

Add to crontab or create a shell wrapper:
```bash
#!/bin/bash
# weekly_process.sh
source ~/.venvs/product-vision/bin/activate
DATE=$(date +%Y-%m-%d)
python3 process_products.py \
  ~/Dropbox/client-photos/incoming/ \
  ~/Dropbox/client-photos/catalogs/catalog_${DATE}.csv

echo "Catalog ready: catalog_${DATE}.csv" | mail -s "Weekly catalog" elena@studio.com
```

## Results

| Metric | Cloud API (GPT-4V) | Local (mlx-vlm) |
|--------|-------------------|-----------------|
| Monthly cost | ~$200 | $0 |
| Per-image speed | ~1-2s | ~5-8s |
| Privacy | Images sent to cloud | Fully offline |
| Offline capable | No | Yes |
| Quality | Excellent | Very good |
| Total weekly time | ~15 min | ~2 hours |

**Trade-off:** 3-4x slower, but free and private. Elena runs the batch overnight — speed doesn't matter for non-realtime workflows. Annual savings: **$2,400**.

## Troubleshooting

- **Out of memory:** Close other apps. 12B 4-bit needs ~8GB. Use a 7B model if RAM is tight.
- **Slow first run:** Model compilation takes 1-2 min on first inference. Subsequent images are faster.
- **Bad JSON output:** Lower temperature to 0.0 or add "Return ONLY valid JSON" to prompts.
- **Model not found:** Check `mlx-community` on HuggingFace for latest quantized model names.
