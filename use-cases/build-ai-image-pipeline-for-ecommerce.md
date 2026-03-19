---
title: "Build an AI Image Pipeline for E-Commerce"
description: "Automate product photography: remove backgrounds, generate lifestyle shots with FLUX, auto-write SEO alt text, optimize for web — batch 1000 images overnight."
skills: [fal-ai, flux-model, anthropic-sdk]
difficulty: intermediate
time_estimate: "8 hours"
tags: [images, ecommerce, ai-images, flux, background-removal, seo, webp, batch-processing]
---

# Build an AI Image Pipeline for E-Commerce

Professional product photography costs $5–15 per image. At 1000 SKUs, that's $5–15k per shoot — plus reshoots when products change. AI pipelines cut that to cents per image and run overnight while you sleep.

## Persona

**Sofia** runs a DTC home goods brand with 800 SKUs. Her photography bill hit $8k last month. She needs lifestyle shots for each product on 5 different backgrounds, WebP-optimized, with SEO alt text auto-written.

---

## Pipeline Overview

```
Raw product photo (white bg)
  ↓ remove.bg / Rembg
  ↓ fal.ai FLUX inpainting (lifestyle bg)
  ↓ Claude Vision → alt text
  ↓ Sharp → WebP + AVIF
  ↓ S3 upload
```

---

## Step 1: Background Removal

```typescript
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

async function removeBackground(imagePath: string): Promise<Buffer> {
  const formData = new FormData();
  formData.append('image_file', fs.createReadStream(imagePath));
  formData.append('size', 'auto');

  const response = await axios.post('https://api.remove.bg/v1.0/removebg', formData, {
    headers: {
      'X-Api-Key': process.env.REMOVE_BG_API_KEY!,
      ...formData.getHeaders(),
    },
    responseType: 'arraybuffer',
  });

  return Buffer.from(response.data);
}
```

For local/free processing, use Python Rembg in a sidecar:

```bash
pip install rembg[gpu]
rembg i input.jpg output.png
# Or batch:
rembg p input_folder/ output_folder/
```

---

## Step 2: Generate Lifestyle Product Shots with fal.ai FLUX

```typescript
import * as fal from '@fal-ai/serverless-client';

fal.config({ credentials: process.env.FAL_KEY });

const LIFESTYLE_BACKGROUNDS = [
  'minimalist Scandinavian living room, natural light, white walls',
  'cozy kitchen countertop, morning sunlight, plants in background',
  'modern office desk setup, bokeh background, warm lighting',
  'outdoor patio table, golden hour light, greenery',
  'luxury hotel room, soft shadows, beige tones',
];

async function generateLifestyleShot(
  productImageBase64: string,
  background: string,
  productName: string
): Promise<string> {
  const result = await fal.run('fal-ai/flux/dev/image-to-image', {
    input: {
      image_url: `data:image/png;base64,${productImageBase64}`,
      prompt: `Product photography: ${productName} placed on ${background}. 
               Professional lighting, sharp product focus, photorealistic, 8K`,
      negative_prompt: 'blurry, distorted product, ugly, watermark',
      strength: 0.65,
      num_inference_steps: 28,
      guidance_scale: 3.5,
    },
  }) as { images: Array<{ url: string }> };

  return result.images[0].url;
}

// Generate all 5 backgrounds for a product
async function generateProductShots(
  productImagePath: string,
  productName: string
): Promise<string[]> {
  const noBgBuffer = await removeBackground(productImagePath);
  const base64 = noBgBuffer.toString('base64');

  // Run in parallel — fal.ai handles rate limits gracefully
  return Promise.all(
    LIFESTYLE_BACKGROUNDS.map(bg =>
      generateLifestyleShot(base64, bg, productName)
    )
  );
}
```

---

## Step 3: Auto-Generate SEO Alt Text with Claude Vision

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

async function generateAltText(
  imageUrl: string,
  productName: string,
  category: string
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'url', url: imageUrl },
        },
        {
          type: 'text',
          text: `Write SEO-optimized alt text for this product image.
Product: ${productName}
Category: ${category}

Requirements:
- Under 125 characters
- Include product name naturally
- Describe the setting/context shown
- No "image of" prefix
- Include relevant keywords

Return only the alt text, nothing else.`,
        },
      ],
    }],
  });

  return message.content[0].type === 'text'
    ? message.content[0].text.trim()
    : `${productName} product photo`;
}
```

---

## Step 4: Resize and Optimize for Web

```typescript
import sharp from 'sharp';
import fetch from 'node-fetch';

const WEB_SIZES = [
  { width: 400, suffix: 'sm' },
  { width: 800, suffix: 'md' },
  { width: 1600, suffix: 'lg' },
];

async function optimizeForWeb(
  imageUrl: string,
  outputDir: string,
  filename: string
) {
  const response = await fetch(imageUrl);
  const buffer = Buffer.from(await response.arrayBuffer());

  const results: Record<string, { webp: string; avif: string }> = {};

  await Promise.all(
    WEB_SIZES.map(async ({ width, suffix }) => {
      const resized = sharp(buffer).resize(width, null, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      const [webpPath, avifPath] = [
        `${outputDir}/${filename}-${suffix}.webp`,
        `${outputDir}/${filename}-${suffix}.avif`,
      ];

      await Promise.all([
        resized.clone().webp({ quality: 82 }).toFile(webpPath),
        resized.clone().avif({ quality: 65 }).toFile(avifPath),
      ]);

      results[suffix] = { webp: webpPath, avif: avifPath };
    })
  );

  return results;
}
```

---

## Step 5: Batch Pipeline — 1000 Images Overnight

```typescript
import pLimit from 'p-limit';
import { uploadToS3 } from './s3';

const limit = pLimit(5); // 5 concurrent to respect API limits

async function batchProcess(products: Array<{
  id: string;
  name: string;
  category: string;
  imagePath: string;
}>) {
  const results = [];

  for (const product of products) {
    const task = limit(async () => {
      console.log(`Processing: ${product.name}`);

      // Generate all lifestyle shots
      const shotUrls = await generateProductShots(product.imagePath, product.name);

      // Generate alt text + optimize each shot
      const processedShots = await Promise.all(
        shotUrls.map(async (url, i) => {
          const [altText, optimized] = await Promise.all([
            generateAltText(url, product.name, product.category),
            optimizeForWeb(url, '/tmp/output', `${product.id}-bg${i}`),
          ]);

          // Upload to S3
          const s3Urls = await uploadToS3(optimized, `products/${product.id}/bg${i}`);
          return { altText, urls: s3Urls, background: LIFESTYLE_BACKGROUNDS[i] };
        })
      );

      return { productId: product.id, shots: processedShots };
    });

    results.push(task);
  }

  return Promise.all(results);
}
```

---

## Cost Breakdown (1000 products × 5 backgrounds)

| Step | Cost |
|------|------|
| remove.bg (1000 calls) | ~$25 |
| fal.ai FLUX (5000 images) | ~$50 |
| Claude Vision alt text (5000 calls) | ~$15 |
| Storage + bandwidth | ~$5 |
| **Total** | **~$95** |

**vs. traditional photography: $5,000–15,000**

---

## Results

Sofia ran her first batch of 200 SKUs overnight. Morning: 1000 lifestyle images, WebP-optimized, alt texts written, uploaded to Shopify. Her photography bill dropped 96%.

> "I used to spend 3 weeks coordinating photo shoots. Now I push a CSV and wake up to done." — Sofia
